import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import { buildGeneratedAssemblyNodes } from '../../../../packages/editor/src/lib/generated-geometry-placement'
import type { DslRunResult } from '../ai-harness-runs/generator-dsl-run'
import {
  buildGeometryAgentEditPrompt,
  createGeometryAgentSession,
  editGeometryAgentSession,
} from './agent-session'
import {
  createGeometryAgentWorkspace,
  readGeometryAgentDiagnostics,
  readGeometryAgentLastRun,
  readGeometryAgentManifest,
  readGeometryAgentMemory,
  readGeometryAgentSource,
} from './source-workspace'

const SOURCE = `
  belt({ id: 'belt', length: 6, width: 0.72 });
  guardCover({ id: 'cover', target: 'belt', height: 0.55 });
`

const IR: AssemblyIR = {
  schemaVersion: 1,
  generator: { sourceHash: 'src', apiVersion: '1.1.0', paramsHash: 'params' },
  parts: [],
  constraints: [],
}

function okRun(partCount = 3): DslRunResult {
  return {
    kind: 'ok',
    ir: { ...IR, parts: Array.from({ length: partCount }, (_, i) => makePart(`p${i}`)) },
    irHash: 'ir-hash',
    patches: [],
    rootNode: { id: 'artifact-1' } as never,
    nodeIdByPartId: new Map(),
    spatial: { passed: true, score: 1, issues: [], warnings: [] },
    realism: {
      applicable: true,
      family: 'belt_conveyor',
      passed: true,
      score: 1,
      issues: [],
      warnings: [],
      evidence: { partCount, semanticRoles: ['belt'], anonymousPrimitiveRatio: 0 },
    },
    attempts: [{ attempt: 1, sandboxMs: 0, diagnostics: [] }],
    budgetUsage: { sandboxAttempts: 1, totalSandboxMs: 0, partCount, wallTimeBudgetMs: 5000 },
  }
}

function makePart(id: string, fingerprint = `fp-${id}`): AssemblyIR['parts'][number] {
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

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'geometry-agent-session-'))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('geometry-agent session', () => {
  test('create session writes successful generated source and run snapshot', async () => {
    await withTempRoot(async (rootDir) => {
      const { workspace, result } = await createGeometryAgentSession({
        rootDir,
        sessionId: 'geo_agent_create',
        input: { mode: 'text', prompt: '生成皮带输送机' },
        callLlm: async () => SOURCE,
        runAttempt: async () => okRun(7),
        now: () => '2026-07-28T00:00:00.000Z',
      })

      expect(result.kind).toBe('ok')
      expect(await readGeometryAgentSource(workspace)).toContain('guardCover')
      expect(await readGeometryAgentManifest(workspace)).toMatchObject({
        status: 'succeeded',
        currentArtifactId: 'artifact-1',
      })
      expect(await readGeometryAgentLastRun(workspace)).toMatchObject({
        kind: 'ok',
        partCount: 7,
      })
      expect((await readGeometryAgentMemory(workspace)).recentDecisions).toEqual([
        'Created belt_conveyor source with 7 parts.',
      ])
    })
  })

  test('edit session sends current source and memory, then persists patched source', async () => {
    await withTempRoot(async (rootDir) => {
      const workspace = await createGeometryAgentWorkspace({
        rootDir,
        sessionId: 'geo_agent_edit',
        input: { mode: 'text', prompt: '生成皮带输送机' },
        initialSource: SOURCE,
      })
      const patched = SOURCE.replace('height: 0.55', 'height: 0.75')
      let prompt = ''

      const { result, sourceBefore, sourceAfter } = await editGeometryAgentSession({
        workspace,
        instruction: '罩子大一点',
        callLlm: async (messages) => {
          prompt = messages.at(-1)?.content ?? ''
          return patched
        },
        runAttempt: async () => okRun(8),
        now: () => '2026-07-28T00:00:01.000Z',
      })

      expect(result.kind).toBe('ok')
      expect(sourceBefore).toContain('height: 0.55')
      expect(sourceAfter).toContain('height: 0.75')
      expect(prompt).toContain('Current source:')
      expect(prompt).toContain('罩子大一点')
      expect(await readGeometryAgentSource(workspace)).toContain('height: 0.75')
      expect(await readGeometryAgentManifest(workspace)).toMatchObject({
        status: 'succeeded',
        sourceOrigin: 'workspace',
      })
      expect(await readGeometryAgentLastRun(workspace)).toMatchObject({
        changeFeedback: {
          changed: [
            {
              id: 'cover',
              functionName: 'guardCover',
              changedParams: [{ name: 'height', before: '0.55', after: '0.75' }],
            },
          ],
        },
        summary: expect.stringContaining('guardCover(cover)'),
      })
      expect((await readGeometryAgentMemory(workspace)).recentDecisions).toEqual([
        'Edited belt_conveyor source locally (1 changed, 0 added, 0 removed; 8 parts).',
      ])
    })
  })

  test('edit session rejects unrelated rewrites before compiling, then repairs locally', async () => {
    await withTempRoot(async (rootDir) => {
      const workspace = await createGeometryAgentWorkspace({
        rootDir,
        sessionId: 'geo_agent_locality',
        input: { mode: 'text', prompt: '生成皮带输送机' },
        initialSource: `
equipment('belt_conveyor', { id: 'conveyor', length: 6 });
boxFrame({ id: 'frame', length: 6, width: 0.9, height: 0.8 });
belt({ id: 'belt', length: 6, width: 0.72 });
rollerArray({ id: 'rollers', length: 6, width: 0.78, count: 12 });
guardCover({ id: 'top_guard_cover', target: 'belt', height: 0.55 });
motor({ id: 'drive_motor', target: 'belt', side: 'right', position: 'rear' });
`,
      })
      const badRewrite = `
equipment('belt_conveyor', { id: 'conveyor', length: 6 });
boxFrame({ id: 'frame', length: 6, width: 0.9, height: 0.8 });
belt({ id: 'belt', length: 6, width: 1.4 });
rollerArray({ id: 'rollers', length: 6, width: 0.78, count: 12 });
guardCover({ id: 'top_guard_cover', target: 'belt', height: 0.75 });
motor({ id: 'drive_motor', target: 'belt', side: 'left', position: 'front' });
`
      const localPatch = badRewrite
        .replace('width: 1.4', 'width: 0.72')
        .replace("side: 'left', position: 'front'", "side: 'right', position: 'rear'")
      let llmCalls = 0
      let compileCalls = 0

      const { result, sourceAfter } = await editGeometryAgentSession({
        workspace,
        instruction: '罩子大一点',
        callLlm: async () => {
          llmCalls += 1
          return llmCalls === 1 ? badRewrite : localPatch
        },
        runAttempt: async () => {
          compileCalls += 1
          return okRun(8)
        },
        maxAttempts: 3,
        now: () => '2026-07-28T00:00:03.000Z',
      })

      expect(result.kind).toBe('ok')
      expect(llmCalls).toBe(2)
      expect(compileCalls).toBe(1)
      expect(sourceAfter).toContain('height: 0.75')
      expect(sourceAfter).toContain('width: 0.72')
      expect(sourceAfter).toContain("side: 'right', position: 'rear'")
    })
  })

  test('edit session can plan incremental rerun and persist changed counts', async () => {
    await withTempRoot(async (rootDir) => {
      const previousIr = {
        ...IR,
        parts: [makePart('belt'), makePart('cover.top_panel'), makePart('motor')],
      }
      const { rootNode, childNodes } = buildGeneratedAssemblyNodes(previousIr)
      const nextIr = {
        ...IR,
        parts: [
          makePart('belt'),
          makePart('cover.top_panel', 'fp-cover-v2'),
          makePart('motor'),
          makePart('doors.door.0.panel'),
        ],
      }
      const workspace = await createGeometryAgentWorkspace({
        rootDir,
        sessionId: 'geo_agent_rerun',
        input: { mode: 'text', prompt: '生成皮带输送机' },
        initialSource: SOURCE,
      })

      const { rerun } = await editGeometryAgentSession({
        workspace,
        instruction: '右侧加两个检修门',
        callLlm: async () =>
          `${SOURCE}\ninspectionDoor({ id: 'doors', target: 'cover', count: 1 });`,
        runAttempt: async (): Promise<DslRunResult> => ({
          ...okRun(4),
          ir: nextIr,
          irHash: 'next-ir',
        }),
        rerun: {
          existingRoot: rootNode as never,
          existingParts: childNodes,
          previousIr,
          detectedAt: '2026-07-28T00:00:00.000Z',
        },
        now: () => '2026-07-28T00:00:04.000Z',
      })

      expect(rerun?.summary).toMatchObject({
        created: 1,
        updated: 1,
        deleted: 0,
        unchanged: 2,
        changedPartIds: ['cover.top_panel'],
        addedPartIds: ['doors.door.0.panel'],
      })
      expect(await readGeometryAgentLastRun(workspace)).toMatchObject({
        changed: {
          created: 1,
          updated: 1,
          deleted: 0,
          unchanged: 2,
          changedPartIds: ['cover.top_panel'],
          addedPartIds: ['doors.door.0.panel'],
        },
      })
    })
  })

  test('failed session keeps diagnostics on disk', async () => {
    await withTempRoot(async (rootDir) => {
      const failed: DslRunResult = {
        kind: 'failed',
        downgrade: {
          reason: 'realism_gate_failed',
          message: 'missing belt',
          attempts: 1,
          diagnosticCodes: ['realism_missing_required_role'],
          route: { mode: 'generator_dsl' } as never,
        },
        attempts: [
          {
            attempt: 1,
            sandboxMs: 0,
            diagnostics: [],
            realism: {
              applicable: true,
              family: 'belt_conveyor',
              passed: false,
              score: 0.5,
              issues: [
                'realism_missing_required_role: belt_conveyor must include semantic role "belt".',
              ],
              warnings: [
                'realism_missing_recommended_role: belt_conveyor should usually include "drive_motor".',
              ],
              evidence: { partCount: 2, semanticRoles: [], anonymousPrimitiveRatio: 1 },
            },
          },
        ],
        budgetUsage: {
          sandboxAttempts: 1,
          totalSandboxMs: 0,
          partCount: 2,
          wallTimeBudgetMs: 5000,
        },
      }

      const { workspace, result } = await createGeometryAgentSession({
        rootDir,
        sessionId: 'geo_agent_failed',
        input: { mode: 'text', prompt: '生成输送机' },
        callLlm: async () => "part('conveyor.box', box({ length: 1, width: 1, height: 1 }));",
        runAttempt: async () => failed,
        now: () => '2026-07-28T00:00:02.000Z',
      })

      expect(result.kind).toBe('failed')
      expect(await readGeometryAgentManifest(workspace)).toMatchObject({ status: 'failed' })
      expect(await readGeometryAgentDiagnostics(workspace)).toMatchObject({
        realismIssues: [
          'realism_missing_required_role: belt_conveyor must include semantic role "belt".',
        ],
      })
      expect(await readGeometryAgentSource(workspace)).toBe(
        "part('conveyor.box', box({ length: 1, width: 1, height: 1 }));",
      )
    })
  })

  test('edit prompt preserves local-edit constraints', () => {
    const prompt = buildGeometryAgentEditPrompt({
      currentSource: SOURCE,
      instruction: '右侧加两个检修门',
      memoryJson: '{}',
    })
    expect(prompt).toContain('Preserve stable part IDs')
    expect(prompt).toContain('inspectionDoor')
    expect(prompt).toContain('Output the complete patched DSL source only')
  })
})
