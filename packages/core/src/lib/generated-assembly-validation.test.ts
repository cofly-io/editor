import { describe, expect, test } from 'bun:test'
import type { AssemblyIR, AssemblyPart } from './generated-assembly-ir'
import { canonicalizeAssemblyIR } from './generated-assembly-ir'
import {
  type AssemblyDiagnostic,
  hasAssemblyErrors,
  validateAssemblyIR,
} from './generated-assembly-validation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePart(id: string, overrides: Partial<AssemblyPart> = {}): AssemblyPart {
  return {
    id,
    transform: {
      space: 'world',
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    geometry: {
      kind: 'primitive-recipe',
      recipeId: 'primitive.box',
      params: { length: 1, width: 1, height: 1 },
    },
    material: { preset: 'metal' },
    fingerprint: `fp:${id}`,
    ...overrides,
  }
}

function makeIR(parts: AssemblyPart[], overrides: Partial<AssemblyIR> = {}): AssemblyIR {
  return {
    schemaVersion: 1,
    generator: { sourceHash: 'sha256:test', apiVersion: '1.0.0', paramsHash: 'sha256:params' },
    parts,
    constraints: [],
    ...overrides,
  }
}

function errorsOnly(diagnostics: AssemblyDiagnostic[]): AssemblyDiagnostic[] {
  return diagnostics.filter((d) => d.severity === 'error')
}

// ---------------------------------------------------------------------------
// Validation — parts
// ---------------------------------------------------------------------------

describe('validateAssemblyIR — parts', () => {
  test('accepts a minimal valid IR', () => {
    const diags = validateAssemblyIR(makeIR([makePart('a')]))
    expect(errorsOnly(diags)).toEqual([])
  })

  test('rejects duplicate part ids', () => {
    const diags = validateAssemblyIR(makeIR([makePart('a'), makePart('a')]))
    expect(diags.some((d) => d.code === 'ir_part_id_duplicate')).toBe(true)
  })

  test('rejects missing parent reference', () => {
    const diags = validateAssemblyIR(makeIR([makePart('child', { parentId: 'ghost' })]))
    expect(diags.some((d) => d.code === 'ir_part_parent_missing')).toBe(true)
  })

  test('rejects self-parent', () => {
    const diags = validateAssemblyIR(makeIR([makePart('a', { parentId: 'a' })]))
    expect(diags.some((d) => d.code === 'ir_part_parent_self')).toBe(true)
  })

  test('rejects parent cycle', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('a', { parentId: 'b' }), makePart('b', { parentId: 'a' })]),
    )
    expect(diags.some((d) => d.code === 'ir_part_hierarchy_cycle')).toBe(true)
  })

  test('depth computation does not stack-overflow on cycles', () => {
    // Regression: the depth budget used to recurse infinitely on cyclic
    // parentId chains. The validator must report the cycle and still finish.
    const diags = validateAssemblyIR(
      makeIR([
        makePart('a', { parentId: 'b' }),
        makePart('b', { parentId: 'c' }),
        makePart('c', { parentId: 'a' }),
      ]),
    )
    expect(diags.some((d) => d.code === 'ir_part_hierarchy_cycle')).toBe(true)
  })

  test('flags chains deeper than the budget without overflowing', () => {
    // 40-node linear chain → exceeds maxHierarchyDepth (32). Must report
    // too-deep, not crash.
    const chain: AssemblyPart[] = []
    for (let i = 0; i < 40; i++) {
      chain.push(makePart(`n${i}`, i === 0 ? {} : { parentId: `n${i - 1}` }))
    }
    const diags = validateAssemblyIR(makeIR(chain))
    expect(diags.some((d) => d.code === 'ir_part_hierarchy_too_deep')).toBe(true)
  })

  test('rejects non-finite position', () => {
    const diags = validateAssemblyIR(
      makeIR([
        makePart('a', {
          transform: {
            space: 'world',
            position: [Number.NaN, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        }),
      ]),
    )
    expect(diags.some((d) => d.code === 'ir_transform_position_invalid')).toBe(true)
  })

  test('rejects non-unit quaternion', () => {
    const diags = validateAssemblyIR(
      makeIR([
        makePart('a', {
          transform: {
            space: 'world',
            position: [0, 0, 0],
            rotation: [1, 1, 1, 1], // |q| = 2, not 1
            scale: [1, 1, 1],
          },
        }),
      ]),
    )
    expect(diags.some((d) => d.code === 'ir_transform_rotation_not_unit')).toBe(true)
  })

  test('rejects local transform without parent', () => {
    const diags = validateAssemblyIR(
      makeIR([
        makePart('a', {
          transform: {
            space: 'local',
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        }),
      ]),
    )
    expect(diags.some((d) => d.code === 'ir_transform_local_without_parent')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Validation — ports (Appendix B)
// ---------------------------------------------------------------------------

describe('validateAssemblyIR — ports', () => {
  test('accepts a valid port', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('column_shell')], {
        ports: [
          {
            id: 'column_shell.feed_in',
            partId: 'column_shell',
            medium: 'oil',
            side: 'left',
            height: 5.2,
          },
        ],
      }),
    )
    expect(errorsOnly(diags)).toEqual([])
  })

  test('rejects port referencing missing part', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('shell')], {
        ports: [
          { id: 'p1', partId: 'ghost', medium: 'oil', side: 'left', height: 1 },
        ],
      }),
    )
    expect(diags.some((d) => d.code === 'ir_port_part_exists')).toBe(true)
  })

  test('rejects duplicate port id', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('shell')], {
        ports: [
          { id: 'p1', partId: 'shell', medium: 'oil', side: 'left', height: 1 },
          { id: 'p1', partId: 'shell', medium: 'oil', side: 'right', height: 2 },
        ],
      }),
    )
    expect(diags.some((d) => d.code === 'ir_port_id_unique')).toBe(true)
  })

  test('rejects non-unit port direction', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('shell')], {
        ports: [
          {
            id: 'p1',
            partId: 'shell',
            medium: 'oil',
            side: 'left',
            height: 1,
            direction: [2, 0, 0],
          },
        ],
      }),
    )
    expect(diags.some((d) => d.code === 'ir_port_direction_unit')).toBe(true)
  })

  test('warns + hints on misspelled medium (edit distance 1)', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('shell')], {
        ports: [
          { id: 'p1', partId: 'shell', medium: 'hydorgen', side: 'left', height: 1 },
        ],
      }),
    )
    const warn = diags.find((d) => d.code === 'ir_port_medium_known')
    expect(warn).toBeDefined()
    expect(warn?.severity).toBe('warning')
    expect(warn?.message).toContain('hydrogen')
  })

  test('does not block on unknown-but-plausible medium', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('shell')], {
        ports: [
          { id: 'p1', partId: 'shell', medium: 'slurry_custom_x', side: 'left', height: 1 },
        ],
      }),
    )
    expect(errorsOnly(diags)).toEqual([])
    // warning still fires
    expect(diags.some((d) => d.code === 'ir_port_medium_known')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Validation — connections
// ---------------------------------------------------------------------------

describe('validateAssemblyIR — connections', () => {
  const ports = [
    { id: 'a.out', partId: 'a', medium: 'oil', side: 'right' as const, height: 1 },
    { id: 'b.in', partId: 'b', medium: 'oil', side: 'left' as const, height: 1 },
  ]

  test('accepts a valid connection', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('a'), makePart('b')], {
        ports,
        connections: [{ id: 'c1', fromPort: 'a.out', toPort: 'b.in', medium: 'oil' }],
      }),
    )
    expect(errorsOnly(diags)).toEqual([])
  })

  test('rejects connection to missing port', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('a')], {
        ports,
        connections: [{ id: 'c1', fromPort: 'a.out', toPort: 'ghost.in', medium: 'oil' }],
      }),
    )
    expect(diags.some((d) => d.code === 'ir_conn_endpoints_exist')).toBe(true)
  })

  test('rejects self-loop connection', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('a')], {
        ports: [ports[0]!],
        connections: [{ id: 'c1', fromPort: 'a.out', toPort: 'a.out', medium: 'oil' }],
      }),
    )
    expect(diags.some((d) => d.code === 'ir_conn_no_self_loop')).toBe(true)
  })

  test('warns on medium mismatch between connection and endpoints', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('a'), makePart('b')], {
        ports,
        connections: [{ id: 'c1', fromPort: 'a.out', toPort: 'b.in', medium: 'water' }],
      }),
    )
    expect(diags.some((d) => d.code === 'ir_conn_medium_match')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

describe('validateAssemblyIR — budgets', () => {
  test('rejects assemblies exceeding part budget', () => {
    const manyParts = Array.from({ length: 300 }, (_, i) => makePart(`p${i}`))
    const diags = validateAssemblyIR(makeIR(manyParts))
    expect(diags.some((d) => d.code === 'ir_budget_parts_exceeded')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Canonicalization & determinism
// ---------------------------------------------------------------------------

describe('canonicalizeAssemblyIR', () => {
  test('produces identical JSON regardless of input ordering', () => {
    const ir1 = makeIR([makePart('a'), makePart('b'), makePart('c')], {
      ports: [
        { id: 'p2', partId: 'a', medium: 'oil', side: 'left', height: 1 },
        { id: 'p1', partId: 'a', medium: 'oil', side: 'right', height: 1 },
      ],
    })
    const ir2 = makeIR([makePart('c'), makePart('b'), makePart('a')], {
      ports: [
        { id: 'p1', partId: 'a', medium: 'oil', side: 'right', height: 1 },
        { id: 'p2', partId: 'a', medium: 'oil', side: 'left', height: 1 },
      ],
    })
    expect(JSON.stringify(canonicalizeAssemblyIR(ir1))).toBe(
      JSON.stringify(canonicalizeAssemblyIR(ir2)),
    )
  })

  test('round-trips through JSON without changing canonical form', () => {
    const ir = makeIR([makePart('a'), makePart('b')], {
      ports: [{ id: 'p1', partId: 'a', medium: 'oil', side: 'left', height: 1.5 }],
    })
    const roundTripped = JSON.parse(JSON.stringify(ir)) as AssemblyIR
    expect(JSON.stringify(canonicalizeAssemblyIR(roundTripped))).toBe(
      JSON.stringify(canonicalizeAssemblyIR(ir)),
    )
  })
})

// ---------------------------------------------------------------------------
// Aggregate helpers
// ---------------------------------------------------------------------------

describe('hasAssemblyErrors', () => {
  test('returns false on warning-only diagnostics', () => {
    const diags = validateAssemblyIR(
      makeIR([makePart('a')], {
        ports: [{ id: 'p', partId: 'a', medium: 'unknown_x', side: 'left', height: 1 }],
      }),
    )
    expect(hasAssemblyErrors(diags)).toBe(false)
  })

  test('returns true when at least one error exists', () => {
    const diags = validateAssemblyIR(makeIR([makePart('a'), makePart('a')]))
    expect(hasAssemblyErrors(diags)).toBe(true)
  })
})
