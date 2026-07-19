import { nodeRegistry, sceneRegistry, useInteractive, useScene } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import useViewer from '../../store/use-viewer'

type FrameLimiterProps = {
  fps?: number
  idleFps?: number
  active?: boolean
}

const WARMUP_MS = 5_000
const DIRTY_BUILD_KINDS = new Set([
  'ceiling',
  'door',
  'item',
  'roof',
  'roof-segment',
  'stair',
  'stair-segment',
  'wall',
  'window',
])

const FrameLimiter: React.FC<FrameLimiterProps> = ({ fps = 50, idleFps = 4, active = false }) => {
  const { advance, set, frameloop: initFrameloop } = useThree()

  useLayoutEffect(() => {
    let elapsed = 0
    let then = 0
    let i = 0
    let raf: number | null = null
    const mountedAt = performance.now()
    function tick(t: DOMHighResTimeStamp) {
      raf = requestAnimationFrame(tick)
      if (useViewer.getState().rendererHealth === 'lost') {
        then = t
        return
      }
      elapsed = t - then
      const interval = 1000 / getTargetFps(t, mountedAt, fps, idleFps, active)
      if (elapsed > interval) {
        advance(i)
        i += elapsed / 1000 - (elapsed % interval) / 1000
        then = t - (elapsed % interval)
      }
    }
    // rAF can stall while a tab is hidden, unfocused, or occluded. With the
    // default loop disabled, force one current frame as soon as it resumes.
    function kick() {
      i += 1 / 1000
      advance(i)
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') kick()
    }
    // Set frameloop to never, it will shut down the default render loop
    set({ frameloop: 'never' })
    // Kick off custom render loop
    raf = requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', kick)
    window.addEventListener('pageshow', kick)
    // Restore initial setting
    return () => {
      if (raf) {
        cancelAnimationFrame(raf)
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', kick)
      window.removeEventListener('pageshow', kick)
      set({ frameloop: initFrameloop })
    }
  }, [fps, idleFps, active, advance, set, initFrameloop])

  return null
}

function getTargetFps(
  now: DOMHighResTimeStamp,
  mountedAt: DOMHighResTimeStamp,
  activeFps: number,
  idleFps: number,
  active: boolean,
) {
  if (typeof document !== 'undefined' && document.hidden) return 1
  if (now - mountedAt < WARMUP_MS) return activeFps
  if (active) return activeFps

  const viewer = useViewer.getState()
  if (viewer.cameraDragging || viewer.inputDragging) return activeFps

  if (hasMountedDirtyBuildWork()) return activeFps

  const interactive = useInteractive.getState()
  if (
    Object.keys(interactive.doorAnimations).length > 0 ||
    Object.keys(interactive.windowAnimations).length > 0 ||
    Object.values(interactive.elevators).some((elevator) => elevator.phase !== 'idle')
  ) {
    return activeFps
  }

  return idleFps
}

function hasMountedDirtyBuildWork() {
  const { dirtyNodes, nodes } = useScene.getState()
  for (const id of dirtyNodes) {
    const node = nodes[id]
    if (!node) continue
    const def = nodeRegistry.get(node.type)
    if (!(def?.geometry || def?.capabilities?.floorPlaced || DIRTY_BUILD_KINDS.has(node.type))) {
      continue
    }
    if (sceneRegistry.nodes.has(id)) return true
  }
  return false
}

export default FrameLimiter
