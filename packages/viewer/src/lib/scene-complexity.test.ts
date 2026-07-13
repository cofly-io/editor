// @ts-expect-error - bun:test is supplied by the Bun runtime; viewer builds with Node types only.
import { describe, expect, test } from 'bun:test'
import { assessSceneComplexity } from './scene-complexity'

function nodes(count: number, type = 'box') {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`${type}_${index}`, { type }]),
  )
}

describe('scene complexity budget', () => {
  test('keeps ordinary scenes at full quality', () => {
    expect(assessSceneComplexity(nodes(899))).toMatchObject({
      tier: 'normal',
      maxDpr: 1.5,
      disableSsgi: false,
      disableOutline: false,
    })
  })

  test('degrades expensive post processing before the critical limit', () => {
    expect(assessSceneComplexity(nodes(900))).toMatchObject({
      tier: 'constrained',
      maxDpr: 1,
      disableSsgi: true,
      disableOutline: false,
    })
  })

  test('treats imported models as a larger GPU cost', () => {
    const imported = Object.fromEntries(
      Array.from({ length: 67 }, (_, index) => [
        `item_${index}`,
        { type: 'item', asset: { src: `/models/${index}.glb` } },
      ]),
    )

    expect(assessSceneComplexity(imported)).toMatchObject({
      tier: 'critical',
      importedModelCount: 67,
      disableOutline: true,
      useImportedModelProxy: true,
    })
  })
})
