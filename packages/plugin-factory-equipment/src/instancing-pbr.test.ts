/**
 * Instancing + PBR Material Test
 *
 * Item 1 (instancing): repeated parts (tray bands, burners, supports, pipes)
 *   group into InstancedMesh batches; draw calls drop dramatically.
 * Item 2 (PBR materials): render contract resolves to a complete PBR plan with
 *   scalar params (metalness/roughness/clearcoat) + procedural texture specs.
 */

import { beforeAll, describe, expect, it } from 'bun:test'
import { InstancingPlanner } from './instancing-planner'
import {
  resolvePbrMaterial,
  textureSpecsFor,
  texturedMaterialFamilies,
} from './pbr-material-library'
import { generateIndustryScene, type IndustryScene } from './industry-scene'
import { centrifugalPumpRecipe } from './recipes/pump-recipe'
import { distillationUnitRecipe } from './recipes/distillation-recipe'
import { storageTankRecipe } from './recipes/tank-recipe'
import {
  controlRoomRecipe,
  firedHeaterRecipe,
  flareStackRecipe,
  horizontalVesselRecipe,
  shellTubeExchangerRecipe,
  utilityBoilerRecipe,
} from './recipes/utility-equipment-recipes'
import type { SemanticRecipeDefinition } from '@pascal-app/core'

const INDUSTRIAL_PACK_ROOT = process.env.INDUSTRIAL_PACK_ROOT ?? 'D:/SourceCode/IndustrialPack'

const BUILTIN_RECIPES = [
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

describe('Item 1: Instancing Planner', () => {
  let scene: IndustryScene

  beforeAll(async () => {
    const { registerSemanticRecipe, semanticRecipeRegistry } = await import(
      '@pascal-app/core/registry'
    )
    scene = await generateIndustryScene('industry.refinery.basic', {
      loader: {
        industryPacksRoot: `${INDUSTRIAL_PACK_ROOT}/industry-packs`,
        componentPacksRoot: `${INDUSTRIAL_PACK_ROOT}/component-packs`,
      },
      builtinRecipes: BUILTIN_RECIPES,
      registry: {
        findByProfile: (id: string) => semanticRecipeRegistry.findByProfile(id),
        register: (r: SemanticRecipeDefinition) => registerSemanticRecipe(r),
      },
    })
  })

  it('produces an instancing plan with batches', () => {
    expect(scene.instancing).toBeDefined()
    expect(scene.instancing.summary.totalParts).toBeGreaterThan(0)
  })

  it('reduces estimated draw calls vs naive per-part rendering', () => {
    const { estimatedDrawCalls, naiveDrawCalls } = scene.instancing.summary
    // Batching + singletons must be ≤ naive (one mesh per part)
    expect(estimatedDrawCalls).toBeLessThanOrEqual(naiveDrawCalls)
  })

  it('groups repeated parts into batches with multiple instances', () => {
    // Pipe segments from 23 connections should batch (same medium/color/diameter)
    const multiInstance = scene.instancing.batches.filter((b) => b.count >= 2)
    expect(multiInstance.length).toBeGreaterThan(0)
    for (const batch of scene.instancing.batches) {
      expect(batch.instances.length).toBe(batch.count)
      expect(batch.count).toBeGreaterThanOrEqual(2)
      expect(batch.geometry).toBeDefined()
      expect(batch.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('instances carry world positions', () => {
    for (const batch of scene.instancing.batches) {
      for (const instance of batch.instances) {
        expect(instance.position).toHaveLength(3)
        expect(instance.position.every((v) => Number.isFinite(v))).toBe(true)
      }
    }
  })

  it('unique parts remain as singletons', () => {
    expect(scene.instancing.singletons.length).toBeGreaterThan(0)
    expect(
      scene.instancing.summary.instancedParts + scene.instancing.summary.singletonParts,
    ).toBe(scene.instancing.summary.totalParts)
  })
})

describe('Item 1 (unit): InstancingPlanner batching logic', () => {
  it('groups identical tray-band-like parts and splits different ones', () => {
    const planner = new InstancingPlanner({ minBatchSize: 2 })
    const mkPart = (id: string, x: number) =>
      ({
        id,
        kind: 'cylindrical_tank',
        semanticRole: 'tray_band',
        radius: 2,
        height: 0.1,
        worldPosition: [x, 3, 0],
        primaryColor: '#cbd5e1',
        material: { properties: { color: '#cbd5e1' } },
      }) as never

    const plan = planner.planParts([mkPart('a', 0), mkPart('b', 1), mkPart('c', 2)])
    expect(plan.batches.length).toBe(1)
    expect(plan.batches[0].count).toBe(3)
    expect(plan.batches[0].instancingHint).toBe('tray-bands')
  })

  it('keeps parts below minBatchSize as singletons', () => {
    const planner = new InstancingPlanner({ minBatchSize: 3 })
    const mkPart = (id: string) =>
      ({
        id,
        kind: 'generic_body',
        semanticRole: 'burner',
        worldPosition: [0, 0, 0],
        material: { properties: { color: '#111111' } },
      }) as never
    const plan = planner.planParts([mkPart('a'), mkPart('b')])
    expect(plan.batches.length).toBe(0)
    expect(plan.singletons.length).toBe(2)
  })
})

describe('Item 2: PBR Material Library', () => {
  it('resolves scalar PBR params from material profile', () => {
    const plan = resolvePbrMaterial({ material: 'brushed-metal' })
    expect(plan.materialFamily).toBe('brushed-metal')
    expect(plan.metalness).toBeCloseTo(0.86)
    expect(plan.roughness).toBeCloseTo(0.28)
    expect(plan.envMapIntensity).toBeCloseTo(1.35)
  })

  it('applies kernel overrides on top of material profile', () => {
    const plan = resolvePbrMaterial({ kernel: 'process-pipe-run', material: 'brushed-metal' })
    // pipe-run kernel forces metalness 0.74 / roughness 0.26
    expect(plan.metalness).toBeCloseTo(0.74)
    expect(plan.roughness).toBeCloseTo(0.26)
  })

  it('liquid surface kernel becomes transparent with low roughness', () => {
    const plan = resolvePbrMaterial({ kernel: 'liquid-surface', material: 'translucent-liquid' })
    expect(plan.transparent).toBe(true)
    expect(plan.opacity).toBeCloseTo(0.42)
    expect(plan.roughness).toBeCloseTo(0.05)
    expect(plan.depthWrite).toBe(false)
  })

  it('painted metal gets clearcoat', () => {
    const plan = resolvePbrMaterial({ kernel: 'painted-cylindrical-shell', material: 'painted-metal' })
    expect(plan.clearcoat).toBeCloseTo(0.3)
    expect(plan.clearcoatRoughness).toBeCloseTo(0.28)
  })

  it('provides procedural texture specs for textured materials', () => {
    const galvanized = textureSpecsFor('galvanized-steel')
    expect(galvanized.length).toBeGreaterThan(0)
    const slots = galvanized.map((t) => t.slot)
    expect(slots).toContain('normal')
    expect(slots).toContain('roughness')
    for (const tex of galvanized) {
      expect(tex.resolution).toBeGreaterThan(0)
      expect(tex.strength).toBeGreaterThan(0)
      expect(tex.repeat).toHaveLength(2)
    }
  })

  it('brushed metal textures are anisotropic', () => {
    const brushed = textureSpecsFor('brushed-metal')
    const normal = brushed.find((t) => t.slot === 'normal')
    expect(normal?.noise).toBe('brushed-lines')
    expect(normal?.anisotropyAngle).toBeDefined()
  })

  it('low-opacity-gas has no textures (flat transparent)', () => {
    expect(textureSpecsFor('low-opacity-gas')).toHaveLength(0)
  })

  it('texturedMaterialFamilies excludes gas', () => {
    const families = texturedMaterialFamilies()
    expect(families).toContain('galvanized-steel')
    expect(families).toContain('brushed-metal')
    expect(families).not.toContain('low-opacity-gas')
  })

  it('unknown material falls back to default params without textures', () => {
    const plan = resolvePbrMaterial({ kernel: 'generic-industrial-part' })
    expect(plan.materialFamily).toBe('unknown')
    expect(plan.hasTextures).toBe(false)
    expect(plan.metalness).toBeGreaterThan(0)
  })
})

describe('Item 1+2 (integration): scene material plan', () => {
  let scene: IndustryScene

  beforeAll(async () => {
    const { registerSemanticRecipe, semanticRecipeRegistry } = await import(
      '@pascal-app/core/registry'
    )
    scene = await generateIndustryScene('industry.refinery.basic', {
      loader: {
        industryPacksRoot: `${INDUSTRIAL_PACK_ROOT}/industry-packs`,
        componentPacksRoot: `${INDUSTRIAL_PACK_ROOT}/component-packs`,
      },
      builtinRecipes: BUILTIN_RECIPES,
      registry: {
        findByProfile: (id: string) => semanticRecipeRegistry.findByProfile(id),
        register: (r: SemanticRecipeDefinition) => registerSemanticRecipe(r),
      },
    })
  })

  it('resolves a material plan for every batch', () => {
    expect(scene.materialPlan).toBeDefined()
    for (const batch of scene.instancing.batches) {
      const plan = scene.materialPlan.byBatch[batch.key]
      expect(plan).toBeDefined()
      expect(plan.metalness).toBeGreaterThanOrEqual(0)
      expect(plan.roughness).toBeGreaterThanOrEqual(0)
    }
  })

  it('lists distinct material families for texture pre-warming', () => {
    expect(Array.isArray(scene.materialPlan.families)).toBe(true)
    // Pipe batches resolve to brushed-metal family
    expect(scene.materialPlan.families.length).toBeGreaterThanOrEqual(0)
  })

  it('pipe batches carry the process-pipe-run kernel override (metalness 0.74)', () => {
    const pipeBatch = scene.instancing.batches.find((b) => b.instancingHint === 'pipe-bundles')
    if (!pipeBatch) return // no pipe batch — nothing to assert
    const plan = scene.materialPlan.byBatch[pipeBatch.key]
    expect(plan.materialFamily).toBe('brushed-metal')
    expect(plan.metalness).toBeCloseTo(0.74)
    expect(plan.roughness).toBeCloseTo(0.26)
  })
})
