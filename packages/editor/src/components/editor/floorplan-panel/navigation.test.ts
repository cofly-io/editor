import { describe, expect, test } from 'bun:test'
import {
  cameraAzimuthFromFloorplanRotation,
  floorplanLocalToWorldPoint,
  floorplanRotationFromCameraAzimuth,
  nearestEquivalentDegrees,
  worldToFloorplanLocalPoint,
} from './navigation'

describe('floorplan navigation helpers', () => {
  test('round-trips floorplan rotation through camera azimuth', () => {
    const rotationDeg = 35
    const azimuth = cameraAzimuthFromFloorplanRotation(rotationDeg)

    expect(floorplanRotationFromCameraAzimuth(azimuth, rotationDeg)).toBeCloseTo(rotationDeg)
  })

  test('chooses the nearest equivalent degree value', () => {
    expect(nearestEquivalentDegrees(0, 350)).toBe(360)
    expect(nearestEquivalentDegrees(0, -350)).toBe(-360)
  })

  test('round-trips floorplan local and world points with building transform', () => {
    const buildingPosition: [number, number, number] = [10, 0, -4]
    const buildingRotationY = Math.PI / 4
    const localPoint = { x: 2, y: 3 }

    const worldPoint = floorplanLocalToWorldPoint(localPoint, buildingPosition, buildingRotationY)
    const roundTripped = worldToFloorplanLocalPoint(
      worldPoint.x,
      worldPoint.z,
      buildingPosition,
      buildingRotationY,
    )

    expect(roundTripped.x).toBeCloseTo(localPoint.x)
    expect(roundTripped.y).toBeCloseTo(localPoint.y)
  })
})
