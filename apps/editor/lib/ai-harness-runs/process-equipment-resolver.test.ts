import { describe, expect, test } from 'bun:test'
import type { GeneratedGeometryPlacementSpec } from '../../../../packages/editor/src/lib/ai-generated-geometry-nodes'
import { resolveProcessStationEquipment } from './process-equipment-resolver'
import type {
  ProcessLinePlan,
  ProcessStationPlan,
  StationPlacement,
} from './process-line-types'

function station(overrides: Partial<ProcessStationPlan> = {}): ProcessStationPlan {
  return {
    id: 'vacuum_column',
    label: 'Vacuum Column',
    role: 'vacuum_distillation',
    equipmentHint: 'vacuum distillation column',
    ...overrides,
  }
}

function plan(overrides: Partial<ProcessLinePlan> = {}): ProcessLinePlan {
  return {
    processLabel: 'Test refinery process',
    domain: 'chemical',
    layoutStyle: 'linear',
    stations: [station()],
    connections: [],
    ...overrides,
  }
}

function placement(overrides: Partial<StationPlacement> = {}): StationPlacement {
  return {
    stationId: 'vacuum_column',
    role: 'vacuum_distillation',
    label: 'Vacuum Column',
    position: [10, 0, 4],
    rotation: [0, 0, 0],
    footprint: { length: 4, width: 4 },
    clearance: { front: 0.5, back: 0.5, left: 0.5, right: 0.5 },
    clearanceBox: { minX: 8, maxX: 12, minZ: 2, maxZ: 6 },
    ...overrides,
  }
}

function placementSpec(): GeneratedGeometryPlacementSpec {
  return { parentId: 'level_factory' }
}

describe('synthesized equipment fallback', () => {
  test('resolves non-handwritten equipment to an editable synthesized part node tree', () => {
    const result = resolveProcessStationEquipment({
      plan: plan(),
      station: station(),
      stationPlacement: placement(),
      placement: placementSpec(),
      metadata: { generatedBy: 'test' },
    })

    expect(result.resolved).toBe(true)
    expect(result.resolver).toBe('synthesized-parts')
    expect(result.primitiveRequest).toBeNull()
    expect(result.reason).toContain('synthesized')

    // Assembly root + part children = multiple create patches
    expect(result.patches.length).toBeGreaterThan(1)
    expect(result.patches.every((patch) => patch.op === 'create')).toBe(true)

    const rootPatch = result.patches[0]
    expect(rootPatch?.node.type).toBe('assembly')
    const childPatches = result.patches.slice(1)
    expect(childPatches.length).toBeGreaterThan(0)
    // Every child is an independent node parented to the root (not instanced)
    for (const patch of childPatches) {
      expect(patch.parentId).toBe(rootPatch?.node.id)
    }

    // Part-level editing: children carry disablePrimitiveBatch metadata
    const childWithBatchFlag = childPatches.find(
      (patch) =>
        (patch.node.metadata as Record<string, unknown> | undefined)?.disablePrimitiveBatch ===
        true,
    )
    expect(childWithBatchFlag).toBeDefined()

    // Synthesized parts carry semantic roles from the contract
    const roles = childPatches
      .map(
        (patch) =>
          (patch.node.metadata as Record<string, unknown> | undefined)?.semanticRole as
            | string
            | undefined,
      )
      .filter(Boolean)
    expect(roles.length).toBeGreaterThan(0)

    // Route obstacle emitted for connection routing
    expect(result.routeObstacle).toBeDefined()
    expect(result.routeObstacle?.stationId).toBe('vacuum_column')
    expect(result.routeObstacle?.source).toBe('synthesized')
  })

  test('profile-parts still wins over the synthesizer for known equipment', () => {
    const result = resolveProcessStationEquipment({
      plan: plan(),
      // A pump station matches the generic centrifugal-pump profile whose
      // preferredResolver is 'profile-parts' — it must resolve before the
      // synthesizer fallback is even considered.
      station: station({
        id: 'feed_pump',
        label: 'Feed Pump',
        role: 'pump',
        equipmentHint: 'centrifugal pump',
      }),
      stationPlacement: placement({ stationId: 'feed_pump', role: 'pump', label: 'Feed Pump' }),
      placement: placementSpec(),
      metadata: { generatedBy: 'test' },
    })

    expect(result.resolved).toBe(true)
    expect(result.resolver).toBe('profile-parts')
  })
})
