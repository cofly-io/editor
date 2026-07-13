'use client'

import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import { FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX } from './constants'
import {
  getFloorplanSelectionBounds,
  getSelectionModifierKeys,
  pointsEqual,
  toSvgSelectionBounds,
} from './geometry'
import type { FloorplanMarqueeState, SvgPoint } from './types'

type SelectionModifierKeys = { meta: boolean; ctrl: boolean }

export function useFloorplanMarqueeInteraction({
  addFloorplanSelection,
  commitFloorplanSelection,
  getFloorplanHitIdAtPoint,
  getFloorplanSelectionIdsInBounds,
  getPlanPointFromClientPoint,
  getSnappedFloorplanPoint,
  isMarqueeSelectionToolActive,
  mode,
  setCursorPoint,
  setFloorplanCursorPosition,
  svgRef,
  syncPreviewSelectedIds,
  toggleFloorplanSelection,
}: {
  addFloorplanSelection: (nextSelectedIds: string[], modifierKeys?: SelectionModifierKeys) => void
  commitFloorplanSelection: (nextSelectedIds: string[]) => void
  getFloorplanHitIdAtPoint: (point: WallPlanPoint) => string | null
  getFloorplanSelectionIdsInBounds: (
    bounds: ReturnType<typeof getFloorplanSelectionBounds>,
  ) => string[]
  getPlanPointFromClientPoint: (clientX: number, clientY: number) => WallPlanPoint | null
  getSnappedFloorplanPoint: (point: WallPlanPoint) => WallPlanPoint
  isMarqueeSelectionToolActive: boolean
  mode: string
  setCursorPoint: (point: WallPlanPoint | null) => void
  setFloorplanCursorPosition: (position: SvgPoint | null) => void
  svgRef: RefObject<SVGSVGElement | null>
  syncPreviewSelectedIds: (nextSelectedIds: string[]) => void
  toggleFloorplanSelection: (nodeId: string, modifierKeys?: SelectionModifierKeys) => void
}) {
  const floorplanMarqueeSnapPointRef = useRef<WallPlanPoint | null>(null)
  const [floorplanMarqueeState, setFloorplanMarqueeState] = useState<FloorplanMarqueeState | null>(
    null,
  )

  const activeMarqueeBounds = useMemo(() => {
    if (!floorplanMarqueeState) {
      return null
    }

    return getFloorplanSelectionBounds(
      floorplanMarqueeState.startPlanPoint,
      floorplanMarqueeState.currentPlanPoint,
    )
  }, [floorplanMarqueeState])

  const visibleMarqueeBounds = useMemo(() => {
    if (!(floorplanMarqueeState && activeMarqueeBounds)) {
      return null
    }

    const dragDistance = Math.hypot(
      floorplanMarqueeState.currentPlanPoint[0] - floorplanMarqueeState.startPlanPoint[0],
      floorplanMarqueeState.currentPlanPoint[1] - floorplanMarqueeState.startPlanPoint[1],
    )

    return dragDistance > 0 ? activeMarqueeBounds : null
  }, [activeMarqueeBounds, floorplanMarqueeState])

  const visibleSvgMarqueeBounds = useMemo(() => {
    if (!visibleMarqueeBounds) {
      return null
    }

    return toSvgSelectionBounds(visibleMarqueeBounds)
  }, [visibleMarqueeBounds])

  const handleMarqueePointerDown = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      if (event.button !== 0) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }
      const snappedPoint = getSnappedFloorplanPoint(planPoint)

      event.preventDefault()
      event.stopPropagation()
      const rect = svgRef.current?.getBoundingClientRect()
      if (rect) {
        setFloorplanCursorPosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      }
      setCursorPoint(snappedPoint)
      floorplanMarqueeSnapPointRef.current = snappedPoint
      syncPreviewSelectedIds([])
      setFloorplanMarqueeState({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPlanPoint: snappedPoint,
        currentPlanPoint: snappedPoint,
      })

      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [
      getPlanPointFromClientPoint,
      getSnappedFloorplanPoint,
      setCursorPoint,
      setFloorplanCursorPosition,
      svgRef,
      syncPreviewSelectedIds,
    ],
  )

  const handleMarqueePointerMove = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (rect) {
        setFloorplanCursorPosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      }

      if (floorplanMarqueeState?.pointerId !== event.pointerId) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }
      const snappedPoint = getSnappedFloorplanPoint(planPoint)

      event.preventDefault()
      event.stopPropagation()
      setCursorPoint(snappedPoint)

      const dragDistance = Math.hypot(
        event.clientX - floorplanMarqueeState.startClientX,
        event.clientY - floorplanMarqueeState.startClientY,
      )

      if (
        dragDistance >= FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX &&
        floorplanMarqueeSnapPointRef.current &&
        !pointsEqual(floorplanMarqueeSnapPointRef.current, snappedPoint)
      ) {
        sfxEmitter.emit('sfx:grid-snap')
      }
      floorplanMarqueeSnapPointRef.current = snappedPoint

      if (dragDistance >= FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX) {
        const bounds = getFloorplanSelectionBounds(
          floorplanMarqueeState.startPlanPoint,
          snappedPoint,
        )
        syncPreviewSelectedIds(getFloorplanSelectionIdsInBounds(bounds))
      } else {
        syncPreviewSelectedIds([])
      }

      setFloorplanMarqueeState((currentState) => {
        if (!currentState || currentState.pointerId !== event.pointerId) {
          return currentState
        }

        return {
          ...currentState,
          currentPlanPoint: snappedPoint,
        }
      })
    },
    [
      floorplanMarqueeState,
      getFloorplanSelectionIdsInBounds,
      getPlanPointFromClientPoint,
      getSnappedFloorplanPoint,
      setCursorPoint,
      setFloorplanCursorPosition,
      svgRef,
      syncPreviewSelectedIds,
    ],
  )

  const handleMarqueePointerUp = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      const marqueeState = floorplanMarqueeState
      if (!marqueeState || marqueeState.pointerId !== event.pointerId) {
        return
      }

      const rawEndPlanPoint =
        getPlanPointFromClientPoint(event.clientX, event.clientY) ?? marqueeState.currentPlanPoint
      const endPlanPoint = getSnappedFloorplanPoint(rawEndPlanPoint)
      const modifierKeys = getSelectionModifierKeys(event)
      const dragDistance = Math.hypot(
        event.clientX - marqueeState.startClientX,
        event.clientY - marqueeState.startClientY,
      )

      event.preventDefault()
      event.stopPropagation()

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      if (dragDistance >= FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX) {
        const bounds = getFloorplanSelectionBounds(marqueeState.startPlanPoint, endPlanPoint)
        const nextSelectedIds = getFloorplanSelectionIdsInBounds(bounds)
        addFloorplanSelection(nextSelectedIds, modifierKeys)
      } else {
        const hitId = getFloorplanHitIdAtPoint(rawEndPlanPoint)

        if (hitId) {
          toggleFloorplanSelection(hitId, modifierKeys)
        } else if (!(modifierKeys.meta || modifierKeys.ctrl)) {
          commitFloorplanSelection([])
        }
      }

      syncPreviewSelectedIds([])
      setFloorplanMarqueeState(null)
      floorplanMarqueeSnapPointRef.current = null
    },
    [
      addFloorplanSelection,
      commitFloorplanSelection,
      floorplanMarqueeState,
      getFloorplanHitIdAtPoint,
      getFloorplanSelectionIdsInBounds,
      getPlanPointFromClientPoint,
      getSnappedFloorplanPoint,
      syncPreviewSelectedIds,
      toggleFloorplanSelection,
    ],
  )

  const handleMarqueePointerCancel = useCallback(
    (event: ReactPointerEvent<SVGRectElement>) => {
      if (floorplanMarqueeState?.pointerId !== event.pointerId) {
        return
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      setFloorplanMarqueeState(null)
      setFloorplanCursorPosition(null)
      floorplanMarqueeSnapPointRef.current = null
      syncPreviewSelectedIds([])
      setCursorPoint(null)
    },
    [
      floorplanMarqueeState?.pointerId,
      setCursorPoint,
      setFloorplanCursorPosition,
      syncPreviewSelectedIds,
    ],
  )

  useEffect(() => {
    if (!isMarqueeSelectionToolActive) {
      setFloorplanMarqueeState(null)
      floorplanMarqueeSnapPointRef.current = null
      syncPreviewSelectedIds([])
      if (mode === 'select') {
        setCursorPoint(null)
      }
      return
    }

    setFloorplanCursorPosition(null)
  }, [
    isMarqueeSelectionToolActive,
    mode,
    setCursorPoint,
    setFloorplanCursorPosition,
    syncPreviewSelectedIds,
  ])

  return {
    handleMarqueePointerCancel,
    handleMarqueePointerDown,
    handleMarqueePointerMove,
    handleMarqueePointerUp,
    visibleSvgMarqueeBounds,
  }
}
