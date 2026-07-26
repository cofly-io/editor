// @ts-expect-error - bun:test is supplied by the Bun runtime; viewer builds with Node types only.
import { describe, expect, test } from 'bun:test'
import { getPerfTargetFps } from './gpu-perf'

describe('getPerfTargetFps', () => {
  test('defaults to an uncapped rAF target for performance baselines', () => {
    expect(getPerfTargetFps(null)).toBe(120)
    expect(getPerfTargetFps('invalid')).toBe(120)
  })

  test('accepts a positive override and bounds it', () => {
    expect(getPerfTargetFps('60')).toBe(60)
    expect(getPerfTargetFps('999')).toBe(240)
  })
})
