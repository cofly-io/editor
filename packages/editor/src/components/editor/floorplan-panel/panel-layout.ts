import {
  FLOORPLAN_PANEL_LAYOUT_STORAGE_KEY,
  PANEL_DEFAULT_BOTTOM_OFFSET,
  PANEL_DEFAULT_HEIGHT,
  PANEL_DEFAULT_WIDTH,
  PANEL_MARGIN,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
} from './constants'
import type { PanelRect, PersistedPanelLayout, ResizeDirection, ViewportBounds } from './types'

function clampPanelValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function getViewportBounds(): ViewportBounds {
  if (typeof window === 'undefined') {
    return {
      width: PANEL_DEFAULT_WIDTH + PANEL_MARGIN * 2,
      height: PANEL_DEFAULT_HEIGHT + PANEL_MARGIN * 2,
    }
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

export function getPanelSizeLimits(bounds: ViewportBounds) {
  const maxWidth = Math.max(1, bounds.width - PANEL_MARGIN * 2)
  const maxHeight = Math.max(1, bounds.height - PANEL_MARGIN * 2)

  return {
    maxHeight,
    maxWidth,
    minHeight: Math.min(PANEL_MIN_HEIGHT, maxHeight),
    minWidth: Math.min(PANEL_MIN_WIDTH, maxWidth),
  }
}

export function constrainPanelRect(rect: PanelRect, bounds: ViewportBounds): PanelRect {
  const { minWidth, maxWidth, minHeight, maxHeight } = getPanelSizeLimits(bounds)
  const width = clampPanelValue(rect.width, minWidth, maxWidth)
  const height = clampPanelValue(rect.height, minHeight, maxHeight)
  const x = clampPanelValue(
    rect.x,
    PANEL_MARGIN,
    Math.max(PANEL_MARGIN, bounds.width - PANEL_MARGIN - width),
  )
  const y = clampPanelValue(
    rect.y,
    PANEL_MARGIN,
    Math.max(PANEL_MARGIN, bounds.height - PANEL_MARGIN - height),
  )

  return { x, y, width, height }
}

export function getPanelPositionRatios(rect: PanelRect, bounds: ViewportBounds) {
  const availableX = Math.max(bounds.width - rect.width - PANEL_MARGIN * 2, 0)
  const availableY = Math.max(bounds.height - rect.height - PANEL_MARGIN * 2, 0)

  return {
    xRatio: availableX > 0 ? (rect.x - PANEL_MARGIN) / availableX : 0.5,
    yRatio: availableY > 0 ? (rect.y - PANEL_MARGIN) / availableY : 0.5,
  }
}

export function adaptPanelRectToBounds(
  rect: PanelRect,
  previousBounds: ViewportBounds,
  nextBounds: ViewportBounds,
): PanelRect {
  const normalizedRect = constrainPanelRect(rect, previousBounds)
  const { xRatio, yRatio } = getPanelPositionRatios(normalizedRect, previousBounds)
  const { minWidth, maxWidth, minHeight, maxHeight } = getPanelSizeLimits(nextBounds)
  const width = clampPanelValue(normalizedRect.width, minWidth, maxWidth)
  const height = clampPanelValue(normalizedRect.height, minHeight, maxHeight)
  const availableX = Math.max(nextBounds.width - width - PANEL_MARGIN * 2, 0)
  const availableY = Math.max(nextBounds.height - height - PANEL_MARGIN * 2, 0)

  return constrainPanelRect(
    {
      x: PANEL_MARGIN + availableX * xRatio,
      y: PANEL_MARGIN + availableY * yRatio,
      width,
      height,
    },
    nextBounds,
  )
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isValidPanelRect(value: unknown): value is PanelRect {
  return (
    typeof value === 'object' &&
    value !== null &&
    isFiniteNumber((value as PanelRect).x) &&
    isFiniteNumber((value as PanelRect).y) &&
    isFiniteNumber((value as PanelRect).width) &&
    isFiniteNumber((value as PanelRect).height)
  )
}

export function isValidViewportBounds(value: unknown): value is ViewportBounds {
  return (
    typeof value === 'object' &&
    value !== null &&
    isFiniteNumber((value as ViewportBounds).width) &&
    isFiniteNumber((value as ViewportBounds).height)
  )
}

export function readPersistedPanelLayout(currentBounds: ViewportBounds): PanelRect | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawLayout = window.localStorage.getItem(FLOORPLAN_PANEL_LAYOUT_STORAGE_KEY)
    if (!rawLayout) {
      return null
    }

    const parsedLayout = JSON.parse(rawLayout) as Partial<PersistedPanelLayout>
    if (!(isValidPanelRect(parsedLayout.rect) && isValidViewportBounds(parsedLayout.viewport))) {
      return null
    }

    return adaptPanelRectToBounds(parsedLayout.rect, parsedLayout.viewport, currentBounds)
  } catch {
    return null
  }
}

export function writePersistedPanelLayout(layout: PersistedPanelLayout) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(FLOORPLAN_PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
}

export function getInitialPanelRect(bounds: ViewportBounds): PanelRect {
  return constrainPanelRect(
    {
      x: bounds.width - PANEL_DEFAULT_WIDTH - PANEL_MARGIN,
      y: bounds.height - PANEL_DEFAULT_HEIGHT - PANEL_DEFAULT_BOTTOM_OFFSET,
      width: PANEL_DEFAULT_WIDTH,
      height: PANEL_DEFAULT_HEIGHT,
    },
    bounds,
  )
}

export function movePanelRect(
  initialRect: PanelRect,
  dx: number,
  dy: number,
  bounds: ViewportBounds,
): PanelRect {
  return constrainPanelRect(
    {
      ...initialRect,
      x: initialRect.x + dx,
      y: initialRect.y + dy,
    },
    bounds,
  )
}

export function resizePanelRect(
  initialRect: PanelRect,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  bounds: ViewportBounds,
): PanelRect {
  const right = initialRect.x + initialRect.width
  const bottom = initialRect.y + initialRect.height

  let x = initialRect.x
  let y = initialRect.y
  let width = initialRect.width
  let height = initialRect.height

  if (direction.includes('e')) width = initialRect.width + dx
  if (direction.includes('s')) height = initialRect.height + dy
  if (direction.includes('w')) width = initialRect.width - dx
  if (direction.includes('n')) height = initialRect.height - dy

  const maxWidth = Math.max(PANEL_MIN_WIDTH, bounds.width - PANEL_MARGIN * 2)
  const maxHeight = Math.max(PANEL_MIN_HEIGHT, bounds.height - PANEL_MARGIN * 2)
  width = clampPanelValue(width, PANEL_MIN_WIDTH, maxWidth)
  height = clampPanelValue(height, PANEL_MIN_HEIGHT, maxHeight)

  if (direction.includes('w')) {
    x = right - width
  }
  if (direction.includes('n')) {
    y = bottom - height
  }

  x = clampPanelValue(x, PANEL_MARGIN, Math.max(PANEL_MARGIN, bounds.width - PANEL_MARGIN - width))
  y = clampPanelValue(
    y,
    PANEL_MARGIN,
    Math.max(PANEL_MARGIN, bounds.height - PANEL_MARGIN - height),
  )

  if (direction.includes('w')) {
    width = right - x
  } else {
    width = Math.min(width, bounds.width - PANEL_MARGIN - x)
  }

  if (direction.includes('n')) {
    height = bottom - y
  } else {
    height = Math.min(height, bounds.height - PANEL_MARGIN - y)
  }

  return constrainPanelRect({ x, y, width, height }, bounds)
}
