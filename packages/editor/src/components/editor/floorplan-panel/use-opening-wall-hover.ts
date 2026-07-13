'use client'

import type { WallNode } from '@pascal-app/core'
import { emitter, isCurvedWall } from '@pascal-app/core'
import { useCallback, useRef } from 'react'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import { findClosestWallPoint } from './geometry'

export function useOpeningWallHover({
  emitFloorplanWallLeave,
  floorplanOpeningLocalY,
  walls,
}: {
  emitFloorplanWallLeave: (wallId: string | null) => void
  floorplanOpeningLocalY: number
  walls: WallNode[]
}) {
  const hoveredWallIdRef = useRef<string | null>(null)

  const clearOpeningWallHover = useCallback(() => {
    if (!hoveredWallIdRef.current) {
      return
    }

    emitFloorplanWallLeave(hoveredWallIdRef.current)
    hoveredWallIdRef.current = null
  }, [emitFloorplanWallLeave])

  const updateOpeningWallHover = useCallback(
    (planPoint: WallPlanPoint) => {
      const closest = findClosestWallPoint(planPoint, walls, {
        canUseWall: (wall) => !isCurvedWall(wall),
      })

      if (!closest) {
        clearOpeningWallHover()
        return
      }

      const dx = closest.wall.end[0] - closest.wall.start[0]
      const dz = closest.wall.end[1] - closest.wall.start[1]
      const length = Math.sqrt(dx * dx + dz * dz)
      const distance = closest.t * length

      const wallEvent = {
        node: closest.wall,
        point: { x: closest.point[0], y: 0, z: closest.point[1] },
        localPosition: [distance, floorplanOpeningLocalY, 0] as [number, number, number],
        normal: closest.normal,
        stopPropagation: () => {},
      }

      if (hoveredWallIdRef.current !== closest.wall.id) {
        clearOpeningWallHover()
        hoveredWallIdRef.current = closest.wall.id
        emitter.emit('wall:enter', wallEvent as any)
        return
      }

      emitter.emit('wall:move', wallEvent as any)
    },
    [clearOpeningWallHover, floorplanOpeningLocalY, walls],
  )

  return {
    clearOpeningWallHover,
    updateOpeningWallHover,
  }
}
