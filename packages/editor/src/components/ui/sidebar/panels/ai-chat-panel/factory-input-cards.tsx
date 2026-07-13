import { Icon } from '@iconify/react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { cn } from '../../../../../lib/utils'

export function FactoryProfilePackCard({
  cloudInstalledIndustryPackCount,
  enabledPackNames,
  loadedProfileCount,
  open,
  profileConflictCount,
  profilePackImporting,
  profilePackInputRef,
  profilePackStatus,
  profilePackWarningCount,
  setOpen,
}: {
  cloudInstalledIndustryPackCount?: number
  enabledPackNames: string
  loadedProfileCount: number
  open: boolean
  profileConflictCount: number
  profilePackImporting: boolean
  profilePackInputRef: RefObject<HTMLInputElement | null>
  profilePackStatus?: string | null
  profilePackWarningCount: number
  setOpen: Dispatch<SetStateAction<boolean>>
}) {
  return (
    <div className="mb-1.5 rounded-lg border border-border/60 bg-accent/20 px-2 py-1.5">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Icon className="size-3.5 shrink-0 text-[#a684ff]" icon="mdi:package-variant" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] text-muted-foreground">
            已安装行业包 {cloudInstalledIndustryPackCount ?? '加载中'}
          </div>
        </div>
        <Icon
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          icon="mdi:chevron-down"
        />
      </button>
      {open ? (
        <div className="mt-1 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground/80">
              {enabledPackNames ? (
                <span>{enabledPackNames}</span>
              ) : (
                <span>No local factory-capable industry pack is enabled</span>
              )}
              <span>Loaded profiles {loadedProfileCount}</span>
              {profileConflictCount > 0 ? <span>Conflicts {profileConflictCount}</span> : null}
              {profilePackWarningCount > 0 ? <span>Warnings {profilePackWarningCount}</span> : null}
            </div>
            {profilePackStatus ? (
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground/80">
                {profilePackStatus}
              </div>
            ) : null}
          </div>
          <a
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:border-[#a684ff]/50 hover:text-[#a684ff]"
            href="/profile-packs"
            rel="noreferrer"
            target="_blank"
            title="Download or manage profile packs"
          >
            <Icon className="size-3.5" icon="mdi:cloud-download-outline" />
            Manage
          </a>
          <button
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:border-[#a684ff]/50 hover:text-[#a684ff] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={profilePackImporting}
            onClick={() => profilePackInputRef.current?.click()}
            title="Import an industry profile pack zip"
            type="button"
          >
            <Icon
              className={cn('size-3.5', profilePackImporting && 'animate-spin')}
              icon={profilePackImporting ? 'mdi:loading' : 'mdi:archive-arrow-up-outline'}
            />
            Import
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function FactorySelectionCard({
  disabled,
  factorySelectionLabel,
  open,
  setInput,
  setOpen,
}: {
  disabled: boolean
  factorySelectionLabel: string
  open: boolean
  setInput: Dispatch<SetStateAction<string>>
  setOpen: Dispatch<SetStateAction<boolean>>
}) {
  return (
    <div className="mb-2 rounded-lg border border-[#a684ff]/25 bg-[#a684ff]/10 px-2.5 py-1.5">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left text-[10px] text-muted-foreground"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Icon
          className="size-3.5 shrink-0 text-[#a684ff]"
          icon="mdi:cursor-default-click-outline"
        />
        <span className="min-w-0 flex-1 truncate">Selected: {factorySelectionLabel}</span>
        <Icon
          className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')}
          icon="mdi:chevron-down"
        />
      </button>
      {open ? (
        <>
          <div className="mt-1 text-[9px] leading-snug text-muted-foreground/80">
            Click to select an object. Hold Ctrl to add multiple objects.
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {['make blue', 'move left 1m', 'rotate 90 degrees', 'delete this'].map((hint) => (
              <button
                className="rounded-md border border-border/50 px-1.5 py-0.5 text-[9px] text-muted-foreground transition-colors hover:border-[#a684ff]/50 hover:text-[#a684ff]"
                disabled={disabled}
                key={hint}
                onClick={() => setInput(hint)}
                type="button"
              >
                {hint}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
