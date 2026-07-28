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
})
