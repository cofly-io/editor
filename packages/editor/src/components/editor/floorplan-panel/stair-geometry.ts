import type { Point2D, StairNode } from '@pascal-app/core'
import { getArcPlanPoint } from '../../editor-2d/svg-paths'

export function getNormalizedFloorplanStairSweepAngle(stair: StairNode) {
  const stairType = stair.stairType ?? 'straight'
  const baseSweepAngle = stair.sweepAngle ?? (stairType === 'spiral' ? Math.PI * 2 : Math.PI / 2)

  if (Math.abs(baseSweepAngle) >= Math.PI * 2) {
    return Math.sign(baseSweepAngle || 1) * (Math.PI * 2 - 0.001)
  }

  return baseSweepAngle
}

export function getFloorplanSpiralLandingSweep(stair: StairNode, sweepAngle: number) {
  if (
    (stair.stairType ?? 'straight') !== 'spiral' ||
    (stair.topLandingMode ?? 'none') !== 'integrated'
  ) {
    return 0
  }

  const innerRadius = Math.max(0.05, stair.innerRadius ?? 0.9)
  const width = Math.max(stair.width ?? 1, 0.4)
  const landingDepth = Math.max(0.3, stair.topLandingDepth ?? Math.max(width * 0.9, 0.8))

  return (
    Math.min(Math.PI * 0.75, landingDepth / Math.max(innerRadius + width / 2, 0.1)) *
    Math.sign(sweepAngle || 1)
  )
}

export function getFloorplanCurvedStairHitPolygon(stair: StairNode): Point2D[] {
  const stairType = stair.stairType ?? 'straight'
  const sweepAngle = getNormalizedFloorplanStairSweepAngle(stair)
  const startAngle = -stair.rotation - sweepAngle / 2
  const endAngle = startAngle + sweepAngle + getFloorplanSpiralLandingSweep(stair, sweepAngle)
  const center = {
    x: stair.position[0],
    y: stair.position[2],
  }
  const innerRadius = Math.max(
    stairType === 'spiral' ? 0.05 : 0.2,
    stair.innerRadius ?? (stairType === 'spiral' ? 0.2 : 0.9),
  )
  const outerRadius = innerRadius + stair.width
  const outerArcLength = Math.abs(sweepAngle) * outerRadius
  const segmentCount = Math.max(
    24,
    Math.ceil(Math.abs(sweepAngle) / (Math.PI / 24)),
    Math.ceil(outerArcLength / 0.14),
  )
  const outerPoints: Point2D[] = []
  const innerPoints: Point2D[] = []

  for (let index = 0; index <= segmentCount; index += 1) {
    const t = index / segmentCount
    const angle = startAngle + (endAngle - startAngle) * t
    outerPoints.push(getArcPlanPoint(center, outerRadius, angle))
    innerPoints.push(getArcPlanPoint(center, innerRadius, angle))
  }

  return [...outerPoints, ...innerPoints.reverse()]
}
