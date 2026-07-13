import type { SceneGraph } from './scene'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
  const nodes = Object.fromEntries(
    Object.entries(scene.nodes)
      .filter(([id]) => !transientIds.has(id))
      .map(([id, node]) => [id, preparePersistedNode(node, transientIds)]),
  )
  const collections = prepareCollections(scene.collections, transientIds)

  return {
    ...scene,
    nodes,
    rootNodeIds: scene.rootNodeIds.filter((id) => !transientIds.has(id) && id in nodes),
    ...(collections ? { collections } : {}),
  }
}
