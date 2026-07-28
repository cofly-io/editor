/**
 * Generator DSL — Prompt contract types.
 *
 * Stage 3 of the Generator DSL plan. These types describe the versioned
 * contract between:
 *   - the DSL evaluator (which compiles source to AssemblyIR)
 *   - the prompt assembly layer (which injects API cards into the model)
 *   - the diagnostics channel (which feeds structured errors back)
 *   - the params layer (which routes user revisions)
 *
 * Pure data, zero dependencies on Three.js / viewer / editor UI.
 */

import type { Vec3 } from './primitive-compose'

/** Bump on any breaking change to the DSL API, diagnostics, or params schema. */
export const DSL_API_VERSION = '1.1.0' as const

// ---------------------------------------------------------------------------
// API cards (Prompt contract §3.1)
// ---------------------------------------------------------------------------

export type DSLApiCardInput = {
  type: 'number' | 'integer' | 'string' | 'boolean' | 'Vec3' | 'MaterialPreset' | 'GeometryBuilder'
  unit?: 'm' | 'rad' | 'deg' | 'count'
  required?: boolean
  range?: [number, number]
  enum?: string[]
}

export type DSLApiCard = {
  apiVersion: string
  kind: 'geometry_api_card'
  /** Stable id, e.g. 'primitive.box', 'assembly.part', 'constraint.hinge'. */
  id: string
  category:
    | 'core'
    | 'primitive'
    | 'transform'
    | 'material'
    | 'assembly'
    | 'constraint'
    | 'industrial'
    | 'params'
  /** TypeScript-flavored signature for display in prompts. */
  signature: string
  inputs: Record<string, DSLApiCardInput>
  outputs: string
  cost: { parts?: number; vertices?: number; indices?: number }
  /** Minimal legal example. Must compile on its own. */
  example: string
}

// ---------------------------------------------------------------------------
// Params block (Prompt contract §4)
// ---------------------------------------------------------------------------

export type DSLParamType = 'number' | 'integer' | 'string' | 'boolean' | 'enum'

export type DSLParamDecl = {
  type: DSLParamType
  /** Physical unit for numeric types. */
  unit?: 'm' | 'rad' | 'deg' | 'count'
  /** Inclusive [min, max] for numeric types. */
  range?: [number, number]
  /** Allowed values for type === 'enum'. */
  enum?: string[]
  default: number | string | boolean
  /**
   * Semantic role used by the revision router to match user intent,
   * e.g. 'keyboard.key.width'. Dotted, lower_snake segments.
   */
  semanticRole: string
  /**
   * Parts this param influences. Either an exact partId, a glob with
   * `*` (single segment) / `**` (multi-segment), or `role:<semanticRole>`
   * prefix to address all parts carrying that role.
   */
  affects: string
  /** User-facing label (localized). */
  label: string
}

export type DSLParamsBlock = Record<string, DSLParamDecl>

// ---------------------------------------------------------------------------
// Diagnostics (Prompt contract §3.4)
// ---------------------------------------------------------------------------

export type DSLDiagnosticSeverity = 'error' | 'warning' | 'info'

export type DSLDiagnosticSpan = {
  /** Byte offsets into the source. */
  start: number
  end: number
  /** 1-based line / column for human rendering. */
  line: number
  column: number
}

export type DSLDiagnostic = {
  /** Stable machine code, e.g. 'dsl_undeclared_identifier'. */
  code: string
  severity: DSLDiagnosticSeverity
  span?: DSLDiagnosticSpan
  expected?: string
  actual?: string
  hint?: string
  /** False for unrecoverable structural errors (e.g. unparseable source). */
  retryable: boolean
  /** Human-readable message in en-US; localization happens upstream. */
  message: string
}

// ---------------------------------------------------------------------------
// Compilation result
// ---------------------------------------------------------------------------

export type DSLCompileOk = {
  ok: true
  ir: import('./generated-assembly-ir').AssemblyIR
  /** Hash of the canonicalized IR; deterministic per (source, params, apiVersion). */
  irHash: string
  diagnostics: DSLDiagnostic[]
  apiVersion: string
}

export type DSLCompileErr = {
  ok: false
  diagnostics: DSLDiagnostic[]
  apiVersion: string
}

export type DSLCompileResult = DSLCompileOk | DSLCompileErr

// ---------------------------------------------------------------------------
// Revision routing (Appendix A.2)
// ---------------------------------------------------------------------------

export type RevisionRoute =
  | {
      kind: 'param-update'
      /** Param key to adjust, e.g. 'keycapWidth'. */
      paramKey: string
      /** New value (within declared range). */
      newValue: number | string | boolean
      confidence: number
    }
  | {
      kind: 'part-override'
      partId: string
      /** Which override field to set. */
      field: 'material' | 'transform' | 'visibility'
      payload: Record<string, unknown>
      confidence: number
    }
  | {
      kind: 'structural-rerun'
      /** Reason the change cannot be expressed as a param or override. */
      reason: string
      confidence: number
    }
  | {
      kind: 'ambiguous'
      /** Multiple plausible candidates; UI must ask the user. */
      candidates: Array<
        | { kind: 'param'; paramKey: string; label: string; confidence: number }
        | { kind: 'part'; partId: string; label: string; confidence: number }
      >
    }

// ---------------------------------------------------------------------------
// Vector helpers exposed to the DSL (math namespace)
// ---------------------------------------------------------------------------

/** Functions injected under the `math` namespace. */
export const DSL_MATH_FUNCTIONS = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sqrt',
  'pow',
  'abs',
  'min',
  'max',
  'floor',
  'ceil',
  'round',
  'hypot',
  'clamp',
  'lerp',
] as const

export type DSLMathFunction = (typeof DSL_MATH_FUNCTIONS)[number]

export const DSL_MATH_CONSTANTS = ['PI', 'TAU', 'HALF_PI', 'DEG_TO_RAD', 'RAD_TO_DEG'] as const

// ---------------------------------------------------------------------------
// Whitelisted globals (§1 of the design doc)
// ---------------------------------------------------------------------------

/**
 * Identifiers the DSL evaluator will resolve. Anything else is a
 * `dsl_undeclared_identifier` error at compile time.
 */
export type DSLGlobalEnv = {
  // Geometry constructors
  box: unknown
  cylinder: unknown
  sphere: unknown
  cone: unknown
  frustum: unknown
  torus: unknown
  lathe: unknown
  extrude: unknown
  sweep: unknown
  // Industrial equipment semantic constructors
  equipment: unknown
  boxFrame: unknown
  belt: unknown
  rollerArray: unknown
  guardCover: unknown
  motor: unknown
  inspectionDoor: unknown
  nameplate: unknown
  // Assembly
  part: unknown
  hinge: unknown
  grid: unknown
  connect: unknown
  // Params declaration
  params: unknown
  // Math namespace
  math: unknown
}

export const DSL_ALLOWED_GLOBALS: ReadonlyArray<keyof DSLGlobalEnv> = [
  'box',
  'cylinder',
  'sphere',
  'cone',
  'frustum',
  'torus',
  'lathe',
  'extrude',
  'sweep',
  'equipment',
  'boxFrame',
  'belt',
  'rollerArray',
  'guardCover',
  'motor',
  'inspectionDoor',
  'nameplate',
  'part',
  'hinge',
  'grid',
  'connect',
  'params',
  'math',
]

/** Identifiers that are explicitly forbidden, with a tailored hint. */
export const DSL_FORBIDDEN_GLOBALS: Record<string, string> = {
  globalThis: 'no host globals are exposed to the DSL',
  window: 'browser host objects are not available in the DSL',
  self: 'browser host objects are not available in the DSL',
  process: 'Node host objects are not available in the DSL',
  require: 'use only the whitelisted DSL API; module loading is not supported',
  fetch: 'network access is not available in the DSL',
  XMLHttpRequest: 'network access is not available in the DSL',
  Date: 'time is not deterministic; the DSL cannot read the clock',
  Math: 'use the `math` namespace instead of `Math`',
  performance: 'timing is not deterministic; the DSL cannot read clocks',
  console: 'the DSL has no stdout; emit diagnostics via return values',
  eval: 'dynamic evaluation is not available in the DSL',
  Function: 'dynamic evaluation is not available in the DSL',
  Reflect: 'reflection is not available in the DSL',
  Proxy: 'proxies are not available in the DSL',
  Symbol: 'symbols are not available in the DSL',
  Promise: 'async is not available in the DSL',
  async: 'async is not available in the DSL',
}

/** Property names that, when accessed, indicate a sandbox escape attempt. */
export const DSL_FORBIDDEN_PROPERTIES: ReadonlyArray<string> = [
  '__proto__',
  'prototype',
  'constructor',
]

/** Vec3 literals must be plain 3-element arrays. Re-exported for convenience. */
export type { Vec3 }
