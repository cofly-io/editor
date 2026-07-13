'use client'

import { type TorusNode, useRegistry, useScene } from '@pascal-app/core'
import {
  createDefaultMaterial,
  createMaterial,
  createMaterialFromPresetRef,
} from '@pascal-app/viewer/materials'
import { useNodeEvents } from '@pascal-app/viewer/node-events'
import { ensureWebGPUCompatibleGeometry } from '@pascal-app/viewer/safe-geometry'
import useViewer from '@pascal-app/viewer/store'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  createIndustrialMaterial,
  industrialRenderContractFromMetadata,
} from '../shared/industrial-render-contract-rendering'
import { canBatchTorusBase } from '../shared/primitive-batching'

function TorusSolid({ node }: { node: TorusNode }) {
  const shading = useViewer((state) => state.shading)
  const renderContract = useMemo(
    () => industrialRenderContractFromMetadata(node.metadata),
    [node.metadata],
  )

  const material = useMemo(() => {
    const presetMaterial = createMaterialFromPresetRef(node.materialPreset, shading)
    if (presetMaterial) return createIndustrialMaterial(renderContract, presetMaterial)
    const mat = node.material
    const base = mat ? createMaterial(mat, shading) : createDefaultMaterial('#cccccc', 1, shading)
    return createIndustrialMaterial(renderContract, base)
  }, [
    renderContract,
    node.materialPreset,
    node.material,
    node.material?.preset,
    node.material?.properties,
    node.material?.texture,
    shading,
  ])

  const geometry = useMemo(
    () =>
      ensureWebGPUCompatibleGeometry(
        new THREE.TorusGeometry(
          node.majorRadius ?? 0.5,
          node.tubeRadius ?? 0.08,
          node.radialSegments ?? 16,
          node.tubularSegments ?? 48,
          node.arc ?? Math.PI * 2,
        ),
      ),
    [node.majorRadius, node.tubeRadius, node.radialSegments, node.tubularSegments, node.arc],
  )

  return (
    <mesh castShadow geometry={geometry} material={material} name="primitive-solid" receiveShadow />
  )
}

export const TorusRenderer = ({ node }: { node: TorusNode }) => {
  const ref = useRef<THREE.Group>(null!)
  const handlers = useNodeEvents(node, 'torus')
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const previewSelectedIds = useViewer((state) => state.previewSelectedIds)
  const hoveredId = useViewer((state) => state.hoveredId)
  const renderBaseIndividually =
    !canBatchTorusBase(node) ||
    selectedIds.includes(node.id) ||
    previewSelectedIds.includes(node.id) ||
    hoveredId === node.id

  useRegistry(node.id, 'torus', ref)

  useLayoutEffect(() => {
    useScene.getState().markDirty(node.id)
  }, [node.id])

  return (
    <group
      position-x={node.position[0]}
      position-y={node.position[1]}
      position-z={node.position[2]}
      ref={ref}
      rotation={node.rotation}
      visible={node.visible}
      {...handlers}
    >
      {renderBaseIndividually ? <TorusSolid node={node} /> : null}
    </group>
  )
}

export default TorusRenderer
