import { DSL_API_VERSION } from '@pascal-app/core/lib/generated-geometry-dsl-contract'
import type { DslSourceLoopResult } from '../ai-harness-runs/generator-dsl-llm-loop'
import {
  buildDslAuthorSystemPrompt,
  buildDslAuthorUserPrompt,
  type DslLlmMessage,
  extractDslSource,
  runDslSourceLoop,
} from '../ai-harness-runs/generator-dsl-llm-loop'
import type { DslRunResult } from '../ai-harness-runs/generator-dsl-run'
import {
  type GeometryAgentRerunContext,
  type GeometryAgentRerunResult,
  type GeometryAgentRerunSummary,
  planGeometryAgentRerun,
} from './rerun-summary'
import { patchLocalityFailureRun, reviewGeometryAgentPatchLocality } from './source-patch-locality'
import {
  appendGeometryAgentEvent,
  type CreateGeometryAgentWorkspaceInput,
  createGeometryAgentWorkspace,
  emptyDiagnostics,
  readGeometryAgentMemory,
  readGeometryAgentSource,
  updateGeometryAgentManifest,
  writeGeometryAgentDiagnostics,
  writeGeometryAgentLastRun,
  writeGeometryAgentSource,
} from './source-workspace'

export type GeometryAgentCreateInput = CreateGeometryAgentWorkspaceInput & {
  callLlm: (messages: DslLlmMessage[]) => Promise<string>
  runAttempt: (source: string) => Promise<DslRunResult>
  maxAttempts?: number
}

export type GeometryAgentEditInput = {
  workspace: Awaited<ReturnType<typeof createGeometryAgentWorkspace>>
  instruction: string
  callLlm: (messages: DslLlmMessage[]) => Promise<string>
  runAttempt: (source: string) => Promise<DslRunResult>
  maxAttempts?: number
  now?: () => string
  rerun?: GeometryAgentRerunContext
}

export async function createGeometryAgentSession(input: GeometryAgentCreateInput): Promise<{
  workspace: Awaited<ReturnType<typeof createGeometryAgentWorkspace>>
  result: DslSourceLoopResult
}> {
  const now = input.now ?? (() => new Date().toISOString())
  const workspace = await createGeometryAgentWorkspace(input)
  await appendGeometryAgentEvent(workspace, { type: 'run.started', at: now() })
  await updateGeometryAgentManifest(workspace, { status: 'running' }, now())

  const result = await runDslSourceLoop({
    userPrompt: input.input.mode === 'text' ? input.input.prompt : (input.input.prompt ?? ''),
    callLlm: input.callLlm,
    runAttempt: input.runAttempt,
    maxAttempts: input.maxAttempts,
    initialSource: input.initialSource,
  })

  await persistLoopResult(workspace, result, 'llm', now())
  return { workspace, result }
}

export async function editGeometryAgentSession(input: GeometryAgentEditInput): Promise<{
  result: DslSourceLoopResult
  sourceBefore: string
  sourceAfter: string | null
  rerun: GeometryAgentRerunResult | null
}> {
  const now = input.now ?? (() => new Date().toISOString())
  const sourceBefore = await readGeometryAgentSource(input.workspace)
  const memory = await readGeometryAgentMemory(input.workspace)
  await appendGeometryAgentEvent(input.workspace, {
    type: 'run.started',
    at: now(),
    payload: { sourceOrigin: 'workspace', instruction: input.instruction },
  })
  await updateGeometryAgentManifest(
    input.workspace,
    { status: 'running', sourceOrigin: 'workspace' },
    now(),
  )

  const result = await runDslSourceLoop({
    userPrompt: buildGeometryAgentEditPrompt({
      currentSource: sourceBefore,
      instruction: input.instruction,
      memoryJson: JSON.stringify(memory, null, 2),
    }),
    callLlm: input.callLlm,
    runAttempt: async (candidateSource) => {
      const locality = reviewGeometryAgentPatchLocality({
        instruction: input.instruction,
        beforeSource: sourceBefore,
        afterSource: candidateSource,
      })
      if (!locality.passed) return patchLocalityFailureRun(locality)
      return input.runAttempt(candidateSource)
    },
    maxAttempts: input.maxAttempts,
  })

  const sourceAfter = result.source
  const rerun =
    input.rerun && result.kind === 'ok' && result.finalRun.kind === 'ok'
      ? planGeometryAgentRerun({
          context: input.rerun,
          nextIr: result.finalRun.ir,
          source: result.source,
          irHash: result.finalRun.irHash,
        })
      : null
  await persistLoopResult(input.workspace, result, 'workspace', now(), rerun?.summary)
  return { result, sourceBefore, sourceAfter, rerun }
}

export function buildGeometryAgentEditPrompt(input: {
  currentSource: string
  instruction: string
  memoryJson: string
}): string {
  return [
    'Patch the existing Generator DSL source for this local geometry edit.',
    '',
    'Rules:',
    '- Preserve stable part IDs unless the edit explicitly removes or replaces that part.',
    '- Make the smallest source change that satisfies the instruction.',
    '- Prefer editing existing equipment SDK calls such as guardCover(), motor(), inspectionDoor().',
    '- Output the complete patched DSL source only.',
    '',
    `DSL API version: ${DSL_API_VERSION}`,
    '',
    'Session memory:',
    input.memoryJson,
    '',
    'Current source:',
    input.currentSource,
    '',
    'User edit instruction:',
    input.instruction,
  ].join('\n')
}

export function buildGeometryAgentCreateMessages(prompt: string): DslLlmMessage[] {
  return [
    { role: 'system', content: buildDslAuthorSystemPrompt() },
    { role: 'user', content: buildDslAuthorUserPrompt(prompt) },
  ]
}

export function extractGeometryAgentSource(reply: string): string | null {
  return extractDslSource(reply)
}

async function persistLoopResult(
  workspace: Awaited<ReturnType<typeof createGeometryAgentWorkspace>>,
  result: DslSourceLoopResult,
  sourceOrigin: 'llm' | 'workspace',
  at: string,
  rerunSummary?: GeometryAgentRerunSummary,
): Promise<void> {
  if (result.source !== null && result.kind === 'ok') {
    await writeGeometryAgentSource(workspace, result.source, {
      origin: sourceOrigin,
      eventType: sourceOrigin === 'workspace' ? 'source.patched' : 'source.saved',
      now: at,
    })
  }

  const finalRun = result.finalRun
  await writeGeometryAgentDiagnostics(workspace, diagnosticsFromRun(finalRun))
  await writeGeometryAgentLastRun(workspace, {
    kind: result.kind === 'ok' ? 'ok' : 'failed',
    sourceOrigin,
    ...(finalRun?.kind === 'ok'
      ? {
          irHash: finalRun.irHash,
          artifactId: finalRun.rootNode.id,
          partCount: finalRun.ir.parts.length,
          ...(rerunSummary
            ? {
                changed: {
                  created: rerunSummary.created,
                  updated: rerunSummary.updated,
                  deleted: rerunSummary.deleted,
                  unchanged: rerunSummary.unchanged,
                  changedPartIds: rerunSummary.changedPartIds,
                  addedPartIds: rerunSummary.addedPartIds,
                  removedPartIds: rerunSummary.removedPartIds,
                  orphanedOverridePartIds: rerunSummary.orphanedOverridePartIds,
                },
              }
            : {}),
          summary:
            rerunSummary?.text ?? `Generated ${finalRun.ir.parts.length} parts via geometry agent.`,
        }
      : {
          partCount: finalRun?.budgetUsage.partCount ?? 0,
          summary: finalRun?.downgrade.message ?? 'Geometry agent did not produce DSL source.',
        }),
    at,
  })
}

function diagnosticsFromRun(run: DslRunResult | null) {
  if (!run) return emptyDiagnostics()
  return {
    diagnostics: run.attempts.flatMap((a) => a.diagnostics),
    realismIssues: run.attempts.flatMap((a) => a.realism?.issues ?? []),
    realismWarnings: run.attempts.flatMap((a) => a.realism?.warnings ?? []),
    spatialIssues: run.attempts.flatMap((a) => a.spatial?.issues ?? []),
    spatialWarnings: run.attempts.flatMap((a) => a.spatial?.warnings ?? []),
  }
}
