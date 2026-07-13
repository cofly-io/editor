import { beforeEach, describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  BoxNode,
  BuildingNode,
  LevelNode,
  useScene,
} from '@pascal-app/core'
import useViewer from '@pascal-app/viewer/store'
import { copySelectedNodesToEditorClipboard, pasteEditorClipboardToLevel } from './scene-clipboard'

describe('scene clipboard', () => {
  beforeEach(() => {
    useScene.setState({ nodes: {}, rootNodeIds: [], collections: {} } as never)
    useScene.temporal.getState().clear()
    useViewer.getState().resetSelection()
  })

  test('copies and pastes a selected canvas primitive onto its level', () => {
    const building = BuildingNode.parse({ id: 'building_a', children: ['level_a'] })
    const level = LevelNode.parse({
      id: 'level_a',
      parentId: 'building_a',
      children: ['box_a'],
    })
    const box = BoxNode.parse({
      id: 'box_a',
      parentId: 'level_a',
      position: [1, 0.5, 2],
    })

    useScene.setState({
      nodes: {
        [building.id]: building,
        [level.id]: level,
        [box.id]: box,
      } as Record<AnyNodeId, AnyNode>,
      rootNodeIds: [building.id] as AnyNodeId[],
      collections: {},
    } as never)
    useViewer.getState().setSelection({ selectedIds: [box.id as AnyNodeId] })

    expect(copySelectedNodesToEditorClipboard()).toBe(true)
    const result = pasteEditorClipboardToLevel()

    expect(result?.pastedIds).toHaveLength(1)
    const pastedId = result?.pastedIds[0]
    expect(pastedId).toBeDefined()
    expect(pastedId).not.toBe(box.id)
    expect(useScene.getState().nodes[pastedId!]).toMatchObject({
      type: 'box',
      parentId: 'level_a',
      position: [1, 0.5, 2],
    })
    expect(useViewer.getState().selection).toMatchObject({
      levelId: 'level_a',
      selectedIds: [pastedId],
    })
  })
})
