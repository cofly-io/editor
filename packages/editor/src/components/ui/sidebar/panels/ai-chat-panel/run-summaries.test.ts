import { describe, expect, test } from 'bun:test'
import { buildFactoryResultSummary, formatFactoryRunFailureMessage } from './run-summaries'

const zh = (...codes: number[]) => String.fromCodePoint(...codes)

describe('formatFactoryRunFailureMessage', () => {
  test('hides raw zod errors behind a missing industry pack message', () => {
    const message = JSON.stringify([
      {
        code: 'invalid_union',
        errors: [
          [
            {
              expected: 'string',
              code: 'invalid_type',
              path: [],
              message: 'Invalid input: expected string, received object',
            },
          ],
        ],
      },
    ])

    const formatted = formatFactoryRunFailureMessage(message)

    expect(formatted).toContain(zh(0x884c, 0x4e1a, 0x5305))
    expect(formatted).toContain('/profile-packs')
    expect(formatted).not.toContain('invalid_union')
    expect(formatted).not.toContain('expected string')
  })
})

describe('buildFactoryResultSummary', () => {
  test('marks quality gate failures as failed', () => {
    const summary = buildFactoryResultSummary({
      intent: { action: 'process_line_plan' },
      patches: [{ op: 'create', node: { id: 'bad_factory', type: 'site' } }],
      nodeIds: [],
      created: [],
      missingAssets: [],
      qualityReport: { passed: false, score: 0, issues: [] },
    })

    expect(summary.status).toBe('failed')
  })
})
