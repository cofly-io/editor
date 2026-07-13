import {
  evaluateDeviceProfileQuality,
  inferDeviceProfileDefinition,
} from '@pascal-app/core/lib/device-profile-registry'
import { callConfiguredAi } from '@/lib/ai-provider'
import {
  type AiChatHarnessMessage,
  buildGeometryAnalysisContext,
  buildGeometryContextResolverPrompt,
  buildGeometryHarnessContext,
  buildPrimitiveRepairRetryMessages,
  DEFAULT_PRIMITIVE_REPAIR_STAGNATION_LIMIT,
  type GeometryContextDecision,
  INITIAL_PRIMITIVE_REPAIR_STAGNATION_STATE,
  inferCreateIntentFromBlueprint,
  nextPrimitiveRepairStagnationState,
  PRIMITIVE_STAGE1_ANALYST_PROMPT,
  PRIMITIVE_STAGE2_GENERATOR_PROMPT,
  type PrimitiveRepairRetryMessage,
  planGeometryIntent,
  primitiveRepairCallBudget,
} from '../../../../packages/editor/src/lib/ai-chat-harness'
import type { GeneratedGeometryArtifact } from '../../../../packages/editor/src/lib/ai-generated-geometry-core'
import { persistDeviceProfileCandidateFromArtifact } from '../device-profile-candidates'
import { loadDeviceProfiles } from '../device-profiles'
import { type IndustryPackRef, resolveIndustryPackDir } from './industry-factory-knowledge'
import { basicPrimitiveDeterministicRoute } from './primitive-basic-routes'
import { precisionPartDeterministicRoute } from './primitive-precision-routes'
import {
  artifactShapesForProfileQuality,
  buildProfileRouteArgs,
  isSafeDeterministicProfileMatch,
  profileForArtifact,
  profileForEditableRevision,
  shouldUseDeterministicProfileRoute,
} from './primitive-profile-routing'
import {
  CONTEXT_RESOLVER_SYSTEM_PROMPT,
  ensurePromptInPrimitiveContext,
  extractFirstBalancedJsonObject,
  fallbackContextDecision,
  normalizeToolArgumentsSource,
  parseContextDecision,
} from './primitive-run-context'
import type { PrimitiveRouteMetrics } from './primitive-run-metrics'
import {
  deterministicProfileSummary,
  deviceProfileSourceSummary,
  editableProfileSummary,
  generatedArtifactResultFields,
  profileRouteBaseResult,
} from './primitive-run-results'
import { applyStage3QualityGate } from './primitive-stage3-gate'
import { stage3QualityReview } from './primitive-stage3-quality'
import {
  type ComposeTool,
  chooseGeometryToolCall,
  executePrimitiveGeometryTool,
  type PartBlueprint,
  PRIMITIVE_TOOLS,
  parseToolArguments,
  summarizeToolCalls,
  type ToolCall,
} from './primitive-tool-execution'
import {
  applyProfileEditablePatchToArgs,
  resolveProfileEditablePatch,
} from './profile-editable-patches'
import {
  buildResourceSelectionMessage,
  recommendedResourceCandidateId,
  resourceCandidateOptions,
} from './resource-candidate-presentation'
import { resolveProfileResourceCandidates } from './resource-profile-resolver'
import { appendRunEvent, isTerminalStatus, loadRun, updateRun } from './run-store'

export { basicPrimitiveDeterministicRoute } from './primitive-basic-routes'
export { precisionPartDeterministicRoute } from './primitive-precision-routes'
export { isSafeDeterministicProfileMatch } from './primitive-profile-routing'
export {
  ensurePromptInPrimitiveContext,
  stripNegatedTargetClauses,
} from './primitive-run-context'
export {
  polishStage3SemanticArtifact,
  repairStage3SemanticArtifact,
  stage3QualityReview,
} from './primitive-stage3-quality'

type ApiMessage = {
  role: string
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  tool_call_id?: string
  tool_calls?: unknown
}

type TextApiMessage = ApiMessage & PrimitiveRepairRetryMessage

const runningRuns = new Set<string>()
const activeControllers = new Map<string, AbortController>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractBlueprintFromAnalysis(analysis: string): PartBlueprint | null {
  const match = analysis.match(/```json\s*([\s\S]*?)\s*```/i)
  const source =
    match?.[1] ?? extractFirstBalancedJsonObject(normalizeToolArgumentsSource(analysis))
  if (!source) return null
  try {
    const parsed = JSON.parse(source)
    if (!isRecord(parsed) || typeof parsed.route !== 'string') return null
    if (
      parsed.route !== 'revise_geometry' &&
      !Array.isArray(parsed.parts) &&
      typeof parsed.category !== 'string'
    ) {
      return null
    }
    return parsed as PartBlueprint
  } catch {
    return null
  }
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Primitive generation cancelled', 'AbortError')
}

async function markRunCancelled(runId: string, message = 'cancelled') {
  const run = await loadRun(runId)
  if (!run || isTerminalStatus(run.status)) return
  await updateRun(runId, {
    status: 'cancelled',
    completedAt: new Date().toISOString(),
    error: message,
  })
  await appendRunEvent(runId, {
    type: 'status',
    message,
    data: { status: 'cancelled' },
  })
}

async function completeRunWithResult(runId: string, result: Record<string, unknown>) {
  await appendRunEvent(runId, { type: 'result', data: result })
  await finishRunWithStatus(runId, 'succeeded', result)
}

async function finishRunWithStatus(
  runId: string,
  status: 'succeeded' | 'failed',
  result: Record<string, unknown>,
  error?: string,
) {
  await updateRun(runId, {
    status,
    completedAt: new Date().toISOString(),
    ...(error ? { error } : {}),
    result,
  })
  await appendRunEvent(runId, {
    type: 'status',
    message: status,
    data: { status },
  })
}

async function shouldStopRun(runId: string, signal: AbortSignal) {
  if (signal.aborted) return true
  const run = await loadRun(runId)
  return !run || run.status === 'cancelled'
}

async function callAi(
  apiMessages: ApiMessage[],
  tools: ComposeTool[] | undefined,
  signal: AbortSignal,
) {
  throwIfAborted(signal)
  const body = {
    messages: apiMessages,
    ...(tools?.length ? { tools, tool_choice: 'auto' as const } : {}),
    max_tokens: 4096,
  }
  const { res, text } = await callConfiguredAi(body, signal)
  throwIfAborted(signal)
  if (!res.ok) {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 300)
    const isHtml = /^\s*</.test(text)
    throw new Error(
      `${res.status} ${res.statusText}${
        isHtml
          ? ': AI upstream returned an HTML error page. Check ANTHROPIC_BASE_URL / ANTHROPIC_MESSAGES_URL and provider availability.'
          : preview
            ? `: ${preview}`
            : ''
      }`,
    )
  }
  const data = JSON.parse(text)
  const message = data.choices?.[0]?.message
  if (!message) throw new Error('Empty response from AI.')
  return message as ApiResponseMessage
}

function contextRecord(value: unknown) {
  return isRecord(value) ? value : {}
}

function stringFromContext(context: Record<string, unknown>, key: string) {
  const value = context[key]
  return typeof value === 'string' ? value : undefined
}

function industryPackRefFromContext(context: Record<string, unknown>): IndustryPackRef | undefined {
  const value = context.industrySourcePack
  if (!isRecord(value)) return undefined
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : undefined
  const version =
    typeof value.version === 'string' && value.version.trim() ? value.version.trim() : undefined
  const industry =
    typeof value.industry === 'string' && value.industry.trim() ? value.industry.trim() : undefined
  if (!id || !version) return undefined
  return { id, version, ...(industry ? { industry } : {}) }
}

function inferredIndustryPackRefsFromPrompt(prompt: string): IndustryPackRef[] {
  if (
    /(\u56de\u8f6c\u7a91|\u6c34\u6ce5\u56de\u8f6c\u7a91|\u6c34\u6ce5\u7a91|rotary[_\s-]?kiln|cement[_\s-]?kiln)/i.test(
      prompt,
    )
  ) {
    return [{ id: 'industry.cement.basic', version: '0.1.0', industry: 'cement' }]
  }
  return []
}

function uniqueDeviceProfilePackDirs(refs: readonly IndustryPackRef[]) {
  const dirs: string[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    const dir = resolveIndustryPackDir(ref)
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    dirs.push(dir)
  }
  return dirs
}

function latestArtifactFromContext(context: Record<string, unknown>, key = 'latestArtifact') {
  const value = context[key]
  return isRecord(value) ? (value as unknown as GeneratedGeometryArtifact) : null
}

function harnessMessagesFromContext(context: Record<string, unknown>): AiChatHarnessMessage[] {
  const value = context.recentMessages
  if (!Array.isArray(value)) return []
  return value.flatMap((message) => {
    if (!isRecord(message)) return []
    const role = typeof message.role === 'string' ? message.role : undefined
    const content = typeof message.content === 'string' ? message.content : undefined
    if (!role || content == null) return []
    return [
      {
        role,
        content,
        isToolResult: message.isToolResult === true,
        geometryArtifact: isRecord(message.geometryArtifact)
          ? (message.geometryArtifact as unknown as GeneratedGeometryArtifact)
          : undefined,
      },
    ]
  })
}

async function resolveGeometryContextDecision({
  messages,
  latestArtifact,
  userPrompt,
  signal,
}: {
  messages: readonly AiChatHarnessMessage[]
  latestArtifact: GeneratedGeometryArtifact | null
  userPrompt: string
  signal: AbortSignal
}): Promise<GeometryContextDecision> {
  if (!latestArtifact) return fallbackContextDecision(userPrompt, latestArtifact)
  try {
    const response = await callAi(
      [
        { role: 'system', content: CONTEXT_RESOLVER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildGeometryContextResolverPrompt({
            messages,
            latestArtifact,
            userRequest: userPrompt,
          }),
        },
      ],
      undefined,
      signal,
    )
    return parseContextDecision(response.content ?? '')
  } catch {
    return fallbackContextDecision(userPrompt, latestArtifact)
  }
}

async function executeDirectGeometryRoute(input: {
  runId: string
  toolName: string
  args: Record<string, unknown>
  userPrompt: string
  revisionTarget: GeneratedGeometryArtifact | null
  blueprint: PartBlueprint | null
  loadedDeviceProfiles?: Awaited<ReturnType<typeof loadDeviceProfiles>>
  signal: AbortSignal
  progressRoute: string
  progressResults: string[]
  toolCallData?: Record<string, unknown>
  toolResultData?: Record<string, unknown>
}) {
  await appendRunEvent(input.runId, {
    type: 'tool-call',
    message: input.toolName,
    data: {
      name: input.toolName,
      arguments: input.args,
      ...input.toolCallData,
    },
  })
  throwIfAborted(input.signal)
  const result = executePrimitiveGeometryTool(
    input.toolName,
    input.args,
    input.userPrompt,
    input.revisionTarget,
    input.blueprint,
    input.loadedDeviceProfiles,
  )
  await appendRunEvent(input.runId, {
    type: 'tool-result',
    message: result.content,
    data: {
      name: input.toolName,
      artifact: result.artifact,
      ...input.toolResultData,
    },
  })
  await appendRunEvent(input.runId, {
    type: 'progress',
    message: result.content,
    data: {
      stage: 'generate',
      route: input.progressRoute,
      results: input.progressResults.length
        ? [...input.progressResults, result.content]
        : [result.content],
      artifact: result.artifact,
    },
  })
  return result
}

async function executeStage2GeometryCall(input: {
  runId: string
  call: ToolCall
  args: Record<string, unknown>
  userPrompt: string
  revisionTarget: GeneratedGeometryArtifact | null
  blueprint: PartBlueprint | null
  loadedDeviceProfiles: Awaited<ReturnType<typeof loadDeviceProfiles>>
  routeMetrics: PrimitiveRouteMetrics
  signal: AbortSignal
  results: string[]
  toolResultMessages: ApiMessage[]
}): Promise<GeneratedGeometryArtifact | undefined> {
  await appendRunEvent(input.runId, {
    type: 'tool-call',
    message: input.call.function.name,
    data: { name: input.call.function.name, arguments: input.args },
  })
  throwIfAborted(input.signal)
  const result = executePrimitiveGeometryTool(
    input.call.function.name,
    input.args,
    input.userPrompt,
    input.revisionTarget,
    input.blueprint,
    input.loadedDeviceProfiles,
  )
  input.toolResultMessages.push({
    role: 'tool',
    tool_call_id: input.call.id,
    content: result.content,
  })
  input.results.push(result.content)
  await appendRunEvent(input.runId, {
    type: 'tool-result',
    message: result.content,
    data: { name: input.call.function.name, artifact: result.artifact },
  })
  if (!result.artifact) return undefined

  const stage3 = await applyStage3QualityGate({
    runId: input.runId,
    userPrompt: input.userPrompt,
    artifact: result.artifact,
    revisionTarget: input.revisionTarget,
    loadedDeviceProfiles: input.loadedDeviceProfiles,
    routeMetrics: input.routeMetrics,
    signal: input.signal,
  })
  if (stage3.content) input.results.push(stage3.content)
  if (stage3.accepted) return stage3.artifact

  input.toolResultMessages.push({
    role: 'tool',
    tool_call_id: input.call.id,
    content:
      stage3.content ?? 'Stage3 semantic quality gate failed. Call one replacement geometry tool.',
  })
  return undefined
}

async function runDeterministicPreflightRoute(input: {
  runId: string
  userPrompt: string
  revisionTarget: GeneratedGeometryArtifact | null
  contextDecision: GeometryContextDecision
  signal: AbortSignal
  label: string
  family: string
  component?: string
  toolName: string
  args: Record<string, unknown>
  progressRoute: string
  analysis: string
  fallbackMessage: string
  loadedDeviceProfiles?: Awaited<ReturnType<typeof loadDeviceProfiles>>
}) {
  const routeMetrics: PrimitiveRouteMetrics = {
    route: 'deterministic',
    stage1HasBlueprint: false,
    deterministicIntent: true,
    deterministicAttempted: true,
    deterministicSucceeded: false,
    stage2Called: false,
    family: input.family,
    component: input.component,
    deterministicTool: input.toolName,
    stage2ToolCallCount: 0,
    repairCallCount: 0,
  }
  await appendRunEvent(input.runId, {
    type: 'message',
    message: input.analysis,
    data: {
      stage: 'deterministic-preflight',
      intent: input.label,
      tool: input.toolName,
    },
  })
  const directResult = await executeDirectGeometryRoute({
    runId: input.runId,
    toolName: input.toolName,
    args: input.args,
    userPrompt: input.userPrompt,
    revisionTarget: input.revisionTarget,
    blueprint: null,
    loadedDeviceProfiles: input.loadedDeviceProfiles,
    signal: input.signal,
    progressRoute: input.progressRoute,
    progressResults: [],
    toolCallData: { deterministic: true },
    toolResultData: { deterministic: true },
  })

  if (!directResult.artifact) {
    routeMetrics.fallbackReason = 'direct_execution_no_artifact'
    await appendRunEvent(input.runId, {
      type: 'message',
      message: input.fallbackMessage,
      data: { stage: 'deterministic-preflight', primitiveRoute: routeMetrics },
    })
    return false
  }

  routeMetrics.deterministicSucceeded = true
  const stage3Review = stage3QualityReview(input.userPrompt, directResult.artifact)
  routeMetrics.stage3QualityScore = stage3Review.score
  routeMetrics.stage3Passed = stage3Review.passed
  routeMetrics.stage3Issues = stage3Review.issues
  routeMetrics.stage3Warnings = stage3Review.warnings
  if (await shouldStopRun(input.runId, input.signal)) return true

  const deviceProfileMetrics = input.loadedDeviceProfiles
    ? {
        count: input.loadedDeviceProfiles.profiles.length,
        warnings: input.loadedDeviceProfiles.warnings,
      }
    : undefined
  const result = {
    contextDecision: input.contextDecision,
    analysis: input.analysis,
    results: [directResult.content],
    lastContent: input.analysis,
    artifact: directResult.artifact,
    sourceTool: directResult.artifact.sourceTool,
    sourceArgs: directResult.artifact.sourceArgs,
    geometryBrief: directResult.artifact.geometryBrief,
    shapes: directResult.artifact.shapes,
    transforms: directResult.artifact.transforms,
    shapeCount: directResult.artifact.shapes.length,
    metrics: {
      primitiveRoute: routeMetrics,
      ...(deviceProfileMetrics ? { deviceProfiles: deviceProfileMetrics } : {}),
    },
    ...(deviceProfileMetrics ? { profileSources: deviceProfileMetrics } : {}),
  }
  await appendRunEvent(input.runId, {
    type: 'message',
    message: 'Primitive route metrics',
    data: { stage: 'route-metrics', primitiveRoute: routeMetrics },
  })
  await completeRunWithResult(input.runId, result)
  return true
}

async function completeResourceSelectionRun(input: {
  runId: string
  userPrompt: string
  contextDecision: GeometryContextDecision
  selectionMessage: string
  recommendedCandidateId?: string
  resourceCandidates: ReturnType<typeof resourceCandidateOptions>
  loadedDeviceProfiles: Awaited<ReturnType<typeof loadDeviceProfiles>>
}) {
  const analysis = [
    'Resource resolver found multiple matching device profiles.',
    'No geometry was created because the request is ambiguous at the resource-selection step.',
  ].join('\n')
  const result = {
    contextDecision: input.contextDecision,
    analysis,
    results: [input.selectionMessage],
    lastContent: input.selectionMessage,
    needsResourceSelection: true,
    resourceSelection: {
      status: 'needs_selection',
      prompt: input.userPrompt,
      recommendedProfileId: input.recommendedCandidateId,
      candidates: input.resourceCandidates,
    },
    shapeCount: 0,
    metrics: {
      primitiveRoute: {
        route: 'resource-selection',
        deterministicIntent: false,
        deterministicAttempted: false,
        deterministicSucceeded: false,
        stage2Called: false,
        stage2ToolCallCount: 0,
        repairCallCount: 0,
      },
      deviceProfiles: {
        count: input.loadedDeviceProfiles.profiles.length,
        warnings: input.loadedDeviceProfiles.warnings,
      },
    },
    profileSources: {
      count: input.loadedDeviceProfiles.profiles.length,
      warnings: input.loadedDeviceProfiles.warnings,
    },
  }
  await appendRunEvent(input.runId, {
    type: 'message',
    message: input.selectionMessage,
    data: { stage: 'resource-selection', candidates: input.resourceCandidates },
  })
  await completeRunWithResult(input.runId, result)
}

function shouldPersistDeviceProfileCandidate(params: Record<string, unknown> | undefined) {
  return params?.allowDeviceProfileCandidatePersist === true
}

export function ensurePrimitiveRunRunning(runId: string) {
  if (runningRuns.has(runId)) {
    return
  }
  void runPrimitiveRunToCompletion(runId)
}

export async function runPrimitiveRunToCompletion(runId: string) {
  if (runningRuns.has(runId)) {
    throw new Error(`Primitive run is already running: ${runId}`)
  }
  runningRuns.add(runId)
  try {
    await runPrimitiveRun(runId)
    return await loadRun(runId)
  } finally {
    runningRuns.delete(runId)
  }
}

export async function cancelPrimitiveRun(runId: string) {
  activeControllers.get(runId)?.abort()
  await markRunCancelled(runId, 'Geometry generation cancelled')
}

async function runPrimitiveRun(runId: string) {
  const run = await loadRun(runId)
  if (!run || run.mode !== 'primitive' || isTerminalStatus(run.status)) {
    return
  }
  const controller = new AbortController()
  activeControllers.set(runId, controller)

  const startedRun = await updateRun(runId, {
    status: 'running',
    startedAt: run.startedAt ?? new Date().toISOString(),
  })
  if (isTerminalStatus(startedRun.status)) {
    activeControllers.delete(runId)
    return
  }
  await appendRunEvent(runId, { type: 'status', message: 'running', data: { status: 'running' } })

  try {
    const { signal } = controller
    const context = contextRecord(run.context)
    const userPrompt = run.prompt
    const recentMessages = harnessMessagesFromContext(context)
    const latestArtifactCandidate =
      latestArtifactFromContext(context, 'latestArtifactCandidate') ??
      latestArtifactFromContext(context)
    const contextDecision = await resolveGeometryContextDecision({
      messages: recentMessages,
      latestArtifact: latestArtifactCandidate,
      userPrompt,
      signal,
    })
    const revisionTarget =
      contextDecision.contextPolicy === 'include_full_artifact' ? latestArtifactCandidate : null
    const harnessContext =
      latestArtifactCandidate || recentMessages.length
        ? buildGeometryHarnessContext({
            messages: recentMessages,
            latestArtifact: latestArtifactCandidate,
            userRequest: userPrompt,
            contextDecision,
          })
        : ensurePromptInPrimitiveContext(
            userPrompt,
            stringFromContext(context, 'harnessContext') ?? run.prompt,
          )
    const analysisContext =
      latestArtifactCandidate || recentMessages.length
        ? buildGeometryAnalysisContext({
            messages: recentMessages,
            latestArtifact: latestArtifactCandidate,
            userRequest: userPrompt,
            contextDecision,
          })
        : ensurePromptInPrimitiveContext(
            userPrompt,
            stringFromContext(context, 'analysisContext') ?? harnessContext,
          )
    const basicPrimitiveRoute = basicPrimitiveDeterministicRoute(userPrompt, revisionTarget)
    if (basicPrimitiveRoute) {
      const routeAnalysis = `Matched deterministic basic primitive route "${basicPrimitiveRoute.label}" before profile loading and LLM Stage1.`
      const handled = await runDeterministicPreflightRoute({
        runId,
        userPrompt,
        revisionTarget,
        contextDecision,
        signal,
        label: basicPrimitiveRoute.label,
        family: 'basic_primitive',
        component: basicPrimitiveRoute.kind,
        toolName: 'compose_primitive',
        args: basicPrimitiveRoute.args,
        progressRoute: 'deterministic-basic-primitive',
        analysis: routeAnalysis,
        fallbackMessage:
          'Deterministic basic primitive route produced no artifact; falling back to LLM.',
      })
      if (handled) return
    }
    const contextPackRef = industryPackRefFromContext(context)
    const extraPackDirs = uniqueDeviceProfilePackDirs([
      ...(contextPackRef ? [contextPackRef] : []),
      ...inferredIndustryPackRefsFromPrompt(userPrompt),
    ])
    const loadedDeviceProfiles = await loadDeviceProfiles({ extraPackDirs })

    await appendRunEvent(runId, {
      type: 'message',
      message: JSON.stringify(contextDecision),
      data: { stage: 'context-resolver', contextDecision },
    })
    if (loadedDeviceProfiles.warnings.length > 0) {
      await appendRunEvent(runId, {
        type: 'message',
        message: 'Device profile source warnings',
        data: {
          stage: 'device-profiles',
          warnings: loadedDeviceProfiles.warnings,
          profileCount: loadedDeviceProfiles.profiles.length,
          extraPackCount: extraPackDirs.length,
        },
      })
    }

    const editableRevisionProfile = profileForEditableRevision(
      userPrompt,
      latestArtifactCandidate,
      loadedDeviceProfiles.profiles,
    )
    const editablePatch = resolveProfileEditablePatch(
      userPrompt,
      latestArtifactCandidate,
      editableRevisionProfile,
    )
    if (latestArtifactCandidate && editableRevisionProfile && editablePatch) {
      const previousProfile = profileForArtifact(
        latestArtifactCandidate,
        loadedDeviceProfiles.profiles,
      )
      const sourceArgs = isRecord(latestArtifactCandidate.sourceArgs)
        ? latestArtifactCandidate.sourceArgs
        : {}
      const baseArgs =
        previousProfile?.id === editableRevisionProfile.id && Object.keys(sourceArgs).length > 0
          ? { ...sourceArgs }
          : buildProfileRouteArgs(editableRevisionProfile, userPrompt)
      const revisionArgs = applyProfileEditablePatchToArgs(
        {
          ...baseArgs,
          deviceProfile: editableRevisionProfile.id,
          profile: editableRevisionProfile.id,
          profileSource: editableRevisionProfile.source,
          profileSourcePack: editableRevisionProfile.sourcePack,
          profilePackId: editableRevisionProfile.sourcePack?.id,
          profilePackVersion: editableRevisionProfile.sourcePack?.version,
          editableSchemaRef: editableRevisionProfile.editableSchemaRef,
          resolvedEditableSchema: editableRevisionProfile.resolvedEditableSchema,
        },
        editablePatch,
      )
      const routeMetrics: PrimitiveRouteMetrics = {
        route: 'deterministic',
        stage1HasBlueprint: false,
        selectedProfile: editableRevisionProfile.id,
        profileSource: editableRevisionProfile.source,
        ...(editableRevisionProfile.sourcePack
          ? { profilePackId: editableRevisionProfile.sourcePack.id }
          : {}),
        ...(editableRevisionProfile.layoutTemplate
          ? { layoutTemplate: editableRevisionProfile.layoutTemplate }
          : {}),
        overrodeBuiltin:
          editableRevisionProfile.overrides?.some((entry) => entry.source === 'builtin') === true,
        deterministicIntent: true,
        deterministicAttempted: true,
        deterministicSucceeded: false,
        stage2Called: false,
        family: editableRevisionProfile.family,
        deterministicTool: 'compose_parts',
        stage2ToolCallCount: 0,
        repairCallCount: 0,
      }
      const profileAnalysis = [
        `Resolved editable profile patch for "${editableRevisionProfile.id}".`,
        `Patch: ${editablePatch.reason}.`,
        'Using deterministic compose_parts revision route before LLM Stage2.',
      ].join('\n')
      await appendRunEvent(runId, {
        type: 'message',
        message: profileAnalysis,
        data: {
          stage: 'profile-editable-revision',
          selectedProfile: editableRevisionProfile.id,
          patch: editablePatch,
        },
      })
      const directResult = await executeDirectGeometryRoute({
        runId,
        toolName: 'compose_parts',
        args: revisionArgs,
        userPrompt,
        revisionTarget: latestArtifactCandidate,
        blueprint: null,
        loadedDeviceProfiles,
        signal,
        progressRoute: 'profile-editable-revision',
        progressResults: [],
        toolCallData: { deterministic: true, editablePatch },
        toolResultData: { deterministic: true },
      })
      const directResults = [directResult.content]

      if (directResult.artifact) {
        routeMetrics.deterministicSucceeded = true
        const profileQuality = evaluateDeviceProfileQuality(
          editableRevisionProfile,
          artifactShapesForProfileQuality(directResult.artifact),
          { visualScore: 0.82 },
        )
        routeMetrics.profileQualityScore = profileQuality.overallScore
        if (await shouldStopRun(runId, signal)) return
        const result = {
          ...profileRouteBaseResult({
            contextDecision,
            analysis: profileAnalysis,
            results: directResults,
            lastContent: 'Deterministic editable profile revision completed.',
            artifact: directResult.artifact,
            routeMetrics,
            loadedDeviceProfiles,
          }),
          selectedProfile: editableProfileSummary(editableRevisionProfile),
          editablePatch,
          profileQuality,
        }
        await appendRunEvent(runId, {
          type: 'message',
          message: 'Primitive route metrics',
          data: { stage: 'route-metrics', primitiveRoute: routeMetrics },
        })
        await completeRunWithResult(runId, result)
        return
      }
    }

    const resourceResolution = resolveProfileResourceCandidates(
      userPrompt,
      loadedDeviceProfiles.profiles,
    )
    if (resourceResolution.candidates.length > 0) {
      const resourceCandidates = resourceCandidateOptions(resourceResolution.candidates)
      const recommendedCandidateId = recommendedResourceCandidateId(resourceCandidates)
      await appendRunEvent(runId, {
        type: 'message',
        message: resourceResolution.selectedCandidate
          ? `Resource resolver selected "${resourceResolution.selectedCandidate.profile.id}".`
          : 'Resource resolver found multiple candidates but no high-confidence auto-selection.',
        data: {
          stage: 'resource-resolver',
          selectedProfile: resourceResolution.selectedProfile?.id,
          candidates: resourceCandidates,
        },
      })

      if (!resourceResolution.selectedProfile && resourceResolution.candidates.length > 1) {
        const selectionMessage = buildResourceSelectionMessage(resourceCandidates)
        await completeResourceSelectionRun({
          runId,
          userPrompt,
          contextDecision,
          selectionMessage,
          recommendedCandidateId,
          resourceCandidates,
          loadedDeviceProfiles,
        })
        return
      }
    }

    const inferredProfile = inferDeviceProfileDefinition(
      { prompt: userPrompt, name: userPrompt, object: userPrompt },
      loadedDeviceProfiles.profiles,
    )
    const selectedProfile = resourceResolution.selectedProfile ?? inferredProfile
    const safeSelectedProfile =
      resourceResolution.selectedProfile ??
      (selectedProfile && isSafeDeterministicProfileMatch(selectedProfile, userPrompt)
        ? selectedProfile
        : undefined)
    if (selectedProfile && !safeSelectedProfile) {
      await appendRunEvent(runId, {
        type: 'message',
        message: `Skipped low-confidence device profile "${selectedProfile.id}"; falling back to LLM analysis.`,
        data: {
          stage: 'profile-router',
          selectedProfile: selectedProfile.id,
          profileSource: selectedProfile.source,
          reason: 'profile alias was absent, weak, or only appeared in a negated target span',
        },
      })
    }
    if (
      shouldUseDeterministicProfileRoute({
        profile: safeSelectedProfile,
        userPrompt,
        revisionTarget,
        resourceResolved: resourceResolution.selectedProfile?.id === safeSelectedProfile?.id,
      })
    ) {
      const profile = selectedProfile!
      const routeMetrics: PrimitiveRouteMetrics = {
        route: 'profile',
        stage1HasBlueprint: false,
        selectedProfile: profile.id,
        profileSource: profile.source,
        ...(profile.sourcePack ? { profilePackId: profile.sourcePack.id } : {}),
        ...(profile.layoutTemplate ? { layoutTemplate: profile.layoutTemplate } : {}),
        overrodeBuiltin: profile.overrides?.some((entry) => entry.source === 'builtin') === true,
        ...(profile.overrides?.length ? { profileOverrides: [...profile.overrides] } : {}),
        deterministicIntent: true,
        deterministicAttempted: true,
        deterministicSucceeded: false,
        stage2Called: false,
        family: profile.family,
        deterministicTool: 'compose_parts',
        stage2ToolCallCount: 0,
        repairCallCount: 0,
      }
      const profileArgs = buildProfileRouteArgs(profile, userPrompt)
      const profileAnalysis = [
        `Matched device profile "${profile.id}" from ${profile.source}.`,
        profile.sourcePack
          ? `Using resource pack ${profile.sourcePack.id}@${profile.sourcePack.version}.`
          : undefined,
        profile.overrides?.some((entry) => entry.source === 'builtin')
          ? 'This profile overrides a builtin fallback profile.'
          : undefined,
        'Using deterministic compose_parts route before LLM Stage2.',
      ]
        .filter(Boolean)
        .join('\n')

      await appendRunEvent(runId, {
        type: 'message',
        message: profileAnalysis,
        data: {
          stage: 'profile-router',
          selectedProfile: profile.id,
          profileSource: profile.source,
          profilePackId: profile.sourcePack?.id,
          overrodeBuiltin: profile.overrides?.some((entry) => entry.source === 'builtin') === true,
        },
      })
      const directResult = await executeDirectGeometryRoute({
        runId,
        toolName: 'compose_parts',
        args: profileArgs,
        userPrompt,
        revisionTarget,
        blueprint: null,
        loadedDeviceProfiles,
        signal,
        progressRoute: 'profile',
        progressResults: [],
        toolCallData: { deterministic: true },
        toolResultData: { deterministic: true },
      })
      const directResults = [directResult.content]

      if (directResult.artifact) {
        routeMetrics.deterministicSucceeded = true
        const profileQuality = evaluateDeviceProfileQuality(
          profile,
          artifactShapesForProfileQuality(directResult.artifact),
          { visualScore: 0.82 },
        )
        routeMetrics.profileQualityScore = profileQuality.overallScore
        if (await shouldStopRun(runId, signal)) return
        const result = {
          ...profileRouteBaseResult({
            contextDecision,
            analysis: profileAnalysis,
            results: directResults,
            lastContent: 'Deterministic device profile route completed.',
            artifact: directResult.artifact,
            routeMetrics,
            loadedDeviceProfiles,
          }),
          selectedProfile: deterministicProfileSummary(profile),
          profileQuality,
        }
        await appendRunEvent(runId, {
          type: 'message',
          message: 'Primitive route metrics',
          data: { stage: 'route-metrics', primitiveRoute: routeMetrics },
        })
        await completeRunWithResult(runId, result)
        return
      }

      routeMetrics.fallbackReason = 'profile_no_artifact'
      await appendRunEvent(runId, {
        type: 'message',
        message: 'Profile route produced no artifact; falling back to Stage1/Stage2.',
        data: { stage: 'profile-router', primitiveRoute: routeMetrics },
      })
    }

    const preflightPrecisionRoute = precisionPartDeterministicRoute(userPrompt, revisionTarget)
    if (preflightPrecisionRoute) {
      const routeAnalysis = `Matched deterministic precision route "${preflightPrecisionRoute.label}" before LLM Stage1.`
      const handled = await runDeterministicPreflightRoute({
        runId,
        userPrompt,
        revisionTarget,
        contextDecision,
        signal,
        label: preflightPrecisionRoute.label,
        family: preflightPrecisionRoute.family,
        toolName: 'compose_parts',
        args: preflightPrecisionRoute.args,
        loadedDeviceProfiles,
        progressRoute: 'deterministic-precision-preflight',
        analysis: routeAnalysis,
        fallbackMessage:
          'Deterministic precision route produced no artifact; falling back to Stage1/Stage2.',
      })
      if (handled) return
    }

    await appendRunEvent(runId, { type: 'progress', message: 'Analyzing geometry request...' })
    const analysisResponse = await callAi(
      [
        { role: 'system', content: PRIMITIVE_STAGE1_ANALYST_PROMPT },
        { role: 'user', content: analysisContext },
      ],
      undefined,
      signal,
    )
    const analysis = analysisResponse.content ?? ''
    const blueprint = extractBlueprintFromAnalysis(analysis)
    throwIfAborted(signal)
    await appendRunEvent(runId, { type: 'message', message: analysis, data: { stage: 'analysis' } })

    const routeMetrics: PrimitiveRouteMetrics = {
      route: 'stage2_fallback',
      stage1HasBlueprint: Boolean(blueprint),
      deterministicIntent: false,
      deterministicAttempted: false,
      deterministicSucceeded: false,
      stage2Called: false,
      fallbackReason: blueprint ? 'no_deterministic_intent' : 'no_blueprint',
      stage2ToolCallCount: 0,
      repairCallCount: 0,
    }
    const deterministicResults: string[] = []
    let deterministicLastContent = ''
    const precisionPartRoute = precisionPartDeterministicRoute(userPrompt, revisionTarget)
    if (precisionPartRoute) {
      routeMetrics.deterministicIntent = true
      routeMetrics.fallbackReason = undefined
      routeMetrics.family = precisionPartRoute.family
      routeMetrics.deterministicTool = 'compose_parts'
      deterministicLastContent = `Deterministic precision part route planned ${precisionPartRoute.label}.`
      await appendRunEvent(runId, {
        type: 'message',
        message: deterministicLastContent,
        data: {
          stage: 'deterministic-plan',
          intent: precisionPartRoute.label,
          tool: 'compose_parts',
          issues: [],
        },
      })

      routeMetrics.deterministicAttempted = true
      const directResult = await executeDirectGeometryRoute({
        runId,
        toolName: 'compose_parts',
        args: precisionPartRoute.args,
        userPrompt,
        revisionTarget,
        blueprint: null,
        loadedDeviceProfiles,
        signal,
        progressRoute: 'deterministic-precision-part',
        progressResults: deterministicResults,
        toolCallData: { deterministic: true },
        toolResultData: { deterministic: true },
      })
      deterministicResults.push(directResult.content)

      if (directResult.artifact) {
        routeMetrics.route = 'deterministic'
        routeMetrics.deterministicSucceeded = true
        if (await shouldStopRun(runId, signal)) return
        const result = {
          contextDecision,
          analysis,
          results: deterministicResults,
          lastContent: deterministicLastContent,
          artifact: directResult.artifact,
          metrics: {
            primitiveRoute: routeMetrics,
            deviceProfiles: {
              count: loadedDeviceProfiles.profiles.length,
              warnings: loadedDeviceProfiles.warnings,
            },
          },
        }
        await appendRunEvent(runId, {
          type: 'message',
          message: 'Primitive route metrics',
          data: { stage: 'route-metrics', primitiveRoute: routeMetrics },
        })
        await appendRunEvent(runId, { type: 'result', data: result })
        await updateRun(runId, {
          status: 'succeeded',
          completedAt: new Date().toISOString(),
          result,
        })
        await appendRunEvent(runId, {
          type: 'status',
          message: 'succeeded',
          data: { status: 'succeeded' },
        })
        return
      }
      routeMetrics.fallbackReason = 'direct_execution_no_artifact'
    }
    const deterministicCreateIntent = blueprint
      ? inferCreateIntentFromBlueprint('compose_parts', {}, blueprint, userPrompt)
      : undefined
    if (deterministicCreateIntent) {
      routeMetrics.deterministicIntent = true
      routeMetrics.fallbackReason = undefined
      routeMetrics.family = deterministicCreateIntent.family
      routeMetrics.component = deterministicCreateIntent.component
      const plan = planGeometryIntent(deterministicCreateIntent, { revisionTarget })
      routeMetrics.deterministicTool = plan.tool
      routeMetrics.plannerIssues = plan.issues
      deterministicLastContent = `Deterministic geometry intent planned ${plan.tool}.`
      await appendRunEvent(runId, {
        type: 'message',
        message: deterministicLastContent,
        data: {
          stage: 'deterministic-plan',
          intent: deterministicCreateIntent,
          tool: plan.tool,
          issues: plan.issues,
          metadata: plan.action === 'create' ? plan.metadata : undefined,
        },
      })

      if (plan.issues.length === 0) {
        routeMetrics.deterministicAttempted = true
        const plannedArgs = {
          ...plan.args,
          geometryIntent: deterministicCreateIntent,
        }
        const directResult = await executeDirectGeometryRoute({
          runId,
          toolName: plan.tool,
          args: plannedArgs,
          userPrompt,
          revisionTarget,
          blueprint,
          loadedDeviceProfiles,
          signal,
          progressRoute: 'deterministic-intent',
          progressResults: deterministicResults,
          toolCallData: { deterministic: true },
          toolResultData: { deterministic: true },
        })
        deterministicResults.push(directResult.content)

        if (directResult.artifact) {
          routeMetrics.route = 'deterministic'
          routeMetrics.deterministicSucceeded = true
          const candidatePersist = await persistDeviceProfileCandidateFromArtifact(
            userPrompt,
            directResult.artifact,
            { enabled: shouldPersistDeviceProfileCandidate(run.params) },
          )
          await appendRunEvent(runId, {
            type: 'message',
            message: candidatePersist.saved
              ? 'Device profile candidate saved'
              : 'Device profile candidate not saved',
            data: { stage: 'device-profile-candidate', candidatePersist },
          })
          if (await shouldStopRun(runId, signal)) return
          const result = {
            contextDecision,
            analysis,
            results: deterministicResults,
            lastContent: deterministicLastContent,
            artifact: directResult.artifact,
            deviceProfileCandidate: candidatePersist,
            metrics: {
              primitiveRoute: routeMetrics,
              deviceProfiles: {
                count: loadedDeviceProfiles.profiles.length,
                warnings: loadedDeviceProfiles.warnings,
              },
            },
          }
          await appendRunEvent(runId, {
            type: 'message',
            message: 'Primitive route metrics',
            data: { stage: 'route-metrics', primitiveRoute: routeMetrics },
          })
          await appendRunEvent(runId, { type: 'result', data: result })
          await updateRun(runId, {
            status: 'succeeded',
            completedAt: new Date().toISOString(),
            result,
          })
          await appendRunEvent(runId, {
            type: 'status',
            message: 'succeeded',
            data: { status: 'succeeded' },
          })
          return
        }
        routeMetrics.fallbackReason = 'direct_execution_no_artifact'
      } else {
        routeMetrics.fallbackReason = 'planner_issues'
        deterministicResults.push(
          [
            'Deterministic geometry intent could not be planned; falling back to Stage2 generator.',
            ...plan.issues.map((issue) => `- ${issue}`),
          ].join('\n'),
        )
      }
    }

    routeMetrics.stage2Called = true
    await appendRunEvent(runId, {
      type: 'message',
      message: 'Primitive route metrics',
      data: { stage: 'route-metrics', primitiveRoute: routeMetrics },
    })
    await appendRunEvent(runId, { type: 'progress', message: 'Generating editable geometry...' })
    const baseGenMessages: TextApiMessage[] = [
      { role: 'system', content: PRIMITIVE_STAGE2_GENERATOR_PROMPT },
      {
        role: 'user',
        content: blueprint
          ? [
              `User request: ${harnessContext}`,
              '',
              blueprint.route === 'revise_geometry'
                ? [
                    'Analysis determined this is a revision. Call revise_geometry based on the context above.',
                    `Blueprint: ${JSON.stringify(blueprint)}`,
                  ].join('\n')
                : [
                    `Part blueprint from analysis (route: ${blueprint.route}):`,
                    JSON.stringify(blueprint, null, 2),
                    '',
                    blueprint.route === 'compose_assembly'
                      ? 'Call compose_assembly with family, object, constraints from blueprint.constraints, and category. Do not use the parts array for compose_assembly.'
                      : blueprint.route === 'compose_recipe'
                        ? 'Call compose_recipe with the appropriate recipeId derived from blueprint.category and blueprint.constraints.'
                        : [
                            'Translate the blueprint parts array into compose_parts arguments.',
                            'Keep relationship fields such as alignAbove, alignBeside, centeredOn, connectTo, around, and array as-is.',
                            'Do not invent raw position coordinates; let relationship fields drive layout.',
                            'Add dimensions and colors from blueprint.constraints and put category/requiredRoles into geometryBrief.',
                          ].join('\n'),
                  ].join('\n'),
              '',
              'Output exactly one tool call.',
            ].join('\n')
          : [
              `User request: ${harnessContext}`,
              '',
              `Analysis:`,
              analysis,
              '',
              'Now call the best available tool based on this analysis. Output exactly one tool call.',
            ].join('\n'),
      },
    ]
    let genMessages = baseGenMessages
    // Fallback messages without blueprint, used if blueprint-driven repairs stagnate
    const fallbackGenMessages: TextApiMessage[] = blueprint
      ? [
          { role: 'system', content: PRIMITIVE_STAGE2_GENERATOR_PROMPT },
          {
            role: 'user',
            content: [
              `User request: ${harnessContext}`,
              '',
              `Analysis:`,
              analysis,
              '',
              'Now call the best available tool based on this analysis. Output exactly one tool call.',
            ].join('\n'),
          },
        ]
      : baseGenMessages

    let response = await callAi(genMessages, PRIMITIVE_TOOLS, signal)
    let artifact: GeneratedGeometryArtifact | undefined
    let lastContent = response.content ?? deterministicLastContent
    const results: string[] = [...deterministicResults]
    const repairCallBudget = primitiveRepairCallBudget({
      userPrompt,
      harnessContext,
      hasRevisionTarget: Boolean(revisionTarget),
    })
    const maxToolExecutionAttempts = 1 + repairCallBudget
    let stagnationState = INITIAL_PRIMITIVE_REPAIR_STAGNATION_STATE

    for (let attempt = 1; attempt <= maxToolExecutionAttempts; attempt += 1) {
      throwIfAborted(signal)
      const toolCalls = response.tool_calls ?? []
      if (toolCalls.length === 0) break
      routeMetrics.stage2ToolCallCount += toolCalls.length

      const toolResultMessages: ApiMessage[] = []
      const selectedGeometryCall = chooseGeometryToolCall(toolCalls)

      if (!selectedGeometryCall) {
        const result = [
          'Invalid generation plan. Nothing was created.',
          'Call exactly ONE geometry tool for the complete object.',
        ].join('\n')
        for (const call of toolCalls) {
          toolResultMessages.push({ role: 'tool', tool_call_id: call.id, content: result })
        }
        results.push(result)
      } else {
        for (const call of toolCalls) {
          if (call.id !== selectedGeometryCall.id) {
            const result = `Ignored extra tool call "${call.function.name}" because one complete geometry tool call was already selected.`
            toolResultMessages.push({ role: 'tool', tool_call_id: call.id, content: result })
            continue
          }
          let args: Record<string, unknown>
          try {
            args = parseToolArguments(call.function.arguments)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const result = `Invalid tool arguments JSON. Nothing was created.\n${message}`
            toolResultMessages.push({ role: 'tool', tool_call_id: call.id, content: result })
            results.push(result)
            continue
          }
          const geometryIntent = inferCreateIntentFromBlueprint(
            call.function.name,
            args,
            blueprint,
            userPrompt,
          )
          if (geometryIntent) args.geometryIntent = geometryIntent
          const acceptedArtifact = await executeStage2GeometryCall({
            runId,
            call,
            args,
            userPrompt,
            revisionTarget,
            blueprint,
            loadedDeviceProfiles,
            routeMetrics,
            signal,
            results,
            toolResultMessages,
          })
          if (acceptedArtifact) {
            artifact = acceptedArtifact
          }
        }
      }

      await appendRunEvent(runId, {
        type: 'progress',
        message: results.at(-1) ?? 'Geometry tool executed.',
        data: { stage: 'generate', results, artifact },
      })

      if (artifact) {
        break
      }

      const repairCallNumber = attempt
      if (repairCallNumber > repairCallBudget) {
        results.push(
          `Stopped after ${repairCallBudget} repair call${
            repairCallBudget === 1 ? '' : 's'
          } without creating valid geometry.`,
        )
        break
      }
      routeMetrics.repairCallCount = repairCallNumber

      const failureResults = toolResultMessages.map((message) => String(message.content))
      stagnationState = nextPrimitiveRepairStagnationState(stagnationState, failureResults)
      if (stagnationState.stagnantAttempts >= DEFAULT_PRIMITIVE_REPAIR_STAGNATION_LIMIT) {
        results.push(
          [
            'Stopped geometry repair early because repeated attempts returned the same failure signature.',
            `Repeated stagnant failures: ${stagnationState.stagnantAttempts}.`,
            'Ask the model/user for a different construction strategy instead of repeating the same invalid tool call.',
          ].join('\n'),
        )
        break
      }

      genMessages = buildPrimitiveRepairRetryMessages({
        // After first repair failure with a blueprint, fall back to harnessContext + analysis
        // so subsequent repairs aren't constrained by a potentially invalid blueprint
        baseMessages: blueprint && repairCallNumber > 1 ? fallbackGenMessages : baseGenMessages,
        repairCallNumber,
        repairCallBudget,
        failedToolSummary: summarizeToolCalls(toolCalls),
        failureResults,
      })
      response = await callAi(genMessages, PRIMITIVE_TOOLS, signal)
      if (response.content) lastContent = response.content
    }

    if (await shouldStopRun(runId, signal)) return
    const candidatePersist = await persistDeviceProfileCandidateFromArtifact(userPrompt, artifact, {
      enabled: shouldPersistDeviceProfileCandidate(run.params),
    })
    await appendRunEvent(runId, {
      type: 'message',
      message: candidatePersist.saved
        ? 'Device profile candidate saved'
        : 'Device profile candidate not saved',
      data: { stage: 'device-profile-candidate', candidatePersist },
    })
    const result = {
      contextDecision,
      analysis,
      results,
      lastContent,
      artifact,
      deviceProfileCandidate: candidatePersist,
      ...(artifact ? generatedArtifactResultFields(artifact) : {}),
      metrics: { primitiveRoute: routeMetrics },
      profileSources: deviceProfileSourceSummary(loadedDeviceProfiles),
    }
    await appendRunEvent(runId, {
      type: 'message',
      message: 'Primitive route metrics',
      data: { stage: 'route-metrics', primitiveRoute: routeMetrics },
    })
    await appendRunEvent(runId, { type: 'result', data: result })
    if (!artifact) {
      const message =
        results.at(-1) ??
        'Geometry generation completed without creating an editable geometry artifact.'
      await finishRunWithStatus(runId, 'failed', result, message)
      return
    }
    await finishRunWithStatus(runId, 'succeeded', result)
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      await markRunCancelled(runId, 'Geometry generation cancelled')
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    await appendRunEvent(runId, { type: 'error', message })
    await updateRun(runId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: message,
    })
    await appendRunEvent(runId, { type: 'status', message: 'failed', data: { status: 'failed' } })
  } finally {
    activeControllers.delete(runId)
  }
}
