import { describe, expect, test } from 'bun:test'
import {
  applySceneGraphPatch,
  createSceneGraphPatch,
  hasSceneGraphPatchChanges,
  type PatchableSceneGraph,
} from './scene-patch'

const previous: PatchableSceneGraph = {
  nodes: {
    box_a: { id: 'box_a', type: 'box', length: 1 },
    box_removed: { id: 'box_removed', type: 'box', length: 1 },
  },
  rootNodeIds: ['box_a', 'box_removed'],
}

describe('scene graph patch', () => {
  test('sends only changed, created, and removed nodes', () => {
    const next: PatchableSceneGraph = {
      nodes: {
        box_a: { id: 'box_a', type: 'box', length: 2 },
        cylinder_b: { id: 'cylinder_b', type: 'cylinder', radius: 1 },
      },
      rootNodeIds: ['box_a', 'cylinder_b'],
    }
    const patch = createSceneGraphPatch(previous, next)

    expect(patch.nodes).toEqual({
      upsert: {
        box_a: next.nodes.box_a,
        cylinder_b: next.nodes.cylinder_b,
      },
      remove: ['box_removed'],
    })
    expect(applySceneGraphPatch(previous, patch)).toEqual(next)
  })

  test('recognizes an empty patch when references changed but values did not', () => {
    const equivalent = {
      nodes: { ...previous.nodes },
      rootNodeIds: [...previous.rootNodeIds],
    }
    expect(hasSceneGraphPatchChanges(createSceneGraphPatch(previous, equivalent))).toBe(false)
  })
})
