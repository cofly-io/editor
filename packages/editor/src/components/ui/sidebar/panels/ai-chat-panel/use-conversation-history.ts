import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { GeneratedGeometryArtifact } from '../../../../../lib/ai-generated-geometry'
import {
  CONVERSATION_HISTORY_PAGE_SIZE,
  CONVERSATION_HISTORY_REFRESH_TTL_MS,
  isRecord,
} from './chat-utils'
import {
  inferConversationPurposeFromMessages,
  isAiConversationPurpose,
} from './storage'
import type {
  AiConversationPurpose,
  AiConversationSummary,
  ChatImageAttachment,
  ChatMessage,
} from './types'

type RunSubscriber = (run: { id: string; prompt: string; status?: string }) => void
type ImageTo3DRunSubscriber = (run: {
  id: string
  prompt: string
  status?: string
  image?: ChatImageAttachment
}) => void

export function useConversationHistory({
  closeActiveRunSources,
  conversationId,
  latestGeometryArtifactRef,
  panelHydrated,
  sceneId,
  setConversationId,
  setConversationPurpose,
  setImageAttachment,
  setInput,
  setMessages,
  subscribeArticraftRun,
  subscribeFactoryRun,
  subscribeImageTo3DRun,
  subscribePrimitiveRun,
}: {
  closeActiveRunSources: () => void
  conversationId: string
  latestGeometryArtifactRef: { current: GeneratedGeometryArtifact | null }
  panelHydrated: boolean
  sceneId?: string
  setConversationId: Dispatch<SetStateAction<string>>
  setConversationPurpose: Dispatch<SetStateAction<AiConversationPurpose | undefined>>
  setImageAttachment: Dispatch<SetStateAction<ChatImageAttachment | undefined>>
  setInput: Dispatch<SetStateAction<string>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  subscribeArticraftRun: RunSubscriber
  subscribeFactoryRun: RunSubscriber
  subscribeImageTo3DRun: ImageTo3DRunSubscriber
  subscribePrimitiveRun: RunSubscriber
}) {
  const [conversationHistoryOpen, setConversationHistoryOpen] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<AiConversationSummary[]>([])
  const [conversationHistoryLoading, setConversationHistoryLoading] = useState(false)
  const conversationHistoryRefreshRef = useRef<{
    key: string
    promise: Promise<void>
  } | null>(null)
  const conversationHistoryLoadedAtRef = useRef<Map<string, number>>(new Map())
  const conversationHistoryNextCursorRef = useRef<string | null>(null)
  const conversationHistoryLoadingRef = useRef(false)

  const resetConversationHistory = useCallback(() => {
    setConversationHistory([])
    setConversationHistoryOpen(false)
    conversationHistoryNextCursorRef.current = null
  }, [])

  useEffect(() => {
    resetConversationHistory()
  }, [resetConversationHistory, sceneId])

  useEffect(() => {
    if (!panelHydrated) return
    const controller = new AbortController()
    void fetch(`/api/ai-harness/conversations/${encodeURIComponent(conversationId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data || controller.signal.aborted) return
        const conversationMessages = Array.isArray(data.conversation?.messages)
          ? (data.conversation.messages as ChatMessage[])
          : []
        const persistedPurpose = isAiConversationPurpose(data.conversation?.conversationPurpose)
          ? data.conversation.conversationPurpose
          : undefined
        const inferredPurpose = inferConversationPurposeFromMessages(conversationMessages)
        const activeRuns: unknown[] = Array.isArray(data.activeRuns) ? data.activeRuns : []
        const activeRunPurpose = activeRuns.some(
          (activeRun) => isRecord(activeRun) && activeRun.mode === 'factory',
        )
          ? 'factory'
          : activeRuns.length > 0
            ? 'asset'
            : undefined
        const nextPurpose = persistedPurpose ?? inferredPurpose ?? activeRunPurpose
        if (nextPurpose) setConversationPurpose(nextPurpose)
        if (conversationMessages.length > 0) {
          setMessages((current) =>
            current.length >= conversationMessages.length ? current : conversationMessages,
          )
        }
        for (const activeRun of activeRuns) {
          if (!isRecord(activeRun) || typeof activeRun.id !== 'string') continue
          if (activeRun.mode === 'articraft' && typeof activeRun.prompt === 'string') {
            subscribeArticraftRun({
              id: activeRun.id,
              prompt: activeRun.prompt,
              status: typeof activeRun.status === 'string' ? activeRun.status : undefined,
            })
          } else if (activeRun.mode === 'image-to-3d') {
            subscribeImageTo3DRun({
              id: activeRun.id,
              prompt: typeof activeRun.prompt === 'string' ? activeRun.prompt : 'Image to 3D asset',
              status: typeof activeRun.status === 'string' ? activeRun.status : undefined,
            })
          } else if (activeRun.mode === 'primitive') {
            subscribePrimitiveRun({
              id: activeRun.id,
              prompt: typeof activeRun.prompt === 'string' ? activeRun.prompt : 'Geometry object',
              status: typeof activeRun.status === 'string' ? activeRun.status : undefined,
            })
          } else if (activeRun.mode === 'factory') {
            subscribeFactoryRun({
              id: activeRun.id,
              prompt: typeof activeRun.prompt === 'string' ? activeRun.prompt : 'Factory draft',
              status: typeof activeRun.status === 'string' ? activeRun.status : undefined,
            })
          }
        }
      })
      .catch(() => {})

    return () => controller.abort()
  }, [
    conversationId,
    panelHydrated,
    setConversationPurpose,
    setMessages,
    subscribeArticraftRun,
    subscribeFactoryRun,
    subscribeImageTo3DRun,
    subscribePrimitiveRun,
  ])

  const refreshConversationHistory = useCallback(
    async (options?: { append?: boolean; force?: boolean }) => {
      const append = options?.append === true
      if (
        append &&
        (!conversationHistoryNextCursorRef.current || conversationHistoryLoadingRef.current)
      ) {
        return
      }
      const cursor = append ? conversationHistoryNextCursorRef.current : null
      const params = new URLSearchParams({
        limit: String(CONVERSATION_HISTORY_PAGE_SIZE),
      })
      if (sceneId) params.set('sceneId', sceneId)
      if (cursor) params.set('cursor', cursor)
      const requestKey = `${append ? 'append' : 'replace'}:${params.toString()}`
      const activeRequest = conversationHistoryRefreshRef.current
      if (activeRequest?.key === requestKey) return activeRequest.promise

      const loadedAt = conversationHistoryLoadedAtRef.current.get(requestKey) ?? 0
      if (
        !append &&
        !options?.force &&
        Date.now() - loadedAt < CONVERSATION_HISTORY_REFRESH_TTL_MS
      ) {
        return
      }
      if (!append) conversationHistoryNextCursorRef.current = null

      const promise = (async () => {
        conversationHistoryLoadingRef.current = true
        setConversationHistoryLoading(true)
        try {
          const response = await fetch(`/api/ai-harness/conversations?${params}`, {
            cache: 'no-store',
          })
          const data = await response.json().catch(() => ({}))
          const conversations =
            isRecord(data) && Array.isArray(data.conversations)
              ? (data.conversations as AiConversationSummary[])
              : []
          const nextCursor =
            isRecord(data) && typeof data.nextCursor === 'string' ? data.nextCursor : null
          setConversationHistory((prev) => {
            if (!append) return conversations
            const byId = new Map(prev.map((conversation) => [conversation.id, conversation]))
            for (const conversation of conversations) byId.set(conversation.id, conversation)
            return Array.from(byId.values())
          })
          conversationHistoryNextCursorRef.current = nextCursor
          conversationHistoryLoadedAtRef.current.set(requestKey, Date.now())
        } catch {
          if (!append) {
            setConversationHistory([])
            conversationHistoryNextCursorRef.current = null
          }
        } finally {
          conversationHistoryLoadingRef.current = false
          setConversationHistoryLoading(false)
        }
      })()

      conversationHistoryRefreshRef.current = { key: requestKey, promise }
      try {
        await promise
      } finally {
        if (conversationHistoryRefreshRef.current?.promise === promise) {
          conversationHistoryRefreshRef.current = null
        }
      }
    },
    [sceneId],
  )

  useEffect(() => {
    if (!panelHydrated) return
    void refreshConversationHistory()
  }, [conversationId, panelHydrated, refreshConversationHistory])

  const switchConversation = useCallback(
    (conversation: AiConversationSummary) => {
      const nextConversationId = conversation.id
      if (!nextConversationId || nextConversationId === conversationId) {
        setConversationHistoryOpen(false)
        return
      }
      closeActiveRunSources()
      setConversationId(nextConversationId)
      setMessages([])
      setInput('')
      setImageAttachment(undefined)
      setConversationPurpose(conversation.conversationPurpose)
      latestGeometryArtifactRef.current = null
      setConversationHistoryOpen(false)
    },
    [
      closeActiveRunSources,
      conversationId,
      latestGeometryArtifactRef,
      setConversationId,
      setConversationPurpose,
      setImageAttachment,
      setInput,
      setMessages,
    ],
  )

  const createNewConversation = useCallback(async () => {
    try {
      const response = await fetch('/api/ai-harness/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId }),
      })
      const data = await response.json().catch(() => ({}))
      const nextConversationId =
        isRecord(data) && typeof data.conversationId === 'string' ? data.conversationId : ''
      if (!nextConversationId) throw new Error('missing conversationId')
      closeActiveRunSources()
      setConversationId(nextConversationId)
      setMessages([])
      setInput('')
      setImageAttachment(undefined)
      setConversationPurpose(undefined)
      latestGeometryArtifactRef.current = null
      setConversationHistoryOpen(false)
      void refreshConversationHistory({ force: true })
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Failed to create conversation.' },
      ])
    }
  }, [
    closeActiveRunSources,
    latestGeometryArtifactRef,
    refreshConversationHistory,
    sceneId,
    setConversationId,
    setConversationPurpose,
    setImageAttachment,
    setInput,
    setMessages,
  ])

  const deleteConversation = useCallback(
    async (targetConversationId: string) => {
      try {
        const response = await fetch(
          `/api/ai-harness/conversations/${encodeURIComponent(targetConversationId)}`,
          { method: 'DELETE' },
        )
        if (!response.ok) throw new Error('delete failed')
        setConversationHistory((prev) =>
          prev.filter((conversation) => conversation.id !== targetConversationId),
        )
        if (targetConversationId !== conversationId) return

        const nextResponse = await fetch('/api/ai-harness/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sceneId }),
        })
        const data = await nextResponse.json().catch(() => ({}))
        const nextConversationId =
          isRecord(data) && typeof data.conversationId === 'string' ? data.conversationId : ''
        if (!nextConversationId) throw new Error('missing conversationId')
        closeActiveRunSources()
        setConversationId(nextConversationId)
        setMessages([])
        setInput('')
        setImageAttachment(undefined)
        setConversationPurpose(undefined)
        latestGeometryArtifactRef.current = null
        void refreshConversationHistory({ force: true })
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Failed to delete conversation.' },
        ])
      }
    },
    [
      closeActiveRunSources,
      conversationId,
      latestGeometryArtifactRef,
      refreshConversationHistory,
      sceneId,
      setConversationId,
      setConversationPurpose,
      setImageAttachment,
      setInput,
      setMessages,
    ],
  )

  return {
    conversationHistory,
    conversationHistoryLoading,
    conversationHistoryOpen,
    createNewConversation,
    deleteConversation,
    refreshConversationHistory,
    resetConversationHistory,
    setConversationHistoryOpen,
    switchConversation,
  }
}
