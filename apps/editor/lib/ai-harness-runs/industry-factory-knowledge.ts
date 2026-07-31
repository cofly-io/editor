import fs from 'node:fs'
import path from 'node:path'
import { loadAssetIndustryPackResourcesSync } from '../asset-industry-packs'
import { installedAssetIndustryPackDirsSync } from '../asset-packs'
import type {
  ProcessConnectionPlan,
  ProcessConnectionVisualKind,
  ProcessLineDomain,
  ProcessLineLayoutStyle,
  ProcessLinePlan,
  ProcessStationPlan,
} from './process-line-types'
import type { ProcessTemplate } from './process-template-registry'

type IndustryFactoryManifest = {
  id: string
  name?: string
  industry: string
  version: string
  processTemplates?: string[]
  factoryArchitectures?: string[]
  profiles?: string[]
  layouts?: string[]
  connections?: string[]
}

export type IndustryPackRef = {
  id: string
  version: string
  industry?: string
}

type RawProcessTemplate = {
  processId?: unknown
  processLabel?: unknown
  processDisplayLabel?: unknown
  domain?: unknown
  aliases?: unknown
  requiredRoles?: unknown
  defaultLayoutStyle?: unknown
  defaultDimensions?: unknown
  safetyTags?: unknown
  stations?: unknown
  connections?: unknown
}

let cachedTemplates: ProcessTemplate[] | undefined
let cachedArchitectures: IndustryFactoryArchitecture[] | undefined
let cachedTemplatesSignature: string | undefined
let cachedArchitecturesSignature: string | undefined

type FactoryArchitectureScope = {
  id: string
  label: string
  aliases: string[]
  includeModules: string[]
}

type FactoryArchitectureModule = {
  id: string
  displayLabel?: string
  order: number
  stationIds: string[]
}

type FactoryArchitectureLayoutHints = {
  highestStationId?: string
  longAxisStationId?: string
  sideBranchStationIds?: string[]
  omitPerimeterWalls?: boolean
  omitCeiling?: boolean
  omitFloor?: boolean
  omitRoof?: boolean
  stationPositionHints?: NonNullable<ProcessLinePlan['architecture']>['stationPositionHints']
}

export type IndustryFactoryArchitecture = {
  id: string
  label: string
  industry: string
  processId: string
  layoutStyle: ProcessLineLayoutStyle
  defaultDimensions: { length: number; width: number }
  scopes: FactoryArchitectureScope[]
  modules: FactoryArchitectureModule[]
  layoutHints: FactoryArchitectureLayoutHints
  sourcePack: {
    id: string
    version: string
    industry: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function finiteNumberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function semverParts(version: string | undefined) {
  return (version ?? '0.0.0').split('.').map((part) => Number.parseInt(part, 10) || 0)
}

function compareSemver(left: string | undefined, right: string | undefined) {
  const leftParts = semverParts(left)
  const rightParts = semverParts(right)
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function keepLatestByPackAndResource<T extends { sourcePack?: IndustryPackRef }>(
  values: T[],
  resourceId: (value: T) => string,
) {
  const byKey = new Map<string, T>()
  for (const value of values) {
    const packId = value.sourcePack?.id ?? 'builtin'
    const key = `${packId}:${resourceId(value)}`
    const previous = byKey.get(key)
    if (!previous || compareSemver(value.sourcePack?.version, previous.sourcePack?.version) > 0) {
      byKey.set(key, value)
    }
  }
  return [...byKey.values()]
}

function processDomain(value: unknown): ProcessLineDomain {
  return value === 'chemical' ||
    value === 'energy' ||
    value === 'food' ||
    value === 'assembly' ||
    value === 'logistics' ||
    value === 'metallurgy'
    ? value
    : 'generic'
}

function processLayoutStyle(value: unknown): ProcessLineLayoutStyle {
  return value === 'u_shape' || value === 'cell' || value === 'parallel_bays' ? value : 'linear'
}

function footprintHint(value: unknown): ProcessStationPlan['footprintHint'] {
  return value === 'small' ||
    value === 'medium' ||
    value === 'large' ||
    value === 'long' ||
    value === 'tall'
    ? value
    : undefined
}

function connectionMedium(value: unknown): ProcessConnectionPlan['medium'] {
  return value === 'water' ||
    value === 'hydrogen' ||
    value === 'oxygen' ||
    value === 'power' ||
    value === 'cooling' ||
    value === 'material' ||
    value === 'gas' ||
    value === 'molten_metal'
    ? value
    : undefined
}

const CONNECTION_VISUAL_KINDS: ProcessConnectionVisualKind[] = [
  'pipe',
  'cable_tray',
  'flow_arrow',
  'material_conveyor',
  'hot_material_chute',
  'air_duct',
  'hot_gas_duct',
]

function connectionVisualKind(value: unknown, medium?: ProcessConnectionPlan['medium']) {
  if (value === 'busbar') return 'cable_tray'
  if (value === 'pneumatic_pipe') return 'pipe'
  if (value === 'fume_duct') return 'air_duct'
  if (value === 'hot_metal_transfer' || value === 'hot_metal_chute') return 'hot_material_chute'
  if (value === 'crane_transfer') return 'flow_arrow'
  if (
    typeof value === 'string' &&
    CONNECTION_VISUAL_KINDS.includes(value as ProcessConnectionVisualKind)
  ) {
    return value as ProcessConnectionVisualKind
  }
  return medium === 'power' ? 'cable_tray' : 'pipe'
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function aliasPattern(alias: string) {
  return /[a-z]/i.test(alias)
    ? new RegExp(escapeRegExp(alias), 'i')
    : new RegExp(escapeRegExp(alias))
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

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
}

function findRepoRootSync(start = process.cwd()) {
  let current = path.resolve(start)
  for (;;) {
    if (
      fs.existsSync(path.join(current, 'package.json')) &&
      fs.existsSync(path.join(current, 'apps', 'editor'))
    ) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) return path.resolve(start)
    current = parent
  }
}

function runtimeProfilePackDirs() {
  return installedAssetIndustryPackDirsSync()
}

function preferredIndustryManifestPath(dir: string) {
  const assetManifestPath = path.join(dir, 'industry-pack.json')
  if (fs.existsSync(assetManifestPath)) return assetManifestPath
  return path.join(dir, 'pack.json')
}

function fileSignature(file: string) {
  try {
    const stat = fs.statSync(file)
    return `${file}:${stat.mtimeMs}:${stat.size}`
  } catch {
    return `${file}:missing`
  }
}

function resourceCacheSignature(
  dirs: readonly string[],
  resourceKey: 'processTemplates' | 'factoryArchitectures',
) {
  if (dirs.length === 0) return 'no-enabled-packs'
  const parts: string[] = []
  for (const dir of dirs) {
    const manifestPath = preferredIndustryManifestPath(dir)
    parts.push(fileSignature(manifestPath))
    if (!fs.existsSync(manifestPath)) continue
    let manifest: IndustryFactoryManifest | null = null
    try {
      manifest = normalizeManifest(readJson(manifestPath))
    } catch {
      continue
    }
    if (!manifest) continue
    const resolvedDir = path.resolve(dir)
    const resourcePaths =
      resourceKey === 'processTemplates'
        ? [
            ...(manifest.processTemplates ?? []),
            ...(manifest.profiles ?? []),
            ...(manifest.layouts ?? []),
            ...(manifest.connections ?? []),
          ]
        : [...(manifest.factoryArchitectures ?? []), ...(manifest.layouts ?? [])]
    for (const rel of resourcePaths) {
      if (!safeRelativePath(rel)) continue
      const file = path.resolve(dir, rel)
      if (!(file === resolvedDir || file.startsWith(`${resolvedDir}${path.sep}`))) continue
      parts.push(fileSignature(file))
    }
  }
  return parts.sort().join('|')
}

function normalizeManifest(raw: unknown): IndustryFactoryManifest | null {
  if (!isRecord(raw)) return null
  const id = stringValue(raw.id)
  const name = stringValue(raw.name)
  const industry = stringValue(raw.industry)
  const version = stringValue(raw.version)
  if (!id || !industry || !version) return null
  const processTemplates = stringArray(raw.processTemplates)
  const factoryArchitectures = stringArray(raw.factoryArchitectures)
  const profiles = stringArray(raw.profiles)
  const layouts = stringArray(raw.layouts)
  const connections = stringArray(raw.connections)
  return {
    id,
    ...(name ? { name } : {}),
    industry,
    version,
    ...(processTemplates.length ? { processTemplates } : {}),
    ...(factoryArchitectures.length ? { factoryArchitectures } : {}),
    ...(profiles.length ? { profiles } : {}),
    ...(layouts.length ? { layouts } : {}),
    ...(connections.length ? { connections } : {}),
  }
}

function stationPositionHints(
  value: unknown,
): NonNullable<ProcessLinePlan['architecture']>['stationPositionHints'] | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value)
    .map(([stationId, rawHint]) => {
      if (!stationId.trim() || !isRecord(rawHint)) return undefined
      const x = finiteNumberValue(rawHint.x)
      const z = finiteNumberValue(rawHint.z)
      if (x == null || z == null) return undefined
      const rotationY = finiteNumberValue(rawHint.rotationY)
      return [
        stationId.trim(),
        {
          x,
          z,
          ...(rotationY != null ? { rotationY } : {}),
        },
      ] as const
    })
    .filter((entry): entry is readonly [string, { x: number; z: number; rotationY?: number }] =>
      Boolean(entry),
    )
  return entries.length ? Object.fromEntries(entries) : undefined
}

function normalizeArchitecture(raw: unknown, manifest: IndustryFactoryManifest) {
  if (!isRecord(raw)) return null
  const id = stringValue(raw.id)
  const label = stringValue(raw.label)
  const processId = stringValue(raw.processId)
  if (!id || !label || !processId) return null
  const dimensions = isRecord(raw.defaultDimensions) ? raw.defaultDimensions : {}
  const scopes = Array.isArray(raw.scopes)
    ? raw.scopes
        .filter(isRecord)
        .map((scope) => {
          const scopeId = stringValue(scope.id)
          const scopeLabel = stringValue(scope.label)
          const aliases = stringArray(scope.aliases)
          const includeModules = stringArray(scope.includeModules)
          return scopeId && scopeLabel && includeModules.length
            ? { id: scopeId, label: scopeLabel, aliases, includeModules }
            : null
        })
        .filter((scope): scope is FactoryArchitectureScope => Boolean(scope))
    : []
  const modules = Array.isArray(raw.modules)
    ? raw.modules
        .filter(isRecord)
        .map((module) => {
          const moduleId = stringValue(module.id)
          const stationIds = stringArray(module.stationIds)
          if (!moduleId || !stationIds.length) return null
          return {
            id: moduleId,
            ...(stringValue(module.displayLabel)
              ? { displayLabel: stringValue(module.displayLabel) }
              : {}),
            order: numberValue(module.order) ?? 0,
            stationIds,
          }
        })
        .filter((module): module is FactoryArchitectureModule => Boolean(module))
    : []
  const layoutHints = isRecord(raw.layoutHints) ? raw.layoutHints : {}
  const positionHints =
    stationPositionHints(layoutHints.stationPositions) ??
    stationPositionHints(layoutHints.stationPositionHints)
  return {
    id,
    label,
    industry: stringValue(raw.industry) ?? manifest.industry,
    processId,
    layoutStyle: processLayoutStyle(raw.layoutStyle),
    defaultDimensions: {
      length: numberValue(dimensions.length) ?? 24,
      width: numberValue(dimensions.width) ?? 9,
    },
    scopes,
    modules,
    layoutHints: {
      ...(stringValue(layoutHints.highestStationId)
        ? { highestStationId: stringValue(layoutHints.highestStationId) }
        : {}),
      ...(stringValue(layoutHints.longAxisStationId)
        ? { longAxisStationId: stringValue(layoutHints.longAxisStationId) }
        : {}),
      ...(stringArray(layoutHints.sideBranchStationIds).length
        ? { sideBranchStationIds: stringArray(layoutHints.sideBranchStationIds) }
        : {}),
      ...(booleanValue(layoutHints.omitPerimeterWalls) != null
        ? { omitPerimeterWalls: booleanValue(layoutHints.omitPerimeterWalls) }
        : {}),
      ...(booleanValue(layoutHints.omitCeiling) != null
        ? { omitCeiling: booleanValue(layoutHints.omitCeiling) }
        : {}),
      ...(booleanValue(layoutHints.omitFloor) != null
        ? { omitFloor: booleanValue(layoutHints.omitFloor) }
        : {}),
      ...(booleanValue(layoutHints.omitRoof) != null
        ? { omitRoof: booleanValue(layoutHints.omitRoof) }
        : {}),
      ...(positionHints ? { stationPositionHints: positionHints } : {}),
    },
    sourcePack: {
      id: manifest.id,
      version: manifest.version,
      industry: manifest.industry,
    },
  } satisfies IndustryFactoryArchitecture
}

function normalizeStation(raw: unknown): ProcessStationPlan | null {
  if (!isRecord(raw)) return null
  const id = stringValue(raw.id)
  const label = stringValue(raw.label)
  const role = stringValue(raw.role)
  const equipmentHint = stringValue(raw.equipmentHint)
  if (!id || !label || !role || !equipmentHint) return null
  const displayLabel = stringValue(raw.displayLabel)
  const hint = footprintHint(raw.footprintHint)
  const safetyTags = stringArray(raw.safetyTags)
  return {
    id,
    label,
    ...(displayLabel ? { displayLabel } : {}),
    role,
    equipmentHint,
    ...(hint ? { footprintHint: hint } : {}),
    ...(safetyTags.length ? { safetyTags } : {}),
  }
}

function normalizeConnection(raw: unknown): ProcessConnectionPlan | null {
  if (!isRecord(raw)) return null
  const fromStationId = stringValue(raw.fromStationId)
  const toStationId = stringValue(raw.toStationId)
  if (!fromStationId || !toStationId) return null
  const medium = connectionMedium(raw.medium)
  return {
    fromStationId,
    toStationId,
    ...(medium ? { medium } : {}),
    ...(stringValue(raw.fromPortId) ? { fromPortId: stringValue(raw.fromPortId) } : {}),
    ...(stringValue(raw.toPortId) ? { toPortId: stringValue(raw.toPortId) } : {}),
    visualKind: connectionVisualKind(raw.visualKind, medium),
  }
}

function normalizeTemplate(raw: RawProcessTemplate, manifest: IndustryFactoryManifest) {
  const processId = stringValue(raw.processId)
  const processLabel = stringValue(raw.processLabel)
  const processDisplayLabel = stringValue(raw.processDisplayLabel)
  const aliases = stringArray(raw.aliases)
  const stations = Array.isArray(raw.stations)
    ? raw.stations
        .map(normalizeStation)
        .filter((station): station is ProcessStationPlan => Boolean(station))
    : []
  const connections = Array.isArray(raw.connections)
    ? raw.connections
        .map(normalizeConnection)
        .filter((connection): connection is ProcessConnectionPlan => Boolean(connection))
    : []
  if (!processId || !processLabel || aliases.length === 0 || stations.length < 2) return null
  const dimensions = isRecord(raw.defaultDimensions) ? raw.defaultDimensions : {}
  return {
    processId,
    processLabel,
    ...(processDisplayLabel ? { processDisplayLabel } : {}),
    domain: processDomain(raw.domain),
    aliases: aliases.map(aliasPattern),
    requiredRoles: stringArray(raw.requiredRoles),
    defaultLayoutStyle: processLayoutStyle(raw.defaultLayoutStyle),
    defaultDimensions: {
      length: numberValue(dimensions.length) ?? 24,
      width: numberValue(dimensions.width) ?? 9,
    },
    safetyTags: stringArray(raw.safetyTags),
    stations,
    connections,
    sourcePack: {
      id: manifest.id,
      version: manifest.version,
      industry: manifest.industry,
    },
  } satisfies ProcessTemplate
}

function assetProfileMap(profiles: readonly Record<string, unknown>[]) {
  return new Map(
    profiles.flatMap((profile) => {
      const id = stringValue(profile.id)
      return id ? [[id, profile] as const] : []
    }),
  )
}

function assetProcessId(manifest: IndustryFactoryManifest, layout: Record<string, unknown>) {
  if (manifest.id === 'industry.refinery.basic') return 'refinery_basic_complex'
  const layoutId = stringValue(layout.id) ?? 'factory'
  return `${manifest.industry}_${layoutId}`.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')
}

function assetProcessLabel(manifest: IndustryFactoryManifest) {
  if (manifest.id === 'industry.refinery.basic') return 'Basic oil refinery complex'
  return manifest.name ?? `${manifest.industry} factory`
}

function assetProcessDisplayLabel(manifest: IndustryFactoryManifest) {
  if (manifest.id === 'industry.refinery.basic') return '\u70bc\u6cb9\u5382'
  return assetIndustryDisplayLabel(manifest.industry) ?? manifest.name
}

function assetIndustryDisplayLabel(industry: string) {
  if (industry === 'cement') return '\u6c34\u6ce5\u5382'
  if (industry === 'thermal-power') return '\u706b\u7535\u5382'
  if (industry === 'electrolytic-aluminum') return '\u7535\u89e3\u94dd\u5382'
  if (industry === 'water-treatment') return '\u6c34\u5904\u7406\u5382'
  if (industry === 'discrete-manufacturing')
    return '\u79bb\u6563\u5236\u9020\u67d4\u6027\u8f66\u95f4'
  if (industry === 'process') return '\u6d41\u7a0b\u884c\u4e1a\u57fa\u7840\u5de5\u5382'
  if (industry === 'appliance-assembly') return '\u5bb6\u7535\u603b\u88c5\u5de5\u5382'
  return undefined
}

function assetIndustryAliases(industry: string) {
  if (industry === 'cement') {
    return [
      '\u6c34\u6ce5\u5382',
      '\u6c34\u6ce5\u5de5\u5382',
      '\u6c34\u6ce5\u751f\u4ea7\u7ebf',
      '\u6c34\u6ce5\u719f\u6599',
      '\u719f\u6599\u4ea7\u7ebf',
      'cement plant',
      'cement factory',
      'cement production line',
      'clinker line',
    ]
  }
  if (industry === 'thermal-power') {
    return ['\u706b\u7535\u5382', '\u706b\u529b\u53d1\u7535\u5382', 'thermal power plant']
  }
  if (industry === 'electrolytic-aluminum') {
    return [
      '\u7535\u89e3\u94dd\u5382',
      '\u7535\u89e3\u94dd\u8f66\u95f4',
      'electrolytic aluminum smelter',
    ]
  }
  if (industry === 'water-treatment') {
    return ['\u6c34\u5904\u7406\u5382', '\u6c61\u6c34\u5904\u7406\u5382', 'water treatment plant']
  }
  if (industry === 'discrete-manufacturing') {
    return [
      '\u79bb\u6563\u5236\u9020',
      '\u6c7d\u8f66\u52a0\u5de5',
      '\u67d4\u6027\u8f66\u95f4',
      'discrete manufacturing',
    ]
  }
  if (industry === 'appliance-assembly') {
    return ['\u5bb6\u7535\u603b\u88c5', '\u5bb6\u7535\u88c5\u914d', 'appliance assembly']
  }
  return []
}

function assetProcessAliases(manifest: IndustryFactoryManifest) {
  const aliases = [
    manifest.id,
    manifest.name,
    manifest.industry,
    assetProcessLabel(manifest),
    assetProcessDisplayLabel(manifest),
    ...assetIndustryAliases(manifest.industry),
  ].filter((value): value is string => Boolean(value))
  if (manifest.id === 'industry.refinery.basic') {
    aliases.push(
      '\u70bc\u6cb9\u5382',
      '\u70bc\u6cb9',
      'refinery',
      'oil refinery',
      'refinery factory',
    )
  }
  return aliases.map(aliasPattern)
}

function assetDomain(industry: string): ProcessLineDomain {
  if (/refinery|chemical|petrochemical|process/i.test(industry)) return 'chemical'
  if (/power|energy|hydrogen/i.test(industry)) return 'energy'
  if (/food/i.test(industry)) return 'food'
  if (/assembly|discrete|manufacturing|robot/i.test(industry)) return 'assembly'
  if (/logistics|warehouse/i.test(industry)) return 'logistics'
  if (/aluminum|metal|metallurgy/i.test(industry)) return 'metallurgy'
  return 'generic'
}

function assetFootprintHint(
  profile: Record<string, unknown> | undefined,
): ProcessStationPlan['footprintHint'] {
  const dimensions = isRecord(profile?.defaultDimensions) ? profile?.defaultDimensions : undefined
  const length = numberValue(dimensions?.length) ?? numberValue(dimensions?.diameter) ?? 2
  const width = numberValue(dimensions?.width) ?? numberValue(dimensions?.diameter) ?? 2
  const height = numberValue(dimensions?.height) ?? 2
  if (height >= 7) return 'tall'
  if (length >= 8) return 'long'
  if (length * width >= 12) return 'large'
  if (length * width <= 3) return 'small'
  return 'medium'
}

function normalizeAssetStation(
  raw: unknown,
  profiles: Map<string, Record<string, unknown>>,
): ProcessStationPlan | null {
  if (!isRecord(raw)) return null
  const id = stringValue(raw.id)
  const profileId = stringValue(raw.profileId)
  if (!id || !profileId) return null
  const profile = profiles.get(profileId)
  const name = stringValue(profile?.name) ?? profileId
  const family = stringValue(profile?.family) ?? profileId
  const generatorRef = isRecord(profile?.generatorRef) ? profile?.generatorRef : undefined
  const generator = stringValue(generatorRef?.generator)
  const safetyTags = stringArray(raw.safetyTags)
  return {
    id,
    label: name,
    displayLabel: name,
    role: family,
    equipmentHint: [profileId, name, family, generator].filter(Boolean).join(' '),
    footprintHint: assetFootprintHint(profile),
    ...(safetyTags.length ? { safetyTags } : {}),
  }
}

function assetMedium(value: unknown): ProcessConnectionPlan['medium'] {
  const text = typeof value === 'string' ? value : ''
  if (/hydrogen|h2/i.test(text)) return 'hydrogen'
  if (/oxygen|o2/i.test(text)) return 'oxygen'
  if (/steam|utility_header/i.test(text)) return 'power'
  if (/water|condensate/i.test(text)) return 'water'
  if (/cool/i.test(text)) return 'cooling'
  if (/power|electric/i.test(text)) return 'power'
  if (/gas|vapor|vapour|flue|flare|relief|air/i.test(text)) return 'gas'
  if (/molten/i.test(text)) return 'molten_metal'
  return 'material'
}

function assetConnectionRender(raw: Record<string, unknown>): ProcessConnectionPlan['render'] {
  const render = isRecord(raw.render) ? raw.render : {}
  const color = stringValue(render.color) ?? stringValue(raw.color)
  const elevation = finiteNumberValue(render.elevation) ?? finiteNumberValue(raw.elevation)
  const diameter = finiteNumberValue(render.diameter) ?? finiteNumberValue(raw.diameter)
  const supportStyle = stringValue(render.supportStyle)
  const supportSpacing = finiteNumberValue(render.supportSpacing)
  const supportWidth = finiteNumberValue(render.supportWidth)
  const galleryWidth = finiteNumberValue(render.galleryWidth)
  const galleryHeight = finiteNumberValue(render.galleryHeight)
  const insulationThickness = finiteNumberValue(render.insulationThickness)
  const output: NonNullable<ProcessConnectionPlan['render']> = {}
  if (color && /^#[0-9a-f]{6}$/i.test(color)) output.color = color
  if (elevation != null && elevation > 0) output.elevation = elevation
  if (diameter != null && diameter > 0) output.diameter = diameter
  if (
    supportStyle === 'single_support' ||
    supportStyle === 'pipe_rack' ||
    supportStyle === 'belt_gallery'
  ) {
    output.supportStyle = supportStyle
  }
  if (supportSpacing != null && supportSpacing > 0) output.supportSpacing = supportSpacing
  if (supportWidth != null && supportWidth > 0) output.supportWidth = supportWidth
  if (galleryWidth != null && galleryWidth > 0) output.galleryWidth = galleryWidth
  if (galleryHeight != null && galleryHeight > 0) output.galleryHeight = galleryHeight
  if (insulationThickness != null && insulationThickness > 0)
    output.insulationThickness = insulationThickness
  if (typeof render.walkway === 'boolean') output.walkway = render.walkway
  if (typeof render.enclosed === 'boolean') output.enclosed = render.enclosed
  if (typeof render.valves === 'boolean') output.valves = render.valves
  if (typeof render.expansionJoints === 'boolean') output.expansionJoints = render.expansionJoints
  return Object.keys(output).length ? output : undefined
}

function normalizeAssetConnection(raw: unknown): ProcessConnectionPlan | null {
  if (!isRecord(raw)) return null
  const from = isRecord(raw.from) ? raw.from : undefined
  const to = isRecord(raw.to) ? raw.to : undefined
  const fromStationId = stringValue(from?.stationId)
  const toStationId = stringValue(to?.stationId)
  if (!fromStationId || !toStationId) return null
  const medium = assetMedium(raw.medium)
  return {
    fromStationId,
    toStationId,
    medium,
    visualKind: connectionVisualKind(raw.visualKind, medium),
    ...(stringValue(from?.port) ? { fromPortId: stringValue(from?.port) } : {}),
    ...(stringValue(to?.port) ? { toPortId: stringValue(to?.port) } : {}),
    ...(assetConnectionRender(raw) ? { render: assetConnectionRender(raw) } : {}),
  }
}

function assetPositionHints(layout: Record<string, unknown>) {
  const stations = Array.isArray(layout.stations) ? layout.stations.filter(isRecord) : []
  const entries = stations.flatMap((station) => {
    const id = stringValue(station.id)
    const position = Array.isArray(station.position) ? station.position : undefined
    const x = typeof position?.[0] === 'number' ? position[0] : undefined
    const z = typeof position?.[2] === 'number' ? position[2] : undefined
    if (!id || x == null || z == null) return []
    const rotationY = finiteNumberValue(station.rotationY)
    return [
      [
        id,
        {
          x,
          z,
          ...(rotationY != null ? { rotationY } : {}),
        },
      ] as const,
    ]
  })
  return entries.length ? Object.fromEntries(entries) : undefined
}

function assetDimensions(
  layout: Record<string, unknown>,
  profiles: Map<string, Record<string, unknown>>,
) {
  const stations = Array.isArray(layout.stations) ? layout.stations.filter(isRecord) : []
  if (!stations.length) return { length: 24, width: 9 }
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const station of stations) {
    const position = Array.isArray(station.position) ? station.position : undefined
    const x = typeof position?.[0] === 'number' ? position[0] : 0
    const z = typeof position?.[2] === 'number' ? position[2] : 0
    const profile = profiles.get(stringValue(station.profileId) ?? '')
    const dimensions = isRecord(profile?.defaultDimensions) ? profile?.defaultDimensions : undefined
    const halfLength =
      (numberValue(dimensions?.length) ?? numberValue(dimensions?.diameter) ?? 2) / 2
    const halfWidth = (numberValue(dimensions?.width) ?? numberValue(dimensions?.diameter) ?? 2) / 2
    minX = Math.min(minX, x - halfLength)
    maxX = Math.max(maxX, x + halfLength)
    minZ = Math.min(minZ, z - halfWidth)
    maxZ = Math.max(maxZ, z + halfWidth)
  }
  return {
    length: Math.max(12, maxX - minX + 4),
    width: Math.max(8, maxZ - minZ + 4),
  }
}

function assetTemplateFromLayout(input: {
  manifest: IndustryFactoryManifest
  layout: Record<string, unknown>
  profiles: Map<string, Record<string, unknown>>
  connections: readonly ProcessConnectionPlan[]
}): ProcessTemplate | null {
  const stations = Array.isArray(input.layout.stations)
    ? input.layout.stations
        .map((station) => normalizeAssetStation(station, input.profiles))
        .filter((station): station is ProcessStationPlan => Boolean(station))
    : []
  if (stations.length < 2) return null
  const stationIds = new Set(stations.map((station) => station.id))
  const connections = input.connections.filter(
    (connection) =>
      stationIds.has(connection.fromStationId) && stationIds.has(connection.toStationId),
  )
  return {
    processId: assetProcessId(input.manifest, input.layout),
    processLabel: assetProcessLabel(input.manifest),
    ...(assetProcessDisplayLabel(input.manifest)
      ? { processDisplayLabel: assetProcessDisplayLabel(input.manifest) }
      : {}),
    domain: assetDomain(input.manifest.industry),
    aliases: assetProcessAliases(input.manifest),
    requiredRoles: stations.map((station) => station.role),
    defaultLayoutStyle: 'parallel_bays',
    defaultDimensions: assetDimensions(input.layout, input.profiles),
    safetyTags:
      input.manifest.industry === 'refinery' ? ['flammable', 'process', 'high-temperature'] : [],
    stations,
    connections,
    sourcePack: {
      id: input.manifest.id,
      version: input.manifest.version,
      industry: input.manifest.industry,
    },
  }
}

function loadAssetTemplatesFromPackDir(dir: string) {
  const resources = loadAssetIndustryPackResourcesSync(dir)
  if (!resources) return []
  const profiles = assetProfileMap(resources.profiles)
  const connections = resources.connections.flatMap((resource) =>
    Array.isArray(resource.connections)
      ? resource.connections
          .map(normalizeAssetConnection)
          .filter((connection): connection is ProcessConnectionPlan => Boolean(connection))
      : [],
  )
  return resources.layouts.flatMap((layout) => {
    const template = assetTemplateFromLayout({
      manifest: resources.manifest,
      layout,
      profiles,
      connections,
    })
    return template ? [template] : []
  })
}

function loadAssetArchitecturesFromPackDir(dir: string) {
  const resources = loadAssetIndustryPackResourcesSync(dir)
  if (!resources) return []
  const profiles = assetProfileMap(resources.profiles)
  return resources.layouts.flatMap((layout) => {
    const stationIds = Array.isArray(layout.stations)
      ? layout.stations
          .filter(isRecord)
          .flatMap((station) => (stringValue(station.id) ? [stringValue(station.id)!] : []))
      : []
    if (!stationIds.length) return []
    const processId = assetProcessId(resources.manifest, layout)
    const dimensions = assetDimensions(layout, profiles)
    return [
      {
        id: stringValue(layout.id) ?? `${processId}.layout`,
        label: assetProcessLabel(resources.manifest),
        industry: resources.manifest.industry,
        processId,
        layoutStyle: 'parallel_bays' as const,
        defaultDimensions: dimensions,
        scopes: [
          {
            id: 'full',
            label:
              assetProcessDisplayLabel(resources.manifest) ?? assetProcessLabel(resources.manifest),
            aliases:
              resources.manifest.id === 'industry.refinery.basic'
                ? ['\u70bc\u6cb9\u5382', 'refinery']
                : [],
            includeModules: ['main'],
          },
        ],
        modules: [{ id: 'main', order: 0, stationIds }],
        layoutHints: {
          omitPerimeterWalls: true,
          ...(stringValue(layout.siteMode) === 'open-air'
            ? { omitCeiling: true, omitRoof: true }
            : {}),
          ...(booleanValue(layout.omitCeiling) != null
            ? { omitCeiling: booleanValue(layout.omitCeiling) }
            : {}),
          ...(booleanValue(layout.omitRoof) != null
            ? { omitRoof: booleanValue(layout.omitRoof) }
            : {}),
          stationPositionHints: assetPositionHints(layout),
        },
        sourcePack: {
          id: resources.manifest.id,
          version: resources.manifest.version,
          industry: resources.manifest.industry,
        },
      } satisfies IndustryFactoryArchitecture,
    ]
  })
}

function loadTemplatesFromPackDir(dir: string) {
  if (fs.existsSync(path.join(dir, 'industry-pack.json'))) {
    return loadAssetTemplatesFromPackDir(dir)
  }
  const manifestPath = path.join(dir, 'pack.json')
  if (!fs.existsSync(manifestPath)) return []
  const manifest = normalizeManifest(readJson(manifestPath))
  if (!manifest?.processTemplates?.length) return []
  const resolvedDir = path.resolve(dir)
  const templates: ProcessTemplate[] = []
  for (const rel of manifest.processTemplates) {
    if (!safeRelativePath(rel)) continue
    const file = path.resolve(dir, rel)
    if (!(file === resolvedDir || file.startsWith(`${resolvedDir}${path.sep}`))) continue
    if (!fs.existsSync(file)) continue
    const raw = readJson(file)
    const values = Array.isArray(raw) ? raw : [raw]
    for (const value of values) {
      if (!isRecord(value)) continue
      const template = normalizeTemplate(value, manifest)
      if (template) templates.push(template)
    }
  }
  return templates
}

function loadArchitecturesFromPackDir(dir: string) {
  if (fs.existsSync(path.join(dir, 'industry-pack.json'))) {
    return loadAssetArchitecturesFromPackDir(dir)
  }
  const manifestPath = path.join(dir, 'pack.json')
  if (!fs.existsSync(manifestPath)) return []
  const manifest = normalizeManifest(readJson(manifestPath))
  if (!manifest?.factoryArchitectures?.length) return []
  const resolvedDir = path.resolve(dir)
  const architectures: IndustryFactoryArchitecture[] = []
  for (const rel of manifest.factoryArchitectures) {
    if (!safeRelativePath(rel)) continue
    const file = path.resolve(dir, rel)
    if (!(file === resolvedDir || file.startsWith(`${resolvedDir}${path.sep}`))) continue
    if (!fs.existsSync(file)) continue
    const raw = readJson(file)
    const values = Array.isArray(raw) ? raw : [raw]
    for (const value of values) {
      const architecture = normalizeArchitecture(value, manifest)
      if (architecture) architectures.push(architecture)
    }
  }
  return architectures
}

export function loadIndustryProcessTemplates() {
  const dirs = runtimeProfilePackDirs()
  const signature = resourceCacheSignature(dirs, 'processTemplates')
  if (cachedTemplates && cachedTemplatesSignature === signature) return cachedTemplates
  if (!dirs.length) {
    cachedTemplates = []
    cachedTemplatesSignature = signature
    return cachedTemplates
  }
  cachedTemplates = keepLatestByPackAndResource(
    dirs.flatMap((dir) => {
      try {
        return loadTemplatesFromPackDir(dir)
      } catch {
        return []
      }
    }),
    (template) => template.processId,
  )
  cachedTemplatesSignature = signature
  return cachedTemplates
}

export function loadCloudIndustryProcessTemplates() {
  return []
}

export function loadIndustryFactoryArchitectures() {
  const dirs = runtimeProfilePackDirs()
  const signature = resourceCacheSignature(dirs, 'factoryArchitectures')
  if (cachedArchitectures && cachedArchitecturesSignature === signature) return cachedArchitectures
  if (!dirs.length) {
    cachedArchitectures = []
    cachedArchitecturesSignature = signature
    return cachedArchitectures
  }
  cachedArchitectures = keepLatestByPackAndResource(
    dirs.flatMap((dir) => {
      try {
        return loadArchitecturesFromPackDir(dir)
      } catch {
        return []
      }
    }),
    (architecture) => architecture.id,
  )
  cachedArchitecturesSignature = signature
  return cachedArchitectures
}

function containsPromptToken(prompt: string, value: string | undefined) {
  if (!value) return false
  const normalizedPrompt = prompt.toLowerCase()
  const normalizedValue = value.toLowerCase()
  return normalizedValue.length > 1 && normalizedPrompt.includes(normalizedValue)
}

function stationMatchesPrompt(prompt: string, station: ProcessStationPlan) {
  return (
    containsPromptToken(prompt, station.id) ||
    containsPromptToken(prompt, station.role) ||
    containsPromptToken(prompt, station.label) ||
    containsPromptToken(prompt, station.displayLabel) ||
    containsPromptToken(prompt, station.equipmentHint)
  )
}

function scopeMatchesPrompt(prompt: string, scope: FactoryArchitectureScope) {
  return (
    containsPromptToken(prompt, scope.id) ||
    containsPromptToken(prompt, scope.label) ||
    scope.aliases.some((alias) => containsPromptToken(prompt, alias))
  )
}

function keyFocusStationIds(architecture: IndustryFactoryArchitecture, stationIds: Set<string>) {
  return [
    architecture.layoutHints.highestStationId,
    architecture.layoutHints.longAxisStationId,
    ...(architecture.layoutHints.sideBranchStationIds ?? []),
  ].filter((id): id is string => Boolean(id && stationIds.has(id)))
}

function stationPositionHintsForIds(
  hints: FactoryArchitectureLayoutHints['stationPositionHints'],
  stationIds: Set<string>,
) {
  if (!hints) return undefined
  const filtered = Object.entries(hints).filter(([stationId]) => stationIds.has(stationId))
  return filtered.length ? Object.fromEntries(filtered) : undefined
}

function planSubsetDimensions(input: {
  plan: ProcessTemplate['stations']
  selectedCount: number
  base?: { length?: number; width?: number }
}) {
  const ratio = input.plan.length > 0 ? input.selectedCount / input.plan.length : 1
  return {
    length: Math.max(10, (input.base?.length ?? 24) * Math.max(0.32, Math.sqrt(ratio))),
    width: Math.max(6, (input.base?.width ?? 9) * Math.max(0.42, Math.sqrt(ratio))),
  }
}

export function applyFactoryArchitectureToPlan(input: {
  plan: ProcessLinePlan
  prompt: string
}): ProcessLinePlan {
  const architecture = loadIndustryFactoryArchitectures().find(
    (item) => item.processId === input.plan.processId,
  )
  if (!architecture) return input.plan

  const stationMatch = input.plan.stations.find((station) =>
    stationMatchesPrompt(input.prompt, station),
  )
  const scopeMatch = stationMatch
    ? undefined
    : architecture.scopes.find((scope) => scopeMatchesPrompt(input.prompt, scope))
  const moduleIds = new Set(
    stationMatch
      ? architecture.modules
          .filter((module) => module.stationIds.includes(stationMatch.id))
          .map((module) => module.id)
      : scopeMatch?.includeModules,
  )
  const selectedStationIds = stationMatch
    ? new Set([stationMatch.id])
    : moduleIds.size
      ? new Set(
          architecture.modules
            .filter((module) => moduleIds.has(module.id))
            .sort((left, right) => left.order - right.order)
            .flatMap((module) => module.stationIds),
        )
      : undefined
  if (!selectedStationIds?.size) {
    const allStationIds = new Set(input.plan.stations.map((station) => station.id))
    const positionHints = stationPositionHintsForIds(
      architecture.layoutHints.stationPositionHints,
      allStationIds,
    )
    return {
      ...input.plan,
      architecture: {
        id: architecture.id,
        label: architecture.label,
        keyFocusStationIds: keyFocusStationIds(architecture, allStationIds),
        zoneDisplay: 'subtle',
        ...(architecture.layoutHints.omitPerimeterWalls != null
          ? { omitPerimeterWalls: architecture.layoutHints.omitPerimeterWalls }
          : {}),
        ...(architecture.layoutHints.omitCeiling != null
          ? { omitCeiling: architecture.layoutHints.omitCeiling }
          : {}),
        ...(architecture.layoutHints.omitRoof != null
          ? { omitRoof: architecture.layoutHints.omitRoof }
          : {}),
        ...(positionHints ? { stationPositionHints: positionHints } : {}),
      },
    }
  }

  const stations = input.plan.stations.filter((station) => selectedStationIds.has(station.id))
  if (!stations.length) return input.plan
  const stationIds = new Set(stations.map((station) => station.id))
  const positionHints = stationPositionHintsForIds(
    architecture.layoutHints.stationPositionHints,
    stationIds,
  )
  return {
    ...input.plan,
    layoutStyle: stations.length <= 1 ? 'cell' : input.plan.layoutStyle,
    dimensions:
      stations.length === input.plan.stations.length
        ? input.plan.dimensions
        : planSubsetDimensions({
            plan: input.plan.stations,
            selectedCount: stations.length,
            base: input.plan.dimensions,
          }),
    stations,
    connections: input.plan.connections.filter(
      (connection) =>
        stationIds.has(connection.fromStationId) && stationIds.has(connection.toStationId),
    ),
    architecture: {
      id: architecture.id,
      label: architecture.label,
      ...(scopeMatch ? { scopeId: scopeMatch.id, scopeLabel: scopeMatch.label } : {}),
      moduleIds: [...moduleIds],
      keyFocusStationIds: keyFocusStationIds(architecture, stationIds),
      zoneDisplay: 'subtle',
      ...(architecture.layoutHints.omitPerimeterWalls != null
        ? { omitPerimeterWalls: architecture.layoutHints.omitPerimeterWalls }
        : {}),
      ...(architecture.layoutHints.omitCeiling != null
        ? { omitCeiling: architecture.layoutHints.omitCeiling }
        : {}),
      ...(architecture.layoutHints.omitRoof != null
        ? { omitRoof: architecture.layoutHints.omitRoof }
        : {}),
      ...(positionHints ? { stationPositionHints: positionHints } : {}),
    },
  }
}

export function resolveIndustryPackDir(ref: IndustryPackRef): string | undefined {
  for (const dir of runtimeProfilePackDirs()) {
    const manifestPath = preferredIndustryManifestPath(dir)
    if (!fs.existsSync(manifestPath)) continue
    try {
      const manifest = normalizeManifest(readJson(manifestPath))
      if (
        manifest?.id === ref.id &&
        manifest.version === ref.version &&
        (!ref.industry || manifest.industry === ref.industry)
      ) {
        return dir
      }
    } catch {
      // Ignore malformed cloud pack manifests during best-effort resolution.
    }
  }
  return undefined
}

export function resetIndustryProcessTemplateCacheForTests() {
  cachedTemplates = undefined
  cachedArchitectures = undefined
}
