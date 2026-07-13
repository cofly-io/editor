import type { ColumnNode, Point2D } from '@pascal-app/core'
import { rotatePlanVector } from './polygon-geometry'

export function getRotatedRectanglePolygon(
  center: Point2D,
  width: number,
  depth: number,
  rotation: number,
): Point2D[] {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const corners: Array<[number, number]> = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ]

  return corners.map(([localX, localY]) => {
    const [offsetX, offsetY] = rotatePlanVector(localX, localY, rotation)
    return {
      x: center.x + offsetX,
      y: center.y + offsetY,
    }
  })
}

export function getColumnPlanFootprint(column: ColumnNode): Point2D[] {
  const center = { x: column.position[0], y: column.position[2] }

  if (
    column.supportStyle === 'a-frame' ||
    column.supportStyle === 'y-frame' ||
    column.supportStyle === 'v-frame' ||
    column.supportStyle === 'x-brace' ||
    column.supportStyle === 'k-brace' ||
    column.supportStyle === 'single-strut' ||
    column.supportStyle === 'tripod' ||
    column.supportStyle === 'trestle' ||
    column.supportStyle === 'portal-frame' ||
    column.supportStyle === 'box-frame' ||
    column.supportStyle === 'pipe-saddle'
  ) {
    const width = Math.max(
      column.supportStyle === 'a-frame' ||
        column.supportStyle === 'x-brace' ||
        column.supportStyle === 'k-brace' ||
        column.supportStyle === 'single-strut' ||
        column.supportStyle === 'tripod' ||
        column.supportStyle === 'trestle' ||
        column.supportStyle === 'portal-frame' ||
        column.supportStyle === 'box-frame' ||
        column.supportStyle === 'pipe-saddle'
        ? (column.braceBottomSpread ?? 1.2)
        : 0,
      column.braceTopSpread ??
        (column.supportStyle === 'y-frame' ||
        column.supportStyle === 'v-frame' ||
        column.supportStyle === 'x-brace' ||
        column.supportStyle === 'k-brace' ||
        column.supportStyle === 'single-strut' ||
        column.supportStyle === 'tripod' ||
        column.supportStyle === 'trestle' ||
        column.supportStyle === 'portal-frame' ||
        column.supportStyle === 'box-frame' ||
        column.supportStyle === 'pipe-saddle'
          ? 1
          : 0),
      (column.braceWidth ?? column.width) * 2,
    )
    const depth = Math.max(
      column.supportStyle === 'tripod' ||
        column.supportStyle === 'trestle' ||
        column.supportStyle === 'box-frame' ||
        column.supportStyle === 'pipe-saddle'
        ? (column.braceTopSpread ?? 1)
        : 0,
      column.braceDepth ?? column.depth,
      0.08,
    )
    return getRotatedRectanglePolygon(center, width, depth, column.rotation)
  }

  const shaftWidth =
    column.crossSection === 'round' ||
    column.crossSection === 'octagonal' ||
    column.crossSection === 'sixteen-sided'
      ? column.radius * 2
      : column.width
  const shaftDepth =
    column.crossSection === 'round' ||
    column.crossSection === 'octagonal' ||
    column.crossSection === 'sixteen-sided'
      ? column.radius * 2
      : column.depth
  const width = Math.max(
    shaftWidth,
    column.width * column.baseWidthScale,
    column.width * column.capitalWidthScale,
  )
  const depth = Math.max(
    shaftDepth,
    column.depth * column.baseDepthScale,
    column.depth * column.capitalDepthScale,
  )

  if (column.crossSection === 'square' || column.crossSection === 'rectangular') {
    return getRotatedRectanglePolygon(center, width, depth, column.rotation)
  }

  const segmentCount =
    column.crossSection === 'octagonal' ? 8 : column.crossSection === 'sixteen-sided' ? 16 : 32

  return Array.from({ length: segmentCount }, (_, index) => {
    const angle = (index / segmentCount) * Math.PI * 2
    const localX = Math.cos(angle) * (width / 2)
    const localY = Math.sin(angle) * (depth / 2)
    const [offsetX, offsetY] = rotatePlanVector(localX, localY, column.rotation)

    return {
      x: center.x + offsetX,
      y: center.y + offsetY,
    }
  })
}
