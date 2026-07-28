import { GeneratedMeshNode as GeneratedMeshNodeSchema, type NodeDefinition } from '@pascal-app/core'
import { GeneratedMeshNode } from './schema'

export const generatedMeshDefinition: NodeDefinition<typeof GeneratedMeshNode> = {
  kind: 'generated-mesh',
  schemaVersion: 1,
  schema: GeneratedMeshNode,
  category: 'structure',

  defaults: () => {
    const stub = GeneratedMeshNodeSchema.parse({
      id: 'generated-mesh_default' as never,
      type: 'generated-mesh',
      partId: 'part',
      geometry: { kind: 'primitive-recipe', recipeId: 'primitive.box', params: {} },
      fingerprint: '',
    })
    const { id: _id, type: _type, ...rest } = stub
    return rest
  },

  capabilities: {
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
    movable: { axes: ['x', 'z'] as const },
    rotatable: { axes: ['y'] as const },
  },

  renderer: { kind: 'parametric', module: () => import('./renderer') },

  presentation: {
    label: 'Generated Part',
    description: 'One part of a DSL-generated assembly.',
    icon: { kind: 'iconify', name: 'mdi:cube-outline' },
    paletteSection: 'structure',
    hidden: true,
  },

  mcp: {
    description:
      'One part of a generated assembly. Geometry is a primitive recipe; the parent generated-assembly node owns provenance and overrides.',
  },
}
