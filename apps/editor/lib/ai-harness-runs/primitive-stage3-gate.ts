import type { GeneratedGeometryArtifact } from '../../../../packages/editor/src/lib/ai-generated-geometry-core'
import type { loadDeviceProfiles } from '../device-profiles'
import type { PrimitiveRouteMetrics } from './primitive-run-metrics'
import { executePrimitiveGeometryTool } from './primitive-tool-execution'
import { appendRunEvent } from './run-store'
import {
  polishStage3SemanticArtifact,
  repairStage3SemanticArtifact,
  stage3QualityReview,
} from './primitive-stage3-quality'

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Primitive generation cancelled', 'AbortError')
}

export async function applyStage3QualityGate(input: {
  runId: string
  userPrompt: string
  artifact: GeneratedGeometryArtifact
  revisionTarget: GeneratedGeometryArtifact | null
  loadedDeviceProfiles: Awaited<ReturnType<typeof loadDeviceProfiles>>
  routeMetrics: PrimitiveRouteMetrics
  signal: AbortSignal
}): Promise<{ artifact?: GeneratedGeometryArtifact; content?: string; accepted: boolean }> {
  const review = stage3QualityReview(input.userPrompt, input.artifact)
  input.routeMetrics.stage3QualityScore = review.score
  input.routeMetrics.stage3Passed = review.passed
  input.routeMetrics.stage3Issues = review.issues
  input.routeMetrics.stage3Warnings = review.warnings
  await appendRunEvent(input.runId, {
    type: 'message',
    message: review.passed ? 'Stage3 quality gate passed' : 'Stage3 quality gate flagged issues',
    data: { stage: 'stage3-quality', review },
  })

  const acceptWithPolish = async (
    candidate: GeneratedGeometryArtifact,
    content?: string,
  ): Promise<{ artifact: GeneratedGeometryArtifact; content?: string; accepted: true }> => {
    const polish = polishStage3SemanticArtifact(input.userPrompt, candidate)
    if (!polish) return { artifact: candidate, content, accepted: true }

    const polishedReview = stage3QualityReview(input.userPrompt, polish.artifact)
    await appendRunEvent(input.runId, {
      type: 'message',
      message: polishedReview.passed
        ? 'Stage3 semantic polish passed'
        : 'Stage3 semantic polish skipped',
      data: {
        stage: 'stage3-quality',
        repairLabel: polish.label,
        review: polishedReview,
        artifact: polish.artifact,
      },
    })
    if (!polishedReview.passed) return { artifact: candidate, content, accepted: true }

    input.routeMetrics.stage3QualityScore = polishedReview.score
    input.routeMetrics.stage3Passed = polishedReview.passed
    input.routeMetrics.stage3Issues = polishedReview.issues
    input.routeMetrics.stage3Warnings = polishedReview.warnings
    return { artifact: polish.artifact, content, accepted: true }
  }

  if (review.passed) return acceptWithPolish(input.artifact)

  const semanticRepair = repairStage3SemanticArtifact(input.userPrompt, input.artifact)
  if (semanticRepair) {
    const repairedReview = stage3QualityReview(input.userPrompt, semanticRepair.artifact)
    input.routeMetrics.stage3RepairApplied = true
    input.routeMetrics.stage3QualityScore = repairedReview.score
    input.routeMetrics.stage3Passed = repairedReview.passed
    input.routeMetrics.stage3Issues = repairedReview.issues
    input.routeMetrics.stage3Warnings = repairedReview.warnings
    await appendRunEvent(input.runId, {
      type: 'message',
      message: repairedReview.passed
        ? 'Stage3 semantic repair passed'
        : 'Stage3 semantic repair still has issues',
      data: {
        stage: 'stage3-quality',
        repairLabel: semanticRepair.label,
        review: repairedReview,
        artifact: semanticRepair.artifact,
      },
    })
    if (repairedReview.passed) {
      return acceptWithPolish(semanticRepair.artifact)
    }
  }

  if (!review.repairPlan) {
    const content = [
      'Stage3 semantic quality gate failed. Nothing was accepted yet.',
      ...review.issues.map((issue) => `- ${issue}`),
      ...review.warnings.map((warning) => `- Warning: ${warning}`),
      review.requiresModelRepair
        ? 'Call one replacement geometry tool. Preserve all declared required semantic roles and repair the listed spatial relationships.'
        : 'Call one replacement geometry tool that satisfies the quality gate.',
    ].join('\n')
    return { content, accepted: false }
  }

  input.routeMetrics.stage3RepairApplied = true
  await appendRunEvent(input.runId, {
    type: 'tool-call',
    message: review.repairPlan.tool,
    data: {
      stage: 'stage3-repair',
      name: review.repairPlan.tool,
      arguments: review.repairPlan.args,
      repairLabel: review.repairPlan.label,
    },
  })
  throwIfAborted(input.signal)
  const repaired = executePrimitiveGeometryTool(
    review.repairPlan.tool,
    review.repairPlan.args,
    input.userPrompt,
    input.revisionTarget,
    null,
    input.loadedDeviceProfiles,
  )
  await appendRunEvent(input.runId, {
    type: 'tool-result',
    message: repaired.content,
    data: {
      stage: 'stage3-repair',
      name: review.repairPlan.tool,
      artifact: repaired.artifact,
      repairLabel: review.repairPlan.label,
    },
  })
  if (!repaired.artifact)
    return { artifact: input.artifact, content: repaired.content, accepted: true }

  const repairedReview = stage3QualityReview(input.userPrompt, repaired.artifact)
  input.routeMetrics.stage3QualityScore = repairedReview.score
  input.routeMetrics.stage3Passed = repairedReview.passed
  input.routeMetrics.stage3Issues = repairedReview.issues
  input.routeMetrics.stage3Warnings = repairedReview.warnings
  await appendRunEvent(input.runId, {
    type: 'message',
    message: repairedReview.passed
      ? 'Stage3 deterministic repair passed'
      : 'Stage3 deterministic repair still has issues',
    data: { stage: 'stage3-quality', review: repairedReview },
  })
  const content = [`Stage3 repaired geometry using ${review.repairPlan.label}.`, repaired.content]
  if (!repairedReview.passed) {
    content.push(
      'Stage3 deterministic repair still failed; call one replacement geometry tool.',
      ...repairedReview.issues.map((issue) => `- ${issue}`),
      ...repairedReview.warnings.map((warning) => `- Warning: ${warning}`),
    )
    return { content: content.join('\n'), accepted: false }
  }
  return acceptWithPolish(repaired.artifact, content.join('\n'))
}
