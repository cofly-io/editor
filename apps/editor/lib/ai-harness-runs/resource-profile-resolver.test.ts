import { describe, expect, test } from 'bun:test'
import type { DeviceProfileDefinition } from '@pascal-app/core/lib/device-profile-registry'
import { resolveProfileResourceCandidates } from './resource-profile-resolver'

function profile(id: string, name: string, aliases: string[]): DeviceProfileDefinition {
  return {
    id,
    name,
    aliases,
    family: 'tank',
    layoutFamily: 'vessel_layout',
    parts: [{ kind: 'cylindrical_tank', semanticRole: 'vessel_shell' }],
    primarySemanticRole: 'vessel_shell',
    status: 'stable',
    source: 'test',
  }
}

describe('resource-profile-resolver', () => {
  test('selects an explicit profile id even when generic labels overlap', () => {
    const profiles = [
      profile('refinery.crude_storage_tank', 'Crude storage tank', [
        'crude storage tank',
        'storage tank',
      ]),
      profile('refinery.product_storage_tank', 'Product storage tank', [
        'product storage tank',
        'storage tank',
      ]),
      profile('process.raw_material_tank', 'Raw material storage tank', ['storage tank']),
    ]

    const resolution = resolveProfileResourceCandidates(
      'Create equipment using the refinery.crude_storage_tank profile.',
      profiles,
    )

    expect(resolution.selectedProfile?.id).toBe('refinery.crude_storage_tank')
    expect(resolution.selectedCandidate).toMatchObject({
      matchedLabel: 'refinery.crude_storage_tank',
      reason: 'explicit profile id',
    })
  })

  test('returns multiple distillation candidates for a generic tower request', () => {
    const profiles = [
      profile('refinery.atmospheric_distillation_unit', 'Atmospheric distillation unit', [
        '\u5e38\u538b\u84b8\u998f\u5854',
        'atmospheric distillation unit',
      ]),
      profile('refinery.vacuum_distillation_unit', 'Vacuum distillation unit', [
        '\u51cf\u538b\u84b8\u998f\u5854',
        'vacuum distillation unit',
      ]),
    ]

    const resolution = resolveProfileResourceCandidates(
      '\u751f\u6210\u4e00\u4e2a\u84b8\u998f\u5854',
      profiles,
    )

    expect(resolution.selectedProfile).toBeUndefined()
    expect(resolution.candidates.map((candidate) => candidate.profile.id)).toEqual([
      'refinery.atmospheric_distillation_unit',
      'refinery.vacuum_distillation_unit',
    ])
  })

  test('selects a specific distillation profile when the prompt names its alias', () => {
    const profiles = [
      profile('refinery.atmospheric_distillation_unit', 'Atmospheric distillation unit', [
        '\u5e38\u538b\u84b8\u998f\u5854',
        'atmospheric distillation unit',
      ]),
      profile('refinery.vacuum_distillation_unit', 'Vacuum distillation unit', [
        '\u51cf\u538b\u84b8\u998f\u5854',
        'vacuum distillation unit',
      ]),
    ]

    const resolution = resolveProfileResourceCandidates(
      '\u751f\u6210\u4e00\u4e2a\u5e38\u538b\u84b8\u998f\u5854',
      profiles,
    )

    expect(resolution.selectedProfile?.id).toBe('refinery.atmospheric_distillation_unit')
    expect(resolution.selectedCandidate).toMatchObject({
      matchedLabel: '\u5e38\u538b\u84b8\u998f\u5854',
      matchKind: 'alias',
    })
  })
})
