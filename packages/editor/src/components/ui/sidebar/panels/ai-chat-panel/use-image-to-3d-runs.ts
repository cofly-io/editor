import { useCallback, type Dispatch, type SetStateAction } from 'react'
import useEditor from '../../../../../store/use-editor'
import {
  ARTICRAFT_PROGRESS_LINE_LIMIT,
  formatArticraftProgressMessage,
  imageAttachmentBaseName,
  isAbortError,
  isImageTo3DAsset,
  isRecord,
  safeParseJson,
  throwIfAborted,
} from './chat-utils'
import {
  buildDeviceProgressSummary,
  buildImageTo3DResultSummary,
} from './run-summaries'
import type {
  ChatImageAttachment,
  ChatMessage,
  GeneratedModelArtifact,
  ImageTo3DResult,
} from './types'

export function useImageTo3DRuns({
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
  const completeImageTo3DRun = useCallback(
    (runId: string, prompt: string, image: ChatImageAttachment | undefined, resultData: unknown) => {
      const asset = isRecord(resultData) ? resultData.asset : undefined
      if (!isImageTo3DAsset(asset)) {
        throw new Error('Image-to-3D did not return a valid asset.')
      }

      const provider =
        asset.tags?.find((tag) => !['floor', 'generated', 'image-to-3d'].includes(tag)) ??
        'image-to-3d'
      const artifact: GeneratedModelArtifact = {
        id: asset.id,
        title: asset.name ?? asset.id,
        sourceTool: 'image-to-3d',
        provider,
        asset,
        userPrompt: prompt,
        createdAt: new Date().toISOString(),
      }

      setMessages((prev) => {
        const updated = [...prev]
        const runMessageIndex = updated.findIndex((message) => message.generationRun?.id === runId)
        const resultMessage: ChatMessage = {
          role: 'assistant',
          content: `\u56fe\u751f\u5efa\u6a21\u5b8c\u6210\uff1a${asset.name ?? asset.id}`,
          image,
          generationRun: { id: runId, mode: 'image-to-3d', status: 'succeeded' },
          factoryRunSummary: buildImageTo3DResultSummary(artifact),
          modelArtifact: artifact,
        }
        if (runMessageIndex >= 0) {
          updated[runMessageIndex] = resultMessage
          return updated
        }
        return [...updated, resultMessage]
      })
    },
    [setMessages],
  )

  const subscribeImageTo3DRun = useCallback(
    (run: { id: string; prompt: string; status?: string; image?: ChatImageAttachment }) => {
      if (hasRunEventSource(run.id)) return
      setLoading(true)

      const progressHeader = 'Generating a 3D model from the image...'
      setMessages((prev) => {
        if (prev.some((message) => message.generationRun?.id === run.id)) return prev
        return [
          ...prev,
          {
            role: 'assistant',
            content: progressHeader,
            image: run.image,
            factoryRunSummary: buildDeviceProgressSummary({
              mode: 'image-to-3d',
              message: 'Restoring image-to-3D run progress.',
            }),
            generationRun: {
              id: run.id,
              mode: 'image-to-3d',
              status: run.status === 'queued' ? 'queued' : 'running',
            },
          },
        ]
      })

      const progressLines: string[] = []
      const source = new EventSource(`/api/ai-harness/runs/${encodeURIComponent(run.id)}/events`)
      trackRunEventSource(run.id, source)

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
            messageItem.generationRun?.id === run.id
              ? {
                  ...messageItem,
                  content: formatArticraftProgressMessage(progressHeader, progressLines),
                  factoryRunSummary: buildDeviceProgressSummary({
                    mode: 'image-to-3d',
                    message: message || 'Generating the equipment model.',
                    detailLines: progressLines,
                  }),
                  generationRun: { id: run.id, mode: 'image-to-3d', status: 'running' },
                }
              : messageItem,
          ),
        )
      })

      source.addEventListener('result', (event) => {
        const parsed = JSON.parse(event.data) as { data?: unknown }
        closeRunEventSource(run.id)
        try {
          completeImageTo3DRun(run.id, run.prompt, run.image, parsed.data)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          setMessages((prev) =>
            prev.map((messageItem) =>
              messageItem.generationRun?.id === run.id
                ? {
                    role: 'assistant',
                    content: `Image-to-3D failed: ${message}`,
                    generationRun: { id: run.id, mode: 'image-to-3d', status: 'failed' },
                  }
                : messageItem,
            ),
          )
          return
        }
      })

      source.addEventListener('error', (event) => {
        const parsed = event instanceof MessageEvent ? safeParseJson(event.data) : null
        if (!parsed || !isRecord(parsed) || typeof parsed.message !== 'string') return
        closeRunEventSource(run.id)
        setMessages((prev) =>
          prev.map((messageItem) =>
            messageItem.generationRun?.id === run.id
              ? {
                  role: 'assistant',
                  content: `Image-to-3D failed: ${String(parsed.message)}`,
                  generationRun: { id: run.id, mode: 'image-to-3d', status: 'failed' },
                }
              : messageItem,
          ),
        )
      })

      source.addEventListener('status', (event) => {
        const parsed = event instanceof MessageEvent ? safeParseJson(event.data) : null
        const status =
          isRecord(parsed) && isRecord(parsed.data) && typeof parsed.data.status === 'string'
            ? parsed.data.status
            : undefined
        if (status === 'cancelled') {
          markRunCancelledFromServer(run.id, 'Image-to-3D run cancelled.')
        }
      })
    },
    [
      closeRunEventSource,
      completeImageTo3DRun,
      hasRunEventSource,
      markRunCancelledFromServer,
      setLoading,
      setMessages,
      trackRunEventSource,
    ],
  )

  const handleSelectImageTo3DAsset = useCallback((asset: ImageTo3DResult['asset']) => {
    const editor = useEditor.getState()
    editor.enterFurnishBuildMode({ openItemsPanel: true })
    editor.setCatalogCategory('mine')
    editor.setSelectedItem(asset)
    window.dispatchEvent(new Event('generated-assets:updated'))
  }, [])

  const sendImageTo3DMessage = useCallback(async (text: string, image?: ChatImageAttachment) => {
    if (!image) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '\u8bf7\u5148\u4e0a\u4f20\u4e00\u5f20\u56fe\u7247\uff0c\u518d\u4f7f\u7528\u56fe\u751f\u5efa\u6a21\u3002' },
      ])
      return
    }

    const controller = new AbortController()
    activeAbortControllerRef.current = controller
    setInput('')
    setImageAttachment(undefined)

    const prompt = text.trim() || '\u6839\u636e\u56fe\u7247\u751f\u6210\u4e00\u4e2a 3D \u6a21\u578b'
    const assetName = text.trim().slice(0, 48) || imageAttachmentBaseName(image)
    const userMsg: ChatMessage = { role: 'user', content: prompt, image }
    const progressMsg: ChatMessage = {
      role: 'assistant',
      content: '\u6b63\u5728\u4f7f\u7528\u56fe\u751f\u5efa\u6a21\u751f\u6210 3D \u6a21\u578b\uff0c\u5b8c\u6210\u540e\u4f1a\u4fdd\u5b58\u5230\u7269\u54c1\u5e93...',
      factoryRunSummary: buildDeviceProgressSummary({
        mode: 'image-to-3d',
        message: 'Creating an equipment model from the uploaded image.',
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
          mode: 'image-to-3d',
          prompt,
          image,
          params: {
            displayName: assetName,
            category: 'equipment',
            save: false,
          },
        }),
        signal: controller.signal,
      })
      throwIfAborted(controller.signal)

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(isRecord(data) && typeof data.error === 'string' ? data.error : res.statusText)
      }
      const runId = isRecord(data) && typeof data.runId === 'string' ? data.runId : ''
      if (!runId) throw new Error('Image-to-3D run was not created')

      setMessages((prev) => {
        const updated = [...prev]
        const lastIdx = updated.length - 1
        if (
          lastIdx >= 0 &&
          updated[lastIdx]?.role === 'assistant' &&
          !updated[lastIdx]?.imageTo3dResult &&
          !updated[lastIdx]?.modelArtifact
        ) {
          updated[lastIdx] = {
            ...updated[lastIdx]!,
            content: formatArticraftProgressMessage(progressMsg.content, ['Background run created; waiting for generation logs...']),
            factoryRunSummary: buildDeviceProgressSummary({
              mode: 'image-to-3d',
              message: 'Background run created; waiting for image-to-3D results.',
            }),
            generationRun: { id: runId, mode: 'image-to-3d', status: 'queued' },
          }
          return updated
        }
        return updated
      })
      subscribeImageTo3DRun({ id: runId, prompt, status: 'queued', image })
    } catch (err) {
      if (isAbortError(err)) {
        markGenerationStopped('\u5df2\u505c\u6b62\u56fe\u751f\u5efa\u6a21\u3002')
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setMessages((prev) => {
        const updated = [...prev]
        const lastIdx = updated.length - 1
        const result: ChatMessage = { role: 'assistant', content: `\u56fe\u751f\u5efa\u6a21\u5931\u8d25\uff1a${message}` }
        if (
          lastIdx >= 0 &&
          updated[lastIdx]?.role === 'assistant' &&
          !updated[lastIdx]?.imageTo3dResult
        ) {
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
    subscribeImageTo3DRun,
  ])

  return {
    handleSelectImageTo3DAsset,
    sendImageTo3DMessage,
    subscribeImageTo3DRun,
  }
}
