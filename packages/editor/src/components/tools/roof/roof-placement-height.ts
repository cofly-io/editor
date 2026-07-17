import {
  type AnyNode,
  type AnyNodeId,
  type CeilingNode,
  DEFAULT_WALL_HEIGHT,
  type LevelNode,
  type WallNode,
} from '@pascal-app/core'

type SceneNodeMap = Record<string, AnyNode | undefined>

function validHeight(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function getDefaultRoofPlacementY(levelId: LevelNode['id'], nodes: SceneNodeMap): number {
  const level = nodes[levelId as AnyNodeId]
  if (level?.type !== 'level') return DEFAULT_WALL_HEIGHT

  let topY = 0

  for (const childId of level.children) {
    const child = nodes[childId as AnyNodeId]
    if (!child) continue

    if (child.type === 'ceiling') {
      const height = validHeight((child as CeilingNode).height) ?? DEFAULT_WALL_HEIGHT
      topY = Math.max(topY, height)
    } else if (child.type === 'wall') {
      const height = validHeight((child as WallNode).height) ?? DEFAULT_WALL_HEIGHT
      topY = Math.max(topY, height)
    }
  }

  return topY > 0 ? topY : DEFAULT_WALL_HEIGHT
}
