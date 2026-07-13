import { Icon } from '@iconify/react'
import { Box, Factory } from 'lucide-react'
import type { AiConversationPurpose } from './types'

export function ConversationEmptyStates({
  isAssetConversation,
  isFactoryConversation,
  messageCount,
  onSelectPurpose,
  showConversationPicker,
}: {
  isAssetConversation: boolean
  isFactoryConversation: boolean
  messageCount: number
  onSelectPurpose: (purpose: AiConversationPurpose) => void
  showConversationPicker: boolean
}) {
  if (showConversationPicker) {
    return (
      <div className="flex min-h-full items-start justify-center px-2 pt-30 pb-8">
        <div className="w-full max-w-[22rem] space-y-6 text-center">
          <div className="space-y-1.5">
            <h3 className="font-medium text-base text-foreground">
              开始新的 <span className="font-semibold text-xl">AI</span> 会话
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground/75">
              选择任务类型，AI 会使用匹配的工作流继续处理。
            </p>
          </div>
          <button
            className="group w-full rounded-none border border-border/70 border-l-2 border-l-[#a684ff]/70 bg-background/40 p-4 text-left shadow-sm shadow-black/10 transition-colors hover:border-[#a684ff]/60 hover:bg-[#a684ff]/10"
            data-testid="ai-chat-factory-purpose"
            onClick={() => onSelectPurpose('factory')}
            type="button"
          >
            <div className="flex items-start gap-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#a684ff]/20 bg-[#a684ff]/5 text-[#a684ff]/60">
                <Factory aria-hidden className="size-5 opacity-80" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[15px] text-foreground">
                  创建与修改工厂
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground/75">
                  创建厂房、车间、房间、区域布局，并持续修改当前画布内容。
                </span>
              </span>
              <Icon
                className="mt-1 size-4 shrink-0 text-muted-foreground transition-colors group-hover:translate-x-0.5 group-hover:text-[#a684ff]"
                icon="mdi:chevron-right"
              />
            </div>
          </button>
          <button
            className="group w-full rounded-none border border-border/70 border-l-2 border-l-sky-400/70 bg-background/40 p-4 text-left shadow-sm shadow-black/10 transition-colors hover:border-sky-400/55 hover:bg-sky-400/10"
            onClick={() => onSelectPurpose('asset')}
            type="button"
          >
            <div className="flex items-start gap-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/5 text-sky-300/60">
                <Box aria-hidden className="size-5 opacity-80" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[15px] text-foreground">
                  创建设备与品件
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground/75">
                  生成单个设备、机器、部件或图生模型，可放到画布或保存为品件。
                </span>
              </span>
              <Icon
                className="mt-1 size-4 shrink-0 text-muted-foreground transition-colors group-hover:translate-x-0.5 group-hover:text-sky-300"
                icon="mdi:chevron-right"
              />
            </div>
          </button>
        </div>
      </div>
    )
  }

  if (isAssetConversation && messageCount === 0) {
    return (
      <div className="flex min-h-[15rem] flex-col items-center justify-center px-4 py-8 text-center">
        <span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-sky-400/25 bg-sky-400/10 text-sky-300">
          <Box aria-hidden className="size-5" />
        </span>
        <p className="text-xs font-medium text-foreground">已准备生成设备</p>
        <p className="mt-1 max-w-[15rem] text-[11px] leading-relaxed text-muted-foreground">
          在下方描述你的需求，AI 会创建可放置或可保存的品件。
        </p>
      </div>
    )
  }

  if (isFactoryConversation && messageCount === 0) {
    return (
      <div className="flex min-h-[15rem] flex-col items-center justify-center px-4 py-8 text-center">
        <span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-[#a684ff]/25 bg-[#a684ff]/10 text-[#a684ff]">
          <Factory aria-hidden className="size-5" />
        </span>
        <p className="text-xs font-medium text-foreground">已准备搭建工厂布局</p>
        <p className="mt-1 max-w-[15rem] text-[11px] leading-relaxed text-muted-foreground">
          在下方描述厂房、车间、房间，或需要修改当前画布的内容。
        </p>
      </div>
    )
  }

  return null
}
