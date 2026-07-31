'use client'

/**
 * Industry Scene Renderer (thin wrapper)
 *
 * Consumes the render-ready payload produced by
 * @pascal-app/plugin-factory-equipment's generateIndustryScene({
 *   buildRenderPayload: true }) and draws it with real three.js objects:
 *
 *   - one THREE.InstancedMesh per InstanceBatch (matrices already built)
 *   - one MeshStandard/Physical material per batch (PbrMaterialPlan scalars +
 *     kernel overrides via createIndustrialMaterial)
 *   - procedural DataTextures attached to the material slots named by the
 *     plan (baseColor/normal/roughness/metalness)
 *
 * Singletons are drawn as regular meshes through the same material path.
 *
 * This module lives in @pascal-app/nodes (three.js available); the heavy
 * lifting (batching, matrix math, texture pixels) is pure logic in
 * plugin-factory-equipment and unit-tested there.
 */

import type {
  BatchInstanceData,
  GeneratedTexture,
  InstanceBatch,
  PbrMaterialPlan,
  PlacedPart,
  SceneMaterialPlan,
  SceneRenderPayload,
} from '@pascal-app/plugin-factory-equipment'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  createIndustrialMaterial,
  type IndustrialRenderContract,
} from '../shared/industrial-render-contract-rendering'

// ─── Geometry from batch kind + representative dimensions ────────────────────

/**
 * Build the shared geometry for a batch. All instances share geometry; the
 * per-instance matrices carry position/rotation/axis alignment.
 *
 * Kind mapping follows the part-compose vocabulary used by the geometry
 * synthesizer: cylindrical kinds → CylinderGeometry (Y-up, axis alignment is
 * in the instance matrix), boxes → BoxGeometry, hemisphere → SphereGeometry.
 */
function buildBatchGeometry(batch: InstanceBatch): THREE.BufferGeometry {
  const g = batch.geometry
  const radius = g.radius ?? 0.5
  const height = g.height ?? 1
  const length = g.length ?? 1
  const width = g.width ?? 1

  switch (batch.kind) {
    case 'cylindrical_tank':
    case 'storage_tank_shell':
    case 'filter_vessel':
    case 'liquid_volume':
    case 'ribbed_motor_body':
    case 'flanged_nozzle':
    case 'pipe_run':
      return new THREE.CylinderGeometry(radius, radius, height > 0.01 ? height : length, 24)
    case 'chimney_stack':
      // Frustum: distinct top/bottom radii
      return new THREE.CylinderGeometry(g.radiusTop ?? radius * 0.6, g.radiusBottom ?? radius, height, 24)
    case 'flange_ring':
      return new THREE.TorusGeometry(radius, Math.max(radius * 0.25, 0.02), 12, 24)
    case 'hemisphere':
      return new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)
    case 'service_platform':
    case 'platform_ladder':
    case 'pipe_rack':
    case 'volute_casing':
    case 'heat_exchanger':
    case 'generic_body':
    default:
      return new THREE.BoxGeometry(length, height, width)
  }
}

// ─── DataTexture from GeneratedTexture ───────────────────────────────────────

const textureCache = new Map<string, THREE.DataTexture>()

function toDataTexture(key: string, tex: GeneratedTexture): THREE.DataTexture {
  const cached = textureCache.get(key)
  if (cached) return cached

  const isRgb = tex.format === 'rgb'
  const data = new Uint8Array(tex.data) // copy — DataTexture takes ownership
  const texture = new THREE.DataTexture(
    data,
    tex.width,
    tex.height,
    isRgb ? THREE.RGBFormat : THREE.RedFormat,
  )
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(tex.repeat[0], tex.repeat[1])
  texture.needsUpdate = true
  textureCache.set(key, texture)
  return texture
}

/** Attach generated textures to a material under their PBR slots. */
function attachTextures(
  material: THREE.Material,
  textures: Partial<Record<'baseColor' | 'normal' | 'roughness' | 'metalness', GeneratedTexture>> | undefined,
  cachePrefix: string,
): void {
  if (!textures) return
  const m = material as THREE.MeshStandardMaterial
  if (textures.baseColor && 'map' in m) {
    m.map = toDataTexture(`${cachePrefix}:baseColor`, textures.baseColor)
  }
  if (textures.normal && 'normalMap' in m) {
    m.normalMap = toDataTexture(`${cachePrefix}:normal`, textures.normal)
  }
  if (textures.roughness && 'roughnessMap' in m) {
    m.roughnessMap = toDataTexture(`${cachePrefix}:roughness`, textures.roughness)
  }
  if (textures.metalness && 'metalnessMap' in m) {
    m.metalnessMap = toDataTexture(`${cachePrefix}:metalness`, textures.metalness)
  }
  m.needsUpdate = true
}

// ─── Material from PbrMaterialPlan ───────────────────────────────────────────

function buildBatchMaterial(
  plan: PbrMaterialPlan,
  color: string,
  contract: IndustrialRenderContract | undefined,
  textures: SceneRenderPayload['batchTextures'][string] | undefined,
  cachePrefix: string,
): THREE.Material {
  const base = new THREE.MeshStandardMaterial({
    color,
    metalness: plan.metalness,
    roughness: plan.roughness,
    envMapIntensity: plan.envMapIntensity,
    transparent: plan.transparent ?? false,
    opacity: plan.opacity ?? 1,
    depthWrite: plan.depthWrite ?? true,
  })
  // Kernel-level overrides (clearcoat upgrade, emissive, transparency rules)
  // reuse the established industrial material path.
  const material = createIndustrialMaterial(contract, base)
  attachTextures(material, textures, cachePrefix)
  return material
}

// ─── Components ──────────────────────────────────────────────────────────────

type BatchMeshProps = {
  batch: InstanceBatch
  instanceData: BatchInstanceData
  plan: PbrMaterialPlan | undefined
  textures: SceneRenderPayload['batchTextures'][string] | undefined
}

function IndustryBatchMesh({ batch, instanceData, plan, textures }: BatchMeshProps) {
  const geometry = useMemo(() => buildBatchGeometry(batch), [batch])
  const material = useMemo(() => {
    const contract = batch.renderContract as IndustrialRenderContract | undefined
    return buildBatchMaterial(
      plan ?? {
        materialFamily: 'unknown',
        metalness: 0.46,
        roughness: 0.42,
        envMapIntensity: 0.7,
        textures: [],
        hasTextures: false,
      },
      batch.color,
      contract,
      textures,
      batch.key,
    )
  }, [batch, plan, textures])

  const meshRef = useRef<THREE.InstancedMesh>(null)

  // Upload pre-built matrices (plugin already composed them; no per-frame work)
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(instanceData.matrices, 16)
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
  }, [instanceData])

  useLayoutEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, instanceData.count]}
      frustumCulled={false}
    />
  )
}

function roleOf(value: { semanticRole?: string }): string {
  return (value.semanticRole ?? '').toLowerCase()
}

function kindOf(value: { kind?: unknown }): string {
  return typeof value.kind === 'string' ? value.kind.toLowerCase() : ''
}

function partPosition(part: PlacedPart): [number, number, number] {
  return part.worldPosition ?? ((part as unknown as { position?: [number, number, number] }).position ?? [0, 0, 0])
}

function RefineryFlareFire({ position }: { position: [number, number, number] }) {
  const flameRef = useRef<THREE.Group>(null)
  const lightRef = useRef<THREE.PointLight>(null)

  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    const pulse = 1 + Math.sin(time * 8.7) * 0.08 + Math.sin(time * 13.1) * 0.035
    if (flameRef.current) {
      flameRef.current.scale.set(1 + Math.sin(time * 5.2) * 0.05, pulse, 1)
      flameRef.current.rotation.y = Math.sin(time * 2.1) * 0.08
    }
    if (lightRef.current) lightRef.current.intensity = 18 + pulse * 8
  })

  return (
    <group position={position}>
      <group ref={flameRef}>
        <mesh position={[0, 0.15, 0]}>
          <coneGeometry args={[0.58, 1.55, 24, 1, true]} />
          <meshStandardMaterial
            color="#f97316"
            emissive="#fb923c"
            emissiveIntensity={2.6}
            transparent
            opacity={0.78}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 0.36, 0]}>
          <coneGeometry args={[0.28, 1.05, 20, 1, true]} />
          <meshStandardMaterial
            color="#fef3c7"
            emissive="#fde68a"
            emissiveIntensity={3.4}
            transparent
            opacity={0.64}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      <mesh>
        <sphereGeometry args={[1.05, 24, 16]} />
        <meshBasicMaterial color="#fb923c" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <pointLight ref={lightRef} color="#fb923c" intensity={24} distance={18} decay={2} />
    </group>
  )
}

function RefinerySmokePlume({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.position.x = position[0] + Math.sin(clock.elapsedTime * 0.9) * 0.12
    ref.current.rotation.y = clock.elapsedTime * 0.08
  })
  return (
    <group ref={ref} position={position}>
      {[0, 1, 2].map((index) => (
        <mesh key={index} position={[index * 0.28, index * 0.45, -index * 0.16]}>
          <sphereGeometry args={[0.72 + index * 0.22, 20, 12]} />
          <meshStandardMaterial
            color="#64748b"
            transparent
            opacity={0.13 - index * 0.025}
            depthWrite={false}
            roughness={0.9}
          />
        </mesh>
      ))}
    </group>
  )
}

function SiteStreetLightEffect({ position }: { position: [number, number, number] }) {
  return (
    <group position={[position[0], position[1] + 2.8, position[2]]}>
      <mesh>
        <sphereGeometry args={[0.28, 16, 8]} />
        <meshBasicMaterial color="#fff3b0" transparent opacity={0.86} />
      </mesh>
      <pointLight color="#fde68a" intensity={3.2} distance={9} decay={2} />
    </group>
  )
}

function WarningBeaconEffect({ position }: { position: [number, number, number] }) {
  const lightRef = useRef<THREE.PointLight>(null)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const blink = Math.sin(clock.elapsedTime * 5.4) > 0.35 ? 1 : 0.18
    if (lightRef.current) lightRef.current.intensity = 6 * blink
    if (materialRef.current) materialRef.current.opacity = 0.28 + blink * 0.62
  })
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.22, 16, 8]} />
        <meshBasicMaterial ref={materialRef} color="#ef4444" transparent opacity={0.9} />
      </mesh>
      <pointLight ref={lightRef} color="#ef4444" intensity={6} distance={8} decay={2} />
    </group>
  )
}

type RuntimeEffectsProps = {
  batches: readonly InstanceBatch[]
  singletons?: readonly PlacedPart[]
}

export function IndustryRuntimeEffects({ batches, singletons = [] }: RuntimeEffectsProps) {
  const streetLightPositions = useMemo(() => {
    const positions: [number, number, number][] = []
    for (const batch of batches) {
      const role = roleOf(batch)
      const kind = kindOf(batch)
      const contract = batch.renderContract as { runtimeEffects?: string[] } | undefined
      const isStreetLight =
        role === 'street_light' ||
        kind === 'lamp-post' ||
        contract?.runtimeEffects?.includes('site-light-glow')
      if (!isStreetLight) continue
      for (const instance of batch.instances) positions.push(instance.position)
    }
    for (const part of singletons) {
      if (roleOf(part) === 'street_light' || kindOf(part) === 'lamp-post') {
        positions.push(partPosition(part))
      }
    }
    return positions.slice(0, 24)
  }, [batches, singletons])

  const flareFirePositions = useMemo(
    () =>
      singletons
        .filter((part) => roleOf(part) === 'flare_flame' || roleOf(part) === 'flare_glow')
        .map(partPosition)
        .slice(0, 4),
    [singletons],
  )
  const smokePositions = useMemo(
    () => singletons.filter((part) => roleOf(part) === 'flare_smoke_plume').map(partPosition).slice(0, 4),
    [singletons],
  )
  const beaconPositions = useMemo(
    () =>
      singletons
        .filter((part) => roleOf(part) === 'warning_beacon')
        .map(partPosition)
        .slice(0, 12),
    [singletons],
  )

  return (
    <group name="industry-runtime-effects">
      {streetLightPositions.map((position, index) => (
        <SiteStreetLightEffect key={`street-light-${index}`} position={position} />
      ))}
      {flareFirePositions.map((position, index) => (
        <RefineryFlareFire key={`flare-fire-${index}`} position={position} />
      ))}
      {smokePositions.map((position, index) => (
        <RefinerySmokePlume key={`flare-smoke-${index}`} position={position} />
      ))}
      {beaconPositions.map((position, index) => (
        <WarningBeaconEffect key={`warning-beacon-${index}`} position={position} />
      ))}
    </group>
  )
}

export type IndustrySceneRendererProps = {
  batches: readonly InstanceBatch[]
  singletons?: readonly PlacedPart[]
  materialPlan: SceneMaterialPlan
  renderPayload: SceneRenderPayload
}

/**
 * Draw all instanced batches of an industry scene. Singletons should be
 * rendered separately through the regular node/part pipeline (they each get
 * their own editable mesh).
 */
export function IndustrySceneBatches({
  batches,
  singletons,
  materialPlan,
  renderPayload,
}: IndustrySceneRendererProps) {
  const instanceDataByKey = useMemo(() => {
    const map = new Map<string, BatchInstanceData>()
    for (const data of renderPayload.batchInstances) map.set(data.key, data)
    return map
  }, [renderPayload])

  return (
    <group name="industry-scene-batches">
      {batches.map((batch) => {
        const instanceData = instanceDataByKey.get(batch.key)
        if (!instanceData) return null
        return (
          <IndustryBatchMesh
            key={batch.key}
            batch={batch}
            instanceData={instanceData}
            plan={materialPlan.byBatch[batch.key]}
            textures={renderPayload.batchTextures[batch.key]}
          />
        )
      })}
      <IndustryRuntimeEffects batches={batches} singletons={singletons} />
    </group>
  )
}
