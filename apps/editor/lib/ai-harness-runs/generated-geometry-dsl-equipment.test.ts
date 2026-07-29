import { describe, expect, test } from 'bun:test'
import { compileDsl } from './generated-geometry-dsl-compiler'

const GUARDED_CONVEYOR_DSL = `
  equipment('belt_conveyor', { id: 'conveyor' });
  belt({ id: 'belt', length: 6, width: 0.72 });
  rollerArray({ id: 'rollers', length: 6, width: 0.78, count: 8 });
  boxFrame({ id: 'frame', length: 6, width: 0.92, height: 0.78 });
  guardCover({ id: 'cover', target: 'belt', side: 'top', length: 3.8 });
  motor({ id: 'drive_motor', target: 'belt', side: 'right', position: 'rear' });
  inspectionDoor({ id: 'doors', target: 'cover', side: 'right', count: 2 });
  nameplate({ id: 'nameplate', target: 'cover', side: 'front' });
`

describe('compileDsl — equipment semantic constructors', () => {
  test('rejects wrapping equipment semantic constructors inside part()', () => {
    const result = compileDsl(`
      part('robot_arm.base', box({ length: 0.8, width: 0.8, height: 0.2 })).atWorld([0, 0.1, 0]);
      part('robot_arm.nameplate', nameplate({ id: 'robot_arm.nameplate', target: 'robot_arm.base', side: 'front' }));
    `)

    expect(result.ok).toBe(false)
    expect(
      result.diagnostics.some((d) => d.code === 'dsl_equipment_constructor_wrapped_in_part'),
    ).toBe(true)
    expect(result.diagnostics.map((d) => d.message).join('\n')).toContain(
      'must be called as top-level statements',
    )
  })

  test('compiles a guarded conveyor through the existing DSL pipeline', () => {
    const result = compileDsl(GUARDED_CONVEYOR_DSL)
    if (!result.ok) {
      console.log(JSON.stringify(result.diagnostics, null, 2))
    }

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.ir.parts.length).toBeGreaterThanOrEqual(40)
    const roles = new Set(result.ir.parts.map((p) => p.semanticRole))
    expect(roles.has('belt')).toBe(true)
    expect(roles.has('roller')).toBe(true)
    expect(roles.has('support_frame')).toBe(true)
    expect(roles.has('safety_guard_cover')).toBe(true)
    expect(roles.has('drive_motor')).toBe(true)
    expect(roles.has('inspection_door')).toBe(true)
    expect(roles.has('equipment_nameplate')).toBe(true)
  })

  test('preserves realism parameters in primitive recipe params and material fields', () => {
    const result = compileDsl(GUARDED_CONVEYOR_DSL)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const topPanel = result.ir.parts.find((p) => p.id === 'cover.top_panel')
    expect(topPanel?.geometry.params.cornerRadius).toBeGreaterThan(0)
    expect(topPanel?.material.opacity).toBeLessThan(1)

    const motorBody = result.ir.parts.find((p) => p.id === 'drive_motor.ribbed_body')
    expect(motorBody?.geometry.params.radialSegments).toBeGreaterThanOrEqual(48)
    expect(motorBody?.material.roughness).toBeGreaterThan(0)
  })

  test('lets dependent equipment parts resolve aggregate targets by base id', () => {
    const result = compileDsl(GUARDED_CONVEYOR_DSL)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const door = result.ir.parts.find((p) => p.id === 'doors.door.0.panel')
    const cover = result.ir.parts.find((p) => p.id === 'cover.front_panel')
    expect(door).toBeDefined()
    expect(cover).toBeDefined()
    expect(door?.transform.position[1]).toBeGreaterThan(1)
  })

  test('compiles broader industrial SDK constructors through the same DSL pipeline', () => {
    const result = compileDsl(`
      controlCabinet({ id: 'control_cabinet', width: 0.7, height: 1.4, depth: 0.35 });
      sheetCover({ id: 'cabinet_top_cover', target: 'control_cabinet', side: 'top' });
      flangePort({ id: 'cabinet_inlet', target: 'control_cabinet', side: 'front', nominalDiameter: 0.16 });
      pipeRun({ id: 'process_pipe', from: [-1, 1, 0.4], to: [1, 1, 0.4], radius: 0.05 });
    `)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const roles = new Set(result.ir.parts.map((p) => p.semanticRole))
    expect(roles.has('control_cabinet')).toBe(true)
    expect(roles.has('control_panel_glass')).toBe(true)
    expect(roles.has('sheet_cover_panel')).toBe(true)
    expect(roles.has('flange_port')).toBe(true)
    expect(roles.has('pipe_run')).toBe(true)
    expect(roles.has('pipe_flange')).toBe(true)

    const pipe = result.ir.parts.find((p) => p.semanticRole === 'pipe_run')
    expect(pipe?.geometry.recipeId).toBe('primitive.sweep')
    expect(pipe?.geometry.params.radialSegments).toBeGreaterThanOrEqual(32)
  })

  test('lets equipment constructors target raw part() assemblies by id', () => {
    const result = compileDsl(`
      part('robot_arm.shoulder', cylinder({ radius: 0.16, height: 0.42, material: 'metal' })).atWorld([0, 0.9, 0]).withRole('robot_joint');
      part('robot_arm.elbow', cylinder({ radius: 0.13, height: 0.34, material: 'metal' })).atWorld([0.7, 1.45, 0]).withRole('robot_joint');
      part('robot_arm.wrist', cylinder({ radius: 0.1, height: 0.26, material: 'metal' })).atWorld([1.15, 1.75, 0]).withRole('robot_joint');
      motor({ id: 'robot_arm.shoulder_motor', target: 'robot_arm.shoulder', side: 'right', position: 'center', diameter: 0.18 });
      motor({ id: 'robot_arm.elbow_motor', target: 'robot_arm.elbow', side: 'right', position: 'center', diameter: 0.18 });
      motor({ id: 'robot_arm.wrist_motor', target: 'robot_arm.wrist', side: 'right', position: 'center', diameter: 0.18 });
    `)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const capPositions = [
      result.ir.parts.find((p) => p.id === 'robot_arm.shoulder_motor.front_end_cap'),
      result.ir.parts.find((p) => p.id === 'robot_arm.elbow_motor.front_end_cap'),
      result.ir.parts.find((p) => p.id === 'robot_arm.wrist_motor.front_end_cap'),
    ].map((part) => {
      expect(part).toBeDefined()
      return part?.transform.position.join(',')
    })

    expect(new Set(capPositions).size).toBe(3)
  })

  test('compiles gearbox and bearing block constructors through the same DSL pipeline', () => {
    const result = compileDsl(`
      belt({ id: 'belt', length: 5.2, width: 0.68 });
      gearbox({ id: 'gearbox', target: 'belt', side: 'right', position: 'rear' });
      bearingBlock({ id: 'rear_bearing', target: 'belt', side: 'right', position: 'rear' });
    `)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const roles = new Set(result.ir.parts.map((p) => p.semanticRole))
    expect(roles.has('gearbox_housing')).toBe(true)
    expect(roles.has('gearbox_input_shaft')).toBe(true)
    expect(roles.has('gearbox_output_shaft')).toBe(true)
    expect(roles.has('bearing_block')).toBe(true)
    expect(roles.has('bearing_ring')).toBe(true)

    const gearbox = result.ir.parts.find((p) => p.semanticRole === 'gearbox_housing')
    const bearing = result.ir.parts.find((p) => p.semanticRole === 'bearing_ring')
    expect(gearbox?.geometry.params.cornerRadius).toBeGreaterThan(0)
    expect(bearing?.geometry.params.radialSegments).toBeGreaterThanOrEqual(48)
  })

  test('compiles platform ladder and handrail constructors through the same DSL pipeline', () => {
    const result = compileDsl(`
      skidBase({ id: 'skid', length: 2.4, width: 0.9 });
      platform({ id: 'service_platform', target: 'skid', side: 'front' });
      ladder({ id: 'access_ladder', target: 'service_platform', side: 'front' });
      handrail({ id: 'platform_handrail', target: 'service_platform', side: 'all' });
    `)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const roles = new Set(result.ir.parts.map((p) => p.semanticRole))
    expect(roles.has('platform_grating')).toBe(true)
    expect(roles.has('platform_support_leg')).toBe(true)
    expect(roles.has('ladder_side_rail')).toBe(true)
    expect(roles.has('ladder_rung')).toBe(true)
    expect(roles.has('handrail_top_rail')).toBe(true)
    expect(roles.has('handrail_post')).toBe(true)
  })

  test('compiles pump skid SDK constructors through the same DSL pipeline', () => {
    const result = compileDsl(`
      skidBase({ id: 'skid', length: 2.4, width: 0.9 });
      pumpCasing({ id: 'pump', target: 'skid', diameter: 0.52 });
      motor({ id: 'drive_motor', target: 'skid', side: 'right', position: 'rear' });
      flangePort({ id: 'inlet', target: 'pump', side: 'front', nominalDiameter: 0.18 });
      flangePort({ id: 'outlet', target: 'pump', side: 'top', nominalDiameter: 0.16 });
      pipeRun({ id: 'process_pipe', from: [-0.6, 0.6, -0.8], to: [0.8, 0.6, -0.8], radius: 0.05 });
      sheetCover({ id: 'coupling_guard', target: 'drive_motor', side: 'top' });
      nameplate({ id: 'nameplate', target: 'skid', side: 'front' });
    `)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const roles = new Set(result.ir.parts.map((p) => p.semanticRole))
    expect(roles.has('skid_base')).toBe(true)
    expect(roles.has('volute_casing')).toBe(true)
    expect(roles.has('drive_motor')).toBe(true)
    expect(roles.has('flange_port')).toBe(true)
    expect(roles.has('pipe_run')).toBe(true)
    expect(roles.has('sheet_cover_panel')).toBe(true)
  })

  test('compiles fan and blower package constructors through the same DSL pipeline', () => {
    const result = compileDsl(`
      centrifugalFan({ id: 'fan', diameter: 1.2, includeMotor: true });
      blowerPackage({ id: 'blower', length: 3.2, width: 1.3, fanDiameter: 0.95 });
    `)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const roles = new Set(result.ir.parts.map((p) => p.semanticRole))
    expect(roles.has('fan_volute_casing')).toBe(true)
    expect(roles.has('fan_inlet_ring')).toBe(true)
    expect(roles.has('fan_outlet_duct')).toBe(true)
    expect(roles.has('fan_impeller_blade')).toBe(true)
    expect(roles.has('drive_motor')).toBe(true)
    expect(roles.has('coupling_guard')).toBe(true)
    expect(roles.has('inlet_silencer')).toBe(true)
    expect(roles.has('inlet_filter')).toBe(true)
    expect(roles.has('flange_port')).toBe(true)
  })

  test('compiles process vessel and dust collector constructors through the same DSL pipeline', () => {
    const result = compileDsl(`
      verticalVessel({ id: 'buffer_tank', diameter: 1.4, height: 3.6, includeLadder: true });
      dustCollector({ id: 'baghouse', width: 2.0, depth: 1.2, height: 4.2, bagCount: 6 });
    `)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const roles = new Set(result.ir.parts.map((p) => p.semanticRole))
    expect(roles.has('vessel_shell')).toBe(true)
    expect(roles.has('vessel_head')).toBe(true)
    expect(roles.has('flange_port')).toBe(true)
    expect(roles.has('filter_body')).toBe(true)
    expect(roles.has('bottom_discharge_hopper')).toBe(true)
    expect(roles.has('pulse_valve')).toBe(true)

    const vesselShell = result.ir.parts.find((p) => p.semanticRole === 'vessel_shell')
    const hopper = result.ir.parts.find((p) => p.semanticRole === 'bottom_discharge_hopper')
    expect(vesselShell?.geometry.params.radialSegments).toBeGreaterThanOrEqual(64)
    expect(hopper?.geometry.recipeId).toBe('primitive.frustum')
  })

  test('compiles heat exchanger constructor through the same DSL pipeline', () => {
    const result = compileDsl(`
      heatExchanger({ id: 'exchanger', length: 3.6, diameter: 0.9, tubeCount: 12 });
    `)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const roles = new Set(result.ir.parts.map((p) => p.semanticRole))
    expect(roles.has('heat_exchanger_shell')).toBe(true)
    expect(roles.has('tube_sheet')).toBe(true)
    expect(roles.has('channel_head')).toBe(true)
    expect(roles.has('tube_bundle')).toBe(true)
    expect(roles.has('saddle_support')).toBe(true)
    expect(roles.has('flange_port')).toBe(true)
  })

  test('compiles agitator tank constructor through the same DSL pipeline', () => {
    const result = compileDsl(`
      agitatorTank({ id: 'reactor', diameter: 1.5, height: 3.6, bladeCount: 4 });
    `)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const roles = new Set(result.ir.parts.map((p) => p.semanticRole))
    expect(roles.has('reactor_vessel_shell')).toBe(true)
    expect(roles.has('vessel_head')).toBe(true)
    expect(roles.has('agitator_motor')).toBe(true)
    expect(roles.has('agitator_gearbox')).toBe(true)
    expect(roles.has('agitator_shaft')).toBe(true)
    expect(roles.has('agitator_impeller_blade')).toBe(true)
    expect(roles.has('flange_port')).toBe(true)
  })
})
