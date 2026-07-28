import { describe, expect, it } from 'bun:test'
import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import type { GeneratedAssemblyNode, GeneratedMeshNode } from '@pascal-app/core/schema'
import {
  commitGeneratedAssemblyRerun,
  planGeneratedAssemblyRerun,
} from './generated-assembly-rerun'
import { buildGeneratedAssemblyNodes } from './generated-geometry-placement'

type Part = AssemblyIR['parts'][number]

function makePart(overrides: Partial<Part> & { id: string }): Part {
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
  } as Part
}

function makeIR(parts: Part[], sourceHash = 'src-v1'): AssemblyIR {
  return {
    schemaVersion: 1,
    generator: { sourceHash, apiVersion: '1.0.0', paramsHash: 'prm' },
    parts,
    constraints: [],
  }
}

/** Build the "existing scene": root + part nodes as the placement module would. */
function makeExistingScene(ir: AssemblyIR, overrides: GeneratedAssemblyNode['overrides'] = []) {
  const { rootNode, childNodes } = buildGeneratedAssemblyNodes(ir, { overrides })
  return {
    root: { ...rootNode, overrides } as GeneratedAssemblyNode,
    parts: childNodes,
  }
}

describe('planGeneratedAssemblyRerun', () => {
  it('kept parts are updated in place with preserved node ids', () => {
    const irV1 = makeIR([makePart({ id: 'a' }), makePart({ id: 'b' })])
    const { root, parts } = makeExistingScene(irV1)

    const irV2 = makeIR(
      [makePart({ id: 'a', fingerprint: 'fp-a-v2' }), makePart({ id: 'b' })],
      'src-v2',
    )
    const plan = planGeneratedAssemblyRerun(root, parts, irV2, {
      generator: {
        sourceHash: 'src-v2',
        apiVersion: '1.0.0',
        paramsHash: 'prm',
        irHash: 'ir2',
        source: '// v2',
        params: {},
      },
    })

    expect(plan.deletes).toHaveLength(0)
    expect(plan.creates).toHaveLength(0)
    // root update + 2 part updates
    expect(plan.updates).toHaveLength(3)
    const aUpdate = plan.updates.find((u) => u.id === parts.find((p) => p.partId === 'a')?.id)
    expect(aUpdate).toBeDefined()
    expect((aUpdate?.data as { fingerprint?: string }).fingerprint).toBe('fp-a-v2')
    expect(plan.diff.kept.map((k) => k.partId).sort()).toEqual(['a', 'b'])
    expect(plan.diff.kept.find((k) => k.partId === 'a')?.fingerprintChanged).toBe(true)
    expect(plan.diff.kept.find((k) => k.partId === 'b')?.fingerprintChanged).toBe(false)
    // root carries new provenance
    const rootUpdate = plan.updates.find((u) => u.id === root.id)
    expect((rootUpdate?.data as { generator?: { sourceHash: string } }).generator?.sourceHash).toBe(
      'src-v2',
    )
  })

  it('added parts create nodes attached under the root', () => {
    const irV1 = makeIR([makePart({ id: 'a' })])
    const { root, parts } = makeExistingScene(irV1)
    const irV2 = makeIR([makePart({ id: 'a' }), makePart({ id: 'c' })], 'src-v2')

    const plan = planGeneratedAssemblyRerun(root, parts, irV2)
    expect(plan.creates).toHaveLength(1)
    expect(plan.creates[0].parentId).toBe(root.id)
    expect((plan.creates[0].node as GeneratedMeshNode).partId).toBe('c')
    expect(plan.deletes).toHaveLength(0)
  })

  it('removed parts are deleted and their overrides become orphans', () => {
    const irV1 = makeIR([makePart({ id: 'a' }), makePart({ id: 'b' })])
    const overrides = [
      { partId: 'a', visibility: false as const },
      { partId: 'b', transform: { position: [5, 0, 0] as [number, number, number] } },
    ]
    const { root, parts } = makeExistingScene(irV1, overrides)
    const irV2 = makeIR([makePart({ id: 'a' })], 'src-v2')

    const plan = planGeneratedAssemblyRerun(root, parts, irV2, {}, '2026-07-26T00:00:00Z')

    const bNode = parts.find((p) => p.partId === 'b')
    expect(plan.deletes).toEqual([bNode?.id])
    // override for 'a' reapplies; override for 'b' is orphaned
    expect(plan.nextOverrides.map((o) => o.partId)).toEqual(['a'])
    expect(plan.orphans).toHaveLength(1)
    expect(plan.orphans[0]).toMatchObject({
      partId: 'b',
      reason: 'part_removed',
      detectedAt: '2026-07-26T00:00:00Z',
    })
    expect(plan.nextOrphans).toHaveLength(1)
    // root update carries the new override layer
    const rootUpdate = plan.updates.find((u) => u.id === root.id)
    expect((rootUpdate?.data as { overrideOrphans?: unknown[] }).overrideOrphans).toHaveLength(1)
  })

  it('previous orphans are carried forward, never dropped', () => {
    const irV1 = makeIR([makePart({ id: 'a' })])
    const { root, parts } = makeExistingScene(irV1)
    const rootWithOrphan = {
      ...root,
      overrideOrphans: [
        {
          partId: 'ghost',
          override: { partId: 'ghost', visibility: false },
          detectedAt: '2026-07-25T00:00:00Z',
          reason: 'part_removed' as const,
        },
      ],
    } as GeneratedAssemblyNode
    const irV2 = makeIR([makePart({ id: 'a' })], 'src-v2')

    const plan = planGeneratedAssemblyRerun(rootWithOrphan, parts, irV2)
    expect(plan.nextOrphans.map((o) => o.partId)).toEqual(['ghost'])
  })

  it('local-space kept parts re-resolve their parent to the existing parent node id', () => {
    const irV1 = makeIR([
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
    const { root, parts } = makeExistingScene(irV1)
    const irV2 = makeIR(
      [
        makePart({ id: 'lid', fingerprint: 'fp-lid-v2' }),
        makePart({
          id: 'screen',
          parentId: 'lid',
          transform: {
            space: 'local',
            position: [0, 0, 0.006],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        }),
      ],
      'src-v2',
    )

    const plan = planGeneratedAssemblyRerun(root, parts, irV2)
    const lidNode = parts.find((p) => p.partId === 'lid')
    const screenNode = parts.find((p) => p.partId === 'screen')
    const screenUpdate = plan.updates.find((u) => u.id === screenNode?.id)
    expect((screenUpdate?.data as { parentId?: string }).parentId).toBe(lidNode?.id)
    expect((screenUpdate?.data as { position?: number[] }).position).toEqual([0, 0, 0.006])
  })

  it('added local-space parts are created under an existing parent part', () => {
    const irV1 = makeIR([makePart({ id: 'lid' })])
    const { root, parts } = makeExistingScene(irV1)
    const irV2 = makeIR(
      [
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
      ],
      'src-v2',
    )

    const plan = planGeneratedAssemblyRerun(root, parts, irV2)
    const lidNode = parts.find((p) => p.partId === 'lid')
    expect(plan.creates).toHaveLength(1)
    expect(plan.creates[0].parentId).toBe(lidNode?.id)
  })

  it('user override transform beats the regenerated IR transform on kept parts', () => {
    const irV1 = makeIR([makePart({ id: 'a' })])
    const overrides = [
      { partId: 'a', transform: { position: [7, 8, 9] as [number, number, number] } },
    ]
    const { root, parts } = makeExistingScene(irV1, overrides)
    const irV2 = makeIR([makePart({ id: 'a', fingerprint: 'fp-a-v2' })], 'src-v2')

    const plan = planGeneratedAssemblyRerun(root, parts, irV2)
    const aUpdate = plan.updates.find((u) => u.id === parts[0].id)
    expect((aUpdate?.data as { position?: number[] }).position).toEqual([7, 8, 9])
  })

  it('refreshes persisted industrial ports and connections on rerun', () => {
    const irV1 = makeIR([makePart({ id: 'shell' })])
    const { root, parts } = makeExistingScene(irV1)
    const irV2: AssemblyIR = {
      ...makeIR([makePart({ id: 'shell' })], 'src-v2'),
      ports: [{ id: 'shell.feed', partId: 'shell', medium: 'oil', side: 'left', height: 1 }],
      connections: [],
    }

    const plan = planGeneratedAssemblyRerun(root, parts, irV2)
    const rootUpdate = plan.updates.find((update) => update.id === root.id)
    expect((rootUpdate?.data as { ports?: unknown[] }).ports).toEqual(irV2.ports)
    expect((rootUpdate?.data as { connections?: unknown[] }).connections).toEqual([])
  })

  it('commits a rerun only when the observed root revision still matches', () => {
    const ir = makeIR([makePart({ id: 'a' })])
    const { root, parts } = makeExistingScene(ir)
    const plan = planGeneratedAssemblyRerun(root, parts, ir)
    const calls: unknown[] = []
    const store = {
      getState: () => ({
        nodes: { [root.id]: root },
        applyNodeChanges: (changes: unknown) => calls.push(changes),
      }),
    }
    expect(commitGeneratedAssemblyRerun(store, root.id, 0, plan)).toEqual({
      kind: 'committed',
      revision: 1,
    })
    expect(calls).toHaveLength(1)
    expect(JSON.stringify(calls[0])).toContain('"revision":1')
    expect(commitGeneratedAssemblyRerun(store, root.id, 1, plan)).toEqual({
      kind: 'conflict',
      expectedRevision: 1,
      actualRevision: 0,
    })
  })
})
