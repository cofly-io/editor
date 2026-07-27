import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { nodeRegistry, registerNode } from '../registry'
import type { AnyNodeDefinition } from '../registry/types'
import { LevelNode, WallNode } from '../schema'
import { validateBuildJson } from './validate-build-json'

function makeScene() {
  const wall = WallNode.parse({
    id: 'wall_test1',
    parentId: 'level_test',
    start: [0, 0],
    end: [4, 0],
    thickness: 0.1,
  })
  const level = LevelNode.parse({ id: 'level_test', level: 0, children: [wall.id] })
  return {
    nodes: { [level.id]: level, [wall.id]: wall } as Record<string, unknown>,
    rootNodeIds: [level.id],
  }
}

function addPluginNode(scene: ReturnType<typeof makeScene>, position: unknown) {
  const level = scene.nodes.level_test as { children: string[] }
  scene.nodes.plugin_node = {
    id: 'plugin_node',
    type: 'factory:machine',
    object: 'node',
    parentId: 'level_test',
    visible: true,
    metadata: {},
    children: [],
    position,
  }
  level.children = [...level.children, 'plugin_node']
  return scene
}

describe('validateBuildJson plugin children', () => {
  test('does not block a level containing an unregistered plugin child', () => {
    const result = validateBuildJson(addPluginNode(makeScene(), [1, 0, 1]))

    expect(result.ok).toBe(true)
    expect(result.warnings.some((warning) => warning.code === 'unknown_types')).toBe(true)
    expect((result.parsed?.nodes.level_test as { children: string[] }).children).toContain(
      'plugin_node',
    )
  })

  describe('registered plugin nodes', () => {
    beforeEach(() => {
      nodeRegistry._reset()
      registerNode({
        kind: 'factory:machine',
        schemaVersion: 1,
        schema: z.looseObject({
          id: z.string(),
          type: z.literal('factory:machine'),
          position: z.tuple([z.number(), z.number(), z.number()]),
        }),
        category: 'utility',
        defaults: () => ({}),
        capabilities: {},
      } as unknown as AnyNodeDefinition)
    })

    afterEach(() => nodeRegistry._reset())

    test('validates a registered plugin node without marking it unknown', () => {
      const result = validateBuildJson(addPluginNode(makeScene(), [1, 0, 1]))

      expect(result.ok).toBe(true)
      expect(result.stats.pluginTypes['factory:machine']).toBe(1)
      expect(result.warnings.some((warning) => warning.code === 'unknown_types')).toBe(false)
    })

    test('rejects a registered plugin node that fails its schema', () => {
      const result = validateBuildJson(addPluginNode(makeScene(), 'not-a-position'))

      expect(result.ok).toBe(false)
      expect(result.schemaIssues[0]?.nodeId).toBe('plugin_node')
    })
  })
})
