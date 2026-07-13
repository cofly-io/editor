'use client'

import {
  type AnyNodeId,
  type EventSuffix,
  emitter,
  type NodeEvent,
  sceneRegistry,
  type TorusNode,
  useScene,
} from '@pascal-app/core'
import {
  createDefaultMaterial,
  createMaterial,
  createMaterialFromPresetRef,
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
import {
  createIndustrialMaterial,
  industrialRenderContractFromMetadata,
} from '../shared/industrial-render-contract-rendering'
import { canBatchTorusBase, primitiveMaterialBatchKey } from '../shared/primitive-batching'

type TorusBatch = {
  key: string
  majorRadius: number
  tubeRadius: number
  radialSegments: number
  tubularSegments: number
  arc: number
  nodes: TorusNode[]
}

const tempMatrix = new THREE.Matrix4()
const tempInverse = new THREE.Matrix4()
const tempLocalPoint = new THREE.Vector3()

function numberKey(value: number | undefined, fallback: number): string {
  return String(Number.isFinite(value) ? value : fallback)
}

function buildTorusBatches(
  nodes: Record<AnyNodeId, unknown>,
  excludedIds: ReadonlySet<string>,
): TorusBatch[] {
  const groups = new Map<string, TorusBatch>()

  for (const node of Object.values(nodes)) {
    if (!node || typeof node !== 'object' || (node as { type?: unknown }).type !== 'torus') continue
    const torus = node as TorusNode
    if (excludedIds.has(torus.id) || !canBatchTorusBase(torus)) continue

    const majorRadius = torus.majorRadius ?? 0.5
    const tubeRadius = torus.tubeRadius ?? 0.08
    const radialSegments = torus.radialSegments ?? 16
    const tubularSegments = torus.tubularSegments ?? 48
    const arc = torus.arc ?? Math.PI * 2
    const key = [
      numberKey(torus.majorRadius, 0.5),
      numberKey(torus.tubeRadius, 0.08),
      numberKey(torus.radialSegments, 16),
      numberKey(torus.tubularSegments, 48),
      numberKey(torus.arc, Math.PI * 2),
      primitiveMaterialBatchKey(torus),
    ].join('|')

    const existing = groups.get(key)
    if (existing) {
      existing.nodes.push(torus)
    } else {
      groups.set(key, {
        key,
        majorRadius,
        tubeRadius,
        radialSegments,
        tubularSegments,
        arc,
        nodes: [torus],
      })
    }
  }

  return Array.from(groups.values())
}

function emitNodeEvent(
  suffix: EventSuffix,
  node: TorusNode,
  mesh: THREE.InstancedMesh,
  instanceId: number,
  event: ThreeEvent<PointerEvent>,
) {
  mesh.getMatrixAt(instanceId, tempMatrix)
  tempInverse.copy(tempMatrix).invert()
  tempLocalPoint.copy(event.point).applyMatrix4(tempInverse)

  const payload: NodeEvent<TorusNode> = {
    node,
    position: [event.point.x, event.point.y, event.point.z],
    localPosition: [tempLocalPoint.x, tempLocalPoint.y, tempLocalPoint.z],
    normal: event.face
      ? [event.face.normal.x, event.face.normal.y, event.face.normal.z]
      : undefined,
    faceIndex: event.faceIndex ?? undefined,
    object: mesh,
    stopPropagation: () => event.stopPropagation(),
    nativeEvent: event,
  }

  emitter.emit(`torus:${suffix}`, payload as never)
}

function TorusBatchMesh({ batch }: { batch: TorusBatch }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const lastClickRef = useRef<{ time: number; x: number; y: number; instanceId: number } | null>(
    null,
  )
  const suppressedPointerRef = useRef(false)
  const suppressNativeClickUntilRef = useRef(0)
  const nodesByIndex = batch.nodes
  const shading = useViewer((state) => state.shading)

  const geometry = useMemo(() => {
    return ensureWebGPUCompatibleGeometry(
      new THREE.TorusGeometry(
        batch.majorRadius,
        batch.tubeRadius,
        batch.radialSegments,
        batch.tubularSegments,
        batch.arc,
      ),
    )
  }, [batch.majorRadius, batch.tubeRadius, batch.radialSegments, batch.tubularSegments, batch.arc])

  const material = useMemo(() => {
    const exemplar = batch.nodes[0]
    const contract = industrialRenderContractFromMetadata(exemplar?.metadata)
    const presetMaterial = createMaterialFromPresetRef(exemplar?.materialPreset, shading)
    if (presetMaterial) return createIndustrialMaterial(contract, presetMaterial)
    const base = exemplar?.material
      ? createMaterial(exemplar.material, shading)
      : createDefaultMaterial('#cccccc', 1, shading)
    return createIndustrialMaterial(contract, base)
  }, [batch.nodes, shading])

  const applyMatrices = useCallback(() => {
    const mesh = meshRef.current
    if (!mesh) return false

    let complete = true
    for (let i = 0; i < nodesByIndex.length; i += 1) {
      const node = nodesByIndex[i]
      if (!node) continue
      const source = sceneRegistry.nodes.get(node.id)
      if (!source) {
        complete = false
        continue
      }
      source.updateWorldMatrix(true, false)
      mesh.setMatrixAt(i, source.matrixWorld)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
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
    if (!node) return
    emitNodeEvent(suffix, node, event.object as THREE.InstancedMesh, instanceId, event)
  }

  const emitClickAndMaybeDoubleClick = (event: ThreeEvent<PointerEvent>) => {
    const instanceId = event.instanceId
    if (instanceId == null) return
    emit('click', event)
    const now = performance.now()
    const lastClick = lastClickRef.current
    const dx = lastClick ? event.nativeEvent.clientX - lastClick.x : Infinity
    const dy = lastClick ? event.nativeEvent.clientY - lastClick.y : Infinity
    const isRepeatedClick =
      lastClick &&
      lastClick.instanceId === instanceId &&
      now - lastClick.time <= 800 &&
      Math.hypot(dx, dy) <= 6
    if (event.nativeEvent.detail >= 2 || isRepeatedClick) {
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

  const selectionSuppressed = isViewerSelectionInputSuppressed
  const spatialSuppressed = isViewerSpatialInputSuppressed

  return (
    <instancedMesh
      args={[geometry, material, nodesByIndex.length]}
      castShadow
      name={`torus-batch:${batch.key}`}
      onContextMenu={(event) => {
        if (selectionSuppressed()) return
        emit('context-menu', event as ThreeEvent<PointerEvent>)
      }}
      onDoubleClick={(event) => {
        if (performance.now() < suppressNativeClickUntilRef.current) return
        if (selectionSuppressed()) return
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        if (selectionSuppressed()) {
          suppressedPointerRef.current = shouldLatchViewerPointerSuppression()
          suppressNativeClickUntilRef.current = performance.now() + 1000
          window.addEventListener(
            'pointerup',
            () => {
              suppressedPointerRef.current = false
            },
            { once: true },
          )
          return
        }
        emit('pointerdown', event)
      }}
      onPointerEnter={(event) => {
        if (spatialSuppressed()) return
        emit('enter', event)
      }}
      onPointerLeave={(event) => {
        if (spatialSuppressed()) return
        emit('leave', event)
      }}
      onPointerMove={(event) => {
        if (spatialSuppressed()) return
        emit('move', event)
      }}
      onPointerUp={(event) => {
        if (event.button !== 0) return
        if (suppressedPointerRef.current) {
          suppressedPointerRef.current = false
          return
        }
        if (selectionSuppressed()) return
        emit('pointerup', event)
        emitClickAndMaybeDoubleClick(event)
      }}
      receiveShadow
      ref={meshRef}
    />
  )
}

export default function TorusBatchSystem() {
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
  }, [selection.selectedIds, previewSelectedIds, hoveredId])

  const batches = useMemo(
    () => buildTorusBatches(nodes as Record<AnyNodeId, unknown>, excludedIds),
    [nodes, excludedIds],
  )

  return (
    <>
      {batches.map((batch) => (
        <TorusBatchMesh batch={batch} key={batch.key} />
      ))}
    </>
  )
}
