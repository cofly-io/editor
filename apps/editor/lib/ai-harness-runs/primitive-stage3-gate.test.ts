import { describe, expect, test } from 'bun:test'
import type {
  GeneratedGeometryArtifact,
  GeneratedGeometryShapeSpec,
} from '../../../../packages/editor/src/lib/ai-generated-geometry-core'
import type { PrimitiveRouteMetrics } from './primitive-run-metrics'
import { applyStage3QualityGate } from './primitive-stage3-gate'
import { listRunEvents } from './run-store'

function shape(semanticRole: string, sourcePartKind: string): GeneratedGeometryShapeSpec {
  return {
    kind: 'cylinder',
    name: semanticRole,
    semanticRole,
    sourcePartKind,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    radius: 0.4,
    height: 1,
  }
}

function artifact(shapes: GeneratedGeometryShapeSpec[]): GeneratedGeometryArtifact {
  return {
    id: 'stage3_gate_test',
    title: 'Stage3 gate test',
    sourceTool: 'compose_parts',
    sourceArgs: {},
    userPrompt: 'test',
    version: 1,
    createdAt: '2026-06-18T00:00:00.000Z',
    shapes,
    assemblyName: 'Stage3 gate test',
    assemblyPosition: [0, 0, 0],
    createdNames: shapes.map((item) => item.name ?? item.kind),
    shapeDetails: '',
  }
}

function routeMetrics(): PrimitiveRouteMetrics {
  return {
    route: 'stage2_fallback',
    stage1HasBlueprint: false,
    deterministicIntent: false,
    deterministicAttempted: false,
    deterministicSucceeded: false,
    stage2Called: true,
    stage2ToolCallCount: 1,
    repairCallCount: 0,
  }
}

describe('applyStage3QualityGate', () => {
  test('accepts passing artifacts and records the Stage3 review', async () => {
    const runId = `stage3_gate_test_${Date.now()}`
    const metrics = routeMetrics()

    const result = await applyStage3QualityGate({
      runId,
      userPrompt: '\u751f\u6210\u4e00\u4e2a\u5706\u67f1\u6c34\u74f6',
      artifact: artifact([
        shape('bottle_body', 'cylindrical_body'),
        shape('bottle_cap', 'cylindrical_cap'),
      ]),
      revisionTarget: null,
      loadedDeviceProfiles: { profiles: [], sources: [] },
      routeMetrics: metrics,
      signal: new AbortController().signal,
    })

    expect(result.accepted).toBe(true)
    expect(result.artifact?.id).toBe('stage3_gate_test')
    expect(metrics.stage3Passed).toBe(true)

    const events = await listRunEvents(runId)
    expect(events.some((event) => event.message === 'Stage3 quality gate passed')).toBe(true)
  })
})
