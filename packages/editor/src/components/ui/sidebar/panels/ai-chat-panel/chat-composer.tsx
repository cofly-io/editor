import { Icon } from '@iconify/react'
import { type KeyboardEvent, type RefObject } from 'react'
import { cn } from '../../../../../lib/utils'

export function ChatComposer({
  canSend,
  disabled,
  input,
  inputExpanded,
  inputRef,
  onChange,
  onKeyDown,
  onSend,
  onToggleExpanded,
  onUploadImage,
  placeholder,
  sendIcon = 'mdi:send',
  sendTitle = 'Send',
  testId,
  uploadDisabled,
}: {
  canSend: boolean
  disabled?: boolean
  input: string
  inputExpanded: boolean
  inputRef: RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onToggleExpanded: () => void
  onUploadImage?: () => void
  placeholder: string
  sendIcon?: string
  sendTitle?: string
  testId?: string
  uploadDisabled?: boolean
}) {
  return (
    <div className="relative">
      <textarea
        className={cn(
          'w-full resize-none rounded-lg border border-border/60 bg-accent/30 px-2.5 py-1.5 pr-8 pb-11 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#a684ff]/50 focus:outline-none focus:ring-1 focus:ring-[#a684ff]/30',
          inputExpanded ? 'min-h-[132px]' : 'min-h-[72px]',
        )}
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        ref={inputRef}
        rows={inputExpanded ? 6 : 3}
        value={input}
      />
      <button
        className="absolute top-1.5 right-1.5 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-[#a684ff]"
        onClick={onToggleExpanded}
        title={inputExpanded ? 'Collapse to 3 rows' : 'Expand to 6 rows'}
        type="button"
      >
        <Icon
          className="size-3.5"
          icon={inputExpanded ? 'mdi:arrow-collapse-vertical' : 'mdi:arrow-expand-vertical'}
        />
      </button>
      {onUploadImage ? (
        <button
          className={cn(
            'absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors',
            uploadDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent hover:text-[#a684ff]',
          )}
          disabled={uploadDisabled}
          onClick={onUploadImage}
          title="Upload image"
          type="button"
        >
          <Icon className="size-4" icon="mdi:image-plus-outline" />
        </button>
      ) : null}
      <button
        className={cn(
          'absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors',
          disabled
            ? 'hover:bg-red-500/10 hover:text-red-400'
            : !canSend
              ? 'cursor-not-allowed opacity-50'
              : 'hover:bg-accent hover:text-[#a684ff]',
        )}
        disabled={!disabled && !canSend}
        onClick={onSend}
        title={sendTitle}
        type="button"
      >
        <Icon className="size-4" icon={sendIcon} />
      </button>
    </div>
  )
}
