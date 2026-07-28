import { describe, expect, test } from 'bun:test'
import type { AssemblyIR, AssemblyPart } from '@pascal-app/core/lib/generated-assembly-ir'
import {
  type AssemblyDiff,
  diffAndReconcile,
  diffAssemblyIR,
  type OverrideReconciliation,
  type PartOverride,
  reconcileOverrides,
} from './generated-assembly-diff'

function makePart(id: string, fingerprint = `fp:${id}`): AssemblyPart {
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
      params: {},
    },
    material: {},
    fingerprint,
  }
}

function makeIR(parts: AssemblyPart[]): AssemblyIR {
  return {
    schemaVersion: 1,
    generator: { sourceHash: 'sha256:s', apiVersion: '1.0.0', paramsHash: 'sha256:p' },
    parts,
    constraints: [],
  }
}

describe('diffAssemblyIR', () => {
  test('identical IRs produce empty diff', () => {
    const a = makeIR([makePart('x'), makePart('y')])
    const b = makeIR([makePart('x'), makePart('y')])
    const diff = diffAssemblyIR(a, b)
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.kept.map((k) => k.partId).sort()).toEqual(['x', 'y'])
    expect(diff.kept.every((k) => !k.fingerprintChanged)).toBe(true)
  })

  test('detects added, removed, and kept parts by id', () => {
    const previous = makeIR([makePart('a'), makePart('b'), makePart('c')])
    const next = makeIR([makePart('b'), makePart('c'), makePart('d')])
    const diff = diffAssemblyIR(previous, next)
    expect(diff.added.map((p) => p.id)).toEqual(['d'])
    expect(diff.removed.map((p) => p.id)).toEqual(['a'])
    expect(diff.kept.map((k) => k.partId).sort()).toEqual(['b', 'c'])
  })

  test('marks fingerprintChanged when a kept part was regenerated', () => {
    const previous = makeIR([makePart('k', 'fp:v1')])
    const next = makeIR([makePart('k', 'fp:v2')])
    const diff = diffAssemblyIR(previous, next)
    expect(diff.kept[0]?.fingerprintChanged).toBe(true)
    expect(diff.kept[0]?.previousFingerprint).toBe('fp:v1')
    expect(diff.kept[0]?.nextFingerprint).toBe('fp:v2')
  })

  test('keyboard scenario: removing keyboard.key.r3.c7 produces removed entry', () => {
    const keys = ['r3.c6', 'r3.c7', 'r3.c8'].map((k) => makePart(`keyboard.key.${k}`))
    const withKey = makeIR([makePart('keyboard.base'), ...keys])
    const withoutKey = makeIR([
      makePart('keyboard.base'),
      makePart('keyboard.key.r3.c6'),
      makePart('keyboard.key.r3.c8'),
    ])
    const diff = diffAssemblyIR(withKey, withoutKey)
    expect(diff.removed.map((p) => p.id)).toEqual(['keyboard.key.r3.c7'])
  })
})

describe('reconcileOverrides', () => {
  test('reapplies overrides whose partId still exists in next IR', () => {
    const overrides: PartOverride[] = [
      { partId: 'keyboard.key.r3.c7', material: { preset: 'plastic' } },
      { partId: 'keyboard.key.r3.c8', visibility: false },
    ]
    const next = makeIR([makePart('keyboard.key.r3.c7'), makePart('keyboard.key.r3.c8')])
    const result = reconcileOverrides(overrides, next)
    expect(result.reapplied).toEqual(overrides)
    expect(result.orphans).toEqual([])
  })

  test('generates orphan for override whose partId was removed', () => {
    const overrides: PartOverride[] = [
      { partId: 'keyboard.key.r3.c7', material: { color: [1, 0, 0] } },
    ]
    const next = makeIR([makePart('keyboard.key.r3.c8')])
    const result = reconcileOverrides(overrides, next, '2026-07-26T00:00:00Z')
    expect(result.reapplied).toEqual([])
    expect(result.orphans).toHaveLength(1)
    expect(result.orphans[0]?.partId).toBe('keyboard.key.r3.c7')
    expect(result.orphans[0]?.reason).toBe('part_removed')
    expect(result.orphans[0]?.detectedAt).toBe('2026-07-26T00:00:00Z')
    expect(result.orphans[0]?.override).toEqual(overrides[0])
  })

  test('does not silently drop orphans — they must be auditable', () => {
    const overrides: PartOverride[] = [
      { partId: 'gone.a', note: 'user moved this' },
      { partId: 'gone.b', note: 'user recolored this' },
      { partId: 'kept.c', visibility: true },
    ]
    const next = makeIR([makePart('kept.c')])
    const result = reconcileOverrides(overrides, next)
    expect(result.reapplied.map((o) => o.partId)).toEqual(['kept.c'])
    expect(result.orphans.map((o) => o.partId).sort()).toEqual(['gone.a', 'gone.b'])
  })
})

describe('diffAndReconcile', () => {
  test('combines diff and reconciliation in one call', () => {
    const previous = makeIR([makePart('a'), makePart('b')])
    const next = makeIR([makePart('b'), makePart('c')])
    const overrides: PartOverride[] = [
      { partId: 'a', note: 'on removed part' },
      { partId: 'b', note: 'on kept part' },
    ]
    const {
      diff,
      reconciliation,
    }: { diff: AssemblyDiff; reconciliation: OverrideReconciliation } = diffAndReconcile(
      previous,
      next,
      overrides,
    )
    expect(diff.removed.map((p) => p.id)).toEqual(['a'])
    expect(diff.added.map((p) => p.id)).toEqual(['c'])
    expect(reconciliation.reapplied.map((o) => o.partId)).toEqual(['b'])
    expect(reconciliation.orphans.map((o) => o.partId)).toEqual(['a'])
  })
})
