import { describe, expect, it } from 'bun:test'
import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import {
  buildGeneratedAssemblyCreatePatches,
  buildGeneratedAssemblyNodes,
  quatToEuler,
} from './generated-geometry-placement'

function makePart(overrides: Partial<AssemblyIR['parts'][number]> & { id: string }) {
  return {
    transform: {
      space: 'world' as const,
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    geometry: {
      kind: 'primitive-recipe' as const,
      recipeId: 'primitive.box',
      params: { length: 1, width: 1, height: 1 },
    },
    material: {},
    fingerprint: `fp-${overrides.id}`,
    ...overrides,
  } as AssemblyIR['parts'][number]
}

function makeIR(parts: AssemblyIR['parts']): AssemblyIR {
  return {
    schemaVersion: 1,
    generator: { sourceHash: 'src', apiVersion: '1.0.0', paramsHash: 'prm' },
    parts,
    constraints: [],
  }
}

describe('quatToEuler', () => {
  it('identity quaternion → zero euler', () => {
    expect(quatToEuler([0, 0, 0, 1])).toEqual([0, 0, 0])
  })

  it('20° about X converts to euler [20°rad, 0, 0]', () => {
    const half = (10 * Math.PI) / 180
    const e = quatToEuler([Math.sin(half), 0, 0, Math.cos(half)])
    expect(e[0]).toBeCloseTo((20 * Math.PI) / 180, 5)
    expect(e[1]).toBeCloseTo(0, 5)
    expect(e[2]).toBeCloseTo(0, 5)
  })

  it('90° about Y converts to euler [0, 90°rad, 0]', () => {
    const s = Math.SQRT1_2
    const e = quatToEuler([0, s, 0, s])
    expect(e[0]).toBeCloseTo(0, 5)
    expect(e[1]).toBeCloseTo(Math.PI / 2, 5)
    expect(e[2]).toBeCloseTo(0, 5)
  })
})

describe('buildGeneratedAssemblyNodes', () => {
  it('creates a root + one mesh node per part, with partId mapping', () => {
    const ir = makeIR([makePart({ id: 'a' }), makePart({ id: 'b' })])
    const { rootNode, childNodes, nodeIdByPartId } = buildGeneratedAssemblyNodes(ir)
    expect(rootNode.type).toBe('generated-assembly')
    expect(childNodes).toHaveLength(2)
    expect(nodeIdByPartId.get('a')).toBe(childNodes[0].id)
    expect(nodeIdByPartId.get('b')).toBe(childNodes[1].id)
    expect(childNodes[0].type).toBe('generated-mesh')
    expect(childNodes[0].partId).toBe('a')
    expect(childNodes[0].parentId).toBe(rootNode.id)
    expect(rootNode.id.startsWith('generated-assembly_')).toBe(true)
    expect(childNodes[0].id.startsWith('generated-mesh_')).toBe(true)
  })

  it('world-space parts are positioned relative to the root origin', () => {
    const ir = makeIR([
      makePart({
        id: 'a',
        transform: {
          space: 'world',
          position: [1, 2, 3],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
    ])
    const { childNodes } = buildGeneratedAssemblyNodes(ir, { origin: [1, 0, 1] })
    expect(childNodes[0].position).toEqual([0, 2, 2])
  })

  it('local-space parts become children of their parent part node and keep local transform', () => {
    const ir = makeIR([
      makePart({ id: 'lid' }),
      makePart({
        id: 'screen',
        parentId: 'lid',
        transform: {
          space: 'local',
          position: [0, 0, 0.005],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
    ])
    const { childNodes, nodeIdByPartId } = buildGeneratedAssemblyNodes(ir)
    const screen = childNodes.find((n) => n.partId === 'screen')
    expect(screen?.parentId).toBe(nodeIdByPartId.get('lid'))
    expect(screen?.position).toEqual([0, 0, 0.005])
  })

  it('local-space parts are fixed up when the IR parent appears later in the array', () => {
    const ir = makeIR([
      makePart({
        id: 'screen',
        parentId: 'lid',
        transform: {
          space: 'local',
          position: [0, 0, 0.005],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
      makePart({ id: 'lid' }),
    ])
    const { childNodes, nodeIdByPartId } = buildGeneratedAssemblyNodes(ir)
    const screen = childNodes.find((n) => n.partId === 'screen')
    expect(screen?.parentId).toBe(nodeIdByPartId.get('lid'))
  })

  it('overrides reapply transform and visibility onto matching parts', () => {
    const ir = makeIR([makePart({ id: 'a' }), makePart({ id: 'b' })])
    const { childNodes, reappliedOverrides } = buildGeneratedAssemblyNodes(ir, {
      overrides: [
        { partId: 'a', transform: { position: [9, 9, 9] }, visibility: false },
        { partId: 'ghost', visibility: false },
      ],
    })
    const a = childNodes.find((n) => n.partId === 'a')
    const b = childNodes.find((n) => n.partId === 'b')
    expect(a?.position).toEqual([9, 9, 9])
    expect(a?.visible).toBe(false)
    expect(b?.visible).toBe(true)
    // 'ghost' has no matching part → not reapplied (orphan handling is the caller's job)
    expect(reappliedOverrides.map((o) => o.partId)).toEqual(['a'])
  })

  it('material preset and color flow onto the node', () => {
    const ir = makeIR([
      makePart({ id: 'a', material: { preset: 'metal', color: [0.5, 0.5, 0.6], roughness: 0.3 } }),
    ])
    const { childNodes } = buildGeneratedAssemblyNodes(ir)
    expect(childNodes[0].materialPreset).toBe('metal')
    expect(childNodes[0].material?.properties).toMatchObject({ color: '#808099', roughness: 0.3 })
  })
})

describe('buildGeneratedAssemblyCreatePatches', () => {
  it('emits the root first, then parts with parents before children', () => {
    const ir = makeIR([
      makePart({
        id: 'screen',
        parentId: 'lid',
        transform: {
          space: 'local',
          position: [0, 0, 0.005],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
      makePart({ id: 'lid' }),
      makePart({ id: 'base' }),
    ])
    const plan = buildGeneratedAssemblyCreatePatches(ir, { parentId: 'level_1' })
    expect(plan.patches).toHaveLength(4)
    expect(plan.patches[0].node.type).toBe('generated-assembly')
    expect(plan.patches[0].parentId).toBe('level_1')
    const partTypes = plan.patches.slice(1).map((p) => (p.node as { partId: string }).partId)
    // lid must precede screen despite screen appearing first in the IR
    expect(partTypes.indexOf('lid')).toBeLessThan(partTypes.indexOf('screen'))
    const screenPatch = plan.patches.find(
      (p) => (p.node as { partId?: string }).partId === 'screen',
    )
    const lidPatch = plan.patches.find((p) => (p.node as { partId?: string }).partId === 'lid')
    expect(screenPatch?.parentId).toBe(lidPatch?.node.id)
  })
})
