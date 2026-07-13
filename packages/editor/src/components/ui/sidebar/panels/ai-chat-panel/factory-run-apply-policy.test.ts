import { describe, expect, test } from 'bun:test'
import { shouldWaitForFactoryApply } from './factory-run-apply-policy'

describe('factory run apply policy', () => {
  test('keeps process line factory creation as a draft until Apply', () => {
    expect(
      shouldWaitForFactoryApply({
        intent: { action: 'process_line_plan' },
        patches: [{ op: 'create', node: { id: 'refinery_site', type: 'site' } }],
      }),
    ).toBe(true)
  })

  test('allows selection edits to apply immediately', () => {
    expect(
      shouldWaitForFactoryApply({
        intent: { action: 'edit_selection' },
        patches: [{ op: 'update', id: 'selected_item', data: { name: 'Blue pump' } }],
      }),
    ).toBe(false)
  })

  test('does not wait when missing industry pack produces no create patches', () => {
    expect(
      shouldWaitForFactoryApply({
        intent: { action: 'missing' },
        patches: [],
      }),
    ).toBe(false)
  })

  test('does not wait when quality gate failed', () => {
    expect(
      shouldWaitForFactoryApply({
        intent: { action: 'process_line_plan' },
        patches: [{ op: 'create', node: { id: 'bad_factory', type: 'site' } }],
        qualityReport: { passed: false, score: 0 },
      }),
    ).toBe(false)
  })
})
