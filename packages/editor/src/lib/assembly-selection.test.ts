import { describe, expect, test } from 'bun:test'
import { AssemblyNode, BoxNode, GeneratedAssemblyNode, GeneratedMeshNode } from '@pascal-app/core'
import { findContainingAssemblyNodeInMap, isAssemblyContainerNode } from './assembly-selection'

describe('assembly selection helpers', () => {
  test('treats generated-assembly as an assembly container', () => {
    const generatedAssembly = GeneratedAssemblyNode.parse({
      id: 'generated-assembly_robot',
      generator: {
        sourceHash: 'source',
        apiVersion: 'v1',
        paramsHash: 'params',
        irHash: 'ir',
        source: 'part("robot.base", box({ length: 1, width: 1, height: 1 }))',
      },
    })

    expect(isAssemblyContainerNode(generatedAssembly)).toBe(true)
  })

  test('finds generated assembly parent from generated mesh child', () => {
    const generatedAssembly = GeneratedAssemblyNode.parse({
      id: 'generated-assembly_bridge',
      generator: {
        sourceHash: 'source',
        apiVersion: 'v1',
        paramsHash: 'params',
        irHash: 'ir',
        source: 'part("bridge.deck", box({ length: 1, width: 1, height: 1 }))',
      },
    })
    const generatedMesh = GeneratedMeshNode.parse({
      id: 'generated-mesh_bridge_deck',
      parentId: generatedAssembly.id,
      partId: 'bridge.deck',
      geometry: {
        kind: 'primitive-recipe',
        recipeId: 'box',
        params: { length: 1, width: 1, height: 1 },
      },
      fingerprint: 'deck',
    })

    expect(
      findContainingAssemblyNodeInMap(generatedMesh, {
        [generatedAssembly.id]: generatedAssembly,
        [generatedMesh.id]: generatedMesh,
      })?.id,
    ).toBe(generatedAssembly.id)
  })

  test('keeps existing profile assembly parent behavior', () => {
    const assembly = AssemblyNode.parse({
      id: 'assembly_profile_bike',
      type: 'assembly',
      position: [0, 0, 0],
    })
    const child = BoxNode.parse({
      id: 'box_profile_child',
      type: 'box',
      parentId: assembly.id,
      position: [0, 0, 0],
      size: [1, 1, 1],
    })

    expect(
      findContainingAssemblyNodeInMap(child, {
        [assembly.id]: assembly,
        [child.id]: child,
      })?.id,
    ).toBe(assembly.id)
  })
})
