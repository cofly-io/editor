import { describe, expect, test } from 'bun:test'
import {
  buildResourceSelectionMessage,
  resourceCandidateOptions,
} from './resource-candidate-presentation'
import type { ProfileResourceCandidate } from './resource-profile-resolver'

function candidate(
  id: string,
  matchedLabel: string,
  description?: string,
): ProfileResourceCandidate {
  return {
    profile: {
      id,
      name: matchedLabel,
      aliases: [],
      description,
      status: 'stable',
      source: 'workspace',
      industry: 'test',
      family: 'test',
      layoutFamily: 'test',
      parts: [],
    },
    score: 0.9,
    matchedLabel,
    matchKind: 'name',
    reason: 'name contained in request',
  } as ProfileResourceCandidate
}

describe('resource candidate presentation', () => {
  test('uses generic profile descriptions instead of industry-specific hard-coded hints', () => {
    const options = resourceCandidateOptions([
      candidate('profile.atmospheric', 'atmospheric tower', 'Profile-provided usage.'),
      candidate('profile.vacuum', 'vacuum tower'),
    ])
    const message = buildResourceSelectionMessage(options)

    expect(options[0]?.usageHint).toBe('Profile-provided usage.')
    expect(options[1]?.usageHint).toContain('匹配 name')
    expect(message).toContain('找到多个可能的行业资源')
    expect(message).not.toContain('建议默认选择')
    expect(message).not.toContain('推荐：')
    expect(message).not.toContain('常压渣油')
  })
})
