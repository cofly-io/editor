// @ts-expect-error - bun:test is supplied by the Bun runtime; viewer builds with Node types only.
import { describe, expect, test } from 'bun:test'
import { summarizePerfSamples } from './perf-statistics'

describe('summarizePerfSamples', () => {
  test('returns stable average and percentile values', () => {
    expect(summarizePerfSamples([16, 10, 12, 8, 20])).toEqual({
      average: 13.2,
      p50: 12,
      p95: 20,
      max: 20,
    })
  })

  test('ignores invalid samples', () => {
    expect(summarizePerfSamples([Number.NaN, -1, Number.POSITIVE_INFINITY])).toEqual({
      average: 0,
      p50: 0,
      p95: 0,
      max: 0,
    })
  })
})
