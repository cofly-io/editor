import { FALLBACK_VIEW_SIZE, FLOORPLAN_PADDING } from './constants'
import type { FloorplanViewport, SvgPoint } from './types'

export type FloorplanViewBox = {
  minX: number
  minY: number
  width: number
  height: number
}

export function getFloorplanSvgAspectRatio(surfaceSize: { width: number; height: number }) {
  const aspectRatio = surfaceSize.width / surfaceSize.height
  return Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1
}

export function getFittedFloorplanViewport(points: SvgPoint[], svgAspectRatio: number) {
  if (points.length === 0) {
    return {
      centerX: 0,
      centerY: 0,
      width: Math.max(FALLBACK_VIEW_SIZE, FALLBACK_VIEW_SIZE * svgAspectRatio),
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }

  const rawWidth = maxX - minX
  const rawHeight = maxY - minY
  const paddedWidth = rawWidth + FLOORPLAN_PADDING * 2
  const paddedHeight = rawHeight + FLOORPLAN_PADDING * 2

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: Math.max(FALLBACK_VIEW_SIZE, paddedWidth, paddedHeight * svgAspectRatio),
  }
}

export function getFloorplanViewBox(
  viewport: FloorplanViewport,
  svgAspectRatio: number,
): FloorplanViewBox {
  const width = viewport.width
  const height = width / svgAspectRatio

  return {
    minX: viewport.centerX - width / 2,
    minY: viewport.centerY - height / 2,
    width,
    height,
  }
}

export function getFloorplanWorldUnitsPerPixel(
  viewBox: FloorplanViewBox,
  surfaceSize: { width: number; height: number },
) {
  const widthUnitsPerPixel = viewBox.width / Math.max(surfaceSize.width, 1)
  const heightUnitsPerPixel = viewBox.height / Math.max(surfaceSize.height, 1)

  return (widthUnitsPerPixel + heightUnitsPerPixel) / 2
}

export function panFloorplanViewport(
  viewport: FloorplanViewport,
  viewBox: FloorplanViewBox,
  surfaceSize: { width: number; height: number },
  delta: { x: number; y: number },
) {
  const worldPerPixelX = viewBox.width / surfaceSize.width
  const worldPerPixelY = viewBox.height / surfaceSize.height

  return {
    centerX: viewport.centerX - delta.x * worldPerPixelX,
    centerY: viewport.centerY - delta.y * worldPerPixelY,
    width: viewport.width,
  }
}

export function zoomFloorplanViewportAtPoint({
  currentViewport,
  currentViewBox,
  maxViewportWidth,
  minViewportWidth,
  svgAspectRatio,
  svgPoint,
  widthFactor,
}: {
  currentViewport: FloorplanViewport
  currentViewBox: FloorplanViewBox
  maxViewportWidth: number
  minViewportWidth: number
  svgAspectRatio: number
  svgPoint: SvgPoint
  widthFactor: number
}): FloorplanViewport | null {
  if (!Number.isFinite(widthFactor) || widthFactor <= 0) {
    return null
  }

  const nextWidth = Math.min(
    maxViewportWidth,
    Math.max(minViewportWidth, currentViewport.width * widthFactor),
  )
  const nextHeight = nextWidth / svgAspectRatio
  const normalizedX = (svgPoint.x - currentViewBox.minX) / currentViewBox.width
  const normalizedY = (svgPoint.y - currentViewBox.minY) / currentViewBox.height
  const nextMinX = svgPoint.x - normalizedX * nextWidth
  const nextMinY = svgPoint.y - normalizedY * nextHeight

  return {
    centerX: nextMinX + nextWidth / 2,
    centerY: nextMinY + nextHeight / 2,
    width: nextWidth,
  }
}
