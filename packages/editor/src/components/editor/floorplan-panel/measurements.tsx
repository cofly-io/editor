import type { Point2D } from '@pascal-app/core'
import type { ReferenceScaleUnit } from './types'

export function formatMeasurement(
  value: number,
  unit: 'metric' | 'imperial',
  metersPerUnit: number | null = null,
) {
  const measuredValue = metersPerUnit && metersPerUnit > 0 ? value * metersPerUnit : value
  if (unit === 'imperial') {
    const feet = measuredValue * 3.280_84
    const wholeFeet = Math.floor(feet)
    const inches = Math.round((feet - wholeFeet) * 12)
    if (inches === 12) return `${wholeFeet + 1}'0"`
    return `${wholeFeet}'${inches}"`
  }
  return `${Number.parseFloat(measuredValue.toFixed(2))}m`
}

export function formatNumber(value: number, fractionDigits = 2) {
  return Number.parseFloat(value.toFixed(fractionDigits)).toString()
}

export function convertReferenceLengthToMeters(value: number, unit: ReferenceScaleUnit) {
  switch (unit) {
    case 'centimeters':
      return value / 100
    case 'feet':
      return value * 0.3048
    case 'inches':
      return value * 0.0254
    default:
      return value
  }
}

export function getReferenceScaleUnitLabel(unit: ReferenceScaleUnit) {
  switch (unit) {
    case 'centimeters':
      return 'cm'
    case 'feet':
      return 'ft'
    case 'inches':
      return 'in'
    default:
      return 'm'
  }
}

export function formatReferenceScaleLabel(value: number, unit: ReferenceScaleUnit) {
  return `${formatNumber(value)} ${getReferenceScaleUnitLabel(unit)}`
}

export function getPolygonAreaAndCentroid(polygon: Point2D[]) {
  let cx = 0
  let cy = 0
  let area = 0

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const p1 = polygon[j]!
    const p2 = polygon[i]!
    const f = p1.x * p2.y - p2.x * p1.y
    cx += (p1.x + p2.x) * f
    cy += (p1.y + p2.y) * f
    area += f
  }

  area /= 2

  if (Math.abs(area) < 1e-9) {
    return { area: 0, centroid: polygon[0] ?? { x: 0, y: 0 } }
  }

  cx /= 6 * area
  cy /= 6 * area

  return { area: Math.abs(area), centroid: { x: cx, y: cy } }
}

export function getSlabArea(polygon: Point2D[], holes: Point2D[][]) {
  const outer = getPolygonAreaAndCentroid(polygon)
  let totalArea = outer.area
  for (const hole of holes) {
    totalArea -= getPolygonAreaAndCentroid(hole).area
  }
  return { area: Math.max(0, totalArea), centroid: outer.centroid }
}

export function formatArea(
  areaSqM: number,
  unit: 'metric' | 'imperial',
  metersPerUnit: number | null = null,
) {
  const scaledAreaSqM =
    metersPerUnit && metersPerUnit > 0 ? areaSqM * metersPerUnit * metersPerUnit : areaSqM

  if (unit === 'imperial') {
    const areaSqFt = scaledAreaSqM * 10.763_910_4
    return (
      <>
        {Math.round(areaSqFt).toLocaleString()}
        <tspan dx="0.12em">ft</tspan>
        <tspan baselineShift="super" fontSize="0.75em">
          2
        </tspan>
      </>
    )
  }
  return (
    <>
      {Number.parseFloat(scaledAreaSqM.toFixed(1))}
      <tspan dx="0.12em">m</tspan>
      <tspan baselineShift="super" fontSize="0.75em">
        2
      </tspan>
    </>
  )
}
