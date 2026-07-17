import { CeilingNode, LevelNode, WallNode } from '@pascal-app/core'
import { describe, expect, test } from 'bun:test'
import { getDefaultRoofPlacementY } from './roof-placement-height'

describe('getDefaultRoofPlacementY', () => {
  test('uses the tallest wall height on the current level', () => {
    const level = LevelNode.parse({ children: [], level: 0 })
    const lowWall = WallNode.parse({ height: 2.4, start: [0, 0], end: [1, 0] })
    const tallWall = WallNode.parse({ height: 3.1, start: [1, 0], end: [1, 1] })
    level.children = [lowWall.id, tallWall.id]

    expect(
      getDefaultRoofPlacementY(level.id, {
        [level.id]: level,
        [lowWall.id]: lowWall,
        [tallWall.id]: tallWall,
      }),
    ).toBe(3.1)
  })

  test('prefers a taller ceiling height over wall height', () => {
    const level = LevelNode.parse({ children: [], level: 0 })
    const wall = WallNode.parse({ height: 2.5, start: [0, 0], end: [1, 0] })
    const ceiling = CeilingNode.parse({
      height: 2.8,
      polygon: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    })
    level.children = [wall.id, ceiling.id]

    expect(
      getDefaultRoofPlacementY(level.id, {
        [level.id]: level,
        [wall.id]: wall,
        [ceiling.id]: ceiling,
      }),
    ).toBe(2.8)
  })

  test('falls back to the default wall height for an empty level', () => {
    const level = LevelNode.parse({ children: [], level: 0 })

    expect(getDefaultRoofPlacementY(level.id, { [level.id]: level })).toBe(2.5)
  })
})
