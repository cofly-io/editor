import type {
  DeviceProfileDefinition,
  DeviceProfileValidation,
} from '@pascal-app/core/lib/device-profile-registry'
import type { PartComposePartInput } from '@pascal-app/core/lib/part-compose'
import { MAX_GENERATED_GEOMETRY_SHAPES, type RawGeometryToolShape as RawShape } from './ai-geometry-tool-constants'
import { textOf } from './ai-geometry-tool-fallback-inputs'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function profileShapeLimit(args: Record<string, unknown>): number | undefined {
  const candidates: number[] = []
  const detailBudget = args.detailBudget
  if (isRecord(detailBudget)) {
    const maxShapes = detailBudget.maxShapes
    if (typeof maxShapes === 'number' && Number.isFinite(maxShapes) && maxShapes > 0) {
      candidates.push(Math.floor(maxShapes))
    }
  }

  const rules = args.qualityRules
  if (isRecord(rules)) {
    const shapeCount = rules.shapeCount
    if (isRecord(shapeCount)) {
      const max = shapeCount.max
      if (typeof max === 'number' && Number.isFinite(max) && max > MAX_GENERATED_GEOMETRY_SHAPES) {
        candidates.push(Math.floor(max))
      }
    }
  }

  if (candidates.length === 0) return undefined
  return Math.max(1, Math.min(...candidates))
}

export function profileExecutionSmokeValidation(
  profile: DeviceProfileDefinition,
  shapes: RawShape[],
  parts: readonly PartComposePartInput[] = [],
): DeviceProfileValidation {
  const issues: string[] = []
  const warnings: string[] = []
  const shapeLimit =
    profileShapeLimit({ qualityRules: profile.qualityRules }) ?? MAX_GENERATED_GEOMETRY_SHAPES
  if (shapes.length === 0) issues.push(`Profile ${profile.id} produced no shapes.`)
  if (shapes.length > shapeLimit) {
    issues.push(
      `Profile ${profile.id} produced ${shapes.length} shapes, above limit ${shapeLimit}.`,
    )
  }

  const roleText = textOf([
    shapes.map((shape) => [shape.semanticRole, shape.sourcePartKind, shape.name]),
    parts.map((part) => [part?.semanticRole, part?.kind, part?.name]),
  ]).toLowerCase()
  if (!roleText.includes(profile.primarySemanticRole.toLowerCase())) {
    issues.push(
      `Profile ${profile.id} primarySemanticRole "${profile.primarySemanticRole}" was not produced.`,
    )
  }

  const requiredRoles = profile.parts
    .filter((part) => part.required)
    .map((part) => part.semanticRole)
  const missingRequiredRoles = requiredRoles.filter(
    (role) => !roleText.includes(role.toLowerCase()),
  )
  if (missingRequiredRoles.length > 0) {
    issues.push(`Profile ${profile.id} missing required roles: ${missingRequiredRoles.join(', ')}.`)
  }

  const hasFiniteShape = shapes.some((shape) => {
    const values = [
      shape.length,
      shape.width,
      shape.height,
      shape.radius,
      shape.radiusTop,
      shape.radiusBottom,
      shape.majorRadius,
      shape.tubeRadius,
      shape.depth,
      shape.thickness,
    ]
    return values.some((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)
  })
  if (!hasFiniteShape) issues.push(`Profile ${profile.id} produced no finite positive dimensions.`)
  if (shapes.length < Math.max(2, profile.parts.filter((part) => part.required).length)) {
    warnings.push(`Profile ${profile.id} produced a sparse geometry draft.`)
  }

  const requiredCount = Math.max(requiredRoles.length, 1)
  const coveredRequiredCount = requiredRoles.length - missingRequiredRoles.length
  const roleScore = requiredRoles.length === 0 ? 1 : coveredRequiredCount / requiredCount
  const shapeScore = shapes.length > 0 && shapes.length <= MAX_GENERATED_GEOMETRY_SHAPES ? 1 : 0
  const primaryScore = roleText.includes(profile.primarySemanticRole.toLowerCase()) ? 1 : 0
  const dimensionScore = hasFiniteShape ? 1 : 0
  const score = (roleScore + shapeScore + primaryScore + dimensionScore) / 4
  return { ok: issues.length === 0, issues, warnings, score }
}
