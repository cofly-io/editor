import { describe, expect, test } from 'bun:test'
import {
  getLibraryMaterialIdFromRef,
  getMaterialSolidColorByRef,
  getSceneMaterialIdFromRef,
  toLibraryMaterialRef,
} from './material-library'

test('textured library fills resolve to a solid representative colour', () => {
  expect(getMaterialSolidColorByRef(toLibraryMaterialRef('wood-finewood27'))).toBe('#a8794c')
  expect(getMaterialSolidColorByRef(toLibraryMaterialRef('roof-claytiles'))).toBe('#b65f38')
})

test('paint colour presets keep their explicit preview colour', () => {
  expect(getMaterialSolidColorByRef(toLibraryMaterialRef('preset-white'))).toBe('#ffffff')
  expect(getMaterialSolidColorByRef(toLibraryMaterialRef('preset-forest'))).toBe('#4f6b57')
})

describe('material references', () => {
  test('rejects malformed runtime values instead of calling string methods', () => {
    const malformedRefs: unknown[] = [42, true, {}, []]

    for (const ref of malformedRefs) {
      expect(getLibraryMaterialIdFromRef(ref as string)).toBeNull()
      expect(getSceneMaterialIdFromRef(ref as string)).toBeNull()
    }
  })
})
