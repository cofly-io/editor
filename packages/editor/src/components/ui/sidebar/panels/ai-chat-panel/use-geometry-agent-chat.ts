import { type AnyNode, useScene } from '@pascal-app/core'
import type { Dispatch, SetStateAction } from 'react'
import {
  createGeometryAgentSessionClient,
  geometryAgentDebugDetails,
  sendGeometryAgentMessageClient,
} from '../../../../../lib/geometry-agent-client'
import type { GeometryAgentRunResponse } from '../../../../../lib/geometry-agent-client-types'
import { t } from '../../../../../i18n'
import { isAbortError } from './chat-utils'
import { buildGeometryAgentResultSummary } from './run-summaries'
import type { ChatImageAttachment, ChatMessage } from './types'

function latestGeometryAgentSessionId(messages: readonly ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const sessionId = messages[index]?.geometryAgentSession?.sessionId
    if (sessionId) return sessionId
  }
  return null
}

function applyGeneratedAssembly(response: GeometryAgentRunResponse): {
  applied: boolean
  patchCount: number
  applyError?: string
} {
  const patches = response.generatedAssembly?.patches ?? []
  const createOps = patches
    .filter((patch) => patch.op === 'create')
    .map((patch) => ({ node: patch.node as AnyNode, ...(patch.parentId ? { parentId: patch.parentId } : {}) }))
  if (createOps.length === 0) return { applied: false, patchCount: 0 }
  try {
    useScene.getState().createNodes(createOps as never)
    return { applied: true, patchCount: createOps.length }
  } catch (error) {
    return {
      applied: false,
      patchCount: createOps.length,
      applyError: error instanceof Error ? error.message : String(error),
    }
  }
}

export function useGeometryAgentChat({
  activeAbortControllerRef,
  input,
  loading,
  markGenerationStopped,
  messages,
  setImageAttachment,
  setInput,
  setLoading,
  setMessages,
}: {
  activeAbortControllerRef: { current: AbortController | null }
  input: string
  loading: boolean
  markGenerationStopped: (content?: string) => void
  messages: ChatMessage[]
  setImageAttachment: Dispatch<SetStateAction<ChatImageAttachment | undefined>>
  setInput: Dispatch<SetStateAction<string>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}) {
  const sendGeometryAgentMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return

    const controller = new AbortController()
    activeAbortControllerRef.current = controller
    setInput('')
    setImageAttachment(undefined)
    setLoading(true)

    const existingSessionId = latestGeometryAgentSessionId(messages)
    const runId = existingSessionId ?? `geo_agent_pending_${Date.now()}`
    const userMsg: ChatMessage = { role: 'user', content: text }
    const pendingMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      generationRun: { id: runId, mode: 'geometry-agent', status: 'running' },
      factoryRunSummary: buildGeometryAgentResultSummary({
        prompt: text,
        status: 'running',
        isEdit: Boolean(existingSessionId),
      }),
    }
    setMessages((prev) => [...prev, userMsg, pendingMsg])

    try {
      const response = existingSessionId
        ? await sendGeometryAgentMessageClient(
            existingSessionId,
            { instruction: text },
            { signal: controller.signal },
          )
        : await createGeometryAgentSessionClient(
            { mode: 'text', prompt: text },
            { signal: controller.signal },
          )

      const applyResult = existingSessionId
        ? { applied: false, patchCount: 0 }
        : applyGeneratedAssembly(response)
      const summary = buildGeometryAgentResultSummary({
        prompt: text,
        status:
          response.result.kind === 'ok' && (applyResult.applied || existingSessionId)
            ? 'succeeded'
            : 'failed',
        response,
        isEdit: Boolean(existingSessionId),
        applied: applyResult.applied,
        patchCount: applyResult.patchCount,
        applyError: applyResult.applyError,
      })

      setMessages((prev) =>
        prev.map((message) =>
          message.generationRun?.id === runId
            ? {
                role: 'assistant',
                content:
                  response.lastRun?.changeFeedback?.text ??
                  response.lastRun?.summary ??
                  'Geometry agent run completed.',
                generationRun: {
                  id: response.sessionId,
                  mode: 'geometry-agent',
                  status: summary.status === 'succeeded' ? 'succeeded' : 'failed',
                },
                factoryRunSummary: summary,
                geometryAgentSession: response,
              }
            : message,
        ),
      )
    } catch (error) {
      if (isAbortError(error)) {
        markGenerationStopped()
        return
      }
      const message = String((error as { message?: unknown } | null)?.message ?? error)
      setMessages((prev) =>
        prev.map((item) =>
          item.generationRun?.id === runId
            ? {
                role: 'assistant',
                content: t('aiChat.error', {
                  fallback: '出错了：{message}',
                  params: { message },
                }),
                generationRun: { id: runId, mode: 'geometry-agent', status: 'failed' },
                factoryRunSummary: buildGeometryAgentResultSummary({
                  prompt: text,
                  status: 'failed',
                  isEdit: Boolean(existingSessionId),
                  debugDetails: `runId=${runId}\n${message}`,
                }),
              }
            : item,
        ),
      )
    } finally {
      if (activeAbortControllerRef.current === controller) activeAbortControllerRef.current = null
      setLoading(false)
    }
  }

  return { sendGeometryAgentMessage }
}

export function geometryAgentSessionDebugDetails(message: ChatMessage): string | undefined {
  return message.geometryAgentSession
    ? geometryAgentDebugDetails(message.geometryAgentSession)
    : message.factoryRunSummary?.details
}
