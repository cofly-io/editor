/**
 * Scene Generator
 *
 * Turns a LoadedIndustryPack's layout into placed scene nodes:
 *  - For each station, find the matching recipe (handwritten first, then
 *    profile-derived via the recipe registry's findByProfile).
 *  - Compose the recipe with the profile's params + defaultDimensions envelope.
 *  - Apply the station's position / rotationY as a world transform on parts.
 *  - Attach zone ground materials via LayoutRealism.
 *
 * This is the "auto-place stations" half of the data-link closure; connection
 * auto-routing lives in connection-router.ts.
 */

import type {
  EquipmentParamValue,
  SemanticRecipeDefinition,
  SemanticRecipePart,
  SemanticRecipePort,
} from '@pascal-app/core'
import type {
  Layout,
  LayoutStation,
  LoadedIndustryPack,
  Profile,
} from './industry-pack-loader'
import { LayoutRealism, type ZoneGroundMaterial } from './layout-realism'

// ─── Public Types ────────────────────────────────────────────────────────────

export type PlacedPart = SemanticRecipePart & {
  stationId: string
  profileId: string
  /** World-space position after station transform */
  worldPosition: [number, number, number]
}

export type PlacedStation = {
  stationId: string
  profileId: string
  recipeId: string
  position: [number, number, number]
  rotationY: number
  zone?: string
  parts: PlacedPart[]
  ports: SemanticRecipePort[]
  envelope?: { length: number; width: number; height: number }
}

export type ZoneGround = ZoneGroundMaterial & {
  /** Stations belonging to this zone */
  stationIds: string[]
  /** XZ bounding box covering all stations in the zone (with margin) */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

export type UnresolvedStation = {
  stationId: string
  profileId: string
  reason: 'profile-not-found' | 'recipe-not-found'
}

export type GeneratedScene = {
  packId: string
  layoutId: string
  stations: PlacedStation[]
  zoneGrounds: ZoneGround[]
  unresolvedStations: UnresolvedStation[]
  summary: {
    totalStations: number
    placedStations: number
    totalParts: number
    zones: number
  }
}

export type SceneGeneratorOptions = {
  /** Handwritten recipes to try before the registry lookup */
  builtinRecipes?: readonly SemanticRecipeDefinition[]
  /** Registry with findByProfile (e.g. semanticRecipeRegistry from core) */
  registry?: { findByProfile(profileId: string): SemanticRecipeDefinition | undefined }
  /** Pre-loaded LayoutRealism (otherwise a default instance with no pack rules) */
  layoutRealism?: LayoutRealism
  /** Margin (m) added around zone ground bounding boxes */
  zoneGroundMargin?: number
}

// ─── Transform helpers ───────────────────────────────────────────────────────

function rotateY(
  point: [number, number, number],
  radians: number,
): [number, number, number] {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const [x, y, z] = point
  return [x * cos + z * sin, y, -x * sin + z * cos]
}

function toWorld(
  local: [number, number, number],
  station: LayoutStation,
): [number, number, number] {
  const rotated = rotateY(local, station.rotationY ?? 0)
  return [
    rotated[0] + station.position[0],
    rotated[1] + station.position[1],
    rotated[2] + station.position[2],
  ]
}

function readLocalPosition(part: SemanticRecipePart): [number, number, number] {
  const record = part as Record<string, unknown>
  const position = record.position
  if (
    Array.isArray(position) &&
    position.length === 3 &&
    position.every((v) => typeof v === 'number')
  ) {
    return position as [number, number, number]
  }
  return [0, 0, 0]
}

// ─── Generator ───────────────────────────────────────────────────────────────

export class SceneGenerator {
  private readonly builtinRecipes: readonly SemanticRecipeDefinition[]
  private readonly registry?: SceneGeneratorOptions['registry']
  private readonly realism: LayoutRealism
  private readonly zoneMargin: number

  constructor(options: SceneGeneratorOptions = {}) {
    this.builtinRecipes = options.builtinRecipes ?? []
    this.registry = options.registry
    this.realism = options.layoutRealism ?? new LayoutRealism()
    this.zoneMargin = options.zoneGroundMargin ?? 4
  }

  get layoutRealism(): LayoutRealism {
    return this.realism
  }

  /**
   * Find a recipe for a station's profile:
   * handwritten recipes first (acceptsProfiles), then registry.findByProfile.
   */
  findRecipe(profileId: string): SemanticRecipeDefinition | undefined {
    for (const recipe of this.builtinRecipes) {
      if (recipe.acceptsProfiles?.includes(profileId)) return recipe
    }
    return this.registry?.findByProfile(profileId)
  }

  /**
   * Generate the full scene from a pack's first layout (or a specified one).
   */
  generateScene(pack: LoadedIndustryPack, layoutId?: string): GeneratedScene {
    const layout: Layout | undefined = layoutId
      ? pack.layouts.find((candidate) => candidate.id === layoutId)
      : pack.layouts[0]
    if (!layout) {
      return {
        packId: pack.manifest.id,
        layoutId: layoutId ?? '',
        stations: [],
        zoneGrounds: [],
        unresolvedStations: [],
        summary: { totalStations: 0, placedStations: 0, totalParts: 0, zones: 0 },
      }
    }

    const profileById = new Map<string, Profile>(pack.profiles.map((p) => [p.id, p]))
    const stations: PlacedStation[] = []
    const unresolved: UnresolvedStation[] = []

    for (const station of layout.stations) {
      const profile = profileById.get(station.profileId)
      if (!profile) {
        unresolved.push({
          stationId: station.id,
          profileId: station.profileId,
          reason: 'profile-not-found',
        })
        continue
      }
      const recipe = this.findRecipe(station.profileId)
      if (!recipe) {
        unresolved.push({
          stationId: station.id,
          profileId: station.profileId,
          reason: 'recipe-not-found',
        })
        continue
      }

      const composed = recipe.compose({
        params: (profile.params ?? {}) as Record<string, EquipmentParamValue>,
        envelope: { ...profile.defaultDimensions },
        profileId: profile.id,
        stationId: station.id,
      })

      const parts: PlacedPart[] = composed.parts.map((part) => ({
        ...part,
        stationId: station.id,
        profileId: profile.id,
        worldPosition: toWorld(readLocalPosition(part), station),
      }))

      stations.push({
        stationId: station.id,
        profileId: profile.id,
        recipeId: recipe.id,
        position: [...station.position] as [number, number, number],
        rotationY: station.rotationY ?? 0,
        zone: station.zone,
        parts,
        ports: composed.ports ?? [],
        envelope: composed.envelope
          ? {
              length: composed.envelope.length,
              width: composed.envelope.width,
              height: composed.envelope.height,
            }
          : undefined,
      })
    }

    const zoneGrounds = this.buildZoneGrounds(stations, layout.stations)

    return {
      packId: pack.manifest.id,
      layoutId: layout.id,
      stations,
      zoneGrounds,
      unresolvedStations: unresolved,
      summary: {
        totalStations: layout.stations.length,
        placedStations: stations.length,
        totalParts: stations.reduce((sum, s) => sum + s.parts.length, 0),
        zones: zoneGrounds.length,
      },
    }
  }

  /**
   * Group placed stations by zone and compute ground bounds + material per zone.
   */
  private buildZoneGrounds(
    placed: readonly PlacedStation[],
    allStations: readonly LayoutStation[],
  ): ZoneGround[] {
    const stationById = new Map(allStations.map((s) => [s.id, s]))
    const byZone = new Map<string, PlacedStation[]>()
    for (const station of placed) {
      const zone = station.zone ?? ''
      const list = byZone.get(zone) ?? []
      list.push(station)
      byZone.set(zone, list)
    }

    const grounds: ZoneGround[] = []
    for (const [zone, stations] of byZone) {
      if (!zone) continue
      let minX = Infinity
      let maxX = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      for (const station of stations) {
        const env = station.envelope ?? { length: 4, width: 4, height: 4 }
        const halfL = env.length / 2
        const halfW = env.width / 2
        minX = Math.min(minX, station.position[0] - halfL)
        maxX = Math.max(maxX, station.position[0] + halfL)
        minZ = Math.min(minZ, station.position[2] - halfW)
        maxZ = Math.max(maxZ, station.position[2] + halfW)
      }
      const material = this.realism.zoneGroundMaterial(
        stationById.get(stations[0].stationId)?.zone ?? zone,
      )
      grounds.push({
        zone,
        material: material.material,
        color: material.color,
        roughness: material.roughness,
        stationIds: stations.map((s) => s.stationId),
        bounds: {
          minX: minX - this.zoneMargin,
          maxX: maxX + this.zoneMargin,
          minZ: minZ - this.zoneMargin,
          maxZ: maxZ + this.zoneMargin,
        },
      })
    }
    return grounds
  }
}

/**
 * Convenience: generate a scene from a pack with the given recipes.
 */
export function generateSceneFromLayout(
  pack: LoadedIndustryPack,
  options: SceneGeneratorOptions = {},
): GeneratedScene {
  return new SceneGenerator(options).generateScene(pack)
}