import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'

export function useRunEventSources({
  setLoading,
}: {
  setLoading: Dispatch<SetStateAction<boolean>>
}) {
  const activeRunEventSourcesRef = useRef<Map<string, EventSource>>(new Map())

  const hasRunEventSource = useCallback((runId: string) => {
    return activeRunEventSourcesRef.current.has(runId)
  }, [])

  const hasActiveRunEventSources = useCallback(() => {
    return activeRunEventSourcesRef.current.size > 0
  }, [])

  const getRunEventSourceIds = useCallback(() => {
    return [...activeRunEventSourcesRef.current.keys()]
  }, [])

  const trackRunEventSource = useCallback((runId: string, source: EventSource) => {
    activeRunEventSourcesRef.current.set(runId, source)
  }, [])

  const closeRunEventSource = useCallback((runId: string) => {
    activeRunEventSourcesRef.current.get(runId)?.close()
    activeRunEventSourcesRef.current.delete(runId)
    if (activeRunEventSourcesRef.current.size === 0) setLoading(false)
  }, [setLoading])

  const closeActiveRunSources = useCallback(() => {
    for (const source of activeRunEventSourcesRef.current.values()) {
      source.close()
    }
    activeRunEventSourcesRef.current.clear()
    setLoading(false)
  }, [setLoading])

  return {
    closeActiveRunSources,
    closeRunEventSource,
    getRunEventSourceIds,
    hasActiveRunEventSources,
    hasRunEventSource,
    trackRunEventSource,
  }
}
