import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_CAMERA_MAX_DISTANCE,
  DEFAULT_CAMERA_MIN_DISTANCE,
  DEFAULT_ORTHOGRAPHIC_ZOOM,
  getCameraZoomLimits,
  ORTHOGRAPHIC_ZOOM_IN_RATIO,
  ORTHOGRAPHIC_ZOOM_OUT_RATIO,
  PERSPECTIVE_ZOOM_OUT_RATIO,
  REFERENCE_DESIGN_EXTENT,
} from './camera-zoom-limits'
import type { SceneBoundsXZ } from './scene-bounds'

function boundsWithExtent(extent: number): SceneBoundsXZ {
  return {
    center: [0, 0],
    max: [extent / 2, extent / 2],
    min: [-extent / 2, -extent / 2],
    size: [extent, extent],
  }
}

describe('camera zoom limits', () => {
  test('uses the design-size defaults without scene bounds', () => {
    expect(getCameraZoomLimits(null)).toEqual({
      maxDistance: REFERENCE_DESIGN_EXTENT * PERSPECTIVE_ZOOM_OUT_RATIO,
      maxZoom: DEFAULT_ORTHOGRAPHIC_ZOOM * ORTHOGRAPHIC_ZOOM_IN_RATIO,
      minDistance: DEFAULT_CAMERA_MIN_DISTANCE,
      minZoom: DEFAULT_ORTHOGRAPHIC_ZOOM * ORTHOGRAPHIC_ZOOM_OUT_RATIO,
    })
  })

  test('limits zoom-out range for designs larger than the reference size', () => {
    const limits = getCameraZoomLimits(boundsWithExtent(REFERENCE_DESIGN_EXTENT * 10))

    expect(limits.maxDistance).toBe(REFERENCE_DESIGN_EXTENT * 10 * PERSPECTIVE_ZOOM_OUT_RATIO)
    expect(limits.minZoom).toBeCloseTo(0.7)
    expect(limits.maxZoom).toBe(DEFAULT_ORTHOGRAPHIC_ZOOM * ORTHOGRAPHIC_ZOOM_IN_RATIO)
  })

  test('keeps small designs from zooming out beyond the reference design size', () => {
    const limits = getCameraZoomLimits(boundsWithExtent(REFERENCE_DESIGN_EXTENT / 10))

    expect(limits.maxDistance).toBe(DEFAULT_CAMERA_MAX_DISTANCE)
    expect(limits.minZoom).toBe(DEFAULT_ORTHOGRAPHIC_ZOOM)
    expect(limits.maxZoom).toBe(DEFAULT_ORTHOGRAPHIC_ZOOM * 10 * ORTHOGRAPHIC_ZOOM_IN_RATIO)
  })
})
