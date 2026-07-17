import { describe, expect, test } from 'bun:test'
import { createDefaultSceneGraph, isEmptySceneGraph } from './default-scene-graph'

describe('createDefaultSceneGraph', () => {
  test('creates a persisted site, building, and level hierarchy', () => {
    const graph = createDefaultSceneGraph()
    const site = graph.nodes[graph.rootNodeIds[0]!]
    const building = site?.type === 'site' ? graph.nodes[site.children[0]!] : undefined
    const level = building?.type === 'building' ? graph.nodes[building.children[0]!] : undefined

    expect(site?.type).toBe('site')
    expect(building).toMatchObject({ parentId: site?.id, type: 'building' })
    expect(level).toMatchObject({ parentId: building?.id, type: 'level' })
  })

  test('identifies only a graph without nodes or roots as empty', () => {
    expect(isEmptySceneGraph({ nodes: {}, rootNodeIds: [] })).toBe(true)
    expect(isEmptySceneGraph(createDefaultSceneGraph())).toBe(false)
  })
})
