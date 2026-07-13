'use client'

import {
  type AnyNodeId,
  type ColumnNode,
  type EventSuffix,
  emitter,
  type NodeEvent,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import {
  createDefaultMaterial,
  createMaterial,
  createMaterialFromPresetRef,
  createSurfaceRoleMaterial,
} from '@pascal-app/viewer/materials'
import { ensureWebGPUCompatibleGeometry } from '@pascal-app/viewer/safe-geometry'
import useViewer, {
  isViewerSelectionInputSuppressed,
  isViewerSpatialInputSuppressed,
  shouldLatchViewerPointerSuppression,
} from '@pascal-app/viewer/store'
import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { buildPortalFrameBatches, type PortalFrameBatch } from './portal-frame-batching'

const tempLocalMatrix = new THREE.Matrix4()
const tempWorldMatrix = new THREE.Matrix4()
const tempInverse = new THREE.Matrix4()
const tempPosition = new THREE.Vector3()
const tempScale = new THREE.Vector3()
const tempQuaternion = new THREE.Quaternion()
const tempLocalPoint = new THREE.Vector3()

function emitNodeEvent(suffix: EventSuffix, node: ColumnNode, event: ThreeEvent<PointerEvent>) {
  const source = sceneRegistry.nodes.get(node.id)
  if (source) {
    source.updateWorldMatrix(true, false)
    tempInverse.copy(source.matrixWorld).invert()
    tempLocalPoint.copy(event.point).applyMatrix4(tempInverse)
  } else {
    tempLocalPoint.copy(event.point)
  }

  const payload: NodeEvent<ColumnNode> = {
    node,
    position: [event.point.x, event.point.y, event.point.z],
    localPosition: [tempLocalPoint.x, tempLocalPoint.y, tempLocalPoint.z],
    normal: event.face
      ? [event.face.normal.x, event.face.normal.y, event.face.normal.z]
      : undefined,
    faceIndex: event.faceIndex ?? undefined,
    object: event.object,
    stopPropagation: () => event.stopPropagation(),
    nativeEvent: event,
  }
  emitter.emit(`column:${suffix}`, payload as never)
}

function PortalFrameBatchMesh({ batch }: { batch: PortalFrameBatch }) {
  const leftRef = useRef<THREE.InstancedMesh>(null)
  const rightRef = useRef<THREE.InstancedMesh>(null)
  const beamRef = useRef<THREE.InstancedMesh>(null)
  const suppressedPointerRef = useRef(false)
  const lastClickRef = useRef<{ time: number; x: number; y: number; instanceId: number } | null>(
    null,
  )
  const suppressNativeClickUntilRef = useRef(0)
  const shading = useViewer((state) => state.shading)
  const textures = useViewer((state) => state.textures)
  const colorPreset = useViewer((state) => state.colorPreset)
  const nodesByIndex = batch.nodes

  const geometry = useMemo(() => ensureWebGPUCompatibleGeometry(new THREE.BoxGeometry(1, 1, 1)), [])
  const material = useMemo(() => {
    const exemplar = nodesByIndex[0]
    if (!textures) {
      return createSurfaceRoleMaterial('wall', colorPreset, undefined, undefined, shading)
    }
    const presetMaterial = createMaterialFromPresetRef(exemplar?.materialPreset, shading)
    if (presetMaterial) return presetMaterial
    if (exemplar?.material) return createMaterial(exemplar.material, shading)
    return createDefaultMaterial('#f2f0ed', 0.5, shading)
  }, [colorPreset, nodesByIndex, shading, textures])

  const applyMatrices = useCallback(() => {
    const left = leftRef.current
    const right = rightRef.current
    const beam = beamRef.current
    if (!(left && right && beam)) return false

    let complete = true
    for (let index = 0; index < nodesByIndex.length; index += 1) {
      const node = nodesByIndex[index]
      if (!node) continue
      const height = Math.max(0.2, node.height)
      const memberWidth = Math.min(1.6, Math.max(0.04, node.braceWidth ?? node.width))
      const memberDepth = Math.min(1.6, Math.max(0.04, node.braceDepth ?? node.depth))
      const span = Math.max(0.2, node.braceBottomSpread ?? 1.4)
      const source = sceneRegistry.nodes.get(node.id)
      if (!source) {
        complete = false
        continue
      }
      source.updateWorldMatrix(true, false)

      tempScale.set(memberWidth, height, memberDepth)
      tempPosition.set(-span / 2, height / 2, 0)
      tempLocalMatrix.compose(tempPosition, tempQuaternion.identity(), tempScale)
      left.setMatrixAt(index, tempWorldMatrix.multiplyMatrices(source.matrixWorld, tempLocalMatrix))

      tempPosition.set(span / 2, height / 2, 0)
      tempLocalMatrix.compose(tempPosition, tempQuaternion.identity(), tempScale)
      right.setMatrixAt(
        index,
        tempWorldMatrix.multiplyMatrices(source.matrixWorld, tempLocalMatrix),
      )

      tempScale.set(span + memberWidth, memberWidth, memberDepth)
      tempPosition.set(0, height, 0)
      tempLocalMatrix.compose(tempPosition, tempQuaternion.identity(), tempScale)
      beam.setMatrixAt(index, tempWorldMatrix.multiplyMatrices(source.matrixWorld, tempLocalMatrix))
    }

    for (const mesh of [left, right, beam]) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingBox()
      mesh.computeBoundingSphere()
    }
    return complete
  }, [nodesByIndex])

  useLayoutEffect(() => {
    applyMatrices()
  }, [applyMatrices])

  const needsRegistryWarmup = useRef(true)
  useFrame(() => {
    if (!needsRegistryWarmup.current) return
    needsRegistryWarmup.current = !applyMatrices()
  }, 19)

  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  const emit = (suffix: EventSuffix, event: ThreeEvent<PointerEvent>) => {
    const instanceId = event.instanceId
    if (instanceId == null) return
    const node = nodesByIndex[instanceId]
    if (node) emitNodeEvent(suffix, node, event)
  }

  const emitClickAndMaybeDoubleClick = (event: ThreeEvent<PointerEvent>) => {
    const instanceId = event.instanceId
    if (instanceId == null) return
    emit('click', event)
    const now = performance.now()
    const lastClick = lastClickRef.current
    const dx = lastClick ? event.nativeEvent.clientX - lastClick.x : Infinity
    const dy = lastClick ? event.nativeEvent.clientY - lastClick.y : Infinity
    const repeated =
      lastClick &&
      lastClick.instanceId === instanceId &&
      now - lastClick.time <= 800 &&
      Math.hypot(dx, dy) <= 6
    if (event.nativeEvent.detail >= 2 || repeated) {
      suppressNativeClickUntilRef.current = performance.now() + 1000
      emit('double-click', event)
      lastClickRef.current = null
      return
    }
    lastClickRef.current = {
      time: now,
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
      instanceId,
    }
  }

  const handlers = {
    onContextMenu: (event: ThreeEvent<PointerEvent>) => {
      if (!isViewerSelectionInputSuppressed()) emit('context-menu', event)
    },
    onDoubleClick: (event: ThreeEvent<PointerEvent>) => {
      if (performance.now() < suppressNativeClickUntilRef.current) return
      if (isViewerSelectionInputSuppressed()) return
    },
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return
      if (isViewerSelectionInputSuppressed()) {
        suppressedPointerRef.current = shouldLatchViewerPointerSuppression()
        suppressNativeClickUntilRef.current = performance.now() + 1000
        window.addEventListener('pointerup', () => (suppressedPointerRef.current = false), {
          once: true,
        })
        return
      }
      emit('pointerdown', event)
    },
    onPointerEnter: (event: ThreeEvent<PointerEvent>) => {
      if (!isViewerSpatialInputSuppressed()) emit('enter', event)
    },
    onPointerLeave: (event: ThreeEvent<PointerEvent>) => {
      if (!isViewerSpatialInputSuppressed()) emit('leave', event)
    },
    onPointerMove: (event: ThreeEvent<PointerEvent>) => {
      if (!isViewerSpatialInputSuppressed()) emit('move', event)
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return
      if (suppressedPointerRef.current) {
        suppressedPointerRef.current = false
        return
      }
      if (isViewerSelectionInputSuppressed()) return
      emit('pointerup', event)
      emitClickAndMaybeDoubleClick(event)
    },
  }

  return (
    <>
      <instancedMesh
        args={[geometry, material, nodesByIndex.length]}
        castShadow
        name={`column-portal-left:${batch.key}`}
        receiveShadow
        ref={leftRef}
        {...handlers}
      />
      <instancedMesh
        args={[geometry, material, nodesByIndex.length]}
        castShadow
        name={`column-portal-right:${batch.key}`}
        receiveShadow
        ref={rightRef}
        {...handlers}
      />
      <instancedMesh
        args={[geometry, material, nodesByIndex.length]}
        castShadow
        name={`column-portal-beam:${batch.key}`}
        receiveShadow
        ref={beamRef}
        {...handlers}
      />
    </>
  )
}

export default function ColumnBatchSystem() {
  const nodes = useScene((state) => state.nodes)
  const selection = useViewer((state) => state.selection)
  const previewSelectedIds = useViewer((state) => state.previewSelectedIds)
  const hoveredId = useViewer((state) => state.hoveredId)

  const excludedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const id of selection.selectedIds) ids.add(id)
    for (const id of previewSelectedIds) ids.add(id)
    if (hoveredId) ids.add(hoveredId)
    return ids
  }, [hoveredId, previewSelectedIds, selection.selectedIds])

  const batches = useMemo(
    () => buildPortalFrameBatches(nodes as Record<AnyNodeId, unknown>, excludedIds),
    [excludedIds, nodes],
  )

  return (
    <>
      {batches.map((batch) => (
        <PortalFrameBatchMesh batch={batch} key={batch.key} />
      ))}
    </>
  )
}
