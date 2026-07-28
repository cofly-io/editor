import { describe, expect, test } from 'bun:test'
import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import type { GeneratedAssemblyNode } from '@pascal-app/core/schema'
import { buildGeneratedAssemblyNodes } from '../../../../packages/editor/src/lib/generated-geometry-placement'
import {
  formatGeometryAgentRerunSummary,
  planGeometryAgentRerun,
  summarizeGeometryAgentRerun,
} from './rerun-summary'

type Part = AssemblyIR['parts'][number]

function part(id: string, fingerprint = `fp-${id}`): Part {
  return {
    id,
    transform: {
      space: 'world',
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    geometry: {
      kind: 'primitive-recipe',
      recipeId: 'primitive.box',
      params: { length: 1, width: 1, height: 1 },
    },
    material: {},
    fingerprint,
  }
}

function ir(parts: Part[], sourceHash = 'src'): AssemblyIR {
  return {
    schemaVersion: 1,
    generator: { sourceHash, apiVersion: '1.1.0', paramsHash: 'params' },
    parts,
    constraints: [],
  }
}

describe('geometry-agent rerun summary', () => {
  test('plans rerun through generated-assembly diff and summarizes changed parts', () => {
    const previousIr = ir([part('belt'), part('cover.top_panel'), part('motor')], 'src-v1')
    const { rootNode, childNodes } = buildGeneratedAssemblyNodes(previousIr, {
      overrides: [{ partId: 'motor', visibility: false }],
    })
    const existingRoot = {
      ...rootNode,
      overrides: [{ partId: 'motor', visibility: false }],
    } as GeneratedAssemblyNode
    const nextIr = ir(
      [
        part('belt'),
        part('cover.top_panel', 'fp-cover-top-panel-v2'),
        part('motor'),
        part('doors.door.0.panel'),
      ],
      'src-v2',
    )

    const { plan, summary } = planGeometryAgentRerun({
      context: {
        existingRoot,
        existingParts: childNodes,
        previousIr,
        detectedAt: '2026-07-28T00:00:00.000Z',
      },
      nextIr,
      source: '// patched',
      irHash: 'ir-v2',
    })

    expect(plan.creates).toHaveLength(1)
    expect(plan.deletes).toHaveLength(0)
    expect(summary).toMatchObject({
      created: 1,
      updated: 1,
      deleted: 0,
      unchanged: 2,
      changedPartIds: ['cover.top_panel'],
      addedPartIds: ['doors.door.0.panel'],
      unchangedPartIds: ['belt', 'motor'],
    })
    expect(summary.text).toContain('updated: 1')
    expect(summary.text).toContain('cover.top_panel')
  })

  test('reports deleted parts and orphaned overrides', () => {
    const previousIr = ir([part('belt'), part('old_guard')], 'src-v1')
    const { rootNode, childNodes } = buildGeneratedAssemblyNodes(previousIr, {
      overrides: [{ partId: 'old_guard', visibility: false }],
    })
    const nextIr = ir([part('belt')], 'src-v2')

    const { summary } = planGeometryAgentRerun({
      context: {
        existingRoot: {
          ...rootNode,
          overrides: [{ partId: 'old_guard', visibility: false }],
        } as GeneratedAssemblyNode,
        existingParts: childNodes,
        previousIr,
        detectedAt: '2026-07-28T00:00:00.000Z',
      },
      nextIr,
      source: '// removed',
      irHash: 'ir-v2',
    })

    expect(summary.deleted).toBe(1)
    expect(summary.removedPartIds).toEqual(['old_guard'])
    expect(summary.orphanedOverridePartIds).toEqual(['old_guard'])
    expect(summary.text).toContain('orphaned overrides: old_guard')
  })

  test('formats a compact human-readable summary', () => {
    expect(
      formatGeometryAgentRerunSummary({
        created: 2,
        updated: 1,
        deleted: 0,
        unchanged: 4,
        changedPartIds: ['cover'],
        addedPartIds: ['door.0', 'door.1'],
        removedPartIds: [],
        unchangedPartIds: ['belt'],
        orphanedOverridePartIds: [],
      }),
    ).toContain('added parts: door.0, door.1')
  })

  test('summarizeGeometryAgentRerun counts root update separately from changed parts', () => {
    const previousIr = ir([part('a')], 'src-v1')
    const { rootNode, childNodes } = buildGeneratedAssemblyNodes(previousIr)
    const nextIr = ir([part('a', 'fp-a-v2')], 'src-v2')
    const { plan } = planGeometryAgentRerun({
      context: {
        existingRoot: rootNode as GeneratedAssemblyNode,
        existingParts: childNodes,
        previousIr,
      },
      nextIr,
      source: '// v2',
      irHash: 'hash-v2',
    })

    expect(plan.updates.length).toBeGreaterThan(1)
    expect(summarizeGeometryAgentRerun(plan).updated).toBe(1)
  })
})
