import type { AnyNode, AnyNodeId } from '@pascal-app/core'

export type AssemblyContainerType = 'assembly' | 'generated-assembly'

export function isAssemblyContainerNode(
  node: Pick<AnyNode, 'type'> | null | undefined,
): node is AnyNode & { type: AssemblyContainerType } {
  return node?.type === 'assembly' || node?.type === 'generated-assembly'
}

export function findContainingAssemblyNodeInMap(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): AnyNode | null {
  let parentId = node.parentId as AnyNodeId | null
  const visited = new Set<string>()

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = nodes[parentId]
    if (!parent) break
    if (isAssemblyContainerNode(parent)) return parent
    parentId = parent.parentId as AnyNodeId | null
  }

  return null
}
