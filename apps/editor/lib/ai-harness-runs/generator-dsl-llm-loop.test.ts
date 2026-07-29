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

  it('accepts pump skid SDK constructors as DSL source', () => {
    const out = extractDslSource(
      "Here is the source:\n\nskidBase({ id: 'skid' });\npumpCasing({ id: 'pump', target: 'skid' });",
    )
    expect(out?.startsWith('skidBase(')).toBe(true)
  })

  it('accepts gearbox and bearing block SDK constructors as DSL source', () => {
    const out = extractDslSource(
      "Here is the source:\n\ngearbox({ id: 'gearbox', target: 'belt' });\nbearingBlock({ id: 'bearing', target: 'belt' });",
    )
    expect(out?.startsWith('gearbox(')).toBe(true)
  })

  it('accepts platform access SDK constructors as DSL source', () => {
    const out = extractDslSource(
      "Here is the source:\n\nplatform({ id: 'platform' });\nladder({ id: 'ladder', target: 'platform' });\nhandrail({ id: 'rail', target: 'platform' });",
    )
    expect(out?.startsWith('platform(')).toBe(true)
  })
})

describe('runDslSourceLoop', () => {
  it('author prompt forbids JavaScript-style array mutation for DSL profiles', () => {
    const prompt = buildDslAuthorSystemPrompt()
    expect(prompt).toContain('do NOT use .push()')
    expect(prompt).toContain('arr[i] = value')
    expect(prompt).toContain('profiles, write a static literal')
  })

  it('repair message gives concrete hints for unsupported array mutation syntax', () => {
    const failed: Extract<DslRunResult, { kind: 'failed' }> = {
      kind: 'failed',
      downgrade: {
        reason: 'compile_diagnostics',
        message: 'DSL compile produced 2 errors.',
        attempts: 1,
        diagnosticCodes: ['dsl_unsupported_member', 'dsl_parse_error'],
        route,
      },
      attempts: [
        {
          attempt: 1,
          sandboxMs: 0,
          diagnostics: [
            {
              code: 'dsl_unsupported_member',
              severity: 'error',
              message: "array member 'push' is not supported; use index access or .length",
              span: { start: 0, end: 1, line: 95, column: 10 },
            },
            {
              code: 'dsl_parse_error',
              severity: 'error',
              message: "expected ';', got =",
              span: { start: 0, end: 1, line: 92, column: 20 },
            },
          ],
        },
      ],
      budgetUsage: {
        sandboxAttempts: 1,
        totalSandboxMs: 0,
        partCount: 0,
        wallTimeBudgetMs: 5000,
      },
    }

    const repair = buildDslRepairMessage(failed)
    expect(repair).toContain('array mutation methods are forbidden')
    expect(repair).toContain('Assignments such as arr[i] = value are not supported')
    expect(repair).toContain('construct the full array literal')
  })

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

  it('pump skid realism failures feed the same repair loop', async () => {
    const toyPump = `
      part('skid.slab', box({ length: 2.4, width: 0.9, height: 0.12, material: 'metal', color: '#666666' }))
        .atWorld([0, 0.06, 0])
        .withRole('skid_base');
      part('pump.body', cylinder({ radius: 0.26, height: 0.36, material: 'metal', color: '#888888', radialSegments: 12 }))
        .atWorld([-0.35, 0.45, 0])
        .rotate({ axis: 'z', degrees: 90 })
        .withRole('volute_casing');
      part('motor.body', cylinder({ radius: 0.22, height: 0.58, material: 'metal', color: '#555555', radialSegments: 16 }))
        .atWorld([0.55, 0.42, 0])
        .rotate({ axis: 'z', degrees: 90 })
        .withRole('drive_motor');
    `
    const sdkPump = `
      skidBase({ id: 'skid', length: 2.4, width: 0.9 });
      pumpCasing({ id: 'pump', target: 'skid', diameter: 0.52 });
      motor({ id: 'drive_motor', target: 'skid', side: 'right', position: 'rear' });
      flangePort({ id: 'inlet', target: 'pump', side: 'front', nominalDiameter: 0.18 });
      flangePort({ id: 'outlet', target: 'pump', side: 'top', nominalDiameter: 0.16 });
      pipeRun({ id: 'process_pipe', from: [-0.6, 0.6, -0.8], to: [0.8, 0.6, -0.8], radius: 0.05 });
      sheetCover({ id: 'coupling_guard', target: 'drive_motor', side: 'top' });
      nameplate({ id: 'nameplate', target: 'skid', side: 'front' });
    `
    let call = 0
    const seen: string[] = []
    const result = await runDslSourceLoop({
      userPrompt: 'generate a centrifugal pump skid',
      callLlm: async (msgs) => {
        seen.push(msgs.map((m) => m.content).join('\n'))
        call += 1
        return call === 1 ? toyPump : sdkPump
      },
      runAttempt: directAttempt,
    })

    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(seen[seen.length - 1]).toContain('Industrial realism gate feedback')
    expect(seen[seen.length - 1]).toContain('realism_pump_under_detailed')
    expect(seen[seen.length - 1]).toContain('pumpCasing')
    expect(seen[seen.length - 1]).toContain('skidBase')
  })

  it('fan blower realism failures feed the same repair loop', async () => {
    const toyFan = `
      part('fan.casing', cylinder({ radius: 0.55, height: 0.32, material: 'metal', color: '#64748b', radialSegments: 16 }))
        .atWorld([0, 0.72, 0])
        .rotate({ axis: 'x', degrees: 90 })
        .withRole('fan_volute_casing');
      part('fan.outlet', box({ length: 0.6, width: 0.32, height: 0.28, material: 'metal', color: '#64748b' }))
        .atWorld([0.75, 0.9, 0])
        .withRole('fan_outlet_duct');
      part('fan.blade', box({ length: 0.28, width: 0.03, height: 0.03, material: 'metal', color: '#cccccc' }))
        .atWorld([0, 0.72, 0.24])
        .withRole('fan_impeller_blade');
    `
    const sdkFan = "blowerPackage({ id: 'blower', length: 3.2, width: 1.3, fanDiameter: 0.95 });"
    let call = 0
    const seen: string[] = []
    const result = await runDslSourceLoop({
      userPrompt:
        'generate a realistic centrifugal blower package with motor silencer filter outlet flange and coupling guard',
      callLlm: async (msgs) => {
        seen.push(msgs.map((m) => m.content).join('\n'))
        return call++ === 0 ? toyFan : sdkFan
      },
      runAttempt: directAttempt,
    })

    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(seen[seen.length - 1]).toContain('Industrial realism gate feedback')
    expect(seen[seen.length - 1]).toContain('realism_fan_under_detailed')
    expect(seen[seen.length - 1]).toContain('blowerPackage')
  })

  it('access realism failures feed the same repair loop', async () => {
    const baseConveyor = `
      belt({ id: 'belt', length: 6, width: 0.72 });
      rollerArray({ id: 'rollers', length: 6, width: 0.78, count: 8 });
      boxFrame({ id: 'frame', length: 6, width: 0.92, height: 0.78 });
      guardCover({ id: 'cover', target: 'belt', side: 'top', length: 3.8 });
      motor({ id: 'drive_motor', target: 'belt', side: 'right', position: 'rear' });
      inspectionDoor({ id: 'doors', target: 'cover', side: 'right', count: 2 });
      nameplate({ id: 'nameplate', target: 'cover', side: 'front' });
    `
    const toyAccess = `
      ${baseConveyor}
      part('platform.slab', box({ length: 1.8, width: 0.9, height: 0.05, material: 'metal', color: '#888888' }))
        .atWorld([0, 1.2, 2.0])
        .withRole('platform_grating');
      part('ladder.one_rung', box({ length: 0.5, width: 0.03, height: 0.03, material: 'metal', color: '#facc15' }))
        .atWorld([0, 0.5, 2.45])
        .withRole('ladder_rung');
      part('handrail.top', box({ length: 1.8, width: 0.03, height: 0.03, material: 'metal', color: '#facc15' }))
        .atWorld([0, 2.3, 2.0])
        .withRole('handrail_top_rail');
    `
    const sdkAccess = `
      ${baseConveyor}
      platform({ id: 'service_platform', target: 'frame', side: 'front' });
      ladder({ id: 'access_ladder', target: 'service_platform', side: 'front' });
      handrail({ id: 'platform_handrail', target: 'service_platform', side: 'all' });
    `
    let call = 0
    const seen: string[] = []
    const result = await runDslSourceLoop({
      userPrompt: 'generate a guarded conveyor with service platform, access ladder and handrail',
      callLlm: async (msgs) => {
        seen.push(msgs.map((m) => m.content).join('\n---\n'))
        return call++ === 0 ? toyAccess : sdkAccess
      },
      runAttempt: directAttempt,
    })

    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(seen[seen.length - 1]).toContain('Industrial realism gate feedback')
    expect(seen[seen.length - 1]).toContain('realism_access_platform_too_simple')
    expect(seen[seen.length - 1]).toContain('platform')
    expect(seen[seen.length - 1]).toContain('ladder')
    expect(seen[seen.length - 1]).toContain('handrail')
  })

  it('process vessel realism failures feed the same repair loop', async () => {
    const toyVessel = `
      part('tank.shell', cylinder({ radius: 0.7, height: 3.2, material: 'metal', color: '#64748b', radialSegments: 16 }))
        .atWorld([0, 1.8, 0])
        .withRole('vessel_shell');
    `
    const sdkVessel =
      "verticalVessel({ id: 'buffer_tank', diameter: 1.4, height: 3.6, includeLadder: true });"
    let call = 0
    const seen: string[] = []
    const result = await runDslSourceLoop({
      userPrompt: 'generate a realistic vertical buffer tank with access ladder and nozzles',
      callLlm: async (msgs) => {
        seen.push(msgs.map((m) => m.content).join('\n---\n'))
        return call++ === 0 ? toyVessel : sdkVessel
      },
      runAttempt: directAttempt,
    })

    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(seen[seen.length - 1]).toContain('Industrial realism gate feedback')
    expect(seen[seen.length - 1]).toContain('realism_vessel_under_detailed')
    expect(seen[seen.length - 1]).toContain('verticalVessel')
  })

  it('dust collector realism failures feed the same repair loop', async () => {
    const toyCollector = `
      part('collector.body', box({ length: 2.0, width: 1.2, height: 2.0, material: 'metal', color: '#64748b' }))
        .atWorld([0, 2.4, 0])
        .withRole('filter_body');
      part('collector.hopper', box({ length: 1.4, width: 0.9, height: 0.7, material: 'metal', color: '#64748b' }))
        .atWorld([0, 1.0, 0])
        .withRole('bottom_discharge_hopper');
    `
    const sdkCollector =
      "dustCollector({ id: 'baghouse', width: 2.0, depth: 1.2, height: 4.2, bagCount: 6 });"
    let call = 0
    const seen: string[] = []
    const result = await runDslSourceLoop({
      userPrompt: 'generate a realistic baghouse dust collector with hopper ducts and pulse valves',
      callLlm: async (msgs) => {
        seen.push(msgs.map((m) => m.content).join('\n---\n'))
        return call++ === 0 ? toyCollector : sdkCollector
      },
      runAttempt: directAttempt,
    })

    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(seen[seen.length - 1]).toContain('Industrial realism gate feedback')
    expect(seen[seen.length - 1]).toContain('realism_dust_collector_under_detailed')
    expect(seen[seen.length - 1]).toContain('dustCollector')
  })

  it('heat exchanger realism failures feed the same repair loop', async () => {
    const toyExchanger = `
      part('exchanger.shell', cylinder({ radius: 0.45, height: 3.6, material: 'metal', color: '#64748b', radialSegments: 16 }))
        .atWorld([0, 0.9, 0])
        .rotate({ axis: 'z', degrees: 90 })
        .withRole('heat_exchanger_shell');
      part('exchanger.inlet', cylinder({ radius: 0.08, height: 0.3, material: 'metal', color: '#64748b', radialSegments: 12 }))
        .atWorld([-0.9, 1.4, 0])
        .withRole('flange_port');
      part('exchanger.outlet', cylinder({ radius: 0.08, height: 0.3, material: 'metal', color: '#64748b', radialSegments: 12 }))
        .atWorld([0.9, 1.4, 0])
        .withRole('flange_port');
    `
    const sdkExchanger =
      "heatExchanger({ id: 'exchanger', length: 3.6, diameter: 0.9, tubeCount: 12 });"
    let call = 0
    const seen: string[] = []
    const result = await runDslSourceLoop({
      userPrompt:
        'generate a realistic shell and tube heat exchanger with saddles and flanged nozzles',
      callLlm: async (msgs) => {
        seen.push(msgs.map((m) => m.content).join('\n---\n'))
        return call++ === 0 ? toyExchanger : sdkExchanger
      },
      runAttempt: directAttempt,
    })

    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(seen[seen.length - 1]).toContain('Industrial realism gate feedback')
    expect(seen[seen.length - 1]).toContain('realism_heat_exchanger_under_detailed')
    expect(seen[seen.length - 1]).toContain('heatExchanger')
  })

  it('agitated reactor realism failures feed the same repair loop', async () => {
    const toyReactor = `
      part('reactor.shell', cylinder({ radius: 0.75, height: 3.0, material: 'metal', color: '#64748b', radialSegments: 16 }))
        .atWorld([0, 1.7, 0])
        .withRole('reactor_vessel_shell');
      part('reactor.motor', cylinder({ radius: 0.16, height: 0.3, material: 'metal', color: '#64748b', radialSegments: 16 }))
        .atWorld([0, 3.35, 0])
        .withRole('agitator_motor');
    `
    const sdkReactor = "agitatorTank({ id: 'reactor', diameter: 1.5, height: 3.6, bladeCount: 4 });"
    let call = 0
    const seen: string[] = []
    const result = await runDslSourceLoop({
      userPrompt:
        'generate a realistic stirred reactor tank with top motor gearbox agitator shaft ports and manway',
      callLlm: async (msgs) => {
        seen.push(msgs.map((m) => m.content).join('\n---\n'))
        return call++ === 0 ? toyReactor : sdkReactor
      },
      runAttempt: directAttempt,
    })

    expect(result.kind).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(seen[seen.length - 1]).toContain('Industrial realism gate feedback')
    expect(seen[seen.length - 1]).toContain('realism_agitated_vessel_under_detailed')
    expect(seen[seen.length - 1]).toContain('agitatorTank')
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
    expect(prompt).toContain('REALISM CHECKLIST')
    expect(prompt).toContain('do not make the motor wider than the belt')
    expect(prompt).toContain('Surface-mounted details must sit OUTSIDE')
    expect(prompt).toContain('Never write part')
    expect(prompt).toContain("nameplate({ id: 'robot_arm.nameplate'")
    expect(prompt).toContain('Do not bury accessories inside larger bodies')
    expect(prompt).toContain('Repeated scene structures such as bridge arches')
    expect(prompt).toContain('x = -totalLength / 2 + spanSpacing * (i + 0.5)')
    expect(prompt).toContain('rotateAround')
    expect(prompt).toContain('guardCover')
    expect(prompt).toContain('flangePort')
    expect(prompt).toContain('controlCabinet')
    expect(prompt).toContain('pumpCasing')
    expect(prompt).toContain('centrifugalFan')
    expect(prompt).toContain('blowerPackage')
    expect(prompt).toContain('skidBase')
    expect(prompt).toContain('gearbox')
    expect(prompt).toContain('bearingBlock')
    expect(prompt).toContain('platform')
    expect(prompt).toContain('ladder')
    expect(prompt).toContain('handrail')
    expect(prompt).toContain('verticalVessel')
    expect(prompt).toContain('dustCollector')
    expect(prompt).toContain('heatExchanger')
    expect(prompt).toContain('agitatorTank')
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

  it('repair message explains how to separate duplicate joint detail positions', () => {
    const failed: Extract<DslRunResult, { kind: 'failed' }> = {
      kind: 'failed',
      downgrade: {
        reason: 'spatial_gate_failed',
        message:
          'Spatial quality gate rejected the assembly: gate_duplicate_position: 3 identical parts share one world position: robot_arm.elbow_motor.front_end_cap, robot_arm.shoulder_motor.front_end_cap, robot_arm.wrist_motor.front_end_cap [primitive.cylinder:{"radius":0.056,"height":0.02}]',
        attempts: 1,
        diagnosticCodes: ['gate_duplicate_position'],
        route,
      },
      attempts: [
        {
          attempt: 1,
          sandboxMs: 0,
          diagnostics: [],
          spatial: {
            passed: false,
            score: 0.5,
            issues: [
              'gate_duplicate_position: 3 identical parts share one world position: robot_arm.elbow_motor.front_end_cap, robot_arm.shoulder_motor.front_end_cap, robot_arm.wrist_motor.front_end_cap [primitive.cylinder:{"radius":0.056,"height":0.02}]',
            ],
            warnings: [],
          },
        },
      ],
      budgetUsage: { sandboxAttempts: 1, totalSandboxMs: 0, partCount: 3, wallTimeBudgetMs: 5000 },
    }
    const msg = buildDslRepairMessage(failed)
    expect(msg).toContain('Separate the 3 identical parts')
    expect(msg).toContain('derive its position from its own parent/joint pivot')
    expect(msg).toContain('compute shoulder/elbow/wrist motors')
  })

  it('repair message translates severe overlap into outward accessory placement hints', () => {
    const failed: Extract<DslRunResult, { kind: 'failed' }> = {
      kind: 'failed',
      downgrade: {
        reason: 'spatial_gate_failed',
        message:
          'Spatial quality gate rejected the assembly: gate_part_overlap: parts "robot.arm1" and "robot.nameplate" overlap 100% of the smaller volume.',
        attempts: 1,
        diagnosticCodes: ['gate_part_overlap'],
        route,
      },
      attempts: [
        {
          attempt: 1,
          sandboxMs: 0,
          diagnostics: [],
          spatial: {
            passed: false,
            score: 0.5,
            issues: [
              'gate_part_overlap: parts "robot.arm1" and "robot.nameplate" overlap 100% of the smaller volume.',
            ],
            warnings: [],
          },
        },
      ],
      budgetUsage: { sandboxAttempts: 1, totalSandboxMs: 0, partCount: 2, wallTimeBudgetMs: 5000 },
    }
    const msg = buildDslRepairMessage(failed)
    expect(msg).toContain('Spatial repair hints')
    expect(msg).toContain('Move "robot.nameplate" to the OUTSIDE surface of "robot.arm1"')
    expect(msg).toContain('0.01m-0.03m clearance')
  })

  it('repair message explains how to separate repeated bridge spans', () => {
    const failed: Extract<DslRunResult, { kind: 'failed' }> = {
      kind: 'failed',
      downgrade: {
        reason: 'spatial_gate_failed',
        message:
          'Spatial quality gate rejected the assembly: gate_part_overlap: parts "bridge.arch.0" and "bridge.arch.1" overlap 100% of the smaller volume.',
        attempts: 3,
        diagnosticCodes: ['gate_part_overlap'],
        route,
      },
      attempts: [
        {
          attempt: 1,
          sandboxMs: 0,
          diagnostics: [],
          spatial: {
            passed: false,
            score: 0.5,
            issues: [
              'gate_part_overlap: parts "bridge.arch.0" and "bridge.arch.1" overlap 100% of the smaller volume.',
            ],
            warnings: [],
          },
        },
      ],
      budgetUsage: { sandboxAttempts: 1, totalSandboxMs: 0, partCount: 2, wallTimeBudgetMs: 5000 },
    }
    const msg = buildDslRepairMessage(failed)
    expect(msg).toContain('Bridge/span repair')
    expect(msg).toContain('spanSpacing = totalLength / archCount')
    expect(msg).toContain('.atWorld([x, archY, 0])')
    expect(msg).toContain('Do not reuse a constant arch position')
  })

  it('repair message treats gearbox and drive details as exterior attachments', () => {
    const failed: Extract<DslRunResult, { kind: 'failed' }> = {
      kind: 'failed',
      downgrade: {
        reason: 'spatial_gate_failed',
        message:
          'Spatial quality gate rejected the assembly: gate_part_overlap: parts "robot_arm.base" and "robot_arm.elbow_gearbox" overlap 100% of the smaller volume.',
        attempts: 1,
        diagnosticCodes: ['gate_part_overlap'],
        route,
      },
      attempts: [
        {
          attempt: 1,
          sandboxMs: 0,
          diagnostics: [],
          spatial: {
            passed: false,
            score: 0.5,
            issues: [
              'gate_part_overlap: parts "robot_arm.base" and "robot_arm.elbow_gearbox" overlap 100% of the smaller volume.',
            ],
            warnings: [],
          },
        },
      ],
      budgetUsage: { sandboxAttempts: 1, totalSandboxMs: 0, partCount: 2, wallTimeBudgetMs: 5000 },
    }
    const msg = buildDslRepairMessage(failed)
    expect(msg).toContain(
      'Move "robot_arm.elbow_gearbox" to the OUTSIDE surface of "robot_arm.base"',
    )
    expect(msg).toContain('change its position/side/atLocal offset')
  })

  it('repair message gives top-face placement guidance for buried base bolts', () => {
    const failed: Extract<DslRunResult, { kind: 'failed' }> = {
      kind: 'failed',
      downgrade: {
        reason: 'spatial_gate_failed',
        message:
          'Spatial quality gate rejected the assembly: gate_part_overlap: parts "robot_arm.base" and "robot_arm.base_bolt_1" overlap 100% of the smaller volume.',
        attempts: 1,
        diagnosticCodes: ['gate_part_overlap'],
        route,
      },
      attempts: [
        {
          attempt: 1,
          sandboxMs: 0,
          diagnostics: [],
          spatial: {
            passed: false,
            score: 0.5,
            issues: [
              'gate_part_overlap: parts "robot_arm.base" and "robot_arm.base_bolt_1" overlap 100% of the smaller volume.',
            ],
            warnings: [],
          },
        },
      ],
      budgetUsage: { sandboxAttempts: 1, totalSandboxMs: 0, partCount: 2, wallTimeBudgetMs: 5000 },
    }
    const msg = buildDslRepairMessage(failed)
    expect(msg).toContain('place bolt HEADS on the +Y/top face of "robot_arm.base"')
    expect(msg).toContain('away from central columns, shoulders, arms, or housings')
  })

  it('repair message explains how to fix zero-angle hinge declarations', () => {
    const failed: Extract<DslRunResult, { kind: 'failed' }> = {
      kind: 'failed',
      downgrade: {
        reason: 'spatial_gate_failed',
        message:
          'Spatial quality gate rejected the assembly: gate_hinge_zero_angle: part "robot_arm.wrist" declares a hinge on "robot_arm.forearm" but its world rotation is identity (0.00°).',
        attempts: 1,
        diagnosticCodes: ['gate_hinge_zero_angle'],
        route,
      },
      attempts: [
        {
          attempt: 1,
          sandboxMs: 0,
          diagnostics: [],
          spatial: {
            passed: false,
            score: 0.5,
            issues: [
              'gate_hinge_zero_angle: part "robot_arm.wrist" declares a hinge on "robot_arm.forearm" but its world rotation is identity (0.00°).',
            ],
            warnings: [],
          },
        },
      ],
      budgetUsage: { sandboxAttempts: 1, totalSandboxMs: 0, partCount: 2, wallTimeBudgetMs: 5000 },
    }
    const msg = buildDslRepairMessage(failed)
    expect(msg).toContain('Give hinged part "robot_arm.wrist"')
    expect(msg).toContain('visible non-zero default world rotation')
    expect(msg).toContain('hinge().restAngle to the same non-zero angle')
  })
})
