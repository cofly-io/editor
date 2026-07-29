import {
  applyDeviceProfileToPartInput,
  type DeviceProfileDefinition,
  inferDeviceProfileDefinition,
} from '@pascal-app/core/lib/device-profile-registry'
import { isLikelyGeometryRevisionRequest } from '../../../../packages/editor/src/lib/ai-chat-harness'
import type { GeneratedGeometryArtifact } from '../../../../packages/editor/src/lib/ai-generated-geometry-core'

const NEGATED_TARGET_CLAUSE_PATTERNS = [
  /\b(?:do\s+not|don't|dont|never|avoid|not)\s+(?:generate|create|make|build|model|use)?\s*([^.!?;\n]+)/gi,
  /(?:\u4e0d\u8981\u751f\u6210|\u4e0d\u8981|\u522b\u751f\u6210|\u4e0d\u662f|\u907f\u514d\u751f\u6210|\u7981\u6b62\u751f\u6210)\s*([^\u3002\uff01\uff1f\uff1b\n]+)/g,
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeProfileMatchText(value: unknown): string {
  return typeof value === 'string'
    ? value
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : ''
}

const NON_EQUIPMENT_SCENE_PROMPT_PATTERN =
  /\b(?:lawn|grass|meadow|garden|flower|flowers|wildflower|bush|shrub|tree|terrain|landscape|pond|arch\s+bridge|footbridge|small\s+bridge)\b|草坪|草地|草丛|小草|花园|庭院|景观|地形|山坡|灌木|树木|小花|花朵|花丛|池塘|拱桥|小桥|木桥/

const EQUIPMENT_PROMPT_PATTERN =
  /\b(?:factory|industrial|equipment|machine|machinery|conveyor|pump|tank|vessel|reactor|agitator|motor|cabinet|robot|robotic|arm|valve|pipe|flange|workcell|production\s+line|assembly\s+line)\b|工厂|工业|设备|机器|机械|输送机|传送带|泵|储罐|罐体|反应釜|搅拌罐|电机|控制柜|机器臂|机械臂|机器人|阀|管道|法兰|产线|生产线/

export function isClearlyNonEquipmentProfilePrompt(userPrompt: string): boolean {
  const normalizedPrompt = normalizeProfileMatchText(userPrompt)
  if (!normalizedPrompt) return false
  if (
    EQUIPMENT_PROMPT_PATTERN.test(userPrompt) ||
    EQUIPMENT_PROMPT_PATTERN.test(normalizedPrompt)
  ) {
    return false
  }
  return (
    NON_EQUIPMENT_SCENE_PROMPT_PATTERN.test(userPrompt) ||
    NON_EQUIPMENT_SCENE_PROMPT_PATTERN.test(normalizedPrompt)
  )
}

function profileMatchLabels(profile: DeviceProfileDefinition): string[] {
  const labels = [profile.id, profile.name, ...profile.aliases]
    .map(normalizeProfileMatchText)
    .filter(Boolean)
  return Array.from(new Set(labels))
}

function deniedProfileTargetSpans(userPrompt: string): string[] {
  const spans: string[] = []
  for (const pattern of NEGATED_TARGET_CLAUSE_PATTERNS) {
    for (const match of userPrompt.matchAll(pattern)) {
      const span = normalizeProfileMatchText(match[1])
      if (span) spans.push(span)
    }
  }
  return spans
}

export function isSafeDeterministicProfileMatch(
  profile: DeviceProfileDefinition,
  userPrompt: string,
): boolean {
  const prompt = normalizeProfileMatchText(userPrompt)
  if (!prompt) return false
  const labels = profileMatchLabels(profile)
  const deniedSpans = deniedProfileTargetSpans(userPrompt)
  if (labels.some((label) => deniedSpans.some((span) => span.includes(label)))) return false

  const id = normalizeProfileMatchText(profile.id)
  const name = normalizeProfileMatchText(profile.name)
  return labels.some((label) => {
    if (!prompt.includes(label)) return false
    const tokenCount = label.split(/\s+/).filter(Boolean).length
    return label === id || label === name || tokenCount >= 2
  })
}

export function shouldUseDeterministicProfileRoute(input: {
  profile: DeviceProfileDefinition | undefined
  userPrompt: string
  revisionTarget: GeneratedGeometryArtifact | null
  resourceResolved?: boolean
}) {
  if (!input.profile) return false
  if (input.revisionTarget) return false
  if (isLikelyGeometryRevisionRequest(input.userPrompt, input.revisionTarget)) return false
  if (!input.resourceResolved && !isSafeDeterministicProfileMatch(input.profile, input.userPrompt))
    return false
  return input.profile.status === 'stable'
}

export function buildProfileRouteArgs(
  profile: DeviceProfileDefinition,
  userPrompt: string,
): Record<string, unknown> {
  const rawProfile = profile as DeviceProfileDefinition & {
    visualCues?: readonly string[]
    layoutHints?: Record<string, unknown>
  }
  const geometryBrief = [
    `Device profile ${profile.id} (${profile.name}) from ${profile.source}.`,
    profile.sourcePack
      ? `Source pack: ${profile.sourcePack.id}@${profile.sourcePack.version}.`
      : undefined,
    profile.layoutTemplate ? `Layout template: ${profile.layoutTemplate}.` : undefined,
    profile.description,
    rawProfile.visualCues?.length ? `Visual cues: ${rawProfile.visualCues.join('; ')}.` : undefined,
    rawProfile.layoutHints ? `Layout hints: ${JSON.stringify(rawProfile.layoutHints)}.` : undefined,
    `User request: ${userPrompt}`,
  ]
    .filter(Boolean)
    .join('\n')
  return applyDeviceProfileToPartInput(profile, {
    prompt: userPrompt,
    name: profile.name,
    object: profile.name,
    category: profile.id,
    deviceProfile: profile.id,
    profile: profile.id,
    geometryBrief,
    ...(rawProfile.layoutHints ? { layoutHints: rawProfile.layoutHints } : {}),
    forceProfile: true,
  })
}

export function profileForArtifact(
  artifact: GeneratedGeometryArtifact | null,
  profiles: readonly DeviceProfileDefinition[],
): DeviceProfileDefinition | undefined {
  if (!artifact || !isRecord(artifact.sourceArgs)) return undefined
  return inferDeviceProfileDefinition(
    {
      deviceProfile: artifact.sourceArgs.deviceProfile,
      profile: artifact.sourceArgs.profile,
      deviceType: artifact.sourceArgs.deviceType,
      prompt: artifact.userPrompt,
      name: artifact.sourceArgs.name,
      object: artifact.sourceArgs.object,
    },
    profiles,
  )
}

export function profileForEditableRevision(
  userPrompt: string,
  revisionTarget: GeneratedGeometryArtifact | null,
  profiles: readonly DeviceProfileDefinition[],
): DeviceProfileDefinition | undefined {
  const promptProfile = inferDeviceProfileDefinition(
    { prompt: userPrompt, name: userPrompt, object: userPrompt },
    profiles,
  )
  if (promptProfile?.family === 'robot_arm') return promptProfile
  return profileForArtifact(revisionTarget, profiles)
}

export function artifactShapesForProfileQuality(artifact: GeneratedGeometryArtifact) {
  return artifact.shapes.map((shape, index) => ({
    ...shape,
    position: artifact.transforms[index]?.position ?? shape.position,
  }))
}
