import { describe, expect, test } from 'bun:test'
import {
  buildGuardCover,
  buildInspectionDoor,
  buildMotor,
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

  test('industrial material presets carry appearance data for realism gates', () => {
    expect(EQUIPMENT_MATERIALS.transparent_polycarbonate.opacity).toBeLessThan(1)
    expect(EQUIPMENT_MATERIALS.stainless_steel.metalness).toBeGreaterThan(0.5)
    expect(EQUIPMENT_MATERIALS.rubber_belt.roughness).toBeGreaterThan(0.8)
  })
})
