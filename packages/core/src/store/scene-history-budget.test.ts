import { describe, expect, test } from 'bun:test'
import { sceneHistoryLimitForNodeCount } from './scene-history-budget'

describe('scene history budget', () => {
  test('preserves normal history and reduces snapshot pressure for large scenes', () => {
    expect(sceneHistoryLimitForNodeCount(899)).toBe(50)
    expect(sceneHistoryLimitForNodeCount(900)).toBe(24)
    expect(sceneHistoryLimitForNodeCount(1_600)).toBe(10)
  })
})
