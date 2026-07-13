import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'
import {
  latestGeneratedGeometryArtifact,
} from '../../../../../lib/ai-chat-harness'
import type { GeneratedGeometryArtifact } from '../../../../../lib/ai-generated-geometry'
import {
  AI_CHAT_STORAGE_MESSAGE_LIMIT,
  aiChatDefaultConversationId,
  compactAiChatMessageForLocalStorage,
  readPersistedAiChatPanelState,
  writeAiChatPanelStateSnapshot,
} from './storage'
import type {
  AiChatPanelStateSnapshot,
  AiConversationPurpose,
  AiGenerationMode,
  ChatImageAttachment,
  ChatMessage,
} from './types'

export function useAiChatPanelPersistence({
  conversationId,
  conversationPurpose,
  generationMode,
  imageAttachment,
  input,
  inputExpanded,
  latestGeometryArtifactRef,
  messages,
  panelHydrated,
  sceneId,
  scrollRef,
  setConversationId,
  setConversationPurpose,
  setGenerationMode,
  setImageAttachment,
  setInput,
  setInputExpanded,
  setMessages,
  setPanelHydrated,
  state,
}: {
  conversationId: string
  conversationPurpose?: AiConversationPurpose
  generationMode: AiGenerationMode
  imageAttachment?: ChatImageAttachment
  input: string
  inputExpanded: boolean
  latestGeometryArtifactRef: { current: GeneratedGeometryArtifact | null }
  messages: ChatMessage[]
  panelHydrated: boolean
  sceneId?: string
  scrollRef: RefObject<HTMLDivElement | null>
  setConversationId: Dispatch<SetStateAction<string>>
  setConversationPurpose: Dispatch<SetStateAction<AiConversationPurpose | undefined>>
  setGenerationMode: Dispatch<SetStateAction<AiGenerationMode>>
  setImageAttachment: Dispatch<SetStateAction<ChatImageAttachment | undefined>>
  setInput: Dispatch<SetStateAction<string>>
  setInputExpanded: Dispatch<SetStateAction<boolean>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setPanelHydrated: Dispatch<SetStateAction<boolean>>
  state: AiChatPanelStateSnapshot
}) {
  useEffect(() => {
    const persisted = readPersistedAiChatPanelState(sceneId)
    if (persisted) {
      setConversationId(persisted.conversationId)
      setMessages(persisted.messages)
      setInput(persisted.input)
      setGenerationMode(persisted.generationMode)
      setConversationPurpose(persisted.conversationPurpose)
      setInputExpanded(persisted.inputExpanded)
      setImageAttachment(persisted.imageAttachment)
      latestGeometryArtifactRef.current = latestGeneratedGeometryArtifact(persisted.messages)
    } else {
      setConversationId(aiChatDefaultConversationId(sceneId))
      setMessages([])
      setInput('')
      setGenerationMode(state.generationMode)
      setConversationPurpose(undefined)
      setInputExpanded(false)
      setImageAttachment(undefined)
      latestGeometryArtifactRef.current = null
    }
    setPanelHydrated(true)
  }, [
    latestGeometryArtifactRef,
    sceneId,
    setConversationId,
    setConversationPurpose,
    setGenerationMode,
    setImageAttachment,
    setInput,
    setInputExpanded,
    setMessages,
    setPanelHydrated,
    state.generationMode,
  ])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    state.messages = messages
    latestGeometryArtifactRef.current =
      latestGeneratedGeometryArtifact(messages) ?? latestGeometryArtifactRef.current
  }, [latestGeometryArtifactRef, messages, scrollRef, state])

  useEffect(() => {
    if (!panelHydrated) return
    if (typeof window === 'undefined') return
    const snapshot: AiChatPanelStateSnapshot & { updatedAt: string } = {
      sceneId,
      conversationId,
      messages: messages.slice(-AI_CHAT_STORAGE_MESSAGE_LIMIT).map(compactAiChatMessageForLocalStorage),
      input,
      generationMode,
      conversationPurpose,
      inputExpanded,
      imageAttachment: undefined,
      updatedAt: new Date().toISOString(),
    }
    writeAiChatPanelStateSnapshot(snapshot, sceneId)
  }, [
    conversationId,
    conversationPurpose,
    generationMode,
    imageAttachment,
    input,
    inputExpanded,
    messages,
    panelHydrated,
    sceneId,
  ])

  useEffect(() => {
    if (!panelHydrated) return
    if (messages.length === 0) return
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      void fetch(`/api/ai-harness/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId,
          messages,
          conversationPurpose,
          activeRunIds: messages
            .map((message) => message.generationRun)
            .filter(
              (job): job is NonNullable<ChatMessage['generationRun']> =>
                job != null && !['succeeded', 'failed', 'cancelled'].includes(job.status),
            )
            .map((job) => job.id),
        }),
        signal: controller.signal,
      }).catch(() => {})
    }, 1000)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [conversationId, conversationPurpose, messages, panelHydrated, sceneId])

  useEffect(() => {
    state.input = input
  }, [input, state])

  useEffect(() => {
    state.conversationId = conversationId
  }, [conversationId, state])

  useEffect(() => {
    state.generationMode = generationMode
    if (generationMode === 'primitive') setImageAttachment(undefined)
  }, [generationMode, setImageAttachment, state])

  useEffect(() => {
    state.conversationPurpose = conversationPurpose
  }, [conversationPurpose, state])

  useEffect(() => {
    state.inputExpanded = inputExpanded
  }, [inputExpanded, state])

  useEffect(() => {
    state.imageAttachment = imageAttachment
  }, [imageAttachment, state])
}
