// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// include Bun types in the emitted library tsconfig.
import { describe, expect, test } from 'bun:test'
import {
  isGpuOutOfMemoryError,
  isUnrecoverableGpuDeviceLoss,
  isUnrecoverableGpuError,
} from './webgpu-health'

describe('webgpu health classification', () => {
  test('classifies GPU out-of-memory errors as unrecoverable', () => {
    const error = new Error('GPU out of memory while creating texture')
    expect(isGpuOutOfMemoryError(error)).toBe(true)
    expect(isUnrecoverableGpuError(error)).toBe(true)
  })

  test('classifies external instance loss as unrecoverable', () => {
    const error = new DOMException(
      'A valid external Instance reference no longer exists.',
      'OperationError',
    )
    expect(isUnrecoverableGpuError(error)).toBe(true)
  })

  test('does not classify ordinary validation failures as device loss', () => {
    const error = new Error('Vertex buffer slot 0 is not set')
    expect(isUnrecoverableGpuError(error)).toBe(false)
  })

  test('treats non-destroyed device loss as unrecoverable', () => {
    expect(isUnrecoverableGpuDeviceLoss({ reason: 'unknown' })).toBe(true)
    expect(isUnrecoverableGpuDeviceLoss({ reason: 'out-of-memory' })).toBe(true)
    expect(isUnrecoverableGpuDeviceLoss({ reason: 'destroyed' })).toBe(false)
  })
})
