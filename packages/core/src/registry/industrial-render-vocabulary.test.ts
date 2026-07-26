import { describe, expect, test } from 'bun:test'
import {
  getIndustrialMaterialPbrProfile,
  INDUSTRIAL_MATERIAL_PBR_PROFILES,
  INDUSTRIAL_RENDER_MATERIALS,
  isIndustrialRenderMaterial,
} from './industrial-render-vocabulary'

describe('industrial material PBR profiles', () => {
  test('covers every supported industrial material with a bounded PBR baseline', () => {
    for (const material of INDUSTRIAL_RENDER_MATERIALS) {
      const profile = getIndustrialMaterialPbrProfile(material)
      expect(profile).toBe(INDUSTRIAL_MATERIAL_PBR_PROFILES[material])
      expect(profile?.id).toBe(material)
      expect(profile?.metalness).toBeGreaterThanOrEqual(0)
      expect(profile?.metalness).toBeLessThanOrEqual(1)
      expect(profile?.roughness).toBeGreaterThanOrEqual(0)
      expect(profile?.roughness).toBeLessThanOrEqual(1)
      expect(profile?.recommendedMaps.length).toBeGreaterThan(0)
    }
  })

  test('does not accept arbitrary AI material labels as PBR profiles', () => {
    expect(isIndustrialRenderMaterial('brushed-metal')).toBe(true)
    expect(isIndustrialRenderMaterial('metalness: 0.7')).toBe(false)
    expect(getIndustrialMaterialPbrProfile('invented-alloy')).toBeUndefined()
  })
})
