import { describe, expect, test } from 'bun:test'
import { FALLBACK_VIEW_SIZE, FLOORPLAN_PADDING } from './constants'
import {
  getFittedFloorplanViewport,
  getFloorplanSvgAspectRatio,
  getFloorplanViewBox,
  getFloorplanWorldUnitsPerPixel,
  panFloorplanViewport,
  zoomFloorplanViewportAtPoint,
} from './viewport'

describe('floorplan viewport helpers', () => {
  test('fits empty content to the fallback view size and aspect ratio', () => {
    expect(getFittedFloorplanViewport([], 2)).toEqual({
      centerX: 0,
      centerY: 0,
      width: FALLBACK_VIEW_SIZE * 2,
    })
  })

  test('fits content with padding and aspect-ratio compensation', () => {
    const viewport = getFittedFloorplanViewport(
      [
        { x: -2, y: -1 },
        { x: 4, y: 3 },
      ],
      2,
    )

    expect(viewport.centerX).toBe(1)
    expect(viewport.centerY).toBe(1)
    expect(viewport.width).toBe(Math.max(FALLBACK_VIEW_SIZE, 6 + FLOORPLAN_PADDING * 2, 8 * 2))
  })

  test('derives the viewBox from viewport center and aspect ratio', () => {
    expect(getFloorplanViewBox({ centerX: 10, centerY: 5, width: 20 }, 2)).toEqual({
      minX: 0,
      minY: 0,
      width: 20,
      height: 10,
    })
  })

  test('averages horizontal and vertical units per pixel', () => {
    expect(
      getFloorplanWorldUnitsPerPixel(
        { minX: 0, minY: 0, width: 20, height: 10 },
        { width: 200, height: 50 },
      ),
    ).toBeCloseTo(0.15)
  })

  test('pans by screen-pixel delta in viewBox units', () => {
    expect(
      panFloorplanViewport(
        { centerX: 10, centerY: 10, width: 20 },
        { minX: 0, minY: 0, width: 20, height: 10 },
        { width: 200, height: 100 },
        { x: 10, y: -20 },
      ),
    ).toEqual({ centerX: 9, centerY: 12, width: 20 })
  })

  test('zooms around the given svg point', () => {
    const next = zoomFloorplanViewportAtPoint({
      currentViewport: { centerX: 10, centerY: 5, width: 20 },
      currentViewBox: { minX: 0, minY: 0, width: 20, height: 10 },
      maxViewportWidth: 40,
      minViewportWidth: 5,
      svgAspectRatio: 2,
      svgPoint: { x: 5, y: 2.5 },
      widthFactor: 0.5,
    })

    expect(next).toEqual({ centerX: 7.5, centerY: 3.75, width: 10 })
  })

  test('clamps zoom and rejects invalid factors', () => {
    expect(
      zoomFloorplanViewportAtPoint({
        currentViewport: { centerX: 0, centerY: 0, width: 20 },
        currentViewBox: { minX: -10, minY: -5, width: 20, height: 10 },
        maxViewportWidth: 30,
        minViewportWidth: 8,
        svgAspectRatio: 2,
        svgPoint: { x: 0, y: 0 },
        widthFactor: 10,
      })?.width,
    ).toBe(30)

    expect(
      zoomFloorplanViewportAtPoint({
        currentViewport: { centerX: 0, centerY: 0, width: 20 },
        currentViewBox: { minX: -10, minY: -5, width: 20, height: 10 },
        maxViewportWidth: 30,
        minViewportWidth: 8,
        svgAspectRatio: 2,
        svgPoint: { x: 0, y: 0 },
        widthFactor: 0,
      }),
    ).toBeNull()
  })

  test('uses a fallback aspect ratio when host height is zero', () => {
    expect(getFloorplanSvgAspectRatio({ width: 800, height: 0 })).toBe(1)
  })
})
