import type { ProfileResourceCandidate } from './resource-profile-resolver'

export type ResourceCandidateOption = {
  profileId: string
  name: string
  aliases: readonly string[]
  score: number
  matchedLabel: string
  matchKind: ProfileResourceCandidate['matchKind']
  reason: string
  source: string
  sourcePack: ProfileResourceCandidate['profile']['sourcePack']
  industry: string
  family: string
  layoutFamily: string
  description?: string
  usageHint: string
  recommended: boolean
}

export function resourceCandidateUsageHint(candidate: ResourceCandidateOption) {
  if (candidate.description) return candidate.description
  return `匹配 ${candidate.matchKind} "${candidate.matchedLabel}"，适合与该名称或近义名称一致的设备场景。`
}

export function recommendedResourceCandidateId(
  candidates: readonly Pick<ResourceCandidateOption, 'profileId'>[],
) {
  return candidates[0]?.profileId
}

export function resourceCandidateOptions(
  candidates: readonly ProfileResourceCandidate[],
): ResourceCandidateOption[] {
  const baseCandidates = candidates.map((candidate) => ({
    profileId: candidate.profile.id,
    name: candidate.profile.name,
    aliases: candidate.profile.aliases,
    score: candidate.score,
    matchedLabel: candidate.matchedLabel,
    matchKind: candidate.matchKind,
    reason: candidate.reason,
    source: candidate.profile.source,
    sourcePack: candidate.profile.sourcePack,
    industry: candidate.profile.industry,
    family: candidate.profile.family,
    layoutFamily: candidate.profile.layoutFamily,
    description: candidate.profile.description,
  }))
  const recommendedCandidateId = recommendedResourceCandidateId(baseCandidates)
  return baseCandidates.map((candidate) => {
    const option = {
      ...candidate,
      usageHint: '',
      recommended: candidate.profileId === recommendedCandidateId,
    }
    return {
      ...option,
      usageHint: resourceCandidateUsageHint(option),
    }
  })
}

export function buildResourceSelectionMessage(options: readonly ResourceCandidateOption[]) {
  const optionLines = options.map((candidate, index) => {
    const sourceLabel = candidate.sourcePack
      ? `${candidate.sourcePack.id}@${candidate.sourcePack.version}`
      : candidate.source
    return [
      `${index + 1}. ${candidate.matchedLabel || candidate.name} (${candidate.profileId})`,
      `   适用：${candidate.usageHint}`,
      `   来源：${sourceLabel}`,
    ].join('\n')
  })
  return [
    '找到多个可能的行业资源，需要先选择设备类型再生成。',
    // User-visible hard-coded recommendation copy is disabled until recommendation policy is data-driven.
    // recommendedCandidate ? `建议默认选择：${recommendedCandidate.matchedLabel || recommendedCandidate.name}。${recommendedCandidate.usageHint}` : undefined,
    '',
    ...optionLines,
  ]
    .filter(Boolean)
    .join('\n')
}
