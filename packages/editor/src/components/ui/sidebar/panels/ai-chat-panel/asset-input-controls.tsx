import { Icon } from '@iconify/react'
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react'
import { cn } from '../../../../../lib/utils'
import {
  AI_GENERATION_MODES,
  type AiGenerationModeConfig,
} from './chat-utils'
import type { AiGenerationMode, ChatImageAttachment } from './types'

export function AssetInputControls({
  currentMode,
  generationMode,
  handleImageSelected,
  imageAttachment,
  imageInputRef,
  loading,
  modeMenuOpen,
  setGenerationMode,
  setImageAttachment,
  setModeMenuOpen,
  showImageUpload,
}: {
  currentMode: AiGenerationModeConfig
  generationMode: AiGenerationMode
  handleImageSelected: (event: ChangeEvent<HTMLInputElement>) => void
  imageAttachment?: ChatImageAttachment
  imageInputRef: RefObject<HTMLInputElement | null>
  loading: boolean
  modeMenuOpen: boolean
  setGenerationMode: Dispatch<SetStateAction<AiGenerationMode>>
  setImageAttachment: Dispatch<SetStateAction<ChatImageAttachment | undefined>>
  setModeMenuOpen: Dispatch<SetStateAction<boolean>>
  showImageUpload: boolean
}) {
  return (
    <>
      <div className="relative mb-2">
        <button
          aria-expanded={modeMenuOpen}
          aria-haspopup="listbox"
          className="flex w-full items-center gap-2 rounded-xl border border-border/60 bg-accent/25 px-2.5 py-2 text-left transition-colors hover:border-[#a684ff]/50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
          onClick={() => setModeMenuOpen((open) => !open)}
          type="button"
        >
          <Icon className="size-4 shrink-0 text-[#a684ff]" icon="mdi:tune-variant" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[11px] font-medium text-foreground">
                {currentMode.label}
              </span>
              <span className="shrink-0 rounded bg-background/70 px-1.5 py-0.5 text-[8px] text-muted-foreground">
                {currentMode.tech}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[9px] text-muted-foreground">
              {currentMode.description}
            </div>
          </div>
          <Icon
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', modeMenuOpen && 'rotate-180')}
            icon="mdi:chevron-down"
          />
        </button>
        {modeMenuOpen ? (
          <div
            className="absolute bottom-full left-0 z-20 mb-1.5 w-full rounded-xl border border-border/70 bg-background/95 p-1.5 shadow-xl backdrop-blur"
            role="listbox"
          >
            {AI_GENERATION_MODES.map((mode) => {
              const active = mode.id === generationMode
              return (
                <button
                  aria-selected={active}
                  className={cn(
                    'w-full rounded-lg px-2 py-1.5 text-left transition-colors',
                    active
                      ? 'bg-[#a684ff]/15 text-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                  key={mode.id}
                  onClick={() => {
                    setGenerationMode(mode.id)
                    if (mode.id === 'primitive') setImageAttachment(undefined)
                    setModeMenuOpen(false)
                  }}
                  role="option"
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium">{mode.label}</span>
                    <span className="shrink-0 rounded bg-background/70 px-1.5 py-0.5 text-[8px] text-muted-foreground">
                      {mode.tech}
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[9px] leading-snug opacity-80">
                    {mode.description}
                  </div>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
      {showImageUpload && imageAttachment ? (
        <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-border/60 bg-accent/30 p-1.5">
          <img
            alt={imageAttachment.name}
            className="size-10 rounded border border-border/50 object-cover"
            src={imageAttachment.dataUrl}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] text-foreground">{imageAttachment.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {(imageAttachment.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
          <button
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            disabled={loading}
            onClick={() => setImageAttachment(undefined)}
            type="button"
          >
            <Icon className="size-3.5" icon="mdi:close" />
          </button>
        </div>
      ) : null}
      <input
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        disabled={loading}
        onChange={handleImageSelected}
        ref={imageInputRef}
        type="file"
      />
    </>
  )
}
