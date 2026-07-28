import { AI_GENERATION_MODES } from './chat-utils'
import type {
  AiConversationPurpose,
  AiGenerationMode,
  ChatImageAttachment,
  ChatMessage,
  ProfilePackApiSummary,
  ProfilePackDebugSummary,
  ProfilePackSummary,
} from './types'

export function useAiChatDerivedState({
  conversationPurpose,
  generationMode,
  imageAttachment,
  input,
  loading,
  messages,
  profilePackDebug,
  profilePacks,
  profilePackSummary,
}: {
  conversationPurpose?: AiConversationPurpose
  generationMode: AiGenerationMode
  imageAttachment?: ChatImageAttachment
  input: string
  loading: boolean
  messages: ChatMessage[]
  profilePackDebug: ProfilePackDebugSummary[]
  profilePacks: ProfilePackSummary[]
  profilePackSummary: ProfilePackApiSummary
}) {
  const currentMode =
    AI_GENERATION_MODES.find((mode) => mode.id === generationMode) ?? AI_GENERATION_MODES[0]!
  const resolvedConversationPurpose =
    conversationPurpose ?? (messages.length > 0 ? 'asset' : undefined)
  const showConversationPicker = !resolvedConversationPurpose && messages.length === 0
  const isFactoryConversation = resolvedConversationPurpose === 'factory'
  const isAssetConversation = resolvedConversationPurpose === 'asset'
  const enabledProfilePacks = profilePacks.filter((pack) => pack.enabled)
  const enabledFactoryProfilePacks = enabledProfilePacks.filter(
    (pack) =>
      (pack.factoryArchitectureCount ?? 0) > 0 ||
      (pack.processTemplateCount ?? 0) > 0 ||
      pack.industry.startsWith('industry.'),
  )
  const loadedProfileCount = profilePackSummary.loadedProfileCount ?? profilePackDebug.length
  const profileConflictCount = profilePackSummary.conflictCount ?? 0
  const visiblePackNames = enabledFactoryProfilePacks
    .slice(0, 2)
    .map((pack) => pack.industry || pack.name)
    .join(', ')
  const hiddenPackCount = Math.max(enabledFactoryProfilePacks.length - 2, 0)
  const enabledPackNames =
    visiblePackNames && hiddenPackCount > 0
      ? `${visiblePackNames}, +${hiddenPackCount} more`
      : visiblePackNames
  const showImageUpload = generationMode === 'image-to-3d' || generationMode === 'articraft'
  const canSend =
    !loading &&
    (generationMode === 'image-to-3d'
      ? true
      : generationMode === 'primitive'
        ? Boolean(input.trim())
        : Boolean(input.trim() || imageAttachment))
  const inputPlaceholder =
    generationMode === 'primitive'
      ? '\u63cf\u8ff0\u8981\u642d\u5efa\u7684\u51e0\u4f55\u4f53...'
      : generationMode === 'image-to-3d'
        ? '\u4e0a\u4f20\u56fe\u7247\u5e76\u63cf\u8ff0\u6a21\u578b...'
        : '\u63cf\u8ff0\u8981\u751f\u6210\u7684\u53ef\u52a8\u6a21\u578b...'
  const latestVisibleGeometryArtifactId = [...messages]
    .reverse()
    .find((message) => message.geometryArtifact && !message.geometryArtifact.supersededBy)
    ?.geometryArtifact?.id

  return {
    canSend,
    currentMode,
    enabledPackNames,
    cloudInstalledIndustryPackCount: profilePackSummary.cloudInstalledIndustryPackCount,
    inputPlaceholder,
    isAssetConversation,
    isFactoryConversation,
    latestVisibleGeometryArtifactId,
    loadedProfileCount,
    profileConflictCount,
    showConversationPicker,
    showImageUpload,
  }
}
