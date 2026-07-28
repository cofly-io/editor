import { describe, expect, test } from 'bun:test'
import { expandPrimitiveShapeArrays } from '@pascal-app/core/lib/primitive-compose'
import { createGeometryDiagnosticCollector } from './ai-geometry-tool-diagnostics'
import { normalizeGeometryToolShapes } from './ai-geometry-tool-shapes'

// ---------------------------------------------------------------------------
// Stage 0 fixture: freeze the real failing laptop run (run_mrvfp28x_e02848ae).
//
// These are the exact shapes the LLM emitted in the run's Stage 2
// `compose_primitive` tool call (events.jsonl id:13). They contain every field
// that used to be silently degraded:
//   - laptop_lid  rotation { axis:'x', degrees:110 }   -> was zeroed
//   - keys        array + subArray                     -> subArray was dropped
//   - trackpad    centeredOn + explicit position offset -> was collapsed
// Freezing them here makes the three stage-1 fixes regression-proof without
// depending on the volatile runtime run directory.
// ---------------------------------------------------------------------------

const LAPTOP_FIXTURE = [
  {
    kind: 'box',
    name: 'laptop_base',
    length: 0.35,
    width: 0.24,
    height: 0.02,
    position: [0, 0.01, 0],
    material: 'metal',
    semanticRole: 'laptop_base',
  },
  {
    kind: 'box',
    name: 'laptop_lid',
    length: 0.35,
    width: 0.02,
    height: 0.24,
    attachTo: 'laptop_base',
    anchor: 'back_top',
    childAnchor: 'bottom_center',
    rotation: { axis: 'x', degrees: 110 },
    material: 'metal',
    semanticRole: 'laptop_lid',
  },
  {
    kind: 'box',
    name: 'keyboard_area',
    length: 0.33,
    width: 0.12,
    height: 0.005,
    centeredOn: 'laptop_base',
    side: 'top',
    material: 'plastic',
    semanticRole: 'keyboard_area',
  },
  {
    kind: 'box',
    name: 'trackpad',
    length: 0.1,
    width: 0.08,
    height: 0.004,
    centeredOn: 'keyboard_area',
    position: [0, 0, 0.05], // explicit offset toward the front edge
    material: 'plastic',
    semanticRole: 'trackpad',
  },
] as never[]

describe('stage 0: run_mrvfp28x laptop failure fixture', () => {
  test('keeps the 110 degree lid rotation instead of zeroing it', () => {
    const diagnostics = createGeometryDiagnosticCollector()
    const shapes = normalizeGeometryToolShapes(LAPTOP_FIXTURE, { diagnostics })
    const lid = shapes.find((s) => s.name === 'laptop_lid')
    expect(lid).toBeDefined()
    // 110° about X must survive compilation (it used to come back as [0,0,0]).
    expect(lid?.rotation[0]).toBeCloseTo(1.919862, 4)
    expect(lid?.rotation[1]).toBe(0)
    expect(lid?.rotation[2]).toBe(0)
  })

  test('keeps the centered trackpad offset instead of collapsing it onto the keyboard center', () => {
    const diagnostics = createGeometryDiagnosticCollector()
    const shapes = normalizeGeometryToolShapes(LAPTOP_FIXTURE, { diagnostics })
    const keyboard = shapes.find((s) => s.name === 'keyboard_area')
    const trackpad = shapes.find((s) => s.name === 'trackpad')
    expect(keyboard).toBeDefined()
    expect(trackpad).toBeDefined()
    // Trackpad = keyboard center + its explicit z offset (not the exact center).
    expect(trackpad?.position[2]).toBeCloseTo((keyboard?.position[2] ?? 0) + 0.05, 5)
    expect(trackpad?.position[2]).not.toBeCloseTo(keyboard?.position[2] ?? Number.NaN, 5)
  })

  test('flags the keys subArray instead of silently dropping it (the 60-key overlap bug)', () => {
    // The exact keys entry from the run: a defined 1D `array` PLUS an
    // undefined `subArray`. The subArray used to be ignored, so only the 1D
    // row expanded and the intended 2D grid never materialized. Now the
    // unrecognized field must surface a diagnostic.
    const keysEntry = {
      kind: 'box',
      name: 'key',
      length: 0.02,
      width: 0.02,
      height: 0.01,
      position: [0, 0.0125, 0],
      array: { count: 12, axis: 'x', spacing: 0.016 },
      subArray: { count: 5, axis: 'z', spacing: 0.016 },
      material: 'plastic',
      semanticRole: 'keyboard_key',
    } as never
    const seen: Array<{ code: string; message: string; path?: string }> = []
    const expanded = expandPrimitiveShapeArrays([keysEntry], {
      onDiagnostic: (d) => seen.push(d),
    })
    expect(seen.some((d) => d.code === 'array_semantics_unrecognized')).toBe(true)
    // The subArray is NOT honored: only the defined 1D array expands (12 keys),
    // never the intended 60. Under strict mode the diagnostic blocks creation.
    expect(expanded.length).toBe(12)
  })

  test('spelling the 60-key grid with defined fields yields 60 unique positions', () => {
    // The corrected authoring the strict-mode diagnostic points the LLM to:
    // rows + columns + spacing are all recognized, so the grid really expands.
    const expanded = expandPrimitiveShapeArrays([
      {
        kind: 'box',
        name: 'key',
        length: 0.02,
        width: 0.02,
        height: 0.01,
        position: [0, 0.0125, 0],
        rows: 5,
        columns: 12,
        spacing: 0.016,
        material: 'plastic',
        semanticRole: 'keyboard_key',
      } as never,
    ])
    expect(expanded.length).toBe(60)
    const positions = new Set(
      expanded.map((shape) => {
        const p = (shape as { position: number[] }).position
        return `${p[0]},${p[1]},${p[2]}`
      }),
    )
    // With defined fields the grid really fans out into 60 distinct positions
    // (previously the unrecognized subArray meant the 2D grid never formed).
    expect(positions.size).toBe(60)
  })
})
