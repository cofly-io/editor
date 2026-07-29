import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  GeometryAgentDiagnostics,
  GeometryAgentEvent,
  GeometryAgentInput,
  GeometryAgentLastRun,
  GeometryAgentManifest,
  GeometryAgentMemory,
  GeometryAgentSessionStatus,
  GeometryAgentSourceOrigin,
  GeometryAgentWorkspace,
} from './geometry-agent-types'

const SESSION_ID_RE = /^[a-zA-Z0-9_-]+$/
const MAX_RECENT_DECISIONS = 8

export type CreateGeometryAgentWorkspaceInput = {
  rootDir?: string
  sessionId?: string
  input: GeometryAgentInput
  initialSource?: string
  equipmentType?: string
  now?: () => string
}

export function defaultGeometryAgentSessionsRoot(cwd = process.cwd()): string {
  const appPackage = path.join(cwd, 'apps', 'editor', 'package.json')
  if (existsSync(appPackage)) {
    return path.join(cwd, 'apps', 'editor', '.generated', 'geometry-agent', 'sessions')
  }
  return path.join(cwd, '.generated', 'geometry-agent', 'sessions')
}

export async function createGeometryAgentWorkspace(
  input: CreateGeometryAgentWorkspaceInput,
): Promise<GeometryAgentWorkspace> {
  const now = input.now ?? (() => new Date().toISOString())
  const sessionId = input.sessionId ?? createSessionId()
  const rootDir = input.rootDir ?? defaultGeometryAgentSessionsRoot()
  const workspace = resolveWorkspace(rootDir, sessionId)
  const createdAt = now()

  await mkdir(workspace.dir, { recursive: true })

  const manifest: GeometryAgentManifest = {
    sessionId,
    sourcePath: 'source.equipment.dsl',
    status: 'idle',
    inputMode: input.input.mode,
    sourceOrigin: input.initialSource === undefined ? 'llm' : 'workspace',
    createdAt,
    updatedAt: createdAt,
  }
  const memory = createInitialMemory(input)

  await writeJson(workspace.manifestPath, manifest)
  await writeFile(workspace.sourcePath, input.initialSource ?? '', 'utf8')
  await writeJson(workspace.memoryPath, memory)
  await writeFile(workspace.eventsPath, '', 'utf8')
  await writeJson(workspace.diagnosticsPath, emptyDiagnostics())
  await appendGeometryAgentEvent(workspace, {
    type: 'session.created',
    at: createdAt,
    payload: { inputMode: input.input.mode, sourceOrigin: manifest.sourceOrigin },
  })

  return workspace
}

export function resolveWorkspace(rootDir: string, sessionId: string): GeometryAgentWorkspace {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error(`Invalid geometry-agent session id: ${sessionId}`)
  }
  const root = path.resolve(rootDir)
  const dir = path.resolve(root, sessionId)
  if (!isInsideOrEqual(root, dir)) {
    throw new Error(`Geometry-agent session path escaped root: ${sessionId}`)
  }
  return {
    sessionId,
    dir,
    manifestPath: path.join(dir, 'manifest.json'),
    sourcePath: path.join(dir, 'source.equipment.dsl'),
    memoryPath: path.join(dir, 'memory.json'),
    eventsPath: path.join(dir, 'events.jsonl'),
    lastRunPath: path.join(dir, 'last-run.json'),
    diagnosticsPath: path.join(dir, 'diagnostics.json'),
  }
}

export async function readGeometryAgentManifest(
  workspace: GeometryAgentWorkspace,
): Promise<GeometryAgentManifest> {
  return readJson<GeometryAgentManifest>(workspace.manifestPath)
}

export async function updateGeometryAgentManifest(
  workspace: GeometryAgentWorkspace,
  patch: Partial<Pick<GeometryAgentManifest, 'currentArtifactId' | 'status' | 'sourceOrigin'>>,
  now = new Date().toISOString(),
): Promise<GeometryAgentManifest> {
  const current = await readGeometryAgentManifest(workspace)
  const next = { ...current, ...patch, updatedAt: now }
  await writeJson(workspace.manifestPath, next)
  return next
}

export async function readGeometryAgentSource(workspace: GeometryAgentWorkspace): Promise<string> {
  return readFile(workspace.sourcePath, 'utf8')
}

export async function writeGeometryAgentSource(
  workspace: GeometryAgentWorkspace,
  source: string,
  opts: {
    origin: GeometryAgentSourceOrigin
    eventType?: 'source.saved' | 'source.patched'
    now?: string
  },
): Promise<void> {
  const at = opts.now ?? new Date().toISOString()
  await writeFile(workspace.sourcePath, source, 'utf8')
  await updateGeometryAgentManifest(workspace, { sourceOrigin: opts.origin }, at)
  await appendGeometryAgentEvent(workspace, {
    type: opts.eventType ?? 'source.saved',
    at,
    payload: { sourceOrigin: opts.origin, byteLength: Buffer.byteLength(source, 'utf8') },
  })
}

export async function readGeometryAgentMemory(
  workspace: GeometryAgentWorkspace,
): Promise<GeometryAgentMemory> {
  return readJson<GeometryAgentMemory>(workspace.memoryPath)
}

export async function writeGeometryAgentMemory(
  workspace: GeometryAgentWorkspace,
  memory: GeometryAgentMemory,
  now = new Date().toISOString(),
): Promise<void> {
  await writeJson(workspace.memoryPath, memory)
  await updateGeometryAgentManifest(workspace, {}, now)
  await appendGeometryAgentEvent(workspace, { type: 'memory.updated', at: now })
}

export async function appendGeometryAgentRecentDecision(
  workspace: GeometryAgentWorkspace,
  decision: string,
  now = new Date().toISOString(),
): Promise<GeometryAgentMemory> {
  const normalized = decision.trim()
  const current = await readGeometryAgentMemory(workspace)
  if (!normalized) return current
  const next: GeometryAgentMemory = {
    ...current,
    recentDecisions: [
      normalized,
      ...current.recentDecisions.filter((existing) => existing !== normalized),
    ].slice(0, MAX_RECENT_DECISIONS),
  }
  await writeGeometryAgentMemory(workspace, next, now)
  return next
}

export async function appendGeometryAgentEvent(
  workspace: GeometryAgentWorkspace,
  event: Omit<GeometryAgentEvent, 'id' | 'sessionId'>,
): Promise<GeometryAgentEvent> {
  const fullEvent: GeometryAgentEvent = {
    id: `${workspace.sessionId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: workspace.sessionId,
    ...event,
  }
  await appendFile(workspace.eventsPath, `${JSON.stringify(fullEvent)}\n`, 'utf8')
  return fullEvent
}

export async function readGeometryAgentEvents(
  workspace: GeometryAgentWorkspace,
): Promise<GeometryAgentEvent[]> {
  const text = await readFile(workspace.eventsPath, 'utf8')
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GeometryAgentEvent)
}

export async function writeGeometryAgentLastRun(
  workspace: GeometryAgentWorkspace,
  lastRun: GeometryAgentLastRun,
): Promise<void> {
  await writeJson(workspace.lastRunPath, lastRun)
  await updateGeometryAgentManifest(
    workspace,
    {
      status: lastRun.kind === 'ok' ? 'succeeded' : 'failed',
      ...(lastRun.artifactId ? { currentArtifactId: lastRun.artifactId } : {}),
      sourceOrigin: lastRun.sourceOrigin,
    },
    lastRun.at,
  )
  await appendGeometryAgentEvent(workspace, {
    type: lastRun.kind === 'ok' ? 'run.succeeded' : 'run.failed',
    at: lastRun.at,
    payload: { irHash: lastRun.irHash, partCount: lastRun.partCount, changed: lastRun.changed },
  })
}

export async function readGeometryAgentLastRun(
  workspace: GeometryAgentWorkspace,
): Promise<GeometryAgentLastRun | null> {
  if (!existsSync(workspace.lastRunPath)) return null
  return readJson<GeometryAgentLastRun>(workspace.lastRunPath)
}

export async function writeGeometryAgentDiagnostics(
  workspace: GeometryAgentWorkspace,
  diagnostics: GeometryAgentDiagnostics,
): Promise<void> {
  await writeJson(workspace.diagnosticsPath, diagnostics)
}

export async function readGeometryAgentDiagnostics(
  workspace: GeometryAgentWorkspace,
): Promise<GeometryAgentDiagnostics> {
  return readJson<GeometryAgentDiagnostics>(workspace.diagnosticsPath)
}

export function createInitialMemory(input: {
  input: GeometryAgentInput
  equipmentType?: string
}): GeometryAgentMemory {
  return {
    userGoal: input.input.mode === 'text' ? input.input.prompt : (input.input.prompt ?? ''),
    ...(input.equipmentType ? { equipmentType: input.equipmentType } : {}),
    namedParts: {},
    recentDecisions: [],
    userPreferences: {
      industrialStyle: 'editable realistic factory equipment',
    },
    referenceImageAssetId: input.input.mode === 'image' ? input.input.imageAssetId : null,
    referenceImageNotes: [],
    targetDimensions: {
      length: null,
      width: null,
      height: null,
      unit: 'm',
    },
    realismPreferences: {
      detailLevel: 'industrial_delivery',
      avoidToyLikeGeometry: true,
      preferRoundedSheetMetal: true,
      preferVisibleFasteners: true,
    },
  }
}

export function emptyDiagnostics(): GeometryAgentDiagnostics {
  return {
    diagnostics: [],
    realismIssues: [],
    realismWarnings: [],
    spatialIssues: [],
    spatialWarnings: [],
  }
}

export function createSessionId(): string {
  return `geo_agent_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function isInsideOrEqual(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export type { GeometryAgentSessionStatus }
