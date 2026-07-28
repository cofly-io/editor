import { describe, expect, it } from 'bun:test'
import type { DSLParamDecl } from '@pascal-app/core/lib/generated-geometry-dsl-contract'
import {
  matchesGlob,
  routeRevision,
  type RevisionContext,
} from './revision-route'

const KEYCAP_WIDTH: DSLParamDecl = {
  type: 'number',
  unit: 'm',
  range: [0.014, 0.025],
  default: 0.018,
  semanticRole: 'keyboard.key.width',
  affects: 'keyboard.key.*',
  label: '键帽宽度',
}

const COLUMNS: DSLParamDecl = {
  type: 'integer',
  range: [10, 15],
  default: 12,
  semanticRole: 'keyboard.layout.columns',
  affects: 'keyboard.key.*',
  label: '键盘列数',
}

const LID_ANGLE: DSLParamDecl = {
  type: 'number',
  unit: 'deg',
  range: [0, 135],
  default: 110,
  semanticRole: 'laptop.lid.angle',
  affects: 'laptop.lid',
  label: '屏幕开合角',
}

const ctx: RevisionContext = {
  paramsDecls: { keycapWidth: KEYCAP_WIDTH, columns: COLUMNS, lidAngleDeg: LID_ANGLE },
  partIds: [
    'laptop.base',
    'laptop.lid',
    'laptop.screen',
    'keyboard.key.r0.c0',
    'keyboard.key.r0.c1',
    'keyboard.key.r1.c0',
  ],
}

describe('matchesGlob', () => {
  it('exact match and single-star glob', () => {
    expect(matchesGlob('laptop.lid', 'laptop.lid')).toBe(true)
    expect(matchesGlob('keyboard.key.*', 'keyboard.key.r0.c0')).toBe(true)
    expect(matchesGlob('keyboard.key.*', 'laptop.lid')).toBe(false)
    expect(matchesGlob('keyboard.key.r0.*', 'keyboard.key.r1.c0')).toBe(false)
  })
})

describe('routeRevision — (a) param-level', () => {
  it('in-range param change → param_rerun with affected parts and overlap analysis', () => {
    const route = routeRevision({ kind: 'param_change', param: 'keycapWidth', value: 0.02 }, ctx)
    expect(route.kind).toBe('param_rerun')
    if (route.kind !== 'param_rerun') return
    expect(route.affectedPartIds).toEqual([
      'keyboard.key.r0.c0',
      'keyboard.key.r0.c1',
      'keyboard.key.r1.c0',
    ])
    // columns also affects keyboard.key.* → reported as overlapping
    expect(route.overlappingParams).toEqual(['columns'])
  })

  it('out-of-range value → unresolvable with reason, never silently clamped', () => {
    const route = routeRevision({ kind: 'param_change', param: 'keycapWidth', value: 0.5 }, ctx)
    expect(route.kind).toBe('unresolvable')
    if (route.kind !== 'unresolvable') return
    expect(route.reason).toContain('outside range')
  })

  it('unknown param with near matches → ambiguous with candidates', () => {
    const route = routeRevision({ kind: 'param_change', param: 'keycap', value: 0.02 }, ctx)
    expect(route.kind).toBe('ambiguous')
    if (route.kind !== 'ambiguous') return
    expect(route.candidates.some((c) => c.label.includes('keycapWidth'))).toBe(true)
  })

  it('unknown param without near matches → unresolvable', () => {
    const route = routeRevision({ kind: 'param_change', param: 'wheelSize', value: 3 }, ctx)
    expect(route.kind).toBe('unresolvable')
  })
})

describe('routeRevision — (b) part-level override (no rerun)', () => {
  it('material change on one part → override_write, no sandbox', () => {
    const route = routeRevision(
      { kind: 'part_attribute', target: 'laptop.lid', attribute: 'material', value: 'plastic' },
      ctx,
    )
    expect(route.kind).toBe('override_write')
    if (route.kind !== 'override_write') return
    expect(route.matchedPartIds).toEqual(['laptop.lid'])
    expect(route.overrides).toEqual([{ partId: 'laptop.lid', material: { preset: 'plastic' } }])
  })

  it('glob target fans out to one override per matched part', () => {
    const route = routeRevision(
      { kind: 'part_attribute', target: 'keyboard.key.*', attribute: 'color', value: [1, 0, 0] },
      ctx,
    )
    expect(route.kind).toBe('override_write')
    if (route.kind !== 'override_write') return
    expect(route.overrides).toHaveLength(3)
    expect(route.overrides[0]).toEqual({ partId: 'keyboard.key.r0.c0', material: { color: [1, 0, 0] } })
  })

  it('no matching parts → unresolvable', () => {
    const route = routeRevision(
      { kind: 'part_attribute', target: 'mouse.*', attribute: 'visibility', value: false },
      ctx,
    )
    expect(route.kind).toBe('unresolvable')
  })

  it('position tweak is never ambiguous (position is not param-like)', () => {
    const route = routeRevision(
      { kind: 'part_attribute', target: 'laptop.lid', attribute: 'position', value: [0, 0.2, 0] },
      ctx,
    )
    expect(route.kind).toBe('override_write')
  })
})

describe('routeRevision — (c) structural', () => {
  it('add → structural_rerun with no orphans', () => {
    const route = routeRevision(
      { kind: 'structure_change', operation: 'add', description: '加一个小键盘' },
      ctx,
    )
    expect(route.kind).toBe('structural_rerun')
    if (route.kind !== 'structural_rerun') return
    expect(route.operation).toBe('add')
  })

  it('remove surfaces overrides on removed parts as future orphans', () => {
    const route = routeRevision(
      { kind: 'structure_change', operation: 'remove', target: 'keyboard.key.*' },
      { ...ctx, currentOverrides: [{ partId: 'keyboard.key.r0.c0', visibility: false }] },
    )
    expect(route.kind).toBe('structural_rerun')
    if (route.kind !== 'structural_rerun') return
    expect(route.operation).toBe('remove')
    expect(route.orphanedPartIds).toEqual(['keyboard.key.r0.c0'])
  })

  it('remove with unmatched target → unresolvable', () => {
    const route = routeRevision(
      { kind: 'structure_change', operation: 'remove', target: 'numpad.*' },
      ctx,
    )
    expect(route.kind).toBe('unresolvable')
  })
})
