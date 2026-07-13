import { describe, expect, test } from 'bun:test'
import { INDUSTRIAL_RENDER_KERNELS, INDUSTRIAL_RENDER_MATERIALS } from '@pascal-app/core/registry'
import { resolveIndustrialRenderContract } from './industrial-render-contract'
import { distillationUnitRecipe } from './recipes/distillation-recipe'
import { centrifugalPumpRecipe } from './recipes/pump-recipe'
import { refineryAuxiliaryUnitRecipe } from './recipes/refinery-auxiliary-recipe'
import { storageTankRecipe } from './recipes/tank-recipe'

describe('industrial render contract', () => {
  test('emits only canonical core industrial render vocabulary', () => {
    const kernelSet = new Set<string>(INDUSTRIAL_RENDER_KERNELS)
    const materialSet = new Set<string>(INDUSTRIAL_RENDER_MATERIALS)
    const samples = [
      ...storageTankRecipe.compose({}).parts,
      ...centrifugalPumpRecipe.compose({}).parts,
      ...distillationUnitRecipe.compose({}).parts,
      ...refineryAuxiliaryUnitRecipe.compose({ profileId: 'refinery.flare_system' }).parts,
    ]

    for (const part of samples) {
      const contract = resolveIndustrialRenderContract(part)
      expect(kernelSet.has(contract.kernel)).toBe(true)
      expect(materialSet.has(contract.material)).toBe(true)
    }
  })

  test('maps refinery and non-refinery tank semantics through the same generic kernels', () => {
    const refineryTank = storageTankRecipe.compose({
      envelope: { length: 2.4, width: 2.4, height: 3.2 },
      params: {
        storedMedium: 'liquid',
        materialState: 'liquid',
        level: 0.62,
        includeAccessStair: false,
      },
    })
    const cementSilo = storageTankRecipe.compose({
      profileId: 'cement.raw_meal_silo',
      envelope: { length: 2.8, width: 2.8, height: 5.2 },
      params: {
        storedMedium: 'powder',
        materialState: 'powder',
        level: 0.75,
        surfaceMode: 'sloped',
        accessStairType: 'vertical-ladder',
      },
    })

    expect(resolveIndustrialRenderContract(refineryTank.parts[0]!).kernel).toBe(
      'painted-cylindrical-shell',
    )
    expect(
      resolveIndustrialRenderContract(
        refineryTank.parts.find((part) => part.semanticRole === 'liquid_surface')!,
      ),
    ).toMatchObject({
      kernel: 'liquid-surface',
      material: 'translucent-liquid',
      runtimeEffects: ['tank-liquid-wave'],
    })
    expect(
      resolveIndustrialRenderContract(
        cementSilo.parts.find((part) => part.semanticRole === 'solid_surface')!,
      ),
    ).toMatchObject({ kernel: 'solid-surface', material: 'granular-solid' })
    expect(
      resolveIndustrialRenderContract(
        cementSilo.parts.find((part) => part.semanticRole === 'access_ladder')!,
      ),
    ).toMatchObject({
      kernel: 'access-stair-or-ladder',
      instancingHint: 'steps-rungs-rails',
    })
  })

  test('maps common process equipment roles without refinery profile coupling', () => {
    const pump = centrifugalPumpRecipe.compose({})
    const tower = distillationUnitRecipe.compose({
      envelope: { length: 6.8, width: 4.4, height: 11.8 },
      params: { columnKind: 'vacuum' },
    })
    const flare = refineryAuxiliaryUnitRecipe.compose({
      profileId: 'refinery.flare_system',
      envelope: { length: 5, width: 2, height: 8 },
    })

    expect(
      resolveIndustrialRenderContract(
        pump.parts.find((part) => part.semanticRole === 'volute_casing')!,
      ).kernel,
    ).toBe('volute-pump-casing')
    expect(
      resolveIndustrialRenderContract(
        tower.parts.find((part) => part.semanticRole === 'vacuum_column_shell')!,
      ).kernel,
    ).toBe('distillation-column-shell')
    expect(
      resolveIndustrialRenderContract(
        tower.parts.find((part) => part.semanticRole === 'heat_exchanger_shell')!,
      ).kernel,
    ).toBe('shell-and-tube-exchanger')
    expect(
      resolveIndustrialRenderContract(
        flare.parts.find((part) => part.semanticRole === 'flare_stack')!,
      ).kernel,
    ).toBe('lattice-or-stack-emission')
  })
})
