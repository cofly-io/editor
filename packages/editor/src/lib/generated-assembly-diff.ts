/**
 * Assembly diff and override orphan tracking.
 *
 * Stage 2 of the Generator DSL plan, work item 3:
 *   Define `AssemblyDiff` and `OverrideOrphan`: compute kept/added/removed
 *   by partId and produce auditable results.
 *
 * Re-runs of the DSL with edited source or params produce a new
 * AssemblyIR. We diff it against the previous IR by partId — never by
 * array index, never by mesh similarity — and decide which user
 * overrides carry over automatically and which become orphans.
 *
 * Only same-partId overrides are auto-reapplied. Removed partIds that
 * carry user edits become OverrideOrphan records and are surfaced to
 * the UI; they are NEVER silently dropped.
 */

import type { AssemblyIR, AssemblyPart } from '@pascal-app/core/lib/generated-assembly-ir'

// ---------------------------------------------------------------------------
// Override (the user-editable side-channel on top of generated IR)
// ---------------------------------------------------------------------------

/**
 * A user-initiated, per-part modification that survives re-generation.
 * Deliberately narrow: only fields a human would reasonably tweak.
 */
export type PartOverride = {
  partId: string
  transform?: {
    position?: [number, number, number]
    rotation?: [number, number, number, number]
    scale?: [number, number, number]
  }
  material?: {
    preset?: string
    color?: [number, number, number]
    roughness?: number
    metalness?: number
    opacity?: number
  }
  visibility?: boolean
  /** Free-form note for audit purposes. */
  note?: string
}

/**
 * An override whose partId no longer exists in the latest IR.
 * Surfaced to the user; never auto-applied, never auto-deleted.
 */
export type OverrideOrphan = {
  partId: string
  override: PartOverride
  /** When the orphan was detected (ISO 8601). */
  detectedAt: string
  /**
   * Why the part is missing. Today only 'part_removed' is possible; the
   * enum makes room for future causes like 'part_renamed_suspected'.
   */
  reason: 'part_removed'
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type AssemblyDiff = {
  /**
   * Parts present in both IRs with the same id. Each entry carries the
   * previous fingerprint and the next fingerprint; equal fingerprints
   * mean the part is unchanged, different fingerprints mean it was
   * regenerated (overrides still reapply).
   */
  kept: Array<{
    partId: string
    previousFingerprint: string
    nextFingerprint: string
    fingerprintChanged: boolean
  }>
  /** Parts in `next` but not in `previous`. */
  added: AssemblyPart[]
  /** Parts in `previous` but not in `next`. */
  removed: AssemblyPart[]
}

export function diffAssemblyIR(previous: AssemblyIR, next: AssemblyIR): AssemblyDiff {
  const prevById = new Map(previous.parts.map((p) => [p.id, p]))
  const nextById = new Map(next.parts.map((p) => [p.id, p]))

  const kept: AssemblyDiff['kept'] = []
  const added: AssemblyPart[] = []
  const removed: AssemblyPart[] = []

  for (const nextPart of next.parts) {
    const prevPart = prevById.get(nextPart.id)
    if (prevPart) {
      kept.push({
        partId: nextPart.id,
        previousFingerprint: prevPart.fingerprint,
        nextFingerprint: nextPart.fingerprint,
        fingerprintChanged: prevPart.fingerprint !== nextPart.fingerprint,
      })
    } else {
      added.push(nextPart)
    }
  }
  for (const prevPart of previous.parts) {
    if (!nextById.has(prevPart.id)) removed.push(prevPart)
  }
  return { kept, added, removed }
}

// ---------------------------------------------------------------------------
// Override reconciliation
// ---------------------------------------------------------------------------

export type OverrideReconciliation = {
  /**
   * Overrides that still apply (same partId in `next`). Order matches
   * the input overrides array.
   */
  reapplied: PartOverride[]
  /**
   * Overrides whose partId is gone from `next`. Caller is responsible
   * for surfacing these to the user.
   */
  orphans: OverrideOrphan[]
}

/**
 * Partition overrides into (a) those that auto-reapply onto the next IR
 * and (b) those that become orphans. Pure function; does not modify IR.
 */
export function reconcileOverrides(
  overrides: readonly PartOverride[],
  next: AssemblyIR,
  detectedAt: string = new Date().toISOString(),
): OverrideReconciliation {
  const nextIds = new Set(next.parts.map((p) => p.id))
  const reapplied: PartOverride[] = []
  const orphans: OverrideOrphan[] = []
  for (const o of overrides) {
    if (nextIds.has(o.partId)) {
      reapplied.push(o)
    } else {
      orphans.push({ partId: o.partId, override: o, detectedAt, reason: 'part_removed' })
    }
  }
  return { reapplied, orphans }
}

/**
 * Convenience: diff + reconcile in one call. Useful at the executor /
 * sandbox boundary where both happen together.
 */
export function diffAndReconcile(
  previous: AssemblyIR,
  next: AssemblyIR,
  overrides: readonly PartOverride[],
  detectedAt?: string,
): { diff: AssemblyDiff; reconciliation: OverrideReconciliation } {
  return {
    diff: diffAssemblyIR(previous, next),
    reconciliation: reconcileOverrides(overrides, next, detectedAt),
  }
}
