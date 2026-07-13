import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { useFactoryE2eBridge } from './use-factory-e2e-bridge'

export function useAiChatUiEffects({
  inputRef,
  loading,
  setModeMenuOpen,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  loading: boolean
  setModeMenuOpen: Dispatch<SetStateAction<boolean>>
}) {
  useEffect(() => {
    inputRef.current?.focus()
  }, [inputRef])

  useFactoryE2eBridge()

  useEffect(() => {
    if (loading) setModeMenuOpen(false)
  }, [loading, setModeMenuOpen])
}
