/**
 * Geometry tool diagnostics.
 *
 * Stage 1 of the Generator DSL plan: stop silently degrading LLM intent.
 * When the compiler/normalizer cannot honor an input (unparseable rotation,
 * unrecognized array semantics, contradictory layout), it must emit a
 * structured diagnostic instead of guessing a fallback. The executor feeds
 * these back to the model and does NOT create scene nodes on error.
 */

export type GeometryDiagnosticSeverity = 'error' | 'warning' | 'info'

export type GeometryDiagnostic = {
  /** Stable machine-readable code, e.g. 'rotation_unparseable'. */
  code: string
  severity: GeometryDiagnosticSeverity
  /** Human + model readable message, includes expected format & alternative. */
  message: string
  /** Optional field path / shape label for localization. */
  path?: string
}

export type GeometryDiagnosticCollector = {
  diagnostics: GeometryDiagnostic[]
  error: (code: string, message: string, path?: string) => void
  warn: (code: string, message: string, path?: string) => void
  info: (code: string, message: string, path?: string) => void
  hasErrors: () => boolean
}

export function createGeometryDiagnosticCollector(): GeometryDiagnosticCollector {
  const diagnostics: GeometryDiagnostic[] = []
  const push = (severity: GeometryDiagnosticSeverity) => {
    return (code: string, message: string, path?: string) => {
      diagnostics.push(path ? { code, severity, message, path } : { code, severity, message })
    }
  }
  return {
    diagnostics,
    error: push('error'),
    warn: push('warning'),
    info: push('info'),
    hasErrors: () => diagnostics.some((d) => d.severity === 'error'),
  }
}

/** Render diagnostics as the executor's plain-string issue list. */
export function geometryDiagnosticMessages(diagnostics: readonly GeometryDiagnostic[]): string[] {
  return diagnostics.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message))
}
