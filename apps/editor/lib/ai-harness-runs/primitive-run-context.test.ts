import { describe, expect, test } from 'bun:test'
import {
  ensurePromptInPrimitiveContext,
  extractFirstBalancedJsonObject,
  parseContextDecision,
  stripNegatedTargetClauses,
} from './primitive-run-context'

describe('primitive run context helpers', () => {
  test('keeps the target prompt when callers provide only meta context', () => {
    const context = ensurePromptInPrimitiveContext(
      '\u751f\u6210\u4e00\u4e2a\u5efa\u7b51\u5de5\u5730\u5854\u540a',
      'Primitive geometry assembly QA. Use compose_parts and preserve topology.',
    )

    expect(context).toContain(
      'User request: \u751f\u6210\u4e00\u4e2a\u5efa\u7b51\u5de5\u5730\u5854\u540a',
    )
    expect(context).toContain('Additional context:')
  })

  test('does not duplicate context that already includes the user prompt', () => {
    const context = ensurePromptInPrimitiveContext(
      '\u751f\u6210\u4e00\u4e2a\u7a7a\u8c03\u5916\u673a',
      'User request: \u751f\u6210\u4e00\u4e2a\u7a7a\u8c03\u5916\u673a\n\nUse primitive geometry.',
    )

    expect(context.match(/\u751f\u6210\u4e00\u4e2a\u7a7a\u8c03\u5916\u673a/g)?.length).toBe(1)
  })

  test('strips English and Chinese negated target clauses', () => {
    expect(stripNegatedTargetClauses('Generate a mixer, do not generate a pump.')).not.toContain(
      'pump',
    )
    expect(
      stripNegatedTargetClauses(
        '\u751f\u6210\u4e00\u4e2a\u6405\u62cc\u5668\uff0c\u4e0d\u8981\u751f\u6210\u6c34\u6cf5\u3002',
      ),
    ).not.toContain('\u6c34\u6cf5')
  })

  test('extracts and parses JSON from loose context resolver output', () => {
    expect(extractFirstBalancedJsonObject('text {"contextPolicy":"none"} tail')).toBe(
      '{"contextPolicy":"none"}',
    )
    expect(
      parseContextDecision('```json\n{"contextPolicy":"none","confidence":0.9}\n```'),
    ).toMatchObject({
      contextPolicy: 'none',
      confidence: 0.9,
    })
  })
})
