import { describe, expect, it } from 'bun:test'
import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import { prepareGeneratedAssemblyCanvasPlacement } from './generated-assembly-placement-actions'
import { buildGeneratedAssemblyCreatePatches } from './generated-geometry-placement'

function makePart(id: string): AssemblyIR['parts'][number] {
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
    material: {},
    fingerprint: `fp-${id}`,
  }
}

function makeAssembly(parentId?: string | null) {
  const ir: AssemblyIR = {
    schemaVersion: 1,
    generator: { sourceHash: 'source', apiVersion: '1.0.0', paramsHash: 'params' },
    parts: [makePart('body'), makePart('door')],
    constraints: [],
  }
  const plan = buildGeneratedAssemblyCreatePatches(ir, { parentId })
  return {
    ir,
    rootNode: plan.rootNode,
    patches: plan.patches,
    nodeIdByPartId: Object.fromEntries(plan.nodeIdByPartId),
  }
}
describe('prepareGeneratedAssemblyCanvasPlacement', () => {
  it('forces the DSL assembly root under the current level before creating nodes', () => {
    const assembly = makeAssembly(null)
    const result = prepareGeneratedAssemblyCanvasPlacement(assembly, 'level_1')

    expect(result.createOps[0]?.node.type).toBe('generated-assembly')
    expect(result.createOps[0]?.parentId).toBe('level_1')
    expect(result.createOps.slice(1).every((op) => op.parentId !== 'level_1')).toBe(true)
  })

  it('marks the root as a placement draft when starting canvas placement', () => {
    const assembly = makeAssembly(null)
    const result = prepareGeneratedAssemblyCanvasPlacement(assembly, 'level_1', {
      startPlacement: true,
    })

    expect(result.placedRoot.visible).toBe(false)
    expect(result.placedRoot.metadata).toMatchObject({
      disablePrimitiveBatch: true,
      isNew: true,
    })
    expect(result.createOps[0]?.node.id).toBe(assembly.rootNode.id)
  })
})
