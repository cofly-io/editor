'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PANEL_DEFAULT_HEIGHT, PANEL_DEFAULT_WIDTH, PANEL_MARGIN } from './constants'
import { getViewportBounds, movePanelRect, resizePanelRect } from './panel-layout'
import type { PanelInteractionState, PanelRect, ResizeDirection } from './types'
import { resizeCursorByDirection } from './types'

export function useFloorplanPanelFrame() {
  const containerRef = useRef<HTMLDivElement>(null)
  const panelInteractionRef = useRef<PanelInteractionState | null>(null)
  const [isDraggingPanel, setIsDraggingPanel] = useState(false)
  const [activeResizeDirection, setActiveResizeDirection] = useState<ResizeDirection | null>(null)
  const [panelRect, setPanelRect] = useState<PanelRect>({
    x: PANEL_MARGIN,
    y: PANEL_MARGIN,
    width: PANEL_DEFAULT_WIDTH,
    height: PANEL_DEFAULT_HEIGHT,
  })
  const [isPanelReady, setIsPanelReady] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) {
      return
    }

    const update = () => {
      const rect = el.getBoundingClientRect()
      setPanelRect({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      })
      setIsPanelReady(true)
    }

    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    update()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const finishPanelInteraction = useCallback(() => {
    panelInteractionRef.current = null
    setIsDraggingPanel(false)
    setActiveResizeDirection(null)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const beginPanelInteraction = useCallback((interaction: PanelInteractionState) => {
    panelInteractionRef.current = interaction
    if (interaction.type === 'drag') {
      setIsDraggingPanel(true)
      setActiveResizeDirection(null)
      document.body.style.cursor = 'grabbing'
    } else if (interaction.direction) {
      setIsDraggingPanel(false)
      setActiveResizeDirection(interaction.direction)
      document.body.style.cursor = resizeCursorByDirection[interaction.direction]
    }

    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = panelInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }

      event.preventDefault()

      const dx = event.clientX - interaction.startClientX
      const dy = event.clientY - interaction.startClientY
      const bounds = getViewportBounds()

      const nextRect =
        interaction.type === 'drag'
          ? movePanelRect(interaction.initialRect, dx, dy, bounds)
          : resizePanelRect(interaction.initialRect, interaction.direction ?? 'se', dx, dy, bounds)

      setPanelRect(nextRect)
    }

    const handlePointerUp = (event: PointerEvent) => {
      const interaction = panelInteractionRef.current
      if (!interaction || event.pointerId !== interaction.pointerId) {
        return
      }

      finishPanelInteraction()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [finishPanelInteraction])

  useEffect(() => {
    return () => {
      finishPanelInteraction()
    }
  }, [finishPanelInteraction])

  const handlePanelDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      const target = event.target as HTMLElement | null
      if (target?.closest('[data-floorplan-panel-control="true"]')) {
        return
      }

      event.preventDefault()

      beginPanelInteraction({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialRect: panelRect,
        type: 'drag',
      })
    },
    [beginPanelInteraction, panelRect],
  )

  const handleResizeStart = useCallback(
    (direction: ResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      beginPanelInteraction({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialRect: panelRect,
        type: 'resize',
        direction,
      })
    },
    [beginPanelInteraction, panelRect],
  )

  return {
    activeResizeDirection,
    containerRef,
    handlePanelDragStart,
    handleResizeStart,
    isDraggingPanel,
    isPanelReady,
    panelRect,
  }
}
