import { describe, expect, test } from 'bun:test'
import {
  buildAgitatorTank,
  buildBearingBlock,
  buildControlCabinet,
  buildDustCollector,
  buildFlangePort,
  buildGearbox,
  buildGuardCover,
  buildHandrail,
  buildHeatExchanger,
  buildInspectionDoor,
  buildLadder,
  buildMotor,
  buildPipeRun,
  buildPlatform,
  buildPumpCasing,
  buildSheetCover,
  buildSkidBase,
  buildVerticalVessel,
  EQUIPMENT_MATERIALS,
  type EquipmentBounds,
} from './equipment-functions'

const beltBounds: EquipmentBounds = {
  id: 'belt',
  center: [0, 0.82, 0],
  size: [6, 0.055, 0.72],
  semanticRole: 'belt',
}

const context = {
  resolveTarget: (id: string | undefined) =>
    id === 'belt' || id === 'cover' ? beltBounds : undefined,
}

describe('equipment SDK realism builders', () => {
  test('guardCover builds a target-aware transparent safety cover with frame and mounts', () => {
    const parts = buildGuardCover({ id: 'cover', target: 'belt', side: 'top' }, context)

    expect(parts.length).toBeGreaterThanOrEqual(13)
    expect(parts.some((p) => p.semanticRole === 'safety_guard_cover')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'cover_frame_rail')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'cover_mounting_bracket')).toBe(true)

    const topPanel = parts.find((p) => p.id === 'cover.top_panel')
    expect(topPanel?.material).toBe('transparent_polycarbonate')
    expect(topPanel?.params.cornerRadius).toBeGreaterThan(0)
    expect(topPanel?.bounds?.center[1]).toBeGreaterThan(beltBounds.center[1])
  })

  test('motor builds recognizable high-segment industrial motor details', () => {
    const parts = buildMotor({ id: 'drive_motor', target: 'belt', side: 'right' }, context)

    expect(parts.length).toBeGreaterThanOrEqual(6)
    expect(parts.some((p) => p.semanticRole === 'drive_motor')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'motor_terminal_box')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'motor_mounting_foot').length).toBe(2)

    const body = parts.find((p) => p.id === 'drive_motor.ribbed_body')
    expect(body?.kind).toBe('cylinder')
    expect(body?.params.radialSegments).toBeGreaterThanOrEqual(48)
  })

  test('gearbox builds cast housing with shafts, feet, cover bolts and nameplate', () => {
    const parts = buildGearbox({ id: 'gearbox', target: 'belt', side: 'right' }, context)

    expect(parts.length).toBeGreaterThanOrEqual(11)
    expect(parts.some((p) => p.semanticRole === 'gearbox_housing')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'gearbox_input_shaft')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'gearbox_output_shaft')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'gearbox_mounting_foot').length).toBe(2)
    expect(parts.filter((p) => p.semanticRole === 'gearbox_cover_bolt').length).toBe(4)

    const housing = parts.find((p) => p.semanticRole === 'gearbox_housing')
    expect(housing?.material).toBe('cast_iron')
    expect(housing?.params.cornerRadius).toBeGreaterThan(0)
  })

  test('bearingBlock builds a pillow block with bearing ring, shaft and mounting bolts', () => {
    const parts = buildBearingBlock({ id: 'bearing', target: 'belt', side: 'right' }, context)

    expect(parts.length).toBeGreaterThanOrEqual(6)
    expect(parts.some((p) => p.semanticRole === 'bearing_block')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'bearing_ring')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'bearing_shaft')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'bearing_mounting_bolt').length).toBe(2)

    const ring = parts.find((p) => p.semanticRole === 'bearing_ring')
    expect(ring?.kind).toBe('cylinder')
    expect(ring?.params.radialSegments).toBeGreaterThanOrEqual(48)
  })

  test('platform builds grating, edge beams and support legs', () => {
    const parts = buildPlatform({ id: 'service_platform', target: 'belt', side: 'front' }, context)

    expect(parts.some((p) => p.semanticRole === 'platform_grating')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'platform_edge_beam').length).toBe(2)
    expect(
      parts.filter((p) => p.semanticRole === 'platform_support_leg').length,
    ).toBeGreaterThanOrEqual(4)
    expect(parts[0]?.material).toBe('wire_mesh')
    expect(parts[0]?.params.cornerRadius).toBeGreaterThan(0)
  })

  test('ladder builds side rails and repeated rungs at human scale', () => {
    const parts = buildLadder({ id: 'access_ladder', target: 'belt', side: 'front' }, context)

    expect(parts.filter((p) => p.semanticRole === 'ladder_side_rail').length).toBe(2)
    expect(parts.filter((p) => p.semanticRole === 'ladder_rung').length).toBeGreaterThanOrEqual(4)
    expect(
      parts.find((p) => p.semanticRole === 'ladder_rung')?.params.radialSegments,
    ).toBeGreaterThanOrEqual(20)
  })

  test('handrail builds top rails, mid rails and posts', () => {
    const parts = buildHandrail({ id: 'handrail', target: 'belt', side: 'front' }, context)

    expect(parts.some((p) => p.semanticRole === 'handrail_top_rail')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'handrail_mid_rail')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'handrail_post').length).toBeGreaterThanOrEqual(2)
    expect(
      parts.find((p) => p.semanticRole === 'handrail_top_rail')?.params.radialSegments,
    ).toBeGreaterThanOrEqual(24)
  })

  test('inspectionDoor creates panel handle and hinge details instead of anonymous boxes', () => {
    const parts = buildInspectionDoor({ id: 'door', target: 'belt', count: 2 }, context)

    expect(parts.filter((p) => p.semanticRole === 'inspection_door').length).toBe(2)
    expect(parts.filter((p) => p.semanticRole === 'door_handle').length).toBe(2)
    expect(parts.filter((p) => p.semanticRole === 'door_hinge').length).toBe(2)
  })

  test('sheetCover creates a rounded cover panel with stiffeners', () => {
    const parts = buildSheetCover({ id: 'cover2', target: 'belt', side: 'top' }, context)

    expect(parts.some((p) => p.semanticRole === 'sheet_cover_panel')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'cover_stiffener').length).toBe(2)
    expect(parts[0]?.params.cornerRadius).toBeGreaterThan(0)
    expect(parts[0]?.material).toBe('painted_steel')
  })

  test('flangePort creates a high-segment nozzle and flange ring', () => {
    const parts = buildFlangePort({ id: 'inlet', target: 'belt', nominalDiameter: 0.2 }, context)

    expect(parts.map((p) => p.semanticRole)).toEqual(['flange_port', 'flange_ring'])
    expect(parts[0]?.params.radialSegments).toBeGreaterThanOrEqual(48)
    expect(parts[1]?.material).toBe('cast_iron')
  })

  test('pipeRun creates a swept pipe with optional flanges', () => {
    const parts = buildPipeRun({ id: 'pipe', from: [-1, 1, 0], to: [1, 1, 0], radius: 0.05 })

    expect(parts[0]?.kind).toBe('sweep')
    expect(parts[0]?.semanticRole).toBe('pipe_run')
    expect(parts.filter((p) => p.semanticRole === 'pipe_flange').length).toBe(2)
  })

  test('controlCabinet creates recognizable electrical cabinet details', () => {
    const parts = buildControlCabinet({ id: 'cabinet', target: 'belt', side: 'right' }, context)

    expect(parts.some((p) => p.semanticRole === 'control_cabinet')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'control_panel_glass')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'cabinet_handle')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'equipment_nameplate')).toBe(true)
  })

  test('skidBase creates steel rails and cross members for package equipment', () => {
    const parts = buildSkidBase({ id: 'skid', length: 2.4, width: 0.9 })

    expect(parts.filter((p) => p.semanticRole === 'skid_base').length).toBe(2)
    expect(parts.filter((p) => p.semanticRole === 'skid_cross_member').length).toBe(2)
    expect(parts[0]?.params.cornerRadius).toBeGreaterThan(0)
  })

  test('pumpCasing creates a recognizable centrifugal casing with nozzles', () => {
    const parts = buildPumpCasing({ id: 'pump', target: 'belt', diameter: 0.5 }, context)

    expect(parts.some((p) => p.semanticRole === 'volute_casing')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'pump_suction_nozzle')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'pump_discharge_nozzle')).toBe(true)
    expect(parts.find((p) => p.semanticRole === 'volute_casing')?.params.radialSegments).toBe(64)
  })

  test('verticalVessel creates a detailed vessel with heads ports access and nameplate', () => {
    const parts = buildVerticalVessel({ id: 'tank', diameter: 1.4, height: 3.4 })

    expect(parts.some((p) => p.semanticRole === 'vessel_shell')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'vessel_head').length).toBe(2)
    expect(parts.filter((p) => p.semanticRole === 'flange_port').length).toBeGreaterThanOrEqual(3)
    expect(parts.some((p) => p.semanticRole === 'inspection_door')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'equipment_nameplate')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'ladder_rung').length).toBeGreaterThanOrEqual(6)
    expect(parts.find((p) => p.semanticRole === 'vessel_shell')?.params.radialSegments).toBe(72)
  })

  test('dustCollector creates a baghouse body hopper ducts supports pulse valves and access', () => {
    const parts = buildDustCollector({ id: 'baghouse', width: 2, depth: 1.2, height: 4 })

    expect(parts.some((p) => p.semanticRole === 'filter_body')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'bottom_discharge_hopper')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'inlet_duct')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'outlet_duct')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'support_leg').length).toBe(4)
    expect(parts.filter((p) => p.semanticRole === 'pulse_valve').length).toBeGreaterThanOrEqual(4)
    expect(parts.some((p) => p.semanticRole === 'inspection_door')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'equipment_nameplate')).toBe(true)
  })

  test('heatExchanger creates shell tube sheets bundle saddles ports and nameplate', () => {
    const parts = buildHeatExchanger({
      id: 'exchanger',
      length: 3.4,
      diameter: 0.82,
      tubeCount: 10,
    })

    expect(parts.some((p) => p.semanticRole === 'heat_exchanger_shell')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'tube_sheet').length).toBe(2)
    expect(parts.filter((p) => p.semanticRole === 'channel_head').length).toBe(2)
    expect(parts.filter((p) => p.semanticRole === 'tube_bundle').length).toBeGreaterThanOrEqual(6)
    expect(parts.filter((p) => p.semanticRole === 'saddle_support').length).toBe(2)
    expect(parts.filter((p) => p.semanticRole === 'flange_port').length).toBeGreaterThanOrEqual(4)
    expect(parts.some((p) => p.semanticRole === 'equipment_nameplate')).toBe(true)
    expect(
      parts.find((p) => p.semanticRole === 'heat_exchanger_shell')?.params.radialSegments,
    ).toBe(72)
  })

  test('agitatorTank creates reactor vessel motor gearbox agitator ports access and nameplate', () => {
    const parts = buildAgitatorTank({ id: 'reactor', diameter: 1.5, height: 3.6, bladeCount: 4 })

    expect(parts.some((p) => p.semanticRole === 'reactor_vessel_shell')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'vessel_head').length).toBe(2)
    expect(parts.some((p) => p.semanticRole === 'agitator_motor')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'agitator_gearbox')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'agitator_shaft')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'agitator_impeller_blade').length).toBe(4)
    expect(parts.filter((p) => p.semanticRole === 'flange_port').length).toBeGreaterThanOrEqual(3)
    expect(parts.some((p) => p.semanticRole === 'inspection_door')).toBe(true)
    expect(parts.some((p) => p.semanticRole === 'equipment_nameplate')).toBe(true)
    expect(parts.filter((p) => p.semanticRole === 'ladder_rung').length).toBeGreaterThanOrEqual(6)
  })

  test('industrial material presets carry appearance data for realism gates', () => {
    expect(EQUIPMENT_MATERIALS.transparent_polycarbonate.opacity).toBeLessThan(1)
    expect(EQUIPMENT_MATERIALS.stainless_steel.metalness).toBeGreaterThan(0.5)
    expect(EQUIPMENT_MATERIALS.rubber_belt.roughness).toBeGreaterThan(0.8)
  })
})
