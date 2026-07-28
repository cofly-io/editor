/**
 * DSL lexer — converts source text into a token stream.
 *
 * Whitelist-only. Any character or token form we do not recognize is a
 * compile error (no silent fallback).
 */

import { DSL_FORBIDDEN_PROPERTIES, type DSLDiagnostic } from '@pascal-app/core/lib/generated-geometry-dsl-contract'

export type TokenKind = 'num' | 'str' | 'ident' | 'punct' | 'keyword' | 'eof'

export type Token = {
  kind: TokenKind
  value: string
  start: number
  end: number
  line: number
  column: number
}

export const DSL_BUDGET = {
  maxSourceBytes: 64 * 1024,
  maxTokens: 32_000,
  maxLoopIterations: 10_000,
  maxCallDepth: 64,
  maxArrayLength: 10_000,
  maxStringLength: 4_096,
  maxParts: 256,
} as const

const KEYWORDS = new Set([
  'const',
  'let',
  'function',
  'return',
  'if',
  'else',
  'for',
  'of',
  'true',
  'false',
])

type Diag = (d: DSLDiagnostic) => void

export function lex(source: string, diag: Diag): Token[] | undefined {
  if (source.length > DSL_BUDGET.maxSourceBytes) {
    diag({
      code: 'dsl_budget_exceeded',
      severity: 'error',
      message: `source size ${source.length} exceeds budget ${DSL_BUDGET.maxSourceBytes}`,
      retryable: false,
    })
    return undefined
  }

  const tokens: Token[] = []
  let i = 0
  let line = 1
  let lineStart = 0

  const err = (message: string, start: number, end: number, code = 'dsl_lex_error'): void => {
    diag({
      code,
      severity: 'error',
      span: { start, end, line, column: start - lineStart + 1 },
      message,
      retryable: false,
    })
  }

  while (i < source.length) {
    const c = source[i]!
    if (c === '\n') {
      line++
      i++
      lineStart = i
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++
      continue
    }
    if (c === '/' && source[i + 1] === '*') {
      const start = i
      i += 2
      let closed = false
      while (i < source.length) {
        if (source[i] === '*' && source[i + 1] === '/') {
          i += 2
          closed = true
          break
        }
        if (source[i] === '\n') {
          line++
          lineStart = i + 1
        }
        i++
      }
      if (!closed) {
        err('unterminated block comment', start, i)
        return undefined
      }
      continue
    }
    if (c === '"' || c === "'") {
      const quote = c
      const start = i
      const startCol = i - lineStart + 1
      i++
      let value = ''
      let closed = false
      while (i < source.length) {
        const ch = source[i]!
        if (ch === '\\') {
          const next = source[i + 1]
          if (next === 'n') value += '\n'
          else if (next === 't') value += '\t'
          else if (next === 'r') value += '\r'
          else if (next === '\\') value += '\\'
          else if (next === quote) value += quote
          else {
            err(`unsupported escape \\${next}`, i, i + 2, 'dsl_unsupported_syntax')
            return undefined
          }
          i += 2
          continue
        }
        if (ch === quote) {
          i++
          closed = true
          break
        }
        if (ch === '\n') {
          err('unterminated string literal', start, i)
          return undefined
        }
        value += ch
        i++
      }
      if (!closed) {
        err('unterminated string literal', start, i)
        return undefined
      }
      if (value.length > DSL_BUDGET.maxStringLength) {
        err(
          `string literal exceeds ${DSL_BUDGET.maxStringLength} chars`,
          start,
          i,
          'dsl_budget_exceeded',
        )
        return undefined
      }
      tokens.push({ kind: 'str', value, start, end: i, line, column: startCol })
      continue
    }
    if (c === '`') {
      err(
        'template literals are not supported; use string concatenation with +',
        i,
        i + 1,
        'dsl_unsupported_syntax',
      )
      return undefined
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const start = i
      const startCol = i - lineStart + 1
      let value = ''
      let sawExp = false
      while (i < source.length) {
        const ch = source[i]!
        if (/[0-9.]/.test(ch)) {
          value += ch
          i++
          continue
        }
        if ((ch === 'e' || ch === 'E') && !sawExp) {
          sawExp = true
          value += ch
          i++
          if (source[i] === '+' || source[i] === '-') {
            value += source[i]
            i++
          }
          continue
        }
        break
      }
      tokens.push({ kind: 'num', value, start, end: i, line, column: startCol })
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      const start = i
      const startCol = i - lineStart + 1
      let value = ''
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i]!)) {
        value += source[i]
        i++
      }
      tokens.push({
        kind: KEYWORDS.has(value) ? 'keyword' : 'ident',
        value,
        start,
        end: i,
        line,
        column: startCol,
      })
      continue
    }
    const three = source.slice(i, i + 3)
    const two = source.slice(i, i + 2)
    if (three === '...') {
      err('spread syntax is not supported', i, i + 3, 'dsl_unsupported_syntax')
      return undefined
    }
    if (three === '===' || three === '!==') {
      tokens.push({ kind: 'punct', value: three, start: i, end: i + 3, line, column: i - lineStart + 1 })
      i += 3
      continue
    }
    if (two === '==' || two === '!=') {
      err(
        `use ${two === '==' ? '===' : '!=='} (strict equality); loose ${two} is not allowed`,
        i,
        i + 2,
        'dsl_unsupported_syntax',
      )
      return undefined
    }
    if (
      two === '=>' ||
      two === '<=' ||
      two === '>=' ||
      two === '&&' ||
      two === '||' ||
      two === '++' ||
      two === '--' ||
      two === '+='
    ) {
      if (two === '=>') {
        err(
          'arrow functions are not supported in this DSL; use named function declarations',
          i,
          i + 2,
          'dsl_unsupported_syntax',
        )
        return undefined
      }
      tokens.push({ kind: 'punct', value: two, start: i, end: i + 2, line, column: i - lineStart + 1 })
      i += 2
      continue
    }
    if ('(){}[];,.:+-*/%<>=?!'.includes(c)) {
      if (c === '?') {
        err(
          'ternary expressions are not supported; use if/else statements',
          i,
          i + 1,
          'dsl_unsupported_syntax',
        )
        return undefined
      }
      tokens.push({ kind: 'punct', value: c, start: i, end: i + 1, line, column: i - lineStart + 1 })
      i++
      continue
    }
    err(`unexpected character ${JSON.stringify(c)}`, i, i + 1)
    return undefined
  }
  tokens.push({ kind: 'eof', value: '', start: i, end: i, line, column: i - lineStart + 1 })
  if (tokens.length > DSL_BUDGET.maxTokens) {
    diag({
      code: 'dsl_budget_exceeded',
      severity: 'error',
      message: `token count exceeds budget ${DSL_BUDGET.maxTokens}`,
      retryable: false,
    })
    return undefined
  }
  return tokens
}
