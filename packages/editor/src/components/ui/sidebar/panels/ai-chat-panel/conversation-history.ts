import { t } from '../../../../../i18n'
import type { AiConversationSummary } from './types'

export function conversationHistoryIcon(conversation: AiConversationSummary) {
  if (conversation.conversationPurpose === 'factory') {
    return {
      icon: 'mdi:factory',
      label: t('aiChat.factoryConversation', '工厂会话'),
      className: 'border-[#a684ff]/20 bg-[#a684ff]/5 text-[#a684ff]/70',
    }
  }
  if (conversation.conversationPurpose === 'asset') {
    return {
      icon: 'mdi:robot-industrial-outline',
      label: t('aiChat.assetConversation', '设备会话'),
      className: 'border-sky-400/20 bg-sky-400/5 text-sky-300/70',
    }
  }
  return {
    icon: 'mdi:chat-outline',
    label: t('aiChat.conversation', '会话'),
    className: 'border-border/60 bg-accent/35 text-muted-foreground',
  }
}
