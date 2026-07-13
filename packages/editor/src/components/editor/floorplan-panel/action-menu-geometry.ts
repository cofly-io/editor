import type { Point2D } from '@pascal-app/core'
import {
  FLOORPLAN_ACTION_MENU_HORIZONTAL_PADDING,
  FLOORPLAN_ACTION_MENU_MIN_ANCHOR_Y,
} from './constants'
import { toSvgPoint } from './coordinate-geometry'
import type { SvgPoint } from './types'

export function rotateSvgPoint(point: SvgPoint, rotationDegrees: number): SvgPoint {
  if (rotationDegrees === 0) {
    return point
  }

  const radians = (rotationDegrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }
}

export function projectSvgPointToSurface(
  svgPoint: SvgPoint,
  viewBox: { minX: number; minY: number; width: number; height: number },
  surfaceSize: { width: number; height: number },
): SvgPoint | null {
  if (
    !(surfaceSize.width > 0 && surfaceSize.height > 0 && viewBox.width > 0 && viewBox.height > 0)
  ) {
    return null
  }

  if (
    svgPoint.x < viewBox.minX ||
    svgPoint.x > viewBox.minX + viewBox.width ||
    svgPoint.y < viewBox.minY ||
    svgPoint.y > viewBox.minY + viewBox.height
  ) {
    return null
  }

  return {
    x: ((svgPoint.x - viewBox.minX) / viewBox.width) * surfaceSize.width,
    y: ((svgPoint.y - viewBox.minY) / viewBox.height) * surfaceSize.height,
  }
}

export function getFloorplanActionMenuPosition(
  points: Point2D[],
  viewBox: { minX: number; minY: number; width: number; height: number },
  surfaceSize: { width: number; height: number },
  rotationDegrees = 0,
) {
  if (points.length === 0) {
    return null
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    const svgPoint = rotateSvgPoint(toSvgPoint(point), rotationDegrees)
    minX = Math.min(minX, svgPoint.x)
    maxX = Math.max(maxX, svgPoint.x)
    minY = Math.min(minY, svgPoint.y)
    maxY = Math.max(maxY, svgPoint.y)
  }

  if (
    !(
      Number.isFinite(minX) &&
      Number.isFinite(maxX) &&
      Number.isFinite(minY) &&
      Number.isFinite(maxY)
    )
  ) {
    return null
  }

  if (
    maxX < viewBox.minX ||
    minX > viewBox.minX + viewBox.width ||
    maxY < viewBox.minY ||
    minY > viewBox.minY + viewBox.height
  ) {
    return null
  }

  const anchorX = (((minX + maxX) / 2 - viewBox.minX) / viewBox.width) * surfaceSize.width
  const anchorY = ((minY - viewBox.minY) / viewBox.height) * surfaceSize.height

  return {
    x: Math.min(
      Math.max(anchorX, FLOORPLAN_ACTION_MENU_HORIZONTAL_PADDING),
      surfaceSize.width - FLOORPLAN_ACTION_MENU_HORIZONTAL_PADDING,
    ),
    y: Math.max(anchorY, FLOORPLAN_ACTION_MENU_MIN_ANCHOR_Y),
  }
}
