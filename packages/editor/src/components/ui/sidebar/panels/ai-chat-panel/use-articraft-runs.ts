import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { t } from '../../../../../i18n'
import {
  ARTICRAFT_PROGRESS_LINE_LIMIT,
  formatArticraftProgressMessage,
  isAbortError,
  isMineAsset,
  isRecord,
  safeParseJson,
  throwIfAborted,
} from './chat-utils'
import { buildArticraftResultFromJobData } from './articraft-utils'
import {
  buildArticraftResultSummary,
  buildDeviceProgressSummary,
} from './run-summaries'
import type { ArticraftResult, ChatImageAttachment, ChatMessage } from './types'

export function useArticraftRuns({
  activeAbortControllerRef,
  closeRunEventSource,
  conversationId,
  hasActiveRunEventSources,
  hasRunEventSource,
  markGenerationStopped,
  markRunCancelledFromServer,
  sceneId,
  setImageAttachment,
  setInput,
  setLoading,
  setMessages,
  trackRunEventSource,
}: {
  activeAbortControllerRef: { current: AbortController | null }
  closeRunEventSource: (runId: string) => void
  conversationId: string
  hasActiveRunEventSources: () => boolean
  hasRunEventSource: (runId: string) => boolean
  markGenerationStopped: (content?: string) => void
  markRunCancelledFromServer: (runId: string, content?: string) => void
  sceneId?: string
  setImageAttachment: Dispatch<SetStateAction<ChatImageAttachment | undefined>>
  setInput: Dispatch<SetStateAction<string>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  trackRunEventSource: (runId: string, source: EventSource) => void
}) {
  const exportArticraftAsset = useCallback(async (result: ArticraftResult, save: boolean) => {
    const res = await fetch('/api/articraft/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordId: result.recordId,
        recordPath: result.recordPath,
        prompt: result.prompt,
        joints: result.joints,
        name: result.name,
        data: result.data,
        save,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(isRecord(data) && typeof data.error === 'string' ? data.error : res.statusText)
    }
    if (!isRecord(data) || !isMineAsset(data.asset)) {
      throw new Error('Articraft export did not return a usable asset')
    }
    return {
      asset: data.asset,
      savedAt: typeof data.savedAt === 'string' ? data.savedAt : save ? new Date().toISOString() : undefined,
    }
  }, [])

  const completeArticraftRun = useCallback(
    async (runId: string, prompt: string, resultData: Record<string, unknown>) => {
      const result: ArticraftResult = buildArticraftResultFromJobData(prompt, resultData)

      try {
        const { asset } = await exportArticraftAsset(result, false)
        result.asset = asset
        result.assetId = asset.id
      } catch (error) {
        result.previewError = error instanceof Error ? error.message : String(error)
      }

      setMessages((prev) => {
        const updated = [...prev]
        const jobMessageIndex = updated.findIndex((message) => message.generationRun?.id === runId)
        const resultMessage: ChatMessage = {
          role: 'assistant',
          content: t('aiChat.articraftReady', 'Articraft result is ready.'),
          generationRun: { id: runId, mode: 'articraft', status: 'succeeded' },
          factoryRunSummary: buildArticraftResultSummary(result),
          articraftResult: result,
        }
        if (jobMessageIndex >= 0) {
          updated[jobMessageIndex] = resultMessage
          return updated
        }
        return [...updated, resultMessage]
      })
    },
    [exportArticraftAsset, setMessages],
  )

  const subscribeArticraftRun = useCallback(
    (job: { id: string; prompt: string; status?: string }) => {
      if (hasRunEventSource(job.id)) return
      setLoading(true)

      setMessages((prev) => {
        if (prev.some((message) => message.generationRun?.id === job.id)) return prev
        return [
          ...prev,
          {
            role: 'assistant',
            content: formatArticraftProgressMessage(
              t('aiChat.articraftGenerating', 'Generating with Articraft...'),
              ['Restored background generation task; reading progress...'],
            ),
            factoryRunSummary: buildDeviceProgressSummary({
              mode: 'articraft',
              message: 'Restoring articulated asset generation progress.',
            }),
            generationRun: {
              id: job.id,
              mode: 'articraft',
              status: job.status === 'queued' ? 'queued' : 'running',
            },
          },
        ]
      })

      const progressHeader = 'Generating an articulated 3D asset with Articraft...'
      const progressLines: string[] = []
      const source = new EventSource(`/api/ai-harness/runs/${encodeURIComponent(job.id)}/events`)
      trackRunEventSource(job.id, source)

      source.addEventListener('progress', (event) => {
        const parsed = JSON.parse(event.data) as { message?: string }
        const message = String(parsed.message ?? '').trim()
        if (message) {
          progressLines.push(message)
          if (progressLines.length > ARTICRAFT_PROGRESS_LINE_LIMIT) {
            progressLines.splice(0, progressLines.length - ARTICRAFT_PROGRESS_LINE_LIMIT)
          }
        }
        setMessages((prev) =>
          prev.map((messageItem) =>
            messageItem.generationRun?.id === job.id
              ? {
                  ...messageItem,
                  content: formatArticraftProgressMessage(progressHeader, progressLines),
                  factoryRunSummary: buildDeviceProgressSummary({
                    mode: 'articraft',
                    message: message || 'Generating equipment geometry and joints.',
                    detailLines: progressLines,
                  }),
                  generationRun: { id: job.id, mode: 'articraft', status: 'running' },
                }
              : messageItem,
          ),
        )
      })

      source.addEventListener('result', (event) => {
        const parsed = JSON.parse(event.data) as { data?: Record<string, unknown> }
        closeRunEventSource(job.id)
        void completeArticraftRun(job.id, job.prompt, parsed.data ?? {})
      })

      source.addEventListener('error', (event) => {
        const parsed = event instanceof MessageEvent ? safeParseJson(event.data) : null
        if (parsed && isRecord(parsed) && typeof parsed.message === 'string') {
          closeRunEventSource(job.id)
          setMessages((prev) =>
            prev.map((messageItem) =>
              messageItem.generationRun?.id === job.id
                ? {
                    role: 'assistant',
                    content: t('aiChat.error', {
                      fallback: '\u51fa\u9519\u4e86\uff1a{message}',
                      params: { message: String(parsed.message) },
                    }),
                    generationRun: { id: job.id, mode: 'articraft', status: 'failed' },
                  }
                : messageItem,
            ),
          )
          return
        }
      })

      source.addEventListener('status', (event) => {
        const parsed = event instanceof MessageEvent ? safeParseJson(event.data) : null
        const status =
          isRecord(parsed) && isRecord(parsed.data) && typeof parsed.data.status === 'string'
            ? parsed.data.status
            : undefined
        if (status === 'cancelled') {
          markRunCancelledFromServer(job.id, 'Articraft run cancelled.')
        }
      })
    },
    [
      closeRunEventSource,
      completeArticraftRun,
      hasRunEventSource,
      markRunCancelledFromServer,
      setLoading,
      setMessages,
      trackRunEventSource,
    ],
  )

  const sendArticraftMessage = useCallback(async (text: string, image?: ChatImageAttachment) => {
    const controller = new AbortController()
    activeAbortControllerRef.current = controller
    setInput('')
    setImageAttachment(undefined)
    const prompt = text.trim() || 'Generate an articulated 3D model from the image.'
    const userMsg: ChatMessage = { role: 'user', content: prompt, image }
    const progressHeader = 'Generating an articulated 3D asset with Articraft...'
    const progressMsg: ChatMessage = {
      role: 'assistant',
      content: progressHeader,
      factoryRunSummary: buildDeviceProgressSummary({
        mode: 'articraft',
        message: 'Generating equipment asset with links and joints.',
      }),
    }
    setMessages((prev) => [...prev, userMsg, progressMsg])
    setLoading(true)

    try {
      const res = await fetch('/api/ai-harness/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          sceneId,
          mode: 'articraft',
          prompt,
          articraftMode: 'articulated',
          ...(image ? { image } : {}),
        }),
        signal: controller.signal,
      })
      throwIfAborted(controller.signal)

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(isRecord(data) && typeof data.error === 'string' ? data.error : res.statusText)
      }
      const runId = isRecord(data) && typeof data.runId === 'string' ? data.runId : ''
      if (!runId) throw new Error('Articraft job was not created')

      setMessages((prev) => {
        const updated = [...prev]
        const lastIdx = updated.length - 1
        if (lastIdx >= 0 && updated[lastIdx]?.role === 'assistant') {
          updated[lastIdx] = {
            ...updated[lastIdx]!,
            content: formatArticraftProgressMessage(progressHeader, ['Run submitted and queued...']),
            factoryRunSummary: buildDeviceProgressSummary({
              mode: 'articraft',
              message: 'Run submitted; waiting for articulated asset generation.',
            }),
            generationRun: { id: runId, mode: 'articraft', status: 'queued' },
          }
        }
        return updated
      })
      subscribeArticraftRun({ id: runId, prompt, status: 'queued' })
    } catch (err) {
      if (isAbortError(err)) {
        markGenerationStopped('Cancelled Articraft generation.')
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setMessages((prev) => {
        const updated = [...prev]
        const lastIdx = updated.length - 1
        const result: ChatMessage = { role: 'assistant', content: `Articraft failed: ${message}` }
        if (lastIdx >= 0 && updated[lastIdx]?.role === 'assistant') {
          updated[lastIdx] = result
          return updated
        }
        return [...updated, result]
      })
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
    markGenerationStopped,
    sceneId,
    setImageAttachment,
    setInput,
    setLoading,
    setMessages,
    subscribeArticraftRun,
  ])

  return {
    exportArticraftAsset,
    sendArticraftMessage,
    subscribeArticraftRun,
  }
}
