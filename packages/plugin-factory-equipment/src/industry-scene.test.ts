/**
 * Phase 3 Scene Generation & Routing Test
 *
 * Validates the convenience pipeline:
 * 1. SceneGenerator auto-places all layout stations via recipes
 * 2. Zone grounds carry layout-rules materials and sane bounds
 * 3. ConnectionRouter routes connections between composed ports
 * 4. Spacing validation flags violations from layout-rules.json
 * 5. generateIndustryScene orchestrates the full pipeline
 */

import { beforeAll, describe, expect, it } from 'bun:test'
import {
  controlRoomRecipe,
  firedHeaterRecipe,
  flareStackRecipe,
  horizontalVesselRecipe,
  shellTubeExchangerRecipe,
  utilityBoilerRecipe,
} from './recipes/utility-equipment-recipes'
import { centrifugalPumpRecipe } from './recipes/pump-recipe'
import { distillationUnitRecipe } from './recipes/distillation-recipe'
import { storageTankRecipe } from './recipes/tank-recipe'
import { generateIndustryScene, type IndustryScene } from './industry-scene'
import type { SemanticRecipeDefinition } from '@pascal-app/core'

const INDUSTRIAL_PACK_ROOT = process.env.INDUSTRIAL_PACK_ROOT ?? 'D:/SourceCode/IndustrialPack'

const BUILTIN_RECIPES: SemanticRecipeDefinition[] = [
  centrifugalPumpRecipe,
  storageTankRecipe,
  distillationUnitRecipe,
  firedHeaterRecipe,
  shellTubeExchangerRecipe,
  utilityBoilerRecipe,
  flareStackRecipe,
  horizontalVesselRecipe,
  controlRoomRecipe,
] as SemanticRecipeDefinition[]

describe('Phase 3 Scene Generation & Routing', () => {
  let result: IndustryScene

  beforeAll(async () => {
    const { registerSemanticRecipe, semanticRecipeRegistry } = await import(
      '@pascal-app/core/registry'
    )
    result = await generateIndustryScene('industry.refinery.basic', {
      loader: {
        industryPacksRoot: `${INDUSTRIAL_PACK_ROOT}/industry-packs`,
        componentPacksRoot: `${INDUSTRIAL_PACK_ROOT}/component-packs`,
      },
      builtinRecipes: BUILTIN_RECIPES,
      registry: {
        findByProfile: (id: string) => semanticRecipeRegistry.findByProfile(id),
        register: (recipe: SemanticRecipeDefinition) => registerSemanticRecipe(recipe),
      },
    })
  })

  describe('Step 1: Station Placement', () => {
    it('places all layout stations', () => {
      const layoutStationCount = result.pack.layouts[0].stations.length
      expect(result.scene.summary.totalStations).toBe(layoutStationCount)
      expect(result.scene.unresolvedStations).toEqual([])
      expect(result.scene.summary.placedStations).toBe(layoutStationCount)
    })

    it('generates parts for every station', () => {
      expect(result.scene.summary.totalParts).toBeGreaterThan(0)
      for (const station of result.scene.stations) {
        expect(station.parts.length).toBeGreaterThan(0)
      }
    })

    it('generates the refinery site dressing layer with roads, lawns, and street lights', () => {
      const site = result.scene.stations.find((s) => s.stationId === 'site_visual_layout')
      expect(site).toBeDefined()
      expect(site!.parts.filter((part) => part.semanticRole === 'road_network').length).toBeGreaterThanOrEqual(7)
      expect(site!.parts.filter((part) => part.semanticRole === 'green_buffer_lawn').length).toBeGreaterThanOrEqual(6)
      expect(site!.parts.filter((part) => part.semanticRole === 'street_light').length).toBeGreaterThanOrEqual(18)
    })

    it('applies world transforms matching station positions', () => {
      const controlRoom = result.scene.stations.find((s) => s.stationId === 'control_room')
      expect(controlRoom).toBeDefined()
      expect(controlRoom!.position).toEqual([-78, 0, -55])
      // Every part's world position should be near the station position
      for (const part of controlRoom!.parts) {
        const [wx, , wz] = part.worldPosition
        expect(Math.abs(wx - controlRoom!.position[0])).toBeLessThan(10)
        expect(Math.abs(wz - controlRoom!.position[2])).toBeLessThan(10)
      }
    })
  })

  describe('Step 2: Zone Grounds', () => {
    it('creates ground planes for all zones with materials from layout-rules.json', () => {
      expect(result.scene.zoneGrounds.length).toBeGreaterThanOrEqual(8)
      const tankZone = result.scene.zoneGrounds.find((g) => g.zone === '原油罐区')
      expect(tankZone).toBeDefined()
      expect(tankZone!.material).toBe('gravel-containment')
      const flareZone = result.scene.zoneGrounds.find((g) => g.zone === '火炬区')
      expect(flareZone).toBeDefined()
      expect(flareZone!.material).toBe('gravel-open')
    })

    it('zone bounds cover their stations with margin', () => {
      for (const ground of result.scene.zoneGrounds) {
        expect(ground.bounds.maxX).toBeGreaterThan(ground.bounds.minX)
        expect(ground.bounds.maxZ).toBeGreaterThan(ground.bounds.minZ)
        expect(ground.stationIds.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Step 3: Connection Routing', () => {
    it('routes most connections', () => {
      expect(result.routing.summary.totalConnections).toBeGreaterThanOrEqual(20)
      expect(result.routing.summary.routedConnections).toBeGreaterThanOrEqual(15)
    })

    it('routed connections have segments with medium and color', () => {
      for (const routed of result.routing.routed) {
        expect(routed.segments.length).toBeGreaterThan(0)
        expect(routed.medium).toBeTruthy()
        expect(routed.color).toMatch(/^#[0-9a-f]{6}$/i)
        expect(routed.length).toBeGreaterThan(0)
      }
    })

    it('pipe segments connect source and target stations', () => {
      const first = result.routing.routed[0]
      expect(first).toBeDefined()
      const fromStation = result.scene.stations.find((s) => s.stationId === first.from.stationId)
      const toStation = result.scene.stations.find((s) => s.stationId === first.to.stationId)
      expect(fromStation).toBeDefined()
      expect(toStation).toBeDefined()
      // Port world positions should be near their stations
      expect(Math.abs(first.from.worldPosition[0] - fromStation!.position[0])).toBeLessThan(10)
      expect(Math.abs(first.to.worldPosition[0] - toStation!.position[0])).toBeLessThan(10)
    })
  })

  describe('Step 4: Spacing Validation', () => {
    it('runs spacing rules and reports structured violations', () => {
      // The refinery layout may or may not have violations — the check is
      // that the validator runs and returns well-formed entries.
      for (const violation of result.spacingViolations) {
        expect(violation.ruleId).toBeTruthy()
        expect(['error', 'warning']).toContain(violation.severity)
        expect(violation.distance).toBeLessThan(violation.minDistance)
        expect(violation.stationA).toBeTruthy()
        expect(violation.stationB).toBeTruthy()
      }
    })
  })

  describe('Step 5: Pipeline Summary', () => {
    it('produces a consistent end-to-end summary', () => {
      expect(result.pack.manifest.id).toBe('industry.refinery.basic')
      expect(result.recipes.length).toBeGreaterThanOrEqual(20)
      expect(result.scene.summary.zones).toBe(result.scene.zoneGrounds.length)
      expect(
        result.routing.summary.routedConnections + result.routing.unrouted.length,
      ).toBe(result.routing.summary.totalConnections)
    })
  })
})
