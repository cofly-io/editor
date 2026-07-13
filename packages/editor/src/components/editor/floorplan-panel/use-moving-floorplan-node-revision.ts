'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useMovingFloorplanNodeRevision() {
  const [movingFloorplanNodeRevision, setMovingFloorplanNodeRevision] = useState(0)
  const movingFloorplanNodeRefreshFrameRef = useRef<number | null>(null)

  const bumpMovingFloorplanNodeRevision = useCallback(() => {
    setMovingFloorplanNodeRevision((current) => current + 1)
  }, [])

  const scheduleMovingFloorplanNodeRefresh = useCallback(() => {
    if (movingFloorplanNodeRefreshFrameRef.current !== null) {
      return
    }

    movingFloorplanNodeRefreshFrameRef.current = window.requestAnimationFrame(() => {
      movingFloorplanNodeRefreshFrameRef.current = null
      setMovingFloorplanNodeRevision((current) => current + 1)
    })
  }, [])

  useEffect(
    () => () => {
      if (movingFloorplanNodeRefreshFrameRef.current !== null) {
        window.cancelAnimationFrame(movingFloorplanNodeRefreshFrameRef.current)
        movingFloorplanNodeRefreshFrameRef.current = null
      }
    },
    [],
  )

  return {
    bumpMovingFloorplanNodeRevision,
    movingFloorplanNodeRevision,
    scheduleMovingFloorplanNodeRefresh,
  }
}
