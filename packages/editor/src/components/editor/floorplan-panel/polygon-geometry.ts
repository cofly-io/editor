import type { Point2D } from '@pascal-app/core'
import { rotatePlanVector as rotateSharedPlanVector } from '../../../lib/floorplan'
import { snapToHalf } from '../../tools/item/placement-math'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import { clamp, toSvgPoint } from './coordinate-geometry'
import { isPointInsidePolygon } from './selection-geometry'

export function getFloorplanEdgeNormal(
  start: WallPlanPoint,
  end: WallPlanPoint,
): WallPlanPoint | null {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length < 1e-6) {
    return null
  }

  return [-dy / length, dx / length]
}

export function moveFloorplanPolygonEdge(
  polygon: WallPlanPoint[],
  edgeIndex: number,
  edgeNormal: WallPlanPoint,
  initialPlanPoint: WallPlanPoint,
  nextPlanPoint: WallPlanPoint,
): WallPlanPoint[] {
  if (polygon.length < 2) {
    return polygon
  }

  const edgeStartIndex = edgeIndex
  const edgeEndIndex = (edgeStartIndex + 1) % polygon.length
  const deltaX = nextPlanPoint[0] - initialPlanPoint[0]
  const deltaY = nextPlanPoint[1] - initialPlanPoint[1]
  const normalDistance = deltaX * edgeNormal[0] + deltaY * edgeNormal[1]

  return polygon.map((point, index) =>
    index === edgeStartIndex || index === edgeEndIndex
      ? [point[0] + edgeNormal[0] * normalDistance, point[1] + edgeNormal[1] * normalDistance]
      : point,
  )
}

export function getDistanceToWallSegment(point: Point2D, start: WallPlanPoint, end: WallPlanPoint) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(point.x - start[0], point.y - start[1])
  }

  const projection = clamp(
    ((point.x - start[0]) * dx + (point.y - start[1]) * dy) / lengthSquared,
    0,
    1,
  )
  const projectedX = start[0] + dx * projection
  const projectedY = start[1] + dy * projection

  return Math.hypot(point.x - projectedX, point.y - projectedY)
}

export function normalizePlanVector(vector: Point2D): Point2D | null {
  const length = Math.hypot(vector.x, vector.y)
  if (length <= 1e-9) {
    return null
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

export function dotPlanVectors(a: Point2D, b: Point2D) {
  return a.x * b.x + a.y * b.y
}

export function crossPlanVectors(a: Point2D, b: Point2D) {
  return a.x * b.y - a.y * b.x
}

export function formatPolygonPoints(points: Point2D[]): string {
  return points
    .map((point) => {
      const svgPoint = toSvgPoint(point)
      return `${svgPoint.x},${svgPoint.y}`
    })
    .join(' ')
}

export function toFloorplanPolygon(points: Array<[number, number]>): Point2D[] {
  return points.map(([x, y]) => ({ x, y }))
}

export function rotatePlanVector(x: number, y: number, rotation: number): [number, number] {
  return rotateSharedPlanVector(x, y, rotation)
}

export function getPolygonBounds(points: Point2D[]) {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function interpolatePlanPoint(start: Point2D, end: Point2D, t: number): Point2D {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  }
}

export function getPlanPointDistance(start: Point2D, end: Point2D): number {
  return Math.hypot(end.x - start.x, end.y - start.y)
}

export function getPointToSegmentDistanceSquared(
  point: Point2D,
  start: Point2D,
  end: Point2D,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= Number.EPSILON) {
    return (point.x - start.x) ** 2 + (point.y - start.y) ** 2
  }

  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
  const projection = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  }

  return (point.x - projection.x) ** 2 + (point.y - projection.y) ** 2
}

export function getClosestPolygonEdgeIndex(point: Point2D, polygon: Point2D[]): number {
  let closestIndex = 0
  let closestDistanceSquared = Number.POSITIVE_INFINITY

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if (!(start && end)) {
      continue
    }

    const distanceSquared = getPointToSegmentDistanceSquared(point, start, end)
    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared
      closestIndex = index
    }
  }

  return closestIndex
}

export function getClosestPolygonVertexIndex(point: Point2D, polygon: Point2D[]): number {
  let closestIndex = 0
  let closestDistanceSquared = Number.POSITIVE_INFINITY

  for (let index = 0; index < polygon.length; index += 1) {
    const vertex = polygon[index]
    if (!vertex) {
      continue
    }

    const distanceSquared = (point.x - vertex.x) ** 2 + (point.y - vertex.y) ** 2
    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared
      closestIndex = index
    }
  }

  return closestIndex
}

export function movePlanPointTowards(start: Point2D, end: Point2D, distance: number): Point2D {
  const totalDistance = getPlanPointDistance(start, end)
  if (totalDistance <= Number.EPSILON || distance <= 0) {
    return start
  }

  return interpolatePlanPoint(start, end, Math.min(1, distance / totalDistance))
}

export function isPointInsidePolygonWithHoles(
  point: Point2D,
  polygon: Point2D[],
  holes: Point2D[][] = [],
) {
  return (
    isPointInsidePolygon(point, polygon) && !holes.some((hole) => isPointInsidePolygon(point, hole))
  )
}

export function isPointNearPlanPoint(a: WallPlanPoint, b: WallPlanPoint, threshold = 0.25) {
  return Math.abs(a[0] - b[0]) < threshold && Math.abs(a[1] - b[1]) < threshold
}

export function calculatePolygonSnapPoint(
  lastPoint: WallPlanPoint,
  currentPoint: WallPlanPoint,
): WallPlanPoint {
  const [x1, y1] = lastPoint
  const [x, y] = currentPoint
  const dx = x - x1
  const dy = y - y1
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  const horizontalDist = absDy
  const verticalDist = absDx
  const diagonalDist = Math.abs(absDx - absDy)
  const minDist = Math.min(horizontalDist, verticalDist, diagonalDist)

  if (minDist === diagonalDist) {
    const diagonalLength = Math.min(absDx, absDy)
    return [x1 + Math.sign(dx) * diagonalLength, y1 + Math.sign(dy) * diagonalLength]
  }

  if (minDist === horizontalDist) {
    return [x, y1]
  }

  return [x1, y]
}

export function snapPolygonDraftPoint({
  point,
  start,
  angleSnap,
}: {
  point: WallPlanPoint
  start?: WallPlanPoint
  angleSnap: boolean
}): WallPlanPoint {
  const snappedPoint: WallPlanPoint = [snapToHalf(point[0]), snapToHalf(point[1])]

  if (!(start && angleSnap)) {
    return snappedPoint
  }

  return calculatePolygonSnapPoint(start, snappedPoint)
}

export function pointsEqual(a: WallPlanPoint, b: WallPlanPoint): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

export function polygonsEqual(a: WallPlanPoint[], b: Array<[number, number]>): boolean {
  return (
    a.length === b.length &&
    a.every((point, index) => {
      const otherPoint = b[index]
      if (!otherPoint) {
        return false
      }

      return pointsEqual(point, otherPoint)
    })
  )
}
