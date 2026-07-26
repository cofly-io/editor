/**
 * Industry Pack Loader Tests
 *
 * Validates that the IndustryPackLoader can correctly load
 * industry.refinery.basic and generate SemanticRecipeDefinition
 * objects with the expected structure.
 */

import { describe, expect, it } from 'bun:test'
import { IndustryPackLoader, type LoadedIndustryPack } from './industry-pack-loader'
import type { SemanticRecipeDefinition } from '@pascal-app/core'

// Path to IndustrialPack workspace (adjust as needed for CI)
const INDUSTRIAL_PACK_ROOT = process.env.INDUSTRIAL_PACK_ROOT ?? 'D:/SourceCode/IndustrialPack'

describe('IndustryPackLoader', () => {
  const loader = new IndustryPackLoader({
    industryPacksRoot: `${INDUSTRIAL_PACK_ROOT}/industry-packs`,
    componentPacksRoot: `${INDUSTRIAL_PACK_ROOT}/component-packs`,
  })

  describe('loadIndustryPack', () => {
    it('loads industry.refinery.basic manifest', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')

      expect(pack.manifest.id).toBe('industry.refinery.basic')
      expect(pack.manifest.industry).toBe('refinery')
      expect(pack.manifest.version).toBe('0.1.0')
    })

    it('loads all profiles from refinery pack', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')

      expect(pack.profiles.length).toBeGreaterThanOrEqual(20)

      // Check specific profiles exist
      const profileIds = pack.profiles.map((p) => p.id)
      expect(profileIds).toContain('refinery.crude_storage_tank')
      expect(profileIds).toContain('refinery.atmospheric_distillation_unit')
      expect(profileIds).toContain('refinery.vacuum_distillation_unit')
      expect(profileIds).toContain('refinery.product_pump')
      expect(profileIds).toContain('refinery.control_room')
      expect(profileIds).toContain('refinery.safety_flare')
    })

    it('loads layout with stations', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')

      expect(pack.layouts.length).toBeGreaterThan(0)
      const layout = pack.layouts[0]
      expect(layout.stations.length).toBeGreaterThanOrEqual(20)

      // Check station references valid profiles
      const profileIds = new Set(pack.profiles.map((p) => p.id))
      for (const station of layout.stations) {
        expect(profileIds.has(station.profileId)).toBe(true)
      }
    })

    it('loads connections with medium info', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')

      expect(pack.connections.length).toBeGreaterThan(0)
      const connections = pack.connections[0].connections
      expect(connections.length).toBeGreaterThanOrEqual(20)

      // Check connections reference valid stations
      const stationIds = new Set(pack.layouts[0].stations.map((s) => s.id))
      for (const conn of connections) {
        expect(stationIds.has(conn.from.stationId)).toBe(true)
        expect(stationIds.has(conn.to.stationId)).toBe(true)
        expect(conn.medium).toBeDefined()
      }
    })

    it('loads generator manifests for profiles', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')

      // Should have loaded generator manifests for unique generators
      expect(pack.generatorManifests.size).toBeGreaterThan(0)

      // Check specific generator manifests exist
      const generatorIds = [...pack.generatorManifests.keys()]
      expect(generatorIds).toContain('tank.vertical')
      expect(generatorIds).toContain('tower.distillation')
    })
  })

  describe('profilesToRecipes', () => {
    it('converts profiles to SemanticRecipeDefinition objects', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')
      const recipes = loader.profilesToRecipes(pack)

      expect(recipes.length).toBe(pack.profiles.length)

      for (const recipe of recipes) {
        expect(recipe.id).toBeDefined()
        expect(recipe.label).toBeDefined()
        expect(recipe.family).toBeDefined()
        expect(typeof recipe.compose).toBe('function')
      }
    })

    it('recipe has correct acceptsProfiles', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')
      const recipes = loader.profilesToRecipes(pack)

      const tankRecipe = recipes.find((r) => r.id.includes('crude_storage_tank'))
      expect(tankRecipe).toBeDefined()
      expect(tankRecipe!.acceptsProfiles).toContain('refinery.crude_storage_tank')
      expect(tankRecipe!.acceptsProfiles).toContain('storage_tank')
    })

    it('recipe has defaultEnvelope from profile dimensions', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')
      const recipes = loader.profilesToRecipes(pack)

      const tankRecipe = recipes.find((r) => r.id.includes('crude_storage_tank'))
      expect(tankRecipe).toBeDefined()
      expect(tankRecipe!.defaultEnvelope).toBeDefined()
      expect(tankRecipe!.defaultEnvelope!.length).toBeGreaterThan(0)
      expect(tankRecipe!.defaultEnvelope!.width).toBeGreaterThan(0)
      expect(tankRecipe!.defaultEnvelope!.height).toBeGreaterThan(0)
    })

    it('recipe has editableParams from generator manifest', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')
      const recipes = loader.profilesToRecipes(pack)

      const tankRecipe = recipes.find((r) => r.id.includes('crude_storage_tank'))
      expect(tankRecipe).toBeDefined()
      expect(tankRecipe!.editableParams).toBeDefined()
      expect(tankRecipe!.editableParams!.length).toBeGreaterThan(0)

      // Check params have expected structure
      const paramKeys = tankRecipe!.editableParams!.map((p) => p.key)
      expect(paramKeys).toContain('shellColor')
      expect(paramKeys).toContain('shellOpacity')
    })

    it('recipe compose returns valid result', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')
      const recipes = loader.profilesToRecipes(pack)

      const tankRecipe = recipes.find((r) => r.id.includes('crude_storage_tank'))
      expect(tankRecipe).toBeDefined()

      const result = tankRecipe!.compose({
        params: { shellColor: '#ff0000' },
        envelope: { length: 5, width: 5, height: 6 },
      })

      expect(result.parts).toBeDefined()
      expect(result.parts.length).toBeGreaterThan(0)
      expect(result.envelope).toBeDefined()
      expect(result.envelope!.length).toBe(5)
      expect(result.envelope!.width).toBe(5)
      expect(result.envelope!.height).toBe(6)
      expect(result.primarySemanticRole).toBeDefined()
    })

    it('compose merges profile params with input params', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')
      const recipes = loader.profilesToRecipes(pack)

      const tankRecipe = recipes.find((r) => r.id.includes('crude_storage_tank'))
      expect(tankRecipe).toBeDefined()

      const result = tankRecipe!.compose({
        params: { shellColor: '#ff0000' },
      })

      // Profile default should be overridden by input
      const shellPart = result.parts.find((p) => p.id === 'shell')
      expect(shellPart).toBeDefined()
      expect(shellPart!.material?.properties?.color).toBe('#ff0000')
    })

    it('recipe has partGroups from qualityRequiredRoles', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')
      const recipes = loader.profilesToRecipes(pack)

      const towerRecipe = recipes.find((r) => r.id.includes('atmospheric_distillation'))
      expect(towerRecipe).toBeDefined()
      expect(towerRecipe!.partGroups).toBeDefined()
      expect(towerRecipe!.partGroups!.length).toBeGreaterThan(0)
    })

    it('recipe has corePartRoles with primarySemanticRole', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')
      const recipes = loader.profilesToRecipes(pack)

      const tankRecipe = recipes.find((r) => r.id.includes('crude_storage_tank'))
      expect(tankRecipe).toBeDefined()
      expect(tankRecipe!.corePartRoles).toBeDefined()
      expect(tankRecipe!.corePartRoles).toContain('tank_shell')
    })
  })

  describe('recipe registration compatibility', () => {
    it('recipes can be registered with semanticRecipeRegistry', async () => {
      const pack = await loader.loadIndustryPack('industry.refinery.basic')
      const recipes = loader.profilesToRecipes(pack)

      // Import registry functions
      const { registerSemanticRecipe, semanticRecipeRegistry } = await import('@pascal-app/core/registry')

      // Register all recipes
      for (const recipe of recipes) {
        registerSemanticRecipe(recipe)
      }

      // Verify registration
      expect(semanticRecipeRegistry.size).toBeGreaterThanOrEqual(recipes.length)

      // Verify specific recipes can be found by profile
      const tankRecipe = semanticRecipeRegistry.findByProfile('refinery.crude_storage_tank')
      expect(tankRecipe).toBeDefined()
    })
  })
})

describe('IndustryPackLoader with local generators', () => {
  it('loads generator manifests from local pack generators/ folder', async () => {
    const loader = new IndustryPackLoader({
      industryPacksRoot: `${INDUSTRIAL_PACK_ROOT}/industry-packs`,
      loadLocalGenerators: true,
    })

    const pack = await loader.loadIndustryPack('industry.refinery.basic')

    // Refinery has local generators (industry-local ownership)
    expect(pack.generatorManifests.size).toBeGreaterThan(0)

    const tankManifest = pack.generatorManifests.get('tank.vertical')
    expect(tankManifest).toBeDefined()
    expect(tankManifest!.id).toBe('tank.vertical')
    expect(tankManifest!.params).toBeDefined()
  })
})
