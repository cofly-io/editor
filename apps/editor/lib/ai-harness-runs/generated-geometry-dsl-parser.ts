/**
 * DSL parser — recursive descent, produces an AST.
 *
 * Supported syntax (MVP for laptop fixture):
 *   - const / let declarations
 *   - function declarations (named, no arrows)
 *   - if / else
 *   - for-of (const x of expr)
 *   - C-style for (let i = 0; i < n; i++ / i-- / i += expr)
 *   - literals: number / string / boolean / array / object
 *   - unary: - + !
 *   - binary: === !== < > <= >= + - * / % && ||
 *   - member access: a.b (no __proto__ / prototype / constructor)
 *   - index access: a[i]
 *   - function calls: f(args)
 *
 * Forbidden at parse time: arrow functions, ternary, template literals,
 * loose equality, spread, classes, imports.
 */

import { DSL_FORBIDDEN_PROPERTIES, type DSLDiagnostic } from '@pascal-app/core/lib/generated-geometry-dsl-contract'
import type { Token } from './generated-geometry-dsl-lexer'

export type Span = { start: number; end: number; line: number; column: number }

export type Expr =
  | { kind: 'num'; value: number; span: Span }
  | { kind: 'str'; value: string; span: Span }
  | { kind: 'bool'; value: boolean; span: Span }
  | { kind: 'ident'; name: string; span: Span }
  | { kind: 'array'; elements: Expr[]; span: Span }
  | { kind: 'object'; entries: Array<{ key: string; value: Expr }>; span: Span }
  | { kind: 'unary'; op: '-' | '+' | '!'; operand: Expr; span: Span }
  | { kind: 'binary'; op: string; left: Expr; right: Expr; span: Span }
  | { kind: 'call'; callee: Expr; args: Expr[]; span: Span }
  | { kind: 'member'; object: Expr; property: string; span: Span }
  | { kind: 'index'; object: Expr; index: Expr; span: Span }

export type Stmt =
  | { kind: 'const'; name: string; init: Expr; span: Span }
  | { kind: 'assign'; name: string; value: Expr; span: Span }
  | { kind: 'function'; name: string; params: string[]; body: Stmt[]; span: Span }
  | { kind: 'return'; value: Expr | undefined; span: Span }
  | { kind: 'expr'; expr: Expr; span: Span }
  | { kind: 'if'; cond: Expr; then: Stmt[]; else: Stmt[] | undefined; span: Span }
  | { kind: 'for-of'; varName: string; iterable: Expr; body: Stmt[]; span: Span }
  | {
      kind: 'for-c'
      initName: string
      initValue: Expr
      test: Expr
      update: { op: '++' | '--' | '+='; operand?: Expr }
      body: Stmt[]
      span: Span
    }

type Diag = (d: DSLDiagnostic) => void

export function parse(tokens: Token[], diag: Diag): Stmt[] | undefined {
  const parser = new Parser(tokens, diag)
  return parser.parse()
}

class Parser {
  private pos = 0
  constructor(
    private tokens: Token[],
    private diag: Diag,
  ) {}

  parse(): Stmt[] | undefined {
    const stmts: Stmt[] = []
    while (!this.atEof()) {
      const stmt = this.parseStatement()
      if (!stmt) return undefined
      stmts.push(stmt)
    }
    return stmts
  }

  private atEof(): boolean {
    return this.peek().kind === 'eof'
  }
  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!
  }
  private next(): Token {
    return this.tokens[this.pos++]!
  }
  private spanOf(t: Token): Span {
    return { start: t.start, end: t.end, line: t.line, column: t.column }
  }
  private err(t: Token, message: string, code = 'dsl_parse_error'): void {
    this.diag({
      code,
      severity: 'error',
      span: this.spanOf(t),
      message,
      retryable: false,
    })
  }
  private expect(value: string, what: string): Token | undefined {
    const t = this.peek()
    if (t.value !== value) {
      this.err(t, `expected ${what}, got ${t.value || t.kind}`)
      return undefined
    }
    return this.next()
  }

  private parseStatement(): Stmt | undefined {
    const t = this.peek()
    if (t.kind === 'keyword' && (t.value === 'const' || t.value === 'let')) {
      this.next()
      const nameTok = this.next()
      if (nameTok.kind !== 'ident') {
        this.err(nameTok, `expected identifier after ${t.value}`)
        return undefined
      }
      if (!this.expect('=', `'=' in ${t.value} declaration`)) return undefined
      const init = this.parseExpr()
      if (!init) return undefined
      if (!this.expect(';', `';'`)) return undefined
      return { kind: 'const', name: nameTok.value, init, span: this.spanOf(t) }
    }
    if (t.kind === 'ident' && this.peek(1).value === '=') {
      this.next()
      this.next()
      const value = this.parseExpr()
      if (!value) return undefined
      if (!this.expect(';', `';'`)) return undefined
      return { kind: 'assign', name: t.value, value, span: this.spanOf(t) }
    }
    if (t.kind === 'keyword' && t.value === 'function') {
      this.next()
      const nameTok = this.next()
      if (nameTok.kind !== 'ident') {
        this.err(nameTok, 'expected function name')
        return undefined
      }
      if (!this.expect('(', "'('")) return undefined
      const params: string[] = []
      while (this.peek().value !== ')') {
        const p = this.next()
        if (p.kind !== 'ident') {
          this.err(p, 'expected parameter name')
          return undefined
        }
        params.push(p.value)
        if (this.peek().value === ',') this.next()
        else break
      }
      if (!this.expect(')', "')'")) return undefined
      const body = this.parseBlock()
      if (!body) return undefined
      return { kind: 'function', name: nameTok.value, params, body, span: this.spanOf(t) }
    }
    if (t.kind === 'keyword' && t.value === 'return') {
      this.next()
      let value: Expr | undefined
      if (this.peek().value !== ';') {
        value = this.parseExpr()
        if (!value) return undefined
      }
      if (!this.expect(';', "';'")) return undefined
      return { kind: 'return', value, span: this.spanOf(t) }
    }
    if (t.kind === 'keyword' && t.value === 'if') {
      this.next()
      if (!this.expect('(', "'('")) return undefined
      const cond = this.parseExpr()
      if (!cond) return undefined
      if (!this.expect(')', "')'")) return undefined
      const thenBlock = this.parseBlock()
      if (!thenBlock) return undefined
      let elseBlock: Stmt[] | undefined
      if (this.peek().value === 'else') {
        this.next()
        if (this.peek().value === 'if') {
          const nested = this.parseStatement()
          if (!nested) return undefined
          elseBlock = [nested]
        } else {
          elseBlock = this.parseBlock()
          if (!elseBlock) return undefined
        }
      }
      return { kind: 'if', cond, then: thenBlock, else: elseBlock, span: this.spanOf(t) }
    }
    if (t.kind === 'keyword' && t.value === 'for') {
      return this.parseFor(t)
    }
    const expr = this.parseExpr()
    if (!expr) return undefined
    if (!this.expect(';', "';'")) return undefined
    return { kind: 'expr', expr, span: this.spanOf(t) }
  }

  private parseFor(t: Token): Stmt | undefined {
    this.next()
    if (!this.expect('(', "'('")) return undefined
    const declTok = this.next()
    if (declTok.value !== 'const' && declTok.value !== 'let') {
      this.err(
        declTok,
        `for loops must declare a loop variable with 'const' (for-of) or 'let' (C-style); got ${declTok.value}`,
      )
      return undefined
    }
    const varTok = this.next()
    if (varTok.kind !== 'ident') {
      this.err(varTok, 'expected loop variable name')
      return undefined
    }
    if (this.peek().value === 'of') {
      if (declTok.value !== 'const') {
        this.err(declTok, `for-of requires 'const', got '${declTok.value}'`)
        return undefined
      }
      this.next()
      const iterable = this.parseExpr()
      if (!iterable) return undefined
      if (!this.expect(')', "')'")) return undefined
      const body = this.parseBlock()
      if (!body) return undefined
      return { kind: 'for-of', varName: varTok.value, iterable, body, span: this.spanOf(t) }
    }
    if (!this.expect('=', "'=' in for-loop initializer")) return undefined
    const initValue = this.parseExpr()
    if (!initValue) return undefined
    if (!this.expect(';', "';'")) return undefined
    const test = this.parseExpr()
    if (!test) return undefined
    if (!this.expect(';', "';'")) return undefined
    const updateVar = this.next()
    if (updateVar.kind !== 'ident' || updateVar.value !== varTok.value) {
      this.err(updateVar, `for-loop update must reference the loop variable '${varTok.value}'`)
      return undefined
    }
    const opTok = this.next()
    let update: { op: '++' | '--' | '+='; operand?: Expr }
    if (opTok.value === '++') update = { op: '++' }
    else if (opTok.value === '--') update = { op: '--' }
    else if (opTok.value === '+=') {
      const operand = this.parseExpr()
      if (!operand) return undefined
      update = { op: '+=', operand }
    } else {
      this.err(opTok, `expected ++, --, or += in for-loop update; got ${opTok.value}`)
      return undefined
    }
    if (!this.expect(')', "')'")) return undefined
    const body = this.parseBlock()
    if (!body) return undefined
    return {
      kind: 'for-c',
      initName: varTok.value,
      initValue,
      test,
      update,
      body,
      span: this.spanOf(t),
    }
  }

  private parseBlock(): Stmt[] | undefined {
    if (!this.expect('{', "'{'")) return undefined
    const stmts: Stmt[] = []
    while (this.peek().value !== '}' && !this.atEof()) {
      const s = this.parseStatement()
      if (!s) return undefined
      stmts.push(s)
    }
    if (!this.expect('}', "'}'")) return undefined
    return stmts
  }

  private parseExpr(): Expr | undefined {
    return this.parseBinary(0)
  }

  private parseBinary(minPrec: number): Expr | undefined {
    let left = this.parseUnary()
    if (!left) return undefined
    const prec: Record<string, number> = {
      '||': 1,
      '&&': 2,
      '===': 3,
      '!==': 3,
      '<': 4,
      '>': 4,
      '<=': 4,
      '>=': 4,
      '+': 5,
      '-': 5,
      '*': 6,
      '/': 6,
      '%': 6,
    }
    for (;;) {
      const t = this.peek()
      const p = prec[t.value]
      if (p === undefined || p < minPrec) break
      this.next()
      const right = this.parseBinary(p + 1)
      if (!right) return undefined
      left = { kind: 'binary', op: t.value, left, right, span: this.spanOf(t) }
    }
    return left
  }

  private parseUnary(): Expr | undefined {
    const t = this.peek()
    if (t.value === '-' || t.value === '+' || t.value === '!') {
      this.next()
      const operand = this.parseUnary()
      if (!operand) return undefined
      return { kind: 'unary', op: t.value as '-' | '+' | '!', operand, span: this.spanOf(t) }
    }
    return this.parsePostfix()
  }

  private parsePostfix(): Expr | undefined {
    let expr = this.parsePrimary()
    if (!expr) return undefined
    for (;;) {
      const t = this.peek()
      if (t.value === '.') {
        this.next()
        const prop = this.next()
        if (prop.kind !== 'ident') {
          this.err(prop, 'expected property name after .')
          return undefined
        }
        if (DSL_FORBIDDEN_PROPERTIES.includes(prop.value)) {
          this.err(
            prop,
            `access to '${prop.value}' is not allowed in the DSL`,
            'dsl_forbidden_property',
          )
          return undefined
        }
        expr = { kind: 'member', object: expr, property: prop.value, span: this.spanOf(prop) }
        continue
      }
      if (t.value === '[') {
        this.next()
        const index = this.parseExpr()
        if (!index) return undefined
        if (!this.expect(']', "']'")) return undefined
        expr = { kind: 'index', object: expr, index, span: this.spanOf(t) }
        continue
      }
      if (t.value === '(') {
        this.next()
        const args: Expr[] = []
        while (this.peek().value !== ')') {
          const arg = this.parseExpr()
          if (!arg) return undefined
          args.push(arg)
          if (this.peek().value === ',') this.next()
          else break
        }
        if (!this.expect(')', "')'")) return undefined
        expr = { kind: 'call', callee: expr, args, span: this.spanOf(t) }
        continue
      }
      break
    }
    return expr
  }

  private parsePrimary(): Expr | undefined {
    const t = this.peek()
    if (t.kind === 'num') {
      this.next()
      const value = Number(t.value)
      if (!Number.isFinite(value)) {
        this.err(t, `invalid number literal '${t.value}'`)
        return undefined
      }
      return { kind: 'num', value, span: this.spanOf(t) }
    }
    if (t.kind === 'str') {
      this.next()
      return { kind: 'str', value: t.value, span: this.spanOf(t) }
    }
    if (t.kind === 'keyword' && (t.value === 'true' || t.value === 'false')) {
      this.next()
      return { kind: 'bool', value: t.value === 'true', span: this.spanOf(t) }
    }
    if (t.kind === 'ident') {
      this.next()
      return { kind: 'ident', name: t.value, span: this.spanOf(t) }
    }
    if (t.value === '(') {
      this.next()
      const inner = this.parseExpr()
      if (!inner) return undefined
      if (!this.expect(')', "')'")) return undefined
      return inner
    }
    if (t.value === '[') {
      this.next()
      const elements: Expr[] = []
      while (this.peek().value !== ']') {
        const el = this.parseExpr()
        if (!el) return undefined
        elements.push(el)
        if (this.peek().value === ',') this.next()
        else break
      }
      if (!this.expect(']', "']'")) return undefined
      return { kind: 'array', elements, span: this.spanOf(t) }
    }
    if (t.value === '{') {
      this.next()
      const entries: Array<{ key: string; value: Expr }> = []
      while (this.peek().value !== '}') {
        const keyTok = this.next()
        let key: string
        if (keyTok.kind === 'ident' || keyTok.kind === 'str') key = keyTok.value
        else {
          this.err(keyTok, 'expected object key (identifier or string)')
          return undefined
        }
        if (!this.expect(':', "':' in object literal")) return undefined
        const value = this.parseExpr()
        if (!value) return undefined
        entries.push({ key, value })
        if (this.peek().value === ',') this.next()
        else break
      }
      if (!this.expect('}', "'}'")) return undefined
      return { kind: 'object', entries, span: this.spanOf(t) }
    }
    this.err(t, `unexpected ${t.value || t.kind}`)
    return undefined
  }
}
