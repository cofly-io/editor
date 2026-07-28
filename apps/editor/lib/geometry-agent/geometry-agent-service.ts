import { existsSync } from 'node:fs'
import { DSL_API_VERSION } from '@pascal-app/core/lib/generated-geometry-dsl-contract'
import { NO_SIGNALS, resolveGenerationMode } from '../ai-harness-runs/generation-route'
import type { DslLlmMessage } from '../ai-harness-runs/generator-dsl-llm-loop'
import { type DslRunResult, executeGeneratorDslRun } from '../ai-harness-runs/generator-dsl-run'
import { callConfiguredAi } from '../ai-provider'
import {
  createGeometryAgentSession,
  editGeometryAgentSession,
  type GeometryAgentCreateInput,
} from './agent-session'
import type { GeometryAgentInput } from './geometry-agent-types'
import type { GeometryAgentRerunContext, GeometryAgentRerunSummary } from './rerun-summary'
import {
  defaultGeometryAgentSessionsRoot,
  readGeometryAgentDiagnostics,
  readGeometryAgentEvents,
  readGeometryAgentLastRun,
  readGeometryAgentManifest,
  readGeometryAgentMemory,
  readGeometryAgentSource,
  resolveWorkspace,
} from './source-workspace'

type ServiceDeps = {
  rootDir?: string
  callLlm?: (messages: DslLlmMessage[], signal?: AbortSignal) => Promise<string>
  runAttempt?: (source: string) => Promise<DslRunResult>
  now?: () => string
  signal?: AbortSignal
}

export type GeometryAgentCreateRequest = {
  sessionId?: string
  mode?: 'text' | 'image'
  prompt?: string
  imageAssetId?: string
  initialSource?: string
  equipmentType?: string
  maxAttempts?: number
}

export type GeometryAgentMessageRequest = {
  prompt?: string
  instruction?: string
  maxAttempts?: number
  rerun?: GeometryAgentRerunContext
}

export type GeometryAgentSnapshot = {
  sessionId: string
  manifest: Awaited<ReturnType<typeof readGeometryAgentManifest>>
  memory: Awaited<ReturnType<typeof readGeometryAgentMemory>>
  source: string
  diagnostics: Awaited<ReturnType<typeof readGeometryAgentDiagnostics>>
  lastRun: Awaited<ReturnType<typeof readGeometryAgentLastRun>>
  events: Awaited<ReturnType<typeof readGeometryAgentEvents>>
}

export type GeometryAgentRunResponse = GeometryAgentSnapshot & {
  result: {
    kind: 'ok' | 'failed'
    attempts: number
    sourceAvailable: boolean
  }
  rerunSummary?: GeometryAgentRerunSummary
}

export async function createGeometryAgentSessionFromRequest(
  body: unknown,
  deps: ServiceDeps = {},
): Promise<GeometryAgentRunResponse> {
  const request = parseCreateRequest(body)
  const input = inputFromCreateRequest(request)
  const rootDir = deps.rootDir ?? defaultGeometryAgentSessionsRoot()
  const callLlm = deps.callLlm ?? defaultCallLlm
  const runAttempt = deps.runAttempt ?? defaultRunAttempt

  const createInput: GeometryAgentCreateInput = {
    rootDir,
    ...(request.sessionId ? { sessionId: request.sessionId } : {}),
    input,
    ...(request.initialSource !== undefined ? { initialSource: request.initialSource } : {}),
    ...(request.equipmentType ? { equipmentType: request.equipmentType } : {}),
    ...(request.maxAttempts !== undefined ? { maxAttempts: request.maxAttempts } : {}),
    ...(deps.now ? { now: deps.now } : {}),
    callLlm: (messages) => callLlm(messages, deps.signal),
    runAttempt,
  }

  const { workspace, result } = await createGeometryAgentSession(createInput)
  return {
    ...(await readGeometryAgentSnapshot(workspace.sessionId, { rootDir })),
    result: {
      kind: result.kind === 'ok' ? 'ok' : 'failed',
      attempts: result.attempts,
      sourceAvailable: result.source !== null,
    },
  }
}

export async function sendGeometryAgentMessageFromRequest(
  sessionId: string,
  body: unknown,
  deps: ServiceDeps = {},
): Promise<GeometryAgentRunResponse> {
  const request = parseMessageRequest(body)
  const rootDir = deps.rootDir ?? defaultGeometryAgentSessionsRoot()
  const workspace = resolveWorkspace(rootDir, sessionId)
  if (!existsSync(workspace.manifestPath)) {
    throw new GeometryAgentHttpError(
      404,
      'session_not_found',
      `Geometry agent session not found: ${sessionId}`,
    )
  }
  const callLlm = deps.callLlm ?? defaultCallLlm
  const runAttempt = deps.runAttempt ?? defaultRunAttempt
  const instruction = request.instruction ?? request.prompt
  if (!instruction?.trim()) {
    throw new GeometryAgentHttpError(400, 'prompt_required', 'prompt is required')
  }

  const { result, rerun } = await editGeometryAgentSession({
    workspace,
    instruction: instruction.trim(),
    callLlm: (messages) => callLlm(messages, deps.signal),
    runAttempt,
    ...(request.maxAttempts !== undefined ? { maxAttempts: request.maxAttempts } : {}),
    ...(request.rerun ? { rerun: request.rerun } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  })

  return {
    ...(await readGeometryAgentSnapshot(sessionId, { rootDir })),
    result: {
      kind: result.kind === 'ok' ? 'ok' : 'failed',
      attempts: result.attempts,
      sourceAvailable: result.source !== null,
    },
    ...(rerun ? { rerunSummary: rerun.summary } : {}),
  }
}

export async function readGeometryAgentSnapshot(
  sessionId: string,
  opts: { rootDir?: string } = {},
): Promise<GeometryAgentSnapshot> {
  const rootDir = opts.rootDir ?? defaultGeometryAgentSessionsRoot()
  const workspace = resolveWorkspace(rootDir, sessionId)
  if (!existsSync(workspace.manifestPath)) {
    throw new GeometryAgentHttpError(
      404,
      'session_not_found',
      `Geometry agent session not found: ${sessionId}`,
    )
  }
  return {
    sessionId,
    manifest: await readGeometryAgentManifest(workspace),
    memory: await readGeometryAgentMemory(workspace),
    source: await readGeometryAgentSource(workspace),
    diagnostics: await readGeometryAgentDiagnostics(workspace),
    lastRun: await readGeometryAgentLastRun(workspace),
    events: await readGeometryAgentEvents(workspace),
  }
}

export class GeometryAgentHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

function parseCreateRequest(body: unknown): GeometryAgentCreateRequest {
  if (!isRecord(body)) {
    throw new GeometryAgentHttpError(400, 'invalid_body', 'Invalid request body')
  }
  const mode = body.mode === 'image' ? 'image' : 'text'
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const imageAssetId = typeof body.imageAssetId === 'string' ? body.imageAssetId.trim() : ''
  if (mode === 'text' && !prompt) {
    throw new GeometryAgentHttpError(400, 'prompt_required', 'prompt is required')
  }
  if (mode === 'image' && !imageAssetId) {
    throw new GeometryAgentHttpError(400, 'image_asset_required', 'imageAssetId is required')
  }
  return {
    mode,
    ...(prompt ? { prompt } : {}),
    ...(imageAssetId ? { imageAssetId } : {}),
    ...(typeof body.sessionId === 'string' ? { sessionId: body.sessionId } : {}),
    ...(typeof body.initialSource === 'string' ? { initialSource: body.initialSource } : {}),
    ...(typeof body.equipmentType === 'string' ? { equipmentType: body.equipmentType } : {}),
    ...(typeof body.maxAttempts === 'number' ? { maxAttempts: body.maxAttempts } : {}),
  }
}

function parseMessageRequest(body: unknown): GeometryAgentMessageRequest {
  if (!isRecord(body)) {
    throw new GeometryAgentHttpError(400, 'invalid_body', 'Invalid request body')
  }
  return {
    ...(typeof body.prompt === 'string' ? { prompt: body.prompt } : {}),
    ...(typeof body.instruction === 'string' ? { instruction: body.instruction } : {}),
    ...(typeof body.maxAttempts === 'number' ? { maxAttempts: body.maxAttempts } : {}),
    ...(isRecord(body.rerun) ? { rerun: body.rerun as GeometryAgentRerunContext } : {}),
  }
}

function inputFromCreateRequest(request: GeometryAgentCreateRequest): GeometryAgentInput {
  if (request.mode === 'image') {
    return {
      mode: 'image',
      imageAssetId: request.imageAssetId ?? '',
      ...(request.prompt ? { prompt: request.prompt } : {}),
    }
  }
  return { mode: 'text', prompt: request.prompt ?? '' }
}

async function defaultCallLlm(messages: DslLlmMessage[], signal?: AbortSignal): Promise<string> {
  const { res, text } = await callConfiguredAi(
    {
      messages,
      temperature: 0.2,
      max_tokens: 4096,
    },
    signal,
  )
  if (!res.ok) {
    throw new Error(`Geometry agent LLM failed (${res.status}): ${text}`)
  }
  const data = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
      .join('\n')
  }
  return ''
}

function defaultRunAttempt(source: string): Promise<DslRunResult> {
  return executeGeneratorDslRun({
    source,
    apiVersion: DSL_API_VERSION,
    route: resolveGenerationMode(
      { ...NO_SIGNALS, llmExplicitMode: 'generator_dsl' },
      { params: { generatorDsl: true } },
    ),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
