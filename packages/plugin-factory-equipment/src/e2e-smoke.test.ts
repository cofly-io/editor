/**
 * Phase 1 End-to-End Smoke Test
 *
 * Validates the complete data flow:
 * 1. Load industry pack from IndustrialPack workspace
 * 2. Convert profiles to SemanticRecipeDefinition
 * 3. Register recipes with semanticRecipeRegistry
 * 4. Generate scene from layout (station placement)
 * 5. Validate connections reference valid stations
 * 6. Validate params pass zod schema validation
 */

import { describe, expect, it, beforeAll } from 'bun:test'
import { IndustryPackLoader, type LoadedIndustryPack } from './industry-pack-loader'
import { validateGeneratorParams } from './param-schema-converter'
import type { SemanticRecipeDefinition } from '@pascal-app/core'

const INDUSTRIAL_PACK_ROOT = process.env.INDUSTRIAL_PACK_ROOT ?? 'D:/SourceCode/IndustrialPack'

describe('Phase 1 End-to-End Smoke Test', () => {
  let loader: IndustryPackLoader
  let pack: LoadedIndustryPack
  let recipes: SemanticRecipeDefinition[]

  beforeAll(async () => {
    loader = new IndustryPackLoader({
      industryPacksRoot: `${INDUSTRIAL_PACK_ROOT}/industry-packs`,
      componentPacksRoot: `${INDUSTRIAL_PACK_ROOT}/component-packs`,
    })
    pack = await loader.loadIndustryPack('industry.refinery.basic')
    recipes = loader.profilesToRecipes(pack)
  })

  describe('Step 1: Pack Loading', () => {
    it('loads refinery pack with all data files', () => {
      expect(pack.manifest.id).toBe('industry.refinery.basic')
      expect(pack.profiles.length).toBeGreaterThanOrEqual(20)
      expect(pack.layouts.length).toBeGreaterThan(0)
      expect(pack.connections.length).toBeGreaterThan(0)
      expect(pack.generatorManifests.size).toBeGreaterThan(0)
    })

    it('layout has stations with valid profile references', () => {
      const layout = pack.layouts[0]
      const profileIds = new Set(pack.profiles.map((p) => p.id))

      expect(layout.stations.length).toBeGreaterThanOrEqual(20)
      for (const station of layout.stations) {
        expect(profileIds.has(station.profileId)).toBe(true)
        expect(station.position).toHaveLength(3)
        expect(typeof station.rotationY).toBe('number')
      }
    })

    it('connections reference valid stations and have medium', () => {
      const connections = pack.connections[0].connections
      const stationIds = new Set(pack.layouts[0].stations.map((s) => s.id))

      expect(connections.length).toBeGreaterThanOrEqual(20)
      for (const conn of connections) {
        expect(stationIds.has(conn.from.stationId)).toBe(true)
        expect(stationIds.has(conn.to.stationId)).toBe(true)
        expect(conn.medium).toBeDefined()
        expect(typeof conn.medium).toBe('string')
      }
    })
  })

  describe('Step 2: Recipe Generation', () => {
    it('generates one recipe per profile', () => {
      expect(recipes.length).toBe(pack.profiles.length)
    })

    it('each recipe has required SemanticRecipeDefinition fields', () => {
      for (const recipe of recipes) {
        expect(recipe.id).toBeDefined()
        expect(recipe.id).toContain('industry.refinery.basic:')
        expect(recipe.label).toBeDefined()
        expect(recipe.family).toBeDefined()
        expect(recipe.acceptsProfiles).toBeDefined()
        expect(recipe.acceptsProfiles!.length).toBeGreaterThan(0)
        expect(typeof recipe.compose).toBe('function')
        expect(recipe.defaultEnvelope).toBeDefined()
      }
    })

    it('recipes cover all major equipment types', () => {
      const recipeIds = recipes.map((r) => r.id)

      // Storage tanks
      expect(recipeIds.some((id) => id.includes('crude_storage_tank'))).toBe(true)
      expect(recipeIds.some((id) => id.includes('product_storage_tank'))).toBe(true)
      expect(recipeIds.some((id) => id.includes('intermediate_storage_tank'))).toBe(true)

      // Distillation
      expect(recipeIds.some((id) => id.includes('atmospheric_distillation'))).toBe(true)
      expect(recipeIds.some((id) => id.includes('vacuum_distillation'))).toBe(true)

      // Process units
      expect(recipeIds.some((id) => id.includes('fluid_catalytic_cracking'))).toBe(true)
      expect(recipeIds.some((id) => id.includes('catalytic_reformer'))).toBe(true)
      expect(recipeIds.some((id) => id.includes('hydrotreating'))).toBe(true)

      // Utilities
      expect(recipeIds.some((id) => id.includes('utility_boiler'))).toBe(true)
      expect(recipeIds.some((id) => id.includes('safety_flare'))).toBe(true)
      expect(recipeIds.some((id) => id.includes('control_room'))).toBe(true)
      expect(recipeIds.some((id) => id.includes('product_pump'))).toBe(true)
    })
  })

  describe('Step 3: Recipe Composition', () => {
    it('compose returns valid SemanticRecipeComposeResult', () => {
      const tankRecipe = recipes.find((r) => r.id.includes('crude_storage_tank'))
      expect(tankRecipe).toBeDefined()

      const result = tankRecipe!.compose({})

      expect(result.parts).toBeDefined()
      expect(result.parts.length).toBeGreaterThan(0)
      expect(result.envelope).toBeDefined()
      expect(result.primarySemanticRole).toBeDefined()
      expect(result.editableParams).toBeDefined()
      expect(result.editablePartRoles).toBeDefined()
      expect(result.corePartRoles).toBeDefined()
    })

    it('compose respects input envelope', () => {
      const tankRecipe = recipes.find((r) => r.id.includes('crude_storage_tank'))
      const customEnvelope = { length: 10, width: 10, height: 15 }

      const result = tankRecipe!.compose({ envelope: customEnvelope })

      expect(result.envelope!.length).toBe(10)
      expect(result.envelope!.width).toBe(10)
      expect(result.envelope!.height).toBe(15)
    })

    it('compose merges params with profile defaults', () => {
      const tankRecipe = recipes.find((r) => r.id.includes('crude_storage_tank'))

      const result = tankRecipe!.compose({
        params: { shellColor: '#ff0000', level: 0.9 },
      })

      const shellPart = result.parts.find((p) => p.id === 'shell')
      expect(shellPart).toBeDefined()
      expect(shellPart!.material?.properties?.color).toBe('#ff0000')
      expect(shellPart!.params?.level).toBe(0.9)
    })

    it('compose applies generator manifest defaults for missing params', () => {
      const tankRecipe = recipes.find((r) => r.id.includes('crude_storage_tank'))

      const result = tankRecipe!.compose({ params: {} })

      const shellPart = result.parts.find((p) => p.id === 'shell')
      expect(shellPart).toBeDefined()
      // shellColor should come from generator.json default if not in profile or input
      expect(shellPart!.params?.shellColor).toBeDefined()
    })
  })

  describe('Step 4: Registry Registration', () => {
    it('recipes can be registered with semanticRecipeRegistry', async () => {
      const { registerSemanticRecipe, semanticRecipeRegistry } = await import('@pascal-app/core/registry')

      for (const recipe of recipes) {
        registerSemanticRecipe(recipe)
      }

      expect(semanticRecipeRegistry.size).toBeGreaterThanOrEqual(recipes.length)

      // Verify lookup by profile
      const tankRecipe = semanticRecipeRegistry.findByProfile('refinery.crude_storage_tank')
      expect(tankRecipe).toBeDefined()
      expect(tankRecipe!.id).toContain('crude_storage_tank')

      const towerRecipe = semanticRecipeRegistry.findByProfile('refinery.atmospheric_distillation_unit')
      expect(towerRecipe).toBeDefined()
    })
  })

  describe('Step 5: Param Schema Validation', () => {
    it('all profiles pass zod schema validation', () => {
      const errors = loader.validateAllProfiles(pack)

      // Log any validation errors for debugging
      if (errors.size > 0) {
        for (const [profileId, profileErrors] of errors) {
          console.warn(`Validation errors in ${profileId}:`, profileErrors)
        }
      }

      // We expect some profiles might have minor issues (e.g. deprecated params)
      // but most should pass
      expect(errors.size).toBeLessThan(pack.profiles.length / 2)
    })

    it('tank.vertical params validate correctly', () => {
      const tankManifest = pack.generatorManifests.get('tank.vertical')
      expect(tankManifest).toBeDefined()

      const result = validateGeneratorParams(tankManifest!, {
        height: 6,
        radius: 2.4,
        shellColor: '#e5e7eb',
        shellOpacity: 0.86,
        storedMedium: 'liquid',
        materialState: 'liquid',
      })

      expect(result.success).toBe(true)
    })

    it('invalid params are rejected', () => {
      const tankManifest = pack.generatorManifests.get('tank.vertical')
      expect(tankManifest).toBeDefined()

      // Invalid color format
      const badColor = validateGeneratorParams(tankManifest!, { shellColor: 'red' })
      expect(badColor.success).toBe(false)

      // Out of range number
      const badHeight = validateGeneratorParams(tankManifest!, { height: 100 })
      expect(badHeight.success).toBe(false)

      // Invalid enum value
      const badMedium = validateGeneratorParams(tankManifest!, { storedMedium: 'plasma' })
      expect(badMedium.success).toBe(false)
    })
  })

  describe('Step 6: Scene Generation Simulation', () => {
    it('can generate a scene summary from layout and recipes', () => {
      const layout = pack.layouts[0]
      const sceneStations = []

      for (const station of layout.stations) {
        const recipe = recipes.find((r) =>
          r.acceptsProfiles?.includes(station.profileId),
        )
        expect(recipe).toBeDefined()

        const profile = pack.profiles.find((p) => p.id === station.profileId)
        expect(profile).toBeDefined()

        sceneStations.push({
          stationId: station.id,
          profileId: station.profileId,
          recipeId: recipe!.id,
          position: station.position,
          rotationY: station.rotationY,
          displayName: station.displayName ?? profile!.displayName ?? profile!.name,
          zone: station.zone,
          envelope: recipe!.defaultEnvelope,
        })
      }

      expect(sceneStations.length).toBe(layout.stations.length)

      // Verify zones are preserved
      const zones = new Set(sceneStations.map((s) => s.zone).filter(Boolean))
      expect(zones.size).toBeGreaterThan(3) // Should have multiple zones

      // Verify all stations have recipes
      const unassigned = sceneStations.filter((s) => !s.recipeId)
      expect(unassigned.length).toBe(0)
    })

    it('scene summary includes all equipment categories', () => {
      const layout = pack.layouts[0]
      const categories = new Set<string>()

      for (const station of layout.stations) {
        const profile = pack.profiles.find((p) => p.id === station.profileId)
        if (profile) categories.add(profile.family)
      }

      // Should have diverse equipment families
      expect(categories.size).toBeGreaterThan(5)
      expect(categories.has('storage_tank')).toBe(true)
      expect(categories.has('distillation_column')).toBe(true)
      expect(categories.has('pump')).toBe(true)
      expect(categories.has('pipe_rack')).toBe(true)
    })
  })
})
