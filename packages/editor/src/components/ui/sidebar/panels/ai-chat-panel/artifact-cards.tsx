'use client'

import type { AssetInput, Vec3 } from '@pascal-app/core'
import { Icon } from '@iconify/react'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import type * as React from 'react'
import * as THREE from 'three'
import {
  clampD,
  clampR,
  toAssemblyLocalPosition,
  type GeneratedGeometryArtifact,
  type GeneratedGeometryShapeSpec as ShapeSpec,
} from '../../../../../lib/ai-generated-geometry'
import { cn } from '../../../../../lib/utils'
import type { ArticraftResult, FactoryRunSummary, GeneratedModelArtifact } from './types'

function getShapeColor(shape: ShapeSpec) {
  const material = shape.material
  if (material?.properties && typeof material.properties.color === 'string') {
    return material.properties.color
  }
  if (material && 'color' in material && typeof material.color === 'string') return material.color
  if (shape.material?.preset === 'wood' || shape.materialPreset === 'wood') return '#a36b3f'
  if (shape.material?.preset === 'metal' || shape.materialPreset === 'metal') return '#9ca3af'
  if (shape.material?.preset === 'glass' || shape.materialPreset === 'glass') return '#8bd3ff'
  return '#a684ff'
}

const DEFAULT_EXTRUDE_PROFILE: [number, number][] = [
  [-0.5, -0.25],
  [0.5, -0.25],
  [0.5, 0.25],
  [-0.5, 0.25],
]

const DEFAULT_LATHE_PROFILE: [number, number][] = [
  [0, 0],
  [0.5, 1],
]

function profileBounds(profile: [number, number][]) {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const [x, y] of profile) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  return { minX, maxX, minY, maxY }
}

function centerPreviewGeometry(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) return geometry
  const center = new THREE.Vector3()
  box.getCenter(center)
  geometry.translate(-center.x, -center.y, -center.z)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function extrudeProfileToShape(profile: [number, number][] | undefined) {
  const points = profile?.length ? profile : DEFAULT_EXTRUDE_PROFILE
  const first = points[0]
  const threeShape = new THREE.Shape()
  threeShape.moveTo(first?.[0] ?? -0.5, first?.[1] ?? -0.25)
  for (const [x, y] of points.slice(1)) threeShape.lineTo(x, y)
  threeShape.closePath()
  return threeShape
}

function addExtrudeHolesToShape(
  threeShape: THREE.Shape,
  holes: [number, number][][] | undefined,
) {
  for (const hole of holes ?? []) {
    const first = hole[0]
    if (!first) continue
    const path = new THREE.Path()
    path.moveTo(first[0], first[1])
    for (const [x, y] of hole.slice(1)) path.lineTo(x, y)
    path.closePath()
    threeShape.holes.push(path)
  }
  return threeShape
}

function getShapeDimensions(shape: ShapeSpec): Vec3 {
  switch (shape.kind) {
    case 'box':
    case 'wedge':
    case 'trapezoid-prism':
      return [clampD(shape.length, 1), clampD(shape.height, 1), clampD(shape.width, 1)]
    case 'rounded-panel':
      return [clampD(shape.length, 1), clampD(shape.thickness ?? shape.height, 0.04), clampD(shape.width, 0.5)]
    case 'cylinder':
    case 'hollow-cylinder':
    case 'cone':
    case 'capsule':
    case 'half-cylinder': {
      const radius = clampR(shape.radius, 0.5)
      const height = clampD(shape.height, 1)
      const axis = shape.axis ?? 'y'
      if (axis === 'x') return [height, radius * 2, radius * 2]
      if (axis === 'z') return [radius * 2, radius * 2, height]
      return [radius * 2, height, radius * 2]
    }
    case 'frustum': {
      const radius = Math.max(clampD(shape.radiusTop, 0.25), clampD(shape.radiusBottom, 0.5))
      const height = clampD(shape.height, 1)
      const axis = shape.axis ?? 'y'
      if (axis === 'x') return [height, radius * 2, radius * 2]
      if (axis === 'z') return [radius * 2, radius * 2, height]
      return [radius * 2, height, radius * 2]
    }
    case 'torus': {
      const radius = (shape.majorRadius ?? shape.radius ?? 0.5) + (shape.tubeRadius ?? 0.08)
      return [radius * 2, radius * 2, radius * 2]
    }
    case 'sphere':
    case 'hemisphere': {
      const radius = clampR(shape.radius, 0.5)
      const scale = shape.scale ?? [1, 1, 1]
      return [radius * 2 * scale[0], radius * 2 * scale[1], radius * 2 * scale[2]]
    }
    case 'lathe': {
      const profile = (shape.profile as [number, number][] | undefined) ?? DEFAULT_LATHE_PROFILE
      const { minX, maxX, minY, maxY } = profileBounds(profile)
      const radius = Math.max(Math.abs(minX), Math.abs(maxX), 0.01)
      return [radius * 2, Math.max(0.01, maxY - minY), radius * 2]
    }
    case 'extrude': {
      const profile = (shape.profile as [number, number][] | undefined) ?? DEFAULT_EXTRUDE_PROFILE
      const { minX, maxX, minY, maxY } = profileBounds(profile)
      return [
        Math.max(0.01, maxX - minX),
        Math.max(0.01, maxY - minY),
        clampD(shape.depth ?? shape.width, 0.1, 0.005, 10),
      ]
    }
    case 'sweep': {
      const path = shape.path ?? [
        [-0.5, 0, 0],
        [0.5, 0, 0],
      ]
      const radius = clampR(shape.radius, 0.05)
      let minX = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY
      let minZ = Number.POSITIVE_INFINITY
      let maxZ = Number.NEGATIVE_INFINITY
      for (const [x, y, z] of path) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
      return [
        Math.max(0.01, maxX - minX + radius * 2),
        Math.max(0.01, maxY - minY + radius * 2),
        Math.max(0.01, maxZ - minZ + radius * 2),
      ]
    }
    default:
      return [1, 1, 1]
  }
}

function GeneratedExtrudePreviewShape({
  color,
  position,
  rotation,
  shape,
}: {
  color: string
  position: Vec3
  rotation: Vec3
  shape: ShapeSpec
}) {
  const geometry = useMemo(() => {
    const bevelSize = shape.bevelSize ?? 0.001
    const bevelThickness = shape.bevelThickness ?? bevelSize
    const geometry = new THREE.ExtrudeGeometry(
      addExtrudeHolesToShape(
        extrudeProfileToShape(shape.profile as [number, number][] | undefined),
        shape.holes as [number, number][][] | undefined,
      ),
      {
        depth: clampD(shape.depth ?? shape.width, 0.1, 0.005, 10),
        bevelEnabled: bevelSize > 0 || bevelThickness > 0,
        bevelSize,
        bevelThickness,
        bevelSegments: shape.bevelSegments != null ? Math.round(clampD(shape.bevelSegments, 2, 0, 8)) : 1,
        curveSegments: shape.curveSegments != null ? Math.round(clampD(shape.curveSegments, 8, 1, 32)) : 8,
      },
    )
    return centerPreviewGeometry(geometry)
  }, [
    shape.profile,
    shape.holes,
    shape.depth,
    shape.width,
    shape.bevelSize,
    shape.bevelThickness,
    shape.bevelSegments,
    shape.curveSegments,
  ])

  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      <meshStandardMaterial color={color} metalness={0.25} roughness={0.55} />
    </mesh>
  )
}

function GeneratedLathePreviewShape({
  color,
  position,
  rotation,
  shape,
}: {
  color: string
  position: Vec3
  rotation: Vec3
  shape: ShapeSpec
}) {
  const geometry = useMemo(() => {
    const profile = (shape.profile as [number, number][] | undefined) ?? DEFAULT_LATHE_PROFILE
    const points = profile.map(([radius, y]) => new THREE.Vector2(radius, y))
    const geometry = new THREE.LatheGeometry(
      points,
      shape.segments != null ? Math.round(clampD(shape.segments, 32, 8, 96)) : 32,
      0,
      shape.arc != null ? clampD(shape.arc, Math.PI * 2, 0.01, Math.PI * 2) : Math.PI * 2,
    )
    return centerPreviewGeometry(geometry)
  }, [shape.profile, shape.segments, shape.arc])

  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      <meshStandardMaterial color={color} metalness={0.25} roughness={0.55} />
    </mesh>
  )
}

function GeneratedSweepPreviewShape({
  color,
  position,
  rotation,
  shape,
}: {
  color: string
  position: Vec3
  rotation: Vec3
  shape: ShapeSpec
}) {
  const geometry = useMemo(() => {
    const path = shape.path?.length
      ? shape.path
      : ([
          [-0.5, 0, 0],
          [0.5, 0, 0],
        ] as Vec3[])
    const curve = new THREE.CatmullRomCurve3(path.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
    const geometry = new THREE.TubeGeometry(
      curve,
      shape.tubularSegments != null ? Math.round(clampD(shape.tubularSegments, 32, 2, 128)) : 32,
      clampR(shape.radius, 0.05),
      shape.radialSegments != null ? Math.round(clampD(shape.radialSegments, 12, 3, 32)) : 12,
      Boolean(shape.closed),
    )
    return centerPreviewGeometry(geometry)
  }, [shape.path, shape.tubularSegments, shape.radius, shape.radialSegments, shape.closed])

  return (
    <mesh geometry={geometry} position={position} rotation={rotation}>
      <meshStandardMaterial color={color} roughness={0.72} />
    </mesh>
  )
}

function getArtifactMaxDimension(artifact: GeneratedGeometryArtifact) {
  let maxDimension = 1
  artifact.shapes.forEach((shape, index) => {
    const dims = getShapeDimensions(shape)
    const position = artifact.transforms[index]?.position ?? shape.position
    maxDimension = Math.max(
      maxDimension,
      Math.abs(position[0] - artifact.assemblyPosition[0]) + dims[0],
      Math.abs(position[1] - artifact.assemblyPosition[1]) + dims[1],
      Math.abs(position[2] - artifact.assemblyPosition[2]) + dims[2],
    )
  })
  return maxDimension
}

function GeneratedPreviewShape({
  artifact,
  index,
  shape,
}: {
  artifact: GeneratedGeometryArtifact
  index: number
  shape: ShapeSpec
}) {
  const transform = artifact.transforms[index]
  const position = transform
    ? toAssemblyLocalPosition(transform.position, artifact.assemblyPosition)
    : toAssemblyLocalPosition(shape.position, artifact.assemblyPosition)
  const rotation = transform?.rotation ?? shape.rotation ?? [0, 0, 0]
  const color = getShapeColor(shape)

  if (shape.kind === 'sphere' || shape.kind === 'hemisphere') {
    return (
      <mesh position={position} rotation={rotation} scale={shape.scale ?? [1, 1, 1]}>
        <sphereGeometry args={[clampR(shape.radius, 0.5), 24, shape.kind === 'hemisphere' ? 12 : 16]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
    )
  }

  if (shape.kind === 'cylinder' || shape.kind === 'hollow-cylinder' || shape.kind === 'capsule' || shape.kind === 'half-cylinder') {
    return (
      <mesh position={position} rotation={rotation}>
        <cylinderGeometry args={[clampR(shape.radius, 0.5), clampR(shape.radius, 0.5), clampD(shape.height, 1), 28]} />
        <meshStandardMaterial color={color} roughness={0.72} wireframe={shape.kind === 'hollow-cylinder'} />
      </mesh>
    )
  }

  if (shape.kind === 'cone') {
    return (
      <mesh position={position} rotation={rotation}>
        <coneGeometry args={[clampR(shape.radius, 0.5), clampD(shape.height, 1), 28]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
    )
  }

  if (shape.kind === 'frustum') {
    return (
      <mesh position={position} rotation={rotation}>
        <cylinderGeometry args={[clampD(shape.radiusTop, 0.25), clampD(shape.radiusBottom, 0.5), clampD(shape.height, 1), 28]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
    )
  }

  if (shape.kind === 'torus') {
    return (
      <mesh position={position} rotation={rotation}>
        <torusGeometry args={[clampD(shape.majorRadius ?? shape.radius, 0.5), clampD(shape.tubeRadius, 0.08), 12, 40]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
    )
  }

  if (shape.kind === 'extrude') {
    return <GeneratedExtrudePreviewShape color={color} position={position} rotation={rotation} shape={shape} />
  }

  if (shape.kind === 'lathe') {
    return <GeneratedLathePreviewShape color={color} position={position} rotation={rotation} shape={shape} />
  }

  if (shape.kind === 'sweep') {
    return <GeneratedSweepPreviewShape color={color} position={position} rotation={rotation} shape={shape} />
  }

  const [x, y, z] = getShapeDimensions(shape)
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={[x, y, z]} />
      <meshStandardMaterial color={color} roughness={0.72} />
    </mesh>
  )
}

function GeneratedGeometryPreview({ artifact }: { artifact: GeneratedGeometryArtifact }) {
  const cameraDistance = useMemo(() => Math.max(3, getArtifactMaxDimension(artifact) * 1.8), [artifact])

  return (
    <div
      aria-label={`Generated geometry preview for ${artifact.title}. Drag with the right mouse button to rotate.`}
      className="h-36 overflow-hidden rounded-lg border border-border/60 bg-black/20"
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas camera={{ position: [cameraDistance, cameraDistance * 0.7, cameraDistance], fov: 42 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.7} />
        <directionalLight intensity={1.8} position={[3, 5, 4]} />
        <group>
          {artifact.shapes.map((shape, index) => (
            <GeneratedPreviewShape artifact={artifact} index={index} key={`${artifact.id}-${index}`} shape={shape} />
          ))}
        </group>
        <OrbitControls
          enablePan={false}
          makeDefault
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        />
      </Canvas>
    </div>
  )
}

function getGeometryArtifactStatus(artifact: GeneratedGeometryArtifact) {
  if (artifact.supersededBy) return `Replaced by ${artifact.supersededBy.slice(-6)}`
  if (artifact.replacedAt) return 'Replaced on canvas'
  if (artifact.placedAt && artifact.savedAt) return 'Placed and saved'
  if (artifact.savedAt) return 'Saved'
  if (artifact.placedAt) return 'Placed'
  return 'Ready'
}

function GeneratedGeometryStaticPreview({ artifact }: { artifact: GeneratedGeometryArtifact }) {
  const colors = artifact.shapes.slice(0, 4).map(getShapeColor)

  return (
    <div className="relative h-36 overflow-hidden rounded-lg border border-border/50 bg-[radial-gradient(circle_at_30%_25%,rgba(166,132,255,0.22),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0))]">
      <div className="absolute inset-0 flex items-center justify-center gap-1.5">
        {(colors.length > 0 ? colors : ['#a684ff']).map((color, index) => (
          <span
            className="block rounded-md border border-white/15 shadow-lg"
            key={`${color}-${index}`}
            style={{
              backgroundColor: color,
              height: `${44 + index * 10}px`,
              transform: `translateY(${index % 2 === 0 ? -6 : 6}px) rotate(${index * 8}deg)`,
              width: `${34 + index * 8}px`,
            }}
          />
        ))}
      </div>
      <div className="absolute right-2 bottom-2 rounded-full border border-border/60 bg-background/75 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
        {'\u9759\u6001\u9884\u89c8'}
      </div>
    </div>
  )
}

function GeneratedArtifactCardShell({
  title,
  meta,
  status,
  preview,
  details,
  hint,
  actions,
}: {
  title: string
  meta: React.ReactNode
  status: string
  preview: React.ReactNode
  details?: React.ReactNode
  hint: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-background/60 p-2 text-foreground shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">{title}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{meta}</div>
        </div>
        <span className="shrink-0 rounded-full border border-[#a684ff]/40 bg-[#a684ff]/10 px-1.5 py-0.5 text-[10px] text-[#c8b6ff]">
          {status}
        </span>
      </div>

      {preview}

      {details}

      <div className="rounded-lg border border-border/50 bg-accent/20 px-2 py-1 text-[10px] text-muted-foreground">
        {hint}
      </div>

      {actions}
    </div>
  )
}

type GeometryProfileDetailsModel = {
  profileId?: string
  profileSource?: string
  sourcePack?: string
  family?: string
  layoutFamily?: string
  quality?: number
  requiredCoverage?: number
  primaryPresent?: boolean
  requiredRoles: string[]
  missingRoles: string[]
  warnings: string[]
  issues: string[]
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function sourcePackLabel(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const id = stringValue(record.id)
  const version = stringValue(record.version)
  return id ? `${id}${version ? `@${version}` : ''}` : undefined
}

function roleTokens(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized ? [normalized, ...normalized.split('_').filter((token) => token.length > 2)] : []
}

function buildGeometryProfileDetails(artifact: GeneratedGeometryArtifact): GeometryProfileDetailsModel | null {
  const sourceArgs = artifact.sourceArgs ?? {}
  const draft = sourceArgs.deviceProfileDraft
  const embedded = sourceArgs.__deviceProfileDefinition
  const profileId =
    stringValue(sourceArgs.deviceProfile) ??
    (draft && typeof draft === 'object' ? stringValue((draft as Record<string, unknown>).id) : undefined) ??
    (embedded && typeof embedded === 'object'
      ? stringValue((embedded as Record<string, unknown>).id)
      : undefined)
  const profileSource = stringValue(sourceArgs.profileSource)
  const quality = artifact.profileQuality
  const sourcePack = sourcePackLabel(sourceArgs.sourcePack)
  const parts = Array.isArray(sourceArgs.parts) ? (sourceArgs.parts as Record<string, unknown>[]) : []
  const requiredRoles = parts
    .filter((part) => part && typeof part === 'object' && part.required === true)
    .map((part) => stringValue(part.semanticRole))
    .filter(Boolean) as string[]
  const shapeTokens = artifact.shapes.flatMap((shape) => [
    ...roleTokens(shape.semanticRole),
    ...roleTokens(shape.sourcePartKind),
  ])
  const missingRoles = requiredRoles.filter((role) => {
    const tokens = roleTokens(role)
    return !tokens.some((token) => shapeTokens.includes(token))
  })
  const hasAnyDetails =
    profileId ||
    profileSource ||
    quality ||
    requiredRoles.length > 0 ||
    stringValue(sourceArgs.family) ||
    stringValue(sourceArgs.layoutFamily)
  if (!hasAnyDetails) return null
  return {
    profileId,
    profileSource,
    sourcePack,
    family: stringValue(sourceArgs.family),
    layoutFamily: stringValue(sourceArgs.layoutFamily),
    quality: typeof quality?.overallScore === 'number' ? quality.overallScore : undefined,
    requiredCoverage:
      typeof quality?.metrics?.requiredCoverage === 'number'
        ? quality.metrics.requiredCoverage
        : requiredRoles.length > 0
          ? (requiredRoles.length - missingRoles.length) / requiredRoles.length
          : undefined,
    primaryPresent:
      typeof quality?.metrics?.primaryPresent === 'number'
        ? quality.metrics.primaryPresent >= 1
        : undefined,
    requiredRoles,
    missingRoles,
    warnings: quality?.warnings ?? [],
    issues: quality?.issues ?? [],
  }
}

function percentLabel(value: number | undefined) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '-'
}

function GeometryProfileDetails({ details }: { details: GeometryProfileDetailsModel }) {
  const sourceLabel = details.sourcePack
    ? `${details.profileSource ?? 'profile'} · ${details.sourcePack}`
    : details.profileSource
  return (
    <div className="space-y-1.5 rounded-lg border border-sky-400/20 bg-sky-400/5 px-2 py-1.5 text-[10px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 text-sky-200">
          <Icon className="size-3" icon="mdi:database-search-outline" />
          {details.profileId ?? 'draft profile'}
        </span>
        {sourceLabel ? <span>{sourceLabel}</span> : null}
        {details.family ? <span>family={details.family}</span> : null}
        {details.layoutFamily ? <span>layout={details.layoutFamily}</span> : null}
      </div>
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <div>质量 {percentLabel(details.quality)}</div>
        <div>必需角色 {percentLabel(details.requiredCoverage)}</div>
        <div>主形体 {details.primaryPresent === false ? '缺失' : '命中'}</div>
      </div>
      {details.requiredRoles.length > 0 ? (
        <div className="truncate">
          required: {details.requiredRoles.slice(0, 6).join(', ')}
          {details.requiredRoles.length > 6 ? '...' : ''}
        </div>
      ) : null}
      {details.missingRoles.length > 0 ? (
        <div className="text-amber-300">缺失: {details.missingRoles.slice(0, 5).join(', ')}</div>
      ) : null}
      {details.issues.length > 0 || details.warnings.length > 0 ? (
        <div className="truncate text-amber-300">
          {details.issues[0] ?? details.warnings[0]}
        </div>
      ) : null}
    </div>
  )
}

export function GeneratedGeometryCard({
  artifact,
  disabled,
  interactivePreview = true,
  onPlace,
  onReplace,
  onSave,
}: {
  artifact: GeneratedGeometryArtifact
  disabled: boolean
  interactivePreview?: boolean
  onPlace: (artifact: GeneratedGeometryArtifact) => void
  onReplace: (artifact: GeneratedGeometryArtifact) => void
  onSave: (artifact: GeneratedGeometryArtifact) => void
}) {
  const canSave = !artifact.savedAt && !artifact.supersededBy
  const canPlace = !artifact.supersededBy
  const canReplace = Boolean(artifact.replaceNodeIds?.length && !artifact.replacedAt && !artifact.supersededBy)
  const profileDetails = buildGeometryProfileDetails(artifact)

  return (
    <GeneratedArtifactCardShell
      actions={
        <div className="grid grid-cols-2 gap-1.5">
          {canReplace ? (
            <button
              className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-400/10 px-2 py-1.5 text-[11px] text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onClick={() => onReplace(artifact)}
              type="button"
            >
              <Icon className="size-3.5" icon="mdi:swap-horizontal-bold" />
              Replace previous canvas version
            </button>
          ) : null}
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#a684ff]/50 bg-[#a684ff]/15 px-2 py-1.5 text-[11px] text-foreground transition-colors hover:bg-[#a684ff]/25 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled || !canPlace}
            onClick={() => onPlace(artifact)}
            type="button"
          >
            <Icon className="size-3.5" icon="mdi:arrow-decision-outline" />
            {artifact.placedAt ? 'Place again' : 'Place on canvas'}
          </button>
          <button
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-amber-400/50 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled || !canSave}
            onClick={() => onSave(artifact)}
            type="button"
          >
            <Icon className="size-3.5" icon="mdi:archive-plus-outline" />
            {artifact.savedAt ? 'Saved' : 'Save to library'}
          </button>
        </div>
      }
      hint={
        interactivePreview
          ? 'Drag the preview to rotate. If it is not right, keep typing revision notes and I will use this geometry as context.'
          : 'Older preview is static. The latest generated result remains interactive.'
      }
      details={profileDetails ? <GeometryProfileDetails details={profileDetails} /> : undefined}
      meta={`${artifact.createdNames.length} parts · ${artifact.sourceTool} · v${artifact.version}`}
      preview={
        interactivePreview ? (
          <GeneratedGeometryPreview artifact={artifact} />
        ) : (
          <GeneratedGeometryStaticPreview artifact={artifact} />
        )
      }
      status={getGeometryArtifactStatus(artifact)}
      title={artifact.title}
    />
  )
}


function getModelArtifactStatus(artifact: GeneratedModelArtifact) {
  if (artifact.placedAt && artifact.savedAt) return '\u5df2\u653e\u7f6e \u00b7 \u5df2\u5b58\u5165\u8d44\u6599\u5e93'
  if (artifact.savedAt) return '\u5df2\u5b58\u5165\u8d44\u6599\u5e93'
  if (artifact.placedAt) return '\u5df2\u653e\u7f6e'
  return '\u8349\u7a3f'
}

function GeneratedModelScene({ asset }: { asset: AssetInput }) {
  const gltf = useGLTF(asset.src)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const dimensions = Array.isArray(asset.dimensions) ? asset.dimensions : [1, 1, 1]
  const maxDimension = Math.max(0.1, dimensions[0] ?? 1, dimensions[1] ?? 1, dimensions[2] ?? 1)
  const scale = 1.7 / maxDimension

  return <primitive object={scene} scale={scale} />
}

export function GeneratedModelPreview({ artifact }: { artifact: GeneratedModelArtifact }) {
  return (
    <div
      aria-label={`Generated model preview for ${artifact.title}. Drag with the right mouse button to rotate.`}
      className="h-36 overflow-hidden rounded-lg border border-border/60 bg-black/20"
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas camera={{ position: [2.6, 1.8, 2.6], fov: 42 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.85} />
        <directionalLight intensity={1.8} position={[3, 5, 4]} />
        <Suspense
          fallback={
            <mesh>
              <boxGeometry args={[0.8, 0.8, 0.8]} />
              <meshStandardMaterial color="#a684ff" wireframe />
            </mesh>
          }
        >
          <GeneratedModelScene asset={artifact.asset} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          makeDefault
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        />
      </Canvas>
    </div>
  )
}

export function articraftResultToModelArtifact(result: ArticraftResult): GeneratedModelArtifact | null {
  if (!result.asset) return null
  return {
    id: `articraft-${result.recordId}`,
    title: result.name,
    sourceTool: 'articraft',
    provider: 'Articraft',
    asset: result.asset,
    userPrompt: result.prompt,
    createdAt: result.savedAt ?? new Date().toISOString(),
    placedAt: result.status === 'imported' ? result.savedAt : undefined,
    savedAt: result.savedAt,
  }
}

export function GeneratedModelCard({
  artifact,
  disabled,
  onPlace,
  onSave,
}: {
  artifact: GeneratedModelArtifact
  disabled: boolean
  onPlace: (artifact: GeneratedModelArtifact) => void
  onSave: (artifact: GeneratedModelArtifact) => void
}) {
  const canSave = !artifact.savedAt
  const toolLabel = 'Image to 3D'

  return (
    <GeneratedArtifactCardShell
      actions={
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#a684ff]/50 bg-[#a684ff]/15 px-2 py-1.5 text-[11px] text-foreground transition-colors hover:bg-[#a684ff]/25 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onClick={() => onPlace(artifact)}
              type="button"
            >
              <Icon className="size-3.5" icon="mdi:arrow-decision-outline" />
              {artifact.placedAt ? '\u518d\u6b21\u653e\u5230\u753b\u5e03' : '\u653e\u5230\u753b\u5e03'}
            </button>
            <button
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-amber-400/50 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled || !canSave}
              onClick={() => onSave(artifact)}
              type="button"
            >
              <Icon className="size-3.5" icon="mdi:archive-plus-outline" />
              {artifact.savedAt ? '\u5df2\u4fdd\u5b58' : '\u5b58\u5230\u8d44\u6599\u5e93'}
            </button>
          </div>
        </div>
      }
      hint={'\u4fdd\u5b58\u5230\u8d44\u6599\u5e93\u540e\uff0c\u53ef\u4ee5\u5728\u51e0\u4f55\u642d\u5efa\u4e2d\u91cd\u590d\u4f7f\u7528\u8fd9\u4e2a\u6a21\u578b'}
      meta={`${toolLabel} \u00b7 ${artifact.asset.category ?? 'equipment'}`}
      preview={<GeneratedModelPreview artifact={artifact} />}
      status={getModelArtifactStatus(artifact)}
      title={artifact.title}
    />
  )
}

export function FactoryRunSummaryCard({
  disabled,
  onApply,
  onResourceOptionSelect,
  summary,
}: {
  disabled?: boolean
  onApply?: () => void
  onResourceOptionSelect?: (option: NonNullable<FactoryRunSummary['resourceOptions']>[number]) => void
  summary: FactoryRunSummary
}) {
  const waitingForApply = Boolean(onApply)
  const statusClass =
    waitingForApply
      ? 'border-sky-400/40 bg-sky-400/10 text-sky-200'
      : summary.status === 'succeeded'
      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
      : summary.status === 'failed'
        ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
        : summary.status === 'cancelled'
          ? 'border-border/60 bg-accent/30 text-muted-foreground'
          : 'border-sky-400/40 bg-sky-400/10 text-sky-200'
  const statusIcon =
    waitingForApply
      ? 'mdi:cursor-default-click-outline'
      : summary.status === 'succeeded'
      ? 'mdi:check-circle-outline'
      : summary.status === 'failed'
        ? 'mdi:alert-circle-outline'
        : summary.status === 'cancelled'
          ? 'mdi:cancel'
          : summary.status === 'needs_input'
            ? 'mdi:cursor-default-click-outline'
          : 'mdi:progress-clock'
  const statusLabel =
    waitingForApply
      ? '\u5f85\u5e94\u7528'
      : summary.status === 'running'
      ? '\u8fdb\u884c\u4e2d'
      : summary.status === 'succeeded'
        ? '\u5b8c\u6210'
        : summary.status === 'cancelled'
          ? '\u5df2\u53d6\u6d88'
          : summary.status === 'needs_input'
            ? '\u5f85\u5904\u7406'
            : '\u9700\u68c0\u67e5'
  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-background/60 p-2 text-foreground shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Icon className="size-3.5 text-[#a684ff]" icon={summary.icon ?? 'mdi:factory'} />
            <span className="truncate">{summary.title}</span>
          </div>
          <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {summary.description}
          </div>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]', statusClass)}>
          <Icon className={cn('size-3', summary.status === 'running' && 'animate-spin')} icon={statusIcon} />
          {statusLabel}
        </span>
      </div>

      <div className="space-y-1">
        {summary.steps.map((step, index) => {
          const stepClass =
            step.status === 'done'
              ? 'text-emerald-300'
              : step.status === 'failed'
                ? 'text-amber-300'
                : step.status === 'running'
                  ? 'text-sky-300'
                  : 'text-muted-foreground'
          const icon =
            step.status === 'done'
              ? 'mdi:check'
              : step.status === 'failed'
                ? 'mdi:alert'
                : step.status === 'running'
                  ? 'mdi:loading'
                  : 'mdi:circle-outline'
          return (
            <div className={cn('flex items-center gap-1.5 text-[11px]', stepClass)} key={`${step.label}-${index}`}>
              <Icon className={cn('size-3.5 shrink-0', step.status === 'running' && 'animate-spin')} icon={icon} />
              <span className="min-w-0 flex-1 truncate">{step.label}</span>
            </div>
          )
        })}
      </div>

      {summary.metrics.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {summary.metrics.map((metric) => (
            <div className="rounded-lg border border-border/50 bg-accent/20 px-2 py-1" key={metric.label}>
              <div className="text-[9px] text-muted-foreground">{metric.label}</div>
              <div className="truncate text-[11px] font-medium text-foreground">{metric.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {onApply ? (
        <button
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-400/35 bg-emerald-400/10 px-2 py-1.5 text-[11px] font-medium text-emerald-100 transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={onApply}
          type="button"
        >
          <Icon className="size-3.5" icon="mdi:check-decagram-outline" />
          {'\u5e94\u7528\u5230\u753b\u5e03'}
        </button>
      ) : null}

      {summary.resourceOptions?.length ? (
        <div className="space-y-1.5">
          {summary.resourceOptions.map((option) => (
            <div
              className={cn(
                'rounded-lg border px-2 py-1.5',
                option.recommended
                  ? 'border-sky-400/40 bg-sky-400/10'
                  : 'border-border/50 bg-accent/15',
              )}
              key={option.id}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <span className="truncate">{option.label}</span>
                {option.recommended ? (
                  <span className="shrink-0 rounded border border-sky-400/40 px-1 py-0.5 text-[9px] text-sky-200">{'\u63a8\u8350'}</span>
                ) : null}
              </div>
              <div className="mt-1 text-[10px] leading-snug text-muted-foreground">
                {option.description}
              </div>
              {option.actionHref ? (
                <a
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-md border border-sky-400/35 bg-sky-400/10 px-2 py-1 text-[10px] font-medium text-sky-100 transition-colors hover:bg-sky-400/20"
                  href={option.actionHref}
                >
                  <Icon className="size-3" icon="mdi:package-variant-closed" />
                  {option.actionLabel ?? option.label}
                </a>
              ) : onResourceOptionSelect ? (
                <button
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-md border border-sky-400/35 bg-sky-400/10 px-2 py-1 text-[10px] font-medium text-sky-100 transition-colors hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => onResourceOptionSelect(option)}
                  type="button"
                >
                  <Icon className="size-3" icon="mdi:cube-send" />
                  {'\u751f\u6210'}
                  {option.label}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {summary.details ? (
        <details className="rounded-lg border border-border/50 bg-accent/15 px-2 py-1 text-[10px] text-muted-foreground">
          <summary className="cursor-pointer select-none text-[10px] text-muted-foreground">{'\u8c03\u8bd5\u8be6\u60c5'}</summary>
          <div className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[9px] leading-relaxed">
            {summary.details}
          </div>
        </details>
      ) : null}
    </div>
  )
}
