'use client'

import type { FenceNode, WallNode } from '@pascal-app/core'
import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react'
import { useCallback } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { snapFenceDraftPoint } from '../../tools/fence/fence-drafting'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import { pointsEqual, snapPolygonDraftPoint } from './geometry'
import type { ReferenceScaleDraft } from './types'
import type { FloorplanGridEventEmitter } from './use-floorplan-grid-events'

export function useFloorplanBuildPointerMove({
  activePolygonDraftPoints,
  ceilingDraftPoints,
  emitFloorplanGridEvent,
  fences,
  fenceDraftStart,
  getSnappedFloorplanPoint,
  isCeilingBuildActive,
  isFenceBuildActive,
  isFloorplanGridInteractionActive,
  isPolygonBuildActive,
  isRoofBuildActive,
  isWallBuildActive,
  referenceScaleDraft,
  roofDraftStart,
  setCursorPoint,
  setFenceDraftEnd,
  setReferenceScaleDraft,
  setRoofDraftEnd,
  shiftPressed,
  walls,
}: {
  activePolygonDraftPoints: WallPlanPoint[]
  ceilingDraftPoints: WallPlanPoint[]
  emitFloorplanGridEvent: FloorplanGridEventEmitter
  fences: FenceNode[]
  fenceDraftStart: WallPlanPoint | null
  getSnappedFloorplanPoint: (point: WallPlanPoint) => WallPlanPoint
  isCeilingBuildActive: boolean
  isFenceBuildActive: boolean
  isFloorplanGridInteractionActive: boolean
  isPolygonBuildActive: boolean
  isRoofBuildActive: boolean
  isWallBuildActive: boolean
  referenceScaleDraft: ReferenceScaleDraft | null
  roofDraftStart: WallPlanPoint | null
  setCursorPoint: Dispatch<SetStateAction<WallPlanPoint | null>>
  setFenceDraftEnd: Dispatch<SetStateAction<WallPlanPoint | null>>
  setReferenceScaleDraft: Dispatch<SetStateAction<ReferenceScaleDraft | null>>
  setRoofDraftEnd: Dispatch<SetStateAction<WallPlanPoint | null>>
  shiftPressed: boolean
  walls: WallNode[]
}) {
  return useCallback(
    (event: ReactPointerEvent<SVGSVGElement>, planPoint: WallPlanPoint) => {
      if (referenceScaleDraft) {
        emitFloorplanGridEvent('move', planPoint, event)

        setCursorPoint((previousPoint) =>
          previousPoint && pointsEqual(previousPoint, planPoint) ? previousPoint : planPoint,
        )
        setReferenceScaleDraft((currentDraft) =>
          currentDraft
            ? {
                ...currentDraft,
                cursor: planPoint,
              }
            : currentDraft,
        )
        return true
      }

      if (isCeilingBuildActive) {
        emitFloorplanGridEvent('move', planPoint, event)

        const snappedPoint = snapPolygonDraftPoint({
          point: planPoint,
          start: ceilingDraftPoints[ceilingDraftPoints.length - 1],
          angleSnap: ceilingDraftPoints.length > 0 && !shiftPressed,
        })

        setCursorPoint((previousPoint) =>
          previousPoint && pointsEqual(previousPoint, snappedPoint) ? previousPoint : snappedPoint,
        )
        return true
      }

      if (isRoofBuildActive) {
        const snappedPoint = getSnappedFloorplanPoint(planPoint)
        emitFloorplanGridEvent('move', snappedPoint, event)
        setCursorPoint((previousPoint) =>
          previousPoint && pointsEqual(previousPoint, snappedPoint) ? previousPoint : snappedPoint,
        )

        if (roofDraftStart) {
          setRoofDraftEnd((previousPoint) =>
            previousPoint && pointsEqual(previousPoint, snappedPoint)
              ? previousPoint
              : snappedPoint,
          )
        }
        return true
      }

      if (isFenceBuildActive) {
        emitFloorplanGridEvent('move', planPoint, event)

        const snappedPoint = snapFenceDraftPoint({
          point: planPoint,
          walls,
          fences,
          start: fenceDraftStart ?? undefined,
          angleSnap: Boolean(fenceDraftStart) && !shiftPressed,
        })

        setCursorPoint((previousPoint) =>
          previousPoint && pointsEqual(previousPoint, snappedPoint) ? previousPoint : snappedPoint,
        )

        if (fenceDraftStart) {
          setFenceDraftEnd((previousEnd) =>
            previousEnd && pointsEqual(previousEnd, snappedPoint) ? previousEnd : snappedPoint,
          )
        }
        return true
      }

      if (isPolygonBuildActive) {
        const snappedPoint = snapPolygonDraftPoint({
          point: planPoint,
          start: activePolygonDraftPoints[activePolygonDraftPoints.length - 1],
          angleSnap: activePolygonDraftPoints.length > 0 && !shiftPressed,
        })

        emitFloorplanGridEvent('move', snappedPoint, event)

        setCursorPoint((previousPoint) => {
          const hasChanged = !(previousPoint && pointsEqual(previousPoint, snappedPoint))
          if (hasChanged && activePolygonDraftPoints.length > 0) {
            sfxEmitter.emit('sfx:grid-snap')
          }
          return snappedPoint
        })
        return true
      }

      if (!isWallBuildActive && isFloorplanGridInteractionActive) {
        const snappedPoint = emitFloorplanGridEvent('move', planPoint, event)
        setCursorPoint((previousPoint) =>
          previousPoint && pointsEqual(previousPoint, snappedPoint) ? previousPoint : snappedPoint,
        )
        return true
      }

      return false
    },
    [
      activePolygonDraftPoints,
      ceilingDraftPoints,
      emitFloorplanGridEvent,
      fences,
      fenceDraftStart,
      getSnappedFloorplanPoint,
      isCeilingBuildActive,
      isFenceBuildActive,
      isFloorplanGridInteractionActive,
      isPolygonBuildActive,
      isRoofBuildActive,
      isWallBuildActive,
      referenceScaleDraft,
      roofDraftStart,
      setCursorPoint,
      setFenceDraftEnd,
      setReferenceScaleDraft,
      setRoofDraftEnd,
      shiftPressed,
      walls,
    ],
  )
}
