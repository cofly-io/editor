'use client'

import { nodeRegistry, useScene } from '@pascal-app/core'
import { useEffect, useState } from 'react'
import { NodeRenderer } from './node-renderer'

export const SceneRenderer = () => {
  const rootNodes = useScene((state) => state.rootNodeIds)
  const [, setRegistrySize] = useState(() => nodeRegistry.size)

  useEffect(() => {
    let previousSize = nodeRegistry.size
    const interval = window.setInterval(() => {
      const nextSize = nodeRegistry.size
      if (nextSize === previousSize) return
      previousSize = nextSize
      setRegistrySize(nextSize)
    }, 250)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <group name="scene-renderer">
      {rootNodes.map((nodeId) => (
        <NodeRenderer key={nodeId} nodeId={nodeId} />
      ))}
    </group>
  )
}
