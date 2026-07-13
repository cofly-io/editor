import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import {
  AI_IMAGE_MAX_BYTES,
  AI_IMAGE_TYPES,
  readFileAsDataUrl,
} from './chat-utils'
import type { ChatImageAttachment, ChatMessage } from './types'

export function useImageAttachment({
  setImageAttachment,
  setMessages,
}: {
  setImageAttachment: Dispatch<SetStateAction<ChatImageAttachment | undefined>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}) {
  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleImageSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (!file) return
      if (!AI_IMAGE_TYPES.has(file.type)) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Please upload a PNG, JPG, or WebP image.' },
        ])
        return
      }
      if (file.size > AI_IMAGE_MAX_BYTES) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Image is too large. Please use an image under 8MB.' },
        ])
        return
      }
      try {
        setImageAttachment({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: await readFileAsDataUrl(file),
        })
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Failed to read image: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ])
      }
    },
    [setImageAttachment, setMessages],
  )

  return { handleImageSelected, imageInputRef }
}
