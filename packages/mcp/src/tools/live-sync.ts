import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import { syncAutoStairOpenings } from '@pascal-app/core/stair-openings'
import type { SceneOperations } from '../operations'
import { SceneVersionConflictError, type SceneGraphPatch } from '../storage/types'
import { ErrorCode, throwMcpError } from './errors'

type PatchableSceneGraph = {
  nodes: Record<string, unknown>
  rootNodeIds: string[]
  collections?: Record<string, unknown>
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  return JSON.stringify(left) === JSON.stringify(right)
}

function createSceneGraphPatch(
  previous: PatchableSceneGraph,
  next: PatchableSceneGraph,
): SceneGraphPatch {
  const upsert: Record<string, unknown> = {}
  const remove: string[] = []

  for (const [id, node] of Object.entries(next.nodes)) {
    if (!(id in previous.nodes) || !sameJson(previous.nodes[id], node)) upsert[id] = node
  }
  for (const id of Object.keys(previous.nodes)) {
    if (!(id in next.nodes)) remove.push(id)
  }

  return {
    nodes: { upsert, remove },
    ...(!sameJson(previous.rootNodeIds, next.rootNodeIds)
      ? { rootNodeIds: [...next.rootNodeIds] }
      : {}),
    ...(!sameJson(previous.collections, next.collections)
      ? { collections: { ...(next.collections ?? {}) } }
      : {}),
  }
}

export function syncDerivedStairOpenings(operations: SceneOperations): number {
  const updates = syncAutoStairOpenings(operations.getNodes())
  if (updates.length === 0) return 0
  operations.applyPatch(
    updates.map((update) => ({
      op: 'update' as const,
      id: update.id,
      data: update.data,
    })),
  )
  return updates.length
}

/**
 * Persist the bridge's current graph to the active scene and append a live
 * event for browser subscribers. No-ops when the MCP session is not currently
 * bound to a saved scene.
 */
export async function publishLiveSceneSnapshot(
  operations: SceneOperations,
  kind: string,
): Promise<void> {
  syncDerivedStairOpenings(operations)

  const active = operations.getActiveScene()
  if (!(active && operations.canAppendSceneEvents)) return

  const graph = operations.exportSceneGraph()

  try {
    const previous = await operations.loadStoredScene(active.id)
    const baseVersion = previous?.version ?? active.version
    const patch = previous
      ? createSceneGraphPatch(previous.graph as PatchableSceneGraph, graph as PatchableSceneGraph)
      : undefined
    const meta = await operations.saveScene({
      id: active.id,
      name: active.name,
      projectId: active.projectId,
      ownerId: active.ownerId,
      thumbnailUrl: active.thumbnailUrl,
      graph,
      expectedVersion: active.version,
      saveMode: 'draft',
      publish: false,
      operation: kind,
      event: {
        baseVersion,
        kind,
        ...(patch ? { patch } : {}),
      },
    })
    operations.setActiveScene(meta)
  } catch (error) {
    if (error instanceof SceneVersionConflictError) {
      throwMcpError(ErrorCode.InvalidRequest, 'live_sync_version_conflict', {
        sceneId: active.id,
        expectedVersion: active.version,
      })
    }
    const message = error instanceof Error ? error.message : String(error)
    throwMcpError(ErrorCode.InternalError, `live_sync_failed: ${message}`)
  }
}

export async function appendLiveSceneEvent(
  operations: SceneOperations,
  sceneId: string,
  version: number,
  kind: string,
  graph: SceneGraph,
): Promise<void> {
  if (!operations.canAppendSceneEvents) return
  await operations.appendSceneEvent({ sceneId, version, kind, graph })
}
