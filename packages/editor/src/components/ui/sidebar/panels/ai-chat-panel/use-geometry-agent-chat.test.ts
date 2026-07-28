import { describe, expect, test } from 'bun:test'
import { AI_GENERATION_MODES } from './chat-utils'
import { shouldUseGeometryAgentForPrimitivePrompt } from './use-geometry-agent-chat'
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
})
