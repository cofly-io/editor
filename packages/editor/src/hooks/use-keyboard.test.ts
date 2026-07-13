import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  AssemblyNode,
  BoxNode,
  BuildingNode,
  LevelNode,
  useScene,
} from '@pascal-app/core'
import useViewer from '@pascal-app/viewer/store'
import useEditor from '../store/use-editor'
import { nudgeSelectedNodesOnPlan, nudgeSelectedNodesVertically } from './use-keyboard'

globalThis.requestAnimationFrame ??= (callback: FrameRequestCallback) =>
  setTimeout(() => callback(performance.now()), 0) as unknown as number
globalThis.cancelAnimationFrame ??= ((handle: number) =>
  clearTimeout(handle)) as typeof cancelAnimationFrame

function installAssemblyScene() {
  const building = BuildingNode.parse({ id: 'building_a', children: ['level_a'] })
  const level = LevelNode.parse({
    id: 'level_a',
    parentId: 'building_a',
    children: ['assembly_a'],
  })
  const assembly = AssemblyNode.parse({
    id: 'assembly_a',
    parentId: 'level_a',
    position: [1, 0, 2],
    children: ['box_a'],
  })
  const box = BoxNode.parse({
    id: 'box_a',
    parentId: 'assembly_a',
    position: [0.5, 0.25, 0],
  })

  useScene.setState({
    nodes: {
      [building.id]: building,
      [level.id]: level,
      [assembly.id]: assembly,
      [box.id]: box,
    } as Record<AnyNodeId, AnyNode>,
    rootNodeIds: [building.id] as AnyNodeId[],
    collections: {},
  } as never)

  return { assembly, box }
}

function getNodePosition(nodeId: AnyNodeId) {
  const node = useScene.getState().nodes[nodeId]
  return node && 'position' in node ? node.position : undefined
}

describe('keyboard nudges', () => {
  beforeEach(() => {
    useScene.setState({ nodes: {}, rootNodeIds: [], collections: {} } as never)
    useScene.temporal.getState().clear()
    useViewer.getState().resetSelection()
    useEditor.getState().setEditingAssemblyId(null)
  })

  test('nudges an assembly root when an assembly child is selected', () => {
    const { assembly, box } = installAssemblyScene()
    useViewer.getState().setSelection({ selectedIds: [box.id as AnyNodeId] })

    expect(nudgeSelectedNodesOnPlan('ArrowRight', 0.02)).toBe(true)

    expect(getNodePosition(assembly.id)).toEqual([1.02, 0, 2])
    expect(getNodePosition(box.id)).toEqual([0.5, 0.25, 0])
  })

  test('vertically nudges an assembly root when an assembly child is selected', () => {
    const { assembly, box } = installAssemblyScene()
    useViewer.getState().setSelection({ selectedIds: [box.id as AnyNodeId] })

    expect(nudgeSelectedNodesVertically('ArrowUp', 0.02)).toBe(true)

    expect(getNodePosition(assembly.id)).toEqual([1, 0.02, 2])
    expect(getNodePosition(box.id)).toEqual([0.5, 0.25, 0])
  })

  test('nudges the selected assembly child while editing assembly parts', () => {
    const { assembly, box } = installAssemblyScene()
    useEditor.getState().setEditingAssemblyId(assembly.id as AnyNodeId)
    useViewer.getState().setSelection({ selectedIds: [box.id as AnyNodeId] })

    expect(nudgeSelectedNodesOnPlan('ArrowRight', 0.02)).toBe(true)

    expect(getNodePosition(assembly.id)).toEqual([1, 0, 2])
    expect(getNodePosition(box.id)).toEqual([0.52, 0.25, 0])
  })

  test('vertically nudges the selected assembly child while editing assembly parts', () => {
    const { assembly, box } = installAssemblyScene()
    useEditor.getState().setEditingAssemblyId(assembly.id as AnyNodeId)
    useViewer.getState().setSelection({ selectedIds: [box.id as AnyNodeId] })

    expect(nudgeSelectedNodesVertically('ArrowUp', 0.02)).toBe(true)

    expect(getNodePosition(assembly.id)).toEqual([1, 0, 2])
    expect(getNodePosition(box.id)).toEqual([0.5, 0.27, 0])
  })
})
