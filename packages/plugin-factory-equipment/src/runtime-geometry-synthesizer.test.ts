/**
 * Runtime Geometry Synthesizer Test
 *
 * Validates that profile-derived recipes now produce real geometry:
 * 1. Synthesized parts carry real dimensions (radius/height/length) and
 *    part-registry kinds, not metadata placeholders.
 * 2. composeFromProfile (default 'geometry' mode) emits geometry-ready parts.
 * 3. 'metadata' mode still produces the legacy placeholder representation.
 * 4. Synthesized parts are consumable by core's composePartPrimitives
 *    (the final step before rendering).
 */

import { beforeAll, describe, expect, it } from 'bun:test'
import { IndustryPackLoader, type LoadedIndustryPack, type Profile } from './industry-pack-loader'
import {
  hasGeometryDimensions,
  synthesizeGeometryParts,
} from './runtime-geometry-synthesizer'
import type { SemanticRecipeDefinition } from '@pascal-app/core'

const INDUSTRIAL_PACK_ROOT = process.env.INDUSTRIAL_PACK_ROOT ?? 'D:/SourceCode/IndustrialPack'

describe('Runtime Geometry Synthesizer', () => {
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

  describe('synthesizeGeometryParts', () => {
    it('produces geometry-ready parts for a storage tank profile', () => {
      const profile = pack.profiles.find((p) => p.id === 'refinery.crude_storage_tank')!
      const parts = synthesizeGeometryParts(profile, profile.params, profile.defaultDimensions)

      expect(parts.length).toBeGreaterThan(0)
      // Primary shell has real radius + height and a known part-registry kind
      const shell = parts.find((p) => p.id === 'shell')!
      expect(shell).toBeDefined()
      expect(hasGeometryDimensions(shell)).toBe(true)
      expect(shell.radius).toBeGreaterThan(0)
      expect(shell.height).toBeGreaterThan(0)
      expect(shell.primaryColor).toMatch(/^#[0-9a-f]{6}$/i)
    })

    it('maps flare roles to a tapered chimney_stack kind', () => {
      const profile = pack.profiles.find((p) => p.id === 'refinery.safety_flare')!
      const parts = synthesizeGeometryParts(profile, profile.params, profile.defaultDimensions)
      const flare = parts.find((p) => p.semanticRole === 'flare_stack')!
      expect(flare).toBeDefined()
      expect(flare.kind).toBe('chimney_stack')
      // Tapered: top radius smaller than bottom
      expect(flare.radiusTop).toBeDefined()
      expect(flare.radiusBottom).toBeDefined()
      expect(flare.radiusTop!).toBeLessThan(flare.radiusBottom!)
    })

    it('maps exchanger shell to a horizontal heat_exchanger kind', () => {
      const profile = pack.profiles.find((p) => p.id === 'refinery.feed_preheat_exchanger')!
      const parts = synthesizeGeometryParts(profile, profile.params, profile.defaultDimensions)
      const shell = parts.find((p) => p.semanticRole === 'exchanger_shell')!
      expect(shell).toBeDefined()
      expect(shell.kind).toBe('heat_exchanger')
      expect(shell.axis).toBe('x')
    })

    it('gives every part a valid position and color', () => {
      for (const profile of pack.profiles.slice(0, 6)) {
        const parts = synthesizeGeometryParts(profile, profile.params, profile.defaultDimensions)
        for (const part of parts) {
          expect(part.position).toHaveLength(3)
          expect(part.position.every((v) => Number.isFinite(v))).toBe(true)
          expect(part.primaryColor).toMatch(/^#[0-9a-f]{6}$/i)
        }
      }
    })
  })

  describe('composeFromProfile geometry mode (default)', () => {
    it('profile recipes emit geometry-ready parts by default', () => {
      const tankRecipe = recipes.find((r) => r.acceptsProfiles?.includes('refinery.crude_storage_tank'))!
      expect(tankRecipe).toBeDefined()
      const composed = tankRecipe.compose({
        params: {},
        envelope: { length: 5, width: 5, height: 6 },
        profileId: 'refinery.crude_storage_tank',
      })
      expect(composed.parts.length).toBeGreaterThan(0)
      const shell = composed.parts.find((p) => p.id === 'shell')!
      expect(hasGeometryDimensions(shell)).toBe(true)
      // Not the legacy placeholder kind
      expect(shell.kind).not.toBe('parametric_equipment')
    })

    it('all 20 profiles compose to geometry parts with finite dims', () => {
      for (const recipe of recipes) {
        const profileId = recipe.acceptsProfiles?.find((p) => p.includes('.'))
        if (!profileId) continue
        const composed = recipe.compose({ params: {}, profileId })
        expect(composed.parts.length).toBeGreaterThan(0)
        for (const part of composed.parts) {
          const record = part as Record<string, unknown>
          if (typeof record.radius === 'number') expect(record.radius).toBeGreaterThan(0)
          if (typeof record.height === 'number') expect(record.height).toBeGreaterThan(0)
          expect(Number.isFinite(record.position?.[0] ?? 0)).toBe(true)
        }
      }
    })
  })

  describe('metadata mode (legacy fallback)', () => {
    it('partMode metadata produces placeholder parametric_equipment shell', async () => {
      const metaLoader = new IndustryPackLoader({
        industryPacksRoot: `${INDUSTRIAL_PACK_ROOT}/industry-packs`,
        componentPacksRoot: `${INDUSTRIAL_PACK_ROOT}/component-packs`,
        partMode: 'metadata',
      })
      const metaPack = await metaLoader.loadIndustryPack('industry.refinery.basic')
      const metaRecipes = metaLoader.profilesToRecipes(metaPack)
      const tankRecipe = metaRecipes.find((r) =>
        r.acceptsProfiles?.includes('refinery.crude_storage_tank'),
      )!
      const composed = tankRecipe.compose({ params: {}, profileId: 'refinery.crude_storage_tank' })
      const shell = composed.parts.find((p) => p.id === 'shell')!
      expect(shell.kind).toBe('parametric_equipment')
    })
  })

  describe('core part composer compatibility', () => {
    it('synthesized parts are consumable by core composePartPrimitives', async () => {
      const { composePartPrimitives } = await import('@pascal-app/core')
      const profile: Profile = pack.profiles.find((p) => p.id === 'refinery.safety_flare')!
      const parts = synthesizeGeometryParts(profile, profile.params, profile.defaultDimensions)

      // Feed all synthesized parts to the core dispatcher in one compose call
      const shapes = composePartPrimitives({
        parts: parts.map((part) => ({
          kind: part.kind,
          semanticRole: part.semanticRole,
          dimensions: {
            length: part.length,
            width: part.width,
            height: part.height,
            radius: part.radius,
          },
          transform: { position: part.position },
          material: part.material as never,
        })),
      } as never)
      expect(Array.isArray(shapes)).toBe(true)
      expect(shapes.length).toBeGreaterThan(0)
    })
  })
})
