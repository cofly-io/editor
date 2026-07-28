import type {
  GeometryAgentCreateRequest,
  GeometryAgentMessageRequest,
  GeometryAgentRerunContext,
  GeometryAgentRunResponse,
  GeometryAgentSnapshot,
} from './geometry-agent-client-types'

export type GeometryAgentClientFetch = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
    cache?: RequestCache
  },
) => Promise<{
  ok: boolean
  status: number
  statusText: string
  json: () => Promise<unknown>
}>

export type GeometryAgentClientOptions = {
  fetchImpl?: GeometryAgentClientFetch
  signal?: AbortSignal
}

export async function createGeometryAgentSessionClient(
  request: GeometryAgentCreateRequest,
  options: GeometryAgentClientOptions = {},
): Promise<GeometryAgentRunResponse> {
  return requestJson<GeometryAgentRunResponse>(
    '/api/geometry-agent/sessions',
    {
      method: 'POST',
      body: request,
      signal: options.signal,
    },
    options.fetchImpl,
  )
}

export async function readGeometryAgentSessionClient(
  sessionId: string,
  options: GeometryAgentClientOptions = {},
): Promise<GeometryAgentSnapshot> {
  return requestJson<GeometryAgentSnapshot>(
    `/api/geometry-agent/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'GET',
      signal: options.signal,
      cache: 'no-store',
    },
    options.fetchImpl,
  )
}

export async function sendGeometryAgentMessageClient(
  sessionId: string,
  request: GeometryAgentMessageRequest,
  options: GeometryAgentClientOptions = {},
): Promise<GeometryAgentRunResponse> {
  return requestJson<GeometryAgentRunResponse>(
    `/api/geometry-agent/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'POST',
      body: request,
      signal: options.signal,
    },
    options.fetchImpl,
  )
}

export function createGeometryAgentEditRequest(input: {
  prompt: string
  rerun?: GeometryAgentRerunContext
  maxAttempts?: number
}): GeometryAgentMessageRequest {
  return {
    instruction: input.prompt,
    ...(input.rerun ? { rerun: input.rerun } : {}),
    ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
  }
}

export function geometryAgentDebugDetails(snapshot: GeometryAgentSnapshot): string {
  const lines = [
    `sessionId=${snapshot.sessionId}`,
    `status=${snapshot.manifest.status}`,
    `inputMode=${snapshot.manifest.inputMode}`,
    `sourceOrigin=${snapshot.manifest.sourceOrigin}`,
    snapshot.manifest.currentArtifactId ? `artifactId=${snapshot.manifest.currentArtifactId}` : '',
    snapshot.lastRun ? `lastRun=${snapshot.lastRun.kind}` : 'lastRun=none',
    snapshot.lastRun?.irHash ? `irHash=${snapshot.lastRun.irHash}` : '',
    snapshot.lastRun?.changeFeedback?.text ? `\n${snapshot.lastRun.changeFeedback.text}` : '',
    snapshot.diagnostics.diagnostics.length
      ? `\nDiagnostics:\n${snapshot.diagnostics.diagnostics
          .slice(0, 10)
          .map((diagnostic) => `- [${diagnostic.code}] ${diagnostic.message}`)
          .join('\n')}`
      : '',
    snapshot.diagnostics.realismIssues.length
      ? `\nRealism issues:\n${snapshot.diagnostics.realismIssues
          .slice(0, 10)
          .map((issue) => `- ${issue}`)
          .join('\n')}`
      : '',
    snapshot.diagnostics.spatialIssues.length
      ? `\nSpatial issues:\n${snapshot.diagnostics.spatialIssues
          .slice(0, 10)
          .map((issue) => `- ${issue}`)
          .join('\n')}`
      : '',
    '\nSource:',
    snapshot.source,
  ]
  return lines.filter(Boolean).join('\n')
}

async function requestJson<T>(
  url: string,
  input: {
    method: 'GET' | 'POST'
    body?: unknown
    signal?: AbortSignal
    cache?: RequestCache
  },
  fetchImpl: GeometryAgentClientFetch = defaultFetch,
): Promise<T> {
  const response = await fetchImpl(url, {
    method: input.method,
    headers: input.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.cache ? { cache: input.cache } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      isRecord(data) && typeof data.message === 'string'
        ? data.message
        : isRecord(data) && typeof data.error === 'string'
          ? data.error
          : response.statusText
    throw new GeometryAgentClientError(response.status, message, data)
  }
  return data as T
}

function defaultFetch(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
  return fetch(...args)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class GeometryAgentClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly data: unknown,
  ) {
    super(message)
  }
}
