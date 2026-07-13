import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { t } from '../../../../../i18n'
import {
  ARTICRAFT_PROGRESS_LINE_LIMIT,
  isRecord,
  safeParseJson,
} from './chat-utils'
import { applyFactoryRunPatchesToCanvas } from './factory-scene'
import {
  buildFactoryProgressSummary,
  buildFactoryResultSummary,
  formatFactoryRunFailureMessage,
} from './run-summaries'
import { shouldWaitForFactoryApply } from './factory-run-apply-policy'
import type { ChatMessage } from './types'

const FACTORY_RUN_FALLBACK_POLL_MS = 1000
const FACTORY_RUN_FALLBACK_POLL_ATTEMPTS = 30

export function useFactoryRuns({
  cancelledRunIdsRef,
  closeRunEventSource,
  hasRunEventSource,
  markRunCancelledFromServer,
  setLoading,
  setMessages,
  trackRunEventSource,
}: {
  cancelledRunIdsRef: { current: Set<string> }
  closeRunEventSource: (runId: string) => void
  hasRunEventSource: (runId: string) => boolean
  markRunCancelledFromServer: (runId: string, content?: string) => void
  setLoading: Dispatch<SetStateAction<boolean>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  trackRunEventSource: (runId: string, source: EventSource) => void
}) {
  const appliedFactoryRunIdsRef = useRef<Set<string>>(new Set())

  const completeFactoryRun = useCallback((runId: string, data: unknown) => {
    if (cancelledRunIdsRef.current.has(runId)) return
    const result = isRecord(data) ? data : {}
    const shouldWaitForApply = shouldWaitForFactoryApply(data)
    const alreadyApplied = appliedFactoryRunIdsRef.current.has(runId)
    const appliedNodeIds =
      alreadyApplied || shouldWaitForApply ? [] : applyFactoryRunPatchesToCanvas(data)
    if (appliedNodeIds.length > 0) appliedFactoryRunIdsRef.current.add(runId)
    const displayData =
      isRecord(data) && (alreadyApplied || appliedNodeIds.length > 0)
        ? { ...data, applied: true, nodeIds: appliedNodeIds }
        : data
    const missingRequiredAssets =
      isRecord(displayData) && Array.isArray(displayData.missingAssets)
        ? displayData.missingAssets.filter(
            (item) => isRecord(item) && item.required === true,
          ).length
        : 0
    const needsAssetSelection =
      isRecord(displayData) &&
      isRecord(displayData.intent) &&
      displayData.intent.action === 'create' &&
      missingRequiredAssets > 0
    const factoryRunSummary = buildFactoryResultSummary(displayData)

    setMessages((prev) => {
      const updated = [...prev]
      const runMessageIndex = updated.findIndex((message) => message.generationRun?.id === runId)
      const resultMessage: ChatMessage = {
        role: 'assistant',
        content: '',
        generationRun: {
          id: runId,
          mode: 'factory',
          status:
            factoryRunSummary.status === 'needs_input'
              ? 'running'
              : needsAssetSelection
                ? 'running'
                : factoryRunSummary.status === 'failed'
                  ? 'failed'
                  : 'succeeded',
        },
        factoryRunSummary,
        ...(shouldWaitForApply ? { factoryRunDraft: data } : {}),
        ...(isRecord(result.artifact) ? { geometryArtifact: result.artifact as never } : {}),
      }
      if (runMessageIndex >= 0) {
        updated[runMessageIndex] = resultMessage
        return updated
      }
      return [...updated, resultMessage]
    })
  }, [cancelledRunIdsRef, setMessages])

  const applyFactoryRun = useCallback((runId: string, data: unknown) => {
    if (appliedFactoryRunIdsRef.current.has(runId)) return
    const appliedNodeIds = applyFactoryRunPatchesToCanvas(data)
    if (appliedNodeIds.length === 0) return
    appliedFactoryRunIdsRef.current.add(runId)
    const displayData = isRecord(data) ? { ...data, applied: true, nodeIds: appliedNodeIds } : data
    const factoryRunSummary = buildFactoryResultSummary(displayData)
    setMessages((prev) =>
      prev.map((message) =>
        message.generationRun?.id === runId
          ? {
              ...message,
              factoryRunDraft: undefined,
              factoryRunSummary,
              generationRun: { id: runId, mode: 'factory', status: 'succeeded' },
            }
          : message,
      ),
    )
  }, [setMessages])

  const subscribeFactoryRun = useCallback(
    (run: { id: string; prompt: string; status?: string }) => {
      if (hasRunEventSource(run.id)) return
      cancelledRunIdsRef.current.delete(run.id)
      setLoading(true)

      const progressLines: string[] = []
      setMessages((prev) => {
        if (prev.some((message) => message.generationRun?.id === run.id)) return prev
        return [
          ...prev,
          {
            role: 'assistant',
            content: '',
            factoryRunSummary: buildFactoryProgressSummary({
              message: 'Understanding the request and preparing factory scene changes.',
            }),
            generationRun: {
              id: run.id,
              mode: 'factory',
              status: run.status === 'queued' ? 'queued' : 'running',
            },
          },
        ]
      })

      const source = new EventSource(`/api/ai-harness/runs/${encodeURIComponent(run.id)}/events`)
      trackRunEventSource(run.id, source)

      source.addEventListener('progress', (event) => {
        if (cancelledRunIdsRef.current.has(run.id)) return
        const parsed = safeParseJson(event.data)
        const message = isRecord(parsed) && typeof parsed.message === 'string' ? parsed.message : ''
        const eventData = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : {}
        const plan = isRecord(eventData.plan) ? eventData.plan : undefined
        if (message.trim()) {
          progressLines.push(message.trim())
          if (progressLines.length > ARTICRAFT_PROGRESS_LINE_LIMIT) {
            progressLines.splice(0, progressLines.length - ARTICRAFT_PROGRESS_LINE_LIMIT)
          }
        }
        setMessages((prev) =>
          prev.map((messageItem) =>
            messageItem.generationRun?.id === run.id
              ? {
                  ...messageItem,
                  content: '',
                  factoryRunSummary: buildFactoryProgressSummary({
                    stage: eventData.stage,
                    planKind: plan?.kind,
                    message: message.trim() || undefined,
                    detailLines: progressLines,
                  }),
                  generationRun: { id: run.id, mode: 'factory', status: 'running' },
                }
              : messageItem,
          ),
        )
      })

      source.addEventListener('message', (event) => {
        if (cancelledRunIdsRef.current.has(run.id)) return
        const parsed = safeParseJson(event.data)
        if (!isRecord(parsed) || !isRecord(parsed.data)) return
        const eventData = parsed.data
        if (eventData.stage !== 'patch-plan' && eventData.stage !== 'selection-edit') return
        const patchCount =
          typeof eventData.patchCount === 'number' ? eventData.patchCount : undefined
        const missingAssets = Array.isArray(eventData.missingAssets)
          ? eventData.missingAssets.length
          : 0
        const plan = isRecord(eventData.plan) ? eventData.plan : undefined
        setMessages((prev) =>
          prev.map((messageItem) =>
            messageItem.generationRun?.id === run.id
              ? {
                  ...messageItem,
                  content: '',
                  factoryRunSummary: buildFactoryProgressSummary({
                    stage: eventData.stage,
                    planKind: plan?.kind,
                    message:
                      typeof parsed.message === 'string'
                        ? parsed.message
                        : 'Scene changes are generated; waiting for final result.',
                    patchCount,
                    missingAssetCount: missingAssets,
                    detailLines: progressLines,
                  }),
                  generationRun: { id: run.id, mode: 'factory', status: 'running' },
                }
              : messageItem,
          ),
        )
      })

      source.addEventListener('result', (event) => {
        if (cancelledRunIdsRef.current.has(run.id)) {
          closeRunEventSource(run.id)
          return
        }
        const parsed = safeParseJson(event.data)
        closeRunEventSource(run.id)
        completeFactoryRun(run.id, isRecord(parsed) ? parsed.data : undefined)
      })

      source.addEventListener('error', (event) => {
        const renderTerminalRun = (currentRun: Record<string, unknown>, status: string) => {
          closeRunEventSource(run.id)
          if (status === 'cancelled') {
            const message =
              typeof currentRun.error === 'string' ? currentRun.error : 'Cancelled.'
            setMessages((prev) =>
              prev.map((messageItem) =>
                messageItem.generationRun?.id === run.id
                  ? {
                      role: 'assistant',
                      content: message,
                      generationRun: { id: run.id, mode: 'factory', status: 'cancelled' },
                    }
                  : messageItem,
              ),
            )
            return
          }

          if ('result' in currentRun) {
            completeFactoryRun(run.id, currentRun.result)
            return
          }

          const message =
            typeof currentRun.error === 'string'
              ? currentRun.error
              : 'Generation failed. Please try again.'
          const friendlyMessage = formatFactoryRunFailureMessage(message)
          setMessages((prev) =>
            prev.map((messageItem) =>
              messageItem.generationRun?.id === run.id
                ? {
                    role: 'assistant',
                    content: t('aiChat.error', {
                      fallback: '\u51fa\u9519\u4e86\uff1a{message}',
                      params: { message: friendlyMessage },
                    }),
                    generationRun: { id: run.id, mode: 'factory', status: 'failed' },
                  }
                : messageItem,
            ),
          )
        }

        const pollRunFallback = (attempt = 0) => {
          void fetch(`/api/ai-harness/runs/${encodeURIComponent(run.id)}`, { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
              const currentRun = isRecord(data) && isRecord(data.run) ? data.run : null
              const status =
                currentRun && typeof currentRun.status === 'string'
                  ? currentRun.status
                  : undefined
              if (
                currentRun &&
                (status === 'succeeded' || status === 'failed' || status === 'cancelled')
              ) {
                renderTerminalRun(currentRun, status)
                return
              }
              if (attempt >= FACTORY_RUN_FALLBACK_POLL_ATTEMPTS) return
              window.setTimeout(
                () => pollRunFallback(attempt + 1),
                FACTORY_RUN_FALLBACK_POLL_MS,
              )
            })
            .catch(() => {
              if (attempt >= FACTORY_RUN_FALLBACK_POLL_ATTEMPTS) return
              window.setTimeout(
                () => pollRunFallback(attempt + 1),
                FACTORY_RUN_FALLBACK_POLL_MS,
              )
            })
        }

        const parsed = event instanceof MessageEvent ? safeParseJson(event.data) : null
        if (parsed && isRecord(parsed) && typeof parsed.message === 'string') {
          closeRunEventSource(run.id)
          const friendlyMessage = formatFactoryRunFailureMessage(String(parsed.message))
          setMessages((prev) =>
            prev.map((messageItem) =>
              messageItem.generationRun?.id === run.id
                ? {
                    role: 'assistant',
                    content: t('aiChat.error', {
                      fallback: '\u51fa\u9519\u4e86\uff1a{message}',
                      params: { message: friendlyMessage },
                    }),
                    generationRun: { id: run.id, mode: 'factory', status: 'failed' },
                  }
                : messageItem,
            ),
          )
          return
        }
        pollRunFallback()
      })

      source.addEventListener('status', (event) => {
        const parsed = event instanceof MessageEvent ? safeParseJson(event.data) : null
        const status =
          isRecord(parsed) && isRecord(parsed.data) && typeof parsed.data.status === 'string'
            ? parsed.data.status
            : undefined
        if (status === 'cancelled') {
          cancelledRunIdsRef.current.add(run.id)
          markRunCancelledFromServer(run.id)
        }
      })
    },
    [
      cancelledRunIdsRef,
      closeRunEventSource,
      completeFactoryRun,
      hasRunEventSource,
      markRunCancelledFromServer,
      setLoading,
      setMessages,
      trackRunEventSource,
    ],
  )

  return { applyFactoryRun, subscribeFactoryRun }
}
