import { describe, expect, test } from 'bun:test'
import { normalizePrimitiveMaterial } from './ai-geometry-tool-materials'

describe('normalizePrimitiveMaterial', () => {
  test('accepts a supported industrial PBR profile without arbitrary scalar overrides', () => {
    expect(
      normalizePrimitiveMaterial({ profile: 'galvanized-steel' }, undefined, undefined),
    ).toEqual({ profile: 'galvanized-steel' })
  })

  test('drops an unknown industrial profile instead of persisting a model-invented label', () => {
    expect(
      normalizePrimitiveMaterial({ profile: 'ultra-steel' }, undefined, undefined),
    ).toBeUndefined()
  })
})
