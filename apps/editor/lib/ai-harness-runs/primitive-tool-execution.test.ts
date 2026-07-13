import { describe, expect, test } from 'bun:test'
import {
  chooseGeometryToolCall,
  parseToolArguments,
  summarizeToolCalls,
} from './primitive-tool-execution'

describe('primitive tool execution helpers', () => {
  test('parses strict and wrapped tool argument JSON', () => {
    expect(parseToolArguments('{"shape":"sphere"}')).toEqual({ shape: 'sphere' })
    expect(parseToolArguments('Here are the args: {"shape":"box","count":2}')).toEqual({
      shape: 'box',
      count: 2,
    })
  })

  test('selects and summarizes geometry tool calls', () => {
    const calls = [
      { id: 'note', function: { name: 'explain', arguments: '{"text":"skip"}' } },
      { id: 'geo', function: { name: 'compose_parts', arguments: '{"parts":[]}' } },
    ]

    expect(chooseGeometryToolCall(calls)?.id).toBe('geo')
    expect(summarizeToolCalls(calls)).toContain('tool=compose_parts')
  })
})
