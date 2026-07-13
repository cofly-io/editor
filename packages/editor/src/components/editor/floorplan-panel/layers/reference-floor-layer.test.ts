import { describe, expect, test } from 'bun:test'
import type { AnyNode, AnyNodeId, FloorplanGeometry } from '@pascal-app/core'
import { nodeRegistry, registerNode } from '@pascal-app/core/registry'
import { z } from 'zod'
import { buildReferenceFloorGeometries } from '../reference-floor-geometry'

const referenceTestKind = 'test:reference-floor'

function ensureReferenceTestKindRegistered() {
  if (nodeRegistry.has(referenceTestKind)) {
    return
  }

  registerNode({
    kind: referenceTestKind,
    schemaVersion: 1,
    schema: z.object({
      object: z.literal('node').default('node'),
      id: z.string(),
      type: z.literal(referenceTestKind),
      parentId: z.string().nullable().default(null),
      children: z.array(z.string()).default([]),
      visible: z.boolean().default(true),
      metadata: z.record(z.string(), z.unknown()).default({}),
    }),
    category: 'structure',
    defaults: () => ({
      object: 'node',
      parentId: null,
      children: [],
      visible: true,
      metadata: {},
    }),
    capabilities: {},
    floorplan: (node, context): FloorplanGeometry => ({
      kind: 'text',
      x: context.children.length,
      y: context.siblings.length,
      text: `${context.parent?.id ?? 'root'}:${context.resolve(node.id as AnyNodeId)?.id}`,
      fontSize: 1,
    }),
  })
}

function testNode(
  id: string,
  options: { parentId?: string | null; children?: string[]; visible?: boolean } = {},
): AnyNode {
  return {
    object: 'node',
    id,
    type: referenceTestKind,
    parentId: options.parentId ?? null,
    children: options.children ?? [],
    visible: options.visible ?? true,
    metadata: {},
  } as unknown as AnyNode
}

describe('buildReferenceFloorGeometries', () => {
  test('dispatches through floorplan definitions with scene context', () => {
    ensureReferenceTestKindRegistered()
    const parent = testNode('parent', { children: ['first', 'second'] })
    const first = testNode('first', { parentId: parent.id, children: ['child'] })
    const second = testNode('second', { parentId: parent.id })
    const child = testNode('child', { parentId: first.id })

    const entries = buildReferenceFloorGeometries([parent, first, second, child])
    const firstGeometry = entries.find((entry) => String(entry.id) === String(first.id))?.geometry

    expect(firstGeometry).toEqual({
      kind: 'text',
      x: 1,
      y: 1,
      text: 'parent:first',
      fontSize: 1,
    })
  })

  test('skips hidden nodes and kinds without a floorplan builder', () => {
    ensureReferenceTestKindRegistered()
    const hidden = testNode('hidden', { visible: false })
    const unknown = {
      ...testNode('unknown'),
      type: 'test:no-floorplan',
    } as unknown as AnyNode

    expect(buildReferenceFloorGeometries([hidden, unknown])).toEqual([])
  })
})
