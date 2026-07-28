import type { AiChatPanelStateSnapshot, AiConversationPurpose, ChatMessage } from './types'

export const AI_CHAT_DEFAULT_CONVERSATION_ID = 'default'
const AI_CHAT_STORAGE_KEY = 'pascal-ai-chat-panel-state:v1'
export const AI_CHAT_STORAGE_MESSAGE_LIMIT = 40
const AI_CHAT_STORAGE_FALLBACK_MESSAGE_LIMIT = 12
const AI_CHAT_STORAGE_CONTENT_MAX_LENGTH = 20_000

function truncateAiChatStorageText(value: string) {
  if (value.length <= AI_CHAT_STORAGE_CONTENT_MAX_LENGTH) return value
  return `${value.slice(0, AI_CHAT_STORAGE_CONTENT_MAX_LENGTH)}\u2026`
}

export function compactAiChatMessageForLocalStorage(message: ChatMessage): ChatMessage {
  const compact: ChatMessage = {
    ...message,
    content: truncateAiChatStorageText(message.content),
  }
  delete compact.image
  return compact
}

function minimalAiChatMessageForLocalStorage(message: ChatMessage): ChatMessage {
  return {
    role: message.role,
    content: truncateAiChatStorageText(message.content),
    ...(message.generationRun ? { generationRun: message.generationRun } : {}),
  }
}

function isStorageQuotaExceeded(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014)
  )
}

function aiChatStorageKey(sceneId?: string) {
  return sceneId ? `${AI_CHAT_STORAGE_KEY}:scene:${sceneId}` : AI_CHAT_STORAGE_KEY
}

export function aiChatDefaultConversationId(sceneId?: string) {
  return sceneId ? `scene_${sceneId}` : AI_CHAT_DEFAULT_CONVERSATION_ID
}

export function writeAiChatPanelStateSnapshot(
  snapshot: AiChatPanelStateSnapshot & { updatedAt: string },
  sceneId?: string,
) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(aiChatStorageKey(sceneId), JSON.stringify(snapshot))
    return
  } catch (error) {
    if (!isStorageQuotaExceeded(error)) return
  }

  const fallbackSnapshot: AiChatPanelStateSnapshot & { updatedAt: string } = {
    ...snapshot,
    messages: snapshot.messages
      .slice(-AI_CHAT_STORAGE_FALLBACK_MESSAGE_LIMIT)
      .map(minimalAiChatMessageForLocalStorage),
    imageAttachment: undefined,
  }

  try {
    window.localStorage.setItem(aiChatStorageKey(sceneId), JSON.stringify(fallbackSnapshot))
  } catch {
    window.localStorage.removeItem(aiChatStorageKey(sceneId))
  }
}

export function readPersistedAiChatPanelState(sceneId?: string): AiChatPanelStateSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(aiChatStorageKey(sceneId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AiChatPanelStateSnapshot>
    const messages = Array.isArray(parsed.messages) ? (parsed.messages as ChatMessage[]) : []
    const conversationPurpose =
      parsed.conversationPurpose === 'factory' || parsed.conversationPurpose === 'asset'
        ? parsed.conversationPurpose
        : inferConversationPurposeFromMessages(messages)
    return {
      sceneId,
      conversationId:
        typeof parsed.conversationId === 'string'
          ? parsed.conversationId
          : aiChatDefaultConversationId(sceneId),
      messages,
      input: typeof parsed.input === 'string' ? parsed.input : '',
      generationMode:
        parsed.generationMode === 'articraft' ||
        parsed.generationMode === 'image-to-3d' ||
        parsed.generationMode === 'geometry-agent'
          ? parsed.generationMode
          : 'primitive',
      conversationPurpose,
      inputExpanded: parsed.inputExpanded === true,
      imageAttachment: parsed.imageAttachment,
    }
  } catch {
    return null
  }
}

export function isAiConversationPurpose(value: unknown): value is AiConversationPurpose {
  return value === 'factory' || value === 'asset'
}

export function inferConversationPurposeFromMessages(
  messages: readonly ChatMessage[],
): AiConversationPurpose | undefined {
  if (messages.some((message) => message.generationRun?.mode === 'factory')) return 'factory'
  return messages.length > 0 ? 'asset' : undefined
}
