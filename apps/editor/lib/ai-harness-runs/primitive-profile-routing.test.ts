import { describe, expect, test } from 'bun:test'
import type { DeviceProfileDefinition } from '@pascal-app/core/lib/device-profile-registry'
import { isSafeDeterministicProfileMatch } from './primitive-profile-routing'

function profile(input: Partial<DeviceProfileDefinition> = {}): DeviceProfileDefinition {
  return {
    id: 'process.raw_material_tank',
    name: 'Raw material storage tank',
    aliases: ['storage tank', 'tank'],
    description: 'Raw material tank',
    status: 'stable',
    source: 'workspace',
    industry: 'process',
    family: 'tank',
    layoutFamily: 'tank',
    parts: [],
    ...input,
  }
}

describe('primitive profile routing', () => {
  test('rejects profile matches that only appear in negated prompt spans', () => {
    expect(
      isSafeDeterministicProfileMatch(
        profile(),
        'Generate a mixer, do not generate a raw material storage tank.',
      ),
    ).toBe(false)
  })

  test('accepts exact stable profile names', () => {
    expect(isSafeDeterministicProfileMatch(profile(), 'Generate a raw material storage tank')).toBe(
      true,
    )
  })

  test('rejects weak single-token aliases for unrelated deterministic routing', () => {
    expect(
      isSafeDeterministicProfileMatch(
        profile({
          id: 'shell_tube_heat_exchanger',
          name: 'Shell-and-tube heat exchanger',
          aliases: ['condenser'],
        }),
        'Generate an outdoor air conditioner condenser unit with fan grille and side louvers.',
      ),
    ).toBe(false)
  })

  test('accepts exact stable profile ids', () => {
    expect(
      isSafeDeterministicProfileMatch(
        profile({ id: 'bicycle', name: 'Bicycle', aliases: ['bike'] }),
        'Generate a bicycle with a red frame.',
      ),
    ).toBe(true)
  })
})
