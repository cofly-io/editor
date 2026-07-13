import type { Point2D } from '@pascal-app/core'
import { snapToHalf } from '../../tools/item/placement-math'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import type { SvgPoint } from './types'

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function roundPlanMeters(value: number) {
  return Math.round(value * 100) / 100
}

export function toPoint2D(point: WallPlanPoint): Point2D {
  return { x: point[0], y: point[1] }
}

export function toWallPlanPoint(point: Point2D): WallPlanPoint {
  return [point.x, point.y]
}

export function toSvgX(value: number): number {
  return value
}

export function toSvgY(value: number): number {
  return value
}

export function toSvgPoint(point: Point2D): SvgPoint {
  return {
    x: toSvgX(point.x),
    y: toSvgY(point.y),
  }
}

export function toSvgPlanPoint(point: WallPlanPoint): SvgPoint {
  return {
    x: toSvgX(point[0]),
    y: toSvgY(point[1]),
  }
}

export function toPlanPointFromSvgPoint(svgPoint: SvgPoint): WallPlanPoint {
  return [toSvgX(svgPoint.x), toSvgY(svgPoint.y)]
}

export function getSnappedFloorplanPoint(point: WallPlanPoint): WallPlanPoint {
  return [snapToHalf(point[0]), snapToHalf(point[1])]
}

export function rotateVector([x, y]: WallPlanPoint, angle: number): WallPlanPoint {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [x * cos - y * sin, x * sin + y * cos]
}

export function addVectorToSvgPoint(point: SvgPoint, [dx, dy]: WallPlanPoint): SvgPoint {
  return {
    x: point.x + dx,
    y: point.y + dy,
  }
}

export function subtractSvgPoints(point: SvgPoint, origin: SvgPoint): WallPlanPoint {
  return [point.x - origin.x, point.y - origin.y]
}

export function midpointBetweenSvgPoints(start: SvgPoint, end: SvgPoint): SvgPoint {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }
}

export function normalizeAngle(angle: number) {
  let nextAngle = angle

  while (nextAngle <= -Math.PI) {
    nextAngle += Math.PI * 2
  }

  while (nextAngle > Math.PI) {
    nextAngle -= Math.PI * 2
  }

  return nextAngle
}
