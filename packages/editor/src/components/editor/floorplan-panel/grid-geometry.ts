import { WALL_GRID_STEP } from '../../tools/wall/wall-drafting'
import { GRID_COORDINATE_PRECISION, MAJOR_GRID_STEP, MIN_GRID_SCREEN_SPACING } from './constants'

export function normalizeGridCoordinate(value: number): number {
  return Number(value.toFixed(GRID_COORDINATE_PRECISION))
}

export function isGridAligned(value: number, step: number): boolean {
  if (!(Number.isFinite(step) && step > 0)) {
    return false
  }

  const normalizedValue = normalizeGridCoordinate(value / step)
  return Math.abs(normalizedValue - Math.round(normalizedValue)) < 1e-4
}

// Keep visible grid spacing above a minimum pixel size so zooming stays evenly distributed.
export function getVisibleGridSteps(
  viewportWidth: number,
  surfaceWidth: number,
): {
  minorStep: number
  majorStep: number
} {
  const pixelsPerUnit = surfaceWidth / Math.max(viewportWidth, Number.EPSILON)
  let minorStep = WALL_GRID_STEP

  while (minorStep * pixelsPerUnit < MIN_GRID_SCREEN_SPACING) {
    minorStep *= 2
  }

  return {
    minorStep,
    majorStep: Math.max(MAJOR_GRID_STEP, minorStep * 2),
  }
}

export function buildGridPath(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  step: number,
  options?: {
    excludeStep?: number
  },
): string {
  if (!(Number.isFinite(step) && step > 0)) {
    return ''
  }

  const commands: string[] = []
  const startXIndex = Math.floor(minX / step)
  const endXIndex = Math.ceil(maxX / step)
  const startYIndex = Math.floor(minY / step)
  const endYIndex = Math.ceil(maxY / step)
  const gridMinX = normalizeGridCoordinate(minX)
  const gridMaxX = normalizeGridCoordinate(maxX)
  const gridMinY = normalizeGridCoordinate(minY)
  const gridMaxY = normalizeGridCoordinate(maxY)

  for (let index = startXIndex; index <= endXIndex; index += 1) {
    const x = index * step
    if (options?.excludeStep && isGridAligned(x, options.excludeStep)) {
      continue
    }

    const gridX = normalizeGridCoordinate(x)
    commands.push(`M ${gridX} ${gridMinY} L ${gridX} ${gridMaxY}`)
  }

  for (let index = startYIndex; index <= endYIndex; index += 1) {
    const y = index * step
    if (options?.excludeStep && isGridAligned(y, options.excludeStep)) {
      continue
    }

    const gridY = normalizeGridCoordinate(y)
    commands.push(`M ${gridMinX} ${gridY} L ${gridMaxX} ${gridY}`)
  }

  return commands.join(' ')
}

export function getRotatedViewBoxBounds(
  viewBox: { minX: number; minY: number; width: number; height: number },
  rotationDegrees: number,
) {
  const radians = (-rotationDegrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const corners = [
    { x: viewBox.minX, y: viewBox.minY },
    { x: viewBox.minX + viewBox.width, y: viewBox.minY },
    { x: viewBox.minX + viewBox.width, y: viewBox.minY + viewBox.height },
    { x: viewBox.minX, y: viewBox.minY + viewBox.height },
  ]

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const corner of corners) {
    const x = corner.x * cos - corner.y * sin
    const y = corner.x * sin + corner.y * cos
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  return { minX, maxX, minY, maxY }
}
