import { describe, expect, test } from 'bun:test'
import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import { reviewAssemblyRealism } from './generated-assembly-realism-gate'
import { compileDsl } from './generated-geometry-dsl-compiler'

const GOOD_CONVEYOR = `
  belt({ id: 'belt', length: 6, width: 0.72 });
  rollerArray({ id: 'rollers', length: 6, width: 0.78, count: 8 });
  boxFrame({ id: 'frame', length: 6, width: 0.92, height: 0.78 });
  guardCover({ id: 'cover', target: 'belt', side: 'top', length: 3.8 });
  motor({ id: 'drive_motor', target: 'belt', side: 'right', position: 'rear' });
  inspectionDoor({ id: 'doors', target: 'cover', side: 'right', count: 2 });
  nameplate({ id: 'nameplate', target: 'cover', side: 'front' });
`

const NO_MOTOR_CONVEYOR = `
  belt({ id: 'belt', length: 6, width: 0.72 });
  rollerArray({ id: 'rollers', length: 6, width: 0.78, count: 8 });
  boxFrame({ id: 'frame', length: 6, width: 0.92, height: 0.78 });
  guardCover({ id: 'cover', target: 'belt', side: 'top', length: 3.8 });
`

const NO_GUARD_CONVEYOR = `
  belt({ id: 'belt', length: 6, width: 0.72 });
  rollerArray({ id: 'rollers', length: 6, width: 0.78, count: 8 });
  boxFrame({ id: 'frame', length: 6, width: 0.92, height: 0.78 });
  motor({ id: 'drive_motor', target: 'belt', side: 'right', position: 'rear' });
`

const SINGLE_BOX_GUARD_CONVEYOR = `
  part('belt.surface', box({ length: 6, width: 0.72, height: 0.055, material: 'plastic', color: '#222222' }))
    .atWorld([0, 0.82, 0])
    .withRole('belt');
  part('roller.0', cylinder({ radius: 0.03, height: 0.78, material: 'metal', color: '#cccccc' }))
    .atWorld([-2, 0.72, 0])
    .rotate({ axis: 'x', degrees: 90 })
    .withRole('roller');
  part('roller.1', cylinder({ radius: 0.03, height: 0.78, material: 'metal', color: '#cccccc' }))
    .atWorld([2, 0.72, 0])
    .rotate({ axis: 'x', degrees: 90 })
    .withRole('roller');
  part('frame.left', box({ length: 6, width: 0.04, height: 0.04, material: 'metal', color: '#aaaaaa' }))
    .atWorld([0, 0.78, -0.46])
    .withRole('support_frame');
  part('frame.right', box({ length: 6, width: 0.04, height: 0.04, material: 'metal', color: '#aaaaaa' }))
    .atWorld([0, 0.78, 0.46])
    .withRole('support_frame');
  part('motor.body', cylinder({ radius: 0.18, height: 0.5, material: 'metal', color: '#666666' }))
    .atWorld([-2.4, 0.84, 0.72])
    .rotate({ axis: 'z', degrees: 90 })
    .withRole('drive_motor');
  part('cover.single', box({ length: 3.8, width: 0.9, height: 0.5, material: 'glass', color: '#d4f0ff' }))
    .atWorld([0, 1.25, 0])
    .withRole('safety_guard_cover');
`

const GOOD_CONTROL_CABINET = `
  controlCabinet({ id: 'control_cabinet', width: 0.7, height: 1.4, depth: 0.35 });
`

const SINGLE_BOX_CONTROL_CABINET = `
  part('control_cabinet.body', box({ length: 0.7, width: 0.35, height: 1.4, material: 'metal', color: '#64748b' }))
    .atWorld([0, 0.7, 0])
    .withRole('control_cabinet');
`

const NO_PANEL_CONTROL_CABINET = `
  part('control_cabinet.body', box({ length: 0.7, width: 0.35, height: 1.4, material: 'metal', color: '#64748b', cornerRadius: 0.03, cornerSegments: 6 }))
    .atWorld([0, 0.7, 0])
    .withRole('control_cabinet');
  part('control_cabinet.door_seam', box({ length: 0.01, width: 0.008, height: 1.2, material: 'metal', color: '#111827' }))
    .atWorld([0, 0.7, 0.18])
    .withRole('cabinet_door_seam');
  part('control_cabinet.handle', cylinder({ radius: 0.014, height: 0.3, material: 'metal', color: '#111827', radialSegments: 20 }))
    .atWorld([0.24, 0.7, 0.21])
    .rotate({ axis: 'x', degrees: 90 })
    .withRole('cabinet_handle');
`

const GOOD_PUMP_SKID = `
  skidBase({ id: 'skid', length: 2.4, width: 0.9 });
  pumpCasing({ id: 'pump', target: 'skid', diameter: 0.52 });
  motor({ id: 'drive_motor', target: 'skid', side: 'right', position: 'rear' });
  flangePort({ id: 'inlet', target: 'pump', side: 'front', nominalDiameter: 0.18 });
  flangePort({ id: 'outlet', target: 'pump', side: 'top', nominalDiameter: 0.16 });
  pipeRun({ id: 'process_pipe', from: [-0.6, 0.6, -0.8], to: [0.8, 0.6, -0.8], radius: 0.05 });
  sheetCover({ id: 'coupling_guard', target: 'drive_motor', side: 'top' });
  nameplate({ id: 'nameplate', target: 'skid', side: 'front' });
`

const RAW_PUMP_SKID = `
  part('skid.slab', box({ length: 2.4, width: 0.9, height: 0.12, material: 'metal', color: '#666666' }))
    .atWorld([0, 0.06, 0])
    .withRole('skid_base');
  part('pump.body', cylinder({ radius: 0.26, height: 0.36, material: 'metal', color: '#888888', radialSegments: 12 }))
    .atWorld([-0.35, 0.45, 0])
    .rotate({ axis: 'z', degrees: 90 })
    .withRole('volute_casing');
  part('motor.body', cylinder({ radius: 0.22, height: 0.58, material: 'metal', color: '#555555', radialSegments: 16 }))
    .atWorld([0.55, 0.42, 0])
    .rotate({ axis: 'z', degrees: 90 })
    .withRole('drive_motor');
`

const NO_NOZZLE_PUMP_SKID = `
  skidBase({ id: 'skid', length: 2.4, width: 0.9 });
  part('pump.body', cylinder({ radius: 0.26, height: 0.36, material: 'painted_steel', color: '#2563eb', radialSegments: 64 }))
    .atWorld([-0.35, 0.45, 0])
    .rotate({ axis: 'z', degrees: 90 })
    .withRole('volute_casing');
  motor({ id: 'drive_motor', target: 'skid', side: 'right', position: 'rear' });
  part('inlet.flange', cylinder({ radius: 0.14, height: 0.05, material: 'cast_iron', color: '#64748b', radialSegments: 48 }))
    .atWorld([-0.35, 0.45, -0.3])
    .rotate({ axis: 'x', degrees: 90 })
    .withRole('flange_port');
  part('outlet.flange', cylinder({ radius: 0.12, height: 0.05, material: 'cast_iron', color: '#64748b', radialSegments: 48 }))
    .atWorld([-0.35, 0.75, 0])
    .withRole('flange_port');
  pipeRun({ id: 'process_pipe', from: [-0.6, 0.6, -0.8], to: [0.8, 0.6, -0.8], radius: 0.05 });
  sheetCover({ id: 'coupling_guard', target: 'drive_motor', side: 'top' });
  nameplate({ id: 'nameplate', target: 'skid', side: 'front' });
`

function makePrimitiveConveyor(): AssemblyIR {
  return {
    schemaVersion: 1,
    generator: { sourceHash: 'src', apiVersion: '1.1.0', paramsHash: 'params' },
    parts: Array.from({ length: 6 }, (_, i) => ({
      id: `conveyor.box.${i}`,
      transform: {
        space: 'world' as const,
        position: [i, 0, 0] as [number, number, number],
        rotation: [0, 0, 0, 1] as [number, number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      },
      geometry: {
        kind: 'primitive-recipe' as const,
        recipeId: 'primitive.box',
        params: { length: 1, width: 0.5, height: 0.1 },
      },
      material: {},
      fingerprint: `fp-${i}`,
    })),
    constraints: [],
  }
}

describe('reviewAssemblyRealism', () => {
  test('does not apply industrial rules to non-industrial DSL output', () => {
    const result = compileDsl(
      "part('ball', sphere({ radius: 0.5, color: '#cc0000' })).atWorld([0, 0.5, 0]);",
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const review = reviewAssemblyRealism(result.ir)
    expect(review.applicable).toBe(false)
    expect(review.passed).toBe(true)
  })

  test('passes a semantic guarded conveyor generated by the equipment SDK', () => {
    const result = compileDsl(GOOD_CONVEYOR)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const review = reviewAssemblyRealism(result.ir, { source: GOOD_CONVEYOR })
    expect(review.applicable).toBe(true)
    expect(review.family).toBe('belt_conveyor')
    expect(review.passed).toBe(true)
    expect(review.evidence.anonymousPrimitiveRatio).toBe(0)
    expect(review.evidence.materialPresetRatio).toBe(1)
  })

  test('rejects anonymous primitive conveyor-shaped output', () => {
    const review = reviewAssemblyRealism(makePrimitiveConveyor(), {
      source: "part('conveyor.box.0', box({ length: 1, width: 1, height: 1 }))",
    })

    expect(review.applicable).toBe(true)
    expect(review.passed).toBe(false)
    expect(review.issues.some((i) => i.startsWith('realism_missing_required_role'))).toBe(true)
    expect(review.issues.some((i) => i.startsWith('realism_anonymous_primitive_ratio'))).toBe(true)
  })

  test('rejects a conveyor without a drive motor', () => {
    const result = compileDsl(NO_MOTOR_CONVEYOR)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const review = reviewAssemblyRealism(result.ir, { source: NO_MOTOR_CONVEYOR })
    expect(review.passed).toBe(false)
    expect(review.issues).toContain(
      'realism_missing_required_role: belt_conveyor must include semantic role "drive_motor".',
    )
  })

  test('rejects a guarded conveyor request without guard cover parts', () => {
    const result = compileDsl(NO_GUARD_CONVEYOR)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const review = reviewAssemblyRealism(result.ir, {
      source: `// guarded conveyor\n${NO_GUARD_CONVEYOR}`,
    })
    expect(review.passed).toBe(false)
    expect(review.issues).toContain(
      'realism_guard_missing: guarded conveyor requests must include guardCover()/safety_guard_cover parts.',
    )
  })

  test('rejects a guarded conveyor approximated with a single cover box and bare motor cylinder', () => {
    const result = compileDsl(SINGLE_BOX_GUARD_CONVEYOR)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const review = reviewAssemblyRealism(result.ir, { source: SINGLE_BOX_GUARD_CONVEYOR })
    expect(review.passed).toBe(false)
    expect(review.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('realism_low_roller_count'),
        expect.stringContaining('realism_material_preset_ratio'),
        expect.stringContaining('realism_motor_detail_missing'),
        expect.stringContaining('realism_support_leg_count'),
        expect.stringContaining('realism_guard_too_simple'),
        expect.stringContaining('realism_sheet_metal_sharp'),
      ]),
    )
  })

  test('passes a semantic control cabinet generated by the equipment SDK', () => {
    const result = compileDsl(GOOD_CONTROL_CABINET)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const review = reviewAssemblyRealism(result.ir, { source: GOOD_CONTROL_CABINET })
    expect(review.applicable).toBe(true)
    expect(review.family).toBe('control_cabinet')
    expect(review.passed).toBe(true)
    expect(review.evidence.partCount).toBeGreaterThanOrEqual(5)
    expect(review.evidence.materialPresetRatio).toBe(1)
  })

  test('rejects a control cabinet approximated as a single raw box', () => {
    const result = compileDsl(SINGLE_BOX_CONTROL_CABINET)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const review = reviewAssemblyRealism(result.ir, { source: SINGLE_BOX_CONTROL_CABINET })
    expect(review.family).toBe('control_cabinet')
    expect(review.passed).toBe(false)
    expect(review.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('realism_missing_required_role'),
        expect.stringContaining('realism_material_preset_ratio'),
        expect.stringContaining('realism_cabinet_under_detailed'),
        expect.stringContaining('realism_cabinet_body_sharp'),
        expect.stringContaining('realism_cabinet_missing_operator_panel'),
        expect.stringContaining('realism_cabinet_missing_nameplate'),
      ]),
    )
  })

  test('rejects a control cabinet missing operator panel and nameplate details', () => {
    const result = compileDsl(NO_PANEL_CONTROL_CABINET)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const review = reviewAssemblyRealism(result.ir, { source: NO_PANEL_CONTROL_CABINET })
    expect(review.passed).toBe(false)
    expect(review.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('realism_cabinet_under_detailed'),
        expect.stringContaining('realism_cabinet_missing_operator_panel'),
        expect.stringContaining('realism_cabinet_missing_nameplate'),
      ]),
    )
  })

  test('passes a semantic pump skid generated by the equipment SDK', () => {
    const result = compileDsl(GOOD_PUMP_SKID)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const review = reviewAssemblyRealism(result.ir, { source: GOOD_PUMP_SKID })
    expect(review.applicable).toBe(true)
    expect(review.family).toBe('pump_skid')
    expect(review.passed).toBe(true)
    expect(review.evidence.anonymousPrimitiveRatio).toBe(0)
    expect(review.evidence.materialPresetRatio).toBe(1)
  })

  test('rejects a pump skid approximated with raw primitives', () => {
    const result = compileDsl(RAW_PUMP_SKID)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const review = reviewAssemblyRealism(result.ir, { source: RAW_PUMP_SKID })
    expect(review.family).toBe('pump_skid')
    expect(review.passed).toBe(false)
    expect(review.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('realism_missing_required_role'),
        expect.stringContaining('realism_material_preset_ratio'),
        expect.stringContaining('realism_pump_under_detailed'),
        expect.stringContaining('realism_pump_casing_faceting'),
        expect.stringContaining('realism_pump_nozzles_missing'),
        expect.stringContaining('realism_pump_flange_count'),
        expect.stringContaining('realism_pump_skid_too_simple'),
        expect.stringContaining('realism_pump_motor_detail_missing'),
        expect.stringContaining('realism_pump_motor_faceting'),
      ]),
    )
  })

  test('rejects a pump skid missing suction and discharge nozzles', () => {
    const result = compileDsl(NO_NOZZLE_PUMP_SKID)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const review = reviewAssemblyRealism(result.ir, { source: NO_NOZZLE_PUMP_SKID })
    expect(review.family).toBe('pump_skid')
    expect(review.passed).toBe(false)
    expect(review.issues).toContain(
      'realism_pump_nozzles_missing: pump casing must include distinct suction and discharge nozzles.',
    )
  })
})
