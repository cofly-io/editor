import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Vec3 } from '@pascal-app/core/lib/primitive-compose'
import {
  computeGeneratedAssemblyPosition,
  createGeneratedGeometryId,
  formatGeneratedShapeDetails,
  type GeneratedGeometryArtifact,
  type GeneratedGeometryShapeSpec,
} from '../../../../packages/editor/src/lib/ai-generated-geometry-core'
import type {
  GeneratedGeometryCreatePatch,
  GeneratedGeometryPlacementSpec,
} from '../../../../packages/editor/src/lib/ai-generated-geometry-nodes'
import { buildGeneratedGeometryCreatePatches } from '../../../../packages/editor/src/lib/ai-generated-geometry-nodes'
import {
  installedAssetComponentPackDirsSync,
  installedAssetIndustryPackDirsSync,
} from '../asset-packs'
import { stationDisplayLabel } from './process-line-localization'
import type {
  FactoryRouteObstacleMetadata,
  ProcessEquipmentContract,
  ProcessStationPlan,
  StationPlacement,
} from './process-line-types'

type ComponentGeneratorPart = {
  id?: string
  kind?: string
  semanticRole?: string
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  height?: number
  radius?: number
  topRadius?: number
  warningStripes?: boolean
  stripeCount?: number
  stripeHeight?: number
  wallThickness?: number
  material?: {
    color?: string
    opacity?: number
    metalness?: number
    roughness?: number
  }
}

type ComponentGeneratorOutput = {
  assembly?: {
    primarySemanticRole?: string
    parts?: ComponentGeneratorPart[]
    ports?: Array<{ id?: string; side?: string; position?: Vec3 }>
    editableParts?: string[]
    dataBindings?: unknown[]
    runtimeEffects?: unknown[]
  }
}

export type ComponentGeneratorResolution = {
  patches: GeneratedGeometryCreatePatch[]
  routeObstacle: FactoryRouteObstacleMetadata
}

export function generateAssetComponentArtifact(input: {
  profileId: string
  componentPack: string
  generator: string
  name: string
  userPrompt: string
  params?: Record<string, unknown>
  expectedDimensions?: { length?: number; width?: number; height?: number }
}): GeneratedGeometryArtifact | null {
  const entry = componentGeneratorEntry(input.componentPack, input.generator)
  if (!entry) return null
  const output = runGeneratorModule(entry, {
    id: input.profileId,
    name: input.name,
    params: input.params ?? {},
    placement: { x: 0, y: 0, z: 0, rotationY: 0 },
  })
  const assembly = output?.assembly
  const parts = assembly?.parts ?? []
  if (!parts.length) return null
  const shapes = parts.flatMap(shapesFromPart)
  const transforms = shapes.map((shape) => ({ position: shape.position, rotation: shape.rotation }))
  return {
    id: createGeneratedGeometryId(),
    title: input.name,
    sourceTool: 'asset_component_generator',
    sourceArgs: {
      profileId: input.profileId,
      componentPack: input.componentPack,
      generator: input.generator,
      primarySemanticRole: assembly?.primarySemanticRole,
    },
    userPrompt: input.userPrompt,
    version: 1,
    createdAt: new Date().toISOString(),
    shapes,
    transforms,
    assemblyName: input.name,
    assemblyPosition: computeGeneratedAssemblyPosition(transforms),
    createdNames: shapes.map((shape) => shape.name ?? shape.kind),
    shapeDetails: formatGeneratedShapeDetails(shapes, transforms),
    geometryBrief: {
      category: input.profileId,
      units: 'meters',
      expectedDimensions: input.expectedDimensions,
      requiredRoles: assembly?.editableParts ?? [],
      semanticRoles: assembly?.editableParts ?? [],
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
}

function safeRelativePath(value: string) {
  const normalized = value.replace(/\\/g, '/')
  return (
    normalized.length > 0 &&
    !normalized.startsWith('/') &&
    !/^[a-z]:/i.test(normalized) &&
    normalized.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
  )
}

function componentGeneratorEntry(componentPackId: string, generatorId: string) {
  for (const dir of installedAssetComponentPackDirsSync()) {
    const dirPackId = path.basename(dir).replace(/@[^@]+$/, '')
    if (dirPackId === componentPackId) {
      const fallbackEntry = path.join(dir, 'generators', generatorId, 'generator.mjs')
      if (fs.existsSync(fallbackEntry)) return fallbackEntry
    }
    const manifestPath = path.join(dir, 'component-pack.json')
    if (!fs.existsSync(manifestPath)) continue
    const manifest = readJson(manifestPath)
    if (!isRecord(manifest) || manifest.id !== componentPackId) continue
    const generators = Array.isArray(manifest.generators)
      ? manifest.generators.filter(isRecord)
      : []
    const generator = generators.find((entry) => entry.id === generatorId)
    const entry = stringValue(generator?.entry)
    if (!entry || !safeRelativePath(entry)) return undefined
    const resolved = path.resolve(dir, entry)
    const relative = path.relative(dir, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined
    return fs.existsSync(resolved) ? resolved : undefined
  }

  for (const industryPackDir of installedAssetIndustryPackDirsSync()) {
    const generatorRoot = path.join(industryPackDir, 'generators')
    const manifestPath = path.join(generatorRoot, 'component-pack.json')
    if (!fs.existsSync(manifestPath)) continue
    const manifest = readJson(manifestPath)
    if (!isRecord(manifest) || manifest.id !== componentPackId) continue
    const generators = Array.isArray(manifest.generators)
      ? manifest.generators.filter(isRecord)
      : []
    const generator = generators.find((entry) => entry.id === generatorId)
    const entry = stringValue(generator?.entry)
    if (!entry || !safeRelativePath(entry)) return undefined
    const resolved = path.resolve(generatorRoot, entry)
    const relative = path.relative(generatorRoot, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined
    return fs.existsSync(resolved) ? resolved : undefined
  }

  return undefined
}

function runGeneratorModule(entry: string, input: unknown): ComponentGeneratorOutput | undefined {
  const script = `
    import { pathToFileURL } from 'node:url';
    let body = '';
    for await (const chunk of process.stdin) body += chunk;
    const payload = JSON.parse(body);
    const mod = await import(pathToFileURL(payload.entry).href);
    if (typeof mod.generate !== 'function') throw new Error('Generator module has no generate() export');
    const output = await mod.generate(payload.input);
    process.stdout.write(JSON.stringify(output));
  `
  try {
    const runtime = path.basename(process.execPath).toLowerCase().includes('bun')
      ? 'node'
      : process.execPath
    const stdout = execFileSync(runtime, ['--input-type=module', '-e', script], {
      input: JSON.stringify({ entry, input }),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 15_000,
      windowsHide: true,
    })
    const parsed = JSON.parse(stdout) as unknown
    return isRecord(parsed) ? (parsed as ComponentGeneratorOutput) : undefined
  } catch {
    return undefined
  }
}

function material(part: ComponentGeneratorPart): GeneratedGeometryShapeSpec['material'] {
  return {
    preset: 'custom',
    properties: {
      color: part.material?.color ?? '#94a3b8',
      opacity: part.material?.opacity ?? 1,
      metalness: part.material?.metalness ?? 0.14,
      roughness: part.material?.roughness ?? 0.62,
    },
  }
}

function partShapeKind(kind: string) {
  if (/cone|hopper/i.test(kind)) return 'cone'
  if (/cylinder|cyclone-cylinder|tank|silo|drum|trunnion|ring|shell/i.test(kind)) return 'cylinder'
  return 'box'
}

function isHorizontalCylinder(kind: string, scale: Vec3) {
  return (
    /horizontal|inclined|kiln|mill|drum|trunnion|shell/i.test(kind) &&
    Math.abs(scale[0]) > Math.max(Math.abs(scale[1]), Math.abs(scale[2])) * 1.35
  )
}

function shapesFromPart(part: ComponentGeneratorPart, index: number): GeneratedGeometryShapeSpec[] {
  if (part.kind === 'chimney_stack') return chimneyStackShapes(part, index)
  return [shapeFromPart(part, index)]
}

function chimneyStackShapes(
  part: ComponentGeneratorPart,
  index: number,
): GeneratedGeometryShapeSpec[] {
  const scale = part.scale ?? [1, 1, 1]
  const height = Math.max(0.03, Math.abs(part.height ?? scale[1]))
  const radius = Math.max(0.03, Math.abs(part.radius ?? Math.min(scale[0], scale[2]) / 2))
  const topRadius = Math.max(0.03, Math.min(radius, Math.abs(part.topRadius ?? radius * 0.72)))
  const position = part.position ?? [0, 0, 0]
  const rotation = part.rotation ?? ([0, 0, 0] as Vec3)
  const base = {
    kind: 'frustum',
    position,
    rotation,
    axis: 'y',
    name: part.id ?? `${part.semanticRole ?? 'chimney_stack'}_${index + 1}`,
    semanticRole: part.semanticRole,
    sourcePartKind: part.kind,
    sourcePartId: part.id,
    material: material(part),
    radiusBottom: radius,
    radiusTop: topRadius,
    height,
    radialSegments: 32,
  } satisfies GeneratedGeometryShapeSpec
  const shapes: GeneratedGeometryShapeSpec[] = [
    base,
    {
      kind: 'cylinder',
      name: `${base.name} reinforced base plinth`,
      position: [position[0], position[1] - height / 2 + height * 0.025, position[2]],
      rotation,
      axis: 'y',
      semanticRole: 'chimney_base',
      sourcePartKind: part.kind,
      sourcePartId: `${part.id ?? index}_base`,
      radius: radius * 1.4,
      height: height * 0.05,
      radialSegments: 32,
      material: {
        preset: 'custom',
        properties: { color: '#94a3b8', opacity: 1, metalness: 0.08, roughness: 0.72 },
      },
    },
    {
      kind: 'torus',
      name: `${base.name} open top rim`,
      position: [position[0], position[1] + height / 2, position[2]],
      rotation,
      axis: 'y',
      semanticRole: 'chimney_top_rim',
      sourcePartKind: part.kind,
      sourcePartId: `${part.id ?? index}_top_rim`,
      majorRadius: topRadius * 1.02,
      tubeRadius: Math.max(0.012, topRadius * 0.06),
      radialSegments: 16,
      tubularSegments: 32,
      material: {
        preset: 'custom',
        properties: { color: '#475569', opacity: 1, metalness: 0.3, roughness: 0.4 },
      },
    },
  ]
  if (!part.warningStripes) return shapes

  const stripeCount = Math.max(2, Math.min(12, Math.round(part.stripeCount ?? 5)))
  const stripeHeight = Math.max(
    height * 0.12,
    Math.min(height * 0.7, part.stripeHeight ?? height * 0.36),
  )
  const stripeStart = height - stripeHeight
  const radiusAt = (y: number) => radius + ((topRadius - radius) * y) / height
  for (let stripe = 0; stripe < stripeCount; stripe += 1) {
    const yMin = stripeStart + (stripeHeight * stripe) / stripeCount
    const yMax = stripeStart + (stripeHeight * (stripe + 1)) / stripeCount
    shapes.push({
      ...base,
      name: `${base.name} ${stripe % 2 === 0 ? 'red' : 'white'} warning band ${stripe + 1}`,
      semanticRole: stripe % 2 === 0 ? 'chimney_warning_red_band' : 'chimney_warning_white_band',
      position: [position[0], position[1] - height / 2 + (yMin + yMax) / 2, position[2]],
      radiusBottom: radiusAt(yMin) * 1.018,
      radiusTop: radiusAt(yMax) * 1.018,
      height: yMax - yMin,
      material:
        stripe % 2 === 0
          ? {
              preset: 'custom',
              properties: { color: '#b91c1c', opacity: 1, metalness: 0.22, roughness: 0.46 },
            }
          : {
              preset: 'custom',
              properties: { color: '#f8fafc', opacity: 1, metalness: 0.1, roughness: 0.5 },
            },
    })
  }
  return shapes
}

function shapeFromPart(part: ComponentGeneratorPart, index: number): GeneratedGeometryShapeSpec {
  const kind = part.kind ?? 'box'
  const scale = part.scale ?? [1, 1, 1]
  const shapeKind = partShapeKind(kind)
  const rotation = part.rotation ?? ([0, 0, 0] as Vec3)
  const base = {
    kind: shapeKind,
    name: part.id ?? `${part.semanticRole ?? kind}_${index + 1}`,
    position: part.position ?? [0, 0, 0],
    rotation,
    semanticRole: part.semanticRole,
    sourcePartKind: kind,
    sourcePartId: part.id,
    material: material(part),
  }
  if (shapeKind === 'cylinder') {
    if (isHorizontalCylinder(kind, scale)) {
      return {
        ...base,
        rotation: part.rotation ?? ([0, 0, Math.PI / 2] as Vec3),
        radius: Math.max(0.03, Math.min(Math.abs(scale[1]), Math.abs(scale[2])) / 2),
        height: Math.max(0.03, Math.abs(scale[0])),
        ...(typeof part.wallThickness === 'number' && part.wallThickness > 0
          ? { wallThickness: part.wallThickness }
          : /kiln-shell/i.test(kind)
            ? {
                wallThickness: Math.max(
                  0.04,
                  Math.min(Math.abs(scale[1]), Math.abs(scale[2])) * 0.06,
                ),
              }
            : {}),
        radialSegments: /gear|ring|tyre|tire|drum|shell|mill|kiln/i.test(kind) ? 32 : 16,
      }
    }
    return {
      ...base,
      radius: Math.max(0.03, Math.min(Math.abs(scale[0]), Math.abs(scale[2])) / 2),
      height: Math.max(0.03, Math.abs(scale[1])),
      radialSegments: /cyclone|tank|silo/i.test(kind) ? 32 : 16,
    }
  }
  if (shapeKind === 'cone') {
    return {
      ...base,
      radius: Math.max(0.04, Math.max(Math.abs(scale[0]), Math.abs(scale[2])) / 2),
      height: Math.max(0.04, Math.abs(scale[1])),
      radialSegments: 32,
    }
  }
  return {
    ...base,
    length: Math.max(0.03, Math.abs(scale[0])),
    height: Math.max(0.03, Math.abs(scale[1])),
    width: Math.max(0.03, Math.abs(scale[2])),
  }
}

function routeObstacleForGeneratedComponent(input: {
  stationPlacement: StationPlacement
  equipmentContract: ProcessEquipmentContract
}): FactoryRouteObstacleMetadata {
  const length = input.equipmentContract.envelope.length
  const width = input.equipmentContract.envelope.width
  const yaw = input.stationPlacement.rotation[1] ?? 0
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const [localX, localZ] of [
    [-length / 2, -width / 2],
    [length / 2, -width / 2],
    [length / 2, width / 2],
    [-length / 2, width / 2],
  ] as const) {
    const x = input.stationPlacement.position[0] + localX * cos - localZ * sin
    const z = input.stationPlacement.position[2] + localX * sin + localZ * cos
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return {
    stationId: input.stationPlacement.stationId,
    source: 'profile-parts',
    minHeight: input.stationPlacement.position[1],
    maxHeight: input.stationPlacement.position[1] + input.equipmentContract.envelope.height,
    box: { minX, maxX, minZ, maxZ },
  }
}

export function createComponentGeneratorPatches(input: {
  station: ProcessStationPlan
  stationPlacement: StationPlacement
  placement: GeneratedGeometryPlacementSpec
  metadata: Record<string, unknown>
  equipmentContract: ProcessEquipmentContract
}): ComponentGeneratorResolution | null {
  const generatorRef = input.equipmentContract.generatorRef
  if (!generatorRef) return null
  const entry = componentGeneratorEntry(generatorRef.componentPack, generatorRef.generator)
  if (!entry) return null
  const output = runGeneratorModule(entry, {
    id: input.station.id,
    name: stationDisplayLabel(input.station),
    params: input.equipmentContract.recipeParams ?? {},
    placement: { x: 0, y: 0, z: 0, rotationY: 0 },
  })
  const assembly = output?.assembly
  const parts = assembly?.parts ?? []
  if (!parts.length) return null
  const shapes = parts.flatMap(shapesFromPart)
  const transforms = shapes.map((shape) => ({ position: shape.position, rotation: shape.rotation }))
  const assemblyPosition = computeGeneratedAssemblyPosition(transforms)
  const artifact: GeneratedGeometryArtifact = {
    id: createGeneratedGeometryId(),
    title: stationDisplayLabel(input.station),
    sourceTool: 'asset_component_generator',
    sourceArgs: {
      profileId: input.equipmentContract.profileId,
      componentPack: generatorRef.componentPack,
      generator: generatorRef.generator,
      primarySemanticRole: assembly?.primarySemanticRole,
    },
    userPrompt: input.station.equipmentHint,
    version: 1,
    createdAt: new Date().toISOString(),
    shapes,
    transforms,
    assemblyName: stationDisplayLabel(input.station),
    assemblyPosition,
    createdNames: shapes.map((shape) => shape.name ?? shape.kind),
    shapeDetails: formatGeneratedShapeDetails(shapes, transforms),
    geometryBrief: {
      category: input.equipmentContract.equipmentFamily,
      units: 'meters',
      expectedDimensions: {
        length: input.equipmentContract.envelope.length,
        width: input.equipmentContract.envelope.width,
        height: input.equipmentContract.envelope.height,
      },
      requiredRoles: input.equipmentContract.requiredRoles,
      semanticRoles: input.equipmentContract.requiredRoles,
    },
  }
  const routeObstacle = routeObstacleForGeneratedComponent(input)
  const patchPlan = buildGeneratedGeometryCreatePatches(artifact, {
    ...input.placement,
    position: input.stationPlacement.position,
    rotation: input.stationPlacement.rotation,
    metadata: {
      ...input.metadata,
      equipmentRole: input.station.role,
      resolver: 'asset-component-generator',
      resolverReason: `${generatorRef.componentPack}/${generatorRef.generator}`,
      factoryRouteObstacle: routeObstacle,
      equipmentAssembly: {
        kind: 'semantic-assembly',
        profileId: input.equipmentContract.profileId,
        recipeSource: 'asset-component-generator',
        equipmentFamily: input.equipmentContract.equipmentFamily,
        primarySemanticRole: assembly?.primarySemanticRole,
        envelope: input.equipmentContract.envelope,
        ports: input.equipmentContract.ports,
        editablePartRoles: input.equipmentContract.requiredRoles ?? [],
        dynamicBindings: assembly?.dataBindings ?? [],
        runtimeEffects: assembly?.runtimeEffects ?? [],
      },
    },
  })
  return { patches: patchPlan.patches, routeObstacle }
}
