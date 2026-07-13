import { describe, expect, test } from 'bun:test'
import {
  validateSemanticRecipeComposeResult,
  validateSemanticRecipeDefinition,
} from '@pascal-app/core'
import { distillationUnitRecipe } from './distillation-recipe'
import { centrifugalPumpRecipe } from './pump-recipe'
import { refineryAuxiliaryUnitRecipe } from './refinery-auxiliary-recipe'
import { refineryReactorUnitRecipe } from './refinery-reactor-recipe'
import { storageTankRecipe } from './tank-recipe'

describe('factory equipment semantic recipes', () => {
  test('storage tank recipe exposes valid editable params', () => {
    const result = storageTankRecipe.compose({
      envelope: { length: 2.4, width: 2.4, height: 3.2 },
      params: { liquidLevel: 0.6, shellOpacity: 0.4 },
    })

    expect(validateSemanticRecipeDefinition(storageTankRecipe)).toEqual([])
    expect(validateSemanticRecipeComposeResult(storageTankRecipe, result)).toEqual([])
    expect(storageTankRecipe.editableParams?.map((param) => param.key)).toEqual([
      'liquidLevel',
      'shellOpacity',
      'liquidOpacity',
      'liquidColor',
    ])
    expect(result.parts.find((part) => part.semanticRole === 'vessel_shell')).toMatchObject({
      kind: 'storage_tank_shell',
      sourcePartKind: 'storage_tank_shell',
    })
    expect(result.parts.find((part) => part.semanticRole === 'access_ladder')).toMatchObject({
      kind: 'helical_ladder',
      sourcePartKind: 'helical_ladder',
    })
    expect(storageTankRecipe.editablePartRoles).toEqual(
      expect.arrayContaining(['vessel_roof', 'tank_bottom', 'top_rim', 'foundation_ring']),
    )
  })

  test('storage tank recipe consumes IndustrialPack material and access params', () => {
    const liquid = storageTankRecipe.compose({
      envelope: { length: 2.4, width: 2.4, height: 3.2 },
      params: {
        storedMedium: 'liquid',
        materialState: 'liquid',
        level: 0.62,
        surfaceMode: 'wave',
        surfaceMotion: 'subtle',
        contentColor: '#38bdf8',
        contentOpacity: 0.32,
        includeAccessStair: false,
        accessStairType: 'none',
      },
    })

    expect(validateSemanticRecipeComposeResult(storageTankRecipe, liquid)).toEqual([])
    expect(liquid.parts.find((part) => part.semanticRole === 'liquid_volume')).toMatchObject({
      level: 0.62,
      color: '#38bdf8',
      opacity: 0.32,
    })
    expect(liquid.parts.find((part) => part.semanticRole === 'liquid_surface')).toMatchObject({
      runtimeEffect: 'tank-liquid-wave',
      surfaceMode: 'wave',
      surfaceMotion: 'subtle',
    })
    expect(liquid.parts.some((part) => part.semanticRole === 'access_ladder')).toBe(false)
    expect(liquid.partGroups?.some((group) => group.id === 'access_stair')).toBe(false)

    const powder = storageTankRecipe.compose({
      envelope: { length: 2.4, width: 2.4, height: 3.2 },
      params: {
        storedMedium: 'powder',
        materialState: 'powder',
        level: 0.75,
        surfaceMode: 'sloped',
        surfaceMotion: 'none',
        contentColor: '#c8b88a',
        contentOpacity: 0.68,
        accessStairType: 'vertical-ladder',
      },
    })

    expect(validateSemanticRecipeComposeResult(storageTankRecipe, powder)).toEqual([])
    expect(powder.parts.map((part) => part.semanticRole)).toEqual(
      expect.arrayContaining(['solid_volume', 'solid_surface', 'access_ladder']),
    )
    expect(powder.parts.some((part) => part.semanticRole === 'liquid_surface')).toBe(false)
    expect(powder.parts.find((part) => part.semanticRole === 'solid_surface')).toMatchObject({
      runtimeEffect: 'tank-solid-level',
      surfaceMotion: 'none',
    })
    expect(powder.parts.find((part) => part.semanticRole === 'access_ladder')).toMatchObject({
      kind: 'platform_ladder',
      accessStairType: 'vertical-ladder',
    })

    const empty = storageTankRecipe.compose({
      envelope: { length: 2.4, width: 2.4, height: 3.2 },
      params: {
        storedMedium: 'empty',
        materialState: 'none',
      },
    })

    expect(validateSemanticRecipeComposeResult(storageTankRecipe, empty)).toEqual([])
    expect(empty.parts.some((part) => part.semanticRole === 'liquid_volume')).toBe(false)
    expect(empty.parts.some((part) => part.semanticRole === 'solid_volume')).toBe(false)
    expect(empty.editableParams?.map((param) => param.key)).toEqual(['shellOpacity'])
  })

  test('storage tank recipe keeps horizontal tanks as process vessels', () => {
    const result = storageTankRecipe.compose({
      envelope: { length: 4, width: 1.4, height: 1.4 },
      params: { orientation: 'horizontal', liquidLevel: 0.5 },
    })
    const liquid = result.parts.find((part) => part.semanticRole === 'liquid_volume')
    const surface = result.parts.find((part) => part.semanticRole === 'liquid_surface')

    expect(result.parts.find((part) => part.semanticRole === 'vessel_shell')).toMatchObject({
      kind: 'cylindrical_tank',
      sourcePartKind: 'cylindrical_tank',
    })
    expect(liquid).toMatchObject({
      axis: 'x',
      height: 3.84,
    })
    expect(liquid?.position?.[0]).toBe(0)
    expect(liquid?.position?.[1]).toBeGreaterThan(0.45)
    expect(liquid?.position?.[1]).toBeLessThan(0.6)
    expect(liquid?.radius).toBeCloseTo(0.315)
    expect(surface?.position?.[0]).toBe(0)
    expect(surface?.position?.[1]).toBeGreaterThan(0.8)
    expect(result.parts.find((part) => part.semanticRole === 'access_ladder')).toMatchObject({
      kind: 'platform_ladder',
      sourcePartKind: 'platform_ladder',
    })
  })

  test('centrifugal pump recipe exposes valid editable params', () => {
    const result = centrifugalPumpRecipe.compose({
      envelope: { length: 2.6, width: 1.1, height: 1.4 },
      params: { casingColor: '#ef4444', motorColor: '#0f172a', motorPower: 22 },
    })

    expect(validateSemanticRecipeDefinition(centrifugalPumpRecipe)).toEqual([])
    expect(validateSemanticRecipeComposeResult(centrifugalPumpRecipe, result)).toEqual([])
    expect(centrifugalPumpRecipe.editableParams?.map((param) => param.key)).toEqual([
      'casingColor',
      'motorColor',
      'motorPower',
    ])
  })

  test('distillation unit recipe adapts editable roles for refinery profiles', () => {
    const atmospheric = distillationUnitRecipe.compose({
      profileId: 'refinery.atmospheric_distillation_unit',
      envelope: { length: 10.5, width: 6, height: 13.5 },
      params: { columnColor: '#e5e7eb', heaterColor: '#737373' },
    })
    const vacuum = distillationUnitRecipe.compose({
      profileId: 'refinery.vacuum_distillation_unit',
      envelope: { length: 6.8, width: 4.4, height: 11.8 },
      params: { columnKind: 'vacuum' },
    })

    expect(validateSemanticRecipeDefinition(distillationUnitRecipe)).toEqual([])
    expect(validateSemanticRecipeComposeResult(distillationUnitRecipe, atmospheric)).toEqual([])
    expect(validateSemanticRecipeComposeResult(distillationUnitRecipe, vacuum)).toEqual([])
    expect(atmospheric.primarySemanticRole).toBe('distillation_column_shell')
    expect(vacuum.primarySemanticRole).toBe('vacuum_column_shell')
    expect(atmospheric.editableParams?.map((param) => param.key)).toEqual([
      'columnColor',
      'columnOpacity',
      'heaterColor',
      'exchangerColor',
      'manifoldColor',
    ])
    expect(vacuum.corePartRoles).toContain('heat_exchanger_shell')
    expect(vacuum.corePartRoles).toContain('vacuum_heater')
    expect(atmospheric.parts.map((part) => part.kind)).toContain('helical_ladder')
    expect(vacuum.parts.map((part) => part.kind)).toContain('helical_ladder')
    expect(atmospheric.parts.map((part) => part.semanticRole)).toContain('external_spiral_ladder')
    expect(atmospheric.parts.filter((part) => part.kind === 'service_platform')).toHaveLength(4)
    expect(vacuum.parts.filter((part) => part.kind === 'service_platform')).toHaveLength(3)
    expect(
      atmospheric.parts.filter((part) => part.semanticRole === 'tray_band').length,
    ).toBeGreaterThanOrEqual(10)
    expect(
      atmospheric.parts.filter((part) => part.kind === 'flanged_nozzle').length,
    ).toBeGreaterThanOrEqual(7)
    expect(atmospheric.parts.map((part) => part.semanticRole)).toContain('side_draw_nozzle')
    expect(atmospheric.editablePartRoles).toContain('upper_service_platform')
    expect(atmospheric.editablePartRoles).toContain('helical_ladder_tread')
    expect(atmospheric.editablePartRoles).toContain('helical_ladder_guard_rail')
  })

  test('distillation recipe supports refinery tower access and satellite column variants', () => {
    const fcc = distillationUnitRecipe.compose({
      profileId: 'refinery.fluid_catalytic_cracking_unit',
      envelope: { length: 7.2, width: 4.2, height: 7.2 },
      params: {
        ladderStyle: 'vertical',
        satelliteColumnCount: 2,
        satelliteColumnHeight: 5.6,
        satelliteColumnRadius: 0.34,
      },
    })
    const hydrotreater = distillationUnitRecipe.compose({
      profileId: 'refinery.hydrotreating_unit',
      envelope: { length: 6.8, width: 3.4, height: 6.4 },
      params: {
        ladderStyle: 'none',
        satelliteColumnCount: 1,
        satelliteColumnHeight: 4.4,
        satelliteColumnRadius: 0.26,
      },
    })

    expect(validateSemanticRecipeComposeResult(distillationUnitRecipe, fcc)).toEqual([])
    expect(validateSemanticRecipeComposeResult(distillationUnitRecipe, hydrotreater)).toEqual([])
    expect(fcc.parts.map((part) => part.semanticRole)).toContain('vertical_access_ladder')
    expect(fcc.parts.map((part) => part.semanticRole)).not.toContain('external_spiral_ladder')
    expect(fcc.parts.filter((part) => part.semanticRole === 'satellite_column')).toHaveLength(2)
    expect(hydrotreater.parts.map((part) => part.semanticRole)).not.toContain(
      'external_spiral_ladder',
    )
    expect(hydrotreater.parts.map((part) => part.semanticRole)).not.toContain(
      'vertical_access_ladder',
    )
    expect(
      hydrotreater.parts.filter((part) => part.semanticRole === 'satellite_column'),
    ).toHaveLength(1)
    expect(fcc.editablePartRoles).toEqual(
      expect.arrayContaining(['vertical_access_ladder', 'satellite_column']),
    )
  })

  test('refinery reactor recipe covers major refinery reactor profiles', () => {
    const profiles = [
      'refinery.fluid_catalytic_cracking_unit',
      'refinery.hydrotreating_unit',
      'refinery.catalytic_reformer_unit',
      'refinery.sulfur_recovery_unit',
    ]

    expect(validateSemanticRecipeDefinition(refineryReactorUnitRecipe)).toEqual([])
    for (const profileId of profiles) {
      const result = refineryReactorUnitRecipe.compose({
        profileId,
        envelope: { length: 7.2, width: 4.2, height: 7.2 },
      })

      expect(validateSemanticRecipeComposeResult(refineryReactorUnitRecipe, result)).toEqual([])
      expect(result.parts.length).toBeGreaterThanOrEqual(5)
      expect(result.primarySemanticRole).toBeTruthy()
      expect(result.corePartRoles?.length).toBeGreaterThanOrEqual(3)
      expect(result.editableParams?.map((param) => param.key)).toContain('primaryVesselColor')
    }
  })

  test('refinery auxiliary recipe covers flare, pipe rack, and boiler profiles', () => {
    const profiles = ['refinery.flare_system', 'refinery.pipe_rack', 'refinery.utility_boiler']

    expect(validateSemanticRecipeDefinition(refineryAuxiliaryUnitRecipe)).toEqual([])
    for (const profileId of profiles) {
      const result = refineryAuxiliaryUnitRecipe.compose({
        profileId,
        envelope: { length: 5, width: 2, height: 4 },
      })

      expect(validateSemanticRecipeComposeResult(refineryAuxiliaryUnitRecipe, result)).toEqual([])
      expect(result.parts.length).toBeGreaterThanOrEqual(3)
      expect(result.primarySemanticRole).toBeTruthy()
      expect(result.corePartRoles?.length).toBeGreaterThanOrEqual(2)
      expect(result.editableParams?.map((param) => param.key)).toContain('primaryColor')
    }
  })
})
