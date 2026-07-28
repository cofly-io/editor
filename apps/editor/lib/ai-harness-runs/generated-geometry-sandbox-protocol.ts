/**
 * Sandbox protocol — JSON-serializable request/response contract between
 * the host (runner) and the per-run worker process.
 *
 * Stage 4 of the Generator DSL plan.
 *
 * Channel: Node child_process.fork IPC (process.send / process.on('message')).
 * Payloads MUST be JSON-serializable. No functions, no class instances, no
 * host references — LLM source is treated as opaque string data only.
 */

import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import type { DSLDiagnostic } from '@pascal-app/core/lib/generated-geometry-dsl-contract'

// ---------------------------------------------------------------------------
// Budget & resource caps
// ---------------------------------------------------------------------------

export type SandboxBudget = {
  /** Hard wall-clock cap in milliseconds. Host kills the worker at deadline. */
  wallTimeMs: number
  /** IR-level budgets enforced by the compiler/validator. */
  maxParts: number
  maxVertices: number
  maxIndices: number
  /** Mesh blob byte cap (used in stage 5 when blobs exist). */
  maxMeshBytes: number
  /** Peak memory cap for the worker process (megabytes). */
  maxWorkerMemMb: number
}

export const DEFAULT_SANDBOX_BUDGET: SandboxBudget = {
  wallTimeMs: 5_000,
  maxParts: 256,
  maxVertices: 500_000,
  maxIndices: 1_500_000,
  maxMeshBytes: 64 * 1024 * 1024,
  maxWorkerMemMb: 256,
}

// ---------------------------------------------------------------------------
// Request (host → worker)
// ---------------------------------------------------------------------------

export type SandboxRequest = {
  /** Unique id for this run; the worker echoes it back. */
  requestId: string
  /** DSL API version the source was authored against. */
  apiVersion: string
  /** DSL source text. Opaque string — worker NEVER imports it as a module. */
  source: string
  /** Optional params override (revision layer). */
  params?: Record<string, unknown>
  /**
   * Base assembly revision for compare-and-swap commit. Host uses this to
   * decide whether the resulting IR can be atomically committed or whether
   * overrides have moved on.
   */
  baseAssemblyRevision: number
  /** ISO 8601 deadline; worker self-checks at loop boundaries. */
  deadline: string
  budget: SandboxBudget
}

// ---------------------------------------------------------------------------
// Response (worker → host)
// ---------------------------------------------------------------------------

export type SandboxUsage = {
  /** Wall time spent inside the worker (compile + validate). */
  wallMs: number
  /** Peak RSS of the worker process in bytes (best-effort). */
  peakMemBytes: number
  /** Number of parts in the produced IR (0 on failure). */
  partCount: number
}

export type SandboxOkResponse = {
  requestId: string
  ok: true
  ir: AssemblyIR
  irHash: string
  diagnostics: DSLDiagnostic[]
  usage: SandboxUsage
}

export type SandboxDiagnosticResponse = {
  requestId: string
  ok: false
  /** Structured diagnostics from the DSL compiler / IR validator. */
  diagnostics: DSLDiagnostic[]
  usage: SandboxUsage
}

export type SandboxErrorKind =
  | 'timeout'
  | 'budget_exceeded'
  | 'crash'
  | 'protocol_violation'
  | 'worker_unavailable'

export type SandboxErrorResponse = {
  requestId: string
  ok: false
  error: {
    kind: SandboxErrorKind
    /** Sanitized message — never includes host paths or stack traces. */
    message: string
  }
  usage?: SandboxUsage
}

export type SandboxResponse =
  | SandboxOkResponse
  | SandboxDiagnosticResponse
  | SandboxErrorResponse

// ---------------------------------------------------------------------------
// Serialization helpers (defensive — IPC must never throw)
// ---------------------------------------------------------------------------

export function serializeRequest(req: SandboxRequest): string {
  return JSON.stringify(req)
}

export function deserializeRequest(json: string): SandboxRequest | undefined {
  try {
    const v = JSON.parse(json) as unknown
    if (typeof v !== 'object' || v === null) return undefined
    const r = v as Record<string, unknown>
    if (
      typeof r.requestId !== 'string' ||
      typeof r.apiVersion !== 'string' ||
      typeof r.source !== 'string' ||
      typeof r.baseAssemblyRevision !== 'number' ||
      typeof r.deadline !== 'string' ||
      typeof r.budget !== 'object' ||
      r.budget === null
    ) {
      return undefined
    }
    return r as unknown as SandboxRequest
  } catch {
    return undefined
  }
}

export function serializeResponse(res: SandboxResponse): string {
  return JSON.stringify(res)
}

export function deserializeResponse(json: string): SandboxResponse | undefined {
  try {
    const v = JSON.parse(json) as unknown
    if (typeof v !== 'object' || v === null) return undefined
    const r = v as Record<string, unknown>
    if (typeof r.requestId !== 'string' || typeof r.ok !== 'boolean') return undefined
    return r as unknown as SandboxResponse
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Sanitization — never leak host details to the model
// ---------------------------------------------------------------------------

/**
 * Convert an unknown thrown error into a sanitized SandboxErrorResponse
 * payload. Strips file paths, stack traces, environment hints.
 */
export function sanitizeCrashError(err: unknown): { kind: 'crash'; message: string } {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown error'
  // Strip anything that looks like a file path or "at func (file:line:col)".
  const sanitized = raw
    .replace(/[A-Za-z]:[\\/][^\s)]+/g, '<path>')
    .replace(/\/[^\s)]+\.(ts|js|mts|mjs)/g, '<path>')
    .replace(/at\s+\S+\s+\([^)]*\)/g, '<frame>')
    .slice(0, 400)
  return { kind: 'crash', message: sanitized || 'worker crashed' }
}
