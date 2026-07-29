import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  appendGeometryAgentEvent,
  appendGeometryAgentRecentDecision,
  createGeometryAgentWorkspace,
  defaultGeometryAgentSessionsRoot,
  readGeometryAgentDiagnostics,
  readGeometryAgentEvents,
  readGeometryAgentLastRun,
  readGeometryAgentManifest,
  readGeometryAgentMemory,
  readGeometryAgentSource,
  resolveWorkspace,
  writeGeometryAgentLastRun,
  writeGeometryAgentSource,
} from './source-workspace'

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'geometry-agent-workspace-'))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('geometry-agent source workspace', () => {
  test('creates manifest, source, memory, diagnostics, and append-only events', async () => {
    await withTempRoot(async (rootDir) => {
      const workspace = await createGeometryAgentWorkspace({
        rootDir,
        sessionId: 'geo_agent_test',
        input: { mode: 'text', prompt: '生成一台带透明防护罩的皮带输送机' },
        equipmentType: 'belt_conveyor',
        now: () => '2026-07-28T00:00:00.000Z',
      })

      expect(await readGeometryAgentSource(workspace)).toBe('')
      expect(await readGeometryAgentManifest(workspace)).toMatchObject({
        sessionId: 'geo_agent_test',
        status: 'idle',
        sourceOrigin: 'llm',
        inputMode: 'text',
      })
      expect(await readGeometryAgentMemory(workspace)).toMatchObject({
        userGoal: '生成一台带透明防护罩的皮带输送机',
        equipmentType: 'belt_conveyor',
        referenceImageAssetId: null,
        realismPreferences: { detailLevel: 'industrial_delivery' },
      })
      expect(await readGeometryAgentDiagnostics(workspace)).toMatchObject({
        diagnostics: [],
        realismIssues: [],
      })

      await appendGeometryAgentEvent(workspace, {
        type: 'run.started',
        at: '2026-07-28T00:00:01.000Z',
      })
      const events = await readGeometryAgentEvents(workspace)
      expect(events.map((e) => e.type)).toEqual(['session.created', 'run.started'])
    })
  })

  test('persists source and last-run state without deleting debug files', async () => {
    await withTempRoot(async (rootDir) => {
      const workspace = await createGeometryAgentWorkspace({
        rootDir,
        sessionId: 'geo_agent_run',
        input: { mode: 'text', prompt: 'x' },
      })

      await writeGeometryAgentSource(workspace, 'belt({ id: "belt" });', {
        origin: 'workspace',
        eventType: 'source.patched',
        now: '2026-07-28T00:00:02.000Z',
      })
      await writeGeometryAgentLastRun(workspace, {
        kind: 'ok',
        sourceOrigin: 'workspace',
        irHash: 'hash',
        artifactId: 'artifact-1',
        partCount: 12,
        changed: { created: 0, updated: 4, deleted: 0, unchanged: 8 },
        summary: 'updated cover',
        at: '2026-07-28T00:00:03.000Z',
      })

      expect(await readGeometryAgentSource(workspace)).toBe('belt({ id: "belt" });')
      expect(await readGeometryAgentLastRun(workspace)).toMatchObject({
        kind: 'ok',
        artifactId: 'artifact-1',
        changed: { updated: 4, unchanged: 8 },
      })
      expect(await readGeometryAgentManifest(workspace)).toMatchObject({
        status: 'succeeded',
        currentArtifactId: 'artifact-1',
        sourceOrigin: 'workspace',
      })
      expect((await readGeometryAgentEvents(workspace)).map((e) => e.type)).toContain(
        'run.succeeded',
      )
    })
  })

  test('stores image input as a future multimodal seam', async () => {
    await withTempRoot(async (rootDir) => {
      const workspace = await createGeometryAgentWorkspace({
        rootDir,
        sessionId: 'geo_agent_image',
        input: { mode: 'image', imageAssetId: 'asset-123', prompt: '按参考图生成设备' },
      })
      expect(await readGeometryAgentMemory(workspace)).toMatchObject({
        userGoal: '按参考图生成设备',
        referenceImageAssetId: 'asset-123',
      })
    })
  })

  test('appends bounded recent memory decisions', async () => {
    await withTempRoot(async (rootDir) => {
      const workspace = await createGeometryAgentWorkspace({
        rootDir,
        sessionId: 'geo_agent_memory',
        input: { mode: 'text', prompt: 'x' },
      })

      for (let i = 0; i < 10; i += 1) {
        await appendGeometryAgentRecentDecision(
          workspace,
          `decision ${i}`,
          '2026-07-28T00:00:00.000Z',
        )
      }
      await appendGeometryAgentRecentDecision(workspace, 'decision 8', '2026-07-28T00:00:01.000Z')

      expect((await readGeometryAgentMemory(workspace)).recentDecisions).toEqual([
        'decision 8',
        'decision 9',
        'decision 7',
        'decision 6',
        'decision 5',
        'decision 4',
        'decision 3',
        'decision 2',
      ])
    })
  })

  test('rejects session ids that could escape the workspace root', () => {
    expect(() => resolveWorkspace('C:/tmp/root', '../escape')).toThrow()
  })

  test('default root points to apps/editor when called from repo root', () => {
    expect(defaultGeometryAgentSessionsRoot('D:/SourceCode/editor')).toMatch(
      /apps[\\/]editor[\\/]\.generated[\\/]geometry-agent[\\/]sessions$/,
    )
  })
})
