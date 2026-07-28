/**
 * Revision routing — stage 6, Appendix A.2.
 *
 * Classifies a revision request against an existing generated assembly
 * into one of three paths:
 *
 *  (a) param-level   — a change to the DSL params block (e.g. "键盘多
 *      一列", "键帽大一点") → rerun the generator with updated params.
 *  (b) part-level    — an attribute tweak on existing parts (color /
 *      material / single-part move, e.g. "盖子改红色") → write a partId
 *      override directly; NO sandbox rerun.
 *  (c) structural    — add/remove parts (e.g. "去掉小键盘") → rerun +
 *      IR diff; removed partIds surface override orphans.
 *
 * The classifier works on the structured intent the harness already
 * extracts (target param / target parts / attribute) rather than raw
 * natural language — NLU stays in the LLM layer, this module makes the
 * deterministic routing decision and plans the effect. Ambiguity is
 * surfaced explicitly as candidates, never silently patched.
 */

import type { DSLParamDecl } from '@pascal-app/core/lib/generated-geometry-dsl-contract'
import type { PartOverride } from '../../../../packages/editor/src/lib/generated-assembly-diff'

// ---------------------------------------------------------------------------
// Intent (input) — what the LLM layer extracted from the user's request
// ---------------------------------------------------------------------------

export type RevisionIntent =
  | {
      kind: 'param_change'
      /** Target param name from the params block. */
      param: string
      /** New value (must satisfy the decl's range). */
      value: number | string | boolean
    }
  | {
      kind: 'part_attribute'
      /** Part selector: exact partId or glob (e.g. 'keyboard.key.*'). */
      target: string
      attribute: 'material' | 'color' | 'position' | 'visibility'
      value: unknown
    }
  | {
      kind: 'structure_change'
      /** 'add' is always structural; 'remove' by part selector. */
      operation: 'add' | 'remove'
      target?: string
      description?: string
    }

// ---------------------------------------------------------------------------
// Route (output)
// ---------------------------------------------------------------------------

export type RevisionRoute =
  | {
      kind: 'param_rerun'
      param: string
      value: number | string | boolean
      /** Part ids matching the param's `affects` glob — what will change. */
      affectedPartIds: string[]
      /** Other params whose affects-globs overlap the same parts. */
      overlappingParams: string[]
    }
  | {
      kind: 'override_write'
      /** Overrides to append/merge onto the assembly node. */
      overrides: PartOverride[]
      /** Part ids matched by the selector. */
      matchedPartIds: string[]
    }
  | {
      kind: 'structural_rerun'
      operation: 'add' | 'remove'
      /** For remove: overrides on removed parts will become orphans. */
      orphanedPartIds: string[]
    }
  | {
      kind: 'ambiguous'
      /** Why we can't decide; candidates are presented to the user. */
      reason: string
      candidates: Array<{ label: string; route: Exclude<RevisionRoute, { kind: 'ambiguous' }>['kind'] }>
    }
  | {
      kind: 'unresolvable'
      reason: string
    }

// ---------------------------------------------------------------------------
// Context the router needs about the current assembly
// ---------------------------------------------------------------------------

export type RevisionContext = {
  /** Param declarations from the DSL params block. */
  paramsDecls: Record<string, DSLParamDecl>
  /** Part ids in the current IR. */
  partIds: readonly string[]
  /** Current overrides (to detect orphans on structural removal). */
  currentOverrides?: readonly PartOverride[]
}

// ---------------------------------------------------------------------------
// Glob matching (same semantics as the params `affects` field)
// ---------------------------------------------------------------------------

export function matchesGlob(pattern: string, partId: string): boolean {
  if (pattern === partId) return true
  if (!pattern.includes('*')) return false
  const re = new RegExp(
    `^${pattern.split('*').map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`,
  )
  return re.test(partId)
}

function affectedParts(decl: DSLParamDecl, partIds: readonly string[]): string[] {
  const affects = decl.affects
  if (!affects) return []
  return partIds.filter((id) => matchesGlob(affects, id))
}

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

export function routeRevision(intent: RevisionIntent, ctx: RevisionContext): RevisionRoute {
  switch (intent.kind) {
    case 'param_change':
      return routeParamChange(intent, ctx)
    case 'part_attribute':
      return routePartAttribute(intent, ctx)
    case 'structure_change':
      return routeStructureChange(intent, ctx)
  }
}

function routeParamChange(
  intent: Extract<RevisionIntent, { kind: 'param_change' }>,
  ctx: RevisionContext,
): RevisionRoute {
  const decl = ctx.paramsDecls[intent.param]
  if (!decl) {
    // Unknown param — maybe the user means a part-level tweak or a
    // structural change. Surface candidates, don't guess.
    const near = Object.keys(ctx.paramsDecls).filter((name) =>
      name.toLowerCase().includes(intent.param.toLowerCase()),
    )
    if (near.length > 0) {
      return {
        kind: 'ambiguous',
        reason: `param "${intent.param}" is not declared; similar params exist.`,
        candidates: near.map((name) => ({ label: `param "${name}"`, route: 'param_rerun' as const })),
      }
    }
    return {
      kind: 'unresolvable',
      reason: `param "${intent.param}" is not declared in the params block.`,
    }
  }

  // Range validation (numeric decls only).
  if (typeof intent.value === 'number' && decl.range) {
    const [lo, hi] = decl.range
    if (intent.value < lo || intent.value > hi) {
      return {
        kind: 'unresolvable',
        reason: `value ${intent.value} for param "${intent.param}" is outside range [${lo}, ${hi}].`,
      }
    }
  }

  const affected = affectedParts(decl, ctx.partIds)
  // Impact analysis: other params whose affects overlap the same parts.
  const overlapping = Object.entries(ctx.paramsDecls)
    .filter(([name, d]) => name !== intent.param && d.affects)
    .filter(([, d]) => affectedParts(d, ctx.partIds).some((id) => affected.includes(id)))
    .map(([name]) => name)

  return {
    kind: 'param_rerun',
    param: intent.param,
    value: intent.value,
    affectedPartIds: affected,
    overlappingParams: overlapping,
  }
}

function routePartAttribute(
  intent: Extract<RevisionIntent, { kind: 'part_attribute' }>,
  ctx: RevisionContext,
): RevisionRoute {
  const matched = ctx.partIds.filter((id) => matchesGlob(intent.target, id))
  if (matched.length === 0) {
    return {
      kind: 'unresolvable',
      reason: `no parts match "${intent.target}".`,
    }
  }

  // A param whose affects-glob covers ALL matched parts is a plausible
  // param-level revision instead — surface as a candidate when the
  // attribute maps to a param-like concept (position is never param-like).
  if (intent.attribute !== 'position') {
    const covering = Object.entries(ctx.paramsDecls).filter(
      ([, d]) => d.affects && matched.every((id) => matchesGlob(d.affects!, id)),
    )
    const structural = covering.filter(([, d]) => {
      const role = (d.semanticRole ?? '').toLowerCase()
      return (
        (intent.attribute === 'material' || intent.attribute === 'color'
          ? role.includes('material') || role.includes('color')
          : false) ||
        (intent.attribute === 'visibility' ? role.includes('visibility') : false)
      )
    })
    if (structural.length > 0) {
      return {
        kind: 'ambiguous',
        reason: `"${intent.target}" is fully covered by param affects; this could be a param-level revision.`,
        candidates: [
          { label: `direct override on ${matched.length} part(s)`, route: 'override_write' },
          ...structural.map(([name]) => ({
            label: `param "${name}" rerun`,
            route: 'param_rerun' as const,
          })),
        ],
      }
    }
  }

  const overrides: PartOverride[] = matched.map((partId) => {
    switch (intent.attribute) {
      case 'material':
        return { partId, material: { preset: String(intent.value) } }
      case 'color':
        return { partId, material: { color: intent.value as [number, number, number] } }
      case 'position':
        return { partId, transform: { position: intent.value as [number, number, number] } }
      case 'visibility':
        return { partId, visibility: Boolean(intent.value) }
    }
  })
  return { kind: 'override_write', overrides, matchedPartIds: matched }
}

function routeStructureChange(
  intent: Extract<RevisionIntent, { kind: 'structure_change' }>,
  ctx: RevisionContext,
): RevisionRoute {
  if (intent.operation === 'add') {
    return { kind: 'structural_rerun', operation: 'add', orphanedPartIds: [] }
  }
  const matched = intent.target
    ? ctx.partIds.filter((id) => matchesGlob(intent.target!, id))
    : []
  if (intent.target && matched.length === 0) {
    return { kind: 'unresolvable', reason: `no parts match "${intent.target}".` }
  }
  // Overrides on removed parts become orphans — surface them up front.
  const overridePartIds = new Set((ctx.currentOverrides ?? []).map((o) => o.partId))
  const orphanedPartIds = matched.filter((id) => overridePartIds.has(id))
  return { kind: 'structural_rerun', operation: 'remove', orphanedPartIds }
}
