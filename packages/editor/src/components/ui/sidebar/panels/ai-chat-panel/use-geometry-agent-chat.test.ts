import { describe, expect, test } from 'bun:test'
import { AI_GENERATION_MODES } from './chat-utils'
import {
  shouldStartNewGeometryAgentSession,
  shouldUseGeometryAgentForPrimitivePrompt,
} from './use-geometry-agent-chat'
import type { ChatMessage } from './types'

describe('geometry agent routing inside primitive mode', () => {
  test('does not expose geometry-agent as a user-selectable mode', () => {
    expect(AI_GENERATION_MODES.map((mode) => mode.id)).toEqual([
      'primitive',
      'image-to-3d',
      'articraft',
    ])
  })

  test('routes industrial equipment prompts to the source-memory agent', () => {
    expect(
      shouldUseGeometryAgentForPrimitivePrompt({
        text: '生成一个带透明防护罩的皮带输送机',
        messages: [],
      }),
    ).toBe(true)
  })

  test('keeps simple primitive prompts on the legacy geometry path', () => {
    expect(
      shouldUseGeometryAgentForPrimitivePrompt({
        text: '生成一个红色球体',
        messages: [],
      }),
    ).toBe(false)
  })

  test('continues an existing geometry-agent session even for short edits', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'done',
        generationRun: { id: 'geo_agent_1', mode: 'geometry-agent', status: 'succeeded' },
        geometryAgentSession: { sessionId: 'geo_agent_1' } as never,
      },
    ]

    expect(
      shouldUseGeometryAgentForPrimitivePrompt({
        text: '罩子大一点',
        messages,
      }),
    ).toBe(true)
  })

  test('detects explicit create prompts as new geometry-agent sessions', () => {
    expect(shouldStartNewGeometryAgentSession('generate a vertical storage tank')).toBe(true)
    expect(
      shouldStartNewGeometryAgentSession(
        '\u751f\u6210\u4e00\u4e2a\u7acb\u5f0f\u50a8\u7f50\uff0c\u5e26\u68c0\u4fee\u53e3',
      ),
    ).toBe(true)
    expect(shouldStartNewGeometryAgentSession('\u7f69\u5b50\u5927\u4e00\u70b9')).toBe(false)
  })

  test('does not let old geometry-agent sessions hijack explicit simple primitive creates', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'done',
        generationRun: { id: 'geo_agent_1', mode: 'geometry-agent', status: 'succeeded' },
        geometryAgentSession: { sessionId: 'geo_agent_1' } as never,
      },
    ]

    expect(
      shouldUseGeometryAgentForPrimitivePrompt({
        text: 'generate a red sphere',
        messages,
      }),
    ).toBe(false)
  })

  test('starts a new geometry-agent route for explicit equipment creates after an old session', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'done',
        generationRun: { id: 'geo_agent_1', mode: 'geometry-agent', status: 'succeeded' },
        geometryAgentSession: { sessionId: 'geo_agent_1' } as never,
      },
    ]

    expect(
      shouldUseGeometryAgentForPrimitivePrompt({
        text: '\u751f\u6210\u4e00\u4e2a\u7acb\u5f0f\u50a8\u7f50\uff0c\u5e26\u68c0\u4fee\u53e3\u3001\u722c\u68af\u548c\u6cd5\u5170\u63a5\u53e3',
        messages,
      }),
    ).toBe(true)
    expect(
      shouldUseGeometryAgentForPrimitivePrompt({
        text: '\u751f\u6210\u4e00\u4e2a\u888b\u5f0f\u9664\u5c18\u5668\uff0c\u5e26\u4e0b\u6599\u6597\u548c\u8109\u51b2\u9600',
        messages,
      }),
    ).toBe(true)
  })
})
