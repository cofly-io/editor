'use client'

import {
  type AnyNodeId,
  nodeRegistry,
  StairOpeningSystem,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { Html } from '@react-three/drei'
import { Canvas, extend, type ThreeToJSXElements, useFrame, useThree } from '@react-three/fiber'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { PERF_OVERLAY_ENABLED, pushGpuSample } from '../../lib/gpu-perf'
import { applyIsolation, clearIsolation } from '../../lib/isolation'
import type { ColorPreset, RenderShading } from '../../lib/materials'
import { ensureObjectWebGPUCompatibleGeometry } from '../../lib/safe-geometry'
import { assessSceneComplexity } from '../../lib/scene-complexity'
import { getSceneTheme } from '../../lib/scene-themes'
import { installEmptyDrawGuard } from '../../lib/webgpu-draw-guard'
import { isGpuOutOfMemoryError } from '../../lib/webgpu-health'
import useViewer, { type RenderContext } from '../../store/use-viewer'
import { FloorElevationSystem } from '../../systems/floor-elevation/floor-elevation-system'
import { GeometrySystem } from '../../systems/geometry/geometry-system'
import { LevelPresentationOverlay } from '../../systems/level/level-presentation-overlay'
import { ErrorBoundary } from '../error-boundary'
import { SceneRenderer } from '../renderers/scene-renderer'
import FrameLimiter from './frame-limiter'
import { Lights } from './lights'
import { PerfMonitor } from './perf-monitor'
import PostProcessing, { DEFAULT_HOVER_STYLES, type HoverStyles } from './post-processing'
import { RegisteredSystems } from './registered-systems'
import { SceneBvh } from './scene-bvh'
import { SelectionManager } from './selection-manager'
import { ViewerCamera } from './viewer-camera'

declare module '@react-three/fiber' {
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}

extend(THREE as any)

// R3F's <Canvas> useLayoutEffect has no deps, so any re-render (theme switch,
// parent re-render, StrictMode double-mount) re-invokes `configure()`. With a
// sync `gl` factory that's harmless — the renderer is created once and reused.
// With an async factory (WebGPURenderer needs `await init()`), two configure
// calls can race: both see `state.gl == null` and both create a renderer. The
// first to resolve gets `setSize`/`setDpr` called on it; the second overwrites
// `state.gl` but R3F's store already holds the new size/dpr, so the new
// renderer is never resized and stays at the canvas's 300×150 default.
//
// Caching by canvas guarantees both branches return the same instance, so
// "duplicate" configure calls become no-ops on an already-sized renderer.
// We cache the in-flight Promise (not just the resolved renderer) so two
// concurrent configure() calls await the same init instead of creating two
// renderers in parallel and only caching the second.
const WEBGPU_RENDERER_CACHE = new WeakMap<HTMLCanvasElement, Promise<THREE.WebGPURenderer>>()
const FORCE_WEBGL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_VIEWER_FORCE_WEBGL === '1'
const SCENE_READY_SETTLED_FRAMES = 2
const SCENE_READY_MAX_WAIT_FRAMES = 180
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

/**
 * Monitors the WebGPU device for loss / uncaptured errors and logs them.
 * WebGPU device loss can happen when:
 *  - Tab is backgrounded and OS reclaims GPU
 *  - Driver crash or GPU reset
 *  - Browser security policy kills the context
 */
type WebGPUDeviceLossInfo = {
  reason?: string
  message?: string
}

type WebGPUDeviceLike = {
  lost: Promise<WebGPUDeviceLossInfo>
  label?: string
  features?: Set<string>
  addEventListener?: (type: string, listener: EventListener) => void
  removeEventListener?: (type: string, listener: EventListener) => void
}

function GPUDeviceWatcher() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const backend = (gl as any).backend
    const device = backend?.device as WebGPUDeviceLike | undefined

    if (!device) {
      console.warn('[viewer] No WebGPU device on backend — running on a fallback renderer.', {
        backend: backend?.constructor?.name ?? 'unknown',
        rendererType: (gl as any).constructor?.name ?? 'unknown',
      })
      return
    }

    console.log('[viewer] WebGPU device ready', {
      label: device.label,
      features: Array.from(device.features ?? []),
    })

    let active = true

    device.lost.then((info: WebGPUDeviceLossInfo) => {
      if (!active) return
      const message = info.message || 'WebGPU 设备已丢失，需要重新加载页面。'
      useViewer.getState().setRendererHealth('lost', message)
      console.error(
        `[viewer] WebGPU device lost: reason="${info.reason ?? 'unknown'}", message="${info.message ?? ''}". ` +
          'The page must be reloaded to recover the GPU context.',
      )
    })

    // Uncaptured errors are normally silent (only console-warned by Chrome at
    // best). Pipe them to console.error so silent mobile crashes show up.
    const onUncapturedError = (event: any) => {
      const error = event?.error
      if (isGpuOutOfMemoryError(error)) {
        useViewer.getState().setRendererHealth('lost', 'GPU 显存不足，渲染和物品放置已停止。')
      } else {
        useViewer.getState().setRendererHealth('degraded', error?.message ?? null)
      }
      event?.preventDefault?.()
      console.error('[viewer] WebGPU uncaptured error:', error?.message, error)
    }
    device.addEventListener?.('uncapturederror', onUncapturedError)

    return () => {
      active = false
      device.removeEventListener?.('uncapturederror', onUncapturedError)
    }
  }, [gl])

  return null
}

function RendererSizeSync() {
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const setSize = useThree((state) => state.setSize)
  const dpr = useThree((state) => state.viewport.dpr)
  const invalidate = useThree((state) => state.invalidate)
  const shading = useViewer((state) => state.shading)

  useLayoutEffect(() => {
    let frame: number | null = null

    const syncRendererSize = () => {
      frame = null

      const canvas = gl.domElement
      const rect = canvas.getBoundingClientRect()
      const parentRect = canvas.parentElement?.getBoundingClientRect()
      const width = Math.round(rect.width || parentRect?.width || size.width)
      const height = Math.round(rect.height || parentRect?.height || size.height)

      if (width < 1 || height < 1) return

      if (Math.round(size.width) !== width || Math.round(size.height) !== height) {
        setSize(width, height)
      }

      gl.setPixelRatio(dpr)
      gl.setSize(width, height, false)
      const bufferWidth = Math.max(1, Math.round(width * dpr))
      const bufferHeight = Math.max(1, Math.round(height * dpr))
      if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth
        canvas.height = bufferHeight
        gl.setSize(width, height, false)
      }
      invalidate()
    }

    const scheduleSync = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(syncRendererSize)
    }

    // Shading rebuilds the WebGPU pipeline, which must inherit the current Canvas size.
    void shading
    scheduleSync()

    const observer = new ResizeObserver(scheduleSync)
    observer.observe(gl.domElement)
    if (gl.domElement.parentElement) {
      observer.observe(gl.domElement.parentElement)
    }
    window.addEventListener('resize', scheduleSync)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', scheduleSync)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [dpr, gl, invalidate, setSize, shading, size.height, size.width])

  return null
}

function SceneComplexityController() {
  useEffect(() => {
    let frame: number | null = null

    const sync = () => {
      frame = null
      const complexity = assessSceneComplexity(useScene.getState().nodes)
      useViewer.getState().setSceneComplexity(complexity)
    }
    const schedule = () => {
      if (frame !== null) return
      frame = requestAnimationFrame(sync)
    }

    sync()
    const unsubscribe = useScene.subscribe((state, previous) => {
      if (state.nodes !== previous.nodes) schedule()
    })
    return () => {
      unsubscribe()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])

  return null
}

function RendererRecoveryOverlay() {
  const health = useViewer((state) => state.rendererHealth)
  const message = useViewer((state) => state.rendererHealthMessage)
  if (health !== 'lost') return null

  return (
    <Html fullscreen zIndexRange={[100_000, 100_000]}>
      <div
        style={{
          alignItems: 'center',
          background: 'rgba(10, 10, 12, 0.86)',
          color: '#f8fafc',
          display: 'flex',
          inset: 0,
          justifyContent: 'center',
          padding: 24,
          pointerEvents: 'auto',
          position: 'absolute',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <strong style={{ display: 'block', fontSize: 18, marginBottom: 10 }}>
            GPU 渲染已停止
          </strong>
          <p style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>
            {message || 'WebGPU 设备不可用。重新加载页面后可以继续编辑。'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#f8fafc',
              border: 0,
              borderRadius: 6,
              color: '#111827',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              padding: '9px 16px',
            }}
            type="button"
          >
            重新加载
          </button>
        </div>
      </div>
    </Html>
  )
}

function ToneMappingExposure() {
  const sceneTheme = useViewer((state) => state.sceneTheme)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    gl.toneMappingExposure = getSceneTheme(sceneTheme).toneMappingExposure
    invalidate()
  }, [gl, invalidate, sceneTheme])

  return null
}

function ShadowMapSync() {
  const shadows = useViewer((state) => state.shadows)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const shadowMap = (gl as any).shadowMap
    if (!shadowMap) return

    shadowMap.enabled = shadows
    if (shadows) {
      shadowMap.needsUpdate = true
    }
    invalidate()
  }, [gl, invalidate, shadows])

  return null
}

function hasPendingSceneBuildWork() {
  const { dirtyNodes, nodes } = useScene.getState()

  for (const id of dirtyNodes) {
    const node = nodes[id]
    if (!node) continue
    const def = nodeRegistry.get(node.type)
    if (def?.geometry || def?.capabilities?.floorPlaced || DIRTY_BUILD_KINDS.has(node.type)) {
      return true
    }
  }

  return false
}

function hasCommittedSceneRoot() {
  const { nodes, rootNodeIds } = useScene.getState()
  if (rootNodeIds.length === 0) return Object.keys(nodes).length === 0
  return rootNodeIds.some((id) => sceneRegistry.nodes.has(id))
}

function SceneReadyTracker({
  onSceneReadyChange,
  sceneReadyKey,
}: {
  onSceneReadyChange?: (ready: boolean) => void
  sceneReadyKey?: string | number | null
}) {
  const readyRef = useRef(false)
  const settledFramesRef = useRef(0)
  const waitedFramesRef = useRef(0)
  const onSceneReadyChangeRef = useRef(onSceneReadyChange)

  useEffect(() => {
    onSceneReadyChangeRef.current = onSceneReadyChange
  }, [onSceneReadyChange])

  useEffect(() => {
    void sceneReadyKey
    readyRef.current = false
    settledFramesRef.current = 0
    waitedFramesRef.current = 0
    onSceneReadyChangeRef.current?.(false)
  }, [sceneReadyKey])

  useFrame(() => {
    if (!(onSceneReadyChangeRef.current && !readyRef.current)) return

    waitedFramesRef.current += 1
    if (
      waitedFramesRef.current < SCENE_READY_MAX_WAIT_FRAMES &&
      (!hasCommittedSceneRoot() || hasPendingSceneBuildWork())
    ) {
      settledFramesRef.current = 0
      return
    }

    settledFramesRef.current += 1
    if (settledFramesRef.current < SCENE_READY_SETTLED_FRAMES) return

    readyRef.current = true
    onSceneReadyChangeRef.current(true)
  }, 10)

  return null
}

function SceneGeometryWarmup({ sceneReadyKey }: { sceneReadyKey?: string | number | null }) {
  const scene = useThree((state) => state.scene)
  const warmedKeyRef = useRef<{ done: boolean; key?: string | number | null }>({
    done: false,
  })

  useEffect(() => {
    warmedKeyRef.current = { done: false, key: sceneReadyKey }
  }, [sceneReadyKey])

  useFrame(() => {
    if (warmedKeyRef.current.done && warmedKeyRef.current.key === sceneReadyKey) return
    if (!hasCommittedSceneRoot() || hasPendingSceneBuildWork()) return
    ensureObjectWebGPUCompatibleGeometry(scene)
    warmedKeyRef.current = { done: true, key: sceneReadyKey }
  }, 9)

  return null
}

interface ViewerProps {
  children?: React.ReactNode
  hoverStyles?: HoverStyles
  selectionManager?: 'default' | 'custom'
  activeFrameLoop?: boolean
  perf?: boolean
  useBvh?: boolean
  renderContext?: RenderContext
  transparent?: boolean
  defaultRender?: {
    shading?: RenderShading
    textures?: boolean
    colorPreset?: ColorPreset
  }
  /**
   * Visibility filter on the live canvas. When non-null, every registered
   * node group whose id is not in `isolate` (or in the isolated set's
   * ancestor / descendant closure) is hidden. Pass `null` (or omit) to
   * clear. Powers the unified preset-capture flow (community modal sets
   * this to the subtree it wants to thumbnail) and is the building block
   * for a future focus-mode UX.
   */
  isolate?: AnyNodeId[] | null
  /**
   * Host-controlled key for scene readiness. Change it whenever a new scene
   * graph is being loaded; the viewer will report not-ready until the graph is
   * mounted, build systems have had a frame to settle, and one rendered frame
   * has presented the new content.
   */
  sceneReadyKey?: string | number | null
  onSceneReadyChange?: (ready: boolean) => void
  /**
   * Skip the TSL post-processing pipeline (SSGI/denoise/ink/outline) and render
   * the scene directly. For headless/capture surfaces (the bake page) where
   * frame quality is irrelevant: on a software-rasterised worker the pipeline
   * consumes the whole CPU budget and bakes time out. Equivalent to the
   * `?disable=postFx` diagnostic URL flag, but host-controlled.
   */
  disablePostFx?: boolean
}

/** Imperative handle exposed via `ref` on `<Viewer>`. */
export type ViewerHandle = {
  /**
   * Apply / clear the same visibility filter as the `isolate` prop. Useful
   * for transient cases (a temporary hover-to-isolate UX) where holding
   * the value in React state would be over-engineering. Passing `null`
   * clears.
   */
  setIsolated(ids: AnyNodeId[] | null): void
}

const Viewer = forwardRef<ViewerHandle, ViewerProps>(function Viewer(
  {
    children,
    hoverStyles = DEFAULT_HOVER_STYLES,
    selectionManager = 'default',
    activeFrameLoop = false,
    perf = false,
    useBvh = true,
    renderContext = 'authoring',
    transparent,
    defaultRender,
    isolate,
    sceneReadyKey,
    onSceneReadyChange,
    disablePostFx = false,
  },
  ref,
) {
  useImperativeHandle(
    ref,
    () => ({
      setIsolated: (ids) => applyIsolation(ids),
    }),
    [],
  )

  // Track the most recently-applied isolation so the cleanup path can
  // restore visibility even if the prop is removed while the component is
  // still mounted. `clearIsolation()` is a no-op when nothing was applied.
  const isolateRef = useRef<AnyNodeId[] | null | undefined>(undefined)
  useEffect(() => {
    isolateRef.current = isolate ?? null
    applyIsolation(isolate ?? null)
    return () => {
      // Only clear if this effect was the one that applied — protects
      // against a parent unmount racing with a setIsolated() consumer.
      if (isolateRef.current === isolate) clearIsolation()
    }
  }, [isolate])

  const isDark = useViewer((state) => getSceneTheme(state.sceneTheme).appearance === 'dark')
  const transparentBackground = useViewer((state) => state.transparentBackground)
  const sceneMaxDpr = useViewer((state) => state.sceneComplexity.maxDpr)
  useLayoutEffect(() => {
    if (transparent === undefined) return

    useViewer.getState().setTransparentBackground(transparent)
    return () => {
      useViewer.getState().setTransparentBackground(false)
    }
  }, [transparent])

  const defaultShading = defaultRender?.shading
  const defaultTextures = defaultRender?.textures
  const defaultColorPreset = defaultRender?.colorPreset
  const hasDefaultRender = defaultRender != null
  useEffect(() => {
    const ctx = renderContext
    useViewer.getState().setRenderContext(ctx)
    const { shading, shadingByContext, setShading } = useViewer.getState()
    setShading(shadingByContext[ctx] ?? defaultShading ?? shading)

    if (!hasDefaultRender || typeof window === 'undefined') return

    let persistedState: Record<string, unknown> = {}
    const rawPreferences = window.localStorage.getItem('viewer-preferences')
    if (rawPreferences) {
      try {
        const parsed = JSON.parse(rawPreferences)
        if (
          parsed &&
          typeof parsed === 'object' &&
          parsed.state &&
          typeof parsed.state === 'object'
        ) {
          persistedState = parsed.state as Record<string, unknown>
        }
      } catch {}
    }

    if (defaultTextures !== undefined && !('textures' in persistedState)) {
      useViewer.getState().setTextures(defaultTextures)
    }
    if (defaultColorPreset && !('colorPreset' in persistedState)) {
      useViewer.getState().setColorPreset(defaultColorPreset)
    }
  }, [defaultColorPreset, defaultShading, defaultTextures, hasDefaultRender, renderContext])

  // Coarse-pointer devices (phones/tablets) get a tighter DPR ceiling to keep
  // fragment-shader cost down — saves another ~30% over 1.5x on high-DPI mobile.
  // Desktops (fine pointer) keep the original 1.5 cap.
  const deviceMaxDpr =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 1.25 : 1.5
  const maxDpr = Math.min(deviceMaxDpr, sceneMaxDpr)
  return (
    <Canvas
      camera={{ position: [50, 50, 50], fov: 50 }}
      className={`[&_canvas]:h-full [&_canvas]:w-full transition-colors duration-700 ${
        transparentBackground ? 'bg-transparent' : isDark ? 'bg-[#1f2433]' : 'bg-[#fafafa]'
      }`}
      dpr={[1, maxDpr]}
      frameloop="never"
      gl={
        ((props: { canvas?: HTMLCanvasElement }) => {
          const canvas = props.canvas
          const cached = canvas ? WEBGPU_RENDERER_CACHE.get(canvas) : undefined
          if (cached) return cached
          const promise = (async () => {
            try {
              const renderer = new THREE.WebGPURenderer({
                ...(props as any),
                alpha: true,
                forceWebGL: FORCE_WEBGL,
              })
              renderer.toneMapping = THREE.ACESFilmicToneMapping
              renderer.toneMappingExposure = getSceneTheme(
                useViewer.getState().sceneTheme,
              ).toneMappingExposure
              await renderer.init()
              installEmptyDrawGuard(renderer)
              return renderer
            } catch (err) {
              // Drop the failed promise from the cache so a future Canvas
              // mount on the same DOM can retry instead of inheriting the
              // rejection forever.
              if (canvas) WEBGPU_RENDERER_CACHE.delete(canvas)
              if (isGpuOutOfMemoryError(err)) {
                useViewer
                  .getState()
                  .setRendererHealth('lost', 'GPU 显存不足，渲染和物品放置已停止。')
              }
              console.error('[viewer] WebGPURenderer init failed', err)
              throw err
            }
          })()
          if (canvas) WEBGPU_RENDERER_CACHE.set(canvas, promise)
          return promise
        }) as any
      }
      resize={{
        debounce: 100,
      }}
      shadows={{
        type: THREE.PCFShadowMap,
        enabled: true,
      }}
    >
      <FrameLimiter active={activeFrameLoop} fps={50} />
      <SceneComplexityController />
      <ViewerCamera />
      <GPUDeviceWatcher />
      <RendererSizeSync />
      <RendererRecoveryOverlay />
      <ToneMappingExposure />
      <ShadowMapSync />
      <SceneGeometryWarmup sceneReadyKey={sceneReadyKey} />
      <SceneReadyTracker onSceneReadyChange={onSceneReadyChange} sceneReadyKey={sceneReadyKey} />

      <ErrorBoundary fallback={null} scope="viewer-scene">
        {/* <directionalLight position={[10, 10, 5]} intensity={0.5} castShadow
          /> */}
        <Lights />
        {useBvh ? (
          <SceneBvh>
            <SceneRenderer />
          </SceneBvh>
        ) : (
          <SceneRenderer />
        )}

        {/* Generic slab-elevation lift for any kind that declares
            `capabilities.floorPlaced`. Runs at frame priority 1 so it
            lands its mesh.position.y override before the priority-2
            systems below clear the dirty mark. */}
        <FloorElevationSystem />
        {/* Generic geometry rebuild loop for any registered kind that
            ships `def.geometry`. Reads dirtyNodes, calls the kind's pure
            builder, swaps the registered group's children. See
            wiki/architecture/node-definitions.md. */}
        <GeometrySystem />
        {/* Automated stair opening sync — updates slab/ceiling cutouts
            whenever stairs, slabs, or levels change. */}
        <StairOpeningSystem />
        <LevelPresentationOverlay />
        {/* Mounts systems contributed by registry-backed kinds. Each
            kind's `def.system` is loaded via lazy() and rendered here,
            ordered by `system.priority`. */}
        <RegisteredSystems />
        <PostProcessing disablePostFx={disablePostFx} hoverStyles={hoverStyles} />
        {selectionManager === 'default' && <SelectionManager />}
        {(perf || PERF_OVERLAY_ENABLED) && <PerfMonitor />}
        {children}
      </ErrorBoundary>
    </Canvas>
  )
})

const DebugRenderer = () => {
  useFrame(({ gl, scene, camera }) => {
    const submittedAt = PERF_OVERLAY_ENABLED ? performance.now() : 0
    gl.render(scene, camera)
    if (PERF_OVERLAY_ENABLED) {
      const queue = (gl as any).backend?.device?.queue as
        | { onSubmittedWorkDone?: () => Promise<void> }
        | undefined
      queue?.onSubmittedWorkDone?.().then(() => {
        pushGpuSample(performance.now() - submittedAt)
      })
    }
  })
  return null
}

export default Viewer
