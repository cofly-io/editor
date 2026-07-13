import { useCallback, type Dispatch, type SetStateAction } from 'react'
import {
  buildGeometryAnalysisContext,
  buildGeometryHarnessContext,
  latestGeneratedGeometryArtifact,
  type GeometryContextDecision,
} from '../../../../../lib/ai-chat-harness'
import type { GeneratedGeometryArtifact } from '../../../../../lib/ai-generated-geometry'
import { t } from '../../../../../i18n'
import {
  findPendingPrimitiveRunMessageIndex,
  isAbortError,
  isRecord,
  throwIfAborted,
} from './chat-utils'
import { buildDeviceProgressSummary } from './run-summaries'
import type { ChatImageAttachment, ChatMessage } from './types'

export function usePrimitiveChat({
  activeAbortControllerRef,
  conversationId,
  hasActiveRunEventSources,
  input,
  latestGeometryArtifactRef,
  loading,
  markGenerationStopped,
  messages,
  sceneId,
  setImageAttachment,
  setInput,
  setLoading,
  setMessages,
  subscribePrimitiveRun,
}: {
  activeAbortControllerRef: { current: AbortController | null }
  conversationId: string
  hasActiveRunEventSources: () => boolean
  input: string
  latestGeometryArtifactRef: { current: GeneratedGeometryArtifact | null }
  loading: boolean
  markGenerationStopped: (content?: string) => void
  messages: ChatMessage[]
  sceneId?: string
  setImageAttachment: Dispatch<SetStateAction<ChatImageAttachment | undefined>>
  setInput: Dispatch<SetStateAction<string>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  subscribePrimitiveRun: (run: { id: string; prompt: string; status?: string }) => void
}) {
  const sendPrimitiveMessage = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim()
      if (!text || loading) return

      const controller = new AbortController()
      activeAbortControllerRef.current = controller
      setInput('')
      setImageAttachment(undefined)
      const userContent = text || 'Describe the image and generate a 3D object.'
      const latestGeometryArtifactCandidate =
        latestGeneratedGeometryArtifact(messages) ?? latestGeometryArtifactRef.current
      if (latestGeometryArtifactCandidate) {
        latestGeometryArtifactRef.current = latestGeometryArtifactCandidate
      }
      const preliminaryContextDecision: GeometryContextDecision | null =
        latestGeometryArtifactCandidate
          ? {
              relationshipToLatestArtifact: 'ambiguous',
              contextPolicy: 'summary_only',
              recommendedRoute: 'model_decide',
              confidence: 0,
              reason:
                'Preliminary client context; server-side context resolver makes the final decision.',
            }
          : null
      const modelUserContent = buildGeometryHarnessContext({
        messages,
        latestArtifact: latestGeometryArtifactCandidate,
        userRequest: userContent,
        contextDecision: preliminaryContextDecision,
      })
      const analysisContext = buildGeometryAnalysisContext({
        messages,
        latestArtifact: latestGeometryArtifactCandidate,
        userRequest: userContent,
        contextDecision: preliminaryContextDecision,
      })
      const userMsg: ChatMessage = { role: 'user', content: userContent }
      const progressMsg: ChatMessage = {
        role: 'assistant',
        content: '**Generate:**\n_Background geometry generation run created. Waiting for analysis..._',
        factoryRunSummary: buildDeviceProgressSummary({
          mode: 'primitive',
          message: 'Understanding the equipment request and preparing editable geometry.',
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
            mode: 'primitive',
            prompt: userContent,
            context: {
              analysisContext,
              harnessContext: modelUserContent,
              latestArtifact: null,
              latestArtifactCandidate: latestGeometryArtifactCandidate,
              recentMessages: messages,
            },
          }),
          signal: controller.signal,
        })
        throwIfAborted(controller.signal)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(
            isRecord(data) && typeof data.error === 'string' ? data.error : res.statusText,
          )
        }
        const runId = isRecord(data) && typeof data.runId === 'string' ? data.runId : ''
        if (!runId) throw new Error('Primitive run was not created')
        setMessages((prev) => {
          const updated = [...prev]
          const pendingIndex = findPendingPrimitiveRunMessageIndex(updated)
          const targetIndex =
            pendingIndex >= 0
              ? pendingIndex
              : updated.length > 0 && updated[updated.length - 1]?.role === 'assistant'
                ? updated.length - 1
                : -1
          if (targetIndex >= 0) {
            updated[targetIndex] = {
              ...updated[targetIndex]!,
              factoryRunSummary: buildDeviceProgressSummary({
                mode: 'primitive',
                message: 'Background geometry run created. Waiting for analysis.',
              }),
              generationRun: { id: runId, mode: 'primitive', status: 'queued' },
            }
          }
          return updated
        })
        subscribePrimitiveRun({ id: runId, prompt: userContent, status: 'queued' })
      } catch (err) {
        if (isAbortError(err)) {
          markGenerationStopped()
          return
        }
        const errorMsg = String((err as { message?: unknown } | null)?.message ?? err)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: t('aiChat.error', {
              fallback: '\u51fa\u9519\u4e86\uff1a{message}',
              params: { message: errorMsg },
            }),
          },
        ])
      } finally {
        if (activeAbortControllerRef.current === controller) {
          activeAbortControllerRef.current = null
          if (!hasActiveRunEventSources()) setLoading(false)
        }
      }
    },
    [
      activeAbortControllerRef,
      conversationId,
      hasActiveRunEventSources,
      input,
      latestGeometryArtifactRef,
      loading,
      markGenerationStopped,
      messages,
      sceneId,
      setImageAttachment,
      setInput,
      setLoading,
      setMessages,
      subscribePrimitiveRun,
    ],
  )

  return { sendPrimitiveMessage }
}
