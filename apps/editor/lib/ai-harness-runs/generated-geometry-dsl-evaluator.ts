/**
 * DSL evaluator — statically evaluates the AST produced by the parser.
 *
 * Whitelist-only. No host capabilities. Deterministic.
 */

import {
  DSL_ALLOWED_GLOBALS,
  DSL_FORBIDDEN_GLOBALS,
  type DSLDiagnostic,
} from '@pascal-app/core/lib/generated-geometry-dsl-contract'
import type {
  AssemblyAccumulator,
  GeometryBuilder,
  PartBuilder,
} from './generated-geometry-dsl-builders'
import { createDslApiBuilders } from './generated-geometry-dsl-builders'
import type { Expr, Stmt } from './generated-geometry-dsl-parser'

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export type Value =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'array'; v: Value[] }
  | { t: 'object'; v: Map<string, Value> }
  | { t: 'builder'; v: PartBuilder }
  | { t: 'geometry'; v: GeometryBuilder }
  | { t: 'fn'; name: string; v: (args: Value[]) => Value | undefined }
  | { t: 'user-fn'; name: string; params: string[]; body: Stmt[]; closure: Env }
  | { t: 'void' }

export type Env = {
  parent: Env | undefined
  bindings: Map<string, Value>
}

function envLookup(env: Env, name: string): Value | undefined {
  let cur: Env | undefined = env
  while (cur) {
    const v = cur.bindings.get(name)
    if (v !== undefined) return v
    cur = cur.parent
  }
  return undefined
}

function envAssign(env: Env, name: string, value: Value): boolean {
  let cur: Env | undefined = env
  while (cur) {
    if (cur.bindings.has(name)) {
      cur.bindings.set(name, value)
      return true
    }
    cur = cur.parent
  }
  return false
}

function isTruthy(v: Value): boolean {
  switch (v.t) {
    case 'bool':
      return v.v
    case 'num':
      return v.v !== 0
    case 'str':
      return v.v.length > 0
    case 'array':
      return v.v.length > 0
    case 'void':
      return false
    default:
      return true
  }
}

function valueEquals(a: Value, b: Value): boolean {
  if (a.t !== b.t) return false
  if (a.t === 'num' && b.t === 'num') return a.v === b.v
  if (a.t === 'str' && b.t === 'str') return a.v === b.v
  if (a.t === 'bool' && b.t === 'bool') return a.v === b.v
  return false
}

function valueToString(v: Value): string {
  switch (v.t) {
    case 'num':
      return String(v.v)
    case 'str':
      return v.v
    case 'bool':
      return String(v.v)
    case 'array':
      return `[${v.v.map(valueToString).join(', ')}]`
    case 'object':
      return '{...}'
    case 'builder':
      return `<part ${v.v.id}>`
    case 'geometry':
      return `<geometry ${v.v.kind}>`
    case 'fn':
    case 'user-fn':
      return '<function>'
    case 'void':
      return 'undefined'
  }
}

class ReturnSignal {
  constructor(public value: Value) {}
}

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------

export type EvalContext = {
  diag: (d: DSLDiagnostic) => void
  env: Env
  loopBudget: { remaining: number }
  callDepth: { current: number }
  acc: AssemblyAccumulator
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function evalExpr(expr: Expr, ctx: EvalContext): Value | undefined {
  const { diag } = ctx
  switch (expr.kind) {
    case 'num':
      return { t: 'num', v: expr.value }
    case 'str':
      return { t: 'str', v: expr.value }
    case 'bool':
      return { t: 'bool', v: expr.value }
    case 'ident': {
      const v = envLookup(ctx.env, expr.name)
      if (v) return v
      const forbiddenHint = DSL_FORBIDDEN_GLOBALS[expr.name]
      diag({
        code: forbiddenHint ? 'dsl_forbidden_global' : 'dsl_undeclared_identifier',
        severity: 'error',
        span: expr.span,
        actual: expr.name,
        hint: forbiddenHint,
        message: forbiddenHint
          ? `'${expr.name}' is not available: ${forbiddenHint}`
          : `'${expr.name}' is not declared. Use const, a param from the params block, or one of: ${DSL_ALLOWED_GLOBALS.join(', ')}.`,
        retryable: true,
      })
      return undefined
    }
    case 'array': {
      const out: Value[] = []
      for (const el of expr.elements) {
        const v = evalExpr(el, ctx)
        if (!v) return undefined
        out.push(v)
      }
      return { t: 'array', v: out }
    }
    case 'object': {
      const m = new Map<string, Value>()
      for (const { key, value } of expr.entries) {
        const v = evalExpr(value, ctx)
        if (!v) return undefined
        m.set(key, v)
      }
      return { t: 'object', v: m }
    }
    case 'unary': {
      const operand = evalExpr(expr.operand, ctx)
      if (!operand) return undefined
      if (expr.op === '!') return { t: 'bool', v: !isTruthy(operand) }
      if (operand.t !== 'num') {
        diag({
          code: 'dsl_type_error',
          severity: 'error',
          span: expr.span,
          expected: 'number',
          actual: operand.t,
          message: `unary ${expr.op} requires a number, got ${operand.t}`,
          retryable: true,
        })
        return undefined
      }
      return { t: 'num', v: expr.op === '-' ? -operand.v : operand.v }
    }
    case 'binary': {
      const l = evalExpr(expr.left, ctx)
      if (!l) return undefined
      const r = evalExpr(expr.right, ctx)
      if (!r) return undefined
      switch (expr.op) {
        case '+':
          if (l.t === 'num' && r.t === 'num') return { t: 'num', v: l.v + r.v }
          if (l.t === 'str' && r.t === 'str') return { t: 'str', v: l.v + r.v }
          if (l.t === 'str' && r.t === 'num') return { t: 'str', v: l.v + String(r.v) }
          if (l.t === 'num' && r.t === 'str') return { t: 'str', v: String(l.v) + r.v }
          break
        case '-':
          if (l.t === 'num' && r.t === 'num') return { t: 'num', v: l.v - r.v }
          break
        case '*':
          if (l.t === 'num' && r.t === 'num') return { t: 'num', v: l.v * r.v }
          break
        case '/':
          if (l.t === 'num' && r.t === 'num') {
            if (r.v === 0) {
              diag({
                code: 'dsl_division_by_zero',
                severity: 'error',
                span: expr.span,
                message: 'division by zero',
                retryable: true,
              })
              return undefined
            }
            return { t: 'num', v: l.v / r.v }
          }
          break
        case '%':
          if (l.t === 'num' && r.t === 'num') return { t: 'num', v: l.v % r.v }
          break
        case '===':
          return { t: 'bool', v: valueEquals(l, r) }
        case '!==':
          return { t: 'bool', v: !valueEquals(l, r) }
        case '<':
          if (l.t === 'num' && r.t === 'num') return { t: 'bool', v: l.v < r.v }
          break
        case '>':
          if (l.t === 'num' && r.t === 'num') return { t: 'bool', v: l.v > r.v }
          break
        case '<=':
          if (l.t === 'num' && r.t === 'num') return { t: 'bool', v: l.v <= r.v }
          break
        case '>=':
          if (l.t === 'num' && r.t === 'num') return { t: 'bool', v: l.v >= r.v }
          break
        case '&&':
          return isTruthy(l) ? r : l
        case '||':
          return isTruthy(l) ? l : r
      }
      diag({
        code: 'dsl_type_error',
        severity: 'error',
        span: expr.span,
        message: `cannot apply '${expr.op}' to ${l.t} and ${r.t}`,
        retryable: true,
      })
      return undefined
    }
    case 'member': {
      const obj = evalExpr(expr.object, ctx)
      if (!obj) return undefined
      return accessMember(obj, expr.property, expr.span, ctx)
    }
    case 'index': {
      const obj = evalExpr(expr.object, ctx)
      if (!obj) return undefined
      const idx = evalExpr(expr.index, ctx)
      if (!idx) return undefined
      if (obj.t === 'array') {
        if (idx.t !== 'num') {
          diag({
            code: 'dsl_type_error',
            severity: 'error',
            span: expr.span,
            message: `array index must be a number, got ${idx.t}`,
            retryable: true,
          })
          return undefined
        }
        const i = Math.trunc(idx.v)
        if (i < 0 || i >= obj.v.length) {
          diag({
            code: 'dsl_index_out_of_bounds',
            severity: 'error',
            span: expr.span,
            message: `array index ${i} out of bounds (length ${obj.v.length})`,
            retryable: true,
          })
          return undefined
        }
        return obj.v[i]
      }
      if (obj.t === 'object') {
        if (idx.t !== 'str') {
          diag({
            code: 'dsl_type_error',
            severity: 'error',
            span: expr.span,
            message: `object index must be a string, got ${idx.t}`,
            retryable: true,
          })
          return undefined
        }
        return obj.v.get(idx.v)
      }
      diag({
        code: 'dsl_type_error',
        severity: 'error',
        span: expr.span,
        message: `cannot index into ${obj.t}`,
        retryable: true,
      })
      return undefined
    }
    case 'call': {
      const callee = evalExpr(expr.callee, ctx)
      if (!callee) return undefined
      const args: Value[] = []
      for (const argExpr of expr.args) {
        const a = evalExpr(argExpr, ctx)
        if (!a) return undefined
        args.push(a)
      }
      return callValue(callee, args, expr.span, ctx)
    }
  }
}

function accessMember(
  obj: Value,
  property: string,
  span: { start: number; end: number; line: number; column: number },
  ctx: EvalContext,
): Value | undefined {
  const { diag } = ctx
  if (obj.t === 'object') {
    const v = obj.v.get(property)
    if (v === undefined) {
      diag({
        code: 'dsl_undeclared_identifier',
        severity: 'error',
        span,
        message: `object has no property '${property}'`,
        retryable: true,
      })
      return undefined
    }
    return v
  }
  if (obj.t === 'array') {
    if (property === 'length') return { t: 'num', v: obj.v.length }
    diag({
      code: 'dsl_unsupported_member',
      severity: 'error',
      span,
      message: `array member '${property}' is not supported; use index access or .length`,
      retryable: true,
    })
    return undefined
  }
  if (obj.t === 'builder') {
    // PartBuilder method access — return a bound function
    const builder = obj.v
    const method = (builder as unknown as Record<string, unknown>)[property]
    if (typeof method === 'function') {
      return {
        t: 'fn',
        name: `${builder.id}.${property}`,
        v: (args: Value[]) => {
          const result = (method as (...a: unknown[]) => unknown).apply(
            builder,
            args.map(valueToHost),
          )
          return hostToValue(result)
        },
      }
    }
    diag({
      code: 'dsl_unsupported_member',
      severity: 'error',
      span,
      message: `part builder has no member '${property}'`,
      retryable: true,
    })
    return undefined
  }
  diag({
    code: 'dsl_type_error',
    severity: 'error',
    span,
    message: `cannot access member '${property}' on ${obj.t}`,
    retryable: true,
  })
  return undefined
}

function callValue(
  callee: Value,
  args: Value[],
  span: { start: number; end: number; line: number; column: number },
  ctx: EvalContext,
): Value | undefined {
  const { diag } = ctx
  if (callee.t === 'fn') {
    return callee.v(args)
  }
  if (callee.t === 'user-fn') {
    if (ctx.callDepth.current >= 64) {
      diag({
        code: 'dsl_budget_exceeded',
        severity: 'error',
        span,
        message: 'function call depth exceeds budget 64',
        retryable: false,
      })
      return undefined
    }
    if (args.length !== callee.params.length) {
      diag({
        code: 'dsl_arity_mismatch',
        severity: 'error',
        span,
        expected: `${callee.params.length} args`,
        actual: `${args.length} args`,
        message: `function '${callee.name}' expects ${callee.params.length} arguments, got ${args.length}`,
        retryable: true,
      })
      return undefined
    }
    const fnEnv: Env = {
      parent: callee.closure,
      bindings: new Map(callee.params.map((p, i) => [p, args[i]!])),
    }
    const fnCtx: EvalContext = { ...ctx, env: fnEnv }
    ctx.callDepth.current += 1
    try {
      for (const stmt of callee.body) {
        evalStmt(stmt, fnCtx)
      }
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value
      throw e
    } finally {
      ctx.callDepth.current -= 1
    }
    return { t: 'void' }
  }
  diag({
    code: 'dsl_type_error',
    severity: 'error',
    span,
    message: `cannot call ${callee.t} (${valueToString(callee)})`,
    retryable: true,
  })
  return undefined
}

function evalStmt(stmt: Stmt, ctx: EvalContext): void {
  const { diag } = ctx
  switch (stmt.kind) {
    case 'const': {
      const v = evalExpr(stmt.init, ctx)
      if (v === undefined) return
      ctx.env.bindings.set(stmt.name, v)
      return
    }
    case 'assign': {
      const v = evalExpr(stmt.value, ctx)
      if (v === undefined) return
      if (!envAssign(ctx.env, stmt.name, v)) {
        diag({
          code: 'dsl_undeclared_identifier',
          severity: 'error',
          span: stmt.span,
          actual: stmt.name,
          message: `'${stmt.name}' is not declared. Assign only to variables declared with let or const in the DSL source.`,
          retryable: true,
        })
      }
      return
    }
    case 'function': {
      ctx.env.bindings.set(stmt.name, {
        t: 'user-fn',
        name: stmt.name,
        params: stmt.params,
        body: stmt.body,
        closure: ctx.env,
      })
      return
    }
    case 'return': {
      const v: Value = (stmt.value ? evalExpr(stmt.value, ctx) : undefined) ?? { t: 'void' }
      throw new ReturnSignal(v)
    }
    case 'expr': {
      evalExpr(stmt.expr, ctx)
      return
    }
    case 'if': {
      const c = evalExpr(stmt.cond, ctx)
      if (!c) return
      const block = isTruthy(c) ? stmt.then : stmt.else
      if (block) {
        for (const s of block) evalStmt(s, ctx)
      }
      return
    }
    case 'for-of': {
      const iterable = evalExpr(stmt.iterable, ctx)
      if (!iterable) return
      if (iterable.t !== 'array') {
        diag({
          code: 'dsl_type_error',
          severity: 'error',
          span: stmt.span,
          message: `for-of requires an array, got ${iterable.t}`,
          retryable: true,
        })
        return
      }
      for (const item of iterable.v) {
        if (ctx.loopBudget.remaining <= 0) {
          diag({
            code: 'dsl_budget_exceeded',
            severity: 'error',
            span: stmt.span,
            message: 'loop iteration budget exceeded',
            retryable: false,
          })
          return
        }
        ctx.loopBudget.remaining -= 1
        const loopEnv: Env = {
          parent: ctx.env,
          bindings: new Map([[stmt.varName, item]]),
        }
        const loopCtx: EvalContext = { ...ctx, env: loopEnv }
        for (const s of stmt.body) evalStmt(s, loopCtx)
      }
      return
    }
    case 'for-c': {
      const initVal = evalExpr(stmt.initValue, ctx)
      if (!initVal) return
      if (initVal.t !== 'num') {
        diag({
          code: 'dsl_type_error',
          severity: 'error',
          span: stmt.span,
          message: `for-loop initializer must be a number, got ${initVal.t}`,
          retryable: true,
        })
        return
      }
      let i = initVal.v
      for (;;) {
        if (ctx.loopBudget.remaining <= 0) {
          diag({
            code: 'dsl_budget_exceeded',
            severity: 'error',
            span: stmt.span,
            message: 'loop iteration budget exceeded',
            retryable: false,
          })
          return
        }
        ctx.loopBudget.remaining -= 1
        const loopEnv: Env = {
          parent: ctx.env,
          bindings: new Map([[stmt.initName, { t: 'num', v: i }]]),
        }
        const loopCtx: EvalContext = { ...ctx, env: loopEnv }
        const testVal = evalExpr(stmt.test, loopCtx)
        if (!testVal) return
        if (!isTruthy(testVal)) break
        for (const s of stmt.body) evalStmt(s, loopCtx)
        // update
        switch (stmt.update.op) {
          case '++':
            i += 1
            break
          case '--':
            i -= 1
            break
          case '+=': {
            const step = stmt.update.operand ? evalExpr(stmt.update.operand, loopCtx) : undefined
            if (step?.t === 'num') i += step.v
            break
          }
        }
      }
      return
    }
  }
}

// ---------------------------------------------------------------------------
// Value <-> host conversion
// ---------------------------------------------------------------------------

function valueToHost(v: Value): unknown {
  switch (v.t) {
    case 'num':
      return v.v
    case 'str':
      return v.v
    case 'bool':
      return v.v
    case 'array':
      return v.v.map(valueToHost)
    case 'object': {
      const o: Record<string, unknown> = {}
      for (const [k, val] of v.v) o[k] = valueToHost(val)
      return o
    }
    case 'builder':
      return v.v
    case 'geometry':
      return v.v
    case 'fn':
    case 'user-fn':
      return v
    case 'void':
      return undefined
  }
}

function hostToValue(v: unknown): Value | undefined {
  if (v === undefined || v === null) return { t: 'void' }
  if (typeof v === 'number') return { t: 'num', v }
  if (typeof v === 'string') return { t: 'str', v }
  if (typeof v === 'boolean') return { t: 'bool', v }
  if (Array.isArray(v)) {
    const items = v.map(hostToValue)
    if (items.some((x) => x === undefined)) return undefined
    return { t: 'array', v: items as Value[] }
  }
  if (typeof v === 'object') {
    // Check if it's a PartBuilder
    if ('id' in v && 'geometry' in v && 'position' in v && 'rotation' in v) {
      return { t: 'builder', v: v as PartBuilder }
    }
    // Check if it's a GeometryBuilder
    if ('kind' in v && typeof (v as { kind: unknown }).kind === 'string') {
      return { t: 'geometry', v: v as GeometryBuilder }
    }
    const m = new Map<string, Value>()
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const hv = hostToValue(val)
      if (hv !== undefined) m.set(k, hv)
    }
    return { t: 'object', v: m }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function evaluateProgram(
  stmts: Stmt[],
  acc: AssemblyAccumulator,
  diag: (d: DSLDiagnostic) => void,
  paramsDecls: Record<string, unknown> | undefined,
): { params: Map<string, Value> } {
  const env: Env = { parent: undefined, bindings: new Map() }
  const ctx: EvalContext = {
    diag,
    env,
    loopBudget: { remaining: 10_000 },
    callDepth: { current: 0 },
    acc,
  }

  // Inject params declarations
  const paramsMap = new Map<string, Value>()
  if (paramsDecls) {
    for (const [key, decl] of Object.entries(paramsDecls)) {
      if (typeof decl === 'object' && decl !== null && 'default' in decl) {
        const d = decl as Record<string, unknown>
        const defaultVal = d.default
        if (typeof defaultVal === 'number') paramsMap.set(key, { t: 'num', v: defaultVal })
        else if (typeof defaultVal === 'string') paramsMap.set(key, { t: 'str', v: defaultVal })
        else if (typeof defaultVal === 'boolean') paramsMap.set(key, { t: 'bool', v: defaultVal })
      }
    }
  }

  // Inject DSL API into global env
  const api = createDslApiBuilders({
    acc,
    onDiagnostic: (msg, code) =>
      diag({
        code: code ?? 'dsl_api_error',
        severity: 'error',
        message: msg,
        retryable: true,
      }),
  })
  for (const [k, v] of Object.entries(api)) {
    if (k === 'apiVersion') continue
    if (k === 'params') {
      // params({key: {default: X, ...}, ...}) → returns {key: X, ...}
      // so P.keycapWidth resolves to the param's default value (or override).
      env.bindings.set(k, {
        t: 'fn',
        name: 'params',
        v: (args) => {
          const declsArg = args[0]
          if (!declsArg || declsArg.t !== 'object') return { t: 'void' }
          const resolved = new Map<string, Value>()
          for (const [paramKey, declVal] of declsArg.v) {
            if (declVal.t === 'object') {
              const def = declVal.v.get('default')
              if (def) {
                resolved.set(paramKey, def)
                paramsMap.set(paramKey, def)
              }
            }
          }
          return { t: 'object', v: resolved }
        },
      })
      continue
    }
    if (k === 'math') {
      // math namespace is an object with functions
      const mathObj = new Map<string, Value>()
      for (const [mk, mv] of Object.entries(v as Record<string, unknown>)) {
        if (typeof mv === 'function') {
          mathObj.set(mk, {
            t: 'fn',
            name: `math.${mk}`,
            v: (args) => {
              const nums = args.map((a) => (a.t === 'num' ? a.v : NaN))
              const result = (mv as (...n: number[]) => number)(...nums)
              return { t: 'num', v: result }
            },
          })
        } else if (typeof mv === 'number') {
          mathObj.set(mk, { t: 'num', v: mv })
        }
      }
      env.bindings.set(k, { t: 'object', v: mathObj })
      continue
    }
    // Geometry constructors and assembly functions
    env.bindings.set(k, {
      t: 'fn',
      name: k,
      v: (args) => {
        const hostArgs = args.map(valueToHost)
        const result = (v as (...a: unknown[]) => unknown)(...hostArgs)
        return hostToValue(result)
      },
    })
  }

  // Evaluate all statements (P is bound via `const P = params({...})` in source)
  for (const stmt of stmts) {
    try {
      evalStmt(stmt, ctx)
    } catch (e) {
      if (e instanceof ReturnSignal) {
        diag({
          code: 'dsl_parse_error',
          severity: 'error',
          message: 'return statement outside function',
          retryable: false,
        })
        break
      }
      throw e
    }
  }

  // Surface builder-accumulated errors (e.g. atLocal without childOf,
  // rotateAround before atWorld, world/local mismatch).
  for (const part of acc.parts) {
    for (const err of part.__errors) {
      diag({
        code: err.code,
        severity: 'error',
        message: err.message,
        retryable: true,
      })
    }
  }

  return { params: paramsMap }
}
