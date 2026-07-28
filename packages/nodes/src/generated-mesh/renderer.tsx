'use client'

import {
  type GeneratedMeshBlobPayload,
  type GeneratedMeshNode,
  loadGeneratedMeshBlob,
  useRegistry,
  useScene,
} from '@pascal-app/core'
import {
  createDefaultMaterial,
  createMaterial,
  createMaterialFromPresetRef,
} from '@pascal-app/viewer/materials'
import { useNodeEvents } from '@pascal-app/viewer/node-events'
import { ensureWebGPUCompatibleGeometry } from '@pascal-app/viewer/safe-geometry'
import useViewer from '@pascal-app/viewer/store'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

/**
 * Generated-mesh renderer.
 *
 * MVP (stage 5): geometry is a primitive recipe produced by the DSL
 * compiler — `{ kind: 'primitive-recipe', recipeId: 'primitive.<kind>',
 * params }`. This renderer maps the nine DSL geometry kinds onto native
 * Three geometry, mirroring the per-kind primitive renderers (including
 * their centering conventions: lathe is vertically centered, extrude and
 * sweep are bounding-box centered) so a part sits exactly where the IR
 * transform puts it.
 *
 * Material resolution follows the standard three-level fallback:
 * materialPreset → inline material → default. DSL material presets
 * ('metal', 'plastic', 'glass') land on `node.materialPreset`; extra IR
 * material fields (color/roughness/metalness) ride in metadata.
 */

type Vec3 = [number, number, number]

export type { GeneratedMeshBlobPayload } from '@pascal-app/core'

const generatedMeshBlobs = new Map<string, GeneratedMeshBlobPayload>()

/** Registers a verified mesh payload fetched from the scene blob store. */
export function registerGeneratedMeshBlob(blobId: string, payload: GeneratedMeshBlobPayload): void {
  generatedMeshBlobs.set(blobId, payload)
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function pairs(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return []
  return value.filter(
    (p): p is [number, number] =>
      Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number',
  )
}

function vec3s(value: unknown): Vec3[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (p): p is Vec3 =>
      Array.isArray(p) &&
      typeof p[0] === 'number' &&
      typeof p[1] === 'number' &&
      typeof p[2] === 'number',
  )
}

function centerGeometry(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox()
  const box = geo.boundingBox
  if (!box) return
  const center = new THREE.Vector3()
  box.getCenter(center)
  geo.translate(-center.x, -center.y, -center.z)
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
}

export function buildGeneratedMeshGeometry(
  node: GeneratedMeshNode,
  blobPayload?: GeneratedMeshBlobPayload,
): THREE.BufferGeometry {
  const recipe = node.geometry
  if (recipe.kind === 'mesh-blob') {
    const payload = blobPayload ?? generatedMeshBlobs.get(recipe.blobId)
    const geometry = new THREE.BufferGeometry()
    if (!payload) return geometry
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(payload.positions, 3))
    if (payload.normals)
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(payload.normals, 3))
    if (payload.uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(payload.uvs, 2))
    if (payload.indices) geometry.setIndex(payload.indices)
    if (!payload.normals) geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    return geometry
  }
  const params = (recipe?.params ?? {}) as Record<string, unknown>
  const kind = recipe?.recipeId?.startsWith('primitive.')
    ? recipe.recipeId.slice('primitive.'.length)
    : 'box'

  switch (kind) {
    case 'box': {
      const length = num(params.length, 1)
      const height = num(params.height, 1)
      const width = num(params.width, 1)
      return new THREE.BoxGeometry(length, height, width)
    }
    case 'cylinder': {
      const radius = num(params.radius, 0.5)
      const height = num(params.height, 1)
      return new THREE.CylinderGeometry(radius, radius, height, 32)
    }
    case 'sphere': {
      return new THREE.SphereGeometry(num(params.radius, 0.5), 32, 16)
    }
    case 'cone': {
      return new THREE.ConeGeometry(num(params.radius, 0.5), num(params.height, 1), 32)
    }
    case 'frustum': {
      return new THREE.CylinderGeometry(
        num(params.radiusTop, 0.25),
        num(params.radiusBottom, 0.5),
        num(params.height, 1),
        32,
      )
    }
    case 'torus': {
      return new THREE.TorusGeometry(
        num(params.majorRadius, 0.5),
        num(params.tubeRadius, 0.1),
        12,
        48,
      )
    }
    case 'lathe': {
      const profile = pairs(params.profile)
      const points = (
        profile.length > 0 ? profile : [[0, 0] as [number, number], [0.5, 1] as [number, number]]
      ).map(([x, y]) => new THREE.Vector2(x, y))
      const geo = new THREE.LatheGeometry(points, 32)
      // Match the lathe renderer: center vertically so the node position
      // is the bounding-box center.
      let minY = Infinity
      let maxY = -Infinity
      for (const [, y] of profile) {
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      if (Number.isFinite(minY) && Number.isFinite(maxY)) {
        const centerY = (minY + maxY) / 2
        if (Math.abs(centerY) > 0.0001) geo.translate(0, -centerY, 0)
      }
      return geo
    }
    case 'extrude': {
      const profile = pairs(params.profile)
      const fallback: Array<[number, number]> = [
        [-0.5, -0.25],
        [0.5, -0.25],
        [0.5, 0.25],
        [-0.5, 0.25],
      ]
      const points = profile.length > 1 ? profile : fallback
      const shape = new THREE.Shape()
      const [first, ...rest] = points
      if (first) shape.moveTo(first[0], first[1])
      for (const [x, y] of rest) shape.lineTo(x, y)
      shape.closePath()
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: num(params.depth, 0.1),
        bevelEnabled: false,
      })
      centerGeometry(geo)
      return geo
    }
    case 'sweep': {
      const path = vec3s(params.path)
      const points = (path.length > 1 ? path : [[-0.5, 0, 0] as Vec3, [0.5, 0, 0] as Vec3]).map(
        ([x, y, z]) => new THREE.Vector3(x, y, z),
      )
      const curve = new THREE.CatmullRomCurve3(points, false)
      const geo = new THREE.TubeGeometry(curve, 24, num(params.radius, 0.03), 12, false)
      centerGeometry(geo)
      return geo
    }
    default:
      return new THREE.BoxGeometry(1, 1, 1)
  }
}

export const GeneratedMeshRenderer = ({ node }: { node: GeneratedMeshNode }) => {
  const ref = useRef<THREE.Group>(null!)
  const handlers = useNodeEvents(node, 'generated-mesh')
  const shading = useViewer((state) => state.shading)
  const [loadedBlob, setLoadedBlob] = useState<
    { blobId: string; payload: GeneratedMeshBlobPayload } | undefined
  >()

  useRegistry(node.id, 'generated-mesh', ref)

  useLayoutEffect(() => {
    useScene.getState().markDirty(node.id)
  }, [node.id])

  useLayoutEffect(() => {
    if (node.geometry.kind !== 'mesh-blob') return
    let active = true
    loadGeneratedMeshBlob(node.geometry.blobId).then((payload) => {
      if (!active || !payload) return
      registerGeneratedMeshBlob(node.geometry.blobId, payload)
      setLoadedBlob({ blobId: node.geometry.blobId, payload })
    })
    return () => {
      active = false
    }
  }, [node.geometry])

  const material = useMemo(() => {
    // Inline material (node.material) wins over the preset ref: the DSL
    // placement folds color tints / PBR overrides into node.material, and
    // a bare preset must not clobber them. Falls back to the preset, then
    // to a neutral default.
    const mat = node.material
    if (mat) return createMaterial(mat, shading)
    const presetMaterial = createMaterialFromPresetRef(node.materialPreset, shading)
    if (presetMaterial) return presetMaterial
    return createDefaultMaterial('#cccccc', 1, shading)
  }, [node.materialPreset, node.material, shading])

  const blobPayload =
    node.geometry.kind === 'mesh-blob' && loadedBlob?.blobId === node.geometry.blobId
      ? loadedBlob.payload
      : undefined
  const geometry = useMemo(
    () => ensureWebGPUCompatibleGeometry(buildGeneratedMeshGeometry(node, blobPayload)),
    [node, blobPayload],
  )

  return (
    <group
      position-x={node.position[0]}
      position-y={node.position[1]}
      position-z={node.position[2]}
      ref={ref}
      rotation={node.rotation}
      scale={node.scale}
      visible={node.visible}
      {...handlers}
    >
      <mesh
        castShadow
        geometry={geometry}
        material={material}
        name="generated-mesh-solid"
        receiveShadow
      />
    </group>
  )
}

export default GeneratedMeshRenderer
