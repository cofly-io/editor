import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DEVICE_PROFILE_DEFINITIONS,
  type DeviceProfileDefinition,
  type DeviceProfileSource,
  EDITABLE_SCHEMA_DEFINITIONS,
  type EditableSchemaDefinition,
  mergeDeviceProfiles,
  normalizeDeviceProfileInput,
  resolveEditableSchemaForProfile,
  validateDeviceProfileDefinition,
} from '@pascal-app/core/lib/device-profile-registry'
import { isAssetIndustryPackDir, loadAssetIndustryPackResourcesSync } from './asset-industry-packs'
import { installedAssetIndustryPackDirs } from './asset-packs'
import { findRepoRoot } from './generated-assets/manifest'
import { enabledProfilePackDirs, validateProfilePackDir } from './profile-packs'

type ProfileSourceDir = {
  dir: string
  source: DeviceProfileSource
}

export type LoadedDeviceProfiles = {
  profiles: DeviceProfileDefinition[]
  warnings: string[]
  knowledgeResources?: {
    layouts: Array<Record<string, unknown>>
    partPresets: Array<Record<string, unknown>>
    qualityRules: Array<Record<string, unknown>>
    editableSchemas: EditableSchemaDefinition[]
    aliases: Array<Record<string, unknown>>
  }
}

export type LoadDeviceProfilesOptions = {
  extraPackDirs?: readonly string[]
}

async function exists(dir: string) {
  try {
    await fs.access(dir)
    return true
  } catch {
    return false
  }
}

async function collectProfileFiles(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectProfileFiles(fullPath)))
    } else if (entry.name !== 'pack.json' && /\.(json|ya?ml)$/i.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  const number = Number(trimmed)
  if (Number.isFinite(number) && /^-?\d+(?:\.\d+)?$/.test(trimmed)) return number
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => parseScalar(item))
  }
  return trimmed
}

function parseSimpleYaml(text: string): unknown {
  const root: Record<string, unknown> = {}
  let currentObjectKey: string | undefined
  let currentArrayKey: string | undefined
  let currentArrayItem: Record<string, unknown> | undefined

  for (const rawLine of text.split(/\r?\n/)) {
    const withoutComment = rawLine.replace(/\s+#.*$/, '')
    if (!withoutComment.trim()) continue
    const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0
    const line = withoutComment.trim()

    if (indent === 0) {
      currentObjectKey = undefined
      currentArrayKey = undefined
      currentArrayItem = undefined
      const match = /^([^:]+):(?:\s*(.*))?$/.exec(line)
      if (!match) continue
      const key = match[1]?.trim()
      const value = match[2] ?? ''
      if (!key) continue
      if (!value) {
        if (key === 'parts') {
          root[key] = []
          currentArrayKey = key
        } else {
          root[key] = {}
          currentObjectKey = key
        }
      } else {
        root[key] = parseScalar(value)
      }
      continue
    }

    if (currentArrayKey && line.startsWith('- ')) {
      const item: Record<string, unknown> = {}
      ;(root[currentArrayKey] as unknown[]).push(item)
      currentArrayItem = item
      const inline = line.slice(2)
      const match = /^([^:]+):\s*(.*)$/.exec(inline)
      if (match?.[1]) item[match[1].trim()] = parseScalar(match[2] ?? '')
      continue
    }

    const match = /^([^:]+):\s*(.*)$/.exec(line)
    if (!match?.[1]) continue
    const key = match[1].trim()
    const value = parseScalar(match[2] ?? '')
    if (currentArrayItem) {
      currentArrayItem[key] = value
    } else if (currentObjectKey && typeof root[currentObjectKey] === 'object') {
      ;(root[currentObjectKey] as Record<string, unknown>)[key] = value
    }
  }
  return root
}

function parseProfileFile(text: string, filePath: string): unknown {
  if (/\.json$/i.test(filePath)) return JSON.parse(text)
  try {
    return JSON.parse(text)
  } catch {
    return parseSimpleYaml(text)
  }
}

function profilePayload(raw: Record<string, unknown>): Record<string, unknown> {
  if (typeof raw.id === 'string') return raw
  if (typeof raw.profile === 'object' && raw.profile !== null && !Array.isArray(raw.profile)) {
    return raw.profile as Record<string, unknown>
  }
  if (
    typeof raw.draftProfile === 'object' &&
    raw.draftProfile !== null &&
    !Array.isArray(raw.draftProfile)
  ) {
    return raw.draftProfile as Record<string, unknown>
  }
  return raw
}

async function loadProfilesFromDir({
  dir,
  source,
}: ProfileSourceDir): Promise<LoadedDeviceProfiles> {
  const warnings: string[] = []
  const profiles: DeviceProfileDefinition[] = []
  for (const file of await collectProfileFiles(dir)) {
    try {
      const parsed = parseProfileFile(await fs.readFile(file, 'utf8'), file)
      const rawProfiles = Array.isArray(parsed) ? parsed : [parsed]
      for (const raw of rawProfiles) {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          warnings.push(`Ignored non-object device profile in ${file}.`)
          continue
        }
        const profile = normalizeDeviceProfileInput(profilePayload(raw), source)
        const validation = validateDeviceProfileDefinition(profile)
        if (!validation.ok) {
          warnings.push(
            `Ignored invalid device profile ${profile.id} from ${file}: ${validation.issues.join('; ')}`,
          )
          continue
        }
        warnings.push(...validation.warnings.map((warning) => `${file}: ${warning}`))
        profiles.push(profile)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`Failed to load device profile ${file}: ${message}`)
    }
  }
  return { profiles, warnings }
}

function resourceId(resource: Record<string, unknown>) {
  return typeof resource.id === 'string' && resource.id.trim() ? resource.id.trim() : undefined
}

function resourceById(resources: readonly Record<string, unknown>[]) {
  return new Map(
    resources.flatMap((resource) => {
      const id = resourceId(resource)
      return id ? [[id, resource] as const] : []
    }),
  )
}

function resolveProfileKnowledgeResources(
  profiles: readonly DeviceProfileDefinition[],
  resources: NonNullable<LoadedDeviceProfiles['knowledgeResources']>,
): DeviceProfileDefinition[] {
  const layouts = resourceById(resources.layouts)
  const partPresets = resourceById(resources.partPresets)
  const qualityRules = resourceById(resources.qualityRules)
  const editableSchemas = [...resources.editableSchemas, ...EDITABLE_SCHEMA_DEFINITIONS]

  return profiles.map((profile) => {
    const layoutTemplate =
      typeof profile.layoutTemplate === 'string' ? layouts.get(profile.layoutTemplate) : undefined
    const resolvedPartPresets = Object.fromEntries(
      Object.values(profile.partPresets ?? {}).flatMap((presetId) => {
        const preset = partPresets.get(presetId)
        return preset ? [[presetId, preset] as const] : []
      }),
    )
    const qualityRule =
      typeof profile.qualityRules === 'string' ? qualityRules.get(profile.qualityRules) : undefined
    const resolvedEditableSchema = resolveEditableSchemaForProfile(profile, editableSchemas)

    return {
      ...profile,
      ...(layoutTemplate
        ? {
            layoutHints: {
              ...(profile.layoutHints ?? {}),
              layoutTemplate,
            },
          }
        : {}),
      ...(Object.keys(resolvedPartPresets).length > 0 ? { resolvedPartPresets } : {}),
      ...(qualityRule ? { qualityRules: qualityRule } : {}),
      ...(resolvedEditableSchema ? { resolvedEditableSchema } : {}),
    }
  })
}

async function loadProfilesFromPackDir(dir: string): Promise<LoadedDeviceProfiles> {
  try {
    const validation = await validateProfilePackDir(dir)
    const profiles = resolveProfileKnowledgeResources(validation.profiles, validation.resources)
    return {
      profiles,
      knowledgeResources: validation.resources,
      warnings: validation.warnings.map((warning) => `${validation.manifest.id}: ${warning}`),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { profiles: [], warnings: [`Failed to load device profile pack ${dir}: ${message}`] }
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function assetGeneratorId(raw: Record<string, unknown>) {
  const generatorRef = recordValue(raw.generatorRef)
  return typeof generatorRef?.generator === 'string' ? generatorRef.generator : undefined
}

function mappedAssetRole(role: string | undefined) {
  switch (role) {
    case 'tank_shell':
      return 'vessel_shell'
    case 'service_ladder':
    case 'external_spiral_ladder':
      return 'access_ladder'
    case 'exchanger_shell':
      return 'heat_exchanger_shell'
    case 'pump_casing':
      return 'volute_casing'
    case 'pump_motor':
      return 'drive_motor'
    case 'pump_skid':
      return 'support_base'
    case 'pipe_rack_frame':
      return 'pipe_rack_support_frame'
    default:
      return role
  }
}

function assetProfilePartFallbacks(raw: Record<string, unknown>) {
  const generator = assetGeneratorId(raw)
  const dimensions = recordValue(raw.defaultDimensions)
  const params = recordValue(raw.params)
  const length =
    typeof params?.length === 'number' && params.length > 0
      ? params.length
      : typeof dimensions?.length === 'number' && dimensions.length > 0
        ? dimensions.length
        : undefined
  const radius =
    typeof params?.radius === 'number' && params.radius > 0
      ? params.radius
      : typeof dimensions?.width === 'number' && dimensions.width > 0
        ? dimensions.width / 2
        : typeof dimensions?.height === 'number' && dimensions.height > 0
          ? dimensions.height / 2
          : undefined
  const primary = mappedAssetRole(
    typeof raw.primarySemanticRole === 'string' ? raw.primarySemanticRole : undefined,
  )
  switch (generator) {
    case 'tank.vertical':
    case 'vessel.horizontal':
      return [
        {
          kind: 'cylindrical_tank',
          semanticRole: 'vessel_shell',
        },
        { kind: 'flanged_nozzle', semanticRole: 'inlet_port', required: false },
        { kind: 'flanged_nozzle', semanticRole: 'outlet_port', required: false },
        { kind: 'platform_ladder', semanticRole: 'access_ladder', required: false },
      ]
    case 'kiln.rotary':
      return [
        {
          kind: 'cylindrical_tank',
          semanticRole: 'kiln_shell',
          required: true,
          ...(length ? { length } : {}),
          ...(radius ? { radius } : {}),
        },
        {
          kind: 'flange_ring',
          semanticRole: 'riding_ring',
          attachToRole: 'kiln_shell',
          arrayAlong: 'length',
          count: 3,
        },
        {
          kind: 'bearing_block',
          semanticRole: 'support_roller',
          attachToRole: 'kiln_shell',
          arrayAlong: 'length',
          count: 3,
        },
        {
          kind: 'flange_ring',
          semanticRole: 'girth_gear',
          attachToRole: 'kiln_shell',
        },
        {
          kind: 'motor_gearbox_unit',
          semanticRole: 'kiln_drive_unit',
          attachToRole: 'kiln_shell',
        },
      ]
    case 'tower.distillation':
      return [
        { kind: 'cylindrical_tank', semanticRole: primary ?? 'distillation_column_shell' },
        { kind: 'platform_ladder', semanticRole: 'service_platform', required: false },
        { kind: 'flanged_nozzle', semanticRole: 'crude_feed_inlet', required: false },
        { kind: 'flanged_nozzle', semanticRole: 'overhead_product_outlet', required: false },
        { kind: 'flanged_nozzle', semanticRole: 'bottoms_outlet', required: false },
      ]
    case 'pump.centrifugal':
      return [
        { kind: 'skid_base', semanticRole: 'support_base' },
        { kind: 'volute_casing', semanticRole: 'volute_casing' },
        { kind: 'ribbed_motor_body', semanticRole: 'drive_motor' },
        { kind: 'inlet_port', semanticRole: 'inlet_port', required: false },
        { kind: 'outlet_port', semanticRole: 'outlet_port', required: false },
      ]
    case 'heat-exchanger.shell':
      return [
        { kind: 'heat_exchanger', semanticRole: 'heat_exchanger_shell' },
        { kind: 'skid_base', semanticRole: 'support_base', required: false },
      ]
    case 'pipe-rack.standard':
      return [
        { kind: 'pipe_rack', semanticRole: 'pipe_rack_support_frame' },
        { kind: 'pipe_run', semanticRole: 'parallel_pipe_run', required: false },
      ]
    case 'pipe.run':
      return [{ kind: 'pipe_run', semanticRole: 'pipe_segment' }]
    case 'platform.stair':
      return [{ kind: 'platform_ladder', semanticRole: 'service_platform' }]
    case 'heater.fired':
      return [
        { kind: 'generic_body', semanticRole: primary ?? 'fired_heater' },
        { kind: 'chimney_stack', semanticRole: 'heater_stack_stub', required: false },
        { kind: 'generic_panel', semanticRole: 'burner', required: false },
      ]
    case 'boiler.utility':
      return [
        { kind: 'generic_body', semanticRole: primary ?? 'boiler_body' },
        { kind: 'cylindrical_tank', semanticRole: 'steam_drum', required: false },
        { kind: 'chimney_stack', semanticRole: 'boiler_stack', required: false },
        { kind: 'pipe_manifold', semanticRole: 'steam_header', required: false },
      ]
    case 'flare.stack':
      return [
        { kind: 'chimney_stack', semanticRole: 'flare_stack' },
        { kind: 'cylindrical_tank', semanticRole: 'knockout_drum', required: false },
        { kind: 'pipe_run', semanticRole: 'relief_gas_inlet', required: false },
      ]
    default:
      return [{ kind: 'generic_body', semanticRole: primary ?? 'main_body' }]
  }
}

function assetProfileArchetype(raw: Record<string, unknown>) {
  const generator = assetGeneratorId(raw)
  if (generator === 'pump.centrifugal') return 'rotating_fluid_machine'
  if (generator === 'kiln.rotary') return 'thermal_equipment'
  if (
    generator === 'pipe-rack.standard' ||
    generator === 'pipe.run' ||
    generator === 'platform.stair'
  ) {
    return 'pipe_valve_system'
  }
  if (
    generator === 'heat-exchanger.shell' ||
    generator === 'heater.fired' ||
    generator === 'boiler.utility'
  )
    return 'thermal_equipment'
  if (
    generator === 'tank.vertical' ||
    generator === 'vessel.horizontal' ||
    generator === 'tower.distillation'
  ) {
    return 'process_vessel'
  }
  return 'generic_industrial'
}

function assetProfileLayoutFamily(raw: Record<string, unknown>) {
  switch (assetGeneratorId(raw)) {
    case 'kiln.rotary':
    case 'mill.vertical':
    case 'mill.ball-cement':
    case 'pump.centrifugal':
    case 'turbine.generator':
      return 'rotating_machine_layout'
    case 'tank.vertical':
    case 'vessel.horizontal':
    case 'tower.distillation':
      return 'vessel_layout'
    case 'pipe-rack.standard':
    case 'pipe.run':
    case 'platform.stair':
      return 'linear_transport_layout'
    default:
      return 'generic_industrial_layout'
  }
}

function assetProfileAliases(raw: Record<string, unknown>) {
  const id = typeof raw.id === 'string' ? raw.id : undefined
  const builtIn = id === 'cement.rotary_kiln' ? ['rotary kiln', '回转窑', '水泥窑'] : []
  return [
    ...(id ? [id, id.split('.').pop() ?? id] : []),
    ...(typeof raw.name === 'string' ? [raw.name] : []),
    ...(Array.isArray(raw.aliases)
      ? raw.aliases.filter(
          (alias): alias is string => typeof alias === 'string' && alias.trim().length > 0,
        )
      : []),
    ...builtIn,
  ]
}

function normalizeAssetIndustryProfile(
  raw: Record<string, unknown>,
  sourcePack: { id: string; version: string; industry: string },
) {
  const params = recordValue(raw.params)
  const generatorRef = recordValue(raw.generatorRef)
  const primarySemanticRole = mappedAssetRole(
    typeof raw.primarySemanticRole === 'string' ? raw.primarySemanticRole : undefined,
  )
  const qualityRequiredRoles = Array.isArray(raw.qualityRequiredRoles)
    ? raw.qualityRequiredRoles
        .filter((role): role is string => typeof role === 'string' && role.trim().length > 0)
        .map(mappedAssetRole)
        .filter((role): role is string => Boolean(role))
    : []
  return {
    ...raw,
    family: 'generic',
    layoutFamily: assetProfileLayoutFamily(raw),
    archetypeFamily: assetProfileArchetype(raw),
    layoutHints: {
      ...(recordValue(raw.layoutHints) ?? {}),
      ...(typeof generatorRef?.componentPack === 'string' &&
      typeof generatorRef.generator === 'string'
        ? {
            assetComponentGenerator: {
              componentPack: generatorRef.componentPack,
              generator: generatorRef.generator,
              params: params ?? {},
            },
          }
        : {}),
    },
    primarySemanticRole,
    parts: assetProfilePartFallbacks(raw),
    sourcePack,
    aliases: assetProfileAliases(raw),
    description:
      typeof raw.description === 'string'
        ? raw.description
        : `IndustrialPack generator profile ${String(raw.id ?? raw.name ?? 'equipment')}.`,
    qualityRules: qualityRequiredRoles.length ? { requiredRoles: qualityRequiredRoles } : undefined,
    detailBudget: params?.detailBudget,
  }
}

async function loadProfilesFromAssetIndustryPackDir(dir: string): Promise<LoadedDeviceProfiles> {
  const resources = loadAssetIndustryPackResourcesSync(dir)
  if (!resources) return { profiles: [], warnings: [] }
  const sourcePack = {
    id: resources.manifest.id,
    version: resources.manifest.version,
    industry: resources.manifest.industry,
  }
  const profiles: DeviceProfileDefinition[] = []
  const warnings = [...resources.warnings]
  for (const raw of resources.profiles) {
    const profile = normalizeDeviceProfileInput(
      normalizeAssetIndustryProfile(raw, sourcePack),
      'imported_pack',
    )
    const validation = validateDeviceProfileDefinition(profile)
    if (!validation.ok) {
      warnings.push(
        `Ignored invalid asset industry profile ${profile.id} from ${dir}: ${validation.issues.join('; ')}`,
      )
      continue
    }
    warnings.push(...validation.warnings.map((warning) => `${profile.id}: ${warning}`))
    profiles.push(profile)
  }
  return { profiles, warnings }
}

export async function loadDeviceProfiles(
  options: LoadDeviceProfilesOptions = {},
): Promise<LoadedDeviceProfiles> {
  const root = await findRepoRoot()
  const enabledPackDirs = await enabledProfilePackDirs()
  const assetIndustryPackDirs = await installedAssetIndustryPackDirs()
  const extraPackDirs = Array.from(
    new Set(
      (options.extraPackDirs ?? [])
        .filter((dir): dir is string => typeof dir === 'string' && dir.trim().length > 0)
        .map((dir) => path.resolve(dir)),
    ),
  )
  const sourceDirs: ProfileSourceDir[] = [
    {
      dir: path.join(root, 'apps', 'editor', 'data', 'device-profile-packs'),
      source: 'imported_pack',
    },
    { dir: path.join(root, 'apps', 'editor', 'data', 'device-profiles'), source: 'workspace' },
    {
      dir: path.join(root, 'apps', 'editor', '.generated', 'device-profile-candidates'),
      source: 'generated_candidate',
    },
  ]
  const loaded = await Promise.all(sourceDirs.map(loadProfilesFromDir))
  const assetIndustryExtraPackDirs = extraPackDirs.filter(isAssetIndustryPackDir)
  const profilePackExtraDirs = extraPackDirs.filter((dir) => !isAssetIndustryPackDir(dir))
  const enabledPacks = await Promise.all(
    [...enabledPackDirs, ...profilePackExtraDirs].map(loadProfilesFromPackDir),
  )
  const assetIndustryPacks = await Promise.all(
    [...assetIndustryPackDirs, ...assetIndustryExtraPackDirs].map(
      loadProfilesFromAssetIndustryPackDir,
    ),
  )
  const packResources: NonNullable<LoadedDeviceProfiles['knowledgeResources']> = {
    layouts: enabledPacks.flatMap((entry) => entry.knowledgeResources?.layouts ?? []),
    partPresets: enabledPacks.flatMap((entry) => entry.knowledgeResources?.partPresets ?? []),
    qualityRules: enabledPacks.flatMap((entry) => entry.knowledgeResources?.qualityRules ?? []),
    editableSchemas: enabledPacks.flatMap(
      (entry) => entry.knowledgeResources?.editableSchemas ?? [],
    ),
    aliases: enabledPacks.flatMap((entry) => entry.knowledgeResources?.aliases ?? []),
  }
  const importedProfiles = [
    ...(loaded[0]?.profiles ?? []),
    ...enabledPacks.flatMap((entry) => entry.profiles),
    ...assetIndustryPacks.flatMap((entry) => entry.profiles),
  ]
  const merged = mergeDeviceProfiles([
    loaded[1]?.profiles ?? [],
    importedProfiles,
    DEVICE_PROFILE_DEFINITIONS,
    loaded[2]?.profiles ?? [],
  ])
  return {
    profiles: merged.profiles,
    knowledgeResources: packResources,
    warnings: [
      ...loaded.flatMap((entry) => entry.warnings),
      ...enabledPacks.flatMap((entry) => entry.warnings),
      ...assetIndustryPacks.flatMap((entry) => entry.warnings),
      ...merged.warnings,
    ],
  }
}
