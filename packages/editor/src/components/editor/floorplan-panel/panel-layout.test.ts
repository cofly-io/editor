import { describe, expect, test } from 'bun:test'
import { PANEL_MARGIN, PANEL_MIN_HEIGHT, PANEL_MIN_WIDTH } from './constants'
import {
  adaptPanelRectToBounds,
  constrainPanelRect,
  getInitialPanelRect,
  movePanelRect,
  resizePanelRect,
} from './panel-layout'

describe('floorplan panel layout', () => {
  test('keeps the initial panel inside the viewport margins', () => {
    const rect = getInitialPanelRect({ width: 900, height: 700 })

    expect(rect.x).toBeGreaterThanOrEqual(PANEL_MARGIN)
    expect(rect.y).toBeGreaterThanOrEqual(PANEL_MARGIN)
    expect(rect.x + rect.width).toBeLessThanOrEqual(900 - PANEL_MARGIN)
    expect(rect.y + rect.height).toBeLessThanOrEqual(700 - PANEL_MARGIN)
  })

  test('clamps dragged panels to the viewport', () => {
    const rect = movePanelRect({ x: 120, y: 100, width: 420, height: 320 }, -1000, 1000, {
      width: 900,
      height: 700,
    })

    expect(rect.x).toBe(PANEL_MARGIN)
    expect(rect.y + rect.height).toBe(700 - PANEL_MARGIN)
  })

  test('resizes from the north west without moving the opposite corner', () => {
    const initial = { x: 200, y: 180, width: 500, height: 360 }
    const rect = resizePanelRect(initial, 'nw', 80, 40, { width: 1000, height: 800 })

    expect(rect.x + rect.width).toBe(initial.x + initial.width)
    expect(rect.y + rect.height).toBe(initial.y + initial.height)
    expect(rect.width).toBe(420)
    expect(rect.height).toBe(320)
  })

  test('respects minimum size when resizing past the opposite edge', () => {
    const rect = resizePanelRect({ x: 200, y: 180, width: 500, height: 360 }, 'se', -1000, -1000, {
      width: 1000,
      height: 800,
    })

    expect(rect.width).toBe(PANEL_MIN_WIDTH)
    expect(rect.height).toBe(PANEL_MIN_HEIGHT)
  })

  test('preserves relative placement when viewport bounds change', () => {
    const rect = adaptPanelRectToBounds(
      { x: 464, y: 364, width: 420, height: 320 },
      { width: 900, height: 700 },
      { width: 1200, height: 900 },
    )

    expect(rect.x).toBeGreaterThan(464)
    expect(rect.y).toBeGreaterThan(364)
    expect(rect.x + rect.width).toBeLessThanOrEqual(1200 - PANEL_MARGIN)
    expect(rect.y + rect.height).toBeLessThanOrEqual(900 - PANEL_MARGIN)
  })

  test('constrains oversized panels on small viewports', () => {
    const rect = constrainPanelRect(
      { x: -50, y: -50, width: 900, height: 900 },
      { width: 360, height: 300 },
    )

    expect(rect.x).toBe(PANEL_MARGIN)
    expect(rect.y).toBe(PANEL_MARGIN)
    expect(rect.width).toBe(360 - PANEL_MARGIN * 2)
    expect(rect.height).toBe(300 - PANEL_MARGIN * 2)
  })
})
