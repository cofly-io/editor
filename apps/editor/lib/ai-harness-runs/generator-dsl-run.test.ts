import { describe, expect, it } from 'bun:test'
import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import { LAPTOP_DSL_SOURCE } from './fixtures/laptop.dsl'
import { compileDsl } from './generated-geometry-dsl-compiler'
import type { RunSandboxResult } from './generated-geometry-sandbox-runner'
import { NO_SIGNALS, resolveGenerationMode } from './generation-route'
import {
  type ExecuteDslRunInput,
  executeGeneratorDslRun,
  summarizeDslRunForEvents,
} from './generator-dsl-run'

const compiled = compileDsl(LAPTOP_DSL_SOURCE)
if (!compiled.ok || !compiled.ir) throw new Error('laptop fixture must compile in test setup')
const LAPTOP_IR: AssemblyIR = compiled.ir
const LAPTOP_IR_HASH = compiled.irHash ?? 'ir-hash'

const route = resolveGenerationMode(
  { ...NO_SIGNALS, needsHierarchy: true, needsHinge: true },
  { params: { generatorDsl: true }, env: {} },
)

function input(partial: Partial<ExecuteDslRunInput>): ExecuteDslRunInput {
  return {
    source: LAPTOP_DSL_SOURCE,
    apiVersion: '1.0.0',
    route,
    ...partial,
  }
}

function fakeSandbox(result: RunSandboxResult): ExecuteDslRunInput['runSandboxImpl'] {
  return async () => result
}

const okResult: RunSandboxResult = {
  kind: 'ok',
  ir: LAPTOP_IR,
  irHash: LAPTOP_IR_HASH,
  diagnostics: [],
  usage: { wallMs: 120, peakMemBytes: 64 * 1024 * 1024, partCount: LAPTOP_IR.parts.length },
  attempts: 1,
}

const ANONYMOUS_CONVEYOR_IR: AssemblyIR = {
  schemaVersion: 1,
  generator: { sourceHash: 'anonymous-conveyor', apiVersion: '1.1.0', paramsHash: 'params' },
  parts: Array.from({ length: 4 }, (_, i) => ({
    id: `conveyor.box.${i}`,
    transform: {
      space: 'world' as const,
      position: [i * 1.5, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    },
    geometry: {
      kind: 'primitive-recipe' as const,
      recipeId: 'primitive.box',
      params: { length: 1, width: 0.4, height: 0.1 },
    },
    material: {},
    fingerprint: `anonymous-conveyor-${i}`,
  })),
  constraints: [],
}

describe('executeGeneratorDslRun', () => {
  it('happy path: valid IR + gate pass → patches with root first and generator provenance', async () => {
    const result = await executeGeneratorDslRun(
      input({
        runSandboxImpl: fakeSandbox(okResult),
        now: (() => {
          let t = 0
          return () => (t += 60)
        })(),
      }),
    )
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.irHash).toBe(LAPTOP_IR_HASH)
    expect(result.patches.length).toBe(LAPTOP_IR.parts.length + 1)
    expect(result.patches[0].node.type).toBe('generated-assembly')
    expect(result.spatial.passed).toBe(true)
    // generator provenance carried onto the root node
    const root = result.rootNode
    expect(root.generator.sourceHash).toBe(LAPTOP_IR.generator.sourceHash)
    expect(root.generator.irHash).toBe(LAPTOP_IR_HASH)
    expect(root.generator.source).toBe(LAPTOP_DSL_SOURCE)
    expect(result.budgetUsage.partCount).toBe(LAPTOP_IR.parts.length)
    expect(result.budgetUsage.totalSandboxMs).toBe(60)
  })

  it('compile diagnostics → failed with compile_diagnostics, zero patches', async () => {
    const result = await executeGeneratorDslRun(
      input({
        runSandboxImpl: fakeSandbox({
          kind: 'diagnostics',
          diagnostics: [
            {
              code: 'dsl_forbidden_global',
              severity: 'error',
              message: 'process is not available',
              retryable: false,
            },
          ],
          usage: { wallMs: 40, peakMemBytes: 32 * 1024 * 1024, partCount: 0 },
          attempts: 1,
        }),
      }),
    )
    expect(result.kind).toBe('failed')
    if (result.kind !== 'failed') return
    expect(result.downgrade.reason).toBe('compile_diagnostics')
    expect(result.downgrade.diagnosticCodes).toEqual(['dsl_forbidden_global'])
    // explicit downgrade record carries the route + flag state
    expect(result.downgrade.route.mode).toBe('generator_dsl')
  })

  it('sandbox timeout → failed with budget_exceeded', async () => {
    const result = await executeGeneratorDslRun(
      input({
        runSandboxImpl: fakeSandbox({
          kind: 'error',
          error: { kind: 'timeout', message: 'worker exceeded 5000ms wall time' },
          attempts: 3,
        }),
      }),
    )
    expect(result.kind).toBe('failed')
    if (result.kind !== 'failed') return
    expect(result.downgrade.reason).toBe('budget_exceeded')
    expect(result.downgrade.diagnosticCodes).toEqual(['sandbox_timeout'])
    expect(result.budgetUsage.sandboxAttempts).toBe(3)
  })

  it('spatial gate rejection → failed with spatial_gate_failed and gate codes recorded', async () => {
    // Collapse all keys onto one position → gate_duplicate_position
    const collapsed: AssemblyIR = {
      ...LAPTOP_IR,
      parts: LAPTOP_IR.parts.map((p) =>
        p.id.startsWith('keyboard.key.')
          ? {
              ...p,
              transform: { ...p.transform, position: [0, 0.024, 0] as [number, number, number] },
            }
          : p,
      ),
    }
    const result = await executeGeneratorDslRun(
      input({
        runSandboxImpl: fakeSandbox({ ...okResult, ir: collapsed }),
      }),
    )
    expect(result.kind).toBe('failed')
    if (result.kind !== 'failed') return
    expect(result.downgrade.reason).toBe('spatial_gate_failed')
    expect(result.downgrade.diagnosticCodes).toContain('gate_duplicate_position')
  })

  it('realism gate rejection fails when conveyor output is anonymous primitive piles', async () => {
    const result = await executeGeneratorDslRun(
      input({
        source: "part('conveyor.box.0', box({ length: 1, width: 1, height: 1 }))",
        apiVersion: '1.1.0',
        runSandboxImpl: fakeSandbox({
          kind: 'ok',
          ir: ANONYMOUS_CONVEYOR_IR,
          irHash: 'anonymous-conveyor-hash',
          diagnostics: [],
          usage: {
            wallMs: 10,
            peakMemBytes: 16 * 1024 * 1024,
            partCount: ANONYMOUS_CONVEYOR_IR.parts.length,
          },
          attempts: 1,
        }),
      }),
    )
    expect(result.kind).toBe('failed')
    if (result.kind !== 'failed') return
    expect(result.downgrade.reason).toBe('realism_gate_failed')
    expect(result.downgrade.diagnosticCodes).toContain('realism_missing_required_role')
    expect(result.attempts[0]?.realism?.passed).toBe(false)
  })

  it('placement options flow through to the patch plan', async () => {
    const result = await executeGeneratorDslRun(
      input({
        runSandboxImpl: fakeSandbox(okResult),
        placement: {
          origin: [1, 0, 2],
          name: 'laptop-1',
          parentId: 'level_1',
          overrides: [{ partId: 'laptop.base', visibility: false }],
        },
      }),
    )
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.rootNode.position).toEqual([1, 0, 2])
    expect(result.rootNode.name).toBe('laptop-1')
    expect(result.patches[0].parentId).toBe('level_1')
    const baseNode = result.nodeIdByPartId.get('laptop.base')
    const basePatch = result.patches.find((p) => p.node.id === baseNode)
    expect(basePatch?.node.visible).toBe(false)
  })
})

describe('summarizeDslRunForEvents', () => {
  it('ok summary contains irHash, partCount, budget usage', async () => {
    const result = await executeGeneratorDslRun(input({ runSandboxImpl: fakeSandbox(okResult) }))
    const summary = summarizeDslRunForEvents(result)
    expect(summary.outcome).toBe('ok')
    expect(summary.irHash).toBe(LAPTOP_IR_HASH)
    expect(summary.partCount).toBe(LAPTOP_IR.parts.length)
    expect(summary.budgetUsage).toMatchObject({ sandboxAttempts: 1 })
  })

  it('failed summary contains the downgrade record', async () => {
    const result = await executeGeneratorDslRun(
      input({
        runSandboxImpl: fakeSandbox({
          kind: 'error',
          error: { kind: 'crash', message: 'worker exited' },
          attempts: 3,
        }),
      }),
    )
    const summary = summarizeDslRunForEvents(result)
    expect(summary.outcome).toBe('failed')
    expect(summary.downgrade).toMatchObject({ reason: 'sandbox_error', attempts: 1 })
  })
})
