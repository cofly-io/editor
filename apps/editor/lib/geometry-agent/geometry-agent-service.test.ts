import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import { buildGeneratedAssemblyNodes } from '../../../../packages/editor/src/lib/generated-geometry-placement'
import type { DslRunResult } from '../ai-harness-runs/generator-dsl-run'
import {
  createGeometryAgentSessionFromRequest,
  type GeometryAgentHttpError,
  readGeometryAgentSnapshot,
  sendGeometryAgentMessageFromRequest,
} from './geometry-agent-service'

const SOURCE = `
  belt({ id: 'belt', length: 6, width: 0.72 });
  guardCover({ id: 'cover', target: 'belt', height: 0.55 });
`

function part(id: string, fingerprint = `fp-${id}`): AssemblyIR['parts'][number] {
  return {
    id,
    transform: { space: 'world', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    geometry: {
      kind: 'primitive-recipe',
      recipeId: 'primitive.box',
      params: { length: 1, width: 1, height: 1 },
    },
    material: {},
    fingerprint,
  }
}

function ir(parts: AssemblyIR['parts'], sourceHash = 'src'): AssemblyIR {
  return {
    schemaVersion: 1,
    generator: { sourceHash, apiVersion: '1.1.0', paramsHash: 'params' },
    parts,
    constraints: [],
  }
}

function okRun(nextIr = ir([part('belt'), part('cover')])): DslRunResult {
  return {
    kind: 'ok',
    ir: nextIr,
    irHash: 'ir-hash',
    patches: [],
    rootNode: { id: 'assembly_test' } as never,
    nodeIdByPartId: new Map(),
    spatial: { passed: true, score: 1, issues: [], warnings: [] },
    realism: {
      applicable: true,
      family: 'belt_conveyor',
      passed: true,
      score: 1,
      issues: [],
      warnings: [],
      evidence: {
        partCount: nextIr.parts.length,
        semanticRoles: ['belt'],
        anonymousPrimitiveRatio: 0,
      },
    },
    attempts: [{ attempt: 1, sandboxMs: 0, diagnostics: [] }],
    budgetUsage: {
      sandboxAttempts: 1,
      totalSandboxMs: 0,
      partCount: nextIr.parts.length,
      wallTimeBudgetMs: 5000,
    },
  }
}

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'geometry-agent-service-'))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('geometry-agent service', () => {
  test('creates a text session using injected LLM and run attempt', async () => {
    await withTempRoot(async (rootDir) => {
      const response = await createGeometryAgentSessionFromRequest(
        {
          sessionId: 'geo_agent_service_create',
          mode: 'text',
          prompt: '生成一台带透明防护罩的皮带输送机',
          equipmentType: 'belt_conveyor',
        },
        {
          rootDir,
          callLlm: async () => SOURCE,
          runAttempt: async () => okRun(),
          now: () => '2026-07-28T00:00:00.000Z',
        },
      )

      expect(response.sessionId).toBe('geo_agent_service_create')
      expect(response.result).toMatchObject({ kind: 'ok', attempts: 1, sourceAvailable: true })
      expect(response.manifest).toMatchObject({ status: 'succeeded', inputMode: 'text' })
      expect(response.source).toContain('guardCover')
      expect(response.lastRun).toMatchObject({ kind: 'ok', partCount: 2 })
      expect(response.generatedAssembly).toMatchObject({
        rootNode: { id: 'assembly_test' },
        patches: [],
        nodeIdByPartId: {},
      })
    })
  })

  test('creates an image session seam without calling a vision model', async () => {
    await withTempRoot(async (rootDir) => {
      const response = await createGeometryAgentSessionFromRequest(
        {
          sessionId: 'geo_agent_service_image',
          mode: 'image',
          imageAssetId: 'asset-001',
          prompt: '按图生成设备',
          initialSource: SOURCE,
        },
        {
          rootDir,
          runAttempt: async () => okRun(),
        },
      )

      expect(response.memory.referenceImageAssetId).toBe('asset-001')
      expect(response.manifest.inputMode).toBe('image')
    })
  })

  test('edits a session and returns rerun summary when scene context is supplied', async () => {
    await withTempRoot(async (rootDir) => {
      await createGeometryAgentSessionFromRequest(
        {
          sessionId: 'geo_agent_service_edit',
          mode: 'text',
          prompt: '生成皮带输送机',
          initialSource: SOURCE,
        },
        { rootDir, runAttempt: async () => okRun(ir([part('belt'), part('cover')], 'src-v1')) },
      )

      const previousIr = ir([part('belt'), part('cover')], 'src-v1')
      const { rootNode, childNodes } = buildGeneratedAssemblyNodes(previousIr)
      const nextIr = ir([part('belt'), part('cover', 'fp-cover-v2'), part('doors.0')], 'src-v2')
      const response = await sendGeometryAgentMessageFromRequest(
        'geo_agent_service_edit',
        {
          prompt: '右侧加一个检修门',
          rerun: {
            existingRoot: rootNode,
            existingParts: childNodes,
            previousIr,
            detectedAt: '2026-07-28T00:00:01.000Z',
          },
        },
        {
          rootDir,
          callLlm: async () =>
            `${SOURCE}\ninspectionDoor({ id: 'doors', target: 'cover', count: 1 });`,
          runAttempt: async () => ({ ...okRun(nextIr), irHash: 'ir-v2' }),
          now: () => '2026-07-28T00:00:02.000Z',
        },
      )

      expect(response.rerunSummary).toMatchObject({
        created: 1,
        updated: 1,
        unchanged: 1,
        addedPartIds: ['doors.0'],
        changedPartIds: ['cover'],
      })
      expect(response.lastRun?.changed).toMatchObject({
        created: 1,
        updated: 1,
        unchanged: 1,
      })
      expect(response.generatedAssembly?.rootNode).toMatchObject({ id: 'assembly_test' })
    })
  })

  test('snapshot can reload a persisted session', async () => {
    await withTempRoot(async (rootDir) => {
      await createGeometryAgentSessionFromRequest(
        {
          sessionId: 'geo_agent_snapshot',
          mode: 'text',
          prompt: '生成输送机',
          initialSource: SOURCE,
        },
        { rootDir, runAttempt: async () => okRun() },
      )

      const snapshot = await readGeometryAgentSnapshot('geo_agent_snapshot', { rootDir })
      expect(snapshot.source).toContain('belt')
      expect(snapshot.events.map((event) => event.type)).toContain('run.succeeded')
    })
  })

  test('validates request bodies with HTTP-shaped errors', async () => {
    await expect(
      createGeometryAgentSessionFromRequest({}, { rootDir: 'unused' }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'prompt_required',
    } satisfies Partial<GeometryAgentHttpError>)
    await expect(
      readGeometryAgentSnapshot('missing_session', { rootDir: 'unused' }),
    ).rejects.toMatchObject({
      status: 404,
      code: 'session_not_found',
    } satisfies Partial<GeometryAgentHttpError>)
  })
})
