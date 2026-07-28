/**
 * Sandbox worker — the per-run child process.
 *
 * Lifecycle: forked by the runner with a single SandboxRequest as IPC
 * payload, compiles the DSL, sends back a SandboxResponse, exits.
 *
 * Security invariants:
 *  - The worker NEVER dynamic-imports anything based on the request.
 *  - The DSL source is parsed and evaluated as data by the trusted
 *    compileDsl pipeline.
 *  - On any uncaught error the worker responds with a sanitized crash
 *    payload before exiting.
 *  - The worker self-checks its deadline at entry; if it's already past,
 *    respond with timeout immediately.
 */

import { compileDsl } from './generated-geometry-dsl-compiler'
import {
  deserializeRequest,
  type SandboxRequest,
  type SandboxResponse,
  type SandboxUsage,
  sanitizeCrashError,
  serializeResponse,
} from './generated-geometry-sandbox-protocol'

declare const process: {
  stdin: {
    setEncoding: (encoding: string) => void
    on: (event: 'data', listener: (chunk: string) => void) => void
  }
  stdout: { write: (chunk: string, callback?: () => void) => boolean }
  exit: (code: number) => never
  memoryUsage: () => { rss: number }
}

function nowMs(): number {
  return Date.now()
}

function getUsage(startMs: number, partCount: number): SandboxUsage {
  const mem = process.memoryUsage()
  return {
    wallMs: Math.max(0, nowMs() - startMs),
    peakMemBytes: mem.rss,
    partCount,
  }
}

function send(res: SandboxResponse): void {
  process.stdout.write(serializeResponse(res), () => process.exit(0))
}

function handleRequest(req: SandboxRequest): void {
  const startMs = nowMs()
  const deadlineMs = Date.parse(req.deadline)

  // Self-check: already past deadline?
  if (Number.isFinite(deadlineMs) && startMs >= deadlineMs) {
    send({
      requestId: req.requestId,
      ok: false,
      error: { kind: 'timeout', message: 'worker received request past its deadline' },
      usage: getUsage(startMs, 0),
    })
    process.exit(1)
  }

  try {
    const result = compileDsl(req.source, {
      apiVersion: req.apiVersion,
      paramsDecls: req.params,
    })

    if (result.ok) {
      const partCount = result.ir.parts.length
      const meshUsage = result.ir.parts.reduce(
        (total, part) => {
          if (part.geometry.kind !== 'mesh-blob') return total
          return {
            vertices: total.vertices + part.geometry.vertexCount,
            indices: total.indices + part.geometry.indexCount,
          }
        },
        { vertices: 0, indices: 0 },
      )
      if (partCount > req.budget.maxParts) {
        send({
          requestId: req.requestId,
          ok: false,
          error: {
            kind: 'budget_exceeded',
            message: `part count ${partCount} exceeds budget ${req.budget.maxParts}`,
          },
          usage: getUsage(startMs, partCount),
        })
        return
      }
      if (
        meshUsage.vertices > req.budget.maxVertices ||
        meshUsage.indices > req.budget.maxIndices
      ) {
        send({
          requestId: req.requestId,
          ok: false,
          error: {
            kind: 'budget_exceeded',
            message: `mesh budget exceeded (vertices=${meshUsage.vertices}/${req.budget.maxVertices}, indices=${meshUsage.indices}/${req.budget.maxIndices})`,
          },
          usage: getUsage(startMs, partCount),
        })
        return
      }
      if (process.memoryUsage().rss > req.budget.maxWorkerMemMb * 1024 * 1024) {
        send({
          requestId: req.requestId,
          ok: false,
          error: {
            kind: 'budget_exceeded',
            message: `worker memory exceeded ${req.budget.maxWorkerMemMb}MiB`,
          },
          usage: getUsage(startMs, partCount),
        })
        return
      }
      send({
        requestId: req.requestId,
        ok: true,
        ir: result.ir,
        irHash: result.irHash,
        diagnostics: result.diagnostics,
        usage: getUsage(startMs, partCount),
      })
    } else {
      send({
        requestId: req.requestId,
        ok: false,
        diagnostics: result.diagnostics,
        usage: getUsage(startMs, 0),
      })
    }
  } catch (err) {
    send({
      requestId: req.requestId,
      ok: false,
      error: sanitizeCrashError(err),
      usage: getUsage(startMs, 0),
    })
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

process.stdin.setEncoding('utf8')
process.stdin.on('data', (msg) => {
  const req = deserializeRequest(msg)
  if (!req) {
    // Cannot even echo a requestId — bail out; host will treat as crash.
    process.exit(3)
  }
  try {
    handleRequest(req)
  } catch {
    // Always exit after one request — per-run worker, no pooling in v1.
    return
  }
})
