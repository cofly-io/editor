import { useScene } from '@pascal-app/core'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { drainQueueWaitSamples } from '../../lib/gpu-perf'
import { type PerfDistribution, summarizePerfSamples } from '../../lib/perf-statistics'
import useViewer from '../../store/use-viewer'

const SAMPLE_INTERVAL = 0.5 // seconds between display updates

type PerfStats = {
  fps: number
  cpu: PerfDistribution
  queueWait: PerfDistribution
  drawCalls: number
  triangles: number
  dirty: number
  dirtyDetail: string
  triangleDetail: string
  meshes: number
  lines: number
  sprites: number
  lights: number
  complexityTier: string
  weightedCost: number
  dpr: number
}

type PerfDebugWindow = Window & {
  __PASCAL_PERF_SNAPSHOT__?: PerfStats
}

const EMPTY_DISTRIBUTION: PerfDistribution = {
  average: 0,
  p50: 0,
  p95: 0,
  max: 0,
}

export const PerfMonitor = () => {
  const [stats, setStats] = useState<PerfStats>({
    fps: 0,
    cpu: EMPTY_DISTRIBUTION,
    queueWait: EMPTY_DISTRIBUTION,
    drawCalls: 0,
    triangles: 0,
    dirty: 0,
    dirtyDetail: '',
    triangleDetail: '',
    meshes: 0,
    lines: 0,
    sprites: 0,
    lights: 0,
    complexityTier: 'normal',
    weightedCost: 0,
    dpr: 1,
  })
  const frameCount = useRef(0)
  const elapsed = useRef(0)
  const frameMsSamples = useRef<number[]>([])
  // Carry the previous tick's reading forward when no fresh samples arrive,
  // so the display doesn't flicker to "—" on slow resolve windows.
  const lastQueueWait = useRef(EMPTY_DISTRIBUTION)

  // Take ownership of info reset. The custom RenderPipeline.render() path
  // we use in post-processing doesn't trigger three.js's automatic per-frame
  // info reset, so calls/triangles accumulate across frames and the display
  // shows lifetime totals. Disabling autoReset and explicitly resetting at
  // each window gives true per-frame averages.
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!gl?.info) return
    const previousAutoReset = gl.info.autoReset
    gl.info.autoReset = false
    gl.info.reset()
    return () => {
      gl.info.autoReset = previousAutoReset
    }
  }, [gl])

  useFrame(({ gl, scene, clock }, delta) => {
    frameCount.current++
    frameMsSamples.current.push(delta * 1000)
    const now = clock.elapsedTime
    const dt = now - elapsed.current

    if (dt >= SAMPLE_INTERVAL) {
      const fps = Math.round(frameCount.current / dt)
      const cpu = summarizePerfSamples(frameMsSamples.current)
      frameMsSamples.current = []
      const info = gl.info
      // calls/triangles have been accumulating since the last reset (start of
      // window). Divide by frameCount to get a per-frame average.
      const totalCalls = info.render?.calls ?? 0
      const totalTriangles = info.render?.triangles ?? 0
      const drawCalls = Math.round(totalCalls / Math.max(1, frameCount.current))
      const triangles = totalTriangles / Math.max(1, frameCount.current)
      info.reset()
      const sceneState = useScene.getState()
      const dirty = sceneState.dirtyNodes.size
      let dirtyDetail = ''
      if (dirty > 0) {
        const counts = new Map<string, number>()
        for (const id of sceneState.dirtyNodes) {
          const type = sceneState.nodes[id]?.type ?? 'missing'
          counts.set(type, (counts.get(type) ?? 0) + 1)
        }
        dirtyDetail = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => `${count} ${type}`)
          .join(', ')
      }

      const trianglesByMesh = new Map<string, number>()

      // Count visible drawables by type so we can match scene contents
      // against the renderer's draw count and find hidden contributors.
      let meshes = 0
      let lines = 0
      let sprites = 0
      let lights = 0
      scene.traverse((obj: any) => {
        if (!obj.visible) return
        if (obj.isMesh) {
          meshes++
          const position = obj.geometry?.getAttribute?.('position')
          if (position) {
            const indexCount = obj.geometry.index?.count
            const geometryTriangles = (indexCount ?? position.count) / 3
            const instanceCount = obj.isInstancedMesh ? obj.count : 1
            const key = obj.name || obj.parent?.name || obj.constructor?.name || 'unnamed mesh'
            trianglesByMesh.set(
              key,
              (trianglesByMesh.get(key) ?? 0) + geometryTriangles * instanceCount,
            )
          }
        } else if (obj.isLine || obj.isLineSegments || obj.isLineLoop) lines++
        else if (obj.isSprite) sprites++
        else if (obj.isLight) lights++
      })

      // Queue-completion samples are not GPU timestamps; they reveal backlog
      // pressure and are kept separate from frame-time measurements.
      const samples = drainQueueWaitSamples()
      if (samples.length > 0) {
        lastQueueWait.current = summarizePerfSamples(samples)
      }

      const complexity = useViewer.getState().sceneComplexity
      const triangleDetail = [...trianglesByMesh.entries()]
        .sort(([, left], [, right]) => right - left)
        .slice(0, 6)
        .map(([name, count]) => `${name}: ${(count / 1000).toFixed(1)}k`)
        .join(', ')
      const nextStats = {
        fps,
        cpu,
        queueWait: lastQueueWait.current,
        drawCalls,
        triangles,
        dirty,
        dirtyDetail,
        triangleDetail,
        meshes,
        lines,
        sprites,
        lights,
        complexityTier: complexity.tier,
        weightedCost: complexity.weightedCost,
        dpr: gl.getPixelRatio(),
      }
      setStats(nextStats)
      ;(window as PerfDebugWindow).__PASCAL_PERF_SNAPSHOT__ = nextStats
      frameCount.current = 0
      elapsed.current = now
    }
  })

  return (
    <Html
      position={[0, 0, 0]}
      style={{ position: 'fixed', top: 8, left: 8, pointerEvents: 'none' }}
      zIndexRange={[100, 100]}
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 11,
          lineHeight: 1.5,
          color: stats.fps < 30 ? '#f87171' : stats.fps < 55 ? '#fbbf24' : '#4ade80',
          background: 'rgba(0,0,0,0.7)',
          borderRadius: 6,
          padding: '6px 10px',
          whiteSpace: 'pre',
        }}
      >
        {[
          `FPS    ${stats.fps}`,
          `CPU    ${stats.cpu.average.toFixed(1)}ms / p95 ${stats.cpu.p95.toFixed(1)}`,
          `QWAIT  ${
            stats.queueWait.average > 0
              ? `${stats.queueWait.average.toFixed(1)}ms / p95 ${stats.queueWait.p95.toFixed(1)}`
              : '—'
          }`,
          `DRAW   ${stats.drawCalls}`,
          `TRI    ${(stats.triangles / 1000).toFixed(1)}k`,
          ...(stats.triangleDetail ? [`TRI TOP ${stats.triangleDetail}`] : []),
          `SCENE  ${stats.complexityTier} (cost ${stats.weightedCost}, DPR ${stats.dpr.toFixed(1)})`,
          `DIRTY  ${stats.dirty}${stats.dirtyDetail ? ` (${stats.dirtyDetail})` : ''}`,
          `MESH   ${stats.meshes}`,
          `LINE   ${stats.lines}`,
          `SPRITE ${stats.sprites}`,
          `LIGHT  ${stats.lights}`,
        ].join('\n')}
      </div>
    </Html>
  )
}
