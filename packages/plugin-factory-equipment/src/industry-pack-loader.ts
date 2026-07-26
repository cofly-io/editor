/**
 * Industry Pack Loader for Pascal Editor
 *
 * Loads industry packs from the IndustrialPack workspace and converts
 * profiles into SemanticRecipeDefinition objects that can be registered
 * with the editor's semantic recipe registry.
 *
 * Usage:
 *   const loader = new IndustryPackLoader({
 *     industryPacksRoot: 'path/to/industry-packs',
 *     componentPacksRoot: 'path/to/component-packs',
 *   })
 *   const pack = await loader.loadIndustryPack('industry.refinery.basic')
 *   const recipes = loader.profilesToRecipes(pack)
 *   recipes.forEach(recipe => registerSemanticRecipe(recipe))
 */

import type {
  SemanticRecipeDefinition,
  SemanticRecipePart,
  SemanticRecipePort,
  SemanticRecipePartGroup,
  SemanticRecipeEditableParam,
  SemanticRecipeComposeInput,
  SemanticRecipeComposeResult,
  SemanticRecipeEnvelope,
} from '@pascal-app/core'
import { mergeParamsWithDefaults, validateGeneratorParams } from './param-schema-converter'
import { synthesizeGeometryParts } from './runtime-geometry-synthesizer'

// ─── IndustrialPack Data Types ───────────────────────────────────────────────

export type IndustryPackManifest = {
  schemaVersion: string
  id: string
  name: string
  version: string
  industry: string
  description: string
  dependsOnComponentPacks?: Array<{ id: string; version: string }>
  profiles: string[]
  layouts: string[]
  connections: string[]
  qualityRules: string[]
  previews: string[]
  displayName?: string
  localizedNames?: Record<string, string>
  generatorOwnership?: 'industry-local' | 'component-pack'
}

export type GeneratorRef = {
  componentPack: string
  generator: string
}

export type Profile = {
  id: string
  name: string
  family: string
  generatorRef: GeneratorRef
  defaultDimensions: {
    length: number
    width: number
    height: number
  }
  params: Record<string, unknown>
  ports: Record<string, string>
  primarySemanticRole: string
  qualityRequiredRoles: string[]
  displayName?: string
  localizedNames?: Record<string, string>
}

export type LayoutStation = {
  id: string
  profileId: string
  position: [number, number, number]
  rotationY: number
  displayName?: string
  localizedNames?: Record<string, string>
  zone?: string
  zoneDisplayName?: string
  localizedZoneNames?: Record<string, string>
}

export type Layout = {
  schemaVersion: string
  id: string
  siteMode?: string
  omitCeiling?: boolean
  omitRoof?: boolean
  stations: LayoutStation[]
}

export type ConnectionEndpoint = {
  stationId: string
  port: string
}

export type Connection = {
  from: ConnectionEndpoint
  to: ConnectionEndpoint
  medium: string
  render?: {
    color?: string
    elevation?: number
    diameter?: number
    supportStyle?: string
    supportSpacing?: number
    supportWidth?: number
    galleryWidth?: number
    galleryHeight?: number
    enclosed?: boolean
    walkway?: boolean
  }
  visualKind?: string
}

export type Connections = {
  schemaVersion: string
  connections: Connection[]
}

export type QualityRule = {
  id: string
  description: string
}

export type QualityRules = {
  schemaVersion: string
  rules: QualityRule[]
}

// ─── Generator Manifest (from component pack) ────────────────────────────────

export type GeneratorParamSchema = {
  type: 'number' | 'string' | 'boolean' | 'color' | 'enum'
  label?: string
  default?: unknown
  min?: number
  max?: number
  unit?: string
  options?: string[]
}

export type GeneratorPort = {
  id: string
  role: string
  label?: string
}

export type GeneratorManifest = {
  schemaVersion: string
  id: string
  label: string
  family: string
  description: string
  params: Record<string, GeneratorParamSchema>
  ports: GeneratorPort[]
  editableParts: string[]
  dataBindings?: Array<{
    id: string
    label: string
    type: string
    effects: string[]
  }>
  output: { type: string }
}

export type ComponentPackManifest = {
  schemaVersion: string
  id: string
  name: string
  version: string
  description: string
  publisher: string
  generators: Array<{
    id: string
    label: string
    entry: string
    manifest: string
  }>
}

// ─── Loaded Pack Data ────────────────────────────────────────────────────────

export type LoadedIndustryPack = {
  manifest: IndustryPackManifest
  profiles: Profile[]
  layouts: Layout[]
  connections: Connections[]
  qualityRules: QualityRules[]
  generatorManifests: Map<string, GeneratorManifest>
}

// ─── Loader Options ──────────────────────────────────────────────────────────

export type IndustryPackLoaderOptions = {
  /** Root directory containing industry-packs/ */
  industryPacksRoot: string
  /** Root directory containing component-packs/ (for shared generators) */
  componentPacksRoot?: string
  /** Whether to load generator manifests from local pack generators/ folder */
  loadLocalGenerators?: boolean
  /**
   * Part generation mode for profile-derived recipes.
   *  - 'geometry'  (default): synthesize geometry-ready parts (real dims +
   *    part-registry kinds) via the runtime geometry synthesizer.
   *  - 'metadata': legacy placeholder parts (parametric_equipment shell +
   *    role markers) for consumers that delegate geometry to the node system.
   */
  partMode?: 'geometry' | 'metadata'
}

// ─── Recipe Generation Context ───────────────────────────────────────────────

type RecipeContext = {
  profile: Profile
  generatorManifest: GeneratorManifest | undefined
  packId: string
}

// ─── Main Loader Class ───────────────────────────────────────────────────────

export class IndustryPackLoader {
  private readonly options: IndustryPackLoaderOptions

  constructor(options: IndustryPackLoaderOptions) {
    this.options = options
  }

  /**
   * Validate a profile's params against its generator manifest.
   * Returns validation errors or null if valid.
   */
  validateProfileParams(
    profile: Profile,
    generatorManifest: GeneratorManifest | undefined,
  ): string[] | null {
    if (!generatorManifest) return null

    const result = validateGeneratorParams(generatorManifest, profile.params ?? {})
    if (!result.success) {
      return result.errors.issues.map(
        (issue) => `${profile.id}.${issue.path.join('.')}: ${issue.message}`,
      )
    }
    return null
  }

  /**
   * Validate all profiles in a loaded pack.
   * Returns a map of profile ID to validation errors (empty if all valid).
   */
  validateAllProfiles(pack: LoadedIndustryPack): Map<string, string[]> {
    const errors = new Map<string, string[]>()

    for (const profile of pack.profiles) {
      const generatorManifest = pack.generatorManifests.get(profile.generatorRef.generator)
      const profileErrors = this.validateProfileParams(profile, generatorManifest)
      if (profileErrors && profileErrors.length > 0) {
        errors.set(profile.id, profileErrors)
      }
    }

    return errors
  }

  /**
   * Load an industry pack by ID.
   * Reads manifest, profiles, layouts, connections, quality rules,
   * and all referenced generator manifests.
   */
  async loadIndustryPack(packId: string): Promise<LoadedIndustryPack> {
    const packRoot = `${this.options.industryPacksRoot}/${packId}`

    // Load manifest
    const manifest = await this.readJson<IndustryPackManifest>(`${packRoot}/industry-pack.json`)

    // Load profiles
    const profiles = await this.loadJsonFiles<Profile>(packRoot, manifest.profiles ?? [])

    // Load layouts
    const layouts = await this.loadJsonFiles<Layout>(packRoot, manifest.layouts ?? [])

    // Load connections
    const connections = await this.loadJsonFiles<Connections>(packRoot, manifest.connections ?? [])

    // Load quality rules
    const qualityRules = await this.loadJsonFiles<QualityRules>(packRoot, manifest.qualityRules ?? [])

    // Load generator manifests for all profiles
    const generatorManifests = new Map<string, GeneratorManifest>()
    for (const profile of profiles) {
      const ref = profile.generatorRef
      if (!generatorManifests.has(ref.generator)) {
        const genManifest = await this.loadGeneratorManifest(packRoot, ref)
        if (genManifest) {
          generatorManifests.set(ref.generator, genManifest)
        }
      }
    }

    return {
      manifest,
      profiles,
      layouts,
      connections,
      qualityRules,
      generatorManifests,
    }
  }

  /**
   * Convert loaded profiles to SemanticRecipeDefinition objects.
   * These can be registered with the editor's semanticRecipeRegistry.
   */
  profilesToRecipes(pack: LoadedIndustryPack): SemanticRecipeDefinition[] {
    return pack.profiles.map((profile) => {
      const generatorManifest = pack.generatorManifests.get(profile.generatorRef.generator)
      const ctx: RecipeContext = {
        profile,
        generatorManifest,
        packId: pack.manifest.id,
      }
      return this.profileToRecipe(ctx)
    })
  }

  /**
   * Convert a single profile to a SemanticRecipeDefinition.
   * The recipe's compose() function will generate parts based on
   * the profile's params and the generator manifest's schema.
   */
  private profileToRecipe(ctx: RecipeContext): SemanticRecipeDefinition {
    const { profile, generatorManifest, packId } = ctx
    const recipeId = `${packId}:${profile.id}`

    // Build editable params from generator manifest schema
    const editableParams = this.buildEditableParams(profile, generatorManifest)

    // Build part groups from qualityRequiredRoles
    const partGroups = this.buildPartGroups(profile)

    // Build ports from profile ports + generator manifest ports
    const ports = this.buildPorts(profile, generatorManifest)

    return {
      id: recipeId,
      label: profile.displayName ?? profile.name,
      family: profile.family,
      acceptsProfiles: [profile.id, profile.family],
      paramSchema: {
        fields: Object.keys(profile.params ?? {}),
      },
      defaultEnvelope: {
        length: profile.defaultDimensions.length,
        width: profile.defaultDimensions.width,
        height: profile.defaultDimensions.height,
      },
      partGroups,
      editableParams,
      editablePartRoles: profile.qualityRequiredRoles ?? [],
      corePartRoles: this.buildCorePartRoles(profile),
      compose: (input: SemanticRecipeComposeInput) =>
        this.composeFromProfile(ctx, input),
    }
  }

  /**
   * The compose function for a profile-based recipe.
   * By default it synthesizes geometry-ready parts (real dimensions +
   * part-registry kinds) via the runtime geometry synthesizer, so the
   * editor's part composer can produce primitives without a handwritten
   * recipe. Set `partMode: 'metadata'` to fall back to placeholder parts
   * that delegate geometry to the node system.
   */
  private composeFromProfile(
    ctx: RecipeContext,
    input: SemanticRecipeComposeInput,
  ): SemanticRecipeComposeResult {
    const { profile, generatorManifest } = ctx
    const { params, envelope, medium } = input

    // Merge profile params with input params, then validate against generator schema
    const rawParams = { ...(profile.params ?? {}), ...(params ?? {}) }
    const mergedParams = generatorManifest
      ? mergeParamsWithDefaults(generatorManifest, rawParams)
      : rawParams

    // Use envelope from input, or fall back to profile defaults
    const env: SemanticRecipeEnvelope = {
      length: envelope?.length ?? profile.defaultDimensions.length,
      width: envelope?.width ?? profile.defaultDimensions.width,
      height: envelope?.height ?? profile.defaultDimensions.height,
      tolerance: envelope?.tolerance,
    }

    // Build parts from profile data. In 'geometry' mode (default) the runtime
    // geometry synthesizer emits parts with real dimensions and part-registry
    // kinds (cylindrical_tank, chimney_stack, heat_exchanger, ...) that the
    // editor's part composer turns into primitives / meshes directly.
    // In 'metadata' mode it falls back to the legacy placeholder parts.
    const parts =
      this.options.partMode === 'metadata'
        ? this.buildPartsFromProfile(profile, mergedParams, env)
        : synthesizeGeometryParts(profile, mergedParams, env)

    // Build ports
    const ports = this.buildPorts(profile, generatorManifest)

    return {
      parts,
      ports,
      envelope: env,
      partGroups: this.buildPartGroups(profile),
      editableParams: this.buildEditableParams(profile, generatorManifest),
      editablePartRoles: profile.qualityRequiredRoles ?? [],
      corePartRoles: this.buildCorePartRoles(profile),
      primarySemanticRole: profile.primarySemanticRole,
    }
  }

  /**
   * Build parts from profile metadata.
   * Each qualityRequiredRole becomes a part with the profile's params.
   */
  private buildPartsFromProfile(
    profile: Profile,
    params: Record<string, unknown>,
    envelope: SemanticRecipeEnvelope,
  ): SemanticRecipePart[] {
    const roles = profile.qualityRequiredRoles ?? []
    const primaryRole = profile.primarySemanticRole

    // Create a shell part for the primary role
    const shellPart: SemanticRecipePart = {
      id: 'shell',
      kind: 'parametric_equipment',
      semanticRole: primaryRole,
      sourcePartKind: profile.family,
      position: [0, envelope.height / 2, 0],
      length: envelope.length,
      width: envelope.width,
      height: envelope.height,
      params: {
        ...params,
        profileId: profile.id,
        generatorRef: profile.generatorRef,
      },
      material: {
        properties: {
          color: (params.shellColor as string) ?? (params.columnColor as string) ?? '#d1d5db',
          opacity: (params.shellOpacity as number) ?? 0.82,
          roughness: 0.48,
          metalness: 0.42,
          transparent: ((params.shellOpacity as number) ?? 0.82) < 1,
        },
      },
    }

    // Create parts for other required roles
    const roleParts: SemanticRecipePart[] = roles
      .filter((role) => role !== primaryRole)
      .map((role, index) => ({
        id: `part_${index}`,
        kind: 'equipment_part',
        semanticRole: role,
        sourcePartKind: role,
        position: [0, 0, 0] as [number, number, number],
        params: {
          role,
          profileId: profile.id,
        },
      }))

    return [shellPart, ...roleParts]
  }

  /**
   * Build editable params from generator manifest schema.
   * Maps generator.json params to SemanticRecipeEditableParam.
   */
  private buildEditableParams(
    profile: Profile,
    generatorManifest: GeneratorManifest | undefined,
  ): SemanticRecipeEditableParam[] {
    if (!generatorManifest?.params) return []

    return Object.entries(generatorManifest.params).map(([key, schema]) => {
      const param: SemanticRecipeEditableParam = {
        key,
        label: schema.label ?? key,
        kind: this.mapParamKind(schema.type),
        defaultValue: profile.params?.[key] ?? schema.default,
      }

      if (schema.type === 'number') {
        param.min = schema.min
        param.max = schema.max
        param.unit = schema.unit
      }

      if (schema.type === 'enum' && schema.options) {
        param.options = schema.options
      }

      // Add effects based on param type
      param.effects = [{ kind: 'set-param' }]

      // Color params affect the shell material
      if (schema.type === 'color') {
        param.effects = [
          { kind: 'set-param' },
          {
            kind: 'set-part-material',
            partRole: profile.primarySemanticRole,
            property: 'color',
          },
        ]
      }

      // Opacity params affect the shell material
      if (key.includes('Opacity') || key.includes('opacity')) {
        param.effects = [
          { kind: 'set-param' },
          {
            kind: 'set-part-material',
            partRole: profile.primarySemanticRole,
            property: 'opacity',
            transparentWhenBelowOne: true,
          },
        ]
      }

      return param
    })
  }

  /**
   * Map generator param type to SemanticRecipeEditableParam kind.
   */
  private mapParamKind(type: string): SemanticRecipeEditableParam['kind'] {
    switch (type) {
      case 'number':
        return 'number'
      case 'color':
        return 'color'
      case 'boolean':
        return 'boolean'
      case 'enum':
        return 'enum'
      default:
        return 'number'
    }
  }

  /**
   * Build part groups from profile qualityRequiredRoles.
   */
  private buildPartGroups(profile: Profile): SemanticRecipePartGroup[] {
    const roles = profile.qualityRequiredRoles ?? []
    if (roles.length === 0) return []

    return [
      {
        id: 'equipment',
        label: profile.displayName ?? profile.name,
        roles: [profile.primarySemanticRole],
        editable: ['color', 'opacity', 'scale', 'transform'],
      },
      {
        id: 'details',
        label: 'Details',
        roles: roles.filter((r) => r !== profile.primarySemanticRole),
        editable: ['visible', 'color', 'opacity'],
      },
    ]
  }

  /**
   * Build core part roles (must always be present).
   */
  private buildCorePartRoles(profile: Profile): string[] {
    return [profile.primarySemanticRole]
  }

  /**
   * Build ports from profile ports + generator manifest ports.
   */
  private buildPorts(
    profile: Profile,
    generatorManifest: GeneratorManifest | undefined,
  ): SemanticRecipePort[] {
    const genPorts = generatorManifest?.ports ?? []
    const profilePorts = profile.ports ?? {}

    return Object.entries(profilePorts).map(([alias, portId]) => {
      const genPort = genPorts.find((p) => p.id === portId)
      return {
        id: alias,
        role: genPort?.role ?? 'process-inlet',
        side: this.inferPortSide(alias),
        height: profile.defaultDimensions.height * 0.5,
        offset: 0,
      }
    })
  }

  /**
   * Infer port side from port alias name.
   */
  private inferPortSide(alias: string): SemanticRecipePort['side'] {
    const lower = alias.toLowerCase()
    if (lower.includes('inlet') || lower.includes('feed') || lower.includes('suction')) return 'left'
    if (lower.includes('outlet') || lower.includes('product') || lower.includes('discharge')) return 'right'
    if (lower.includes('vent') || lower.includes('overhead') || lower.includes('top')) return 'top'
    if (lower.includes('bottom') || lower.includes('drain')) return 'bottom'
    if (lower.includes('power') || lower.includes('data')) return 'back'
    return 'front'
  }

  /**
   * Load a generator manifest from local pack or component pack.
   */
  private async loadGeneratorManifest(
    packRoot: string,
    ref: GeneratorRef,
  ): Promise<GeneratorManifest | undefined> {
    // Try local pack generators first (industry-local ownership)
    if (this.options.loadLocalGenerators !== false) {
      const localPath = `${packRoot}/generators/${ref.generator}/generator.json`
      try {
        return await this.readJson<GeneratorManifest>(localPath)
      } catch {
        // Fall through to component pack
      }
    }

    // Try component pack
    if (this.options.componentPacksRoot) {
      const componentPath = `${this.options.componentPacksRoot}/${ref.componentPack}/generators/${ref.generator}/generator.json`
      try {
        return await this.readJson<GeneratorManifest>(componentPath)
      } catch {
        // Generator manifest not found
      }
    }

    return undefined
  }

  /**
   * Load multiple JSON files and flatten the results.
   */
  private async loadJsonFiles<T>(root: string, files: string[]): Promise<T[]> {
    const results: T[] = []
    for (const file of files) {
      try {
        const data = await this.readJson<T>(`${root}/${file}`)
        if (Array.isArray(data)) {
          results.push(...data)
        } else {
          results.push(data)
        }
      } catch (error) {
        console.warn(`Failed to load ${root}/${file}:`, error)
      }
    }
    return results
  }

  /**
   * Read and parse a JSON file.
   */
  private async readJson<T>(filePath: string): Promise<T> {
    // In a browser environment, use fetch
    if (typeof window !== 'undefined') {
      const response = await fetch(filePath)
      if (!response.ok) throw new Error(`Failed to fetch ${filePath}: ${response.statusText}`)
      return response.json() as Promise<T>
    }

    // In Node.js environment, use fs
    const { readFile } = await import('node:fs/promises')
    const content = await readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  }
}

// ─── Convenience Functions ───────────────────────────────────────────────────

/**
 * Load an industry pack and return recipes ready for registration.
 */
export async function loadIndustryPackRecipes(
  options: IndustryPackLoaderOptions & { packId: string },
): Promise<SemanticRecipeDefinition[]> {
  const loader = new IndustryPackLoader(options)
  const pack = await loader.loadIndustryPack(options.packId)
  return loader.profilesToRecipes(pack)
}

/**
 * Load an industry pack and register all recipes with the global registry.
 */
export async function registerIndustryPack(
  options: IndustryPackLoaderOptions & { packId: string },
  registerFn: (recipe: SemanticRecipeDefinition) => void,
): Promise<void> {
  const recipes = await loadIndustryPackRecipes(options)
  for (const recipe of recipes) {
    registerFn(recipe)
  }
}
