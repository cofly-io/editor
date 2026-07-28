import { describe, expect, test } from 'bun:test'
import { compileDsl } from './generated-geometry-dsl-compiler'
import {
  EXPECTED_LID,
  EXPECTED_PART_COUNT,
  expectedKeyPosition,
  LAPTOP_DSL_SOURCE,
} from './fixtures/laptop.dsl'

// ---------------------------------------------------------------------------
// Positive: laptop fixture
// ---------------------------------------------------------------------------

describe('compileDsl — laptop fixture', () => {
  test('compiles without errors', () => {
    const result = compileDsl(LAPTOP_DSL_SOURCE)
    if (!result.ok) {
      // surface diagnostics for debugging
      console.log(JSON.stringify(result.diagnostics, null, 2))
    }
    expect(result.ok).toBe(true)
  })

  test('produces 64 parts (1 base + 60 keys + 1 trackpad + 1 lid + 1 screen)', () => {
    const result = compileDsl(LAPTOP_DSL_SOURCE)
    if (!result.ok) return
    expect(result.ir.parts.length).toBe(EXPECTED_PART_COUNT)
  })

  test('60 keys have unique positions matching expectedKeyPosition', () => {
    const result = compileDsl(LAPTOP_DSL_SOURCE)
    if (!result.ok) return
    const keys = result.ir.parts.filter((p) => p.id.startsWith('keyboard.key.'))
    expect(keys.length).toBe(60)
    const positions = new Set(keys.map((k) => k.transform.position.join(',')))
    expect(positions.size).toBe(60)

    // Spot-check 4 corners
    const cornerCases = [
      { row: 0, col: 0 },
      { row: 0, col: 11 },
      { row: 4, col: 0 },
      { row: 4, col: 11 },
    ]
    for (const { row, col } of cornerCases) {
      const id = `keyboard.key.r${row}.c${col}`
      const part = result.ir.parts.find((p) => p.id === id)
      expect(part).toBeDefined()
      const expected = expectedKeyPosition(row, col)
      expect(part?.transform.position[0]).toBeCloseTo(expected[0], 6)
      expect(part?.transform.position[1]).toBeCloseTo(expected[1], 6)
      expect(part?.transform.position[2]).toBeCloseTo(expected[2], 6)
    }
  })

  test('lid has non-identity rotation about the hinge pivot', () => {
    const result = compileDsl(LAPTOP_DSL_SOURCE)
    if (!result.ok) return
    const lid = result.ir.parts.find((p) => p.id === 'laptop.lid')
    expect(lid).toBeDefined()
    expect(lid?.transform.rotation[0]).toBeCloseTo(EXPECTED_LID.rotation[0], 4)
    expect(lid?.transform.rotation[3]).toBeCloseTo(EXPECTED_LID.rotation[3], 4)
    expect(lid?.transform.position[1]).toBeCloseTo(EXPECTED_LID.position[1], 4)
    expect(lid?.transform.position[2]).toBeCloseTo(EXPECTED_LID.position[2], 4)
  })

  test('screen is a local-space child of lid', () => {
    const result = compileDsl(LAPTOP_DSL_SOURCE)
    if (!result.ok) return
    const screen = result.ir.parts.find((p) => p.id === 'laptop.screen')
    expect(screen).toBeDefined()
    expect(screen?.parentId).toBe('laptop.lid')
    expect(screen?.transform.space).toBe('local')
  })

  test('hinge constraint is declared with correct pivot/axis/angle', () => {
    const result = compileDsl(LAPTOP_DSL_SOURCE)
    if (!result.ok) return
    const hinge = result.ir.constraints.find((c) => c.kind === 'hinge')
    expect(hinge).toBeDefined()
    if (hinge?.kind !== 'hinge') return
    expect(hinge.partId).toBe('laptop.lid')
    expect(hinge.anchorPartId).toBe('laptop.base')
    expect(hinge.axisLocal).toEqual([1, 0, 0])
    expect(hinge.pivotLocal[1]).toBeCloseTo(0.02, 6)
    expect(hinge.pivotLocal[2]).toBeCloseTo(-0.12, 6)
    expect(hinge.restAngle).toBeCloseTo((110 * Math.PI) / 180, 6)
    expect(hinge.limits?.[0]).toBeCloseTo(0, 6)
    expect(hinge.limits?.[1]).toBeCloseTo((135 * Math.PI) / 180, 6)
  })

  test('two consecutive compiles produce identical IR hashes (determinism)', () => {
    const a = compileDsl(LAPTOP_DSL_SOURCE)
    const b = compileDsl(LAPTOP_DSL_SOURCE)
    if (!a.ok || !b.ok) return
    expect(a.irHash).toBe(b.irHash)
  })
})

// ---------------------------------------------------------------------------
// Negative: forbidden globals
// ---------------------------------------------------------------------------

describe('compileDsl — forbidden globals', () => {
  test('rejects globalThis', () => {
    const result = compileDsl(`globalThis.foo;`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_forbidden_global')).toBe(true)
  })

  test('rejects Math (must use math namespace)', () => {
    const result = compileDsl(`const x = Math.sin(0.5);`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_forbidden_global')).toBe(true)
  })

  test('rejects process', () => {
    const result = compileDsl(`process.env;`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_forbidden_global')).toBe(true)
  })

  test('rejects Date', () => {
    const result = compileDsl(`const t = Date.now();`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_forbidden_global')).toBe(true)
  })

  test('rejects fetch', () => {
    const result = compileDsl(`fetch('http://x');`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_forbidden_global')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Negative: forbidden syntax
// ---------------------------------------------------------------------------

describe('compileDsl — forbidden syntax', () => {
  test('rejects arrow functions', () => {
    const result = compileDsl(`const f = () => 1;`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_unsupported_syntax')).toBe(true)
  })

  test('rejects ternary', () => {
    const result = compileDsl(`const x = 1 > 0 ? 'a' : 'b';`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_unsupported_syntax')).toBe(true)
  })

  test('rejects template literals', () => {
    const result = compileDsl('const x = `hello`;')
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_unsupported_syntax')).toBe(true)
  })

  test('rejects loose equality', () => {
    const result = compileDsl(`const x = 1 == 1;`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_unsupported_syntax')).toBe(true)
  })

  test('rejects __proto__ access', () => {
    const result = compileDsl(`const o = {a: 1}; const p = o.__proto__;`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_forbidden_property')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Supported: simple reassignment
// ---------------------------------------------------------------------------

describe('compileDsl — assignment statements', () => {
  test('supports simple variable reassignment', () => {
    const result = compileDsl(`
      let x = 0;
      x = 1;
      part('box', box({ length: x, width: 1, height: 1 })).atWorld([0, 0.5, 0]);
    `)

    expect(result.ok).toBe(true)
    expect(result.ir?.parts[0]?.geometry).toMatchObject({
      kind: 'primitive-recipe',
      params: { length: 1 },
    })
  })
})

// ---------------------------------------------------------------------------
// Negative: undeclared identifiers
// ---------------------------------------------------------------------------

describe('compileDsl — undeclared identifiers', () => {
  test('rejects unknown identifier', () => {
    const result = compileDsl(`const x = fooBarBaz;`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_undeclared_identifier')).toBe(true)
  })

  test('rejects assignment to unknown identifier', () => {
    const result = compileDsl(`x = 1;`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_undeclared_identifier')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Builder API invariants
// ---------------------------------------------------------------------------

describe('compileDsl — builder API invariants', () => {
  test('atLocal without childOf produces error', () => {
    const src = `
      part('a', box({length: 1, width: 1, height: 1}))
        .atLocal([0, 0, 0]);
    `
    const result = compileDsl(src)
    expect(result.ok).toBe(false)
    // The error is reported via builder.__errors → acc diagnostics
    // We surface it through the compiler's diagnostic channel.
  })

  test('childOf then atWorld produces error', () => {
    const src = `
      part('p', box({length: 1, width: 1, height: 1})).atWorld([0, 0, 0]);
      part('c', box({length: 1, width: 1, height: 1}))
        .childOf('p')
        .atWorld([0, 0, 0]);
    `
    const result = compileDsl(src)
    expect(result.ok).toBe(false)
  })

  test('rotateAround before atWorld produces error', () => {
    const src = `
      part('a', box({length: 1, width: 1, height: 1}))
        .rotateAround([0, 0, 0], { axis: 'x', degrees: 45 });
    `
    const result = compileDsl(src)
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Loop budgets
// ---------------------------------------------------------------------------

describe('compileDsl — loop budgets', () => {
  test('rejects infinite loop', () => {
    const src = `for (let i = 0; i < 999999; i++) { const x = i; }`
    const result = compileDsl(src)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_budget_exceeded')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Division by zero
// ---------------------------------------------------------------------------

describe('compileDsl — division by zero', () => {
  test('rejects division by zero', () => {
    const result = compileDsl(`const x = 1 / 0;`)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.code === 'dsl_division_by_zero')).toBe(true)
  })
})
