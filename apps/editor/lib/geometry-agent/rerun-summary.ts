import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import type { GeneratedAssemblyNode, GeneratedMeshNode } from '@pascal-app/core/schema'
import {
  type GeneratedAssemblyRerunPlan,
  planGeneratedAssemblyRerun,
} from '../../../../packages/editor/src/lib/generated-assembly-rerun'
import type { GeneratedAssemblyPlacementOptions } from '../../../../packages/editor/src/lib/generated-geometry-placement'

export type GeometryAgentRerunContext = {
  existingRoot: GeneratedAssemblyNode
  existingParts: readonly GeneratedMeshNode[]
  previousIr?: AssemblyIR
  placement?: Omit<GeneratedAssemblyPlacementOptions, 'generator'>
  detectedAt?: string
}

export type GeometryAgentRerunSummary = {
  created: number
  updated: number
  deleted: number
  unchanged: number
  changedPartIds: string[]
  addedPartIds: string[]
  removedPartIds: string[]
  unchangedPartIds: string[]
  orphanedOverridePartIds: string[]
  text: string
}

export type GeometryAgentRerunResult = {
  plan: GeneratedAssemblyRerunPlan
  summary: GeometryAgentRerunSummary
}

export function planGeometryAgentRerun(input: {
  context: GeometryAgentRerunContext
  nextIr: AssemblyIR
  source: string
  irHash: string
  params?: Record<string, unknown>
}): GeometryAgentRerunResult {
  const plan = planGeneratedAssemblyRerun(
    input.context.existingRoot,
    input.context.existingParts,
    input.nextIr,
    {
      ...(input.context.placement ?? {}),
      ...(input.context.previousIr ? { previousIr: input.context.previousIr } : {}),
      generator: {
        sourceHash: input.nextIr.generator.sourceHash,
        apiVersion: input.nextIr.generator.apiVersion,
        paramsHash: input.nextIr.generator.paramsHash,
        irHash: input.irHash,
        source: input.source,
        params: input.params ?? {},
      },
    },
    input.context.detectedAt,
  )
  return { plan, summary: summarizeGeometryAgentRerun(plan) }
}

export function summarizeGeometryAgentRerun(
  plan: GeneratedAssemblyRerunPlan,
): GeometryAgentRerunSummary {
  const changedPartIds = plan.diff.kept
    .filter((part) => part.fingerprintChanged)
    .map((part) => part.partId)
    .sort()
  const unchangedPartIds = plan.diff.kept
    .filter((part) => !part.fingerprintChanged)
    .map((part) => part.partId)
    .sort()
  const addedPartIds = plan.diff.added.map((part) => part.id).sort()
  const removedPartIds = plan.diff.removed.map((part) => part.id).sort()
  const orphanedOverridePartIds = plan.orphans.map((orphan) => orphan.partId).sort()

  const summary: GeometryAgentRerunSummary = {
    created: plan.creates.length,
    updated: changedPartIds.length,
    deleted: plan.deletes.length,
    unchanged: unchangedPartIds.length,
    changedPartIds,
    addedPartIds,
    removedPartIds,
    unchangedPartIds,
    orphanedOverridePartIds,
    text: '',
  }
  return { ...summary, text: formatGeometryAgentRerunSummary(summary) }
}

export function formatGeometryAgentRerunSummary(
  summary: Omit<GeometryAgentRerunSummary, 'text'>,
): string {
  const lines = [
    '已增量更新几何：',
    `- created: ${summary.created}`,
    `- updated: ${summary.updated}`,
    `- deleted: ${summary.deleted}`,
    `- unchanged: ${summary.unchanged}`,
  ]
  if (summary.changedPartIds.length > 0) {
    lines.push(`- changed parts: ${summary.changedPartIds.slice(0, 12).join(', ')}`)
  }
  if (summary.addedPartIds.length > 0) {
    lines.push(`- added parts: ${summary.addedPartIds.slice(0, 12).join(', ')}`)
  }
  if (summary.removedPartIds.length > 0) {
    lines.push(`- removed parts: ${summary.removedPartIds.slice(0, 12).join(', ')}`)
  }
  if (summary.orphanedOverridePartIds.length > 0) {
    lines.push(`- orphaned overrides: ${summary.orphanedOverridePartIds.slice(0, 12).join(', ')}`)
  }
  return lines.join('\n')
}
