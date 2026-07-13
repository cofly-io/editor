export type PatchableSceneGraph = {
  nodes: Record<string, unknown>
  rootNodeIds: string[]
  collections?: Record<string, unknown>
}

export type SceneGraphPatch = {
  nodes: {
    upsert: Record<string, unknown>
    remove: string[]
  }
  rootNodeIds?: string[]
  collections?: Record<string, unknown>
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  return JSON.stringify(left) === JSON.stringify(right)
}

export function createSceneGraphPatch(
  previous: PatchableSceneGraph,
  next: PatchableSceneGraph,
): SceneGraphPatch {
  const upsert: Record<string, unknown> = {}
  const remove: string[] = []

  for (const [id, node] of Object.entries(next.nodes)) {
    if (!(id in previous.nodes) || !sameJson(previous.nodes[id], node)) upsert[id] = node
  }
  for (const id of Object.keys(previous.nodes)) {
    if (!(id in next.nodes)) remove.push(id)
  }

  return {
    nodes: { upsert, remove },
    ...(!sameJson(previous.rootNodeIds, next.rootNodeIds)
      ? { rootNodeIds: [...next.rootNodeIds] }
      : {}),
    ...(!sameJson(previous.collections, next.collections)
      ? { collections: { ...(next.collections ?? {}) } }
      : {}),
  }
}

export function hasSceneGraphPatchChanges(patch: SceneGraphPatch): boolean {
  return (
    Object.keys(patch.nodes.upsert).length > 0 ||
    patch.nodes.remove.length > 0 ||
    patch.rootNodeIds !== undefined ||
    patch.collections !== undefined
  )
}

export function applySceneGraphPatch<T extends PatchableSceneGraph>(
  graph: T,
  patch: SceneGraphPatch,
): T {
  const nodes = { ...graph.nodes, ...patch.nodes.upsert }
  for (const id of patch.nodes.remove) delete nodes[id]

  return {
    ...graph,
    nodes,
    rootNodeIds: patch.rootNodeIds ? [...patch.rootNodeIds] : graph.rootNodeIds,
    ...(patch.collections !== undefined ? { collections: { ...patch.collections } } : {}),
  }
}
