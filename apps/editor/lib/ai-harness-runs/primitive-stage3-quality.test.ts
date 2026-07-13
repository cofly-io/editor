import { describe, expect, test } from 'bun:test'
import type {
  GeneratedGeometryArtifact,
  GeneratedGeometryShapeSpec,
} from '../../../../packages/editor/src/lib/ai-generated-geometry-core'
import { repairStage3SemanticArtifact, stage3QualityReview } from './primitive-stage3-quality'

function artifact(shapes: GeneratedGeometryShapeSpec[]): GeneratedGeometryArtifact {
  return {
    id: 'stage3_quality_test',
    title: 'Stage3 quality test',
    sourceTool: 'compose_parts',
    sourceArgs: {},
    userPrompt: 'test',
    version: 1,
    createdAt: '2026-07-07T00:00:00.000Z',
    shapes,
    transforms: shapes.map((shape) => ({
      position: shape.position ?? [0, 0, 0],
      rotation: shape.rotation ?? [0, 0, 0],
    })),
    assemblyName: 'Stage3 quality test',
    assemblyPosition: [0, 0, 0],
    createdNames: shapes.map((shape) => shape.name ?? shape.semanticRole ?? shape.kind),
    shapeDetails: '',
  }
}

describe('Stage3 quality helpers', () => {
  test('accepts bicycle roles without treating 自行车 as lifting 行车', () => {
    const bicycle = artifact([
      { kind: 'torus', name: 'rear tire', semanticRole: 'bicycle_tire' },
      { kind: 'torus', name: 'front tire', semanticRole: 'bicycle_tire' },
      { kind: 'cylinder', name: 'top tube', semanticRole: 'bicycle_frame' },
      { kind: 'cylinder', name: 'front fork', semanticRole: 'bicycle_fork' },
      { kind: 'cylinder', name: 'handlebar crossbar', semanticRole: 'handlebar' },
      { kind: 'box', name: 'saddle cushion', semanticRole: 'saddle' },
      { kind: 'sweep', name: 'chain loop', semanticRole: 'chain_loop' },
    ])
    bicycle.geometryBrief = {
      category: 'bicycle',
      requiredRoles: [
        'bicycle_tire',
        'bicycle_frame',
        'bicycle_fork',
        'bicycle_handlebar',
        'bicycle_saddle',
        'bicycle_chain',
      ],
    }

    const review = stage3QualityReview('生成一辆自行车', bicycle)

    expect(review.issues).not.toContain(
      'Stage3 lifting equipment missing structural role "runway_rail".',
    )
    expect(review.issues).not.toContain('Stage3 missing declared required role "bicycle_chain".')
    expect(review.passed).toBe(true)
  })

  test('flags round containers modeled with generic body boxes', () => {
    const review = stage3QualityReview(
      '\u751f\u6210\u4e00\u4e2a\u5706\u67f1\u6c34\u74f6',
      artifact([
        {
          kind: 'box',
          semanticRole: 'bottle_body',
          sourcePartKind: 'generic_body',
          position: [0, 0, 0],
          length: 1,
          width: 1,
          height: 2,
        },
      ]),
    )

    expect(review.passed).toBe(false)
    expect(review.issues).toContain(
      'Stage3 round container main body must use round primitive geometry, not generic_body box.',
    )
    expect(review.repairPlan).toMatchObject({ tool: 'compose_primitive' })
  })

  test('repairs missing tower crane roles with scaffold geometry', () => {
    const repaired = repairStage3SemanticArtifact(
      'tower crane',
      artifact([
        {
          kind: 'box',
          semanticRole: 'tower_mast',
          position: [0, 1, 0],
          length: 0.4,
          width: 0.4,
          height: 2,
        },
      ]),
    )

    expect(repaired?.label).toBeDefined()
    expect(repaired?.artifact.shapes.some((shape) => shape.semanticRole === 'hook_block')).toBe(
      true,
    )
  })
})
