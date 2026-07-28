import { describe, expect, test } from 'bun:test'
import {
  buildControlCabinet,
  buildFlangePort,
  buildGuardCover,
  buildInspectionDoor,
  buildMotor,
  buildPipeRun,
  buildPumpCasing,
  buildSheetCover,
  buildSkidBase,
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

  test('industrial material presets carry appearance data for realism gates', () => {
    expect(EQUIPMENT_MATERIALS.transparent_polycarbonate.opacity).toBeLessThan(1)
    expect(EQUIPMENT_MATERIALS.stainless_steel.metalness).toBeGreaterThan(0.5)
    expect(EQUIPMENT_MATERIALS.rubber_belt.roughness).toBeGreaterThan(0.8)
  })
})
