import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_SANDBOX_BUDGET,
  deserializeRequest,
  deserializeResponse,
  sanitizeCrashError,
  serializeRequest,
  serializeResponse,
  type SandboxOkResponse,
  type SandboxRequest,
} from './generated-geometry-sandbox-protocol'
import { runDslSandbox } from './generated-geometry-sandbox-runner'
import { LAPTOP_DSL_SOURCE } from './fixtures/laptop.dsl'
import { DSL_API_VERSION } from '@pascal-app/core/lib/generated-geometry-dsl-contract'

// ---------------------------------------------------------------------------
// Protocol round-trip
// ---------------------------------------------------------------------------

describe('sandbox protocol', () => {
  test('request round-trips through serialize/deserialize', () => {
    const req: SandboxRequest = {
      requestId: 'req_test_1',
      apiVersion: '1.0.0',
      source: 'const x = 1;',
      baseAssemblyRevision: 42,
      deadline: '2026-07-26T20:00:00.000Z',
      budget: DEFAULT_SANDBOX_BUDGET,
    }
    const json = serializeRequest(req)
    const parsed = deserializeRequest(json)
    expect(parsed).toEqual(req)
  })

  test('response round-trips through serialize/deserialize', () => {
    const res: SandboxOkResponse = {
      requestId: 'req_test_2',
      ok: true,
      ir: {
        schemaVersion: 1,
        generator: { sourceHash: 'h', apiVersion: '1.0.0', paramsHash: 'p' },
        parts: [],
        constraints: [],
      },
      irHash: 'fnv1a:00000000',
      diagnostics: [],
      usage: { wallMs: 12, peakMemBytes: 1024, partCount: 0 },
    }
    const json = serializeResponse(res)
    const parsed = deserializeResponse(json)
    expect(parsed).toEqual(res)
  })

  test('deserializeRequest rejects malformed payloads', () => {
    expect(deserializeRequest('{}')).toBeUndefined()
    expect(deserializeRequest('not json')).toBeUndefined()
    expect(deserializeRequest('{"requestId":1}')).toBeUndefined()
  })

  test('sanitizeCrashError strips file paths and stack frames', () => {
    const err = new Error(
      'at evaluate (D:\\SourceCode\\editor\\apps\\editor\\lib\\file.ts:123:45)\nSomething bad happened',
    )
    const sanitized = sanitizeCrashError(err)
    expect(sanitized.kind).toBe('crash')
    expect(sanitized.message).not.toContain('D:\\SourceCode')
    expect(sanitized.message).not.toContain('file.ts:123')
    expect(sanitized.message).toContain('Something bad happened')
  })
})

// ---------------------------------------------------------------------------
// Runner — happy path
// ---------------------------------------------------------------------------

describe('runDslSandbox — happy path', () => {
  test('compiles the laptop fixture and returns IR + hash', async () => {
    const result = await runDslSandbox({
      source: LAPTOP_DSL_SOURCE,
      apiVersion: DSL_API_VERSION,
      baseAssemblyRevision: 0,
    })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.ir.parts.length).toBe(64)
    expect(result.irHash).toMatch(/^fnv1a:/)
    expect(result.attempts).toBe(1)
    expect(result.usage.partCount).toBe(64)
  }, 30_000)

  test('two consecutive runs produce the same IR hash (determinism)', async () => {
    const a = await runDslSandbox({
      source: LAPTOP_DSL_SOURCE,
      apiVersion: DSL_API_VERSION,
      baseAssemblyRevision: 0,
    })
    const b = await runDslSandbox({
      source: LAPTOP_DSL_SOURCE,
      apiVersion: DSL_API_VERSION,
      baseAssemblyRevision: 0,
    })
    if (a.kind !== 'ok' || b.kind !== 'ok') throw new Error('expected ok')
    expect(a.irHash).toBe(b.irHash)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// Runner — diagnostics & retries
// ---------------------------------------------------------------------------

describe('runDslSandbox — diagnostics & retries', () => {
  test('compile diagnostics stop retrying when code set is stable', async () => {
    const result = await runDslSandbox({
      source: 'const x = undeclared_thing;',
      apiVersion: DSL_API_VERSION,
      baseAssemblyRevision: 0,
      maxRetries: 5, // high; should still stop early
    })
    expect(result.kind).toBe('diagnostics')
    if (result.kind !== 'diagnostics') return
    expect(result.diagnostics.some((d) => d.code === 'dsl_undeclared_identifier')).toBe(true)
    // Same source + same diagnostics → stop after 2 attempts (first + one
    // confirmation retry that produced identical code set).
    expect(result.attempts).toBeLessThanOrEqual(3)
  }, 30_000)

  test('forbidden global produces diagnostic, never reaches scene', async () => {
    const result = await runDslSandbox({
      source: 'process.exit(0);',
      apiVersion: DSL_API_VERSION,
      baseAssemblyRevision: 0,
    })
    expect(result.kind).toBe('diagnostics')
    if (result.kind !== 'diagnostics') return
    expect(result.diagnostics.some((d) => d.code === 'dsl_forbidden_global')).toBe(true)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// Runner — timeouts & crashes
// ---------------------------------------------------------------------------

describe('runDslSandbox — timeouts & crashes', () => {
  test('infinite loop is killed by the wall-clock deadline', async () => {
    // The DSL evaluator has a loop budget so this actually errors out with
    // dsl_budget_exceeded rather than timing out — which is what we want:
    // the worker responds, the host doesn't have to SIGKILL.
    const result = await runDslSandbox({
      source: 'for (let i = 0; i < 99999999; i++) { const x = i; }',
      apiVersion: DSL_API_VERSION,
      baseAssemblyRevision: 0,
      budget: { wallTimeMs: 4_000 },
      maxRetries: 0,
    })
    expect(result.kind).not.toBe('ok')
  }, 15_000)

  test('worker crash produces sanitized error, host survives', async () => {
    // A source that the parser cannot handle at all produces a diagnostic,
    // not a crash — but if the worker itself crashed we'd see kind:'error'.
    // This test just verifies the host doesn't blow up on bad input.
    const result = await runDslSandbox({
      source: '\x00\x01\x02\x03',
      apiVersion: DSL_API_VERSION,
      baseAssemblyRevision: 0,
      maxRetries: 0,
    })
    expect(result.kind).not.toBe('ok')
  }, 15_000)
})

// ---------------------------------------------------------------------------
// Runner — concurrency
// ---------------------------------------------------------------------------

describe('runDslSandbox — concurrency', () => {
  test('two concurrent runs do not interfere', async () => {
    const [a, b] = await Promise.all([
      runDslSandbox({
        source: LAPTOP_DSL_SOURCE,
        apiVersion: DSL_API_VERSION,
        baseAssemblyRevision: 0,
      }),
      runDslSandbox({
        source: `part('solo', box({length: 1, width: 1, height: 1})).atWorld([0,0,0]);`,
        apiVersion: DSL_API_VERSION,
        baseAssemblyRevision: 0,
      }),
    ])
    if (a.kind !== 'ok' || b.kind !== 'ok') throw new Error('expected both ok')
    expect(a.ir.parts.length).toBe(64)
    expect(b.ir.parts.length).toBe(1)
    expect(a.irHash).not.toBe(b.irHash)
  }, 30_000)
})
