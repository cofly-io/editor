'use client'
import {
  latestGeneratedGeometryArtifact,
} from '../../../../../lib/ai-chat-harness'
import { type GeneratedGeometryArtifact } from '../../../../../lib/ai-generated-geometry'
import { Icon } from '@iconify/react'
import { useRef, useState } from 'react'
import { t } from '../../../../../i18n'
import { cn } from '../../../../../lib/utils'
import useEditor from '../../../../../store/use-editor'
import { AiChatInputArea } from './ai-chat-input-area'
import { ArticraftViewerModal } from './articraft-viewer-modal'
import { ChatMessageList } from './chat-message-list'
import { ConversationEmptyStates } from './conversation-empty-states'
import { ConversationHistoryMenu } from './conversation-history-menu'
import {
  buildMultimodalContent,
  isAbortError,
  isRecord,
} from './chat-utils'
import {
  AI_CHAT_DEFAULT_CONVERSATION_ID,
  aiChatDefaultConversationId,
} from './storage'
import type {
  AiChatPanelStateSnapshot,
  AiConversationPurpose,
  AiGenerationMode,
  ApiMessage,
  ArticraftResult,
  ChatImageAttachment,
  ChatMessage,
  FactoryRunSummary,
} from './types'
import {
  COMPOSE_ASSEMBLY_TOOL,
  COMPOSE_PARTS_TOOL,
  COMPOSE_PRIMITIVE_TOOL,
  COMPOSE_RECIPE_TOOL,
  COMPOSE_ROBOT_ARM_TOOL,
  REVISE_GEOMETRY_TOOL,
  type ComposeTool,
} from './geometry-tools'
import { useAiChatApi } from './use-ai-chat-api'
import { useAiChatDerivedState } from './use-ai-chat-derived-state'
import { useAiChatPanelPersistence } from './use-ai-chat-panel-persistence'
import { useAiChatSubmit } from './use-ai-chat-submit'
import { useArticraftActions } from './use-articraft-actions'
import { useArticraftRuns } from './use-articraft-runs'
import { useConversationHistory } from './use-conversation-history'
import { useFactoryChat } from './use-factory-chat'
import { useFactorySelectionLabel } from './use-factory-selection-label'
import { useFactoryRuns } from './use-factory-runs'
import { useGeneratedArtifactActions } from './use-generated-artifact-actions'
import { useGenerationRunControls } from './use-generation-run-controls'
import { useGeometryAgentChat } from './use-geometry-agent-chat'
import { useAiChatUiEffects } from './use-ai-chat-ui-effects'
import { useImageAttachment } from './use-image-attachment'
import { useImageTo3DRuns } from './use-image-to-3d-runs'
import { useProfilePacks } from './use-profile-packs'
import { usePrimitiveChat } from './use-primitive-chat'
import { usePrimitiveRuns } from './use-primitive-runs'
import { usePrimitiveToolCalls } from './use-primitive-tool-calls'
import { useRunEventSources } from './use-run-event-sources'

const aiChatPanelState: AiChatPanelStateSnapshot = {
  conversationId: AI_CHAT_DEFAULT_CONVERSATION_ID,
  messages: [],
  input: '',
  generationMode: 'primitive',
  conversationPurpose: undefined,
  inputExpanded: false,
}

export function AiChatPanel({ sceneId }: { sceneId?: string } = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(aiChatPanelState.messages)
  const [input, setInput] = useState(aiChatPanelState.input)
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState(aiChatDefaultConversationId(sceneId))
  const [panelHydrated, setPanelHydrated] = useState(false)
  const [generationMode, setGenerationMode] = useState<AiGenerationMode>(
    aiChatPanelState.generationMode,
  )
  const [conversationPurpose, setConversationPurpose] = useState<AiConversationPurpose | undefined>(
    aiChatPanelState.conversationPurpose,
  )
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [factorySelectionCardOpen, setFactorySelectionCardOpen] = useState(false)
  const [factoryProfilePackCardOpen, setFactoryProfilePackCardOpen] = useState(false)
  const [inputExpanded, setInputExpanded] = useState(aiChatPanelState.inputExpanded)
  const [imageAttachment, setImageAttachment] = useState<ChatImageAttachment | undefined>(
    aiChatPanelState.imageAttachment,
  )
  const {
    handleProfilePackSelected,
    profilePackDebug,
    profilePackImporting,
    profilePackInputRef,
    profilePackStatus,
    profilePackSummary,
    profilePacks,
    profilePackWarningCount,
  } = useProfilePacks()
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeAbortControllerRef = useRef<AbortController | null>(null)
  const cancelledRunIdsRef = useRef<Set<string>>(new Set())
  const latestGeometryArtifactRef = useRef<GeneratedGeometryArtifact | null>(
    latestGeneratedGeometryArtifact(aiChatPanelState.messages),
  )

  const { callApi, primitiveHasConfig } = useAiChatApi()
  const {
    closeActiveRunSources,
    closeRunEventSource,
    getRunEventSourceIds,
    hasActiveRunEventSources,
    hasRunEventSource,
    trackRunEventSource,
  } = useRunEventSources({ setLoading })
  const {
    handleStopGeneration,
    markGenerationStopped,
    markRunCancelledFromServer,
  } = useGenerationRunControls({
    activeAbortControllerRef,
    cancelledRunIdsRef,
    closeActiveRunSources,
    closeRunEventSource,
    getRunEventSourceIds,
    messages,
    setLoading,
    setMessages,
  })
  const articraftViewerUrl = process.env.NEXT_PUBLIC_ARTICRAFT_VIEWER_URL ?? 'http://127.0.0.1:8765'
  const factorySelectionLabel = useFactorySelectionLabel()

  useAiChatPanelPersistence({
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
    state: aiChatPanelState,
  })

  useAiChatUiEffects({
    inputRef,
    loading,
    setModeMenuOpen,
  })

  const {
    handlePlaceGeometryArtifact,
    handlePlaceModelArtifact,
    handleReplaceGeometryArtifact,
    handleSaveGeometryArtifact,
    handleSaveModelArtifact,
  } = useGeneratedArtifactActions({ latestGeometryArtifactRef, setMessages })

  const { handleImageSelected, imageInputRef } = useImageAttachment({
    setImageAttachment,
    setMessages,
  })

  const { processToolCalls } = usePrimitiveToolCalls({
    callApi,
    latestGeometryArtifactRef,
    setMessages,
  })

  const { applyFactoryRun, subscribeFactoryRun } = useFactoryRuns({
    cancelledRunIdsRef,
    closeRunEventSource,
    hasRunEventSource,
    markRunCancelledFromServer,
    setLoading,
    setMessages,
    trackRunEventSource,
  })

  const {
    handleSelectImageTo3DAsset,
    sendImageTo3DMessage,
    subscribeImageTo3DRun,
  } = useImageTo3DRuns({
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
  })

  const {
    exportArticraftAsset,
    sendArticraftMessage,
    subscribeArticraftRun,
  } = useArticraftRuns({
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
  })

  const {
    articraftViewerModal,
    closeArticraftViewerModal,
    handleApplyArticraftPose,
    handleImportArticraftResult,
    handleSaveArticraftAsset,
    openArticraftViewer,
  } = useArticraftActions({
    articraftViewerUrl,
    exportArticraftAsset,
    setMessages,
  })

  const { subscribePrimitiveRun } = usePrimitiveRuns({
    closeRunEventSource,
    hasRunEventSource,
    latestGeometryArtifactRef,
    markRunCancelledFromServer,
    setLoading,
    setMessages,
    trackRunEventSource,
  })

  const { sendGeometryAgentMessage } = useGeometryAgentChat({
    activeAbortControllerRef,
    input,
    loading,
    markGenerationStopped,
    messages,
    setImageAttachment,
    setInput,
    setLoading,
    setMessages,
  })

  const { sendPrimitiveMessage } = usePrimitiveChat({
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
    sendGeometryAgentMessage,
    subscribePrimitiveRun,
  })

  const {
    conversationHistory,
    conversationHistoryLoading,
    conversationHistoryOpen,
    createNewConversation,
    deleteConversation,
    refreshConversationHistory,
    setConversationHistoryOpen,
    switchConversation,
  } = useConversationHistory({
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
  })

  const { sendFactoryMessage } = useFactoryChat({
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
  })

  const {
    handleAssetSubmit,
    handleFactoryKeyDown,
    handleKeyDown,
    selectConversationPurpose,
    sendMessage,
  } = useAiChatSubmit({
    generationMode,
    imageAttachment,
    input,
    loading,
    sendArticraftMessage,
    sendFactoryMessage,
    sendImageTo3DMessage,
    sendPrimitiveMessage,
    setConversationHistoryOpen,
    setConversationPurpose,
    setImageAttachment,
    setModeMenuOpen,
  })

  const {
    canSend,
    cloudInstalledIndustryPackCount,
    currentMode,
    enabledPackNames,
    inputPlaceholder,
    isAssetConversation,
    isFactoryConversation,
    latestVisibleGeometryArtifactId,
    loadedProfileCount,
    profileConflictCount,
    showConversationPicker,
    showImageUpload,
  } = useAiChatDerivedState({
    conversationPurpose,
    generationMode,
    imageAttachment,
    input,
    loading,
    messages,
    profilePackDebug,
    profilePacks,
    profilePackSummary,
  })

  return (
    <div className="flex h-full flex-col">
      <ArticraftViewerModal modal={articraftViewerModal} onClose={closeArticraftViewerModal} />
      <div className="relative flex items-center justify-end gap-1.5 border-border/50 border-b px-3 py-2.5">
        <ConversationHistoryMenu
          conversationHistory={conversationHistory}
          conversationHistoryLoading={conversationHistoryLoading}
          conversationHistoryOpen={conversationHistoryOpen}
          conversationId={conversationId}
          createNewConversation={createNewConversation}
          deleteConversation={deleteConversation}
          refreshConversationHistory={refreshConversationHistory}
          setConversationHistoryOpen={setConversationHistoryOpen}
          switchConversation={switchConversation}
        />
        {isAssetConversation && !primitiveHasConfig && generationMode === 'primitive' && (
          <span className="text-[10px] text-orange-400">
            {t('aiChat.notConfigured', 'Not configured')}
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto px-3 py-2 [scrollbar-color:#3a3a3d_#050505] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3d] [&::-webkit-scrollbar-track]:bg-[#050505]"
      >
        <ConversationEmptyStates
          isAssetConversation={isAssetConversation}
          isFactoryConversation={isFactoryConversation}
          messageCount={messages.length}
          onSelectPurpose={selectConversationPurpose}
          showConversationPicker={showConversationPicker}
        />
        <ChatMessageList
          disabled={loading}
          handleApplyArticraftPose={handleApplyArticraftPose}
          handleImportArticraftResult={handleImportArticraftResult}
          handlePlaceGeometryArtifact={handlePlaceGeometryArtifact}
          handlePlaceModelArtifact={handlePlaceModelArtifact}
          handleReplaceGeometryArtifact={handleReplaceGeometryArtifact}
          handleSaveArticraftAsset={handleSaveArticraftAsset}
          handleSaveGeometryArtifact={handleSaveGeometryArtifact}
          handleSaveModelArtifact={handleSaveModelArtifact}
          handleSelectImageTo3DAsset={handleSelectImageTo3DAsset}
          latestVisibleGeometryArtifactId={latestVisibleGeometryArtifactId}
          messages={messages}
          onApplyFactoryRun={applyFactoryRun}
          openArticraftViewer={openArticraftViewer}
          sendArticraftMessage={sendArticraftMessage}
          sendImageTo3DMessage={sendImageTo3DMessage}
          sendMessage={sendMessage}
        />
        {loading && (
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground">
            <Icon className="size-3.5 animate-spin" icon="mdi:loading" />
            {t('aiChat.thinking', 'Thinking...')}
          </div>
        )}
      </div>

      <AiChatInputArea
        canSend={canSend}
        cloudInstalledIndustryPackCount={cloudInstalledIndustryPackCount}
        currentMode={currentMode}
        enabledPackNames={enabledPackNames}
        factoryProfilePackCardOpen={factoryProfilePackCardOpen}
        factorySelectionCardOpen={factorySelectionCardOpen}
        factorySelectionLabel={factorySelectionLabel}
        generationMode={generationMode}
        handleAssetSubmit={handleAssetSubmit}
        handleFactoryKeyDown={handleFactoryKeyDown}
        handleImageSelected={handleImageSelected}
        handleKeyDown={handleKeyDown}
        handleProfilePackSelected={handleProfilePackSelected}
        handleStopGeneration={handleStopGeneration}
        imageAttachment={imageAttachment}
        imageInputRef={imageInputRef}
        input={input}
        inputExpanded={inputExpanded}
        inputPlaceholder={inputPlaceholder}
        inputRef={inputRef}
        isAssetConversation={isAssetConversation}
        isFactoryConversation={isFactoryConversation}
        loadedProfileCount={loadedProfileCount}
        loading={loading}
        modeMenuOpen={modeMenuOpen}
        profileConflictCount={profileConflictCount}
        profilePackImporting={profilePackImporting}
        profilePackInputRef={profilePackInputRef}
        profilePackStatus={profilePackStatus}
        profilePackWarningCount={profilePackWarningCount}
        sendFactoryMessage={sendFactoryMessage}
        setFactoryProfilePackCardOpen={setFactoryProfilePackCardOpen}
        setFactorySelectionCardOpen={setFactorySelectionCardOpen}
        setGenerationMode={setGenerationMode}
        setImageAttachment={setImageAttachment}
        setInput={setInput}
        setInputExpanded={setInputExpanded}
        setModeMenuOpen={setModeMenuOpen}
        showImageUpload={showImageUpload}
      />
    </div>
  )
}

export default AiChatPanel
