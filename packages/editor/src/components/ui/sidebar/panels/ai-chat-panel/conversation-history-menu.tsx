import { Icon } from '@iconify/react'
import type { Dispatch, SetStateAction } from 'react'
import { t } from '../../../../../i18n'
import { cn } from '../../../../../lib/utils'
import { conversationHistoryIcon } from './conversation-history'
import type { AiConversationSummary } from './types'

export function ConversationHistoryMenu({
  conversationHistory,
  conversationHistoryLoading,
  conversationHistoryOpen,
  conversationId,
  createNewConversation,
  deleteConversation,
  refreshConversationHistory,
  setConversationHistoryOpen,
  switchConversation,
}: {
  conversationHistory: AiConversationSummary[]
  conversationHistoryLoading: boolean
  conversationHistoryOpen: boolean
  conversationId: string
  createNewConversation: () => Promise<void>
  deleteConversation: (conversationId: string) => Promise<void>
  refreshConversationHistory: (options?: { append?: boolean; force?: boolean }) => Promise<void>
  setConversationHistoryOpen: Dispatch<SetStateAction<boolean>>
  switchConversation: (conversation: AiConversationSummary) => void
}) {
  return (
    <>
      <button
        aria-expanded={conversationHistoryOpen}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-accent/25 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-[#a684ff]/50 hover:text-[#a684ff]"
        onClick={() => {
          setConversationHistoryOpen((open) => {
            const nextOpen = !open
            if (nextOpen) void refreshConversationHistory()
            return nextOpen
          })
        }}
        type="button"
      >
        <Icon className="size-3.5" icon="mdi:history" />
        {t('aiChat.conversationHistory', '历史')}
        <Icon
          className={cn('size-3.5 transition-transform', conversationHistoryOpen && 'rotate-180')}
          icon="mdi:chevron-down"
        />
      </button>
      <button
        aria-label={t('aiChat.newConversation', '新建会话')}
        className="inline-flex size-7 items-center justify-center rounded-md border border-border/60 bg-accent/25 text-muted-foreground transition-colors hover:border-[#a684ff]/50 hover:text-[#a684ff]"
        onClick={() => void createNewConversation()}
        type="button"
      >
        <Icon className="size-4" icon="mdi:plus" />
      </button>
      {conversationHistoryOpen ? (
        <div className="absolute top-full right-3 z-30 mt-1.5 w-[min(22rem,calc(100%-1.5rem))] rounded-xl border border-border/70 bg-background/95 p-1.5 shadow-xl backdrop-blur">
          {conversationHistory.length === 0 ? (
            <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              {t('aiChat.noConversationHistory', '暂无历史记录')}
            </div>
          ) : (
            <div
              className="max-h-[27rem] overflow-y-auto [scrollbar-color:#3a3a3d_#050505] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3d] [&::-webkit-scrollbar-track]:bg-[#050505]"
              onScroll={(event) => {
                const target = event.currentTarget
                const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight
                if (distanceToBottom < 24) void refreshConversationHistory({ append: true })
              }}
            >
              {conversationHistory.map((conversation) => {
                const active = conversation.id === conversationId
                const icon = conversationHistoryIcon(conversation)
                return (
                  <div
                    className={cn(
                      'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/50',
                      active && 'bg-[#a684ff]/10 text-[#a684ff]',
                    )}
                    key={conversation.id}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                      onClick={() => switchConversation(conversation)}
                      type="button"
                    >
                      <span
                        className={cn(
                          'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md border',
                          icon.className,
                        )}
                        title={icon.label}
                      >
                        <Icon className="size-3.5" icon={icon.icon} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium">
                          {conversation.title || t('aiChat.newConversation', '新建会话')}
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[10px] text-muted-foreground">
                          {conversation.activeRunCount > 0 ? (
                            <Icon className="size-3 shrink-0" icon="mdi:progress-clock" />
                          ) : null}
                          <span className="truncate">
                            {conversation.messageCount} {t('aiChat.messageCountLabel', '条消息')}{' '}
                            - {new Date(conversation.updatedAt).toLocaleString()}
                          </span>
                        </span>
                      </span>
                    </button>
                    <button
                      aria-label={t('aiChat.deleteConversation', '删除会话')}
                      className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-colors hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation()
                        void deleteConversation(conversation.id)
                      }}
                      type="button"
                    >
                      <Icon className="size-3.5" icon="mdi:trash-can-outline" />
                    </button>
                  </div>
                )
              })}
              {conversationHistoryLoading ? (
                <div className="px-2 py-2 text-center text-[10px] text-muted-foreground">
                  {t('aiChat.loadingConversationHistory', '正在加载历史记录...')}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}
