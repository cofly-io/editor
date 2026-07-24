'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { cameraPosition, color, positionWorld } from 'three/tsl'
import * as THREE from 'three/webgpu'
import { backdropGradient, deepSkyColor, horizonHazeColor } from '../../lib/backdrop'
import { resolveOfflineHdriUrl } from '../../lib/offline-hdri'
import { getSceneTheme } from '../../lib/scene-themes'
import useViewer from '../../store/use-viewer'

/**
 * Scene IBL — a small procedural gradient sky (cool zenith → warm horizon →
 * dim ground bounce) used purely as the environment light source. The visible
 * backdrop stays the flat theme background (composited in post-processing);
 * this texture is never shown. It remains the fallback if the bundled HDRI is
 * unavailable, and its vertical color split means upward-facing surfaces read
 * cooler than vertical ones instead of everything getting the same
 * directionless warm wash. Exported as an opt-in <Viewer> child so embed /
 * thumbnail surfaces that don't want IBL simply don't mount it.
 * Only affects `rendered` shading (Lambert ignores env maps).
 */

// Linear-space gradient stops.
const ZENITH = [0.4, 0.56, 0.78] as const
const HORIZON = [0.95, 0.84, 0.66] as const
const GROUND = [0.38, 0.35, 0.3] as const

const ENV_INTENSITY = 0.6
// The gradient sky is a daylight source; dark themes only want a whisper of it.
const ENV_INTENSITY_DARK = 0.2
const WIDTH = 128
const HEIGHT = 64
const FALLBACK_SKY_RADIUS = 900
const FORCE_WEBGL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_VIEWER_FORCE_WEBGL === '1'

function buildGradientSky(): THREE.DataTexture {
  const data = new Float32Array(WIDTH * HEIGHT * 4)
  for (let y = 0; y < HEIGHT; y++) {
    // Row 0 = v0 = nadir, top row = zenith (equirect v spans -90°..+90°).
    const lat = ((y + 0.5) / HEIGHT) * 2 - 1
    let r: number
    let g: number
    let b: number
    if (lat <= 0) {
      // Below the horizon: flat ground bounce, slightly darker toward nadir.
      const k = 1 + lat * 0.35
      r = GROUND[0] * k
      g = GROUND[1] * k
      b = GROUND[2] * k
    } else {
      // pow < 1 widens the warm horizon band.
      const t = lat ** 0.65
      r = HORIZON[0] + (ZENITH[0] - HORIZON[0]) * t
      g = HORIZON[1] + (ZENITH[1] - HORIZON[1]) * t
      b = HORIZON[2] + (ZENITH[2] - HORIZON[2]) * t
    }
    for (let x = 0; x < WIDTH; x++) {
      const longitude = (x + 0.5) / WIDTH
      const longitudeDistance = Math.abs(((longitude - 0.18 + 0.5) % 1) - 0.5)
      const latitudeDistance = lat - 0.48
      const softbox = Math.exp(-((longitudeDistance / 0.075) ** 2 + (latitudeDistance / 0.14) ** 2))
      const i = (y * WIDTH + x) * 4
      data[i] = r + softbox * 5.5
      data[i + 1] = g + softbox * 4.9
      data[i + 2] = b + softbox * 3.9
      data[i + 3] = 1
    }
  }
  const texture = new THREE.DataTexture(data, WIDTH, HEIGHT, THREE.RGBAFormat, THREE.FloatType)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.colorSpace = THREE.LinearSRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function WebGLFallbackSky() {
  const gl = useThree((state) => state.gl)
  const sceneTheme = useViewer((state) => state.sceneTheme)
  const theme = getSceneTheme(sceneTheme)
  const sky = theme.backgroundSky ?? theme.background
  const mesh = useRef<THREE.Mesh>(null)
  const [enabled, setEnabled] = useState(false)

  const geometry = useMemo(() => new THREE.SphereGeometry(FALLBACK_SKY_RADIUS, 48, 24), [])
  const material = useMemo(() => {
    const fallbackMaterial = new THREE.MeshBasicNodeMaterial()
    fallbackMaterial.colorNode = backdropGradient({
      dirY: positionWorld.sub(cameraPosition).normalize().y,
      background: color(theme.background),
      haze: color(horizonHazeColor(sky, theme.appearance)),
      sky: color(sky),
      skyDeep: color(deepSkyColor(sky)),
    })
    fallbackMaterial.depthWrite = false
    fallbackMaterial.fog = false
    fallbackMaterial.side = THREE.BackSide
    return fallbackMaterial
  }, [sky, theme.appearance, theme.background])

  useEffect(() => {
    return () => geometry.dispose()
  }, [geometry])

  useEffect(() => {
    return () => material.dispose()
  }, [material])

  useFrame(({ camera }) => {
    const backend = (gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend
    const backendName = backend?.constructor?.name
    const isWebGPUBackend = backend?.isWebGPUBackend === true || backendName === 'WebGPUBackend'
    const shouldUseFallback = FORCE_WEBGL || !isWebGPUBackend

    if (shouldUseFallback !== enabled) setEnabled(shouldUseFallback)
    if (mesh.current) mesh.current.position.copy(camera.position)
  })

  if (!enabled) return null

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={-100} />
}

function useOfflineHdriEnvironment() {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const textureRef = useRef<THREE.Texture | null>(null)
  const hdriUrl = useMemo(() => resolveOfflineHdriUrl(), [])

  useEffect(() => {
    let disposed = false
    const loader = new RGBELoader()
    loader.load(
      hdriUrl,
      (loadedTexture) => {
        loadedTexture.mapping = THREE.EquirectangularReflectionMapping
        loadedTexture.colorSpace = THREE.LinearSRGBColorSpace
        if (disposed) {
          loadedTexture.dispose()
          return
        }
        textureRef.current?.dispose()
        textureRef.current = loadedTexture
        setTexture(loadedTexture)
      },
      undefined,
      (error: unknown) => {
        console.warn(
          `[viewer] Offline HDRI failed to load from ${hdriUrl}; using procedural IBL.`,
          error,
        )
      },
    )
    return () => {
      disposed = true
      textureRef.current?.dispose()
      textureRef.current = null
    }
  }, [hdriUrl])

  return texture
}

export function SceneEnvironment() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const proceduralTexture = useMemo(buildGradientSky, [])
  const hdriTexture = useOfflineHdriEnvironment()
  const sceneTheme = useViewer((state) => state.sceneTheme)
  const theme = getSceneTheme(sceneTheme)
  const sky = theme.backgroundSky ?? theme.background

  useEffect(() => {
    return () => proceduralTexture.dispose()
  }, [proceduralTexture])

  useEffect(() => {
    const prevEnvironment = scene.environment
    const prevIntensity = scene.environmentIntensity
    const canvas = gl.domElement
    const previousBackground = canvas.style.background
    scene.environment = hdriTexture ?? proceduralTexture
    scene.environmentIntensity = theme.appearance === 'dark' ? ENV_INTENSITY_DARK : ENV_INTENSITY
    canvas.style.background = `linear-gradient(to bottom, ${deepSkyColor(sky)} 0%, ${sky} 32%, ${horizonHazeColor(sky, theme.appearance)} 54%, ${theme.background} 78%)`
    return () => {
      scene.environment = prevEnvironment
      scene.environmentIntensity = prevIntensity
      canvas.style.background = previousBackground
    }
  }, [gl, hdriTexture, proceduralTexture, scene, sky, theme.appearance, theme.background])

  return <WebGLFallbackSky />
}
