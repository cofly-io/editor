/**
 * DSL compiler — the public entry point.
 *
 * compileDsl(source, options) → DSLCompileResult
 *
 * Pipeline:
 *   1. lex(source) → tokens
 *   2. parse(tokens) → AST
 *   3. evaluateProgram(AST, acc, diag, paramsDecls) → fills acc
 *   4. buildAssemblyIRFromBuilders(acc, hashes) → AssemblyIR
 *   5. validateAssemblyIR(ir) → diagnostics
 *   6. Return { ok, ir, irHash, diagnostics, apiVersion }
 */

import {
  DSL_API_VERSION,
  type DSLCompileResult,
  type DSLDiagnostic,
} from '@pascal-app/core/lib/generated-geometry-dsl-contract'
import { canonicalizeAssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import {
  hasAssemblyErrors,
  validateAssemblyIR,
} from '@pascal-app/core/lib/generated-assembly-validation'
import {
  buildAssemblyIRFromBuilders,
  createAssemblyAccumulator,
  stableHash,
} from './generated-geometry-dsl-builders'
import { lex } from './generated-geometry-dsl-lexer'
import { parse } from './generated-geometry-dsl-parser'
import { evaluateProgram } from './generated-geometry-dsl-evaluator'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type CompileDslOptions = {
  /** Override the DSL API version (default: DSL_API_VERSION). */
  apiVersion?: string
  /** Optional params declarations (extracted from source if not provided). */
  paramsDecls?: Record<string, unknown>
  /** Optional source hash for provenance (default: computed from source). */
  sourceHash?: string
  /** Optional params hash for provenance (default: computed from paramsDecls). */
  paramsHash?: string
}

export function compileDsl(source: string, options: CompileDslOptions = {}): DSLCompileResult {
  const diagnostics: DSLDiagnostic[] = []
  const diag = (d: DSLDiagnostic) => diagnostics.push(d)
  const apiVersion = options.apiVersion ?? DSL_API_VERSION

  if (apiVersion !== DSL_API_VERSION) {
    return {
      ok: false,
      apiVersion,
      diagnostics: [
        {
          code: 'dsl_api_version_unsupported',
          severity: 'error',
          message: `DSL API version ${apiVersion} is unsupported; this compiler implements ${DSL_API_VERSION}.`,
          retryable: false,
        },
      ],
    }
  }

  // 1. Lex
  const tokens = lex(source, diag)
  if (!tokens) return { ok: false, diagnostics, apiVersion }

  // 2. Parse
  const stmts = parse(tokens, diag)
  if (!stmts) return { ok: false, diagnostics, apiVersion }

  // 3. Evaluate
  const acc = createAssemblyAccumulator()
  const { params: paramsMap } = evaluateProgram(stmts, acc, diag, options.paramsDecls)
  if (diagnostics.some((d) => d.severity === 'error')) {
    return { ok: false, diagnostics, apiVersion }
  }

  // 4. Build IR
  const sourceHash = options.sourceHash ?? stableHash(source)
  const paramsHash =
    options.paramsHash ??
    stableHash(
      options.paramsDecls ?? Object.fromEntries([...paramsMap.entries()].map(([k, v]) => [k, v])),
    )
  const ir = buildAssemblyIRFromBuilders(acc, { sourceHash, paramsHash, apiVersion })

  // 5. Validate IR
  const irDiagnostics = validateAssemblyIR(ir)
  const hasErrors = hasAssemblyErrors(irDiagnostics)
  for (const d of irDiagnostics) {
    diag({
      code: d.code,
      severity: d.severity,
      message: d.message,
      retryable: d.severity !== 'error',
    })
  }
  if (hasErrors) return { ok: false, diagnostics, apiVersion }

  // 6. Canonicalize + hash
  const canonical = canonicalizeAssemblyIR(ir)
  const irHash = stableHash(canonical)

  return {
    ok: true,
    ir: canonical,
    irHash,
    diagnostics,
    apiVersion,
  }
}
