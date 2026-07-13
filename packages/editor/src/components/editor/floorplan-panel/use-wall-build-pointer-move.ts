'use client'

import type { WallNode } from '@pascal-app/core'
import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react'
import { useCallback } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import { snapWallDraftPoint } from '../../tools/wall/wall-drafting'
import { pointsEqual } from './geometry'
import type { FloorplanGridEventEmitter } from './use-floorplan-grid-events'

export function useWallBuildPointerMove({
  draftStart,
  emitFloorplanGridEvent,
  isWallBuildActive,
  setCursorPoint,
  setDraftEnd,
  shiftPressed,
  walls,
}: {
  draftStart: WallPlanPoint | null
  emitFloorplanGridEvent: FloorplanGridEventEmitter
  isWallBuildActive: boolean
  setCursorPoint: Dispatch<SetStateAction<WallPlanPoint | null>>
  setDraftEnd: Dispatch<SetStateAction<WallPlanPoint | null>>
  shiftPressed: boolean
  walls: WallNode[]
}) {
  return useCallback(
    (event: ReactPointerEvent<SVGSVGElement>, planPoint: WallPlanPoint) => {
      if (!isWallBuildActive) {
        return false
      }

      const snappedPoint = snapWallDraftPoint({
        point: planPoint,
        walls,
        start: draftStart ?? undefined,
        angleSnap: Boolean(draftStart) && !shiftPressed,
      })

      emitFloorplanGridEvent('move', snappedPoint, event)
      setCursorPoint(snappedPoint)

      if (!draftStart) {
        return true
      }

      setDraftEnd((previousEnd) => {
        if (!(previousEnd && pointsEqual(previousEnd, snappedPoint))) {
          sfxEmitter.emit('sfx:grid-snap')
        }

        return snappedPoint
      })
      return true
    },
    [
      draftStart,
      emitFloorplanGridEvent,
      isWallBuildActive,
      setCursorPoint,
      setDraftEnd,
      shiftPressed,
      walls,
    ],
  )
}
