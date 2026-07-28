import { GeneratedAssemblyNode as GeneratedAssemblyNodeSchema, type NodeDefinition } from '@pascal-app/core'
import { buildGeneratedAssemblyGeometry } from './geometry'
import { GeneratedAssemblyNode } from './schema'

export const generatedAssemblyDefinition: NodeDefinition<typeof GeneratedAssemblyNode> = {
  kind: 'generated-assembly',
  schemaVersion: 1,
  schema: GeneratedAssemblyNode,
  category: 'structure',

  defaults: () => {
    const stub = GeneratedAssemblyNodeSchema.parse({
      id: 'generated-assembly_default' as never,
      type: 'generated-assembly',
      generator: {
        sourceHash: '',
        apiVersion: '',
        paramsHash: '',
        irHash: '',
        source: '',
        params: {},
      },
    })
    const { id: _id, type: _type, ...rest } = stub
    return rest
  },

  capabilities: {
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
    movable: { axes: ['x', 'z'] as const, gridSnap: true },
    rotatable: { axes: ['y'] as const },
  },

  relations: {
    cascadeDelete: 'descendants',
  },

  geometry: buildGeneratedAssemblyGeometry,

  presentation: {
    label: 'Generated Assembly',
    description: 'Root of a DSL-generated assembly; children are generated-mesh parts.',
    icon: { kind: 'iconify', name: 'mdi:group' },
    paletteSection: 'structure',
    hidden: true,
  },

  mcp: {
    description:
      'Root node of a DSL-generated assembly. Carries generator provenance and the user override layer; children are generated-mesh nodes, one per IR part.',
  },
}
