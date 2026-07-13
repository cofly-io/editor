import type { AnyNode, AnyNodeId } from '../schema/types'
import { nodeRegistry } from './registry'
import type { SceneApi } from './types'

/**
 * Spatial neighbor query — given a node and a set of kinds, returns IDs of
 * neighboring nodes of those kinds. The runtime provides this from
 * `spatialGridManager`; tests can pass a stub.
 */
export type SpatialQuery = (node: AnyNode, kinds: readonly string[]) => Iterable<AnyNodeId>

/**
 * Returns the IDs of nodes that share `node` as a parent. The runtime can
 * pass an optimized index; the default fallback iterates the scene.
 */
export type ChildQuery = (node: AnyNode) => Iterable<AnyNodeId>

export type CascadeContext = {
  scene: SceneApi
  /** Optional: bounded spatial neighbor lookup. Required for `affectsSpatial`. */
  spatialQuery?: SpatialQuery
  /** Optional: children-by-parent lookup. Defaults to iterating the scene. */
  childQuery?: ChildQuery
  /** Safety cap on cascade depth — guards against bad data and pathological
   * registry configurations. Default 16 (deeper than the maxHostDepth of 6). */
  maxDepth?: number
}

type EndpointLinkedNode = AnyNode & {
  start: readonly [number, number]
  end: readonly [number, number]
}

/**
 * Resolves the nodes related to `node` by its registry `linkedBy` rule.
 * This is a pure lookup used by preview and dirty-cascade consumers so
 * framework packages do not need kind-specific endpoint matching.
 */
export function getLinkedNodeIds(
  node: AnyNode,
  nodes: Readonly<Record<string, AnyNode>>,
): AnyNodeId[] {
  const linkedBy = nodeRegistry.get(node.type)?.relations?.linkedBy
  if (!linkedBy) {
    return []
  }

  if (typeof linkedBy === 'object') {
    return linkedBy.custom(node).filter((id) => id !== node.id && nodes[id] !== undefined)
  }

  if (linkedBy !== 'endpoint-match' || !hasPlanEndpoints(node)) {
    return []
  }

  const result: AnyNodeId[] = []
  for (const candidate of Object.values(nodes)) {
    if (
      candidate.id === node.id ||
      candidate.type !== node.type ||
      candidate.parentId !== node.parentId ||
      !hasPlanEndpoints(candidate)
    ) {
      continue
    }

    if (
      pointsEqual(candidate.start, node.start) ||
      pointsEqual(candidate.start, node.end) ||
      pointsEqual(candidate.end, node.start) ||
      pointsEqual(candidate.end, node.end)
    ) {
      result.push(candidate.id)
    }
  }

  return result
}

const DEFAULT_MAX_DEPTH = 16

/**
 * Walks the relations graph from one dirty node and returns the full set of
 * IDs (including the starting one) that should be marked dirty. Pure — does
 * NOT call `scene.markDirty`; callers iterate the result.
 *
 * Phase 1 implements:
 * - `hosts`: marks children whose `type` matches the kind list
 * - `affectsSpatial`: marks neighbors found via `spatialQuery`
 *
 * Phase 3 will add `linkedBy: 'endpoint-match'` for wall corner propagation.
 */
export function cascadeDirty(startId: AnyNodeId, ctx: CascadeContext): Set<AnyNodeId> {
  const result = new Set<AnyNodeId>()
  const maxDepth = ctx.maxDepth ?? DEFAULT_MAX_DEPTH
  walk(startId, ctx, result, 0, maxDepth)
  return result
}

function walk(
  id: AnyNodeId,
  ctx: CascadeContext,
  result: Set<AnyNodeId>,
  depth: number,
  maxDepth: number,
): void {
  if (result.has(id) || depth > maxDepth) return
  result.add(id)

  const node = ctx.scene.get(id)
  if (!node) return

  const def = nodeRegistry.get(node.type)
  if (!def?.relations) return

  const { hosts, affectsSpatial } = def.relations

  if (hosts && hosts.length > 0) {
    const childIds = ctx.childQuery ? ctx.childQuery(node) : defaultChildIds(node, ctx.scene)
    for (const childId of childIds) {
      const child = ctx.scene.get(childId)
      if (child && (hosts as readonly string[]).includes(child.type)) {
        walk(childId, ctx, result, depth + 1, maxDepth)
      }
    }
  }

  if (affectsSpatial && affectsSpatial.length > 0 && ctx.spatialQuery) {
    for (const neighborId of ctx.spatialQuery(node, affectsSpatial)) {
      walk(neighborId, ctx, result, depth + 1, maxDepth)
    }
  }
}

/**
 * Fallback children lookup that reads the node's `children: AnyNodeId[]`
 * field if present. Most parametric nodes carry one; nodes that don't will
 * need a `childQuery` override on the context.
 */
function defaultChildIds(node: AnyNode, _scene: SceneApi): AnyNodeId[] {
  const maybeChildren = (node as unknown as { children?: AnyNodeId[] }).children
  return Array.isArray(maybeChildren) ? maybeChildren : []
}

function hasPlanEndpoints(node: AnyNode): node is EndpointLinkedNode {
  const candidate = node as unknown as {
    start?: unknown
    end?: unknown
  }
  return isPlanPoint(candidate.start) && isPlanPoint(candidate.end)
}

function isPlanPoint(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  )
}

function pointsEqual(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

/**
 * Recursively collects every descendant of a node, plus the node itself.
 * Used by `cascadeDelete: 'descendants'` and by tools that need to delete a
 * subtree atomically. Independent of dirty-marking — pure traversal.
 */
export function collectDescendants(
  startId: AnyNodeId,
  ctx: Pick<CascadeContext, 'scene' | 'childQuery' | 'maxDepth'>,
): Set<AnyNodeId> {
  const result = new Set<AnyNodeId>()
  const maxDepth = ctx.maxDepth ?? DEFAULT_MAX_DEPTH
  walkDescendants(startId, ctx, result, 0, maxDepth)
  return result
}

function walkDescendants(
  id: AnyNodeId,
  ctx: Pick<CascadeContext, 'scene' | 'childQuery' | 'maxDepth'>,
  result: Set<AnyNodeId>,
  depth: number,
  maxDepth: number,
): void {
  if (result.has(id) || depth > maxDepth) return
  result.add(id)
  const node = ctx.scene.get(id)
  if (!node) return
  const childIds = ctx.childQuery ? ctx.childQuery(node) : defaultChildIds(node, ctx.scene)
  for (const childId of childIds) {
    walkDescendants(childId, ctx, result, depth + 1, maxDepth)
  }
}
