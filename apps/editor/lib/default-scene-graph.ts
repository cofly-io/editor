import { type AnyNode, type AnyNodeId, BuildingNode, LevelNode, SiteNode } from '@pascal-app/core'

export type DefaultSceneGraph = {
  nodes: Record<string, AnyNode>
  rootNodeIds: string[]
}

export function createDefaultSceneGraph(): DefaultSceneGraph {
  const level = LevelNode.parse({ children: [], level: 0 })
  const building = BuildingNode.parse({ children: [level.id] })
  const site = SiteNode.parse({ children: [building.id] })

  return {
    nodes: {
      [site.id]: site,
      [building.id]: { ...building, parentId: site.id },
      [level.id]: { ...level, parentId: building.id },
    } as Record<AnyNodeId, AnyNode>,
    rootNodeIds: [site.id],
  }
}

export function isEmptySceneGraph(graph: {
  nodes: Record<string, unknown>
  rootNodeIds: string[]
}) {
  return Object.keys(graph.nodes).length === 0 && graph.rootNodeIds.length === 0
}
