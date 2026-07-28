import { describe, expect, it } from 'bun:test'
import { AnyNode } from '../types'
import { GeneratedAssemblyNode, GeneratedMeshNode } from './generated-mesh'

const generator = {
  sourceHash: 'src-hash',
  apiVersion: '1.0.0',
  paramsHash: 'params-hash',
  irHash: 'ir-hash',
  source: 'const P = params({});',
  params: { keycapWidth: 0.018 },
}

const overrides = [
  {
    partId: 'keyboard.key.r0.c0',
    transform: { position: [0.1, 0, 0] as [number, number, number] },
    material: { preset: 'metal' as const },
    visibility: true,
    note: 'user tweak',
  },
]

const orphans = [
  {
    partId: 'ghost.part',
    override: { partId: 'ghost.part', visibility: false },
    detectedAt: '2026-07-26T00:00:00Z',
    reason: 'part_removed' as const,
  },
]

describe('generated node persistence round-trip', () => {
  it('GeneratedAssemblyNode survives JSON round-trip through AnyNode', () => {
    const root = GeneratedAssemblyNode.parse({
      name: 'laptop',
      position: [1, 0, 2],
      generator,
      overrides,
      overrideOrphans: orphans,
      children: ['generated-mesh_x'],
    })
    // Discriminated union accepts it
    const asAny = AnyNode.parse(JSON.parse(JSON.stringify(root)))
    expect(asAny.type).toBe('generated-assembly')

    const revived = GeneratedAssemblyNode.parse(JSON.parse(JSON.stringify(asAny)))
    expect(revived).toEqual(root)
    expect(revived.generator.sourceHash).toBe('src-hash')
    expect(revived.overrides[0]?.partId).toBe('keyboard.key.r0.c0')
    expect(revived.overrideOrphans[0]?.reason).toBe('part_removed')
  })

  it('GeneratedMeshNode survives JSON round-trip through AnyNode', () => {
    const mesh = GeneratedMeshNode.parse({
      partId: 'keyboard.key.r3.c7',
      semanticRole: 'keyboard_key',
      parentId: 'generated-assembly_abc',
      position: [0.011, 0.024, -0.056],
      rotation: [0.35, 0, 0],
      scale: [1, 1, 1],
      geometry: {
        kind: 'primitive-recipe',
        recipeId: 'primitive.box',
        params: { length: 0.018, width: 0.018, height: 0.008 },
      },
      materialPreset: 'plastic',
      fingerprint: 'fp-abc123',
    })
    const asAny = AnyNode.parse(JSON.parse(JSON.stringify(mesh)))
    expect(asAny.type).toBe('generated-mesh')

    const revived = GeneratedMeshNode.parse(JSON.parse(JSON.stringify(asAny)))
    expect(revived).toEqual(mesh)
    expect(revived.partId).toBe('keyboard.key.r3.c7')
    expect(revived.fingerprint).toBe('fp-abc123')
    expect(revived.geometry.kind).toBe('primitive-recipe')
    if (revived.geometry.kind !== 'primitive-recipe') return
    expect(revived.geometry.recipeId).toBe('primitive.box')
  })

  it('preserves a mesh-blob descriptor without embedding its payload in the scene', () => {
    const mesh = GeneratedMeshNode.parse({
      partId: 'housing.shell',
      geometry: {
        kind: 'mesh-blob',
        blobId: '9bc1c9c1',
        format: 'pascal-mesh-v1',
        vertexCount: 4,
        indexCount: 6,
        bounds: { min: [-1, -0.5, -1], max: [1, 0.5, 1] },
        hasNormals: true,
        hasUVs: true,
      },
      fingerprint: 'blob-fingerprint',
    })
    const revived = GeneratedMeshNode.parse(JSON.parse(JSON.stringify(mesh)))
    expect(revived.geometry).toEqual(mesh.geometry)
    expect(JSON.stringify(revived)).not.toContain('positions')
  })

  it('defaults fill in when optional fields are omitted', () => {
    const root = GeneratedAssemblyNode.parse({ generator })
    expect(root.children).toEqual([])
    expect(root.overrides).toEqual([])
    expect(root.overrideOrphans).toEqual([])
    expect(root.position).toEqual([0, 0, 0])
    expect(root.visible).toBe(true)

    const mesh = GeneratedMeshNode.parse({
      partId: 'p1',
      geometry: { kind: 'primitive-recipe', recipeId: 'primitive.sphere', params: { radius: 1 } },
      fingerprint: 'fp',
    })
    expect(mesh.scale).toEqual([1, 1, 1])
    expect(mesh.rotation).toEqual([0, 0, 0])
  })
})
