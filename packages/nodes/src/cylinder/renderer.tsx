'use client'

import { type CylinderNode, useRegistry, useScene } from '@pascal-app/core'
import { createCylinderGeometry } from '@pascal-app/viewer/create-cylinder-geometry'
import {
  createDefaultMaterial,
  createMaterial,
  createMaterialFromPresetRef,
} from '@pascal-app/viewer/materials'
import { useNodeEvents } from '@pascal-app/viewer/node-events'
import { ensureWebGPUCompatibleGeometry } from '@pascal-app/viewer/safe-geometry'
import useViewer from '@pascal-app/viewer/store'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  createIndustrialMaterial,
  industrialDetailKind,
  industrialRenderContractFromMetadata,
  industrialSurfaceEffectKind,
} from '../shared/industrial-render-contract-rendering'
import { canBatchCylinderBase } from '../shared/primitive-batching'
import {
  applyInstanceMatrices,
  primitivePatternInstances,
} from '../shared/primitive-contract-rendering'

function IndustrialCylinderEffect({
  contract,
  height,
  radius,
}: {
  contract: ReturnType<typeof industrialRenderContractFromMetadata>
  height: number
  radius: number
}) {
  const effect = industrialSurfaceEffectKind(contract)
  const outerRef = useRef<THREE.Mesh>(null)
  const innerRef = useRef<THREE.Mesh>(null)

  const waveMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#e0f2fe',
        opacity: 0.34,
        transparent: true,
        depthWrite: false,
      }),
    [],
  )
  const glowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#fb923c',
        opacity: 0.54,
        transparent: true,
        depthWrite: false,
      }),
    [],
  )

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime
    if (effect === 'liquid-wave') {
      if (outerRef.current) {
        outerRef.current.rotation.z = elapsed * 0.24
        const scale = 1 + Math.sin(elapsed * 1.4) * 0.018
        outerRef.current.scale.set(scale, scale, scale)
      }
      if (innerRef.current) {
        innerRef.current.rotation.z = -elapsed * 0.18
        const scale = 1 + Math.cos(elapsed * 1.1) * 0.014
        innerRef.current.scale.set(scale, scale, scale)
      }
    }
    if (effect === 'stack-glow' && outerRef.current) {
      const scale = 1 + Math.sin(elapsed * 5.2) * 0.08
      outerRef.current.scale.set(scale, scale, scale)
    }
  })

  if (effect === 'liquid-wave') {
    const y = height / 2 + 0.004
    return (
      <>
        <mesh material={waveMaterial} position-y={y} ref={outerRef} rotation-x={Math.PI / 2}>
          <torusGeometry
            args={[Math.max(0.01, radius * 0.72), Math.max(0.003, radius * 0.012), 8, 80]}
          />
        </mesh>
        <mesh
          material={waveMaterial}
          position-y={y + 0.002}
          ref={innerRef}
          rotation-x={Math.PI / 2}
        >
          <torusGeometry
            args={[Math.max(0.01, radius * 0.42), Math.max(0.003, radius * 0.01), 8, 72]}
          />
        </mesh>
      </>
    )
  }

  if (effect === 'stack-glow') {
    return (
      <mesh material={glowMaterial} position-y={height / 2 + radius * 0.24} ref={outerRef}>
        <sphereGeometry args={[Math.max(0.04, radius * 0.46), 20, 12]} />
      </mesh>
    )
  }

  return null
}

function RingBand({
  material,
  radius,
  tubeRadius,
  y,
}: {
  material: THREE.Material
  radius: number
  tubeRadius: number
  y: number
}) {
  return (
    <mesh material={material} position-y={y} rotation-x={Math.PI / 2}>
      <torusGeometry args={[radius, tubeRadius, 8, 72]} />
    </mesh>
  )
}

function BoltCircle({
  material,
  radius,
  y,
}: {
  material: THREE.Material
  radius: number
  y: number
}) {
  const bolts = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2
        return [Math.cos(angle) * radius, y, Math.sin(angle) * radius] as const
      }),
    [radius, y],
  )

  return (
    <>
      {bolts.map(([x, boltY, z], index) => (
        <mesh key={`${boltY}:${index}`} material={material} position={[x, boltY, z]}>
          <sphereGeometry args={[Math.max(0.01, radius * 0.055), 10, 8]} />
        </mesh>
      ))}
    </>
  )
}

function VerticalRibs({
  material,
  radius,
  height,
}: {
  material: THREE.Material
  radius: number
  height: number
}) {
  const ribCount = 10
  const ribRadius = Math.max(0.006, radius * 0.018)
  const ribHeight = height * 0.84
  return (
    <>
      {Array.from({ length: ribCount }, (_, index) => {
        const angle = (index / ribCount) * Math.PI * 2
        return (
          <mesh
            key={index}
            material={material}
            position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
          >
            <cylinderGeometry args={[ribRadius, ribRadius, ribHeight, 8]} />
          </mesh>
        )
      })}
    </>
  )
}

function ColumnManwayMarkers({
  material,
  radius,
  height,
}: {
  material: THREE.Material
  radius: number
  height: number
}) {
  const markerRadius = Math.max(0.035, radius * 0.11)
  const z = radius * 1.026
  return (
    <>
      {[-0.26, 0.08, 0.38].map((factor) => (
        <mesh
          key={factor}
          material={material}
          position={[0, height * factor, z]}
          rotation-x={Math.PI / 2}
        >
          <cylinderGeometry
            args={[markerRadius, markerRadius, Math.max(0.012, radius * 0.035), 24]}
          />
        </mesh>
      ))}
    </>
  )
}

function DistillationColumnShellKernel({
  bandMaterial,
  darkMaterial,
  height,
  radius,
}: {
  bandMaterial: THREE.Material
  darkMaterial: THREE.Material
  height: number
  radius: number
}) {
  const outerRadius = radius * 1.012
  const tubeRadius = Math.max(0.006, radius * 0.018)
  const half = height / 2
  const trayBands = [-0.48, -0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36, 0.48]
  const flangeTubeRadius = Math.max(0.008, radius * 0.032)
  const skirtHeight = Math.max(0.12, Math.min(height * 0.12, radius * 0.42))
  const capRadius = radius * 0.96

  return (
    <>
      {trayBands.map((factor) => (
        <RingBand
          key={factor}
          material={bandMaterial}
          radius={outerRadius}
          tubeRadius={tubeRadius}
          y={height * factor}
        />
      ))}
      <RingBand
        material={darkMaterial}
        radius={radius * 1.08}
        tubeRadius={flangeTubeRadius}
        y={-half}
      />
      <RingBand
        material={darkMaterial}
        radius={radius * 1.08}
        tubeRadius={flangeTubeRadius}
        y={half}
      />
      <VerticalRibs material={bandMaterial} radius={outerRadius} height={height} />
      <ColumnManwayMarkers material={darkMaterial} radius={outerRadius} height={height} />
      <mesh material={bandMaterial} position-y={-half - skirtHeight * 0.38}>
        <cylinderGeometry args={[radius * 0.7, radius * 0.82, skirtHeight, 56]} />
      </mesh>
      <mesh material={bandMaterial} position-y={half + radius * 0.055} scale={[1, 0.16, 1]}>
        <sphereGeometry args={[capRadius, 56, 16]} />
      </mesh>
      <mesh material={darkMaterial} position-y={half + radius * 0.13}>
        <cylinderGeometry
          args={[radius * 0.2, radius * 0.24, Math.max(0.025, radius * 0.06), 24]}
        />
      </mesh>
    </>
  )
}

function IndustrialCylinderDetail({
  contract,
  height,
  radius,
}: {
  contract: ReturnType<typeof industrialRenderContractFromMetadata>
  height: number
  radius: number
}) {
  const detail = industrialDetailKind(contract)
  const bandMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#6b7280',
        metalness: 0.72,
        roughness: 0.28,
      }),
    [],
  )
  const darkMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#111827',
        metalness: 0.32,
        roughness: 0.68,
      }),
    [],
  )

  if (!detail) return null

  const outerRadius = radius * 1.012
  const tubeRadius = Math.max(0.006, radius * 0.018)
  const half = height / 2

  if (detail === 'column-shell') {
    return (
      <DistillationColumnShellKernel
        bandMaterial={bandMaterial}
        darkMaterial={darkMaterial}
        height={height}
        radius={radius}
      />
    )
  }

  if (detail === 'cylindrical-shell') {
    return (
      <>
        <RingBand material={bandMaterial} radius={outerRadius} tubeRadius={tubeRadius} y={-half} />
        <RingBand material={bandMaterial} radius={outerRadius} tubeRadius={tubeRadius} y={0} />
        <RingBand material={bandMaterial} radius={outerRadius} tubeRadius={tubeRadius} y={half} />
      </>
    )
  }

  if (detail === 'pipe-run' || detail === 'heat-exchanger') {
    return (
      <>
        <RingBand material={bandMaterial} radius={outerRadius} tubeRadius={tubeRadius} y={-half} />
        <RingBand material={bandMaterial} radius={outerRadius} tubeRadius={tubeRadius} y={half} />
        {detail === 'heat-exchanger' ? (
          <RingBand material={bandMaterial} radius={outerRadius} tubeRadius={tubeRadius} y={0} />
        ) : null}
      </>
    )
  }

  if (detail === 'flanged-connection') {
    return (
      <>
        <RingBand
          material={bandMaterial}
          radius={radius * 1.18}
          tubeRadius={Math.max(0.008, radius * 0.04)}
          y={-half}
        />
        <RingBand
          material={bandMaterial}
          radius={radius * 1.18}
          tubeRadius={Math.max(0.008, radius * 0.04)}
          y={half}
        />
        <BoltCircle material={darkMaterial} radius={radius * 1.2} y={-half} />
        <BoltCircle material={darkMaterial} radius={radius * 1.2} y={half} />
      </>
    )
  }

  if (detail === 'ribbed-motor') {
    return (
      <>
        {[-0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36].map((factor) => (
          <RingBand
            key={factor}
            material={bandMaterial}
            radius={outerRadius}
            tubeRadius={Math.max(0.006, radius * 0.026)}
            y={height * factor}
          />
        ))}
      </>
    )
  }

  return null
}

function CylinderSolid({
  node,
  renderContract,
}: {
  node: CylinderNode
  renderContract: ReturnType<typeof industrialRenderContractFromMetadata>
}) {
  const instancedRef = useRef<THREE.InstancedMesh>(null)
  const shading = useViewer((state) => state.shading)

  const material = useMemo(() => {
    const presetMaterial = createMaterialFromPresetRef(node.materialPreset, shading)
    if (presetMaterial) return createIndustrialMaterial(renderContract, presetMaterial)
    const mat = node.material
    const baseMaterial = mat
      ? createMaterial(mat, shading)
      : createDefaultMaterial('#cccccc', 1, shading)
    return createIndustrialMaterial(renderContract, baseMaterial)
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
        createCylinderGeometry({
          radius: node.radius ?? 0.5,
          height: node.height ?? 1.0,
          radialSegments: node.radialSegments ?? 32,
          wallThickness: node.wallThickness,
        }),
      ),
    [node.radius, node.height, node.radialSegments, node.wallThickness],
  )
  const instances = primitivePatternInstances(node.metadata)

  useLayoutEffect(() => {
    applyInstanceMatrices(instancedRef.current, instances)
  }, [instances])

  return instances.length > 1 ? (
    <instancedMesh
      args={[geometry, material, instances.length]}
      castShadow
      name="cylinder-solid-instances"
      receiveShadow
      ref={instancedRef}
    />
  ) : (
    <mesh castShadow geometry={geometry} material={material} name="cylinder-solid" receiveShadow />
  )
}

export const CylinderRenderer = ({ node }: { node: CylinderNode }) => {
  const ref = useRef<THREE.Group>(null!)
  const handlers = useNodeEvents(node, 'cylinder')
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const previewSelectedIds = useViewer((state) => state.previewSelectedIds)
  const hoveredId = useViewer((state) => state.hoveredId)
  const renderContract = useMemo(
    () => industrialRenderContractFromMetadata(node.metadata),
    [node.metadata],
  )
  const instances = primitivePatternInstances(node.metadata)
  const renderBaseIndividually =
    !canBatchCylinderBase(node) ||
    selectedIds.includes(node.id) ||
    previewSelectedIds.includes(node.id) ||
    hoveredId === node.id
  const detailKind = industrialDetailKind(renderContract)
  const effectKind = industrialSurfaceEffectKind(renderContract)

  useRegistry(node.id, 'cylinder', ref)

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
      {renderBaseIndividually ? (
        <CylinderSolid node={node} renderContract={renderContract} />
      ) : null}
      {instances.length <= 1 && detailKind ? (
        <IndustrialCylinderDetail
          contract={renderContract}
          height={node.height ?? 1.0}
          radius={node.radius ?? 0.5}
        />
      ) : null}
      {instances.length <= 1 && effectKind ? (
        <IndustrialCylinderEffect
          contract={renderContract}
          height={node.height ?? 1.0}
          radius={node.radius ?? 0.5}
        />
      ) : null}
    </group>
  )
}

export default CylinderRenderer
