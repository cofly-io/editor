import { promises as fs } from 'node:fs'
import path from 'node:path'
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
  isLikelyGeometryRevisionRequest,
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
import { generateAssetComponentArtifact } from './asset-component-generator-runner'
import { GENERATION_VERSIONS } from './generation-versions'
import { DSL_AUTHOR_PROMPT_VERSION, runDslSourceLoop } from './generator-dsl-llm-loop'
import {
  applyRouteDecisionToMetrics,
  resolveRunGenerationMode,
  routeDecisionEventData,
} from './generator-dsl-route-binding'
import {
  type DslRunResult,
  executeGeneratorDslRun,
  summarizeDslRunForEvents,
} from './generator-dsl-run'
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
import { appendRunEvent, isTerminalStatus, loadRun, runDir, updateRun } from './run-store'

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

function assetComponentGeneratorForProfile(profile: {
  layoutHints?: Record<string, unknown>
  defaultDimensions?: { length?: number; width?: number; height?: number }
}) {
  const generator = profile.layoutHints?.assetComponentGenerator
  if (!isRecord(generator)) return undefined
  const componentPack =
    typeof generator.componentPack === 'string' ? generator.componentPack : undefined
  const generatorId = typeof generator.generator === 'string' ? generator.generator : undefined
  if (!componentPack || !generatorId) return undefined
  return {
    componentPack,
    generator: generatorId,
    params: isRecord(generator.params) ? generator.params : {},
    expectedDimensions: profile.defaultDimensions,
  }
}

async function executeAssetComponentGeneratorRoute(input: {
  runId: string
  userPrompt: string
  profile: {
    id: string
    name: string
    layoutHints?: Record<string, unknown>
    defaultDimensions?: { length?: number; width?: number; height?: number }
  }
  signal: AbortSignal
  progressRoute: string
}) {
  const generator = assetComponentGeneratorForProfile(input.profile)
  if (!generator) return undefined
  await appendRunEvent(input.runId, {
    type: 'tool-call',
    message: 'asset_component_generator',
    data: { name: 'asset_component_generator', arguments: generator },
  })
  throwIfAborted(input.signal)
  const artifact = generateAssetComponentArtifact({
    profileId: input.profile.id,
    name: input.profile.name,
    userPrompt: input.userPrompt,
    ...generator,
  })
  if (!artifact) return undefined
  const content = `Generated ${artifact.shapes.length} parts with ${generator.componentPack}/${generator.generator}.`
  await appendRunEvent(input.runId, {
    type: 'tool-result',
    message: content,
    data: { name: 'asset_component_generator', artifact },
  })
  await appendRunEvent(input.runId, {
    type: 'progress',
    message: content,
    data: { stage: 'generate', route: input.progressRoute, results: [content], artifact },
  })
  return { artifact, content }
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
  return message as TextApiMessage
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

function isExplicitFreshGeometryCreate(userPrompt: string): boolean {
  const text = userPrompt.trim().toLowerCase()
  return (
    /^(please\s*)?(create|generate|make|build|model|draw|new|start|regenerate)\b/i.test(text) ||
    /^(\u8bf7)?(\u751f\u6210|\u521b\u5efa|\u5236\u4f5c|\u505a|\u642d\u5efa|\u5efa\u6a21|\u753b|\u65b0\u5efa|\u65b0\u505a|\u53e6\u505a|\u91cd\u65b0\u751f\u6210|\u518d\u751f\u6210)/.test(
      text,
    )
  )
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

/**
 * Format the loaded industry-pack device profiles into a compact catalog
 * for the stage-1 analyst. The router prefers a verified industry-pack
 * profile over an LLM-declared DSL pipeline — but the analyst can only
 * defer to a pack it knows about. Feeding it name + aliases + description
 * lets it (a) recognize when the request matches a pack device and declare
 * accordingly, and (b) avoid re-inventing standard equipment via DSL.
 *
 * Bounded to MAX entries / per-entry description length so a large pack
 * can't blow the prompt budget. Returns null when no profiles are loaded
 * (caller then sends the bare analysis context).
 */
const INDUSTRY_PACK_CATALOG_MAX_ENTRIES = 60
const INDUSTRY_PACK_CATALOG_MAX_DESC = 80

function buildIndustryPackCatalogForPrompt(
  loaded: Awaited<ReturnType<typeof loadDeviceProfiles>> | undefined,
): string | null {
  const profiles = loaded?.profiles
  if (!profiles || profiles.length === 0) return null
  const lines: string[] = [
    '===== INDUSTRY PACK CATALOG (standard equipment with engineer-tuned editable templates) =====',
    'The following devices are covered by loaded industry packs. If the user request matches one of them, prefer the pack — do NOT declare generator_dsl for it; the pack produces a more accurate, parametrically editable result than free generation. Match by name OR any alias.',
  ]
  const slice = profiles.slice(0, INDUSTRY_PACK_CATALOG_MAX_ENTRIES)
  for (const p of slice) {
    const aliasText = p.aliases.length > 0 ? ` (aliases: ${p.aliases.join(', ')})` : ''
    const desc =
      p.description.length > INDUSTRY_PACK_CATALOG_MAX_DESC
        ? `${p.description.slice(0, INDUSTRY_PACK_CATALOG_MAX_DESC)}…`
        : p.description
    lines.push(`- ${p.name}${aliasText}: ${desc}`)
  }
  if (profiles.length > INDUSTRY_PACK_CATALOG_MAX_ENTRIES) {
    lines.push(`- …and ${profiles.length - INDUSTRY_PACK_CATALOG_MAX_ENTRIES} more (omitted).`)
  }
  return lines.join('\n')
}

/**
 * Persist the per-attempt LLM DSL source log to inputs/dsl-attempts.json.
 * Best-effort: a write failure must never fail the run itself.
 */
async function persistDslAttemptLog(
  runId: string,
  log: Array<Record<string, unknown>>,
): Promise<void> {
  if (log.length === 0) return
  try {
    const dir = path.join(await runDir(runId), 'inputs')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'dsl-attempts.json'),
      `${JSON.stringify(log, null, 2)}\n`,
      'utf8',
    )
  } catch {
    // swallow — diagnostics persistence is not on the critical path
  }
}

/**
 * generator_dsl route — stage 6. DSL source comes from input.source
 * (injected by tests/harness) or from the LLM author+repair loop, then
 * compiles through the sandbox, runs the spatial quality gate, and
 * completes the run with the patch plan (scene insertion stays
 * client-side). On failure the run is completed with an explicit
 * downgrade record — the user sees the reason, attempt count, and
 * diagnostic codes; nothing falls back silently to the legacy route.
 */
async function runGeneratorDslRoute(input: {
  runId: string
  userPrompt: string
  source?: string
  params?: Record<string, unknown>
  decision: ReturnType<typeof resolveRunGenerationMode>
  stage1HasBlueprint: boolean
  signal: AbortSignal
}): Promise<boolean> {
  const routeMetrics: PrimitiveRouteMetrics = {
    route: 'generator_dsl',
    stage1HasBlueprint: input.stage1HasBlueprint,
    deterministicIntent: false,
    deterministicAttempted: false,
    deterministicSucceeded: false,
    stage2Called: false,
    stage2ToolCallCount: 0,
    repairCallCount: 0,
  }
  applyRouteDecisionToMetrics(routeMetrics, input.decision)

  const runAttempt = (source: string) =>
    executeGeneratorDslRun({
      source,
      apiVersion: GENERATION_VERSIONS.dslApiVersion,
      ...(input.params !== undefined ? { params: input.params } : {}),
      route: input.decision,
    })

  let llmAttempts = 1
  let result: DslRunResult
  let usedSource: string | null = input.source ?? null
  // Collect every LLM-authored source + its compile outcome so failures can
  // be inspected after the run (today a failed DSL run leaves no source on
  // disk, making parse errors impossible to diagnose). Persisted to
  // inputs/dsl-attempts.json at the end of the route.
  const dslAttemptLog: Array<{
    attempt: number
    source: string
    outcome: 'ok' | 'failed'
    diagnosticCodes?: string[]
    diagnostics?: Array<{ code: string; message: string; line?: number }>
  }> = []
  const loggedRunAttempt = async (source: string) => {
    const run = await runAttempt(source)
    dslAttemptLog.push({
      attempt: dslAttemptLog.length + 1,
      source,
      outcome: run.kind,
      ...(run.kind === 'failed' ? { diagnosticCodes: run.downgrade.diagnosticCodes } : {}),
      diagnostics: run.attempts.flatMap((a) =>
        a.diagnostics.map((d) => ({
          code: d.code,
          message: d.message,
          ...(d.span?.line !== undefined ? { line: d.span.line } : {}),
        })),
      ),
    })
    return run
  }

  if (usedSource !== null) {
    result = await loggedRunAttempt(usedSource)
  } else {
    // LLM author + repair loop: the model writes DSL source against the
    // API card + laptop few-shot; compile/gate diagnostics are fed back
    // until it succeeds, stagnates, or exhausts the attempt budget.
    await appendRunEvent(input.runId, {
      type: 'message',
      message: 'Requesting DSL source from the model',
      data: { stage: 'generator-dsl-author', promptVersion: DSL_AUTHOR_PROMPT_VERSION },
    })
    const loop = await runDslSourceLoop({
      userPrompt: input.userPrompt,
      callLlm: async (messages) => {
        const message = await callAi(
          messages.map((m) => ({ role: m.role, content: m.content })),
          undefined,
          input.signal,
        )
        const content = message.content as ApiMessage['content']
        if (typeof content === 'string') return content
        if (Array.isArray(content)) {
          return content.map((c) => (typeof c.text === 'string' ? c.text : '')).join('\n')
        }
        return ''
      },
      runAttempt: loggedRunAttempt,
      maxAttempts: 3,
    })
    llmAttempts = loop.attempts
    usedSource = loop.source
    if (loop.kind === 'ok') {
      result = loop.finalRun
    } else if (loop.finalRun !== null) {
      result = loop.finalRun
    } else {
      // Model never produced DSL source at all.
      result = {
        kind: 'failed',
        downgrade: {
          reason: 'compile_diagnostics',
          message: 'The model did not produce DSL source.',
          attempts: loop.attempts,
          diagnosticCodes: ['dsl_no_source_from_model'],
          route: input.decision,
        },
        attempts: [],
        budgetUsage: {
          sandboxAttempts: 0,
          totalSandboxMs: 0,
          partCount: 0,
          wallTimeBudgetMs: 5000,
        },
      }
    }
  }
  routeMetrics.repairCallCount = Math.max(0, llmAttempts - 1)

  // Persist every LLM-authored DSL source + compile outcome so a failed run
  // can be debugged from disk (parse errors are otherwise invisible).
  await persistDslAttemptLog(input.runId, dslAttemptLog)

  await appendRunEvent(input.runId, {
    type: 'message',
    message:
      result.kind === 'ok'
        ? `generator_dsl compiled ${result.ir.parts.length} parts (spatial score ${result.spatial.score.toFixed(2)})`
        : `generator_dsl failed: ${result.downgrade.message}`,
    data: { stage: 'generator-dsl', ...summarizeDslRunForEvents(result) },
  })

  if (result.kind === 'ok') {
    routeMetrics.dslFirstAttemptSucceeded = result.attempts.length === 1
    routeMetrics.dslAttemptCount = result.attempts.length
    routeMetrics.dslIrHash = result.irHash
    routeMetrics.dslSourceHash = result.ir.generator.sourceHash
    routeMetrics.dslPartCount = result.ir.parts.length
    routeMetrics.dslSpatialScore = result.spatial.score
    routeMetrics.dslSpatialIssues = result.spatial.issues
    routeMetrics.dslSandboxMs = result.budgetUsage.totalSandboxMs
    const payload = {
      analysis: `generator_dsl route: ${input.decision.reasons.join(', ')}`,
      results: [`Generated ${result.ir.parts.length} parts via generator_dsl.`],
      lastContent: `Generated ${result.ir.parts.length} parts via generator_dsl.`,
      // Scene insertion is client-side: the patch plan travels in the
      // run result; the app applies it atomically (all-or-nothing).
      generatedAssembly: {
        irHash: result.irHash,
        rootNode: result.rootNode,
        patches: result.patches,
        // Author truth: the DSL source that produced this assembly.
        ...(usedSource !== null ? { source: usedSource } : {}),
      },
      shapeCount: result.ir.parts.length,
      metrics: { primitiveRoute: routeMetrics },
    }
    await appendRunEvent(input.runId, {
      type: 'message',
      message: 'Primitive route metrics',
      data: { stage: 'route-metrics', primitiveRoute: routeMetrics },
    })
    await completeRunWithResult(input.runId, payload)
    return true
  }

  // Explicit downgrade — recorded, visible, and terminal for this run.
  routeMetrics.dslFirstAttemptSucceeded = false
  routeMetrics.dslAttemptCount = result.downgrade.attempts
  routeMetrics.dslDowngrade = {
    reason: result.downgrade.reason,
    message: result.downgrade.message,
    attempts: result.downgrade.attempts,
    diagnosticCodes: result.downgrade.diagnosticCodes,
  }
  const payload = {
    analysis: `generator_dsl route failed: ${result.downgrade.reason}`,
    results: [
      `Generation via generator_dsl did not succeed: ${result.downgrade.message} ` +
        `(attempts: ${result.downgrade.attempts}; codes: ${result.downgrade.diagnosticCodes.join(', ')}). ` +
        'No scene changes were made.',
    ],
    lastContent: result.downgrade.message,
    shapeCount: 0,
    dslDowngrade: result.downgrade,
    metrics: { primitiveRoute: routeMetrics },
  }
  await appendRunEvent(input.runId, {
    type: 'message',
    message: 'Primitive route metrics',
    data: { stage: 'route-metrics', primitiveRoute: routeMetrics },
  })
  await completeRunWithResult(input.runId, payload)
  return true
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
    const contextArtifactCandidate =
      latestArtifactFromContext(context, 'latestArtifactCandidate') ??
      latestArtifactFromContext(context)
    const latestArtifactCandidate =
      contextArtifactCandidate &&
      isExplicitFreshGeometryCreate(userPrompt) &&
      !isLikelyGeometryRevisionRequest(userPrompt, contextArtifactCandidate)
        ? null
        : contextArtifactCandidate
    const basicPrimitiveRoute = basicPrimitiveDeterministicRoute(
      userPrompt,
      latestArtifactCandidate,
    )
    // Basic primitives are the narrowest and safest route in the harness. They should not
    // wait for the context resolver, device profile loading, Stage-1 analysis, or DSL routing.
    // Explicit creation prompts ("生成一个球", "create a sphere") always mean a new primitive;
    // ambiguous bare nouns are still blocked by basicPrimitiveDeterministicRoute when an
    // existing artifact is present.
    if (basicPrimitiveRoute) {
      const contextDecision: GeometryContextDecision = {
        relationshipToLatestArtifact: 'new_unrelated_object',
        contextPolicy: 'none',
        recommendedRoute: 'new_geometry',
        confidence: 1,
        reason: 'Matched explicit deterministic basic primitive request before context resolution.',
      }
      const routeAnalysis = `Matched deterministic basic primitive route "${basicPrimitiveRoute.label}" before context, profile loading, and LLM Stage1.`
      const handled = await runDeterministicPreflightRoute({
        runId,
        userPrompt,
        revisionTarget: null,
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
    // --- Stage 6 (LLM-routed): generation-mode routing now happens AFTER
    // stage-1, where the analyst LLM has decomposed the request and can
    // declare generationMode itself. Only narrow deterministic fast paths
    // (basic / precision) still run first; profile matches are deferred
    // until the post-Stage1 DSL / recipe pipeline fork.
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
        deterministicTool: 'asset_component_generator',
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
    const deferredProfileRoute =
      shouldUseDeterministicProfileRoute({
        profile: safeSelectedProfile,
        userPrompt,
        revisionTarget,
        resourceResolved: resourceResolution.selectedProfile?.id === safeSelectedProfile?.id,
      }) && safeSelectedProfile
        ? safeSelectedProfile
        : undefined
    if (deferredProfileRoute) {
      await appendRunEvent(runId, {
        type: 'message',
        message: `Deferred device profile "${deferredProfileRoute.id}" until after Stage1 generation-mode routing.`,
        data: {
          stage: 'profile-router',
          selectedProfile: deferredProfileRoute.id,
          profileSource: deferredProfileRoute.source,
          deferredUntil: 'post-stage1-generation-route',
        },
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

    // --- Industry-pack awareness for the stage-1 analyst ----------------
    // The router prefers an industry-pack profile over an LLM-declared DSL
    // pipeline (verified_recipe_in_range wins). But the analyst can only
    // defer to a pack it KNOWS about — so we hand it the catalog of loaded
    // device profiles (name + aliases + description) before it declares a
    // generationMode. Without this the model would declare generator_dsl
    // for devices the pack already covers, and the priority override would
    // look like a surprise reroute. Capped to keep the prompt bounded.
    const industryPackCatalog = buildIndustryPackCatalogForPrompt(loadedDeviceProfiles)
    const stage1UserContent = industryPackCatalog
      ? `${analysisContext}\n\n${industryPackCatalog}`
      : analysisContext

    await appendRunEvent(runId, { type: 'progress', message: 'Analyzing geometry request...' })
    const analysisResponse = await callAi(
      [
        { role: 'system', content: PRIMITIVE_STAGE1_ANALYST_PROMPT },
        { role: 'user', content: stage1UserContent },
      ],
      undefined,
      signal,
    )
    const analysis = analysisResponse.content ?? ''
    const blueprint = extractBlueprintFromAnalysis(analysis)
    throwIfAborted(signal)
    await appendRunEvent(runId, { type: 'message', message: analysis, data: { stage: 'analysis' } })

    // --- Stage 6 (LLM-routed): pipeline fork AFTER stage-1 -------------
    // Now that the analyst has decomposed the request (and may have
    // declared generationMode in the blueprint), decide recipe vs
    // generator_dsl against the REAL blueprint. The DSL branch fires when
    // the LLM declared it (or heuristics detect structure) and the flag is
    // on; DSL source comes from params.dslSource when injected (tests),
    // otherwise the LLM author+repair loop generates it.
    const generationDecision = resolveRunGenerationMode({
      runParams: run.params,
      stableKey: run.conversationId,
      blueprint,
      userPrompt,
      recipeAvailable: deferredProfileRoute !== undefined,
      recipeParamsInRange: deferredProfileRoute !== undefined,
    })
    await appendRunEvent(runId, {
      type: 'message',
      message: `Generation route: ${generationDecision.mode} (${generationDecision.reasons.join(', ')})`,
      data: routeDecisionEventData(generationDecision),
    })
    if (generationDecision.mode === 'generator_dsl') {
      const injectedSource =
        typeof run.params?.dslSource === 'string' && run.params.dslSource.length > 0
          ? run.params.dslSource
          : undefined
      const handled = await runGeneratorDslRoute({
        runId,
        userPrompt,
        ...(injectedSource !== undefined ? { source: injectedSource } : {}),
        params: isRecord(run.params?.dslParams) ? run.params.dslParams : undefined,
        decision: generationDecision,
        stage1HasBlueprint: Boolean(blueprint),
        signal,
      })
      // handled === false means the DSL route failed and the run was
      // completed with an explicit downgrade record — never silent. Either
      // way the DSL path is terminal: do not fall through to stage-2.
      if (!handled) {
        await appendRunEvent(runId, {
          type: 'message',
          message: 'Generator DSL route completed with an explicit downgrade (see dslDowngrade).',
          data: { stage: 'generator-dsl-downgrade' },
        })
      }
      return
    }

    if (generationDecision.mode === 'recipe' && deferredProfileRoute) {
      const profile = deferredProfileRoute
      const routeMetrics: PrimitiveRouteMetrics = {
        route: 'profile',
        stage1HasBlueprint: Boolean(blueprint),
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
      applyRouteDecisionToMetrics(routeMetrics, generationDecision)
      const profileArgs = buildProfileRouteArgs(profile, userPrompt)
      const profileAnalysis = [
        `Matched device profile "${profile.id}" from ${profile.source}.`,
        'Executing profile route after Stage1 generation-mode routing selected recipe.',
        profile.sourcePack
          ? `Using resource pack ${profile.sourcePack.id}@${profile.sourcePack.version}.`
          : undefined,
        profile.overrides?.some((entry) => entry.source === 'builtin')
          ? 'This profile overrides a builtin fallback profile.'
          : undefined,
        assetComponentGeneratorForProfile(profile)
          ? 'Using the industry-pack component generator.'
          : 'Using deterministic compose_parts fallback.',
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
          generationRoute: generationDecision.mode,
          generationRouteReasons: generationDecision.reasons,
        },
      })
      const componentResult = await executeAssetComponentGeneratorRoute({
        runId,
        userPrompt,
        profile,
        signal,
        progressRoute: 'profile',
      })
      const directResult =
        componentResult ??
        (await executeDirectGeometryRoute({
          runId,
          toolName: 'compose_parts',
          args: profileArgs,
          userPrompt,
          revisionTarget,
          blueprint,
          loadedDeviceProfiles,
          signal,
          progressRoute: 'profile',
          progressResults: [],
          toolCallData: {
            deterministic: true,
            fallback: 'asset_component_generator_unavailable',
            generationRoute: generationDecision.mode,
          },
          toolResultData: {
            deterministic: true,
            fallback: 'asset_component_generator_unavailable',
            generationRoute: generationDecision.mode,
          },
        }))
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
            lastContent: 'Deterministic device profile route completed after Stage1 routing.',
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
        message: 'Profile route produced no artifact; falling back to Stage2.',
        data: { stage: 'profile-router', primitiveRoute: routeMetrics },
      })
    }

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
      const toolCalls = Array.isArray(response.tool_calls)
        ? (response.tool_calls as ToolCall[])
        : []
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
