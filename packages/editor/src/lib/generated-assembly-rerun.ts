/**
 * Generated assembly rerun — reconcile a fresh IR against live scene nodes.
 *
 * Stage 5 of the Generator DSL plan, work item 3:
 *   On re-run, diff the new IR against the existing GeneratedAssemblyNode,
 *   reapply same-partId overrides, surface removed-partId overrides as
 *   orphans, and update/create/delete scene nodes in place — preserving
 *   node ids for parts that still exist so selection and external
 *   references survive.
 *
 * All pure planning happens in `planGeneratedAssemblyRerun`; the caller
 * applies the returned ops via useScene. This keeps the module testable
 * without a store.
 */

import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import type {
  AnyNode,
  AnyNodeId,
  GeneratedAssemblyNode,
  GeneratedMeshNode,
} from '@pascal-app/core/schema'
import {
  diffAssemblyIR,
  type OverrideOrphan,
  type PartOverride,
  reconcileOverrides,
} from './generated-assembly-diff'
import {
  buildGeneratedAssemblyNodes,
  type GeneratedAssemblyPlacementOptions,
} from './generated-geometry-placement'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeneratedAssemblyRerunPlan = {
  /** Nodes to update in place (root + kept parts). */
  updates: Array<{ id: AnyNodeId; data: Partial<AnyNode> }>
  /** Nodes to create (added parts), with parent linkage. */
  creates: Array<{ node: AnyNode; parentId?: AnyNodeId }>
  /** Node ids to delete (removed parts). */
  deletes: AnyNodeId[]
  /** kept / added / removed by partId, for auditing and UI surfacing. */
  diff: ReturnType<typeof diffAssemblyIR>
  /** Overrides that still apply after the rerun. */
  reappliedOverrides: PartOverride[]
  /** Overrides whose partId vanished; caller must surface these. */
  orphans: OverrideOrphan[]
  /** The root node's updated overrides/orphans fields (already reflected in `updates`). */
  nextOverrides: PartOverride[]
  nextOrphans: OverrideOrphan[]
}

export type GeneratedAssemblyCommitStore = {
  getState(): {
    nodes: Record<AnyNodeId, AnyNode>
    applyNodeChanges(changes: {
      create?: Array<{ node: AnyNode; parentId?: AnyNodeId }>
      update?: Array<{ id: AnyNodeId; data: Partial<AnyNode> }>
      delete?: AnyNodeId[]
    }): void
  }
}

export type GeneratedAssemblyCommitResult =
  | { kind: 'committed'; revision: number }
  | { kind: 'conflict'; expectedRevision: number; actualRevision: number }
  | { kind: 'missing' }

/**
 * Apply a rerun plan only when the root still has the observed revision.
 * `applyNodeChanges` commits all node mutations in one Zustand transaction.
 */
export function commitGeneratedAssemblyRerun(
  store: GeneratedAssemblyCommitStore,
  rootId: AnyNodeId,
  expectedRevision: number,
  plan: GeneratedAssemblyRerunPlan,
): GeneratedAssemblyCommitResult {
  const current = store.getState().nodes[rootId]
  if (!current || current.type !== 'generated-assembly') return { kind: 'missing' }
  const actualRevision = current.revision ?? 0
  if (actualRevision !== expectedRevision) {
    return { kind: 'conflict', expectedRevision, actualRevision }
  }
  const revision = expectedRevision + 1
  const updates = plan.updates.map((update) =>
    update.id === rootId
      ? { ...update, data: { ...update.data, revision } as Partial<AnyNode> }
      : update,
  )
  store.getState().applyNodeChanges({
    update: updates,
    create: plan.creates,
    delete: plan.deletes,
  })
  return { kind: 'committed', revision }
}

/**
 * Plan a rerun. Pure — does not touch the scene store.
 *
 * @param existingRoot   The GeneratedAssemblyNode currently in the scene.
 * @param existingParts  The GeneratedMeshNode children currently in the scene.
 * @param nextIr         The freshly compiled + validated IR.
 * @param options        Placement options (origin/name/generator) — the
 *                       generator provenance from the new compile run.
 * @param detectedAt     ISO timestamp stamped onto new orphans.
 */
export function planGeneratedAssemblyRerun(
  existingRoot: GeneratedAssemblyNode,
  existingParts: readonly GeneratedMeshNode[],
  nextIr: AssemblyIR,
  options: GeneratedAssemblyPlacementOptions & { previousIr?: AssemblyIR } = {},
  detectedAt: string = new Date().toISOString(),
): GeneratedAssemblyRerunPlan {
  // 1. Diff by partId. If no previous IR was persisted, synthesize one
  //    from the live part nodes so the diff is still meaningful.
  const previousIr: AssemblyIR =
    options.previousIr ?? synthesizeIrFromNodes(existingRoot, existingParts)
  const diff = diffAssemblyIR(previousIr, nextIr)

  // 2. Reconcile overrides: same-partId reapply, removed partIds orphan.
  //    Previous orphans are carried forward (never silently dropped).
  const previousOrphans: OverrideOrphan[] = (existingRoot.overrideOrphans ?? []) as OverrideOrphan[]
  const reconciliation = reconcileOverrides(existingRoot.overrides ?? [], nextIr, detectedAt)
  const nextOrphans = [...previousOrphans, ...reconciliation.orphans]

  // 3. Build the ideal next node set (fresh ids — we re-key below).
  const built = buildGeneratedAssemblyNodes(nextIr, {
    ...options,
    overrides: reconciliation.reapplied,
  })

  const existingByPartId = new Map(existingParts.map((n) => [n.partId, n]))
  const updates: GeneratedAssemblyRerunPlan['updates'] = []
  const creates: GeneratedAssemblyRerunPlan['creates'] = []
  const deletes: AnyNodeId[] = []

  // 4. Root node: refresh generator provenance + override layer in place.
  updates.push({
    id: existingRoot.id,
    data: {
      generator: built.rootNode.generator,
      overrides: reconciliation.reapplied,
      overrideOrphans: nextOrphans,
      ports: nextIr.ports ?? [],
      connections: nextIr.connections ?? [],
    } as Partial<AnyNode>,
  })

  // 5. Kept parts: update in place, preserving the scene node id. Parent
  //    is derived from the IR: local-space parts hang under their parent
  //    part (which must itself be kept — validation rejects dangling
  //    parents), world-space parts hang under the root.
  const nextPartById = new Map(nextIr.parts.map((p) => [p.id, p]))
  for (const kept of diff.kept) {
    const existing = existingByPartId.get(kept.partId)
    const next = built.childNodes.find((n) => n.partId === kept.partId)
    const part = nextPartById.get(kept.partId)
    if (!existing || !next || !part) continue
    const parentId: AnyNodeId =
      part.transform.space === 'local' && part.parentId
        ? ((existingByPartId.get(part.parentId)?.id ?? existingRoot.id) as AnyNodeId)
        : (existingRoot.id as AnyNodeId)
    updates.push({
      id: existing.id,
      data: {
        parentId,
        position: next.position,
        rotation: next.rotation,
        scale: next.scale,
        visible: next.visible,
        geometry: next.geometry,
        materialPreset: next.materialPreset,
        fingerprint: next.fingerprint,
        metadata: next.metadata,
      } as Partial<AnyNode>,
    })
  }

  // 6. Added parts: create, wiring parent to existing or new node ids.
  //    Parents must be created before children; iterate until stable.
  const pending = new Map(
    built.childNodes
      .filter((n) => diff.added.some((p) => p.id === n.partId))
      .map((n) => [n.partId, n]),
  )
  const createdIdByPartId = new Map<string, string>()
  let progressed = true
  while (pending.size > 0 && progressed) {
    progressed = false
    for (const [partId, node] of pending) {
      const part = nextIr.parts.find((p) => p.id === partId)
      const isLocal = part?.transform.space === 'local' && part.parentId
      const parentSceneId = isLocal
        ? (existingByPartId.get(part.parentId as string)?.id ??
          createdIdByPartId.get(part.parentId as string))
        : existingRoot.id
      if (isLocal && parentSceneId === undefined) continue // parent still pending
      const withParent = { ...node, parentId: (parentSceneId ?? existingRoot.id) as AnyNodeId }
      creates.push({ node: withParent as AnyNode, parentId: withParent.parentId })
      createdIdByPartId.set(partId, node.id)
      pending.delete(partId)
      progressed = true
    }
  }
  // Any leftover (shouldn't happen — validation rejects cycles): attach to root.
  for (const [partId, node] of pending) {
    const withParent = { ...node, parentId: existingRoot.id }
    creates.push({ node: withParent as AnyNode, parentId: existingRoot.id })
    createdIdByPartId.set(partId, node.id)
  }

  // 7. Removed parts: delete their scene nodes.
  for (const removed of diff.removed) {
    const existing = existingByPartId.get(removed.id)
    if (existing) deletes.push(existing.id)
  }

  return {
    updates,
    creates,
    deletes,
    diff,
    reappliedOverrides: reconciliation.reapplied,
    orphans: reconciliation.orphans,
    nextOverrides: reconciliation.reapplied,
    nextOrphans,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reconstruct a minimal IR from live nodes, for diffing when the previous
 * IR was not persisted. Fingerprints come from the node `fingerprint`
 * field, so kept/added/removed and fingerprintChanged remain accurate.
 */
function synthesizeIrFromNodes(
  root: GeneratedAssemblyNode,
  parts: readonly GeneratedMeshNode[],
): AssemblyIR {
  return {
    schemaVersion: 1,
    generator: {
      sourceHash: root.generator.sourceHash,
      apiVersion: root.generator.apiVersion,
      paramsHash: root.generator.paramsHash,
    },
    parts: parts.map((n) => ({
      id: n.partId,
      transform: {
        space: ((n.metadata as { transformSpace?: 'world' | 'local' })?.transformSpace ??
          'world') as 'world' | 'local',
        position: n.position,
        rotation: [0, 0, 0, 1] as [number, number, number, number],
        scale: n.scale,
      },
      geometry: n.geometry,
      material: n.materialPreset ? { preset: n.materialPreset } : {},
      fingerprint: n.fingerprint,
    })),
    constraints: [],
  }
}
