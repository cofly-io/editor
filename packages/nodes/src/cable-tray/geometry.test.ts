import { describe, expect, test } from 'bun:test'
import { buildCableTrayGeometry, getCableTraySegmentCount } from './geometry'
import { CableTrayNode } from './schema'

describe('cable tray geometry', () => {
  test('uses one segment for a straight tray', () => {
    const node = CableTrayNode.parse({
      start: [0, 0],
      end: [4, 0],
      showRungs: false,
    })

    expect(getCableTraySegmentCount(node)).toBe(1)
    expect(buildCableTrayGeometry(node).children).toHaveLength(3)
  })

  test('keeps curved trays tessellated', () => {
    const node = CableTrayNode.parse({
      start: [0, 0],
      end: [4, 0],
      curveOffset: 1,
      showRungs: false,
    })

    expect(getCableTraySegmentCount(node)).toBeGreaterThan(1)
  })
})
