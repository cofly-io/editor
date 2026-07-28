/**
 * Generator-DSL run orchestrator — stage 6, work items 3/5.
 *
 * Drives one generator_dsl run end to end:
 *   sandbox compile → IR validation (inside sandbox) → spatial quality
 *   gate → placement patches. Scene patches are produced only when
 *   compiler + sandbox + IR + quality gate all pass; a failed run
 *   produces zero patches, so the scene node count is unchanged.
 *
 * The LLM revision loop (feeding structured diagnostics back to the
 * model for a corrected source) lives in the runner; this module runs
 * one compile attempt and reports everything needed for that loop:
 * per-layer diagnostics, budget usage, patch plan on success, and an
 * explicit downgrade record when the run cannot succeed.
 *
 * Scene mutation stays with the caller — this module is pure
 * orchestration, fully testable with an injected sandbox runner.
 */

import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import type { DSLDiagnostic } from '@pascal-app/core/lib/generated-geometry-dsl-contract'
import type { PartOverride } from '../../../../packages/editor/src/lib/generated-assembly-diff'
import {
  buildGeneratedAssemblyCreatePatches,
  type GeneratedAssemblyPatchPlan,
} from '../../../../packages/editor/src/lib/generated-geometry-placement'
import { type RealismGateReview, reviewAssemblyRealism } from './generated-assembly-realism-gate'
import { reviewAssemblySpatial, type SpatialGateReview } from './generated-assembly-spatial-gate'
import { type RunSandboxOptions, runDslSandbox } from './generated-geometry-sandbox-runner'
import type { GenerationRouteDecision } from './generation-route'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DslRunAttempt = {
  attempt: number
  /** Wall-clock milliseconds consumed by the sandbox worker(s). */
  sandboxMs: number
  /** Compile/validation diagnostics from the sandbox (empty on success). */
  diagnostics: DSLDiagnostic[]
  /** Present when the attempt produced a valid IR. */
  irHash?: string
  /** Spatial gate result (only computed when IR is valid). */
  spatial?: SpatialGateReview
  /** Industrial realism gate result (only applicable for recognized equipment families). */
  realism?: RealismGateReview
}

export type DslRunBudgetUsage = {
  sandboxAttempts: number
  totalSandboxMs: number
  partCount: number
  wallTimeBudgetMs: number
}

export type DslDowngradeRecord = {
  /** Why the DSL run could not produce an artifact. */
  reason:
    | 'compile_diagnostics'
    | 'sandbox_error'
    | 'spatial_gate_failed'
    | 'realism_gate_failed'
    | 'budget_exceeded'
  /** Human-readable summary (localized by the caller). */
  message: string
  /** Attempts made before downgrading. */
  attempts: number
  /** Diagnostic codes seen across attempts, for the user-facing report. */
  diagnosticCodes: string[]
  /** The route decision that sent us here (flag state included). */
  route: GenerationRouteDecision
}

export type DslRunResult =
  | {
      kind: 'ok'
      ir: AssemblyIR
      irHash: string
      patches: GeneratedAssemblyPatchPlan['patches']
      rootNode: GeneratedAssemblyPatchPlan['rootNode']
      nodeIdByPartId: Map<string, string>
      spatial: SpatialGateReview
      realism: RealismGateReview
      attempts: DslRunAttempt[]
      budgetUsage: DslRunBudgetUsage
    }
  | {
      kind: 'failed'
      downgrade: DslDowngradeRecord
      attempts: DslRunAttempt[]
      budgetUsage: DslRunBudgetUsage
    }

export type ExecuteDslRunInput = {
  /** DSL source text (author truth). */
  source: string
  /** Resolved params. */
  params?: Record<string, unknown>
  /** DSL API version to compile against. */
  apiVersion: string
  /** The route decision that selected generator_dsl. */
  route: GenerationRouteDecision
  /** Placement options for the patch build. */
  placement?: {
    origin?: [number, number, number]
    name?: string
    parentId?: string | null
    overrides?: readonly PartOverride[]
  }
  /** Base scene revision for compare-and-swap commit (carried through). */
  baseAssemblyRevision?: number
  /** Sandbox budget overrides. */
  sandboxBudget?: RunSandboxOptions['budget']
  /** Injectable sandbox runner for tests. */
  runSandboxImpl?: typeof runDslSandbox
  /** Injectable clock for tests. */
  now?: () => number
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Execute one generator_dsl compile attempt through the full pipeline.
 * The sandbox runner itself retries crashes/timeouts internally; this
 * function makes exactly one logical attempt per call. The LLM-level
 * revision loop (new source per attempt) belongs to the caller.
 */
export async function executeGeneratorDslRun(input: ExecuteDslRunInput): Promise<DslRunResult> {
  const runSandbox = input.runSandboxImpl ?? runDslSandbox
  const now = input.now ?? (() => Date.now())
  const wallTimeBudget = input.sandboxBudget?.wallTimeMs ?? 5000

  const startedAt = now()
  const sandboxResult = await runSandbox({
    source: input.source,
    apiVersion: input.apiVersion,
    ...(input.params !== undefined ? { params: input.params } : {}),
    baseAssemblyRevision: input.baseAssemblyRevision ?? 0,
    ...(input.sandboxBudget !== undefined ? { budget: input.sandboxBudget } : {}),
  })
  const sandboxMs = now() - startedAt

  const attemptBase: Omit<DslRunAttempt, 'diagnostics'> = {
    attempt: 1,
    sandboxMs,
  }
  const budgetBase = {
    sandboxAttempts: sandboxResult.attempts,
    totalSandboxMs: sandboxMs,
    wallTimeBudgetMs: wallTimeBudget,
  }

  // --- Layer 1/2: sandbox + compile diagnostics -----------------------------
  if (sandboxResult.kind === 'diagnostics') {
    const diagnostics = sandboxResult.diagnostics
    return fail({
      reason: 'compile_diagnostics',
      message: `DSL compile produced ${diagnostics.filter((d) => d.severity === 'error').length} errors.`,
      attempts: [{ ...attemptBase, diagnostics }],
      budgetBase,
      partCount: 0,
      route: input.route,
    })
  }
  if (sandboxResult.kind === 'error') {
    return fail({
      reason: sandboxResult.error.kind === 'timeout' ? 'budget_exceeded' : 'sandbox_error',
      message: `Sandbox ${sandboxResult.error.kind}: ${sandboxResult.error.message}`,
      attempts: [
        {
          ...attemptBase,
          diagnostics: [
            {
              code: `sandbox_${sandboxResult.error.kind}`,
              severity: 'error',
              message: sandboxResult.error.message,
              retryable: sandboxResult.error.kind !== 'timeout',
            },
          ],
        },
      ],
      budgetBase,
      partCount: 0,
      route: input.route,
    })
  }

  // --- Layer 3: IR is valid (sandbox validated it); run quality gates --------
  const ir = sandboxResult.ir
  const spatial = reviewAssemblySpatial(ir)
  const realism = reviewAssemblyRealism(ir, { source: input.source })
  const attempt: DslRunAttempt = {
    ...attemptBase,
    diagnostics: [...sandboxResult.diagnostics],
    irHash: sandboxResult.irHash,
    spatial,
    realism,
  }

  if (!spatial.passed) {
    return fail({
      reason: 'spatial_gate_failed',
      message: `Spatial quality gate rejected the assembly: ${spatial.issues[0] ?? 'unknown'}`,
      attempts: [attempt],
      budgetBase,
      partCount: ir.parts.length,
      route: input.route,
      extraCodes: spatial.issues.map((i) => i.split(':')[0] ?? 'gate'),
    })
  }

  if (!realism.passed) {
    return fail({
      reason: 'realism_gate_failed',
      message: `Industrial realism gate rejected the assembly: ${realism.issues[0] ?? 'unknown'}`,
      attempts: [attempt],
      budgetBase,
      partCount: ir.parts.length,
      route: input.route,
      extraCodes: realism.issues.map((i) => i.split(':')[0] ?? 'realism'),
    })
  }

  // --- Layer 4: all gates passed → build scene patches ----------------------
  const plan = buildGeneratedAssemblyCreatePatches(ir, {
    ...(input.placement?.origin !== undefined ? { origin: input.placement.origin } : {}),
    ...(input.placement?.name !== undefined ? { name: input.placement.name } : {}),
    ...(input.placement?.parentId !== undefined ? { parentId: input.placement.parentId } : {}),
    ...(input.placement?.overrides !== undefined ? { overrides: input.placement.overrides } : {}),
    generator: {
      sourceHash: ir.generator.sourceHash,
      apiVersion: ir.generator.apiVersion,
      paramsHash: ir.generator.paramsHash,
      irHash: sandboxResult.irHash,
      source: input.source,
      params: input.params ?? {},
    },
  })

  return {
    kind: 'ok',
    ir,
    irHash: sandboxResult.irHash,
    patches: plan.patches,
    rootNode: plan.rootNode,
    nodeIdByPartId: plan.nodeIdByPartId,
    spatial,
    realism,
    attempts: [attempt],
    budgetUsage: { ...budgetBase, partCount: ir.parts.length },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(args: {
  reason: DslDowngradeRecord['reason']
  message: string
  attempts: DslRunAttempt[]
  budgetBase: { sandboxAttempts: number; totalSandboxMs: number; wallTimeBudgetMs: number }
  partCount: number
  route: GenerationRouteDecision
  extraCodes?: string[]
}): DslRunResult {
  const diagnosticCodes = [
    ...new Set([
      ...args.attempts.flatMap((a) => a.diagnostics.map((d) => d.code)),
      ...(args.extraCodes ?? []),
    ]),
  ].sort()
  return {
    kind: 'failed',
    downgrade: {
      reason: args.reason,
      message: args.message,
      attempts: args.attempts.length,
      diagnosticCodes,
      route: args.route,
    },
    attempts: args.attempts,
    budgetUsage: { ...args.budgetBase, partCount: args.partCount },
  }
}

/**
 * Serialize a DslRunResult's event payload for run events
 * (stage: 'generator-dsl'). Keeps run-store payloads small and stable.
 */
export function summarizeDslRunForEvents(result: DslRunResult): Record<string, unknown> {
  const base = {
    budgetUsage: result.budgetUsage,
    attempts: result.attempts.map((a) => ({
      attempt: a.attempt,
      sandboxMs: a.sandboxMs,
      diagnosticCodes: a.diagnostics.map((d) => d.code),
      diagnostics: a.diagnostics.slice(0, 8).map((d) => ({
        code: d.code,
        severity: d.severity,
        message: d.message,
        span: d.span,
        hint: d.hint,
      })),
      irHash: a.irHash,
      spatialScore: a.spatial?.score,
      realismScore: a.realism?.score,
      realismFamily: a.realism?.family,
    })),
  }
  if (result.kind === 'ok') {
    return {
      ...base,
      outcome: 'ok',
      irHash: result.irHash,
      partCount: result.ir.parts.length,
      spatialScore: result.spatial.score,
      spatialWarnings: result.spatial.warnings,
      realismScore: result.realism.score,
      realismFamily: result.realism.family,
      realismWarnings: result.realism.warnings,
    }
  }
  return {
    ...base,
    outcome: 'failed',
    downgrade: {
      reason: result.downgrade.reason,
      message: result.downgrade.message,
      attempts: result.downgrade.attempts,
      diagnosticCodes: result.downgrade.diagnosticCodes,
    },
  }
}
