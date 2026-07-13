import { describe, expect, test } from 'bun:test'
import type {
  GeneratedGeometryArtifact,
  GeneratedGeometryShapeSpec,
} from '../../../../packages/editor/src/lib/ai-generated-geometry-core'
import {
  polishStage3SemanticArtifact,
  repairStage3SemanticArtifact,
  stage3QualityReview,
} from './primitive-runner'

function shape(
  semanticRole: string,
  sourcePartKind: string,
  name = semanticRole,
): GeneratedGeometryShapeSpec {
  return {
    kind: 'box',
    name,
    semanticRole,
    sourcePartKind,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    length: 1,
    width: 1,
    height: 1,
  }
}

function artifact(shapes: GeneratedGeometryShapeSpec[]): GeneratedGeometryArtifact {
  return {
    id: 'stage3_test',
    title: 'Stage3 test',
    sourceTool: 'compose_parts',
    sourceArgs: {},
    userPrompt: 'test',
    version: 1,
    createdAt: '2026-06-18T00:00:00.000Z',
    shapes,
    transforms: shapes.map((shape) => ({
      position: shape.position ?? [0, 0, 0],
      rotation: shape.rotation ?? [0, 0, 0],
    })),
    assemblyName: 'Stage3 test',
    assemblyPosition: [0, 0, 0],
    createdNames: shapes.map((item) => item.name ?? item.kind),
    shapeDetails: '',
  }
}

describe('Stage3 primitive quality gate', () => {
  test('repairs round container output that used generic body boxes', () => {
    const review = stage3QualityReview(
      '\u751f\u6210\u4e00\u4e2a\u5706\u67f1\u6c34\u74f6',
      artifact([
        shape('bottle_body', 'generic_body'),
        shape('bottle_cap', 'generic_body'),
        shape('rim_ring', 'generic_detail_accent'),
      ]),
    )

    expect(review.passed).toBe(false)
    expect(review.issues).toContain(
      'Stage3 round container main body must use round primitive geometry, not generic_body box.',
    )
    expect(review.repairPlan).toMatchObject({
      label: 'canonical round container primitive',
      tool: 'compose_primitive',
    })
    expect((review.repairPlan?.args.shapes as Array<Record<string, unknown>>)[0]).toMatchObject({
      kind: 'cylinder',
      semanticRole: 'bottle_body',
    })
  })

  test('passes round container output with a cylindrical main body', () => {
    const review = stage3QualityReview(
      '\u751f\u6210\u4e00\u4e2a\u5706\u67f1\u6c34\u74f6',
      artifact([
        {
          ...shape('bottle_body', 'compose_primitive'),
          kind: 'cylinder',
          axis: 'y',
          radius: 0.06,
          height: 0.26,
        },
        {
          ...shape('bottle_cap', 'compose_primitive'),
          kind: 'cylinder',
          axis: 'y',
          radius: 0.04,
          height: 0.04,
        },
      ]),
    )

    expect(review.passed).toBe(true)
    expect(review.repairPlan).toBeUndefined()
  })

  test('does not repair gantry cranes into round containers because their parts mention cylinders', () => {
    const gantryArtifact = artifact([
      shape('gantry_girder', 'generic_body'),
      shape('gantry_leg', 'generic_body'),
      {
        ...shape('gantry_wheel', 'compose_primitive'),
        kind: 'cylinder',
        axis: 'x',
        radius: 0.12,
        height: 0.08,
      },
    ])
    gantryArtifact.shapeDetails = 'gantry wheel uses cylindrical primitive geometry'

    const review = stage3QualityReview(
      '\u751f\u6210\u4e00\u4e2a\u9f99\u95e8\u540a\uff0c\u5305\u542b\u4e24\u4fa7\u95e8\u67b6\u7acb\u67f1\u3001\u6a2a\u6881\u3001\u8f68\u9053\u3001\u5c0f\u8f66\u3001\u540a\u94a9\u548c\u5e95\u90e8\u884c\u8d70\u8f6e',
      gantryArtifact,
    )

    expect(review.issues).not.toContain(
      'Stage3 round container main body must use round primitive geometry, not generic_body box.',
    )
    expect(review.repairPlan).toBeUndefined()
  })

  test('fails when generated artifact drops declared required equipment roles', () => {
    const towerArtifact = artifact([
      shape('tower_body', 'structural_tower_frame'),
      shape('slew_platform', 'generic_body'),
      shape('counterweight_set', 'generic_base'),
    ])
    towerArtifact.geometryBrief = {
      category: 'tower_crane',
      requiredRoles: ['tower_body', 'slew_platform', 'jib_arm', 'hook_assembly'],
    }

    const review = stage3QualityReview(
      '\u751f\u6210\u4e00\u4e2a\u5efa\u7b51\u5de5\u5730\u7684\u5854\u540a',
      towerArtifact,
    )

    expect(review.passed).toBe(false)
    expect(review.requiresModelRepair).toBe(true)
    expect(review.issues).toContain('Stage3 missing declared required role "jib_arm".')
    expect(review.issues).toContain('Stage3 missing declared required role "hook_assembly".')
  })

  test('fails bridge crane drafts with collapsed beam and hook topology', () => {
    const craneArtifact = artifact([
      {
        ...shape('left_leg_column', 'generic_body'),
        position: [0, 4, 0],
        length: 0.4,
        width: 0.4,
        height: 8,
      },
      {
        ...shape('main_girder', 'generic_body'),
        position: [0, 4, 0],
        length: 8,
        width: 0.7,
        height: 0.5,
      },
      {
        ...shape('trolley_frame', 'generic_body'),
        position: [0, 4, 0],
        length: 1,
        width: 0.6,
        height: 0.4,
      },
      {
        ...shape('hook_block', 'generic_spout'),
        position: [0, 4.2, 0],
        length: 0.3,
        width: 0.2,
        height: 0.5,
      },
      {
        ...shape('crane_wheel', 'wheel_set'),
        position: [0, 0.2, 0],
        kind: 'cylinder',
        radius: 0.2,
        height: 0.1,
      },
    ])
    craneArtifact.geometryBrief = {
      category: 'overhead_crane',
      requiredRoles: [
        'left_leg_column',
        'main_girder',
        'trolley_frame',
        'hook_block',
        'crane_wheel',
      ],
    }

    const review = stage3QualityReview(
      '\u751f\u6210\u4e00\u4e2a\u5929\u8f66\uff0c\u5e26\u6a2a\u6881\u3001\u5c0f\u8f66\u3001\u540a\u94a9\u548c\u8f68\u9053',
      craneArtifact,
    )

    expect(review.passed).toBe(false)
    expect(review.requiresModelRepair).toBe(true)
    expect(review.issues).toContain(
      'Stage3 lifting structure span/beam must be above its support/mast.',
    )
    expect(review.issues).toContain('Stage3 lifting hook must hang below the trolley/carriage.')
  })

  test('does not treat a hook-only trolley label as the trolley carrier', () => {
    const towerArtifact = artifact([
      {
        ...shape('tower_body', 'tower_column'),
        position: [0, 1, 0],
        length: 0.4,
        width: 0.4,
        height: 2,
      },
      {
        ...shape('jib_arm', 'boom_arm'),
        position: [0, 2.25, 0],
        length: 5,
        width: 0.18,
        height: 0.16,
      },
      {
        ...shape('trolley_hook', 'generic_hook'),
        position: [1.5, 1.55, 0],
        length: 0.25,
        width: 0.1,
        height: 0.35,
      },
    ])
    towerArtifact.geometryBrief = {
      category: 'tower_crane',
      requiredRoles: ['tower_body', 'jib_arm', 'trolley_hook'],
    }

    const review = stage3QualityReview('生成一个塔吊吊钩', towerArtifact)

    expect(review.issues).not.toContain('Stage3 lifting hook must hang below the trolley/carriage.')
  })

  test('fails lifting equipment drafts that contain unrelated aircraft geometry', () => {
    const towerArtifact = artifact([
      { ...shape('tower_body', 'tower_column'), position: [0, 1, 0], height: 2 },
      { ...shape('jib_arm', 'boom_arm'), position: [0, 2.2, 0], length: 5, height: 0.2 },
      { ...shape('aircraft_wing', 'wing_panel'), position: [0, 2.4, 0], length: 4, height: 0.1 },
    ])
    towerArtifact.geometryBrief = { category: 'tower_crane' }

    const review = stage3QualityReview('生成塔吊', towerArtifact)

    expect(review.passed).toBe(false)
    expect(review.requiresModelRepair).toBe(true)
    expect(review.issues).toContain(
      'Stage3 lifting equipment contains unrelated aircraft geometry.',
    )
  })

  test('fails outdoor AC drafts with pedestal fan stand parts or floating feet', () => {
    const acArtifact = artifact([
      { ...shape('condenser_body', 'generic_body'), position: [0, 0.6, 0], height: 1 },
      { ...shape('fan_grill', 'protective_grill'), position: [0, 0.6, 0.51], height: 0.6 },
      { ...shape('support_feet', 'support_feet'), position: [0, 0.55, 0], height: 0.1 },
      { ...shape('fan_pole', 'vertical_pole'), position: [0, 0.8, 0], height: 1 },
    ])
    acArtifact.geometryBrief = { category: 'outdoor_ac_unit' }

    const review = stage3QualityReview('生成室外空调机', acArtifact)

    expect(review.passed).toBe(false)
    expect(review.requiresModelRepair).toBe(true)
    expect(review.issues).toContain(
      'Stage3 outdoor enclosure must not include pedestal fan stand parts.',
    )
    expect(review.issues).toContain('Stage3 enclosure support feet must be below the main body.')
  })

  test('repairs generic lifting topology without adding device-specific routes', () => {
    const craneArtifact = artifact([
      { ...shape('tower_mast', 'generic_body'), position: [0, 2.5, 0], height: 5 },
      { ...shape('jib_boom', 'generic_body'), position: [0, 1, 0], length: 8, height: 0.4 },
      { ...shape('trolley', 'generic_body'), position: [0, 0.8, 0], height: 0.4 },
      { ...shape('hook_block', 'generic_body'), position: [0, 1.2, 0], height: 0.5 },
      { ...shape('aircraft_wing', 'wing_panel'), position: [0, 3, 0], length: 4, height: 0.1 },
    ])
    craneArtifact.geometryBrief = {
      category: 'tower_crane',
      requiredRoles: ['tower_mast', 'jib_boom', 'trolley', 'hook_block'],
    }

    const repaired = repairStage3SemanticArtifact('生成塔吊', craneArtifact)
    const review = repaired ? stage3QualityReview('生成塔吊', repaired.artifact) : undefined

    expect(repaired?.label).toBe('generic semantic topology repair')
    expect(repaired?.artifact.shapes.some((item) => item.semanticRole === 'aircraft_wing')).toBe(
      false,
    )
    expect(review?.passed).toBe(true)
  })

  test('normalizes tower crane topology with shared lifting equipment rules', () => {
    const towerArtifact = artifact([
      {
        ...shape('tower_mast', 'tower_column'),
        position: [0, 9, 0],
        length: 1.2,
        width: 1.2,
        height: 18,
      },
      {
        ...shape('main_jib', 'generic_body'),
        position: [5, 18.8, 0],
        length: 9,
        width: 0.35,
        height: 0.25,
      },
      {
        ...shape('counter_jib', 'generic_body'),
        position: [-2.2, 18.8, 0],
        length: 4,
        width: 0.35,
        height: 0.25,
      },
      {
        ...shape('tower_peak', 'generic_body'),
        position: [5, 22.4, 0],
        length: 0.4,
        width: 0.4,
        height: 1,
      },
      {
        ...shape('hook_block', 'generic_base'),
        position: [0, 15.6, 0],
        length: 0.3,
        width: 0.2,
        height: 0.45,
      },
      {
        ...shape('hook_block', 'generic_body'),
        position: [5, 22.9, 0],
        length: 0.3,
        width: 0.2,
        height: 0.45,
      },
    ])
    towerArtifact.geometryBrief = { category: 'tower_crane' }

    const repaired = repairStage3SemanticArtifact('生成一个建筑工地塔吊', towerArtifact)
    const next = repaired?.artifact
    const roles = next?.shapes.map((item) => item.semanticRole) ?? []
    const trolley = next?.shapes.find((item) => item.semanticRole === 'trolley')
    const rope = next?.shapes.find((item) => item.semanticRole === 'wire_rope')
    const hook = next?.shapes.find((item) => item.semanticRole === 'hook_block')
    const peak = next?.shapes.find((item) => item.semanticRole === 'tower_peak')

    expect(repaired?.label).toBe('generic semantic topology repair')
    expect(roles).toContain('trolley')
    expect(roles).toContain('wire_rope')
    expect(roles).toContain('pendant_cable')
    expect(next?.shapes.filter((item) => item.semanticRole === 'hook_block')).toHaveLength(1)
    expect(Math.abs((peak?.position?.[0] ?? 99) - 0)).toBeLessThan(0.05)
    expect(hook?.position?.[0]).toBeCloseTo(trolley?.position?.[0] ?? 0)
    expect(hook?.position?.[1] ?? 99).toBeLessThan(rope?.position?.[1] ?? 0)
    expect(rope?.position?.[1] ?? 99).toBeLessThan(trolley?.position?.[1] ?? 0)
    expect(next ? stage3QualityReview('tower crane', next).passed : false).toBe(true)
  })

  test('repairs outdoor enclosure feet and removes pedestal stand drift', () => {
    const acArtifact = artifact([
      { ...shape('condenser_body', 'generic_body'), position: [0, 0.6, 0], height: 1 },
      { ...shape('fan_guard', 'protective_grill'), position: [0, 0.6, 0.51], height: 0.6 },
      { ...shape('support_foot', 'generic_foot_set'), position: [0, 0.55, 0], height: 0.1 },
      { ...shape('fan_pole', 'vertical_pole'), position: [0, 0.8, 0], height: 1 },
    ])
    acArtifact.geometryBrief = { category: 'outdoor_ac_unit' }

    const repaired = repairStage3SemanticArtifact('生成室外空调机', acArtifact)
    const review = repaired ? stage3QualityReview('生成室外空调机', repaired.artifact) : undefined

    expect(repaired?.artifact.shapes.some((item) => item.semanticRole === 'fan_pole')).toBe(false)
    expect(review?.passed).toBe(true)
  })

  test('polishes lifting artifacts with frame, truss, and rope cues', () => {
    const craneArtifact = artifact([
      {
        ...shape('tower_mast', 'generic_body'),
        position: [0, 2.5, 0],
        length: 0.9,
        width: 0.9,
        height: 5,
      },
      {
        ...shape('main_jib', 'generic_body'),
        position: [2.5, 5.4, 0],
        length: 6,
        width: 0.5,
        height: 0.45,
      },
      {
        ...shape('trolley', 'generic_body'),
        position: [2.4, 5.15, 0],
        length: 0.6,
        width: 0.4,
        height: 0.3,
      },
      {
        ...shape('hook_block', 'generic_body'),
        position: [2.4, 3.6, 0],
        length: 0.25,
        width: 0.2,
        height: 0.35,
      },
    ])
    craneArtifact.geometryBrief = { category: 'tower_crane' }

    const polished = polishStage3SemanticArtifact('tower crane', craneArtifact)
    const roles = polished?.artifact.shapes.map((item) => item.semanticRole) ?? []

    expect(polished?.label).toBe('generic semantic visual polish')
    expect(roles).toContain('lattice_column')
    expect(roles).toContain('main_jib_truss_chord')
    expect(roles).toContain('wire_rope')
  })

  test('polishes outdoor enclosure face anchors and all feet', () => {
    const acArtifact = artifact([
      {
        ...shape('main_body', 'generic_body'),
        position: [0, 0.6, 0],
        length: 1.2,
        width: 0.5,
        height: 1,
      },
      {
        ...shape('front_fan_grille', 'protective_grill'),
        position: [0, 1.4, 0],
        length: 0.5,
        width: 0.1,
        height: 0.5,
      },
      {
        ...shape('side_heat_sink_vent', 'vent_grill'),
        position: [0, 1.2, 0],
        length: 0.5,
        width: 0.1,
        height: 0.4,
      },
      { ...shape('support_foot', 'generic_foot_set'), position: [-0.3, 0.7, -0.1], height: 0.1 },
      { ...shape('support_foot', 'generic_foot_set'), position: [0.3, 0.7, 0.1], height: 0.1 },
    ])
    acArtifact.geometryBrief = { category: 'outdoor_ac_unit' }

    const polished = polishStage3SemanticArtifact('outdoor ac unit', acArtifact)
    const front = polished?.artifact.shapes.find((item) => item.semanticRole === 'front_fan_grille')
    const side = polished?.artifact.shapes.find(
      (item) => item.semanticRole === 'side_heat_sink_vent',
    )
    const feet =
      polished?.artifact.shapes.filter((item) => item.semanticRole === 'support_foot') ?? []

    expect(front?.position?.[1]).toBeCloseTo(0.6)
    expect(front?.position?.[2]).toBeGreaterThan(0.25)
    expect(side?.position?.[0]).toBeLessThan(-0.55)
    expect(feet.every((item) => (item.position?.[1] ?? 1) < 0.1)).toBe(true)
  })

  test('moves outdoor AC fan impeller groups from side/top drift back to the front face', () => {
    const acArtifact = artifact([
      {
        ...shape('condenser_body', 'rounded_machine_body'),
        position: [0, 0.45, 0],
        length: 1.2,
        width: 0.5,
        height: 1,
      },
      {
        ...shape('fan_impeller', 'radial_blades'),
        position: [0.9, 1.1, 0],
        length: 0.12,
        width: 0.12,
        height: 0.12,
      },
      {
        ...shape('fan_impeller', 'radial_blades'),
        position: [1.05, 1.18, 0],
        length: 0.12,
        width: 0.12,
        height: 0.12,
      },
      {
        ...shape('protective_grill', 'protective_grill'),
        position: [0.9, 1.1, 0],
        length: 0.5,
        width: 0.05,
        height: 0.5,
      },
    ])
    acArtifact.geometryBrief = { category: 'outdoor_ac_unit' }

    const polished = polishStage3SemanticArtifact('outdoor ac unit', acArtifact)
    const fanParts =
      polished?.artifact.shapes.filter((item) => item.semanticRole === 'fan_impeller') ?? []
    const redundantProtectiveGrill =
      polished?.artifact.shapes.filter((item) => item.semanticRole === 'protective_grill') ?? []

    expect(fanParts.every((item) => Math.abs((item.position?.[0] ?? 99) - 0) < 0.2)).toBe(true)
    expect(fanParts.every((item) => (item.position?.[2] ?? 0) > 0.25)).toBe(true)
    expect(
      Math.abs((fanParts[1]?.position?.[1] ?? 0) - (fanParts[0]?.position?.[1] ?? 0)),
    ).toBeCloseTo(0.08)
    expect(redundantProtectiveGrill).toHaveLength(0)
  })

  test('passes canonical horizontal pressure tank output', () => {
    const review = stage3QualityReview(
      '生成一个卧式压力储罐，要有顶部接管、人孔法兰和鞍座支撑。',
      artifact([
        shape('vessel_shell', 'cylindrical_tank'),
        shape('vessel_head', 'cylindrical_tank'),
        shape('top_nozzle', 'cylindrical_tank'),
        shape('manway_flange', 'cylindrical_tank'),
        shape('saddle_support', 'cylindrical_tank'),
      ]),
    )

    expect(review.passed).toBe(true)
    expect(review.repairPlan).toBeUndefined()
  })

  test('repairs pressure tank output that drifted into fan machinery', () => {
    const review = stage3QualityReview(
      '生成一个卧式压力储罐，要有顶部接管、人孔法兰和鞍座支撑。',
      artifact([
        shape('machine_body', 'rounded_machine_body'),
        shape('fan_blades', 'radial_blades'),
        shape('protective_grill', 'vent_grill'),
      ]),
    )

    expect(review.passed).toBe(false)
    expect(review.score).toBeLessThan(0.75)
    expect(review.repairPlan).toMatchObject({
      label: 'canonical horizontal pressure tank',
      tool: 'compose_parts',
      args: {
        parts: [
          expect.objectContaining({ kind: 'cylindrical_tank', semanticRole: 'vessel_shell' }),
        ],
      },
    })
  })

  test('repairs inspection platform output that drifted into bicycle geometry', () => {
    const review = stage3QualityReview(
      '生成一个工业检修平台爬梯，要有护栏、爬梯侧轨和多根踏棍。',
      artifact([
        shape('bicycle_tire', 'wheel_set'),
        shape('bicycle_frame', 'tube_frame'),
        shape('handlebar', 'handlebar'),
      ]),
    )

    expect(review.passed).toBe(false)
    expect(review.repairPlan).toMatchObject({
      label: 'canonical industrial platform ladder',
      args: {
        parts: [
          expect.objectContaining({ kind: 'platform_ladder', semanticRole: 'access_platform' }),
        ],
      },
    })
  })
})
