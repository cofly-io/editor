import type { WallNode } from '@pascal-app/core'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import { pointsEqual } from './polygon-geometry'
import type { LinkedWallSnapshot, WallEndpoint, WallEndpointDraft } from './types'

export function haveSameIds(currentIds: string[], nextIds: string[]): boolean {
  return (
    currentIds.length === nextIds.length &&
    currentIds.every((currentId, index) => currentId === nextIds[index])
  )
}

export function buildWallEndpointDraft(
  wallId: WallNode['id'],
  endpoint: WallEndpoint,
  fixedPoint: WallPlanPoint,
  movingPoint: WallPlanPoint,
  linkedWalls: LinkedWallSnapshot[] = [],
): WallEndpointDraft {
  return {
    wallId,
    endpoint,
    start: endpoint === 'start' ? movingPoint : fixedPoint,
    end: endpoint === 'end' ? movingPoint : fixedPoint,
    linkedWalls,
  }
}

export function buildWallWithUpdatedEndpoints(
  wall: WallNode,
  start: WallPlanPoint,
  end: WallPlanPoint,
): WallNode {
  return {
    ...wall,
    start,
    end,
  }
}

export function getLinkedWallSnapshots(
  walls: WallNode[],
  wallId: WallNode['id'],
  originalStart: WallPlanPoint,
  originalEnd: WallPlanPoint,
): LinkedWallSnapshot[] {
  return walls
    .filter((wall) => {
      if (wall.id === wallId) {
        return false
      }

      return (
        pointsEqual(wall.start, originalStart) ||
        pointsEqual(wall.start, originalEnd) ||
        pointsEqual(wall.end, originalStart) ||
        pointsEqual(wall.end, originalEnd)
      )
    })
    .map((wall) => ({
      id: wall.id,
      start: [...wall.start] as WallPlanPoint,
      end: [...wall.end] as WallPlanPoint,
    }))
}

export function getLinkedWallUpdates(
  linkedWalls: LinkedWallSnapshot[],
  originalStart: WallPlanPoint,
  originalEnd: WallPlanPoint,
  nextStart: WallPlanPoint,
  nextEnd: WallPlanPoint,
): LinkedWallSnapshot[] {
  return linkedWalls.map((wall) => ({
    id: wall.id,
    start: pointsEqual(wall.start, originalStart)
      ? nextStart
      : pointsEqual(wall.start, originalEnd)
        ? nextEnd
        : wall.start,
    end: pointsEqual(wall.end, originalStart)
      ? nextStart
      : pointsEqual(wall.end, originalEnd)
        ? nextEnd
        : wall.end,
  }))
}

export function getWallEndpointDraftUpdates(draft: WallEndpointDraft): LinkedWallSnapshot[] {
  return [{ id: draft.wallId, start: draft.start, end: draft.end }, ...draft.linkedWalls]
}
