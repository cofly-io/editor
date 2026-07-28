import type { SceneGraph } from './scene'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNodeChildIds(node: unknown): string[] {
  if (!isRecord(node) || !Array.isArray(node.children)) return []
  return (node.children as unknown[])
    .map((child) => {
      if (typeof child === 'string') return child
      if (child && typeof child === 'object' && 'id' in child && typeof child.id === 'string') {
        return child.id
      }
      return null
    })
    .filter((id): id is string => typeof id === 'string')
}

function collectReachableNodeIds(
  nodes: Record<string, unknown>,
  rootNodeIds: string[],
): Set<string> {
  const reachable = new Set<string>()
  const stack = [...rootNodeIds]
  const childIdsByParentId = new Map<string, string[]>()

  for (const [id, node] of Object.entries(nodes)) {
    if (!isRecord(node)) continue
    const parentId = typeof node.parentId === 'string' ? node.parentId : null
    if (!parentId) continue
    const children = childIdsByParentId.get(parentId) ?? []
    children.push(id)
    childIdsByParentId.set(parentId, children)
  }

  while (stack.length > 0) {
    const id = stack.pop()
    if (!id || reachable.has(id)) continue
    const node = nodes[id]
    if (!node) continue
    reachable.add(id)
    stack.push(...getNodeChildIds(node))
    stack.push(...(childIdsByParentId.get(id) ?? []))
  }

  return reachable
}

function stripTransientNodeMetadata(node: unknown): unknown {
  if (!isRecord(node) || !isRecord(node.metadata) || node.metadata.isNew !== true) return node

  const metadata = { ...node.metadata }
  delete metadata.isNew
  return { ...node, metadata }
}

function isTransientNode(node: unknown): boolean {
  return isRecord(node) && isRecord(node.metadata) && node.metadata.isTransient === true
}

function preparePersistedNode(node: unknown, transientIds: ReadonlySet<string>): unknown {
  const stripped = stripTransientNodeMetadata(node)
  if (!isRecord(stripped)) return stripped

  let next = stripped
  if (Array.isArray(stripped.children)) {
    const children = stripped.children.filter(
      (childId) => typeof childId !== 'string' || !transientIds.has(childId),
    )
    if (children.length !== stripped.children.length) next = { ...next, children }
  }
  if (typeof stripped.parentId === 'string' && transientIds.has(stripped.parentId)) {
    next = { ...next, parentId: null }
  }
  return next
}

function prepareCollections(
  collections: Record<string, unknown> | undefined,
  transientIds: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  if (!collections) return undefined
  return Object.fromEntries(
    Object.entries(collections).map(([id, collection]) => {
      if (!isRecord(collection)) return [id, collection]
      const next = { ...collection }
      if (Array.isArray(collection.nodeIds)) {
        next.nodeIds = collection.nodeIds.filter(
          (nodeId) => typeof nodeId !== 'string' || !transientIds.has(nodeId),
        )
      }
      if (
        typeof collection.controlNodeId === 'string' &&
        transientIds.has(collection.controlNodeId)
      ) {
        delete next.controlNodeId
      }
      return [id, next]
    }),
  )
}

export function prepareSceneGraphForSave(scene: SceneGraph): SceneGraph {
  const transientIds = new Set(
    Object.entries(scene.nodes)
      .filter(([, node]) => isTransientNode(node))
      .map(([id]) => id),
  )

  // First pass: strip transient nodes and repair references.
  const nodesAfterTransient = Object.fromEntries(
    Object.entries(scene.nodes)
      .filter(([id]) => !transientIds.has(id))
      .map(([id, node]) => [id, preparePersistedNode(node, transientIds)]),
  )
  const rootNodeIdsAfterTransient = scene.rootNodeIds.filter(
    (id) => !transientIds.has(id) && id in nodesAfterTransient,
  )

  // Second pass: drop unreachable nodes so they are not persisted. The
  // scene store cleans them on load, but without this step the same
  // orphans are written back to storage and re-appear on every startup.
  const reachableIds = collectReachableNodeIds(nodesAfterTransient, rootNodeIdsAfterTransient)
  const unreachableIds = Object.keys(nodesAfterTransient).filter((id) => !reachableIds.has(id))
  if (unreachableIds.length > 0) {
    console.warn(
      `[scene-save] Dropping ${unreachableIds.length} unreachable node(s) before save:`,
      unreachableIds,
    )
  }
  const nodes: typeof nodesAfterTransient = {}
  for (const [id, node] of Object.entries(nodesAfterTransient)) {
    if (reachableIds.has(id)) {
      nodes[id] = node
    }
  }
  const rootNodeIds = rootNodeIdsAfterTransient.filter((id) => id in nodes)

  const collections = prepareCollections(scene.collections, transientIds)

  return {
    ...scene,
    nodes,
    rootNodeIds,
    ...(collections ? { collections } : {}),
  }
}
