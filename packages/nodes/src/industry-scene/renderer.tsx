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
  SceneMaterialPlan,
  SceneRenderPayload,
} from '@pascal-app/plugin-factory-equipment'
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

export type IndustrySceneRendererProps = {
  batches: readonly InstanceBatch[]
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
    </group>
  )
}
