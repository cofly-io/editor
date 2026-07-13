import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import {
  formatPolygonPoints,
  isPointNearPlanPoint,
  pointsEqual,
  toPoint2D,
  toSvgX,
  toSvgY,
} from './geometry'

export type PolygonDraftPointAction =
  | { type: 'append'; points: WallPlanPoint[] }
  | { type: 'complete'; points: WallPlanPoint[] }
  | { type: 'ignore'; points: WallPlanPoint[] }

export function getPolygonDraftPointAction(
  points: WallPlanPoint[],
  point: WallPlanPoint,
): PolygonDraftPointAction {
  const lastPoint = points[points.length - 1]
  if (lastPoint && pointsEqual(lastPoint, point)) {
    return { type: 'ignore', points }
  }

  const firstPoint = points[0]
  if (firstPoint && points.length >= 3 && isPointNearPlanPoint(point, firstPoint)) {
    return { type: 'complete', points }
  }

  return { type: 'append', points: [...points, point] }
}

export function getConfirmedPolygonDraftPoints(
  points: WallPlanPoint[],
  point?: WallPlanPoint,
): WallPlanPoint[] | null {
  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  let nextPoints = points

  if (point) {
    const isClosingExistingPolygon = Boolean(
      firstPoint && points.length >= 3 && isPointNearPlanPoint(point, firstPoint),
    )
    const isDuplicatePoint = Boolean(lastPoint && pointsEqual(lastPoint, point))

    if (!(isClosingExistingPolygon || isDuplicatePoint)) {
      nextPoints = [...points, point]
    }
  }

  return nextPoints.length >= 3 ? nextPoints : null
}

export function getActivePolygonDraftPoints({
  ceilingDraftPoints,
  isCeilingBuildActive,
  isSlabBuildActive,
  isZoneBuildActive,
  slabDraftPoints,
  zoneDraftPoints,
}: {
  ceilingDraftPoints: WallPlanPoint[]
  isCeilingBuildActive: boolean
  isSlabBuildActive: boolean
  isZoneBuildActive: boolean
  slabDraftPoints: WallPlanPoint[]
  zoneDraftPoints: WallPlanPoint[]
}): WallPlanPoint[] {
  if (isCeilingBuildActive) {
    return ceilingDraftPoints
  }

  if (isZoneBuildActive) {
    return zoneDraftPoints
  }

  if (isSlabBuildActive) {
    return slabDraftPoints
  }

  return []
}

export function getPolygonDraftPolylinePoints({
  cursorPoint,
  draftPoints,
  isPolygonDraftBuildActive,
}: {
  cursorPoint: WallPlanPoint | null
  draftPoints: WallPlanPoint[]
  isPolygonDraftBuildActive: boolean
}): string | null {
  if (!(isPolygonDraftBuildActive && cursorPoint && draftPoints.length > 0)) {
    return null
  }

  return formatPolygonPoints([...draftPoints.map(toPoint2D), toPoint2D(cursorPoint)])
}

export function getPolygonDraftPolygonPoints({
  cursorPoint,
  draftPoints,
  isPolygonDraftBuildActive,
}: {
  cursorPoint: WallPlanPoint | null
  draftPoints: WallPlanPoint[]
  isPolygonDraftBuildActive: boolean
}): string | null {
  if (!(isPolygonDraftBuildActive && cursorPoint && draftPoints.length >= 2)) {
    return null
  }

  return formatPolygonPoints([...draftPoints.map(toPoint2D), toPoint2D(cursorPoint)])
}

export function getPolygonDraftClosingSegment({
  cursorPoint,
  draftPoints,
  isPolygonDraftBuildActive,
}: {
  cursorPoint: WallPlanPoint | null
  draftPoints: WallPlanPoint[]
  isPolygonDraftBuildActive: boolean
}) {
  if (!(isPolygonDraftBuildActive && cursorPoint && draftPoints.length >= 2)) {
    return null
  }

  const firstPoint = draftPoints[0]
  if (!firstPoint) {
    return null
  }

  return {
    x1: toSvgX(cursorPoint[0]),
    y1: toSvgY(cursorPoint[1]),
    x2: toSvgX(firstPoint[0]),
    y2: toSvgY(firstPoint[1]),
  }
}
