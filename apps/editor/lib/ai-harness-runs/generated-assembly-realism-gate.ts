import type { AssemblyIR, AssemblyPart } from '@pascal-app/core/lib/generated-assembly-ir'

export type IndustrialEquipmentFamily =
  | 'belt_conveyor'
  | 'control_cabinet'
  | 'pump_skid'
  | 'process_vessel'
  | 'dust_collector'
  | 'heat_exchanger'

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
  control_cabinet: {
    required: ['control_cabinet', 'cabinet_door_seam', 'cabinet_handle'],
    recommended: ['control_panel_glass', 'equipment_nameplate'],
    maxAnonymousPrimitiveRatio: 0.2,
  },
  pump_skid: {
    required: ['skid_base', 'volute_casing', 'drive_motor', 'flange_port'],
    recommended: ['pipe_run', 'sheet_cover_panel', 'equipment_nameplate'],
    maxAnonymousPrimitiveRatio: 0.2,
  },
  process_vessel: {
    required: ['vessel_shell', 'vessel_head', 'flange_port'],
    recommended: ['inspection_door', 'equipment_nameplate', 'ladder_rung'],
    maxAnonymousPrimitiveRatio: 0.18,
  },
  dust_collector: {
    required: ['filter_body', 'bottom_discharge_hopper', 'inlet_duct', 'outlet_duct'],
    recommended: ['support_leg', 'pulse_valve', 'inspection_door', 'equipment_nameplate'],
    maxAnonymousPrimitiveRatio: 0.18,
  },
  heat_exchanger: {
    required: ['heat_exchanger_shell', 'tube_sheet', 'tube_bundle', 'flange_port'],
    recommended: ['channel_head', 'saddle_support', 'baffle_plate', 'equipment_nameplate'],
    maxAnonymousPrimitiveRatio: 0.18,
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
  checkControlCabinetDetails(ir, roles, issues, warnings)
  checkPumpSkidDetails(ir, roles, issues, warnings)
  checkProcessVesselDetails(ir, roles, issues, warnings)
  checkDustCollectorDetails(ir, roles, issues, warnings)
  checkHeatExchangerDetails(ir, roles, issues, warnings)
  checkAccessDetails(ir, roles, opts.source, issues, warnings)

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
    hasRoleLike(roles, 'control_cabinet') ||
    /\b(controlcabinet|control[_\s-]?cabinet|electrical[_\s-]?cabinet|plc[_\s-]?cabinet)\b/.test(
      sourceText,
    ) ||
    /control[_\s-]?cabinet|electrical[_\s-]?cabinet|plc/.test(idText)
  ) {
    return 'control_cabinet'
  }
  if (
    hasRoleLike(roles, 'volute_casing') ||
    hasRoleLike(roles, 'pump_suction_nozzle') ||
    /\b(pump|centrifugal[_\s-]?pump|pumpcasing|skidbase|volute)\b/.test(sourceText) ||
    /\b(pump|volute|skid)\b/.test(idText)
  ) {
    return 'pump_skid'
  }
  if (
    hasRoleLike(roles, 'filter_body') ||
    hasRoleLike(roles, 'bottom_discharge_hopper') ||
    /\b(dust[_\s-]?collector|baghouse|bag[_\s-]?filter|filter[_\s-]?collector|pulse[_\s-]?jet)\b/.test(
      sourceText,
    ) ||
    /dust|baghouse|filter/.test(idText)
  ) {
    return 'dust_collector'
  }
  if (
    hasRoleLike(roles, 'heat_exchanger_shell') ||
    hasRoleLike(roles, 'tube_sheet') ||
    /\b(heat[_\s-]?exchanger|shell[_\s-]?and[_\s-]?tube|condenser|cooler)\b/.test(sourceText) ||
    /exchanger|condenser|cooler/.test(idText)
  ) {
    return 'heat_exchanger'
  }
  if (
    hasRoleLike(roles, 'vessel_shell') ||
    hasRoleLike(roles, 'vessel_head') ||
    /\b(tank|vessel|vertical[_\s-]?vessel|storage[_\s-]?tank|pressure[_\s-]?vessel|silo)\b/.test(
      sourceText,
    ) ||
    /tank|vessel|silo/.test(idText)
  ) {
    return 'process_vessel'
  }
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
    if (n === 'control_cabinet' && r.includes('cabinet')) return true
    if (n === 'control_panel_glass' && (r.includes('glass') || r.includes('panel'))) return true
    if (n === 'skid_base' && r.includes('skid')) return true
    if (n === 'volute_casing' && (r.includes('volute') || r.includes('pump_casing'))) return true
    if (n === 'flange_port' && (r.includes('flange') || r.includes('port'))) {
      return true
    }
    if (n === 'vessel_shell' && (r.includes('vessel_shell') || r.includes('tank_shell'))) {
      return true
    }
    if (n === 'vessel_head' && (r === 'vessel_head' || r.includes('tank_head'))) return true
    if (n === 'filter_body' && (r.includes('filter_body') || r.includes('baghouse'))) return true
    if (n === 'bottom_discharge_hopper' && r.includes('hopper')) return true
    if (n === 'inlet_duct' && (r.includes('inlet') || r.includes('duct'))) return true
    if (n === 'outlet_duct' && (r.includes('outlet') || r.includes('duct'))) return true
    if (n === 'pulse_valve' && r.includes('pulse')) return true
    if (n === 'heat_exchanger_shell' && r.includes('heat_exchanger_shell')) return true
    if (n === 'tube_sheet' && r.includes('tube_sheet')) return true
    if (n === 'tube_bundle' && r.includes('tube_bundle')) return true
    if (n === 'channel_head' && r.includes('channel_head')) return true
    if (n === 'saddle_support' && r.includes('saddle')) return true
    if (n === 'baffle_plate' && r.includes('baffle')) return true
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

function checkControlCabinetDetails(
  ir: AssemblyIR,
  roles: Set<string>,
  issues: string[],
  warnings: string[],
): void {
  if (!hasRoleLike(roles, 'control_cabinet')) return

  if (ir.parts.length < 5) {
    issues.push(
      `realism_cabinet_under_detailed: control_cabinet has only ${ir.parts.length} parts; use controlCabinet() so it has body, door seam, glass/panel, handle, and nameplate.`,
    )
  }

  const body = ir.parts.find((p) => p.semanticRole === 'control_cabinet')
  if (body?.geometry.kind === 'primitive-recipe') {
    const cornerRadius = body.geometry.params.cornerRadius
    const cornerSegments = body.geometry.params.cornerSegments
    if (typeof cornerRadius !== 'number' || cornerRadius <= 0) {
      issues.push(
        'realism_cabinet_body_sharp: control cabinet body must use rounded sheet-metal cornerRadius.',
      )
    }
    if (typeof cornerSegments !== 'number' || cornerSegments < 5) {
      warnings.push(
        'realism_cabinet_corner_segments: control cabinet body should use at least 5 cornerSegments.',
      )
    }
    const material = body.material.preset
    if (material !== 'painted_steel' && material !== 'stainless_steel') {
      issues.push(
        'realism_cabinet_body_material: control cabinet body should use painted_steel or stainless_steel.',
      )
    }
  }

  const hasGlassOrPanel =
    hasRoleLike(roles, 'control_panel_glass') ||
    ir.parts.some((p) =>
      /display|hmi|indicator|button|panel/.test(`${p.semanticRole ?? ''} ${p.id}`),
    )
  if (!hasGlassOrPanel) {
    issues.push(
      'realism_cabinet_missing_operator_panel: control cabinet must include a visible glass/panel/display area.',
    )
  }

  const handle = ir.parts.find((p) => p.semanticRole === 'cabinet_handle')
  if (handle?.geometry.kind === 'primitive-recipe') {
    if (handle.geometry.recipeId !== 'primitive.cylinder') {
      issues.push('realism_cabinet_handle_shape: cabinet handle should be cylindrical.')
    }
    const radialSegments = handle.geometry.params.radialSegments
    if (typeof radialSegments !== 'number' || radialSegments < 16) {
      warnings.push(
        'realism_cabinet_handle_faceting: cabinet handle should use at least 16 radialSegments.',
      )
    }
  }

  if (!hasRoleLike(roles, 'equipment_nameplate')) {
    issues.push(
      'realism_cabinet_missing_nameplate: control cabinet needs an equipment nameplate or label.',
    )
  }
}

function checkPumpSkidDetails(
  ir: AssemblyIR,
  roles: Set<string>,
  issues: string[],
  warnings: string[],
): void {
  if (!hasRoleLike(roles, 'volute_casing') && !hasRoleLike(roles, 'skid_base')) return

  if (ir.parts.length < 16) {
    issues.push(
      `realism_pump_under_detailed: pump_skid has only ${ir.parts.length} parts; use skidBase(), pumpCasing(), motor(), flangePort(), pipeRun(), sheetCover(), and nameplate() so the assembly reads as real industrial equipment.`,
    )
  }

  const volute = ir.parts.find((p) => p.semanticRole === 'volute_casing')
  if (volute?.geometry.kind === 'primitive-recipe') {
    if (volute.geometry.recipeId !== 'primitive.cylinder') {
      issues.push(
        'realism_pump_casing_shape: volute casing should be a rounded cylinder-like casing.',
      )
    }
    const radialSegments = volute.geometry.params.radialSegments
    if (typeof radialSegments !== 'number' || radialSegments < 48) {
      issues.push(
        'realism_pump_casing_faceting: volute casing should use at least 48 radialSegments.',
      )
    }
    if (volute.material.preset !== 'painted_steel' && volute.material.preset !== 'cast_iron') {
      issues.push(
        'realism_pump_casing_material: volute casing should use painted_steel or cast_iron.',
      )
    }
  }

  const suctionNozzles = ir.parts.filter((p) => p.semanticRole === 'pump_suction_nozzle')
  const dischargeNozzles = ir.parts.filter((p) => p.semanticRole === 'pump_discharge_nozzle')
  if (suctionNozzles.length < 1 || dischargeNozzles.length < 1) {
    issues.push(
      'realism_pump_nozzles_missing: pump casing must include distinct suction and discharge nozzles.',
    )
  }

  const flangePorts = ir.parts.filter((p) => p.semanticRole === 'flange_port')
  if (flangePorts.length < 2) {
    issues.push(
      `realism_pump_flange_count: pump skid has only ${flangePorts.length} flange ports; use inlet and outlet flangePort() details.`,
    )
  }

  const skidRails = ir.parts.filter((p) => p.semanticRole === 'skid_base')
  const skidCrossMembers = ir.parts.filter((p) => p.semanticRole === 'skid_cross_member')
  if (skidRails.length < 2 || skidCrossMembers.length < 2) {
    issues.push(
      'realism_pump_skid_too_simple: skid base needs paired rails plus cross members, not a single slab.',
    )
  }

  const motor = ir.parts.find((p) => p.semanticRole === 'drive_motor')
  const motorDetails = ir.parts.filter((p) => p.semanticRole?.startsWith('motor_'))
  const hasMotorMount = motorDetails.some((p) => p.semanticRole === 'motor_mounting_foot')
  const hasTerminalBox = motorDetails.some((p) => p.semanticRole === 'motor_terminal_box')
  if (motor && (!hasMotorMount || !hasTerminalBox)) {
    issues.push(
      'realism_pump_motor_detail_missing: pump drive motor must include mounting feet and a terminal box.',
    )
  }
  if (motor?.geometry.kind === 'primitive-recipe') {
    const radialSegments = motor.geometry.params.radialSegments
    if (typeof radialSegments !== 'number' || radialSegments < 32) {
      issues.push(
        'realism_pump_motor_faceting: pump drive motor cylinder should use at least 32 radialSegments.',
      )
    }
  }

  if (!hasRoleLike(roles, 'sheet_cover_panel')) {
    warnings.push(
      'realism_pump_coupling_guard_missing: pump skids usually need a coupling guard or sheet cover between pump and motor.',
    )
  }
}

function checkProcessVesselDetails(
  ir: AssemblyIR,
  roles: Set<string>,
  issues: string[],
  warnings: string[],
): void {
  if (!hasRoleLike(roles, 'vessel_shell') && !hasRoleLike(roles, 'vessel_head')) return

  if (ir.parts.length < 12) {
    issues.push(
      `realism_vessel_under_detailed: process_vessel has only ${ir.parts.length} parts; use verticalVessel() so it has shell, heads, seams, ports, supports, access, and nameplate details.`,
    )
  }

  const shell = ir.parts.find((p) => p.semanticRole === 'vessel_shell')
  if (shell?.geometry.kind === 'primitive-recipe') {
    if (shell.geometry.recipeId !== 'primitive.cylinder') {
      issues.push('realism_vessel_shell_shape: vessel shell should be cylindrical.')
    }
    const radialSegments = shell.geometry.params.radialSegments
    if (typeof radialSegments !== 'number' || radialSegments < 48) {
      issues.push(
        'realism_vessel_shell_faceting: vessel shell should use at least 48 radialSegments.',
      )
    }
    if (shell.material.preset !== 'painted_steel' && shell.material.preset !== 'stainless_steel') {
      issues.push(
        'realism_vessel_shell_material: vessel shell should use painted_steel or stainless_steel.',
      )
    }
  }

  const heads = ir.parts.filter((p) => p.semanticRole === 'vessel_head')
  if (heads.length < 2) {
    issues.push(
      `realism_vessel_heads_missing: process vessel has only ${heads.length} heads; use top and bottom vessel_head parts.`,
    )
  }

  const ports = ir.parts.filter((p) => p.semanticRole === 'flange_port')
  if (ports.length < 2) {
    issues.push(
      `realism_vessel_ports_missing: process vessel has only ${ports.length} process ports; add inlet/outlet/top nozzles.`,
    )
  }

  if (!hasRoleLike(roles, 'inspection_door')) {
    issues.push('realism_vessel_access_missing: vessel needs a manway or inspection door.')
  }
  if (!hasRoleLike(roles, 'equipment_nameplate')) {
    warnings.push('realism_vessel_nameplate_missing: vessel should include an equipment nameplate.')
  }
  if (!hasRoleLike(roles, 'vessel_support_skirt') && !hasRoleLike(roles, 'support_leg')) {
    issues.push(
      'realism_vessel_support_missing: vessel needs skirt or support legs, not a floating shell.',
    )
  }
}

function checkDustCollectorDetails(
  ir: AssemblyIR,
  roles: Set<string>,
  issues: string[],
  warnings: string[],
): void {
  if (!hasRoleLike(roles, 'filter_body') && !hasRoleLike(roles, 'bottom_discharge_hopper')) return

  if (ir.parts.length < 16) {
    issues.push(
      `realism_dust_collector_under_detailed: dust_collector has only ${ir.parts.length} parts; use dustCollector() so it has filter body, hopper, ducts, support legs, pulse valves, access door, and nameplate.`,
    )
  }

  const body = ir.parts.find((p) => p.semanticRole === 'filter_body')
  if (body?.geometry.kind === 'primitive-recipe') {
    if (body.geometry.recipeId !== 'primitive.box') {
      issues.push(
        'realism_dust_collector_body_shape: baghouse filter body should be a boxy enclosure.',
      )
    }
    const cornerRadius = body.geometry.params.cornerRadius
    if (typeof cornerRadius !== 'number' || cornerRadius <= 0) {
      issues.push(
        'realism_dust_collector_body_sharp: filter body should use rounded sheet-metal cornerRadius.',
      )
    }
  }

  const hopper = ir.parts.find((p) => p.semanticRole === 'bottom_discharge_hopper')
  if (hopper?.geometry.kind === 'primitive-recipe') {
    if (hopper.geometry.recipeId !== 'primitive.frustum') {
      issues.push('realism_dust_collector_hopper_shape: dust collector needs a tapered hopper.')
    }
  }

  const supportLegs = ir.parts.filter((p) => p.semanticRole === 'support_leg')
  if (supportLegs.length < 4) {
    issues.push(
      `realism_dust_collector_supports_missing: dust collector has only ${supportLegs.length} support legs; hopper collectors should stand on four supports.`,
    )
  }

  if (!hasRoleLike(roles, 'inlet_duct') || !hasRoleLike(roles, 'outlet_duct')) {
    issues.push(
      'realism_dust_collector_ducts_missing: dust collector needs distinct inlet and outlet ducts.',
    )
  }

  const pulseValves = ir.parts.filter((p) => p.semanticRole === 'pulse_valve')
  if (pulseValves.length < 4) {
    issues.push(
      `realism_dust_collector_pulse_valves_missing: dust collector has only ${pulseValves.length} pulse valves; add a visible row of pulse valves.`,
    )
  }

  if (!hasRoleLike(roles, 'inspection_door')) {
    warnings.push(
      'realism_dust_collector_access_missing: dust collector should include an access door.',
    )
  }
  if (!hasRoleLike(roles, 'equipment_nameplate')) {
    warnings.push(
      'realism_dust_collector_nameplate_missing: dust collector should include a nameplate.',
    )
  }
}

function checkHeatExchangerDetails(
  ir: AssemblyIR,
  roles: Set<string>,
  issues: string[],
  warnings: string[],
): void {
  if (!hasRoleLike(roles, 'heat_exchanger_shell') && !hasRoleLike(roles, 'tube_sheet')) return

  if (ir.parts.length < 18) {
    issues.push(
      `realism_heat_exchanger_under_detailed: heat_exchanger has only ${ir.parts.length} parts; use heatExchanger() so it has shell, tube sheets, channel heads, visible tube bundle, saddles, baffles, flanged ports, and nameplate.`,
    )
  }

  const shell = ir.parts.find((p) => p.semanticRole === 'heat_exchanger_shell')
  if (shell?.geometry.kind === 'primitive-recipe') {
    if (shell.geometry.recipeId !== 'primitive.cylinder') {
      issues.push('realism_heat_exchanger_shell_shape: heat exchanger shell should be cylindrical.')
    }
    const radialSegments = shell.geometry.params.radialSegments
    if (typeof radialSegments !== 'number' || radialSegments < 48) {
      issues.push(
        'realism_heat_exchanger_shell_faceting: heat exchanger shell should use at least 48 radialSegments.',
      )
    }
  }

  const tubeSheets = ir.parts.filter((p) => p.semanticRole === 'tube_sheet')
  if (tubeSheets.length < 2) {
    issues.push(
      `realism_heat_exchanger_tube_sheets_missing: heat exchanger has only ${tubeSheets.length} tube sheets; both ends need visible tube-sheet plates.`,
    )
  }

  const tubes = ir.parts.filter((p) => p.semanticRole === 'tube_bundle')
  if (tubes.length < 6) {
    issues.push(
      `realism_heat_exchanger_tube_bundle_missing: heat exchanger has only ${tubes.length} visible tubes; add a repeated tube bundle.`,
    )
  }

  const saddles = ir.parts.filter((p) => p.semanticRole === 'saddle_support')
  if (saddles.length < 2) {
    issues.push(
      `realism_heat_exchanger_saddles_missing: heat exchanger has only ${saddles.length} saddle supports; horizontal exchangers need two saddles.`,
    )
  }

  const flangePorts = ir.parts.filter((p) => p.semanticRole === 'flange_port')
  if (flangePorts.length < 4) {
    issues.push(
      `realism_heat_exchanger_ports_missing: heat exchanger has only ${flangePorts.length} flanged ports; add shell-side and tube-side nozzles.`,
    )
  }

  if (!hasRoleLike(roles, 'channel_head')) {
    warnings.push('realism_heat_exchanger_channel_heads_missing: add channel heads on both ends.')
  }
  if (!hasRoleLike(roles, 'baffle_plate')) {
    warnings.push('realism_heat_exchanger_baffles_missing: add visible baffle/tube support cues.')
  }
  if (!hasRoleLike(roles, 'equipment_nameplate')) {
    warnings.push(
      'realism_heat_exchanger_nameplate_missing: heat exchanger should include a nameplate.',
    )
  }
}

function checkAccessDetails(
  ir: AssemblyIR,
  roles: Set<string>,
  source: string | undefined,
  issues: string[],
  warnings: string[],
): void {
  const requestsPlatform = sourceRequestsPlatform(source)
  const requestsLadder = sourceRequestsLadder(source)
  const requestsHandrail = sourceRequestsHandrail(source)
  const hasPlatform = hasRoleLike(roles, 'platform_grating')
  const hasLadder = hasRoleLike(roles, 'ladder_side_rail') || hasRoleLike(roles, 'ladder_rung')
  const hasHandrail = hasRoleLike(roles, 'handrail_top_rail') || hasRoleLike(roles, 'handrail_post')
  if (
    !requestsPlatform &&
    !requestsLadder &&
    !requestsHandrail &&
    !hasPlatform &&
    !hasLadder &&
    !hasHandrail
  ) {
    return
  }

  if (requestsPlatform && !hasPlatform) {
    issues.push(
      'realism_access_platform_missing: access/service platform requests must include platform()/platform_grating parts.',
    )
  }
  if (requestsLadder && !hasLadder) {
    issues.push(
      'realism_access_ladder_missing: access ladder requests must include ladder side rails and repeated rungs.',
    )
  }
  if (requestsHandrail && !hasHandrail) {
    issues.push(
      'realism_access_handrail_missing: platform or safety rail requests must include handrail top rails and posts.',
    )
  }

  if (hasPlatform) {
    const supports = ir.parts.filter((p) => p.semanticRole === 'platform_support_leg')
    const edgeBeams = ir.parts.filter((p) => p.semanticRole === 'platform_edge_beam')
    if (supports.length < 4 || edgeBeams.length < 2) {
      issues.push(
        `realism_access_platform_too_simple: platform has ${supports.length} support legs and ${edgeBeams.length} edge beams; use platform() so it has grating, beams, and supports.`,
      )
    }
    const grating = ir.parts.find((p) => p.semanticRole === 'platform_grating')
    if (grating?.material.preset !== 'wire_mesh') {
      warnings.push(
        'realism_access_platform_material: service platform should normally use wire_mesh grating.',
      )
    }
  }

  if (hasLadder) {
    const rails = ir.parts.filter((p) => p.semanticRole === 'ladder_side_rail')
    const rungs = ir.parts.filter((p) => p.semanticRole === 'ladder_rung')
    if (rails.length < 2 || rungs.length < 4) {
      issues.push(
        `realism_access_ladder_too_simple: ladder has ${rails.length} side rails and ${rungs.length} rungs; use ladder() instead of a single box or sparse lines.`,
      )
    }
    const facetedRung = rungs.find(
      (p) =>
        p.geometry.kind === 'primitive-recipe' &&
        (p.geometry.recipeId !== 'primitive.cylinder' ||
          typeof p.geometry.params.radialSegments !== 'number' ||
          p.geometry.params.radialSegments < 16),
    )
    if (facetedRung) {
      issues.push(
        'realism_access_ladder_faceting: ladder rungs should be cylindrical with at least 16 radialSegments.',
      )
    }
  }

  if (hasHandrail) {
    const topRails = ir.parts.filter((p) => p.semanticRole === 'handrail_top_rail')
    const midRails = ir.parts.filter((p) => p.semanticRole === 'handrail_mid_rail')
    const posts = ir.parts.filter((p) => p.semanticRole === 'handrail_post')
    if (topRails.length < 1 || posts.length < 2) {
      issues.push(
        `realism_access_handrail_too_simple: handrail has ${topRails.length} top rails and ${posts.length} posts; use handrail() so platforms read as safe service access.`,
      )
    }
    if (midRails.length < 1) {
      warnings.push(
        'realism_access_handrail_midrail_missing: handrails should usually include a mid rail.',
      )
    }
  }
}

function sourceRequestsGuard(source: string | undefined): boolean {
  return /\b(guard|guarded|guardcover|safety|protective|cover)\b|防护|護罩|护罩|罩/.test(
    source?.toLowerCase() ?? '',
  )
}

function sourceRequestsPlatform(source: string | undefined): boolean {
  return /\b(platform|walkway|service\s+access|grating)\b|平台|检修平台|走台|踏板|格栅/i.test(
    source?.toLowerCase() ?? '',
  )
}

function sourceRequestsLadder(source: string | undefined): boolean {
  return /\b(ladder|rung|access\s+ladder)\b|爬梯|梯子|踏棍|踏步/i.test(source?.toLowerCase() ?? '')
}

function sourceRequestsHandrail(source: string | undefined): boolean {
  return /\b(handrail|guardrail|safety\s+rail)\b|栏杆|扶手|护栏/i.test(source?.toLowerCase() ?? '')
}
