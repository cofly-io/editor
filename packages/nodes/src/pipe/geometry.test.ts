import { describe, expect, test } from 'bun:test'
import { buildPipeHangerBatches, getPipeHangerInstances } from './hanger-batching'
import { PipeNode } from './schema'

describe('pipe hanger batching', () => {
  test('groups repeated hangers across pipes with matching dimensions', () => {
    const node = PipeNode.parse({
      start: [0, 0],
      end: [8, 0],
      elevation: 2,
      hangerSpacing: 2,
      showHangers: true,
    })

    const matching = PipeNode.parse({
      start: [0, 2],
      end: [8, 2],
      elevation: 2,
      hangerSpacing: 2,
      showHangers: true,
    })
    const batches = buildPipeHangerBatches({ [node.id]: node, [matching.id]: matching })

    expect(batches).toHaveLength(1)
    expect(batches[0]?.instances).toHaveLength(10)
  })

  test('omits hangers for vertical pipes', () => {
    const node = PipeNode.parse({
      start: [0, 0],
      end: [8, 0],
      elevation: 2,
      rotate: 90,
    })

    expect(getPipeHangerInstances(node)).toEqual([])
  })
})
