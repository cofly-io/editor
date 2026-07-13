import type { DeviceProfileDefinition } from '@pascal-app/core/lib/device-profile-registry'
import type { GeometryContextDecision } from '../../../../packages/editor/src/lib/ai-chat-harness'
import type { GeneratedGeometryArtifact } from '../../../../packages/editor/src/lib/ai-generated-geometry-core'
import type { loadDeviceProfiles } from '../device-profiles'
import type { PrimitiveRouteMetrics } from './primitive-run-metrics'

export function deviceProfileSourceSummary(
  loadedDeviceProfiles: Awaited<ReturnType<typeof loadDeviceProfiles>>,
) {
  return {
    count: loadedDeviceProfiles.profiles.length,
    warnings: loadedDeviceProfiles.warnings,
  }
}

export function generatedArtifactResultFields(artifact: GeneratedGeometryArtifact) {
  return {
    artifact,
    sourceTool: artifact.sourceTool,
    sourceArgs: artifact.sourceArgs,
    geometryBrief: artifact.geometryBrief,
    shapes: artifact.shapes,
    transforms: artifact.transforms,
    shapeCount: artifact.shapes.length,
  }
}

export function profileRouteBaseResult(input: {
  contextDecision: GeometryContextDecision
  analysis: string
  results: string[]
  lastContent: string
  artifact: GeneratedGeometryArtifact
  routeMetrics: PrimitiveRouteMetrics
  loadedDeviceProfiles: Awaited<ReturnType<typeof loadDeviceProfiles>>
}) {
  const profileSources = deviceProfileSourceSummary(input.loadedDeviceProfiles)
  return {
    contextDecision: input.contextDecision,
    analysis: input.analysis,
    results: input.results,
    lastContent: input.lastContent,
    ...generatedArtifactResultFields(input.artifact),
    metrics: {
      primitiveRoute: input.routeMetrics,
      deviceProfiles: profileSources,
    },
    profileSources,
  }
}

export function editableProfileSummary(profile: DeviceProfileDefinition) {
  return {
    id: profile.id,
    name: profile.name,
    source: profile.source,
    sourcePack: profile.sourcePack,
    industry: profile.industry,
    family: profile.family,
    layoutFamily: profile.layoutFamily,
    layoutTemplate: profile.layoutTemplate,
    editableSchemaRef: profile.editableSchemaRef,
    primarySemanticRole: profile.primarySemanticRole,
  }
}

export function deterministicProfileSummary(profile: DeviceProfileDefinition) {
  return {
    id: profile.id,
    name: profile.name,
    source: profile.source,
    sourcePack: profile.sourcePack,
    industry: profile.industry,
    overrodeBuiltin: profile.overrides?.some((entry) => entry.source === 'builtin') === true,
    overrides: profile.overrides,
    family: profile.family,
    layoutFamily: profile.layoutFamily,
    layoutTemplate: profile.layoutTemplate,
    partPresets: profile.partPresets,
    proportionRules: profile.proportionRules,
    qualityRules: profile.qualityRules,
    primarySemanticRole: profile.primarySemanticRole,
  }
}
