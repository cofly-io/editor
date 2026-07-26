/**
 * Render-consumption tests: procedural textures + instance matrices.
 *
 * These modules are the pure-logic layer the renderer consumes:
 *  - generateTextureData turns TextureSpec into uploadable pixel data
 *  - buildInstanceMatrices turns InstanceBatch into InstancedMesh matrices
 */

import { describe, expect, it } from 'bun:test'
import {
  generateTextureData,
  generateTextureSet,
  textureSpecKey,
  valueNoise,
} from './procedural-textures'
import {
  buildInstanceMatrices,
  buildPlanInstanceMatrices,
  composeInstanceMatrix,
} from './instance-matrix-builder'
import type { TextureSpec } from './pbr-material-library'
import type { InstanceBatch } from './instancing-planner'

const makeSpec = (overrides: Partial<TextureSpec> = {}): TextureSpec => ({
  slot: 'roughness',
  noise: 'fine-grain',
  repeat: [4, 4],
  strength: 0.5,
  resolution: 64,
  ...overrides,
})

describe('procedural-textures: value noise', () => {
  it('is deterministic and bounded in [0,1]', () => {
    for (const [x, y] of [[0.13, 0.71], [0.5, 0.5], [0.99, 0.01]]) {
      const a = valueNoise(x, y, 8, 42)
      const b = valueNoise(x, y, 8, 42)
      expect(a).toBe(b)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(1)
    }
  })

  it('different seeds give different fields', () => {
    expect(valueNoise(0.3, 0.4, 8, 1)).not.toBe(valueNoise(0.3, 0.4, 8, 2))
  })
})

describe('procedural-textures: generateTextureData', () => {
  it('luminance maps produce width*height bytes', () => {
    const tex = generateTextureData(makeSpec())
    expect(tex.format).toBe('luminance')
    expect(tex.data.length).toBe(64 * 64)
    expect(tex.repeat).toEqual([4, 4])
    expect(tex.slot).toBe('roughness')
  })

  it('normal maps produce RGB bytes centered near (128,128,255)', () => {
    const tex = generateTextureData(makeSpec({ slot: 'normal', strength: 0.3 }))
    expect(tex.format).toBe('rgb')
    expect(tex.data.length).toBe(64 * 64 * 3)
    // Z channel should be high (mostly flat surface)
    let zSum = 0
    for (let i = 2; i < tex.data.length; i += 3) zSum += tex.data[i]
    expect(zSum / (tex.data.length / 3)).toBeGreaterThan(200)
  })

  it('is deterministic per spec', () => {
    const a = generateTextureData(makeSpec())
    const b = generateTextureData(makeSpec())
    expect(a.data).toEqual(b.data)
  })

  it('zero-strength spec gives flat mid-gray', () => {
    const tex = generateTextureData(makeSpec({ strength: 0 }))
    expect(tex.data.every((v) => v === 128)).toBe(true)
  })

  it('brushed-lines respects anisotropy angle', () => {
    const horizontal = generateTextureData(
      makeSpec({ noise: 'brushed-lines', anisotropyAngle: 0 }),
    )
    const vertical = generateTextureData(
      makeSpec({ noise: 'brushed-lines', anisotropyAngle: Math.PI / 2 }),
    )
    expect(horizontal.data).not.toEqual(vertical.data)
  })

  it('textureSpecKey distinguishes specs', () => {
    expect(textureSpecKey(makeSpec())).not.toBe(textureSpecKey(makeSpec({ strength: 0.7 })))
    expect(textureSpecKey(makeSpec())).toBe(textureSpecKey(makeSpec()))
  })

  it('generateTextureSet keys textures by slot', () => {
    const set = generateTextureSet([
      makeSpec({ slot: 'normal' }),
      makeSpec({ slot: 'roughness' }),
    ])
    expect(set.normal?.format).toBe('rgb')
    expect(set.roughness?.format).toBe('luminance')
    expect(set.baseColor).toBeUndefined()
  })
})

// ─── Instance matrices ───────────────────────────────────────────────────────

const makeBatch = (overrides: Partial<InstanceBatch> = {}): InstanceBatch => ({
  key: 'test-batch',
  instancingHint: 'test',
  kind: 'cylindrical_tank',
  semanticRole: 'tray_band',
  geometry: { radius: 2, height: 0.1, axis: 'y' },
  color: '#cbd5e1',
  count: 2,
  instances: [
    { position: [1, 2, 3] },
    { position: [4, 5, 6], rotationY: Math.PI / 2, scale: 2 },
  ],
  ...overrides,
})

describe('instance-matrix-builder', () => {
  it('builds 16 floats per instance, column-major', () => {
    const data = buildInstanceMatrices(makeBatch())
    expect(data.matrices.length).toBe(32)
    expect(data.count).toBe(2)
    expect(data.key).toBe('test-batch')
  })

  it('writes translation into the last column', () => {
    const data = buildInstanceMatrices(makeBatch())
    expect(data.matrices[12]).toBe(1)
    expect(data.matrices[13]).toBe(2)
    expect(data.matrices[14]).toBe(3)
    expect(data.matrices[15]).toBe(1)
  })

  it('identity axis produces an identity basis for Y-up parts', () => {
    const out = new Float32Array(16)
    composeInstanceMatrix(out, 0, [0, 0, 0], 0, 'y', 1)
    expect(Array.from(out.slice(0, 12))).toEqual([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
    ])
  })

  it('x-axis parts get local +Y mapped to world +X', () => {
    const out = new Float32Array(16)
    composeInstanceMatrix(out, 0, [0, 0, 0], 0, 'x', 1)
    // Column 1 (local Y basis) should be world +X = (1,0,0)
    expect(out[4]).toBe(1)
    expect(out[5]).toBe(0)
    expect(out[6]).toBe(0)
    // Column 0 (local X basis) maps to world -Y
    expect(out[0]).toBe(0)
    expect(out[1]).toBe(-1)
  })

  it('z-axis parts get local +Y mapped to world +Z', () => {
    const out = new Float32Array(16)
    composeInstanceMatrix(out, 0, [0, 0, 0], 0, 'z', 1)
    // Column 1 (local Y basis) should be world +Z = (0,0,1)
    expect(out[4]).toBe(0)
    expect(out[5]).toBe(0)
    expect(out[6]).toBe(1)
  })

  it('applies uniform scale to the basis but not translation', () => {
    const out = new Float32Array(16)
    composeInstanceMatrix(out, 0, [7, 8, 9], 0, 'y', 3)
    expect(out[0]).toBe(3)
    expect(out[5]).toBe(3)
    expect(out[10]).toBe(3)
    expect(out[12]).toBe(7)
    expect(out[13]).toBe(8)
    expect(out[14]).toBe(9)
  })

  it('rotationY rotates the basis in the XZ plane', () => {
    const out = new Float32Array(16)
    composeInstanceMatrix(out, 0, [0, 0, 0], Math.PI / 2, 'y', 1)
    // Ry(90°): local +X → world -Z (three.js convention x'=cos·x+sin·z, z'=-sin·x+cos·z)
    expect(out[0]).toBeCloseTo(0)
    expect(out[2]).toBeCloseTo(-1)
    expect(out[8]).toBeCloseTo(1)
    expect(out[10]).toBeCloseTo(0)
  })

  it('all instances produce finite values', () => {
    const data = buildInstanceMatrices(makeBatch())
    for (const v of data.matrices) expect(Number.isFinite(v)).toBe(true)
  })

  it('buildPlanInstanceMatrices maps every batch', () => {
    const batches = [makeBatch(), makeBatch({ key: 'b2', count: 1, instances: [{ position: [0, 0, 0] }] })]
    const plans = buildPlanInstanceMatrices(batches)
    expect(plans.length).toBe(2)
    expect(plans[0].matrices.length).toBe(32)
    expect(plans[1].matrices.length).toBe(16)
  })
})

// ─── Scene-level render payload integration ─────────────────────────────────

describe('render payload integration (refinery pack)', () => {
  it('buildRenderPayload produces matrices for every batch + textures for textured batches', async () => {
    const { generateIndustryScene } = await import('./industry-scene')
    const { registerSemanticRecipe, semanticRecipeRegistry } = await import(
      '@pascal-app/core/registry'
    )
    const { centrifugalPumpRecipe } = await import('./recipes/pump-recipe')
    const { distillationUnitRecipe } = await import('./recipes/distillation-recipe')
    const { storageTankRecipe } = await import('./recipes/tank-recipe')
    const utility = await import('./recipes/utility-equipment-recipes')
    const root = process.env.INDUSTRIAL_PACK_ROOT ?? 'D:/SourceCode/IndustrialPack'

    const scene = await generateIndustryScene('industry.refinery.basic', {
      loader: {
        industryPacksRoot: `${root}/industry-packs`,
        componentPacksRoot: `${root}/component-packs`,
      },
      builtinRecipes: [
        centrifugalPumpRecipe,
        storageTankRecipe,
        distillationUnitRecipe,
        utility.firedHeaterRecipe,
        utility.shellTubeExchangerRecipe,
        utility.utilityBoilerRecipe,
        utility.flareStackRecipe,
        utility.horizontalVesselRecipe,
        utility.controlRoomRecipe,
      ] as never,
      registry: {
        findByProfile: (id: string) => semanticRecipeRegistry.findByProfile(id),
        register: (r: never) => registerSemanticRecipe(r),
      },
      buildRenderPayload: true,
    })

    const payload = scene.renderPayload
    expect(payload).not.toBeNull()
    // One BatchInstanceData per instancing batch
    expect(payload!.batchInstances.length).toBe(scene.instancing.batches.length)
    for (const bi of payload!.batchInstances) {
      expect(bi.matrices.length).toBe(bi.count * 16)
      for (const v of bi.matrices) expect(Number.isFinite(v)).toBe(true)
    }
    // Textures only for batches whose material plan has texture specs;
    // pipe batches (brushed-metal) should have normal/roughness/metalness maps
    const pipeBatch = scene.instancing.batches.find((b) => b.instancingHint === 'pipe-bundles')
    if (pipeBatch) {
      const textures = payload!.batchTextures[pipeBatch.key]
      expect(textures).toBeDefined()
      expect(textures!.normal?.format).toBe('rgb')
      expect(textures!.roughness?.format).toBe('luminance')
      expect(textures!.normal!.data.length).toBe(
        textures!.normal!.width * textures!.normal!.height * 3,
      )
    }
    // Textured batch keys must be a subset of batch keys with hasTextures plans
    for (const key of Object.keys(payload!.batchTextures)) {
      expect(scene.materialPlan.byBatch[key]?.hasTextures).toBe(true)
    }
  })

  it('renderPayload is null unless requested', async () => {
    const { generateIndustryScene } = await import('./industry-scene')
    const root = process.env.INDUSTRIAL_PACK_ROOT ?? 'D:/SourceCode/IndustrialPack'
    const scene = await generateIndustryScene('industry.refinery.basic', {
      loader: {
        industryPacksRoot: `${root}/industry-packs`,
        componentPacksRoot: `${root}/component-packs`,
      },
    })
    expect(scene.renderPayload).toBeNull()
  })
})

