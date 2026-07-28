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
    materialPresetRatio: number
  }
}

type FamilySpec = {
  required: string[]
  recommended: string[]
  maxAnonymousPrimitiveRatio: number
}

const FAMILY_SPECS: Record<IndustrialEquipmentFamily, FamilySpec> = {
  belt_conveyor: {
    required: ['belt', 'roller', 'support_frame', 'drive_motor'],
    recommended: ['drive_motor', 'safety_guard_cover', 'inspection_door', 'equipment_nameplate'],
    maxAnonymousPrimitiveRatio: 0.25,
  },
}

const EQUIPMENT_MATERIAL_PRESETS = new Set([
  'painted_steel',
  'stainless_steel',
  'cast_iron',
  'transparent_polycarbonate',
  'wire_mesh',
  'rubber_belt',
  'aluminum_frame',
  'yellow_safety',
  'dark_fastener',
  'control_panel_glass',
])

const EMPTY_REVIEW: RealismGateReview = {
  applicable: false,
  passed: true,
  score: 1,
  issues: [],
  warnings: [],
  evidence: { partCount: 0, semanticRoles: [], anonymousPrimitiveRatio: 0, materialPresetRatio: 0 },
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

  if (evidence.materialPresetRatio < 0.65) {
    issues.push(
      `realism_material_preset_ratio: ${family} uses equipment material presets on only ${(evidence.materialPresetRatio * 100).toFixed(0)}% of parts; use named equipment materials instead of raw/default materials.`,
    )
  }

  for (const recommended of spec.recommended) {
    if (!hasRoleLike(roles, recommended)) {
      warnings.push(
        `realism_missing_recommended_role: ${family} should usually include "${recommended}" for customer-facing realism.`,
      )
    }
  }

  checkConveyorDetails(ir, roles, opts.source, issues, warnings)

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
  const withPreset = ir.parts.filter(
    (part) =>
      typeof part.material.preset === 'string' &&
      EQUIPMENT_MATERIAL_PRESETS.has(part.material.preset),
  ).length
  return {
    partCount: ir.parts.length,
    semanticRoles: [...roles].sort(),
    anonymousPrimitiveRatio: ir.parts.length === 0 ? 0 : anonymous / ir.parts.length,
    materialPresetRatio: ir.parts.length === 0 ? 0 : withPreset / ir.parts.length,
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
  source: string | undefined,
  issues: string[],
  warnings: string[],
): void {
  if (!hasRoleLike(roles, 'belt') && !hasRoleLike(roles, 'roller')) return

  if (ir.parts.length < 16) {
    issues.push(
      `realism_conveyor_under_detailed: belt_conveyor has only ${ir.parts.length} parts; use equipment SDK constructors so it has visible rollers, frame, motor, guard, and detail parts.`,
    )
  }

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
    issues.push(
      `realism_low_roller_count: conveyor has only ${rollers.length} rollers; industrial conveyors usually need repeated rollers.`,
    )
  }

  const motor = ir.parts.find((p) => p.semanticRole === 'drive_motor')
  const motorDetails = ir.parts.filter((p) => p.semanticRole?.startsWith('motor_'))
  const hasMotorMount = motorDetails.some((p) => p.semanticRole === 'motor_mounting_foot')
  const hasTerminalBox = motorDetails.some((p) => p.semanticRole === 'motor_terminal_box')
  if (motor && (!hasMotorMount || !hasTerminalBox)) {
    issues.push(
      'realism_motor_detail_missing: drive motor must include mounting feet and a terminal box, not just a bare cylinder.',
    )
  }
  if (motor?.geometry.kind === 'primitive-recipe') {
    const radialSegments = motor.geometry.params.radialSegments
    if (typeof radialSegments !== 'number' || radialSegments < 32) {
      issues.push(
        'realism_motor_faceting: drive motor cylinder should use at least 32 radialSegments.',
      )
    }
  }

  const supportLegs = ir.parts.filter((p) => p.semanticRole === 'support_leg')
  if (supportLegs.length < 4) {
    issues.push(
      `realism_support_leg_count: conveyor frame has only ${supportLegs.length} support legs; long material-handling equipment needs visible supports.`,
    )
  }

  const cover = ir.parts.find((p) => p.semanticRole === 'safety_guard_cover')
  if (!cover && sourceRequestsGuard(source)) {
    issues.push(
      'realism_guard_missing: guarded conveyor requests must include guardCover()/safety_guard_cover parts.',
    )
  }
  const coverParts = ir.parts.filter((p) =>
    /guard|cover/.test(`${p.semanticRole ?? ''} ${p.id}`.toLowerCase()),
  )
  const coverFrames = ir.parts.filter((p) => p.semanticRole === 'cover_frame_rail')
  const coverMounts = ir.parts.filter((p) => p.semanticRole === 'cover_mounting_bracket')
  if (cover && (coverParts.length < 8 || coverFrames.length < 2 || coverMounts.length < 2)) {
    issues.push(
      'realism_guard_too_simple: guarded conveyor cover must include panels plus frame rails and mounting brackets, not a single box.',
    )
  }
  if (cover && cover.material.opacity === undefined && cover.material.preset !== 'wire_mesh') {
    warnings.push(
      'realism_guard_material: safety cover should be transparent_polycarbonate, wire_mesh, or expose opacity.',
    )
  }

  const roundedSheetParts = ir.parts.filter(
    (p) =>
      p.geometry.kind === 'primitive-recipe' &&
      p.geometry.recipeId === 'primitive.box' &&
      /cover|panel|door|frame|leg|mount|plate/.test(`${p.semanticRole ?? ''} ${p.id}`),
  )
  const sharpSheetParts = roundedSheetParts.filter((p) => {
    const radius =
      p.geometry.kind === 'primitive-recipe' ? p.geometry.params.cornerRadius : undefined
    return typeof radius !== 'number' || radius <= 0
  })
  if (roundedSheetParts.length > 0 && sharpSheetParts.length / roundedSheetParts.length > 0.35) {
    issues.push(
      'realism_sheet_metal_sharp: sheet-metal panels/frames should use cornerRadius defaults instead of sharp raw boxes.',
    )
  }
}

function sourceRequestsGuard(source: string | undefined): boolean {
  return /\b(guard|guarded|guardcover|safety|protective|cover)\b|防护|護罩|护罩|罩/.test(
    source?.toLowerCase() ?? '',
  )
}
