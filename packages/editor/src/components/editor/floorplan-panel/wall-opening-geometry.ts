import type { DoorNode, FenceNode, Point2D, WallNode, WindowNode } from '@pascal-app/core'
import { getWallCurveLength, isCurvedWall } from '@pascal-app/core'
import { buildSvgPolylinePath } from '../../editor-2d/svg-paths'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import {
  FLOORPLAN_MAX_EXTRA_THICKNESS,
  FLOORPLAN_MIN_VISIBLE_WALL_THICKNESS,
  FLOORPLAN_WALL_THICKNESS_SCALE,
} from './constants'
import { clamp, toSvgPoint } from './coordinate-geometry'

export function pointMatchesWallPlanPoint(
  point: Point2D | undefined,
  planPoint: WallPlanPoint,
  epsilon = 1e-6,
): boolean {
  if (!point) {
    return false
  }

  return Math.abs(point.x - planPoint[0]) <= epsilon && Math.abs(point.y - planPoint[1]) <= epsilon
}

export function getFloorplanFenceLength(fence: FenceNode) {
  return isCurvedWall(fence)
    ? getWallCurveLength(fence)
    : Math.hypot(fence.end[0] - fence.start[0], fence.end[1] - fence.start[1])
}

export function getFloorplanFenceMarkerTs(fence: FenceNode) {
  const fenceLength = getFloorplanFenceLength(fence)
  if (fenceLength <= 0.24) {
    return [0.5]
  }

  const spacing = clamp(
    fence.style === 'privacy' ? fence.postSpacing * 0.72 : fence.postSpacing,
    0.34,
    1.5,
  )
  const inset = clamp(
    Math.max(fence.postSize * 1.25, fence.edgeInset * 10),
    0.18,
    Math.min(0.48, fenceLength * 0.22),
  )
  const usableLength = Math.max(fenceLength - inset * 2, 0)

  if (usableLength <= 0.001) {
    return [0.5]
  }

  const markerCount = Math.max(1, Math.min(24, Math.floor(usableLength / spacing) + 1))
  if (markerCount === 1) {
    return [0.5]
  }

  return Array.from({ length: markerCount }, (_, index) =>
    clamp((inset + (usableLength * index) / (markerCount - 1)) / fenceLength, 0.08, 0.92),
  )
}

export function getWallHoverSidePaths(polygon: Point2D[], wall: WallNode): [string, string] | null {
  if (polygon.length < 4) {
    return null
  }

  if (isCurvedWall(wall) && polygon.length >= 6 && polygon.length % 2 === 0) {
    const sidePointCount = polygon.length / 2
    const rightSidePath = buildSvgPolylinePath(polygon.slice(0, sidePointCount))
    const leftSidePath = buildSvgPolylinePath(polygon.slice(sidePointCount).reverse())

    if (!(rightSidePath && leftSidePath)) {
      return null
    }

    return [rightSidePath, leftSidePath]
  }

  const startRight = polygon[0]
  const endRight = polygon[1]
  const hasEndCenterPoint = pointMatchesWallPlanPoint(polygon[2], wall.end)
  const endLeft = polygon[hasEndCenterPoint ? 3 : 2]
  const lastPoint = polygon[polygon.length - 1]
  const hasStartCenterPoint = pointMatchesWallPlanPoint(lastPoint, wall.start)
  const startLeft = polygon[hasStartCenterPoint ? polygon.length - 2 : polygon.length - 1]

  if (!(startRight && endRight && endLeft && startLeft)) {
    return null
  }

  const svgStartRight = toSvgPoint(startRight)
  const svgEndRight = toSvgPoint(endRight)
  const svgStartLeft = toSvgPoint(startLeft)
  const svgEndLeft = toSvgPoint(endLeft)

  const rightSidePath = `M ${svgStartRight.x} ${svgStartRight.y} L ${svgEndRight.x} ${svgEndRight.y}`
  const leftSidePath = `M ${svgStartLeft.x} ${svgStartLeft.y} L ${svgEndLeft.x} ${svgEndLeft.y}`

  return [rightSidePath, leftSidePath]
}

export function buildDraftWall(
  levelId: string,
  start: WallPlanPoint,
  end: WallPlanPoint,
): WallNode {
  return {
    object: 'node',
    id: 'wall_draft' as WallNode['id'],
    type: 'wall',
    name: 'Draft wall',
    parentId: levelId,
    visible: true,
    metadata: {},
    children: [],
    start,
    end,
    frontSide: 'unknown',
    backSide: 'unknown',
  }
}

export function getFloorplanWallThickness(wall: WallNode): number {
  const baseThickness = wall.thickness ?? 0.1
  const scaledThickness = baseThickness * FLOORPLAN_WALL_THICKNESS_SCALE

  return Math.min(
    baseThickness + FLOORPLAN_MAX_EXTRA_THICKNESS,
    Math.max(baseThickness, scaledThickness, FLOORPLAN_MIN_VISIBLE_WALL_THICKNESS),
  )
}

export function getFloorplanWall(wall: WallNode): WallNode {
  return {
    ...wall,
    // Slightly exaggerate thin walls so the 2D blueprint reads clearly without drifting far from BIM.
    thickness: getFloorplanWallThickness(wall),
  }
}

export function getOpeningFootprint(wall: WallNode, node: WindowNode | DoorNode): Point2D[] {
  const [x1, z1] = wall.start
  const [x2, z2] = wall.end

  const dx = x2 - x1
  const dz = z2 - z1
  const length = Math.sqrt(dx * dx + dz * dz)

  if (length < 1e-9) {
    return []
  }

  const dirX = dx / length
  const dirZ = dz / length

  const perpX = -dirZ
  const perpZ = dirX

  const distance = node.position[0]
  const width = node.width
  const depth = wall.thickness ?? 0.1

  const cx = x1 + dirX * distance
  const cz = z1 + dirZ * distance

  const halfWidth = width / 2
  const halfDepth = depth / 2

  return [
    {
      x: cx - dirX * halfWidth + perpX * halfDepth,
      y: cz - dirZ * halfWidth + perpZ * halfDepth,
    },
    {
      x: cx + dirX * halfWidth + perpX * halfDepth,
      y: cz + dirZ * halfWidth + perpZ * halfDepth,
    },
    {
      x: cx + dirX * halfWidth - perpX * halfDepth,
      y: cz + dirZ * halfWidth - perpZ * halfDepth,
    },
    {
      x: cx - dirX * halfWidth - perpX * halfDepth,
      y: cz - dirZ * halfWidth - perpZ * halfDepth,
    },
  ]
}

export function getOpeningCenterLine(polygon: Point2D[]) {
  if (polygon.length < 4) {
    return null
  }

  const [p1, p2, p3, p4] = polygon

  return {
    start: {
      x: (p1!.x + p4!.x) / 2,
      y: (p1!.y + p4!.y) / 2,
    },
    end: {
      x: (p2!.x + p3!.x) / 2,
      y: (p2!.y + p3!.y) / 2,
    },
  }
}

export function isOpeningPlanFlipped(rotation: [number, number, number]) {
  const normalized =
    ((((rotation[1] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) + 1e-6) % (Math.PI * 2)

  return normalized > Math.PI / 2 && normalized < (Math.PI * 3) / 2
}

export function getFlippedHingesSide(hingesSide: DoorNode['hingesSide']) {
  return hingesSide === 'left' ? 'right' : 'left'
}

export function getFlippedSwingDirection(swingDirection: DoorNode['swingDirection']) {
  return swingDirection === 'inward' ? 'outward' : 'inward'
}

export function findClosestWallPoint(
  point: WallPlanPoint,
  walls: WallNode[],
  options?: {
    maxDistance?: number
    canUseWall?: (wall: WallNode) => boolean
  },
): {
  wall: WallNode
  point: WallPlanPoint
  t: number
  normal: [number, number, number]
} | null {
  const maxDistance = options?.maxDistance ?? 0.5
  const canUseWall = options?.canUseWall

  let best: {
    wall: WallNode
    point: WallPlanPoint
    t: number
    normal: [number, number, number]
  } | null = null
  let bestDistSq = maxDistance * maxDistance

  for (const wall of walls) {
    if (canUseWall && !canUseWall(wall)) {
      continue
    }

    const [x1, z1] = wall.start
    const [x2, z2] = wall.end
    const dx = x2 - x1
    const dz = z2 - z1
    const lengthSq = dx * dx + dz * dz
    if (lengthSq < 1e-9) continue

    let t = ((point[0] - x1) * dx + (point[1] - z1) * dz) / lengthSq
    t = Math.max(0, Math.min(1, t))

    const px = x1 + t * dx
    const pz = z1 + t * dz

    const distSq = (point[0] - px) ** 2 + (point[1] - pz) ** 2
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      // Provide an arbitrary front-facing normal so the tool knows it's a valid wall side
      best = { wall, point: [px, pz], t, normal: [0, 0, 1] }
    }
  }

  return best
}
