import { describe, expect, test } from 'bun:test'
import {
  convertReferenceLengthToMeters,
  formatMeasurement,
  formatNumber,
  formatReferenceScaleLabel,
  getPolygonAreaAndCentroid,
  getSlabArea,
} from './measurements'

describe('floorplan measurements', () => {
  test('formats metric and imperial lengths with calibrated scale', () => {
    expect(formatMeasurement(1.234, 'metric')).toBe('1.23m')
    expect(formatMeasurement(2, 'metric', 0.5)).toBe('1m')
    expect(formatMeasurement(1, 'imperial')).toBe('3\'3"')
    expect(formatMeasurement(1, 'imperial', 2)).toBe('6\'7"')
  })

  test('converts reference scale units to meters', () => {
    expect(convertReferenceLengthToMeters(250, 'centimeters')).toBe(2.5)
    expect(convertReferenceLengthToMeters(10, 'feet')).toBeCloseTo(3.048)
    expect(convertReferenceLengthToMeters(12, 'inches')).toBeCloseTo(0.3048)
    expect(convertReferenceLengthToMeters(4, 'meters')).toBe(4)
  })

  test('formats reference labels without trailing zero noise', () => {
    expect(formatNumber(1.2)).toBe('1.2')
    expect(formatNumber(1.234, 1)).toBe('1.2')
    expect(formatReferenceScaleLabel(12, 'feet')).toBe('12 ft')
  })

  test('computes polygon area and centroid independent of winding', () => {
    const clockwise = [
      { x: 0, y: 0 },
      { x: 0, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 0 },
    ]
    const counterClockwise = [...clockwise].reverse()

    expect(getPolygonAreaAndCentroid(clockwise).area).toBe(8)
    expect(getPolygonAreaAndCentroid(counterClockwise).area).toBe(8)
    expect(getPolygonAreaAndCentroid(clockwise).centroid).toEqual({ x: 2, y: 1 })
  })

  test('subtracts holes from slab area while keeping the outer centroid', () => {
    const slab = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]
    const hole = [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
      { x: 1, y: 3 },
    ]

    expect(getSlabArea(slab, [hole])).toEqual({ area: 12, centroid: { x: 2, y: 2 } })
  })
})
