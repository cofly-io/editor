import { describe, expect, test } from 'bun:test'
import type { BoxNode, CylinderNode, TorusNode } from '@pascal-app/core'
import {
  canBatchBoxBase,
  canBatchCylinderBase,
  canBatchTorusBase,
  primitiveMaterialBatchKey,
} from './primitive-batching'

const base = {
  name: 'test',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  visible: true,
} as const

function box(overrides: Partial<BoxNode> = {}): BoxNode {
  return {
    ...base,
    id: 'box_batch_test',
    type: 'box',
    length: 1,
    width: 1,
    height: 1,
    cornerRadius: 0,
    cornerSegments: 4,
    ...overrides,
  } as BoxNode
}

function cylinder(overrides: Partial<CylinderNode> = {}): CylinderNode {
  return {
    ...base,
    id: 'cylinder_batch_test',
    type: 'cylinder',
    radius: 0.5,
    height: 1,
    radialSegments: 32,
    ...overrides,
  } as CylinderNode
}

function torus(overrides: Partial<TorusNode> = {}): TorusNode {
  return {
    ...base,
    id: 'torus_batch_test',
    type: 'torus',
    majorRadius: 0.5,
    tubeRadius: 0.08,
    radialSegments: 16,
    tubularSegments: 48,
    arc: Math.PI * 2,
    ...overrides,
  } as TorusNode
}

describe('primitive base batching', () => {
  test('accepts plain and industrial primitive bases', () => {
    expect(canBatchBoxBase(box())).toBe(true)
    expect(
      canBatchCylinderBase(
        cylinder({ metadata: { renderContract: { kernel: 'painted-cylindrical-shell' } } }),
      ),
    ).toBe(true)
    expect(canBatchTorusBase(torus())).toBe(true)
  })

  test('keeps geometry that cannot share a base mesh on its semantic node', () => {
    expect(canBatchBoxBase(box({ cornerRadius: 0.1 }))).toBe(false)
    expect(
      canBatchBoxBase(
        box({ metadata: { primitiveContract: { cutouts: [{ kind: 'rectangular' }] } } }),
      ),
    ).toBe(false)
    expect(canBatchCylinderBase(cylinder({ metadata: { disablePrimitiveBatch: true } }))).toBe(
      false,
    )
    expect(
      canBatchTorusBase(
        torus({
          metadata: {
            primitiveContract: {
              pattern: { instances: [{ position: [0, 0, 0] }, { position: [1, 0, 0] }] },
            },
          },
        }),
      ),
    ).toBe(false)
  })

  test('separates industrial kernels into material-compatible batches', () => {
    const shell = cylinder({
      metadata: { renderContract: { kernel: 'painted-cylindrical-shell' } },
    })
    const pipe = cylinder({
      metadata: { renderContract: { kernel: 'process-pipe-run' } },
    })

    expect(primitiveMaterialBatchKey(shell)).not.toBe(primitiveMaterialBatchKey(pipe))
  })
})
