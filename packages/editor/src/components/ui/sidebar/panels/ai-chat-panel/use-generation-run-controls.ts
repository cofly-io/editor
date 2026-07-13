import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { isActiveGenerationRun } from './chat-utils'
import type { ChatMessage } from './types'

export function useGenerationRunControls({
  activeAbortControllerRef,
  cancelledRunIdsRef,
  closeActiveRunSources,
  closeRunEventSource,
  getRunEventSourceIds,
  messages,
  setLoading,
  setMessages,
}: {
  activeAbortControllerRef: { current: AbortController | null }
  cancelledRunIdsRef: { current: Set<string> }
  closeActiveRunSources: () => void
  closeRunEventSource: (runId: string) => void
  getRunEventSourceIds: () => string[]
  messages: ChatMessage[]
  setLoading: Dispatch<SetStateAction<boolean>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}) {
  const markGenerationStopped = useCallback(
    (content = 'Generation stopped.') => {
      setMessages((prev) => {
        let stoppedActiveRun = false
        const updated = prev.map((message) => {
          if (!isActiveGenerationRun(message.generationRun)) return message
          stoppedActiveRun = true
          return {
            ...message,
            content: message.factoryRunSummary ? '' : content,
            factoryRunSummary: message.factoryRunSummary
              ? {
                  ...message.factoryRunSummary,
                  status: 'cancelled' as const,
                  title: message.factoryRunSummary.icon
                    ? 'Generation cancelled'
                    : 'Factory creation cancelled',
                  description: content,
                  steps: message.factoryRunSummary.steps.map((step) =>
                    step.status === 'running' ? { ...step, status: 'failed' as const } : step,
                  ),
                }
              : message.factoryRunSummary,
            generationRun: { ...message.generationRun!, status: 'cancelled' as const },
          }
        })
        if (stoppedActiveRun) return updated

        const next = [...prev]
        const lastIdx = next.length - 1
        const last = next[lastIdx]
        if (
          last?.role === 'assistant' &&
          !last.geometryArtifact &&
          !last.imageTo3dResult &&
          !last.modelArtifact &&
          !last.articraftResult
        ) {
          next[lastIdx] = { ...last, content }
          return next
        }
        return [...next, { role: 'assistant', content }]
      })
    },
    [setMessages],
  )

  const markRunCancelledFromServer = useCallback(
    (runId: string, content = 'Generation cancelled.') => {
      cancelledRunIdsRef.current.add(runId)
      closeRunEventSource(runId)
      setMessages((prev) =>
        prev.map((messageItem) =>
          messageItem.generationRun?.id === runId
            ? {
                ...messageItem,
                content: messageItem.factoryRunSummary ? '' : content,
                factoryRunSummary: messageItem.factoryRunSummary
                  ? {
                      ...messageItem.factoryRunSummary,
                      status: 'cancelled' as const,
                      title: messageItem.factoryRunSummary.icon
                        ? 'Generation cancelled'
                        : 'Factory creation cancelled',
                      description: content,
                      steps: messageItem.factoryRunSummary.steps.map((step) =>
                        step.status === 'running' ? { ...step, status: 'failed' as const } : step,
                      ),
                    }
                  : messageItem.factoryRunSummary,
                generationRun: { ...messageItem.generationRun!, status: 'cancelled' as const },
              }
            : messageItem,
        ),
      )
    },
    [cancelledRunIdsRef, closeRunEventSource, setMessages],
  )

  const handleStopGeneration = useCallback(() => {
    activeAbortControllerRef.current?.abort()
    activeAbortControllerRef.current = null
    const activeRunIds = new Set<string>()
    for (const message of messages) {
      const run = message.generationRun
      if (isActiveGenerationRun(run)) activeRunIds.add(run.id)
    }
    for (const runId of getRunEventSourceIds()) {
      activeRunIds.add(runId)
    }
    for (const runId of activeRunIds) {
      cancelledRunIdsRef.current.add(runId)
    }
    closeActiveRunSources()
    for (const runId of activeRunIds) {
      void fetch(`/api/ai-harness/runs/${encodeURIComponent(runId)}`, {
        method: 'DELETE',
      }).catch(() => {})
    }
    setLoading(false)
    markGenerationStopped()
  }, [
    activeAbortControllerRef,
    cancelledRunIdsRef,
    closeActiveRunSources,
    getRunEventSourceIds,
    markGenerationStopped,
    messages,
    setLoading,
  ])

  return {
    handleStopGeneration,
    markGenerationStopped,
    markRunCancelledFromServer,
  }
}
