/**
 * Sandbox runner — the host-side entry that spawns per-run workers.
 *
 * Responsibilities:
 *  - fork() a fresh worker for every run (no pooling in v1)
 *  - send the SandboxRequest over IPC
 *  - enforce wall-clock deadline; SIGKILL the worker on timeout
 *  - retry up to N times; same source + same diagnostic codes → stop
 *  - never mutate the scene; only return the IR / diagnostics to the caller
 *  - sanitize all errors before they reach the LLM
 *
 * Compare-and-swap commit (per plan §3.5 / §阶段 4 工作项 6) is the
 * caller's responsibility — the runner just carries baseAssemblyRevision
 * through the protocol so the caller can verify it on commit.
 */

import { type ChildProcess, execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_SANDBOX_BUDGET,
  deserializeResponse,
  type SandboxBudget,
  type SandboxDiagnosticResponse,
  type SandboxErrorResponse,
  type SandboxOkResponse,
  type SandboxRequest,
  type SandboxResponse,
  serializeRequest,
} from './generated-geometry-sandbox-protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunSandboxOptions = {
  source: string
  apiVersion: string
  params?: Record<string, unknown>
  baseAssemblyRevision: number
  budget?: Partial<SandboxBudget>
  /** Max attempts (default 2 retries = 3 total). */
  maxRetries?: number
  /** Injectable id factory for tests. */
  requestIdFactory?: () => string
  /** Injectable clock for tests. */
  now?: () => number
}

export type RunSandboxResult =
  | {
      kind: 'ok'
      ir: SandboxOkResponse['ir']
      irHash: string
      diagnostics: SandboxOkResponse['diagnostics']
      usage: SandboxOkResponse['usage']
      attempts: number
    }
  | {
      kind: 'diagnostics'
      diagnostics: SandboxDiagnosticResponse['diagnostics']
      usage: SandboxDiagnosticResponse['usage']
      attempts: number
    }
  | { kind: 'error'; error: SandboxErrorResponse['error']; attempts: number }

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const WORKER_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'generated-geometry-sandbox-worker.ts',
)

/**
 * Resolve the executable used to fork the TS sandbox worker.
 *
 * The worker is TypeScript; only bun can run it directly. The dev server is
 * started via `bun --cwd apps/editor dev`, but that spawns `next dev` as a
 * plain Node process — so `process.execPath` points at node.exe and cannot
 * be used. Candidates are tried in order and must EXIST on disk (PATH lookups
 * can return stale shims, e.g. an npm_global\bun left behind by an old
 * install — spawn would then fail with ENOENT):
 *   1. DSL_SANDBOX_EXEC env (explicit override, useful in tests / CI)
 *   2. `bun` found on PATH (via `where` on Windows / `which` elsewhere)
 *   3. well-known bun install locations (per-user + system-wide)
 *   4. fall back to `process.execPath` (works only if the host IS bun)
 */
function resolveBunExecPath(): string {
  const candidates: string[] = []

  const override = process.env.DSL_SANDBOX_EXEC
  if (override && override.trim()) candidates.push(override.trim())

  try {
    const cmd = process.platform === 'win32' ? 'where bun' : 'which bun'
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    for (const line of out.split(/\r?\n/)) {
      const p = line.trim()
      if (p) candidates.push(p)
    }
  } catch {
    // bun not on PATH — fall through to well-known locations
  }

  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE ?? ''
    const localAppData = process.env.LOCALAPPDATA ?? ''
    if (home) candidates.push(`${home}\\.bun\\bin\\bun.exe`)
    if (localAppData) candidates.push(`${localAppData}\\Programs\\bun\\bun.exe`)
    candidates.push('C:\\Program Files\\bun\\bun.exe')
    // npm global install (npm i -g bun): the shim on PATH is bun.ps1, the real
    // binary lives under <npm-prefix>/node_modules/bun/bin/bun.exe. Derive the
    // prefix from npm's own config when possible.
    try {
      const prefix = execSync('npm prefix -g', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (prefix) candidates.push(`${prefix}\\node_modules\\bun\\bin\\bun.exe`)
    } catch {
      // npm unavailable — skip
    }
  } else {
    const home = process.env.HOME ?? ''
    if (home) candidates.push(`${home}/.bun/bin/bun`)
    candidates.push('/usr/local/bin/bun', '/opt/homebrew/bin/bun')
    try {
      const prefix = execSync('npm prefix -g', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (prefix) candidates.push(`${prefix}/node_modules/bun/bin/bun`)
    } catch {
      // npm unavailable — skip
    }
  }

  candidates.push(process.execPath)

  for (const candidate of candidates) {
    if (process.platform === 'win32' && !candidate.toLowerCase().endsWith('.exe')) continue
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      // keep looking
    }
  }
  // Nothing verified — return the override or first PATH hit so the spawn
  // error message at least names the path we tried.
  return candidates[0] ?? process.execPath
}

let requestCounter = 0

function defaultRequestId(): string {
  requestCounter += 1
  return `dsl_${Date.now().toString(36)}_${requestCounter}`
}

/**
 * Compile DSL source in an isolated worker process.
 *
 * Retry policy: identical source hash + identical diagnostic code set
 * stops the loop. Crashes / timeouts always retry up to maxRetries.
 */
export async function runDslSandbox(opts: RunSandboxOptions): Promise<RunSandboxResult> {
  const budget: SandboxBudget = { ...DEFAULT_SANDBOX_BUDGET, ...(opts.budget ?? {}) }
  const maxRetries = opts.maxRetries ?? 2
  const requestIdFactory = opts.requestIdFactory ?? defaultRequestId
  const now = opts.now ?? (() => Date.now())

  let attempts = 0
  let lastDiagCodeSet: string | undefined

  for (;;) {
    attempts += 1
    const requestId = requestIdFactory()
    const result = await runOnce(
      {
        requestId,
        apiVersion: opts.apiVersion,
        source: opts.source,
        ...(opts.params !== undefined ? { params: opts.params } : {}),
        baseAssemblyRevision: opts.baseAssemblyRevision,
        deadline: new Date(now() + budget.wallTimeMs).toISOString(),
        budget,
      },
      budget.wallTimeMs,
      now,
    )

    if (result.ok) {
      return {
        kind: 'ok',
        ir: result.ir,
        irHash: result.irHash,
        diagnostics: result.diagnostics,
        usage: result.usage,
        attempts,
      }
    }

    // Diagnostics (compile errors): retry only if the diagnostic code set
    // differs from the previous attempt — same source + same diagnostics
    // means retrying won't help.
    if ('diagnostics' in result && !('error' in result)) {
      const diagCodeSet = [...new Set(result.diagnostics.map((d) => d.code))].sort().join(',')
      if (lastDiagCodeSet === diagCodeSet) {
        return {
          kind: 'diagnostics',
          diagnostics: result.diagnostics,
          usage: result.usage,
          attempts,
        }
      }
      lastDiagCodeSet = diagCodeSet
      if (attempts > maxRetries) {
        return {
          kind: 'diagnostics',
          diagnostics: result.diagnostics,
          usage: result.usage,
          attempts,
        }
      }
      continue
    }

    // Hard errors (timeout / crash / budget): retry up to maxRetries.
    if ('error' in result) {
      if (attempts > maxRetries) {
        return { kind: 'error', error: (result as SandboxErrorResponse).error, attempts }
      }
      continue
    }

    // Unknown shape — treat as crash, no retry.
    return {
      kind: 'error',
      error: { kind: 'protocol_violation', message: 'unexpected worker response shape' },
      attempts,
    }
  }
}

// ---------------------------------------------------------------------------
// Single attempt
// ---------------------------------------------------------------------------

async function runOnce(
  req: SandboxRequest,
  wallTimeMs: number,
  now: () => number,
): Promise<SandboxResponse> {
  return new Promise((resolvePromise) => {
    let settled = false
    const settle = (res: SandboxResponse) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      try {
        worker?.kill('SIGKILL')
      } catch {
        // already dead
      }
      resolvePromise(res)
    }

    let worker: ChildProcess | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    try {
      worker = spawn(resolveBunExecPath(), [WORKER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err) {
      settle({
        requestId: req.requestId,
        ok: false,
        error: {
          kind: 'worker_unavailable',
          message: `failed to spawn worker: ${err instanceof Error ? err.message : 'unknown'}`,
        },
      })
      return
    }
    if (!worker) return
    worker.stderr?.on('data', (chunk: Buffer) => {
      // Cap captured stderr to avoid unbounded memory on a noisy worker.
      if (Buffer.concat(stderrChunks).length < 4096) stderrChunks.push(chunk)
    })
    worker.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))

    timer = setTimeout(() => {
      settle({
        requestId: req.requestId,
        ok: false,
        error: { kind: 'timeout', message: `worker exceeded ${wallTimeMs}ms wall time` },
      })
    }, wallTimeMs + 50) // small grace so worker's self-check fires first

    worker.on('error', (err) => {
      settle({
        requestId: req.requestId,
        ok: false,
        error: {
          kind: 'crash',
          message: `worker error: ${err.message.slice(0, 200)}`,
        },
      })
    })

    worker.on('exit', (code, signal) => {
      if (settled) return
      const response = deserializeResponse(Buffer.concat(stdoutChunks).toString('utf8').trim())
      if (response?.requestId === req.requestId) {
        settle(response)
        return
      }
      const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim()
      const stderrSuffix = stderrText ? `; stderr: ${stderrText.slice(0, 500)}` : ''
      settle({
        requestId: req.requestId,
        ok: false,
        error: {
          kind: 'crash',
          message:
            `worker exited (code=${code ?? 'null'} signal=${signal ?? 'null'}) before responding` +
            stderrSuffix,
        },
      })
    })

    try {
      worker.stdin?.end(serializeRequest(req))
    } catch (err) {
      settle({
        requestId: req.requestId,
        ok: false,
        error: {
          kind: 'worker_unavailable',
          message: `failed to send request to worker: ${err instanceof Error ? err.message : 'unknown'}`,
        },
      })
    }
  })
}
