import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { t } from '../../../../../i18n'
import { isAbortError, isRecord, throwIfAborted } from './chat-utils'
import {
  buildFactoryPlacementContextSnapshot,
  buildFactorySceneContext,
  buildFactorySelectionSnapshot,
} from './factory-scene'
import { buildFactoryProgressSummary, formatFactoryRunFailureMessage } from './run-summaries'
import type { ChatImageAttachment, ChatMessage } from './types'

function createClientRunId() {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `run_${Date.now().toString(36)}_${random}`
}

export function useFactoryChat({
  activeAbortControllerRef,
  conversationId,
  hasActiveRunEventSources,
  input,
  loading,
  markGenerationStopped,
  messages,
  sceneId,
  setImageAttachment,
  setInput,
  setLoading,
  setMessages,
  subscribeFactoryRun,
}: {
  activeAbortControllerRef: { current: AbortController | null }
  conversationId: string
  hasActiveRunEventSources: () => boolean
  input: string
  loading: boolean
  markGenerationStopped: (content?: string) => void
  messages: ChatMessage[]
  sceneId?: string
  setImageAttachment: Dispatch<SetStateAction<ChatImageAttachment | undefined>>
  setInput: Dispatch<SetStateAction<string>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  subscribeFactoryRun: (run: { id: string; prompt: string; status?: string }) => void
}) {
  const sendFactoryMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    const controller = new AbortController()
    const runId = createClientRunId()
    activeAbortControllerRef.current = controller
    setInput('')
    setImageAttachment(undefined)
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      {
        role: 'assistant',
        content: '',
        factoryRunSummary: buildFactoryProgressSummary({
          message: 'Understanding the request and preparing factory scene changes.',
        }),
        generationRun: { id: runId, mode: 'factory', status: 'queued' },
      },
    ])
    setLoading(true)

    try {
      const selection = buildFactorySelectionSnapshot()
      const sceneContext = buildFactorySceneContext()
      const placementContext = buildFactoryPlacementContextSnapshot()
      const res = await fetch('/api/ai-harness/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          sceneId,
          mode: 'factory',
          runId,
          prompt: text,
          context: {
            recentMessages: messages,
            ...placementContext,
            ...(selection ? { selection } : {}),
            ...(sceneContext ? { scene: sceneContext } : {}),
          },
        }),
        signal: controller.signal,
      })
      throwIfAborted(controller.signal)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(isRecord(data) && typeof data.error === 'string' ? data.error : res.statusText)
      }
      const createdRunId = isRecord(data) && typeof data.runId === 'string' ? data.runId : ''
      if (createdRunId !== runId) throw new Error('Factory run was not created')

      setMessages((prev) => {
        const updated = [...prev]
        const targetIndex = updated.findIndex((message) => message.generationRun?.id === runId)
        if (targetIndex >= 0) {
          updated[targetIndex] = {
            ...updated[targetIndex]!,
            generationRun: { id: runId, mode: 'factory', status: 'queued' },
          }
        }
        return updated
      })
      subscribeFactoryRun({ id: runId, prompt: text, status: 'queued' })
    } catch (err) {
      if (isAbortError(err)) {
        markGenerationStopped()
        return
      }
      const errorMsg = String((err as { message?: unknown } | null)?.message ?? err)
      const friendlyMessage = formatFactoryRunFailureMessage(errorMsg)
      setMessages((prev) =>
        prev.map((message) =>
          message.generationRun?.id === runId
            ? {
                role: 'assistant',
                content: t('aiChat.error', {
                  fallback: '\u51fa\u9519\u4e86\uff1a{message}',
                  params: { message: friendlyMessage },
                }),
                generationRun: { id: runId, mode: 'factory', status: 'failed' },
              }
            : message,
        ),
      )
    } finally {
      if (activeAbortControllerRef.current === controller) {
        activeAbortControllerRef.current = null
        if (!hasActiveRunEventSources()) setLoading(false)
      }
    }
  }, [
    activeAbortControllerRef,
    conversationId,
    hasActiveRunEventSources,
    input,
    loading,
    markGenerationStopped,
    messages,
    sceneId,
    setImageAttachment,
    setInput,
    setLoading,
    setMessages,
    subscribeFactoryRun,
  ])

  return { sendFactoryMessage }
}
