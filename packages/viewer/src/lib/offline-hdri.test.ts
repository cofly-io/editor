// @ts-expect-error - bun:test is supplied by the Bun runtime; viewer builds with Node types only.
import { describe, expect, test } from 'bun:test'
import { DEFAULT_OFFLINE_HDRI_PATH, resolveOfflineHdriUrl } from './offline-hdri'

describe('resolveOfflineHdriUrl', () => {
  test('uses the editor public root by default', () => {
    expect(resolveOfflineHdriUrl(DEFAULT_OFFLINE_HDRI_PATH, '')).toBe(
      '/environment/small_hangar_01_1k.hdr',
    )
  })

  test('keeps exported runtimes under their supOS application path', () => {
    expect(resolveOfflineHdriUrl(DEFAULT_OFFLINE_HDRI_PATH, '/os/appbuilder/pascal123/')).toBe(
      '/os/appbuilder/pascal123/environment/small_hangar_01_1k.hdr',
    )
  })
})
