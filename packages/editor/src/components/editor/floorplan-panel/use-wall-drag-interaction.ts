'use client'

import type { AnyNodeId, WallNode } from '@pascal-app/core'
import { getWallChordFrame, normalizeWallCurveOffset, useScene } from '@pascal-app/core'
import { useCallback, useRef, useState } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { snapToHalf } from '../../tools/item/placement-math'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import { isWallLongEnough, snapWallDraftPoint } from '../../tools/wall/wall-drafting'
import {
  buildWallEndpointDraft,
  getLinkedWallUpdates,
  getWallEndpointDraftUpdates,
  pointsEqual,
} from './geometry'
import type {
  WallCurveDraft,
  WallCurveDragState,
  WallEndpointDraft,
  WallEndpointDragState,
} from './types'

export function useWallDragInteraction() {
  const wallEndpointDragRef = useRef<WallEndpointDragState | null>(null)
  const wallCurveDragRef = useRef<WallCurveDragState | null>(null)
  const [wallEndpointDraft, setWallEndpointDraft] = useState<WallEndpointDraft | null>(null)
  const [wallCurveDraft, setWallCurveDraft] = useState<WallCurveDraft | null>(null)

  const hasWallEndpointDrag = useCallback(() => wallEndpointDragRef.current !== null, [])

  const isWallEndpointDragPointer = useCallback(
    (pointerId: number) => wallEndpointDragRef.current?.pointerId === pointerId,
    [],
  )

  const clearWallEndpointDrag = useCallback(() => {
    wallEndpointDragRef.current = null
    setWallEndpointDraft(null)
  }, [])

  const clearWallCurveDrag = useCallback(() => {
    wallCurveDragRef.current = null
    setWallCurveDraft(null)
  }, [])

  const updateWallEndpointDrag = useCallback(
    ({
      event,
      getPlanPointFromClientPoint,
      onCursorPointChange,
      shiftPressed,
      walls,
    }: {
      event: PointerEvent
      getPlanPointFromClientPoint: (clientX: number, clientY: number) => WallPlanPoint | null
      onCursorPointChange: (point: WallPlanPoint) => void
      shiftPressed: boolean
      walls: WallNode[]
    }) => {
      const dragState = wallEndpointDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return false
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return true
      }

      const snappedPoint = snapWallDraftPoint({
        point: planPoint,
        walls,
        start: dragState.fixedPoint,
        angleSnap: !shiftPressed,
        ignoreWallIds: [dragState.wallId],
      })

      if (pointsEqual(dragState.currentPoint, snappedPoint)) {
        return true
      }

      dragState.currentPoint = snappedPoint
      onCursorPointChange(snappedPoint)
      setWallEndpointDraft((previousDraft) => {
        const primaryDraft = buildWallEndpointDraft(
          dragState.wallId,
          dragState.endpoint,
          dragState.fixedPoint,
          snappedPoint,
        )
        const linkedWallUpdates = getLinkedWallUpdates(
          dragState.linkedWalls,
          dragState.originalStart,
          dragState.originalEnd,
          primaryDraft.start,
          primaryDraft.end,
        )
        const nextDraft = buildWallEndpointDraft(
          dragState.wallId,
          dragState.endpoint,
          dragState.fixedPoint,
          snappedPoint,
          linkedWallUpdates,
        )

        if (
          !(
            previousDraft &&
            pointsEqual(previousDraft.start, nextDraft.start) &&
            pointsEqual(previousDraft.end, nextDraft.end)
          )
        ) {
          sfxEmitter.emit('sfx:grid-snap')
        }

        return nextDraft
      })

      return true
    },
    [],
  )

  const updateWallCurveDrag = useCallback(
    ({
      event,
      getPlanPointFromClientPoint,
      onCursorPointChange,
      shiftPressed,
      wallById,
    }: {
      event: PointerEvent
      getPlanPointFromClientPoint: (clientX: number, clientY: number) => WallPlanPoint | null
      onCursorPointChange: (point: WallPlanPoint) => void
      shiftPressed: boolean
      wallById: Map<WallNode['id'], WallNode>
    }) => {
      const dragState = wallCurveDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return false
      }

      event.preventDefault()

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      const wall = wallById.get(dragState.wallId)
      if (!(planPoint && wall)) {
        return true
      }

      const chord = getWallChordFrame(wall)
      const snappedPoint: WallPlanPoint = shiftPressed
        ? planPoint
        : [snapToHalf(planPoint[0]), snapToHalf(planPoint[1])]
      const rawCurveOffset = -(
        (snappedPoint[0] - chord.midpoint.x) * chord.normal.x +
        (snappedPoint[1] - chord.midpoint.y) * chord.normal.y
      )
      const nextCurveOffset = normalizeWallCurveOffset(
        wall,
        shiftPressed ? rawCurveOffset : snapToHalf(rawCurveOffset),
      )

      if (dragState.currentCurveOffset === nextCurveOffset) {
        return true
      }

      dragState.currentCurveOffset = nextCurveOffset
      setWallCurveDraft({ wallId: wall.id, curveOffset: nextCurveOffset })
      onCursorPointChange(snappedPoint)
      sfxEmitter.emit('sfx:grid-snap')
      return true
    },
    [],
  )

  const commitWallEndpointDrag = useCallback(
    ({
      event,
      onDone,
      wallById,
    }: {
      event: PointerEvent
      onDone: () => void
      wallById: Map<WallNode['id'], WallNode>
    }) => {
      const dragState = wallEndpointDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return false
      }

      const wall = wallById.get(dragState.wallId)
      if (wall) {
        const primaryDraft = buildWallEndpointDraft(
          dragState.wallId,
          dragState.endpoint,
          dragState.fixedPoint,
          dragState.currentPoint,
        )
        const nextDraft = buildWallEndpointDraft(
          dragState.wallId,
          dragState.endpoint,
          dragState.fixedPoint,
          dragState.currentPoint,
          getLinkedWallUpdates(
            dragState.linkedWalls,
            dragState.originalStart,
            dragState.originalEnd,
            primaryDraft.start,
            primaryDraft.end,
          ),
        )
        const commitUpdates = getWallEndpointDraftUpdates(nextDraft).filter((update) => {
          const currentWall = wallById.get(update.id)
          return (
            currentWall &&
            !(
              pointsEqual(update.start, currentWall.start) &&
              pointsEqual(update.end, currentWall.end)
            )
          )
        })

        if (commitUpdates.length > 0 && isWallLongEnough(nextDraft.start, nextDraft.end)) {
          useScene.getState().updateNodes(
            commitUpdates.map((update) => ({
              id: update.id as AnyNodeId,
              data: {
                start: update.start,
                end: update.end,
              },
            })),
          )
          sfxEmitter.emit('sfx:structure-build')
        }
      }

      clearWallEndpointDrag()
      onDone()
      return true
    },
    [clearWallEndpointDrag],
  )

  const commitWallCurveDrag = useCallback(
    ({
      event,
      onDone,
      updateWallNode,
      wallById,
    }: {
      event: PointerEvent
      onDone: () => void
      updateWallNode: (wallId: WallNode['id'], updates: Partial<WallNode>) => void
      wallById: Map<WallNode['id'], WallNode>
    }) => {
      const dragState = wallCurveDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return false
      }

      const wall = wallById.get(dragState.wallId)
      if (wall) {
        const nextCurveOffset = normalizeWallCurveOffset(wall, dragState.currentCurveOffset)
        const currentCurveOffset = normalizeWallCurveOffset(wall, wall.curveOffset ?? 0)
        if (nextCurveOffset !== currentCurveOffset) {
          updateWallNode(wall.id, { curveOffset: nextCurveOffset })
          sfxEmitter.emit('sfx:structure-build')
        }
      }

      clearWallCurveDrag()
      onDone()
      return true
    },
    [clearWallCurveDrag],
  )

  const cancelWallEndpointDrag = useCallback(
    (event: PointerEvent, onDone: () => void) => {
      const dragState = wallEndpointDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return false
      }

      clearWallEndpointDrag()
      onDone()
      return true
    },
    [clearWallEndpointDrag],
  )

  const cancelWallCurveDrag = useCallback(
    (event: PointerEvent, onDone: () => void) => {
      const dragState = wallCurveDragRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return false
      }

      clearWallCurveDrag()
      onDone()
      return true
    },
    [clearWallCurveDrag],
  )

  return {
    cancelWallCurveDrag,
    cancelWallEndpointDrag,
    clearWallCurveDrag,
    clearWallEndpointDrag,
    commitWallCurveDrag,
    commitWallEndpointDrag,
    hasWallEndpointDrag,
    isWallEndpointDragPointer,
    updateWallCurveDrag,
    updateWallEndpointDrag,
    wallCurveDraft,
    wallCurveDragRef,
    wallEndpointDraft,
    wallEndpointDragRef,
  }
}
