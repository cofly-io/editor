'use client'

import type { AnyNodeId } from '@pascal-app/core'
import { emitter, sceneRegistry, useScene } from '@pascal-app/core'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useMemo } from 'react'
import type { MovingNode } from '../../../store/use-editor'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'

type FloorplanGridNativeEvent = ReactMouseEvent<SVGSVGElement> | ReactPointerEvent<SVGSVGElement>

export type FloorplanGridEventEmitter = (
  eventType: 'move' | 'click' | 'double-click',
  planPoint: WallPlanPoint,
  nativeEvent: FloorplanGridNativeEvent,
) => WallPlanPoint

export function useFloorplanGridEvents({
  buildingPosition,
  buildingRotationY,
  getSnappedFloorplanPoint,
  levelId,
  movingNode,
}: {
  buildingPosition: [number, number, number]
  buildingRotationY: number
  getSnappedFloorplanPoint: (point: WallPlanPoint) => WallPlanPoint
  levelId: string | null
  movingNode: MovingNode | null
}) {
  const floorplanGridLocalY = useMemo(() => {
    if (movingNode?.type === 'item' || movingNode?.type === 'spawn') {
      return movingNode.position[1]
    }

    if (levelId) {
      return sceneRegistry.nodes.get(levelId as AnyNodeId)?.position.y ?? 0
    }

    return 0
  }, [levelId, movingNode])

  const floorplanGridWorldY = buildingPosition[1] + floorplanGridLocalY

  const emitFloorplanWallLeave = useCallback((wallId: string | null) => {
    if (!wallId) {
      return
    }

    const wallNode = useScene.getState().nodes[wallId as AnyNodeId]
    if (!wallNode || wallNode.type !== 'wall') {
      return
    }

    emitter.emit('wall:leave', {
      node: wallNode,
      position: [0, 0, 0],
      localPosition: [0, 0, 0],
      stopPropagation: () => {},
    } as any)
  }, [])

  const emitFloorplanGridEvent = useCallback(
    (
      eventType: 'move' | 'click' | 'double-click',
      planPoint: WallPlanPoint,
      nativeEvent: FloorplanGridNativeEvent,
    ) => {
      const snappedPoint = getSnappedFloorplanPoint(planPoint)
      const cos = Math.cos(buildingRotationY)
      const sin = Math.sin(buildingRotationY)
      const worldX = buildingPosition[0] + snappedPoint[0] * cos + snappedPoint[1] * sin
      const worldZ = buildingPosition[2] - snappedPoint[0] * sin + snappedPoint[1] * cos

      emitter.emit(`grid:${eventType}` as any, {
        nativeEvent: nativeEvent.nativeEvent as any,
        position: [worldX, floorplanGridWorldY, worldZ],
        localPosition: [snappedPoint[0], floorplanGridLocalY, snappedPoint[1]],
      })

      return snappedPoint
    },
    [
      buildingPosition,
      buildingRotationY,
      floorplanGridLocalY,
      floorplanGridWorldY,
      getSnappedFloorplanPoint,
    ],
  )

  return {
    emitFloorplanGridEvent,
    emitFloorplanWallLeave,
    floorplanGridLocalY,
    floorplanGridWorldY,
  }
}
