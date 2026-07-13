'use client'

import { useEffect, useRef, useState } from 'react'

export function useFloorplanSurfaceSize() {
  const viewportHostRef = useRef<HTMLDivElement>(null)
  const [surfaceSize, setSurfaceSize] = useState({ width: 1, height: 1 })

  useEffect(() => {
    const host = viewportHostRef.current
    if (!host) {
      return
    }

    const updateSize = () => {
      const rect = host.getBoundingClientRect()
      setSurfaceSize({
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, 1),
      })
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(host)
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return {
    surfaceSize,
    viewportHostRef,
  }
}
