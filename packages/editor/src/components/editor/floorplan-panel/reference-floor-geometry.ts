import type { AnyNode, AnyNodeId, FloorplanGeometry, GeometryContext } from '@pascal-app/core'
import { nodeRegistry } from '@pascal-app/core'

export function buildReferenceFloorGeometries(nodes: readonly AnyNode[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))

  return nodes.flatMap((node) => {
    if (node.visible === false) {
      return []
    }

    const builder = nodeRegistry.get(node.type)?.floorplan
    if (!builder) {
      return []
    }

    const geometry = (
      builder as (node: AnyNode, context: GeometryContext) => FloorplanGeometry | null
    )(node, buildReferenceGeometryContext(node, nodeById))

    return geometry ? [{ id: node.id, geometry }] : []
  })
}

function buildReferenceGeometryContext(
  node: AnyNode,
  nodes: ReadonlyMap<AnyNodeId, AnyNode>,
): GeometryContext {
  const resolve = <N = AnyNode>(id: AnyNodeId): N | undefined => nodes.get(id) as N | undefined
  const childIds = (node as { children?: AnyNodeId[] }).children
  const children = Array.isArray(childIds)
    ? childIds.flatMap((id) => {
        const child = nodes.get(id)
        return child ? [child] : []
      })
    : []
  const parentId = node.parentId as AnyNodeId | null
  const parent = parentId ? (nodes.get(parentId) ?? null) : null
  const parentChildIds = (parent as { children?: AnyNodeId[] } | null)?.children
  const siblings = Array.isArray(parentChildIds)
    ? parentChildIds.flatMap((id) => {
        const sibling = nodes.get(id)
        return sibling && sibling.id !== node.id && sibling.type === node.type ? [sibling] : []
      })
    : []

  return { children, parent, resolve, siblings }
}
