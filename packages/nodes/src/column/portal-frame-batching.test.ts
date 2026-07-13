import { describe, expect, test } from 'bun:test'
import { ColumnNode } from '@pascal-app/core'
import { buildPortalFrameBatches, isPortalFrameBatchCandidate } from './portal-frame-batching'

function portalFrame(id: string, overrides: Record<string, unknown> = {}) {
  return ColumnNode.parse({
    id: `column_${id}`,
    type: 'column',
    supportStyle: 'portal-frame',
    bracePlateEnabled: false,
    metadata: { portalFrameBatch: 'process-line-support' },
    ...overrides,
  })
}

describe('portal frame batching', () => {
  test('only batches marked plate-free portal frames', () => {
    expect(isPortalFrameBatchCandidate(portalFrame('eligible'))).toBe(true)
    expect(
      isPortalFrameBatchCandidate(portalFrame('with-plate', { bracePlateEnabled: true })),
    ).toBe(false)
    expect(isPortalFrameBatchCandidate(portalFrame('unmarked', { metadata: {} }))).toBe(false)
    expect(isPortalFrameBatchCandidate(portalFrame('plain', { supportStyle: 'vertical' }))).toBe(
      false,
    )
  })

  test('shares one material batch across different heights and spans', () => {
    const short = portalFrame('short', { height: 2.4, braceBottomSpread: 1.2 })
    const tall = portalFrame('tall', { height: 5.8, braceBottomSpread: 2.1 })

    const batches = buildPortalFrameBatches(
      { [short.id]: short, [tall.id]: tall },
      new Set<string>(),
    )

    expect(batches).toHaveLength(1)
    expect(batches[0]?.nodes.map((node) => node.id)).toEqual(['column_short', 'column_tall'])
  })

  test('keeps selected supports out of the instance batch', () => {
    const first = portalFrame('first')
    const selected = portalFrame('selected')

    const batches = buildPortalFrameBatches(
      { [first.id]: first, [selected.id]: selected },
      new Set(['column_selected']),
    )

    expect(batches[0]?.nodes.map((node) => node.id)).toEqual(['column_first'])
  })
})
