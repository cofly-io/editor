import {
  applyDeviceProfileToPartInput,
  buildDraftDeviceProfile,
  type DeviceProfileDefinition,
  inferDeviceProfileDefinition,
  validateDeviceProfileForExecution,
} from '@pascal-app/core/lib/device-profile-registry'
import {
  executableFamilyForLayoutFamily,
  inferFamilyDefinition,
} from '@pascal-app/core/lib/family-registry'
import {
  composePartPrimitives,
  type PartComposeInput,
  type PartComposePartInput,
  resolveLayout,
} from '@pascal-app/core/lib/part-compose'
import { getPartDefinitions, normalizePartPlanForFamily } from '@pascal-app/core/lib/part-registry'
import type { PrimitiveGeometryBrief } from '@pascal-app/core/lib/primitive-compose'
import type { RawGeometryToolShape as RawShape } from './ai-geometry-tool-constants'
import { textOf } from './ai-geometry-tool-fallback-inputs'
import {
  applyResourcePackPartKnowledge,
  canonicalizeRegistryLayoutPartRoles,
  dedupeProfileLayoutParts,
  preserveExplicitPartPositions,
} from './ai-geometry-tool-profile-layout'
import { profileExecutionSmokeValidation } from './ai-geometry-tool-profile-quality'

export { hasExplicitPartPosition } from './ai-geometry-tool-profile-layout'

export type ProfileFallbackContext = {
  deviceProfiles?: readonly DeviceProfileDefinition[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRequiredRoleToken(role: string) {
  return role
    .trim()
    .toLowerCase()
    .replace(/[:=]\s*\d+$/, '')
    .replace(/[\s-]+/g, '_')
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : undefined
}

function normalizeGeometryBrief(value: unknown): PrimitiveGeometryBrief | undefined {
  if (!isRecord(value)) return undefined
  const requiredRoles = stringArray(value.requiredRoles)?.map(normalizeRequiredRoleToken)
  const semanticRoles = stringArray(value.semanticRoles)?.map(normalizeRequiredRoleToken)
  return {
    ...(value as PrimitiveGeometryBrief),
    ...(typeof value.category === 'string' ? { category: normalizeRequiredRoleToken(value.category) } : {}),
    ...(requiredRoles ? { requiredRoles } : {}),
    ...(semanticRoles ? { semanticRoles } : {}),
  }
}

function registrySemanticCategory(family: string): string {
  if (family === 'vehicle') return 'vehicle'
  if (family === 'aircraft') return 'aircraft'
  if (family === 'bicycle') return 'bicycle'
  if (family === 'fan') return 'fan'
  if (family === 'robot_arm') return 'robot_arm'
  if (family === 'generic') return 'generic_object'
  return 'process_equipment'
}

function profileFallbackText(args: Record<string, unknown>, prompt: string): string {
  return [prompt, args.geometryBrief, args.name, args.object, args.partName, args.category, args.family]
    .map(textOf)
    .join(' ')
}
function explicitDraftProfileFromArgs(
  args: Record<string, unknown>,
  prompt: string,
): DeviceProfileDefinition | undefined {
  if (!isRecord(args.deviceProfileDraft)) return undefined
  return buildDraftDeviceProfile(prompt, {
    ...args,
    deviceProfileDraft: args.deviceProfileDraft,
  }).profile
}

export function attachExplicitDeviceProfileDraft(args: Record<string, unknown>, prompt: string) {
  const profile = explicitDraftProfileFromArgs(args, prompt)
  if (!profile) return
  args.deviceProfileDraft = profile
  args.__deviceProfileDefinition = args.__deviceProfileDefinition ?? profile
  args.deviceProfile = args.deviceProfile ?? profile.id
  args.archetypeFamily = args.archetypeFamily ?? profile.archetypeFamily
  args.layoutFamily = args.layoutFamily ?? profile.layoutFamily
  args.profileSource = args.profileSource ?? profile.source
  args.primarySemanticRole = args.primarySemanticRole ?? profile.primarySemanticRole
  args.family = args.family ?? profile.family
}

function hasPartDefinitions(family: unknown): family is string {
  return typeof family === 'string' && getPartDefinitions(family).length > 0
}

function executableFamilyForProfile(
  profile: DeviceProfileDefinition | undefined,
  inferredFamily: string | undefined,
): string | undefined {
  if (profile) {
    if (hasPartDefinitions(profile.family)) return profile.family
    const layoutExecutable = executableFamilyForLayoutFamily(
      profile.layoutFamily,
      hasPartDefinitions(inferredFamily) ? inferredFamily : undefined,
    )
    if (hasPartDefinitions(layoutExecutable)) return layoutExecutable
    if (hasPartDefinitions(inferredFamily)) return inferredFamily
    if (hasPartDefinitions('generic')) return 'generic'
    return undefined
  }
  return hasPartDefinitions(inferredFamily) ? inferredFamily : undefined
}

function explicitProfileParts(parts: unknown): PartComposePartInput[] {
  if (!Array.isArray(parts)) return []
  const seenIds = new Set<string>()
  const seenAnonymousKindRoles = new Set<string>()
  const seenKindRoles = new Set<string>()
  const output: PartComposePartInput[] = []
  for (const part of parts) {
    if (!isRecord(part)) continue
    const kind = String(part.kind ?? part.partType ?? part.type ?? '').trim()
    if (!kind) continue
    const semanticRole = String(part.semanticRole ?? '').trim()
    const explicitId = String(part.id ?? '').trim()
    const idKey = explicitId.toLowerCase()
    const kindRoleKey = `${kind.toLowerCase()}::${semanticRole.toLowerCase()}`
    if (idKey && seenIds.has(idKey)) continue
    if (!idKey && seenKindRoles.has(kindRoleKey)) continue
    if (idKey && seenAnonymousKindRoles.has(kindRoleKey)) continue
    if (idKey) seenIds.add(idKey)
    else seenAnonymousKindRoles.add(kindRoleKey)
    seenKindRoles.add(kindRoleKey)
    output.push({
      ...(part as PartComposePartInput),
      kind,
      ...(semanticRole ? { semanticRole } : {}),
    })
  }
  return output
}

function shouldBuildRuntimeDraftProfile(args: Record<string, unknown>, prompt: string): boolean {
  const text = profileFallbackText(args, prompt).toLowerCase()
  return /industrial|factory|equipment|machine|apparatus|plant|process|press|filter|dryer|lyophili[sz]er|centrifuge|separator|conveyor|screw|auger|\u5de5\u5382|\u5de5\u4e1a|\u8bbe\u5907|\u8a2d\u5099|\u88c5\u7f6e|\u88dd\u7f6e|\u538b\u6ee4|\u58d3\u6ffe|\u51bb\u5e72|\u51cd\u4e7e|\u5206\u79bb|\u8f93\u9001|\u8f38\u9001|\u87ba\u65cb/.test(
    text,
  )
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

function isConfidentInferredProfileMatch(
  profile: DeviceProfileDefinition,
  sourceArgs: Record<string, unknown>,
  prompt: string,
): boolean {
  const id = normalizeProfileMatchText(profile.id)
  const name = normalizeProfileMatchText(profile.name)
  const labels = [profile.id, profile.name, ...profile.aliases]
    .map(normalizeProfileMatchText)
    .filter(Boolean)
  const explicitProfileLabels = [
    sourceArgs.deviceProfile,
    sourceArgs.profile,
    sourceArgs.deviceType,
  ].map(normalizeProfileMatchText)
  if (
    explicitProfileLabels.some(
      (label) => label && (label === id || label === name || labels.includes(label)),
    )
  ) {
    return true
  }

  const text = normalizeProfileMatchText(
    [prompt, sourceArgs.name, sourceArgs.object, sourceArgs.category].join(' '),
  )

  return labels.some((label) => {
    if (!text.includes(label)) return false
    const tokenCount = label.split(/\s+/).filter(Boolean).length
    return label === id || label === name || tokenCount >= 2
  })
}

export function registryPartFallbackShapes(
  targetArgs: Record<string, unknown>,
  sourceArgs: Record<string, unknown>,
  prompt: string,
  context?: ProfileFallbackContext,
): RawShape[] | undefined {
  const availableProfiles = context?.deviceProfiles ?? undefined
  const explicitDraftProfile = explicitDraftProfileFromArgs(sourceArgs, prompt)
  const explicitBrief = normalizeGeometryBrief(sourceArgs.geometryBrief)
  const explicitBriefCategory =
    typeof explicitBrief?.category === 'string' && explicitBrief.category.trim().length > 0
      ? explicitBrief.category.trim()
      : undefined
  const explicitBriefRoles = explicitBrief?.requiredRoles ?? []
  const inferencePrompt =
    explicitBriefCategory || explicitBriefRoles.length > 0
      ? [explicitBriefCategory, ...explicitBriefRoles, sourceArgs.name, sourceArgs.category]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .join(' ')
      : prompt
  const inferenceArgs = {
    ...sourceArgs,
    ...(explicitBriefCategory ? { category: explicitBriefCategory, family: explicitBriefCategory } : {}),
    prompt: inferencePrompt,
  }
  const inferredFamilyDefinition = inferFamilyDefinition(inferenceArgs)
  const inferredProfile = explicitBriefCategory
    ? undefined
    : inferDeviceProfileDefinition({ ...sourceArgs, prompt }, availableProfiles)
  const inferredProfileIsConfident =
    inferredProfile != null && isConfidentInferredProfileMatch(inferredProfile, sourceArgs, prompt)
  const draftFallbackAllowed =
    explicitDraftProfile != null ||
    (inferredProfile == null && shouldBuildRuntimeDraftProfile(sourceArgs, prompt))
  const fallbackDraft =
    draftFallbackAllowed && explicitDraftProfile == null
      ? buildDraftDeviceProfile(prompt, {
          ...sourceArgs,
          deviceProfileDraft: sourceArgs.deviceProfileDraft,
        }).profile
      : undefined
  const shouldUseFallbackDraft =
    fallbackDraft != null &&
    fallbackDraft.description !== 'Generic industrial fallback draft profile.'
  const explicitDraftValidation = explicitDraftProfile
    ? validateDeviceProfileForExecution(explicitDraftProfile)
    : undefined
  const draftProfile =
    (explicitDraftValidation?.ok ? explicitDraftProfile : undefined) ??
    (shouldUseFallbackDraft ? fallbackDraft : undefined)
  const profile =
    inferredProfile && (explicitDraftProfile == null || inferredProfileIsConfident)
      ? inferredProfile
      : draftProfile
  if (explicitDraftValidation && !explicitDraftValidation.ok && inferredProfile == null) {
    targetArgs.deviceProfileValidation = explicitDraftValidation
    targetArgs.profileFallbackReason = 'profile_validation_failed'
    targetArgs.family = 'generic'
    targetArgs.deviceProfile = undefined
    targetArgs.__deviceProfileDefinition = undefined
    return undefined
  }
  const profileValidation = profile ? validateDeviceProfileForExecution(profile) : undefined
  if (profileValidation && !profileValidation.ok) {
    targetArgs.deviceProfileValidation = profileValidation
    targetArgs.profileFallbackReason = 'profile_validation_failed'
    targetArgs.family = 'generic'
    targetArgs.deviceProfile = undefined
    targetArgs.__deviceProfileDefinition = undefined
    return undefined
  }
  const profiledSourceArgs = profile
    ? applyDeviceProfileToPartInput(profile, { ...sourceArgs, prompt })
    : sourceArgs
  const inferredFamily =
    (profile ? inferFamilyDefinition({ ...profiledSourceArgs, prompt }) : inferredFamilyDefinition)
      ?.id ?? inferFamilyDefinition({ ...profiledSourceArgs, prompt })?.id
  const family = executableFamilyForProfile(profile, inferredFamily)
  if (!family || family === 'vehicle') return undefined
  const explicitParts =
    profile && profile.source !== 'builtin' ? explicitProfileParts(profiledSourceArgs.parts) : []
  const normalizedPlan =
    explicitParts.length > 0
      ? { family, parts: explicitParts, warnings: [] }
      : normalizePartPlanForFamily(family, { ...profiledSourceArgs, prompt })
  if (!normalizedPlan?.parts.length) return undefined
  const roleAwareParts = profile
    ? applyProfilePartRoles(profile, normalizedPlan.parts)
    : normalizedPlan.parts
  const normalizedParts = profile
    ? applyResourcePackPartKnowledge(profiledSourceArgs, roleAwareParts)
    : roleAwareParts
  const layoutPlan = resolveLayout(
    {
      family: profile?.family ?? normalizedPlan.family,
      layoutFamily: profile?.layoutFamily,
      primarySemanticRole: profile?.primarySemanticRole,
    },
    normalizedParts,
    {
      length: typeof profiledSourceArgs.length === 'number' ? profiledSourceArgs.length : undefined,
      width: typeof profiledSourceArgs.width === 'number' ? profiledSourceArgs.width : undefined,
      height: typeof profiledSourceArgs.height === 'number' ? profiledSourceArgs.height : undefined,
      diameter:
        typeof profiledSourceArgs.diameter === 'number' ? profiledSourceArgs.diameter : undefined,
    },
  )
  const positionedLayoutParts = preserveExplicitPartPositions(
    layoutPlan.parts,
    profiledSourceArgs.parts,
  )
  const dedupedLayoutParts = profile
    ? dedupeProfileLayoutParts(positionedLayoutParts)
    : positionedLayoutParts
  const layoutParts = canonicalizeRegistryLayoutPartRoles(normalizedPlan.family, dedupedLayoutParts)
  const resolvedLayoutPlan =
    layoutParts === layoutPlan.parts ? layoutPlan : { ...layoutPlan, parts: layoutParts }

  const partInput: PartComposeInput = {
    ...(profiledSourceArgs as PartComposeInput),
    name:
      typeof profiledSourceArgs.name === 'string'
        ? profiledSourceArgs.name
        : typeof profiledSourceArgs.object === 'string'
          ? profiledSourceArgs.object
          : normalizedPlan.family.replace(/_/g, ' '),
    family: normalizedPlan.family,
    registryPartPlan: true,
    autoComplete: false,
    enhanceVisualDetails: false,
    parts: layoutParts,
  }
  const shapes = profile
    ? applyProfileShapeRoles(profile, composePartPrimitives(partInput) as RawShape[])
    : (composePartPrimitives(partInput) as RawShape[])
  if (shapes.length === 0) return undefined

  const executionValidation = profile
    ? profileExecutionSmokeValidation(profile, shapes, layoutParts)
    : undefined
  const fullProfileValidation =
    profile && profileValidation
      ? validateDeviceProfileForExecution(profile, executionValidation)
      : undefined
  if (fullProfileValidation && !fullProfileValidation.ok) {
    targetArgs.deviceProfileValidation = fullProfileValidation
    targetArgs.profileFallbackReason = 'profile_execution_validation_failed'
    return undefined
  }

  targetArgs.family = normalizedPlan.family
  targetArgs.parts = layoutParts
  targetArgs.__registryPartPlan = true
  targetArgs.layoutPlan = resolvedLayoutPlan
  if (profile) {
    targetArgs.deviceProfile = profile.id
    targetArgs.archetypeFamily = profile.archetypeFamily
    targetArgs.layoutFamily = profile.layoutFamily
    targetArgs.layoutTemplate = profile.layoutTemplate
    targetArgs.profileSourcePack = profile.sourcePack
    targetArgs.profilePackId = profile.sourcePack?.id
    targetArgs.profilePackVersion = profile.sourcePack?.version
    targetArgs.partPresets = profile.partPresets
    targetArgs.resolvedPartPresets = profile.resolvedPartPresets
    targetArgs.qualityRules = profile.qualityRules
    targetArgs.profileSource = profile.source
    targetArgs.primarySemanticRole = profile.primarySemanticRole
    targetArgs.deviceProfileValidation = fullProfileValidation ?? profileValidation
    targetArgs.__deviceProfileDefinition = profile
    if (profile.status === 'runtime_draft') {
      targetArgs.deviceProfileDraft = profile
    }
  }
  for (const key of ['length', 'width', 'height', 'diameter']) {
    if (targetArgs[key] == null && profiledSourceArgs[key] != null) {
      targetArgs[key] = profiledSourceArgs[key]
    }
  }
  if (normalizedPlan.warnings.length > 0) targetArgs.partWarnings = normalizedPlan.warnings
  return shapes
}

function applyProfilePartRoles(
  profile: DeviceProfileDefinition,
  normalizedParts: readonly PartComposePartInput[],
): PartComposePartInput[] {
  const remainingProfileParts = [...profile.parts]
  return normalizedParts.map((part) => {
    const partId = String(part.id ?? '').toLowerCase()
    const partKind = String(part.kind).toLowerCase()
    const partRole = String(part.semanticRole).toLowerCase()
    const findBy = (
      predicate: (profilePart: DeviceProfileDefinition['parts'][number]) => boolean,
    ) => remainingProfileParts.findIndex(predicate)
    const index =
      (partId
        ? findBy((profilePart) => String(profilePart.id ?? '').toLowerCase() === partId)
        : -1) ?? -1
    const fallbackIndex =
      index >= 0
        ? index
        : findBy(
            (profilePart) =>
              String(profilePart.kind).toLowerCase() === partKind &&
              String(profilePart.semanticRole).toLowerCase() === partRole,
          )
    const roleIndex =
      fallbackIndex >= 0
        ? fallbackIndex
        : findBy((profilePart) => String(profilePart.semanticRole).toLowerCase() === partRole)
    const kindIndex =
      roleIndex >= 0
        ? roleIndex
        : findBy((profilePart) => String(profilePart.kind).toLowerCase() === partKind)
    const indexToUse = kindIndex
    if (indexToUse < 0) return part
    const [profilePart] = remainingProfileParts.splice(indexToUse, 1)
    if (!profilePart?.semanticRole) return part
    if (String(profilePart.kind).toLowerCase() === 'heat_exchanger') return part
    return {
      ...part,
      semanticRole: profilePart.semanticRole,
      ...(profilePart.required ? { required: true } : {}),
    }
  })
}

function applyProfileShapeRoles(
  profile: DeviceProfileDefinition,
  shapes: readonly RawShape[],
): RawShape[] {
  const rolesByKind = new Map<string, string[]>()
  for (const part of profile.parts) {
    const kind = String(part.kind).toLowerCase()
    const roles = rolesByKind.get(kind) ?? []
    if (!roles.includes(part.semanticRole)) roles.push(part.semanticRole)
    rolesByKind.set(kind, roles)
  }
  return shapes.map((shape) => {
    const sourceKind = String(shape.sourcePartKind ?? shape.kind ?? '').toLowerCase()
    const roles = rolesByKind.get(sourceKind)
    if (!roles || roles.length !== 1) return shape
    const role = roles[0]
    if (!role) return shape
    const currentRole = String(shape.semanticRole ?? '').toLowerCase()
    const replaceableShellRole =
      (sourceKind === 'cylindrical_tank' || sourceKind === 'agitator_tank') &&
      (currentRole === 'vessel_shell' ||
        currentRole === 'reactor_vessel_shell' ||
        currentRole === 'cylindrical_shell')
    if (currentRole && !replaceableShellRole) return shape
    return { ...shape, semanticRole: role }
  })
}

