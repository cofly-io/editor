import { FLOORPLAN_VIEW_ROTATION_DEG } from './floorplan-view-rotation'
import type { SvgPoint } from './types'

export function radiansToDegrees(angle: number) {
  return (angle * 180) / Math.PI
}

export function degreesToRadians(angle: number) {
  return (angle * Math.PI) / 180
}

export function nearestEquivalentDegrees(angle: number, reference: number) {
  let nextAngle = angle

  while (nextAngle - reference > 180) {
    nextAngle -= 360
  }

  while (nextAngle - reference < -180) {
    nextAngle += 360
  }

  return nextAngle
}

export function floorplanRotationFromCameraAzimuth(azimuth: number, reference: number) {
  return nearestEquivalentDegrees(
    radiansToDegrees(azimuth) - FLOORPLAN_VIEW_ROTATION_DEG,
    reference,
  )
}

export function cameraAzimuthFromFloorplanRotation(rotationDeg: number) {
  return degreesToRadians(rotationDeg + FLOORPLAN_VIEW_ROTATION_DEG)
}

export function floorplanLocalToWorldPoint(
  localPoint: SvgPoint,
  buildingPosition: [number, number, number],
  buildingRotationY: number,
) {
  const cos = Math.cos(buildingRotationY)
  const sin = Math.sin(buildingRotationY)

  return {
    x: buildingPosition[0] + localPoint.x * cos - localPoint.y * sin,
    z: buildingPosition[2] + localPoint.x * sin + localPoint.y * cos,
  }
}

export function worldToFloorplanLocalPoint(
  worldX: number,
  worldZ: number,
  buildingPosition: [number, number, number],
  buildingRotationY: number,
) {
  const dx = worldX - buildingPosition[0]
  const dz = worldZ - buildingPosition[2]
  const cos = Math.cos(-buildingRotationY)
  const sin = Math.sin(-buildingRotationY)

  return {
    x: dx * cos - dz * sin,
    y: dx * sin + dz * cos,
  }
}
