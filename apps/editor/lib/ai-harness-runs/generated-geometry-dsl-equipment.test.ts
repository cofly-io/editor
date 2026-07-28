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
})
