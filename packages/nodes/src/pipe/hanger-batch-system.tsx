'use client'

import { sceneRegistry, useLiveTransforms, useScene } from '@pascal-app/core'
import { ensureWebGPUCompatibleGeometry } from '@pascal-app/viewer/safe-geometry'
import { useFrame } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { buildPipeHangerBatches, type PipeHangerBatch } from './hanger-batching'

const localMatrix = new THREE.Matrix4()
const worldMatrix = new THREE.Matrix4()

function PipeHangerBatchMesh({
  batch,
  hasLiveTransforms,
}: {
  batch: PipeHangerBatch
  hasLiveTransforms: boolean
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(
    () =>
      ensureWebGPUCompatibleGeometry(
        new THREE.TorusGeometry(batch.radius * 1.35, batch.thickness, 6, 12),
      ),
    [batch.radius, batch.thickness],
  )
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#8a9098',
        metalness: 0.45,
        roughness: 0.42,
        transparent: batch.opacity < 1,
        opacity: batch.opacity,
      }),
    [batch.opacity],
  )

  const applyMatrices = useCallback(() => {
    const mesh = meshRef.current
    if (!mesh) return false

    let complete = true
    for (let index = 0; index < batch.instances.length; index += 1) {
      const instance = batch.instances[index]
      if (!instance) continue
      const source = sceneRegistry.nodes.get(instance.nodeId)
      if (!source) {
        complete = false
        continue
      }
      source.updateWorldMatrix(true, false)
      localMatrix.makeRotationX(Math.PI / 2).setPosition(...instance.position)
      worldMatrix.multiplyMatrices(source.matrixWorld, localMatrix)
      mesh.setMatrixAt(index, worldMatrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    return complete
  }, [batch.instances])

  useLayoutEffect(() => {
    applyMatrices()
  }, [applyMatrices])
  useLayoutEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  const needsRegistryWarmup = useRef(true)
  useFrame(() => {
    if (needsRegistryWarmup.current) {
      needsRegistryWarmup.current = !applyMatrices()
      return
    }
    if (hasLiveTransforms) applyMatrices()
  }, 19)

  return (
    <instancedMesh
      args={[geometry, material, batch.instances.length]}
      castShadow
      name={`pipe-hanger-batch:${batch.key}`}
      receiveShadow
      ref={meshRef}
    />
  )
}

export default function PipeHangerBatchSystem() {
  const nodes = useScene((state) => state.nodes)
  const hasLiveTransforms = useLiveTransforms((state) => state.transforms.size > 0)
  const batches = useMemo(() => buildPipeHangerBatches(nodes), [nodes])

  return (
    <>
      {batches.map((batch) => (
        <PipeHangerBatchMesh batch={batch} hasLiveTransforms={hasLiveTransforms} key={batch.key} />
      ))}
    </>
  )
}
