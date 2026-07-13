import type { SceneBoundsXZ } from './scene-bounds'

export const DEFAULT_CAMERA_MIN_DISTANCE = 0.04
export const DEFAULT_ORTHOGRAPHIC_ZOOM = 20
export const REFERENCE_DESIGN_EXTENT = 30
export const DEFAULT_CAMERA_MAX_DISTANCE = REFERENCE_DESIGN_EXTENT * 2.5
export const PERSPECTIVE_ZOOM_OUT_RATIO = 2.5
export const ORTHOGRAPHIC_ZOOM_OUT_RATIO = 0.35
export const ORTHOGRAPHIC_ZOOM_IN_RATIO = 250

export type CameraZoomLimits = {
  maxDistance: number
  maxZoom: number
  minDistance: number
  minZoom: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getBoundsExtent(bounds: SceneBoundsXZ | null | undefined) {
  if (!bounds) {
    return REFERENCE_DESIGN_EXTENT
  }

  const extent = Math.max(bounds.size[0], bounds.size[1])
  return Number.isFinite(extent) && extent > 0 ? extent : REFERENCE_DESIGN_EXTENT
}

export function getCameraZoomLimits(bounds: SceneBoundsXZ | null | undefined): CameraZoomLimits {
  const extent = getBoundsExtent(bounds)
  const referenceZoom = (DEFAULT_ORTHOGRAPHIC_ZOOM * REFERENCE_DESIGN_EXTENT) / extent

  return {
    maxDistance: Math.max(DEFAULT_CAMERA_MAX_DISTANCE, extent * PERSPECTIVE_ZOOM_OUT_RATIO),
    maxZoom: Math.max(
      DEFAULT_ORTHOGRAPHIC_ZOOM * ORTHOGRAPHIC_ZOOM_IN_RATIO,
      referenceZoom * ORTHOGRAPHIC_ZOOM_IN_RATIO,
    ),
    minDistance: DEFAULT_CAMERA_MIN_DISTANCE,
    minZoom: clamp(referenceZoom * ORTHOGRAPHIC_ZOOM_OUT_RATIO, 0.05, DEFAULT_ORTHOGRAPHIC_ZOOM),
  }
}
