import type { ChangeEvent, Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react'
import { t } from '../../../../../i18n'
import { AssetInputControls } from './asset-input-controls'
import { ChatComposer } from './chat-composer'
import {
  FactoryProfilePackCard,
  FactorySelectionCard,
} from './factory-input-cards'
import type {
  AiGenerationMode,
  ChatImageAttachment,
} from './types'
import type { AiGenerationModeConfig } from './chat-utils'

export function AiChatInputArea({
  canSend,
  cloudInstalledIndustryPackCount,
  currentMode,
  enabledPackNames,
  factoryProfilePackCardOpen,
  factorySelectionCardOpen,
  factorySelectionLabel,
  generationMode,
  handleAssetSubmit,
  handleFactoryKeyDown,
  handleImageSelected,
  handleProfilePackSelected,
  handleStopGeneration,
  handleKeyDown,
  imageAttachment,
  imageInputRef,
  input,
  inputExpanded,
  inputPlaceholder,
  inputRef,
  isAssetConversation,
  isFactoryConversation,
  loadedProfileCount,
  loading,
  modeMenuOpen,
  profileConflictCount,
  profilePackImporting,
  profilePackInputRef,
  profilePackStatus,
  profilePackWarningCount,
  sendFactoryMessage,
  setFactoryProfilePackCardOpen,
  setFactorySelectionCardOpen,
  setGenerationMode,
  setImageAttachment,
  setInput,
  setInputExpanded,
  setModeMenuOpen,
  showImageUpload,
}: {
  canSend: boolean
  cloudInstalledIndustryPackCount?: number
  currentMode: AiGenerationModeConfig
  enabledPackNames: string
  factoryProfilePackCardOpen: boolean
  factorySelectionCardOpen: boolean
  factorySelectionLabel: string
  generationMode: AiGenerationMode
  handleAssetSubmit: () => void
  handleFactoryKeyDown: (event: KeyboardEvent) => void
  handleImageSelected: (event: ChangeEvent<HTMLInputElement>) => void
  handleProfilePackSelected: (event: ChangeEvent<HTMLInputElement>) => void
  handleStopGeneration: () => void
  handleKeyDown: (event: KeyboardEvent) => void
  imageAttachment?: ChatImageAttachment
  imageInputRef: RefObject<HTMLInputElement | null>
  input: string
  inputExpanded: boolean
  inputPlaceholder: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  isAssetConversation: boolean
  isFactoryConversation: boolean
  loadedProfileCount: number
  loading: boolean
  modeMenuOpen: boolean
  profileConflictCount: number
  profilePackImporting: boolean
  profilePackInputRef: RefObject<HTMLInputElement | null>
  profilePackStatus?: string | null
  profilePackWarningCount: number
  sendFactoryMessage: () => void
  setFactoryProfilePackCardOpen: Dispatch<SetStateAction<boolean>>
  setFactorySelectionCardOpen: Dispatch<SetStateAction<boolean>>
  setGenerationMode: Dispatch<SetStateAction<AiGenerationMode>>
  setImageAttachment: Dispatch<SetStateAction<ChatImageAttachment | undefined>>
  setInput: Dispatch<SetStateAction<string>>
  setInputExpanded: Dispatch<SetStateAction<boolean>>
  setModeMenuOpen: Dispatch<SetStateAction<boolean>>
  showImageUpload: boolean
}) {
  return (
    <>
      <input
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        disabled={profilePackImporting}
        onChange={handleProfilePackSelected}
        ref={profilePackInputRef}
        type="file"
      />
      {isAssetConversation ? (
        <div className="border-border/50 border-t px-3 py-2">
          <AssetInputControls
            currentMode={currentMode}
            generationMode={generationMode}
            handleImageSelected={handleImageSelected}
            imageAttachment={imageAttachment}
            imageInputRef={imageInputRef}
            loading={loading}
            modeMenuOpen={modeMenuOpen}
            setGenerationMode={setGenerationMode}
            setImageAttachment={setImageAttachment}
            setModeMenuOpen={setModeMenuOpen}
            showImageUpload={showImageUpload}
          />
          <ChatComposer
            canSend={canSend}
            disabled={loading}
            input={input}
            inputExpanded={inputExpanded}
            inputRef={inputRef}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onSend={loading ? handleStopGeneration : handleAssetSubmit}
            onToggleExpanded={() => setInputExpanded((expanded) => !expanded)}
            onUploadImage={showImageUpload ? () => imageInputRef.current?.click() : undefined}
            placeholder={t('aiChat.inputPlaceholder', inputPlaceholder)}
            sendIcon={loading ? 'mdi:stop' : 'mdi:send'}
            sendTitle={loading ? 'Stop generation' : 'Send'}
            uploadDisabled={loading}
          />
        </div>
      ) : isFactoryConversation ? (
        <div className="border-border/50 border-t px-3 py-2">
          {generationMode === 'primitive' ? (
            <FactoryProfilePackCard
              cloudInstalledIndustryPackCount={cloudInstalledIndustryPackCount}
              enabledPackNames={enabledPackNames}
              loadedProfileCount={loadedProfileCount}
              open={factoryProfilePackCardOpen}
              profileConflictCount={profileConflictCount}
              profilePackImporting={profilePackImporting}
              profilePackInputRef={profilePackInputRef}
              profilePackStatus={profilePackStatus}
              profilePackWarningCount={profilePackWarningCount}
              setOpen={setFactoryProfilePackCardOpen}
            />
          ) : null}
          <FactorySelectionCard
            disabled={loading}
            factorySelectionLabel={factorySelectionLabel}
            open={factorySelectionCardOpen}
            setInput={setInput}
            setOpen={setFactorySelectionCardOpen}
          />
          <ChatComposer
            canSend={Boolean(input.trim())}
            disabled={loading}
            input={input}
            inputExpanded={inputExpanded}
            inputRef={inputRef}
            onChange={setInput}
            onKeyDown={handleFactoryKeyDown}
            onSend={loading ? handleStopGeneration : sendFactoryMessage}
            onToggleExpanded={() => setInputExpanded((expanded) => !expanded)}
            placeholder="Describe the factory layout to create or modify..."
            sendIcon={loading ? 'mdi:stop' : 'mdi:send'}
            sendTitle={loading ? 'Stop generation' : 'Send'}
            testId="factory-chat-input"
          />
        </div>
      ) : null}
    </>
  )
}
