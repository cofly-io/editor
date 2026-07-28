import { describe, expect, it } from 'bun:test'
import { LAPTOP_DSL_SOURCE } from './fixtures/laptop.dsl'
import { reviewAssemblyRealism } from './generated-assembly-realism-gate'
import { reviewAssemblySpatial } from './generated-assembly-spatial-gate'
import { compileDsl } from './generated-geometry-dsl-compiler'
import { NO_SIGNALS, resolveGenerationMode } from './generation-route'
import {
  buildDslAuthorSystemPrompt,
  buildDslRepairMessage,
  DSL_AUTHOR_PROMPT_VERSION,
  type DslLlmMessage,
  extractDslSource,
  runDslSourceLoop,
} from './generator-dsl-llm-loop'
import type { DslRunResult } from './generator-dsl-run'

const route = resolveGenerationMode(
  { ...NO_SIGNALS, needsHinge: true },
  { params: { generatorDsl: true }, env: {} },
)

/** Real compile attempt without a sandbox worker: compileDsl + spatial gate. */
async function directAttempt(source: string): Promise<DslRunResult> {
  const compiled = compileDsl(source)
  if (!compiled.ok || !compiled.ir) {
    return {
      kind: 'failed',
      downgrade: {
        reason: 'compile_diagnostics',
        message: 'compile failed',
        attempts: 1,
        diagnosticCodes: [...new Set(compiled.diagnostics.map((d) => d.code))].sort(),
        route,
      },
      attempts: [{ attempt: 1, sandboxMs: 0, diagnostics: compiled.diagnostics }],
      budgetUsage: { sandboxAttempts: 1, totalSandboxMs: 0, partCount: 0, wallTimeBudgetMs: 5000 },
    }
  }
  const spatial = reviewAssemblySpatial(compiled.ir)
  if (!spatial.passed) {
    return {
      kind: 'failed',
      downgrade: {
        reason: 'spatial_gate_failed',
        message: spatial.issues[0] ?? 'gate failed',
        attempts: 1,
        diagnosticCodes: spatial.issues.map((i) => i.split(':')[0] ?? 'gate'),
        route,
      },
      attempts: [{ attempt: 1, sandboxMs: 0, diagnostics: [], irHash: compiled.irHash, spatial }],
      budgetUsage: {
        sandboxAttempts: 1,
        totalSandboxMs: 0,
        partCount: compiled.ir.parts.length,
        wallTimeBudgetMs: 5000,
      },
    }
  }
  const realism = reviewAssemblyRealism(compiled.ir, { source })
  const attempt = {
    attempt: 1,
    sandboxMs: 0,
    diagnostics: [],
    irHash: compiled.irHash,
    spatial,
    realism,
  }
  if (!realism.passed) {
    return {
      kind: 'failed',
      downgrade: {
        reason: 'realism_gate_failed',
        message: realism.issues[0] ?? 'realism gate failed',
        attempts: 1,
        diagnosticCodes: realism.issues.map((i) => i.split(':')[0] ?? 'realism'),
        route,
      },
      attempts: [attempt],
      budgetUsage: {
        sandboxAttempts: 1,
        totalSandboxMs: 0,
        partCount: compiled.ir.parts.length,
        wallTimeBudgetMs: 5000,
      },
    }
  }
  return {
    kind: 'ok',
    ir: compiled.ir,
    irHash: compiled.irHash ?? 'h',
    patches: [],
    rootNode: {} as never,
    nodeIdByPartId: new Map(),
    spatial,
    realism,
    attempts: [attempt],
    budgetUsage: {
      sandboxAttempts: 1,
      totalSandboxMs: 0,
      partCount: compiled.ir.parts.length,
      wallTimeBudgetMs: 5000,
    },
  }
}

describe('extractDslSource', () => {
  it('passes clean source through', () => {
    expect(extractDslSource(LAPTOP_DSL_SOURCE)).toBe(LAPTOP_DSL_SOURCE.trim())
  })

  it('strips markdown fences', () => {
    const fenced =
      "```typescript\nconst P = params({});\npart('a', box({length:1,width:1,height:1})).atWorld([0,0,0]);\n```"
    const out = extractDslSource(fenced)
    expect(out).toContain("part('a'")
    expect(out).not.toContain('```')
  })

  it('drops leading prose before the first DSL line', () => {
    const reply =
      "Sure! Here is your laptop:\n\nconst P = params({});\npart('a', box({length:1,width:1,height:1})).atWorld([0,0,0]);"
    const out = extractDslSource(reply)
    expect(out?.startsWith('const P')).toBe(true)
  })

  it('returns null when there is no DSL at all', () => {
    expect(extractDslSource('I cannot help with that.')).toBeNull()
  })

  it('accepts equipment semantic constructors as DSL source', () => {
    const out = extractDslSource(
      "Sure, here is the source:\n\nbelt({ id: 'belt', length: 6 });\nguardCover({ id: 'cover', target: 'belt' });",
    )
    expect(out?.startsWith('belt(')).toBe(true)
  })

  it('accepts broader industrial SDK constructors as DSL source', () => {
    const out = extractDslSource(
      "Here is the source:\n\ncontrolCabinet({ id: 'cabinet' });\npipeRun({ id: 'pipe' });",
    )
    expect(out?.startsWith('controlCabinet(')).toBe(true)
  })
})

describe('runDslSourceLoop', () => {
  it('first-try success: one LLM call, one compile, done', async () => {
    const llmCalls: DslLlmMessage[][] = []
    const result = await runDslSourceLoop({
      userPrompt: '生成一个笔记本电脑',
      callLlm: async (msgs) => {
        llmCalls.push(msgs)
        return LAPTOP_DSL_SOURCE
      },
      runAttempt: directAttempt,
    })
    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(1)
    expect(llmCalls).toHaveLength(1)
    if (result.kind === 'ok') {
      expect(result.finalRun.kind).toBe('ok')
    }
  })

  it('repair loop: bad source → repair message with diagnostics → fixed source succeeds', async () => {
    const replies = [
      // Forbidden Math global → dsl_forbidden_global at compile time
      "const x = Math.sin(1);\npart('a', box({length:1,width:1,height:1})).atWorld([0,0,0]);",
      LAPTOP_DSL_SOURCE,
    ]
    let call = 0
    const seenMessages: DslLlmMessage[] = []
    const result = await runDslSourceLoop({
      userPrompt: '生成一个笔记本电脑',
      callLlm: async (msgs) => {
        seenMessages.push(...msgs)
        return replies[call++] ?? LAPTOP_DSL_SOURCE
      },
      runAttempt: directAttempt,
    })
    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
    // The repair message must have been sent and must name the diagnostic
    const repairMsg = seenMessages.find(
      (m) => m.role === 'user' && m.content.includes('dsl_forbidden_global'),
    )
    expect(repairMsg).toBeDefined()
  })

  it('stagnation: same diagnostic codes twice → stop early, report stagnated', async () => {
    const badSource =
      "const x = Math.sin(1);\npart('a', box({length:1,width:1,height:1})).atWorld([0,0,0]);"
    const result = await runDslSourceLoop({
      userPrompt: 'x',
      callLlm: async () => badSource,
      runAttempt: directAttempt,
      maxAttempts: 5,
    })
    expect(result.kind).toBe('failed')
    if (result.kind !== 'failed') return
    expect(result.stagnated).toBe(true)
    expect(result.attempts).toBe(2)
  })

  it('does not stagnate when the same gate code reports different concrete overlap pairs', async () => {
    const failures = [
      'gate_part_overlap: parts "fridge.body" and "fridge.shelf.r0" overlap 100% of the smaller volume.',
      'gate_part_overlap: parts "refrigerator.cabinet" and "refrigerator.cavity" overlap 100% of the smaller volume.',
    ]
    let attempt = 0
    const result = await runDslSourceLoop({
      userPrompt: 'x',
      callLlm: async () =>
        `part('p${attempt}', box({length:1,width:1,height:1})).atWorld([0,0,0]);`,
      runAttempt: async (): Promise<DslRunResult> => {
        const issue = failures[Math.min(attempt, failures.length - 1)]!
        attempt += 1
        return {
          kind: 'failed',
          downgrade: {
            reason: 'spatial_gate_failed',
            message: issue,
            attempts: 1,
            diagnosticCodes: ['gate_part_overlap'],
            route,
          },
          attempts: [
            {
              attempt,
              sandboxMs: 0,
              diagnostics: [],
              spatial: { passed: false, score: 0.8, issues: [issue], warnings: [] },
            },
          ],
          budgetUsage: {
            sandboxAttempts: 1,
            totalSandboxMs: 0,
            partCount: 2,
            wallTimeBudgetMs: 5000,
          },
        }
      },
      maxAttempts: 3,
    })
    expect(result.kind).toBe('failed')
    if (result.kind !== 'failed') return
    expect(result.attempts).toBe(3)
    expect(result.stagnated).toBe(true)
  })

  it('spatial gate failures also feed the repair loop', async () => {
    // Compiles but has 60 keys at one position → gate_duplicate_position
    const collapsed = LAPTOP_DSL_SOURCE.replace(
      'const x = (col - (P.columns - 1) / 2) * keyPitch;',
      'const x = 0;',
    ).replace(
      'const z = -(P.deckDepth / 2) + 0.04 + row * keyPitch + keyPitch / 2;',
      'const z = 0;',
    )
    let call = 0
    const seen: string[] = []
    const result = await runDslSourceLoop({
      userPrompt: 'x',
      callLlm: async (msgs) => {
        seen.push(msgs.map((m) => m.content).join('\n---\n'))
        return call++ === 0 ? collapsed : LAPTOP_DSL_SOURCE
      },
      runAttempt: directAttempt,
    })
    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(seen[seen.length - 1]).toContain('gate_duplicate_position')
  })

  it('realism gate failures also feed the repair loop before user sees the result', async () => {
    const toyConveyor = `
      part('belt.surface', box({ length: 6, width: 0.72, height: 0.055, material: 'plastic', color: '#222222' }))
        .atWorld([0, 0.82, 0])
        .withRole('belt');
      part('roller.0', cylinder({ radius: 0.03, height: 0.78, material: 'metal', color: '#cccccc' }))
        .atWorld([-2, 0.72, 0])
        .rotate({ axis: 'x', degrees: 90 })
        .withRole('roller');
      part('frame.left', box({ length: 6, width: 0.04, height: 0.04, material: 'metal', color: '#aaaaaa' }))
        .atWorld([0, 0.78, -0.46])
        .withRole('support_frame');
    `
    const sdkConveyor = `
      belt({ id: 'belt', length: 6, width: 0.72 });
      rollerArray({ id: 'rollers', length: 6, width: 0.78, count: 8 });
      boxFrame({ id: 'frame', length: 6, width: 0.92, height: 0.78 });
      guardCover({ id: 'cover', target: 'belt', side: 'top', length: 3.8 });
      motor({ id: 'drive_motor', target: 'belt', side: 'right', position: 'rear' });
      inspectionDoor({ id: 'doors', target: 'cover', side: 'right', count: 2 });
      nameplate({ id: 'nameplate', target: 'cover', side: 'front' });
    `
    let call = 0
    const seen: string[] = []
    const result = await runDslSourceLoop({
      userPrompt: 'generate a guarded belt conveyor',
      callLlm: async (msgs) => {
        seen.push(msgs.map((m) => m.content).join('\n---\n'))
        return call++ === 0 ? toyConveyor : sdkConveyor
      },
      runAttempt: directAttempt,
    })

    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(seen[seen.length - 1]).toContain('Industrial realism gate feedback')
    expect(seen[seen.length - 1]).toContain('realism_missing_required_role')
    expect(seen[seen.length - 1]).toContain('guardCover')
  })

  it('control cabinet realism failures feed the same repair loop', async () => {
    const toyCabinet = `
      part('control_cabinet.body', box({ length: 0.7, width: 0.35, height: 1.4, material: 'metal', color: '#64748b' }))
        .atWorld([0, 0.7, 0])
        .withRole('control_cabinet');
    `
    const sdkCabinet =
      "controlCabinet({ id: 'control_cabinet', width: 0.7, height: 1.4, depth: 0.35 });"
    let call = 0
    const seen: string[] = []
    const result = await runDslSourceLoop({
      userPrompt: 'generate an industrial control cabinet',
      callLlm: async (msgs) => {
        seen.push(msgs.map((m) => m.content).join('\n---\n'))
        return call++ === 0 ? toyCabinet : sdkCabinet
      },
      runAttempt: directAttempt,
    })

    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(seen[seen.length - 1]).toContain('Industrial realism gate feedback')
    expect(seen[seen.length - 1]).toContain('realism_cabinet_under_detailed')
    expect(seen[seen.length - 1]).toContain('controlCabinet')
  })

  it('reply without DSL → nudges the model once and counts the attempt', async () => {
    let call = 0
    const result = await runDslSourceLoop({
      userPrompt: 'x',
      callLlm: async () => (call++ === 0 ? 'Sorry, I do not understand.' : LAPTOP_DSL_SOURCE),
      runAttempt: directAttempt,
    })
    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
  })
})

describe('prompt + repair message content', () => {
  it('system prompt contains the API card, rules, fixture, and version', () => {
    const prompt = buildDslAuthorSystemPrompt()
    expect(prompt).toContain('DSL API (version 1.1.0)')
    expect(prompt).toContain('rotateAround')
    expect(prompt).toContain('guardCover')
    expect(prompt).toContain('flangePort')
    expect(prompt).toContain('controlCabinet')
    expect(prompt).toContain('prefer semantic constructors')
    expect(prompt).toContain('keyboard.key.r')
    expect(prompt).toContain(`Prompt version: ${DSL_AUTHOR_PROMPT_VERSION}`)
    // few-shot fixture is embedded verbatim
    expect(prompt).toContain('makeKey')
  })

  it('repair message includes diagnostic code, line, and gate issues', () => {
    const failed: Extract<DslRunResult, { kind: 'failed' }> = {
      kind: 'failed',
      downgrade: {
        reason: 'compile_diagnostics',
        message: 'DSL compile produced 1 errors.',
        attempts: 1,
        diagnosticCodes: ['dsl_undeclared_identifier'],
        route,
      },
      attempts: [
        {
          attempt: 1,
          sandboxMs: 0,
          diagnostics: [
            {
              code: 'dsl_undeclared_identifier',
              severity: 'error',
              message: 'foo is not declared',
              retryable: true,
              span: { start: 10, end: 13, line: 3, column: 7 },
            },
          ],
          spatial: {
            passed: false,
            score: 0.5,
            issues: ['gate_duplicate_position: ...'],
            warnings: [],
          },
        },
      ],
      budgetUsage: { sandboxAttempts: 1, totalSandboxMs: 0, partCount: 0, wallTimeBudgetMs: 5000 },
    }
    const msg = buildDslRepairMessage(failed)
    expect(msg).toContain('[dsl_undeclared_identifier]')
    expect(msg).toContain('line 3')
    expect(msg).toContain('gate_duplicate_position')
    expect(msg).toContain('COMPLETE corrected source')
  })
})
