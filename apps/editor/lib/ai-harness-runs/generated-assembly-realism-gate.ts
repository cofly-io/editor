import type { AssemblyIR, AssemblyPart } from '@pascal-app/core/lib/generated-assembly-ir'

export type IndustrialEquipmentFamily = 'belt_conveyor'

export type RealismGateReview = {
  applicable: boolean
  family?: IndustrialEquipmentFamily
  passed: boolean
  score: number
  issues: string[]
  warnings: string[]
  evidence: {
    partCount: number
    semanticRoles: string[]
    anonymousPrimitiveRatio: number
  }
}

type FamilySpec = {
  required: string[]
  recommended: string[]
  maxAnonymousPrimitiveRatio: number
}

const FAMILY_SPECS: Record<IndustrialEquipmentFamily, FamilySpec> = {
  belt_conveyor: {
    required: ['belt', 'roller', 'support_frame'],
    recommended: ['drive_motor', 'safety_guard_cover', 'inspection_door', 'equipment_nameplate'],
    maxAnonymousPrimitiveRatio: 0.25,
  },
}

const EMPTY_REVIEW: RealismGateReview = {
  applicable: false,
  passed: true,
  score: 1,
  issues: [],
  warnings: [],
  evidence: { partCount: 0, semanticRoles: [], anonymousPrimitiveRatio: 0 },
}

export function reviewAssemblyRealism(
  ir: AssemblyIR,
  opts: { source?: string; family?: IndustrialEquipmentFamily } = {},
): RealismGateReview {
  const roles = new Set(
    ir.parts.map((p) => p.semanticRole).filter((role): role is string => typeof role === 'string'),
  )
  const family = opts.family ?? inferIndustrialFamily(ir, opts.source, roles)
  if (!family) return { ...EMPTY_REVIEW, evidence: evidenceFor(ir, roles) }

  const spec = FAMILY_SPECS[family]
  const evidence = evidenceFor(ir, roles)
  const issues: string[] = []
  const warnings: string[] = []

  for (const required of spec.required) {
    if (!hasRoleLike(roles, required)) {
      issues.push(
        `realism_missing_required_role: ${family} must include semantic role "${required}".`,
      )
    }
  }

  if (evidence.anonymousPrimitiveRatio > spec.maxAnonymousPrimitiveRatio) {
    issues.push(
      `realism_anonymous_primitive_ratio: ${family} has ${(evidence.anonymousPrimitiveRatio * 100).toFixed(0)}% anonymous primitive parts; max is ${(spec.maxAnonymousPrimitiveRatio * 100).toFixed(0)}%. Use semantic constructors or meaningful withRole() values.`,
    )
  }

  for (const recommended of spec.recommended) {
    if (!hasRoleLike(roles, recommended)) {
      warnings.push(
        `realism_missing_recommended_role: ${family} should usually include "${recommended}" for customer-facing realism.`,
      )
    }
  }

  checkConveyorDetails(ir, roles, issues, warnings)

  const score = Math.max(0, Math.min(1, 1 - issues.length * 0.25 - warnings.length * 0.06))
  return {
    applicable: true,
    family,
    passed: issues.length === 0,
    score,
    issues,
    warnings,
    evidence,
  }
}

function inferIndustrialFamily(
  ir: AssemblyIR,
  source: string | undefined,
  roles: Set<string>,
): IndustrialEquipmentFamily | undefined {
  const sourceText = source?.toLowerCase() ?? ''
  const idText = ir.parts
    .map((p) => p.id)
    .join(' ')
    .toLowerCase()
  if (
    hasRoleLike(roles, 'belt') ||
    hasRoleLike(roles, 'roller') ||
    /\b(conveyor|belt|rollerarray|guardcover)\b/.test(sourceText) ||
    /\b(conveyor|belt|roller)\b/.test(idText)
  ) {
    return 'belt_conveyor'
  }
  return undefined
}

function evidenceFor(ir: AssemblyIR, roles: Set<string>): RealismGateReview['evidence'] {
  const anonymous = ir.parts.filter(isAnonymousPrimitive).length
  return {
    partCount: ir.parts.length,
    semanticRoles: [...roles].sort(),
    anonymousPrimitiveRatio: ir.parts.length === 0 ? 0 : anonymous / ir.parts.length,
  }
}

function isAnonymousPrimitive(part: AssemblyPart): boolean {
  if (part.geometry.kind !== 'primitive-recipe') return false
  const role = part.semanticRole?.trim().toLowerCase()
  if (!role) return true
  return /^(part|piece|component|object|body|box|cylinder|sphere|detail|misc)$/.test(role)
}

function hasRoleLike(roles: Set<string>, needle: string): boolean {
  const n = needle.toLowerCase()
  for (const role of roles) {
    const r = role.toLowerCase()
    if (r === n || r.includes(n)) return true
    if (n === 'safety_guard_cover' && (r.includes('guard') || r.includes('cover'))) return true
    if (n === 'support_frame' && (r.includes('frame') || r.includes('support'))) return true
    if (n === 'drive_motor' && r.includes('motor')) return true
  }
  return false
}

function checkConveyorDetails(
  ir: AssemblyIR,
  roles: Set<string>,
  issues: string[],
  warnings: string[],
): void {
  if (!hasRoleLike(roles, 'belt') && !hasRoleLike(roles, 'roller')) return

  const belt = ir.parts.find((p) => p.semanticRole === 'belt')
  if (belt?.geometry.kind === 'primitive-recipe') {
    const material = belt.material.preset?.toLowerCase()
    const roughness = belt.material.roughness
    if (material !== 'rubber_belt' && (roughness === undefined || roughness < 0.75)) {
      warnings.push(
        'realism_belt_material: conveyor belt should use rubber_belt or a high-roughness dark material.',
      )
    }
  }

  const rollers = ir.parts.filter((p) => p.semanticRole === 'roller')
  if (rollers.length < 4) {
    warnings.push(
      `realism_low_roller_count: conveyor has only ${rollers.length} rollers; industrial conveyors usually need repeated rollers.`,
    )
  }

  const motor = ir.parts.find((p) => p.semanticRole === 'drive_motor')
  if (motor?.geometry.kind === 'primitive-recipe') {
    const radialSegments = motor.geometry.params.radialSegments
    if (typeof radialSegments !== 'number' || radialSegments < 32) {
      warnings.push(
        'realism_motor_faceting: drive motor cylinder should use at least 32 radialSegments.',
      )
    }
  }

  const cover = ir.parts.find((p) => p.semanticRole === 'safety_guard_cover')
  if (cover && cover.material.opacity === undefined && cover.material.preset !== 'wire_mesh') {
    warnings.push(
      'realism_guard_material: safety cover should be transparent_polycarbonate, wire_mesh, or expose opacity.',
    )
  }
}
