import { describe, expect, test } from 'bun:test'
import type { SceneGraph } from './scene'
import { prepareSceneGraphForSave } from './scene-save'

describe('prepareSceneGraphForSave', () => {
  test('removes transient placement metadata without mutating the live scene graph', () => {
    const scene: SceneGraph = {
      nodes: {
        assembly_generated: {
          id: 'assembly_generated',
          type: 'assembly',
          metadata: {
            generatedBy: 'ai-chat',
            isNew: true,
          },
        },
      },
      rootNodeIds: ['assembly_generated'],
    }

    const prepared = prepareSceneGraphForSave(scene)

    expect(prepared.nodes.assembly_generated).toMatchObject({
      metadata: { generatedBy: 'ai-chat' },
    })
    expect(prepared.nodes.assembly_generated).not.toMatchObject({
      metadata: { isNew: true },
    })
    expect(scene.nodes.assembly_generated).toMatchObject({
      metadata: { isNew: true },
    })
  })

  test('excludes transient nodes and repairs graph references', () => {
    const scene: SceneGraph = {
      nodes: {
        assembly_parent: {
          id: 'assembly_parent',
          type: 'assembly',
          children: ['box_saved', 'box_draft'],
        },
        box_saved: {
          id: 'box_saved',
          type: 'box',
          parentId: 'assembly_parent',
        },
        box_draft: {
          id: 'box_draft',
          type: 'box',
          parentId: 'assembly_parent',
          metadata: { isTransient: true },
        },
      },
      rootNodeIds: ['assembly_parent', 'box_draft'],
      collections: {
        collection_one: {
          id: 'collection_one',
          nodeIds: ['box_saved', 'box_draft'],
          controlNodeId: 'box_draft',
        },
      },
    }

    const prepared = prepareSceneGraphForSave(scene)

    expect(prepared.nodes.box_draft).toBeUndefined()
    expect(prepared.nodes.assembly_parent).toMatchObject({ children: ['box_saved'] })
    expect(prepared.rootNodeIds).toEqual(['assembly_parent'])
    expect(prepared.collections?.collection_one).toEqual({
      id: 'collection_one',
      nodeIds: ['box_saved'],
    })
    expect(scene.nodes.box_draft).toBeDefined()
  })

  test('drops unreachable nodes before save', () => {
    const scene: SceneGraph = {
      nodes: {
        site_root: {
          id: 'site_root',
          type: 'site',
          children: ['building_1'],
        },
        building_1: {
          id: 'building_1',
          type: 'building',
          parentId: 'site_root',
          children: ['level_1'],
        },
        level_1: {
          id: 'level_1',
          type: 'level',
          parentId: 'building_1',
          children: [],
        },
        generated_assembly_orphan: {
          id: 'generated_assembly_orphan',
          type: 'generated-assembly',
          parentId: null,
          children: ['generated_mesh_orphan'],
        },
        generated_mesh_orphan: {
          id: 'generated_mesh_orphan',
          type: 'generated-mesh',
          parentId: 'generated_assembly_orphan',
        },
      },
      rootNodeIds: ['site_root'],
    }

    const prepared = prepareSceneGraphForSave(scene)

    expect(prepared.nodes.generated_assembly_orphan).toBeUndefined()
    expect(prepared.nodes.generated_mesh_orphan).toBeUndefined()
    expect(prepared.nodes.site_root).toBeDefined()
    expect(prepared.nodes.building_1).toBeDefined()
    expect(prepared.nodes.level_1).toBeDefined()
    expect(prepared.rootNodeIds).toEqual(['site_root'])
  })
})
