/**
 * Instancing Planner
 *
 * Groups repeated parts (tray bands, burner nozzles, pipe supports, flange
 * bolts, ladder rungs) into instanced batches so the renderer can draw them
 * with a single InstancedMesh per batch instead of one mesh per part.
 *
 * This is a pure-logic module (no three.js dependency): it consumes the
 * placed parts of a GeneratedScene and emits a batch plan. The renderer turns
 * each batch into one InstancedMesh using the representative geometry and the
 * per-instance world transforms provided here.
 *
 * Grouping key = instancingHint + geometry signature (kind + dims) + material
 * signature (color), so only truly identical parts share a batch.
 */

import type { SemanticRecipePart } from '@pascal-app/core'
import type { RoutedConnection, RoutingResult } from './connection-router'
import type { GeneratedScene, PlacedPart } from './scene-generator'

// ─── Public Types ────────────────────────────────────────────────────────────

export type InstanceTransform = {
  /** World position */
  position: [number, number, number]
  /** Axis the part is aligned to (for cylinders / pipes) */
  axis?: 'x' | 'y' | 'z'
  /** Uniform scale factor relative to the batch's representative geometry */
  scale?: number
  /** Rotation around Y in radians (from station rotationY) */
  rotationY?: number
}

export type InstanceBatch = {
  /** Stable batch id (instancingHint|kind|dims|color) */
  key: string
  /** The instancing hint that grouped these parts (e.g. 'tray-bands') */
  instancingHint: string
  /** part-registry / PartComposeKind kind for the representative geometry */
  kind: string
  semanticRole: string
  /** Representative geometry dimensions (from the first part in the batch) */
  geometry: {
    length?: number
    width?: number
    height?: number
    radius?: number
    radiusTop?: number
    radiusBottom?: number
    axis?: 'x' | 'y' | 'z'
  }
  /** Material color (hex) */
  color: string
  /** PBR material family resolved from the render contract (if any) */
  materialFamily?: string
  /** Original render contract of the exemplar part (kernel + material + effects) */
  renderContract?: Record<string, unknown>
  instances: InstanceTransform[]
  /** Number of instances in this batch */
  count: number
}

export type InstancingPlan = {
  batches: InstanceBatch[]
  /** Parts that are unique (count === 1) and rendered as regular meshes */
  singletons: PlacedPart[]
  summary: {
    totalParts: number
    instancedParts: number
    singletonParts: number
    batchCount: number
    /** Estimated draw calls: batches + singletons (vs totalParts naive) */
    estimatedDrawCalls: number
    naiveDrawCalls: number
  }
}

export type InstancingPlannerOptions = {
  /** Minimum instances required to form a batch (below → singleton). Default 2 */
  minBatchSize?: number
  /**
   * Map a semanticRole/kind to an instancingHint. The planner first reads the
   * part's own renderContract.instancingHint; if absent, this resolver is used.
   */
  resolveInstancingHint?: (part: PlacedPart) => string | undefined
}

// ─── Default hint resolution ─────────────────────────────────────────────────

/**
 * Roles that are inherently repeated and should be instanced even without an
 * explicit renderContract.instancingHint. Maps role pattern → hint id.
 */
const DEFAULT_HINT_RULES: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /tray_band/, hint: 'tray-bands' },
  { pattern: /burner/, hint: 'burner-nozzles' },
  { pattern: /bolt|flange/, hint: 'bolts' },
  { pattern: /ladder|stair|rung|step/, hint: 'steps-rungs-rails' },
  { pattern: /support|saddle|frame/, hint: 'frame-members' },
  { pattern: /side_draw_nozzle|nozzle/, hint: 'nozzles' },
  { pattern: /pipe_run|connection_pipe/, hint: 'pipe-bundles' },
]

function readHint(part: PlacedPart): string | undefined {
  const record = part as unknown as Record<string, unknown>
  const contract = record.renderContract as { instancingHint?: unknown } | undefined
  if (typeof contract?.instancingHint === 'string') return contract.instancingHint
  const role = (part.semanticRole ?? '').toLowerCase()
  const kind = (typeof part.kind === 'string' ? part.kind : '').toLowerCase()
  for (const rule of DEFAULT_HINT_RULES) {
    if (rule.pattern.test(role) || rule.pattern.test(kind)) return rule.hint
  }
  return undefined
}

// ─── Geometry / material signatures ─────────────────────────────────────────

function round3(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : ''
}

function geometrySignature(part: PlacedPart): string {
  const record = part as unknown as Record<string, unknown>
  return [
    typeof part.kind === 'string' ? part.kind : 'generic_body',
    round3(record.length as number),
    round3(record.width as number),
    round3(record.height as number),
    round3(record.radius as number),
    round3(record.radiusTop as number),
    round3(record.radiusBottom as number),
    (record.axis as string) ?? 'y',
  ].join(',')
}

function colorOf(part: PlacedPart): string {
  const record = part as unknown as Record<string, unknown>
  const material = record.material as { properties?: { color?: unknown } } | undefined
  const color = material?.properties?.color ?? record.primaryColor
  return typeof color === 'string' ? color.toLowerCase() : '#cccccc'
}

function materialFamilyOf(part: PlacedPart): string | undefined {
  const record = part as unknown as Record<string, unknown>
  const contract = record.renderContract as { material?: unknown } | undefined
  return typeof contract?.material === 'string' ? contract.material : undefined
}

// ─── Planner ─────────────────────────────────────────────────────────────────

export class InstancingPlanner {
  private readonly minBatchSize: number
  private readonly resolveHint?: (part: PlacedPart) => string | undefined

  constructor(options: InstancingPlannerOptions = {}) {
    this.minBatchSize = options.minBatchSize ?? 2
    this.resolveHint = options.resolveInstancingHint
  }

  /**
   * Build an instancing plan from a generated scene's placed parts.
   */
  planScene(scene: GeneratedScene): InstancingPlan {
    const allParts: PlacedPart[] = scene.stations.flatMap((station) => station.parts)
    return this.planParts(allParts)
  }

  /**
   * Build an instancing plan from an arbitrary part list.
   */
  planParts(parts: readonly PlacedPart[]): InstancingPlan {
    const groups = new Map<string, { hint: string; parts: PlacedPart[] }>()
    const singletons: PlacedPart[] = []

    for (const part of parts) {
      const hint = this.resolveHint?.(part) ?? readHint(part)
      if (!hint) {
        singletons.push(part)
        continue
      }
      const key = [hint, geometrySignature(part), colorOf(part)].join('|')
      const group = groups.get(key)
      if (group) group.parts.push(part)
      else groups.set(key, { hint, parts: [part] })
    }

    const batches: InstanceBatch[] = []
    let instancedParts = 0

    for (const [key, group] of groups) {
      // Below the batch threshold, render as individual meshes
      if (group.parts.length < this.minBatchSize) {
        singletons.push(...group.parts)
        continue
      }
      const exemplar = group.parts[0]
      if (!exemplar) continue
      const record = exemplar as unknown as Record<string, unknown>
      const instances: InstanceTransform[] = group.parts.map((part) => {
        const r = part as unknown as Record<string, unknown>
        return {
          position: part.worldPosition ?? (r.position as [number, number, number]) ?? [0, 0, 0],
          axis: r.axis as 'x' | 'y' | 'z' | undefined,
          rotationY: 0,
        }
      })
      batches.push({
        key,
        instancingHint: group.hint,
        kind: typeof exemplar.kind === 'string' ? exemplar.kind : 'generic_body',
        semanticRole: exemplar.semanticRole ?? '',
        geometry: {
          length: record.length as number | undefined,
          width: record.width as number | undefined,
          height: record.height as number | undefined,
          radius: record.radius as number | undefined,
          radiusTop: record.radiusTop as number | undefined,
          radiusBottom: record.radiusBottom as number | undefined,
          axis: record.axis as 'x' | 'y' | 'z' | undefined,
        },
        color: colorOf(exemplar),
        materialFamily: materialFamilyOf(exemplar),
        renderContract: record.renderContract as Record<string, unknown> | undefined,
        instances,
        count: instances.length,
      })
      instancedParts += instances.length
    }

    // Sort batches largest-first so the renderer allocates big batches early
    batches.sort((a, b) => b.count - a.count)

    const totalParts = parts.length
    const singletonParts = singletons.length
    const estimatedDrawCalls = batches.length + singletonParts

    return {
      batches,
      singletons,
      summary: {
        totalParts,
        instancedParts,
        singletonParts,
        batchCount: batches.length,
        estimatedDrawCalls,
        naiveDrawCalls: totalParts,
      },
    }
  }

  /**
   * Extend the plan with routed pipe segments (also highly repeated).
   * Pipe segments of the same diameter + color + medium group into batches.
   */
  planWithConnections(scene: GeneratedScene, routing: RoutingResult): InstancingPlan {
    const scenePlan = this.planScene(scene)
    const pipeParts = this.pipeSegmentsToPlacedParts(routing.routed)
    const pipePlan = this.planParts(pipeParts)

    const batches = [...scenePlan.batches, ...pipePlan.batches].sort((a, b) => b.count - a.count)
    const singletons = [...scenePlan.singletons, ...pipePlan.singletons]
    const instancedParts = scenePlan.summary.instancedParts + pipePlan.summary.instancedParts
    const totalParts = scenePlan.summary.totalParts + pipePlan.summary.totalParts

    return {
      batches,
      singletons,
      summary: {
        totalParts,
        instancedParts,
        singletonParts: singletons.length,
        batchCount: batches.length,
        estimatedDrawCalls: batches.length + singletons.length,
        naiveDrawCalls: totalParts,
      },
    }
  }

  private pipeSegmentsToPlacedParts(routed: readonly RoutedConnection[]): PlacedPart[] {
    const parts: PlacedPart[] = []
    for (const connection of routed) {
      for (const segment of connection.segments) {
        const record = segment as unknown as Record<string, unknown>
        parts.push({
          ...(segment as SemanticRecipePart),
          stationId: `conn_${connection.index}`,
          profileId: connection.medium,
          worldPosition: record.position as [number, number, number],
          // Pipe segments get a default render contract so the material
          // planner can resolve brushed-metal / process-pipe-run PBR params.
          renderContract: {
            kernel: 'process-pipe-run',
            material: 'brushed-metal',
          },
        } as PlacedPart)
      }
    }
    return parts
  }
}

/**
 * Convenience: plan instancing for a generated scene.
 */
export function planSceneInstancing(
  scene: GeneratedScene,
  options: InstancingPlannerOptions = {},
): InstancingPlan {
  return new InstancingPlanner(options).planScene(scene)
}
