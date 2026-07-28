import { useCallback, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import { shouldRouteAssetPromptToFactory } from './chat-utils'
import type {
  AiConversationPurpose,
  AiGenerationMode,
  ChatImageAttachment,
} from './types'

export function useAiChatSubmit({
  generationMode,
  imageAttachment,
  input,
  loading,
  sendArticraftMessage,
  sendFactoryMessage,
  sendGeometryAgentMessage,
  sendImageTo3DMessage,
  sendPrimitiveMessage,
  setConversationHistoryOpen,
  setConversationPurpose,
  setImageAttachment,
  setModeMenuOpen,
}: {
  generationMode: AiGenerationMode
  imageAttachment?: ChatImageAttachment
  input: string
  loading: boolean
  sendArticraftMessage: (text: string, image?: ChatImageAttachment) => Promise<void>
  sendFactoryMessage: () => void
  sendGeometryAgentMessage: (overrideText?: string) => Promise<void>
  sendImageTo3DMessage: (text: string, image?: ChatImageAttachment) => Promise<void>
  sendPrimitiveMessage: (overrideText?: string) => Promise<void>
  setConversationHistoryOpen: Dispatch<SetStateAction<boolean>>
  setConversationPurpose: Dispatch<SetStateAction<AiConversationPurpose | undefined>>
  setImageAttachment: Dispatch<SetStateAction<ChatImageAttachment | undefined>>
  setModeMenuOpen: Dispatch<SetStateAction<boolean>>
}) {
  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim()
      const attachedImage =
        generationMode === 'primitive' || generationMode === 'geometry-agent'
          ? undefined
          : imageAttachment
      if (loading) return
      if (generationMode === 'image-to-3d' && !attachedImage) {
        await sendImageTo3DMessage(text, attachedImage)
        return
      }
      if ((!text && !attachedImage) || loading) return

      if (generationMode === 'image-to-3d') {
        await sendImageTo3DMessage(text, attachedImage)
        return
      }

      if (generationMode === 'articraft') {
        await sendArticraftMessage(text, attachedImage)
        return
      }

      if (generationMode === 'geometry-agent') {
        await sendGeometryAgentMessage(overrideText)
        return
      }

      await sendPrimitiveMessage(overrideText)
    },
    [
      generationMode,
      imageAttachment,
      input,
      loading,
      sendArticraftMessage,
      sendGeometryAgentMessage,
      sendImageTo3DMessage,
      sendPrimitiveMessage,
    ],
  )

  const selectConversationPurpose = useCallback(
    (purpose: AiConversationPurpose) => {
      setConversationPurpose(purpose)
      setConversationHistoryOpen(false)
      if (purpose === 'factory') {
        setModeMenuOpen(false)
        setImageAttachment(undefined)
      }
    },
    [setConversationHistoryOpen, setConversationPurpose, setImageAttachment, setModeMenuOpen],
  )

  const handleFactoryKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendFactoryMessage()
      }
    },
    [sendFactoryMessage],
  )

  const handleAssetSubmit = useCallback(() => {
    if (
      shouldRouteAssetPromptToFactory({
        generationMode,
        hasImageAttachment: Boolean(imageAttachment),
        text: input,
      })
    ) {
      setConversationPurpose('factory')
      setModeMenuOpen(false)
      setImageAttachment(undefined)
      void sendFactoryMessage()
      return
    }
    void sendMessage()
  }, [
    generationMode,
    imageAttachment,
    input,
    sendFactoryMessage,
    sendMessage,
    setConversationPurpose,
    setImageAttachment,
    setModeMenuOpen,
  ])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleAssetSubmit()
      }
    },
    [handleAssetSubmit],
  )

  return {
    handleAssetSubmit,
    handleFactoryKeyDown,
    handleKeyDown,
    selectConversationPurpose,
    sendMessage,
  }
}
