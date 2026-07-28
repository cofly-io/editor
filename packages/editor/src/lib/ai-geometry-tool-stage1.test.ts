import { describe, expect, test } from 'bun:test'
import { expandPrimitiveShapeArrays } from '@pascal-app/core/lib/primitive-compose'
import { createGeometryDiagnosticCollector } from './ai-geometry-tool-diagnostics'
import { normalizeGeometryToolShapes } from './ai-geometry-tool-shapes'

describe('stage 1: silent degradation fixes', () => {
  test('parses a tagged {axis,degrees} rotation instead of zeroing it', () => {
    const diagnostics = createGeometryDiagnosticCollector()
    const shapes = normalizeGeometryToolShapes(
      [
        {
          kind: 'box',
          name: 'lid',
          length: 1,
          width: 0.7,
          height: 0.05,
          position: [0, 0.5, 0],
          rotation: { axis: 'x', degrees: 110 },
        } as never,
      ],
      { diagnostics },
    )
    expect(diagnostics.hasErrors()).toBe(false)
    // 110° ≈ 1.919862 rad about X.
    expect(shapes[0]?.rotation[0]).toBeCloseTo(1.919862, 4)
    expect(shapes[0]?.rotation[1]).toBe(0)
    expect(shapes[0]?.rotation[2]).toBe(0)
  })

  test('emits a diagnostic (not a silent zero) for an unparseable rotation', () => {
    const diagnostics = createGeometryDiagnosticCollector()
    const shapes = normalizeGeometryToolShapes(
      [
        {
          kind: 'box',
          name: 'lid',
          length: 1,
          width: 0.7,
          height: 0.05,
          position: [0, 0.5, 0],
          rotation: { tilt: 110 }, // not a known rotation encoding
        } as never,
      ],
      { diagnostics },
    )
    expect(diagnostics.hasErrors()).toBe(true)
    expect(diagnostics.diagnostics.some((d) => d.code === 'rotation_unparseable')).toBe(true)
    // rotation falls back to zero BUT the diagnostic flags it (executor blocks creation).
    expect(shapes[0]?.rotation).toEqual([0, 0, 0])
  })

  test('emits a diagnostic for unrecognized array fields like subArray', () => {
    const seen: Array<{ code: string; message: string; path?: string }> = []
    const expanded = expandPrimitiveShapeArrays(
      [
        {
          kind: 'box',
          name: 'key',
          length: 0.02,
          width: 0.02,
          height: 0.01,
          position: [0, 0, 0],
          subArray: { rows: 5, columns: 12 }, // not a defined array semantic
        } as never,
      ],
      { onDiagnostic: (d) => seen.push(d) },
    )
    expect(seen.some((d) => d.code === 'array_semantics_unrecognized')).toBe(true)
    // subArray is NOT honored → no expansion happens.
    expect(expanded.length).toBe(1)
  })

  test('expands a defined 5x12 grid into 60 unique positions', () => {
    const expanded = expandPrimitiveShapeArrays([
      {
        kind: 'box',
        name: 'key',
        length: 0.02,
        width: 0.02,
        height: 0.01,
        position: [0, 0, 0],
        rows: 5,
        columns: 12,
        spacing: 0.019,
      } as never,
    ])
    expect(expanded.length).toBe(60)
    const positions = new Set(
      expanded.map((shape) => {
        const p = (shape as { position: number[] }).position
        return `${p[0]},${p[1]},${p[2]}`
      }),
    )
    // 60 keys → 60 unique world positions (the original bug collapsed them to 1).
    expect(positions.size).toBe(60)
  })

  test('centeredOn keeps an explicit child offset instead of collapsing to parent center', () => {
    const diagnostics = createGeometryDiagnosticCollector()
    const shapes = normalizeGeometryToolShapes(
      [
        {
          kind: 'box',
          name: 'deck',
          length: 0.36,
          width: 0.24,
          height: 0.02,
          position: [0, 0.01, 0],
        } as never,
        {
          kind: 'box',
          name: 'trackpad',
          length: 0.1,
          width: 0.08,
          height: 0.004,
          centeredOn: 'deck',
          position: [0, 0, 0.05], // explicit offset toward the front edge
        } as never,
      ],
      { diagnostics },
    )
    const deck = shapes[0]
    const trackpad = shapes[1]
    expect(deck).toBeDefined()
    expect(trackpad).toBeDefined()
    // Trackpad sits at deck center + explicit z offset, not exactly at deck center.
    expect(trackpad?.position[2]).toBeCloseTo((deck?.position[2] ?? 0) + 0.05, 5)
    expect(trackpad?.position[2]).not.toBeCloseTo(deck?.position[2] ?? Number.NaN, 5)
  })
})
