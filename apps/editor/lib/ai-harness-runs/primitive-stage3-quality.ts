import type { GeneratedGeometryArtifact } from '../../../../packages/editor/src/lib/ai-generated-geometry-core'

export type Stage3RepairPlan = {
  label: string
  tool: 'compose_parts' | 'compose_primitive'
  args: Record<string, unknown>
}

export type Stage3QualityReview = {
  passed: boolean
  score: number
  issues: string[]
  warnings: string[]
  repairPlan?: Stage3RepairPlan
  requiresModelRepair?: boolean
}

function normalizeStage3Role(value: unknown): string {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_')
    : ''
}

type Stage3LiftingKind = 'tower' | 'gantry' | 'overhead' | 'generic'

const STAGE3_LIFTING_INTENT_PATTERN =
  /crane|gantry|overhead|bridge_crane|tower_crane|jib|hook|trolley|hoist|\u9f99\u95e8\u540a|\u5854\u540a|\u5929\u8f66|\u8d77\u91cd\u884c\u8f66|\u6865\u5f0f\u884c\u8f66|\u884c\u8f66\u540a|\u8d77\u91cd|\u540a\u8f66/

function inferStage3LiftingKind(text: string): Stage3LiftingKind | undefined {
  if (!STAGE3_LIFTING_INTENT_PATTERN.test(text)) return undefined
  if (/tower[_\s-]?crane|\u5854\u540a/.test(text)) return 'tower'
  if (/gantry|portal[_\s-]?crane|\u9f99\u95e8\u540a/.test(text)) return 'gantry'
  if (
    /overhead|bridge[_\s-]?crane|\u5929\u8f66|\u8d77\u91cd\u884c\u8f66|\u6865\u5f0f\u884c\u8f66|\u884c\u8f66\u540a/.test(
      text,
    )
  )
    return 'overhead'
  return 'generic'
}

function stage3LiftingRequiredRoles(kind: Stage3LiftingKind): string[] {
  if (kind === 'tower') {
    return [
      'tower_mast',
      'slewing_unit',
      'operator_cab',
      'tower_peak',
      'main_jib',
      'counter_jib',
      'counterweight',
      'trolley',
      'wire_rope',
      'hook_block',
      'pendant_cable',
    ]
  }
  if (kind === 'gantry') {
    return ['support_leg', 'main_girder', 'trolley', 'wire_rope', 'hook_block', 'runway_rail']
  }
  if (kind === 'overhead') {
    return ['runway_rail', 'main_girder', 'trolley', 'wire_rope', 'hook_block']
  }
  return ['support', 'main_girder', 'trolley', 'wire_rope', 'hook_block']
}

function stage3ShapeText(shape: Record<string, unknown>): string {
  return [
    shape.name,
    shape.semanticRole,
    shape.sourcePartKind,
    shape.sourcePartId,
    shape.semanticGroup,
    shape.kind,
  ]
    .map(normalizeStage3Role)
    .filter(Boolean)
    .join(' ')
}

function stage3RequiredRoles(artifact: GeneratedGeometryArtifact): string[] {
  const brief = artifact.geometryBrief as
    | { requiredRoles?: unknown; semanticRoles?: unknown }
    | undefined
  const values = [
    ...(Array.isArray(brief?.requiredRoles) ? brief.requiredRoles : []),
    ...(Array.isArray(brief?.semanticRoles) ? brief.semanticRoles : []),
  ]
  return Array.from(new Set(values.map(normalizeStage3Role).filter(Boolean)))
}

function stage3EquivalentRoles(requiredRole: string): string[] {
  switch (requiredRole) {
    case 'bicycle_chain':
    case 'chain_drive':
      return ['chain_loop']
    case 'bicycle_handlebar':
      return ['handlebar']
    case 'bicycle_saddle':
    case 'bicycle_seat':
      return ['saddle']
    default:
      return []
  }
}

function stage3RolePresent(
  shapes: readonly Record<string, unknown>[],
  requiredRole: string,
): boolean {
  const acceptedRoles = [requiredRole, ...stage3EquivalentRoles(requiredRole)]
  return shapes.some((shape) => {
    const text = stage3ShapeText(shape)
    const semanticRole = normalizeStage3Role(shape.semanticRole)
    return acceptedRoles.some(
      (role) => text.includes(role) || (semanticRole.length > 0 && role.includes(semanticRole)),
    )
  })
}

function stage3RoleFamilyPattern(requiredRole: string): RegExp {
  if (/tower.*mast|mast|support|support_leg/.test(requiredRole)) {
    return /tower_mast|tower_body|tower_column|mast|support_column|support_leg|leg|column/
  }
  if (/slew|slewing|turntable/.test(requiredRole)) return /slew|slewing|turntable|rotating_platform/
  if (/tower.*peak|apex|peak/.test(requiredRole)) return /tower_peak|apex|peak|tower_cap/
  if (/pendant/.test(requiredRole)) return /pendant_cable|tie_rod|stay_cable|guy_cable/
  if (/operator|cabin|(^|_)cab($|_)/.test(requiredRole)) {
    return /operator_cab|driver_cab|cabin|(^|_)cab($|_)/
  }
  if (/counter.*jib|balance.*arm/.test(requiredRole)) return /counter_jib|counter_boom|balance_arm/
  if (/main.*jib|jib|boom|girder|beam|arm/.test(requiredRole)) {
    return /main_jib|jib_arm|jib_boom|boom|main_girder|bridge_girder|girder|beam/
  }
  if (/counter.*weight|ballast|weight/.test(requiredRole)) {
    return /counterweight|counter_weight|ballast/
  }
  if (/trolley|carriage/.test(requiredRole)) return /trolley|carriage/
  if (/wire.*rope|rope|cable/.test(requiredRole)) return /wire_rope|rope|hoist_cable|cable/
  if (/hook/.test(requiredRole)) return /hook_block|hook|load_hook/
  if (/rail|runway/.test(requiredRole)) return /runway_rail|rail|track/
  return new RegExp(requiredRole.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
}

function stage3RoleFamilyPresent(
  shapes: readonly Record<string, unknown>[],
  requiredRole: string,
): boolean {
  const pattern = stage3RoleFamilyPattern(requiredRole)
  return shapes.some((shape) => pattern.test(stage3ShapeText(shape)))
}

function numberAt(value: unknown, index: 0 | 1 | 2): number | undefined {
  if (Array.isArray(value) && typeof value[index] === 'number' && Number.isFinite(value[index])) {
    return value[index]
  }
  if (typeof value === 'object' && value !== null) {
    const key = index === 0 ? 'x' : index === 1 ? 'y' : 'z'
    const next = (value as Record<string, unknown>)[key]
    if (typeof next === 'number' && Number.isFinite(next)) return next
  }
  return undefined
}

function shapeCenterY(shape: Record<string, unknown>): number | undefined {
  return numberAt(shape.position, 1)
}

function shapeSpan(shape: Record<string, unknown>, axis: 0 | 1 | 2): number {
  const keys =
    axis === 1
      ? ['height', 'length']
      : axis === 2
        ? ['width', 'depth', 'radius']
        : ['length', 'width', 'radius']
  for (const key of keys) {
    const value = shape[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return key === 'radius' ? value * 2 : value
    }
  }
  return 0
}

function findStage3Shape(
  shapes: readonly Record<string, unknown>[],
  pattern: RegExp,
): Record<string, unknown> | undefined {
  return findStage3ShapeMatching(shapes, pattern)
}

function findStage3ShapeMatching(
  shapes: readonly Record<string, unknown>[],
  include: RegExp,
  exclude?: RegExp,
): Record<string, unknown> | undefined {
  return shapes.find((shape) => {
    const text = stage3ShapeText(shape)
    return include.test(text) && !(exclude?.test(text) ?? false)
  })
}

function addLiftingEquipmentSpatialIssues(
  artifact: GeneratedGeometryArtifact,
  text: string,
  issues: string[],
) {
  const shapes = artifact.shapes as unknown as Record<string, unknown>[]
  const combinedText = [
    text,
    artifact.geometryBrief?.category,
    artifact.geometryBrief?.requiredRoles?.join(' '),
    artifact.shapeDetails,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const liftingKind = inferStage3LiftingKind(combinedText)
  if (!liftingKind) return

  const unrelatedAircraft = shapes.find((shape) =>
    /aircraft|fuselage|(?:^|[\s_])wing(?:[\s_]|$)|wing_panel|stabilizer|nacelle|landing_gear|cockpit|cabin_window/.test(
      stage3ShapeText(shape),
    ),
  )
  if (unrelatedAircraft) {
    issues.push('Stage3 lifting equipment contains unrelated aircraft geometry.')
  }

  const support = findStage3Shape(shapes, /leg|column|mast|tower_body|tower_column|support/)
  const span = findStage3Shape(shapes, /girder|main_girder|bridge_girder|jib|counter_jib|boom/)
  const trolley = findStage3ShapeMatching(shapes, /trolley|carriage/, /hook|load|suspended/)
  const hook = findStage3Shape(shapes, /hook|suspended|load/)
  const wheelOrRail = findStage3Shape(shapes, /wheel|rail|runway/)

  for (const role of stage3LiftingRequiredRoles(liftingKind)) {
    if (!stage3RoleFamilyPresent(shapes, role)) {
      issues.push(`Stage3 lifting equipment missing structural role "${role}".`)
    }
  }

  if (support && span) {
    const supportY = shapeCenterY(support)
    const spanY = shapeCenterY(span)
    if (supportY != null && spanY != null && spanY <= supportY + 0.05) {
      issues.push('Stage3 lifting structure span/beam must be above its support/mast.')
    }
    const supportWidth = Math.max(shapeSpan(support, 0), shapeSpan(support, 2), 0.001)
    const spanLength = Math.max(shapeSpan(span, 0), shapeSpan(span, 2))
    if (spanLength < supportWidth * 1.8) {
      issues.push('Stage3 lifting structure span/beam is too short relative to its support.')
    }
  }

  if (trolley && hook) {
    const trolleyY = shapeCenterY(trolley)
    const hookY = shapeCenterY(hook)
    if (trolleyY != null && hookY != null && hookY >= trolleyY - 0.05) {
      issues.push('Stage3 lifting hook must hang below the trolley/carriage.')
    }
  }

  if (liftingKind === 'gantry' || liftingKind === 'overhead') {
    if (!span) issues.push('Stage3 bridge/gantry crane requires a spanning beam/girder.')
    if (!hook) issues.push('Stage3 bridge/gantry crane requires a hook or suspended load.')
    if (!wheelOrRail)
      issues.push('Stage3 bridge/gantry crane requires bottom wheels or runway rails.')
  }
}

function addBoxEnclosureEquipmentIssues(
  artifact: GeneratedGeometryArtifact,
  text: string,
  issues: string[],
) {
  const shapes = artifact.shapes as unknown as Record<string, unknown>[]
  const combinedText = [
    text,
    artifact.geometryBrief?.category,
    artifact.geometryBrief?.requiredRoles?.join(' '),
    artifact.geometryBrief?.semanticRoles?.join(' '),
    artifact.semanticSummary,
    artifact.visualQualitySummary,
    artifact.shapeDetails,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const outdoorAcIntent =
    /outdoor[_\s-]?ac|ac[_\s-]?outdoor|air[_\s-]?condition|condenser|hvac|\u7a7a\u8c03|\u5916\u673a/.test(
      combinedText,
    )
  if (!outdoorAcIntent) return

  const pedestalPart = shapes.find((shape) =>
    /vertical_pole|circular_base|fan_base|fan_pole|pedestal|support_bracket|fan_yoke/.test(
      stage3ShapeText(shape),
    ),
  )
  if (pedestalPart) {
    issues.push('Stage3 outdoor enclosure must not include pedestal fan stand parts.')
  }

  const bodyEntry = shapes
    .map((shape, index) => ({ shape, index }))
    .find(({ shape }) =>
      /condenser_body|main_body|machine_body|body|housing|casing|enclosure|shell/.test(
        stage3ShapeText(shape),
      ),
    )
  const body = bodyEntry?.shape
  const foot = findStage3Shape(shapes, /support_feet|support_foot|feet|foot|base_leg|leg/)
  if (body && foot) {
    const bodyY = shapeCenterY(body)
    const footY = shapeCenterY(foot)
    const bodyHeight = shapeSpan(body, 1)
    if (bodyY != null && footY != null) {
      const expectedBelow = bodyHeight > 0 ? bodyY - bodyHeight * 0.25 : bodyY - 0.05
      if (footY >= expectedBelow) {
        issues.push('Stage3 enclosure support feet must be below the main body.')
      }
    }
  }
  if (bodyEntry) {
    const bodyTop = stage3ShapeTopY(artifact, bodyEntry.shape, bodyEntry.index)
    const floatingFanPart = shapes.find((shape, index) => {
      const shapeText = stage3ShapeText(shape)
      if (!/motor_housing|protective_grill/.test(shapeText)) return false
      if (/front_grille|fan_guard|fan_grill/.test(shapeText)) return false
      return stage3ShapeBottomY(artifact, shape, index) > bodyTop + 0.05
    })
    if (floatingFanPart) {
      issues.push(
        'Stage3 outdoor enclosure must not include floating standalone fan parts above the body.',
      )
    }
  }
}

export type Stage3SemanticRepairResult = {
  artifact: GeneratedGeometryArtifact
  label: string
}

function stage3CombinedIntentText(userPrompt: string, artifact: GeneratedGeometryArtifact): string {
  return [
    userPrompt,
    artifact.geometryBrief?.category,
    artifact.geometryBrief?.requiredRoles?.join(' '),
    artifact.geometryBrief?.semanticRoles?.join(' '),
    artifact.semanticSummary,
    artifact.visualQualitySummary,
    artifact.shapeDetails,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isStage3LiftingIntent(text: string): boolean {
  return STAGE3_LIFTING_INTENT_PATTERN.test(text)
}

function isStage3OutdoorAcIntent(text: string): boolean {
  return /outdoor[_\s-]?ac|ac[_\s-]?outdoor|air[_\s-]?condition|condenser|hvac|\u7a7a\u8c03|\u5916\u673a/.test(
    text,
  )
}

function stage3ShapePosition(
  artifact: GeneratedGeometryArtifact,
  shape: Record<string, unknown>,
  index: number,
): [number, number, number] {
  const transformPosition = artifact.transforms[index]?.position
  return [
    numberAt(transformPosition, 0) ?? numberAt(shape.position, 0) ?? 0,
    numberAt(transformPosition, 1) ?? numberAt(shape.position, 1) ?? 0,
    numberAt(transformPosition, 2) ?? numberAt(shape.position, 2) ?? 0,
  ]
}

function setStage3ShapePosition(
  artifact: GeneratedGeometryArtifact,
  shape: Record<string, unknown>,
  index: number,
  position: [number, number, number],
) {
  shape.position = position
  const transform = artifact.transforms[index]
  if (transform) {
    artifact.transforms[index] = { ...transform, position }
  }
}

function stage3ShapeHalfHeight(shape: Record<string, unknown>): number {
  return Math.max(shapeSpan(shape, 1) / 2, 0.05)
}

function stage3ShapeTopY(
  artifact: GeneratedGeometryArtifact,
  shape: Record<string, unknown>,
  index: number,
): number {
  return stage3ShapePosition(artifact, shape, index)[1] + stage3ShapeHalfHeight(shape)
}

function stage3ShapeBottomY(
  artifact: GeneratedGeometryArtifact,
  shape: Record<string, unknown>,
  index: number,
): number {
  return stage3ShapePosition(artifact, shape, index)[1] - stage3ShapeHalfHeight(shape)
}

function stage3MoveAbove(
  artifact: GeneratedGeometryArtifact,
  child: Record<string, unknown>,
  childIndex: number,
  parent: Record<string, unknown>,
  parentIndex: number,
  clearance = 0.08,
): boolean {
  const childPosition = stage3ShapePosition(artifact, child, childIndex)
  const parentPosition = stage3ShapePosition(artifact, parent, parentIndex)
  const targetY =
    parentPosition[1] + stage3ShapeHalfHeight(parent) + stage3ShapeHalfHeight(child) + clearance
  if (childPosition[1] >= targetY - 0.01) return false
  setStage3ShapePosition(artifact, child, childIndex, [childPosition[0], targetY, childPosition[2]])
  return true
}

function stage3MoveBelow(
  artifact: GeneratedGeometryArtifact,
  child: Record<string, unknown>,
  childIndex: number,
  parent: Record<string, unknown>,
  parentIndex: number,
  clearance = 0.08,
): boolean {
  const childPosition = stage3ShapePosition(artifact, child, childIndex)
  const parentPosition = stage3ShapePosition(artifact, parent, parentIndex)
  const targetY =
    parentPosition[1] - stage3ShapeHalfHeight(parent) - stage3ShapeHalfHeight(child) - clearance
  if (childPosition[1] <= targetY + 0.01) return false
  setStage3ShapePosition(artifact, child, childIndex, [childPosition[0], targetY, childPosition[2]])
  return true
}

function findStage3ShapeWithIndex(
  artifact: GeneratedGeometryArtifact,
  include: RegExp,
  exclude?: RegExp,
): { shape: Record<string, unknown>; index: number } | undefined {
  const shapes = artifact.shapes as unknown as Record<string, unknown>[]
  for (const [index, shape] of shapes.entries()) {
    const text = stage3ShapeText(shape)
    if (include.test(text) && !(exclude?.test(text) ?? false)) return { shape, index }
  }
  return undefined
}

function compactStage3ArtifactDetails(artifact: GeneratedGeometryArtifact): string {
  return artifact.shapes
    .map((shape, index) => {
      const position = artifact.transforms[index]?.position ?? shape.position
      return `  - ${shape.name ?? shape.kind}: ${shape.kind} pos=[${(position as number[] | undefined)?.join(',') ?? '0,0,0'}] role=${shape.semanticRole ?? ''} source=${shape.sourcePartKind ?? ''}`
    })
    .join('\n')
}

function addStage3Shape(
  artifact: GeneratedGeometryArtifact,
  shape: Record<string, unknown>,
  position: [number, number, number],
) {
  const nextShape = {
    kind: 'box',
    name: shape.semanticRole ?? shape.name ?? 'semantic scaffold',
    position,
    rotation: [0, 0, 0],
    length: 1,
    width: 1,
    height: 1,
    sourcePartKind: 'semantic_scaffold',
    ...shape,
  }
  artifact.shapes.push(nextShape as GeneratedGeometryArtifact['shapes'][number])
  artifact.transforms.push({ position, rotation: [0, 0, 0] })
  artifact.createdNames.push(String(nextShape.name ?? nextShape.kind))
  return { shape: nextShape, index: artifact.shapes.length - 1 }
}

function removeDuplicateStage3RoleFamilies(
  artifact: GeneratedGeometryArtifact,
  requiredRoles: readonly string[],
): boolean {
  const keep = new Set<number>()
  const remove = new Set<number>()
  const shapes = artifact.shapes as unknown as Record<string, unknown>[]
  for (const role of requiredRoles) {
    const pattern = stage3RoleFamilyPattern(role)
    const matching = shapes
      .map((shape, index) => ({ shape, index }))
      .filter(({ shape }) => pattern.test(stage3ShapeText(shape)))
    if (matching.length <= 1) continue
    keep.add(matching[0]!.index)
    for (const duplicate of matching.slice(1)) remove.add(duplicate.index)
  }
  if (remove.size === 0) return false
  const entries = artifact.shapes
    .map((shape, index) => ({ shape, transform: artifact.transforms[index], index }))
    .filter(({ index }) => keep.has(index) || !remove.has(index))
  artifact.shapes = entries.map(({ shape }) => shape)
  artifact.transforms = entries.map(({ shape, transform }) => ({
    position: transform?.position ?? shape.position ?? [0, 0, 0],
    rotation: transform?.rotation ?? shape.rotation ?? [0, 0, 0],
  }))
  artifact.createdNames = entries.map(({ shape }) => shape.name ?? shape.kind)
  return true
}

function stage3SupportTop(
  artifact: GeneratedGeometryArtifact,
  support: { shape: Record<string, unknown>; index: number } | undefined,
): number {
  if (!support) return 1
  const position = stage3ShapePosition(artifact, support.shape, support.index)
  return position[1] + stage3ShapeHalfHeight(support.shape)
}

function findStage3MainSpan(artifact: GeneratedGeometryArtifact) {
  return (
    findStage3ShapeWithIndex(artifact, /main_jib|jib_arm|jib_boom|boom/, /counter/) ??
    findStage3ShapeWithIndex(artifact, /main_girder|bridge_girder|girder|beam/, /counter/)
  )
}

function stage3LiftingAnchorFrame(artifact: GeneratedGeometryArtifact, kind: Stage3LiftingKind) {
  const support = findStage3ShapeWithIndex(
    artifact,
    /tower_mast|tower_body|tower_column|mast|support_column|support_leg|support|leg|column/,
    /guard|rail|stair/,
  )
  const mainSpan = findStage3MainSpan(artifact)
  const counterSpan = findStage3ShapeWithIndex(artifact, /counter_jib|counter_boom|balance_arm/)
  const supportPosition: [number, number, number] = support
    ? stage3ShapePosition(artifact, support.shape, support.index)
    : [0, 0, 0]
  const supportTop = stage3SupportTop(artifact, support)
  const mainPosition: [number, number, number] = mainSpan
    ? stage3ShapePosition(artifact, mainSpan.shape, mainSpan.index)
    : [supportPosition[0] + 2.8, supportTop + 0.75, supportPosition[2]]
  const mainLength = mainSpan
    ? Math.max(shapeSpan(mainSpan.shape, 0), shapeSpan(mainSpan.shape, 2), 1)
    : 7.5
  const direction = mainPosition[0] >= supportPosition[0] ? 1 : -1
  const jibY = Math.max(mainPosition[1], supportTop + (kind === 'tower' ? 0.65 : 0.35))
  const trolleyX = mainPosition[0] + direction * mainLength * 0.22
  const trolleyZ = mainPosition[2]
  return {
    kind,
    support,
    mainSpan,
    counterSpan,
    supportPosition: supportPosition as [number, number, number],
    supportTop,
    mainPosition: mainPosition as [number, number, number],
    mainLength,
    direction,
    jibY,
    trolleyPosition: [trolleyX, jibY - 0.18, trolleyZ] as [number, number, number],
  }
}

function setStage3ShapeHeight(shape: Record<string, unknown>, height: number) {
  shape.height = Math.max(0.01, height)
}

function addLiftingRequiredRoleScaffold(
  artifact: GeneratedGeometryArtifact,
  requiredRole: string,
  kind: Stage3LiftingKind = 'generic',
): boolean {
  const shapes = artifact.shapes as unknown as Record<string, unknown>[]
  const roleAlreadyPresent = /pendant/.test(requiredRole)
    ? stage3RoleFamilyPresent(shapes, requiredRole)
    : stage3RolePresent(shapes, requiredRole) || stage3RoleFamilyPresent(shapes, requiredRole)
  if (roleAlreadyPresent) {
    return false
  }
  const frame = stage3LiftingAnchorFrame(artifact, kind)
  const top = frame.supportTop
  const spanY = frame.jibY
  const [trolleyX, trolleyY, trolleyZ] = frame.trolleyPosition

  if (/slew|slewing|platform|turntable/.test(requiredRole)) {
    addStage3Shape(
      artifact,
      {
        semanticRole: requiredRole,
        length: 1.8,
        width: 1.6,
        height: 0.3,
        color: '#d97706',
      },
      [frame.supportPosition[0], top + 0.2, frame.supportPosition[2]],
    )
    return true
  }
  if (/tower.*peak|apex|peak/.test(requiredRole)) {
    addStage3Shape(
      artifact,
      {
        semanticRole: requiredRole,
        length: 0.28,
        width: 0.28,
        height: 0.9,
        color: '#facc15',
      },
      [frame.supportPosition[0], spanY + 0.55, frame.supportPosition[2]],
    )
    return true
  }
  if (/cabin|cab|operator|driver/.test(requiredRole)) {
    addStage3Shape(
      artifact,
      {
        semanticRole: requiredRole,
        length: 0.9,
        width: 0.8,
        height: 0.65,
        color: '#facc15',
      },
      [frame.supportPosition[0] + 0.65, top + 0.55, frame.supportPosition[2] + 0.35],
    )
    return true
  }
  if (/counter.*(jib|arm)|balance.*(jib|arm)/.test(requiredRole)) {
    addStage3Shape(
      artifact,
      {
        semanticRole: requiredRole,
        length: 3.2,
        width: 0.28,
        height: 0.28,
        color: '#facc15',
      },
      [frame.supportPosition[0] - frame.direction * 1.9, top + 0.75, frame.supportPosition[2]],
    )
    return true
  }
  if (/counter.*weight|ballast|weight/.test(requiredRole)) {
    addStage3Shape(
      artifact,
      {
        semanticRole: requiredRole,
        length: 0.9,
        width: 0.9,
        height: 0.7,
        color: '#6b7280',
      },
      [frame.supportPosition[0] - frame.direction * 3.4, top + 0.45, frame.supportPosition[2]],
    )
    return true
  }
  if (/pendant/.test(requiredRole)) {
    addStage3Shape(
      artifact,
      {
        kind: 'cylinder',
        axis: 'y',
        semanticRole: requiredRole,
        name: 'semantic tower crane pendant cable',
        radius: 0.025,
        height: Math.max(frame.mainLength * 0.55, 1.2),
        rotation: [0, 0, -0.72 * frame.direction],
        color: '#111827',
      },
      [
        frame.supportPosition[0] + frame.direction * frame.mainLength * 0.28,
        spanY + 0.28,
        frame.supportPosition[2],
      ],
    )
    return true
  }
  if (/jib|boom|girder|beam|arm/.test(requiredRole)) {
    addStage3Shape(
      artifact,
      {
        semanticRole: requiredRole,
        length: 7.5,
        width: 0.26,
        height: 0.26,
        color: '#facc15',
      },
      [frame.supportPosition[0] + frame.direction * 2.8, top + 0.75, frame.supportPosition[2]],
    )
    return true
  }
  if (/trolley|carriage/.test(requiredRole)) {
    addStage3Shape(
      artifact,
      {
        semanticRole: requiredRole,
        length: 0.75,
        width: 0.5,
        height: 0.35,
        color: '#374151',
      },
      [trolleyX, trolleyY, trolleyZ],
    )
    return true
  }
  if (/wire.*rope|rope|cable/.test(requiredRole)) {
    addStage3Shape(
      artifact,
      {
        kind: 'cylinder',
        axis: 'y',
        semanticRole: requiredRole,
        name: 'semantic vertical wire rope',
        radius: 0.025,
        height: 1.05,
        color: '#111827',
      },
      [trolleyX, trolleyY - 0.65, trolleyZ],
    )
    return true
  }
  if (/hook|load|suspended/.test(requiredRole)) {
    addStage3Shape(
      artifact,
      {
        semanticRole: requiredRole,
        length: 0.3,
        width: 0.18,
        height: 0.45,
        color: '#111827',
      },
      [trolleyX, trolleyY - 1.3, trolleyZ],
    )
    return true
  }
  return false
}

function normalizeStage3LiftingTopology(
  artifact: GeneratedGeometryArtifact,
  kind: Stage3LiftingKind,
): boolean {
  let changed = false
  const frame = stage3LiftingAnchorFrame(artifact, kind)
  const mainSpan = frame.mainSpan
  if (mainSpan) {
    const current = stage3ShapePosition(artifact, mainSpan.shape, mainSpan.index)
    const targetY = Math.max(current[1], frame.supportTop + (kind === 'tower' ? 0.65 : 0.35))
    if (Math.abs(current[1] - targetY) > 0.01) {
      setStage3ShapePosition(artifact, mainSpan.shape, mainSpan.index, [
        current[0],
        targetY,
        current[2],
      ])
      changed = true
    }
  }

  const peak = findStage3ShapeWithIndex(artifact, /tower_peak|apex|peak|tower_cap/)
  if (kind === 'tower' && peak) {
    const target: [number, number, number] = [
      frame.supportPosition[0],
      frame.jibY + Math.max(stage3ShapeHalfHeight(peak.shape), 0.35) + 0.12,
      frame.supportPosition[2],
    ]
    const current = stage3ShapePosition(artifact, peak.shape, peak.index)
    if (
      Math.abs(current[0] - target[0]) > 0.01 ||
      Math.abs(current[1] - target[1]) > 0.01 ||
      Math.abs(current[2] - target[2]) > 0.01
    ) {
      setStage3ShapePosition(artifact, peak.shape, peak.index, target)
      changed = true
    }
  }

  const trolley = findStage3ShapeWithIndex(artifact, /trolley|carriage/, /hook|load|suspended/)
  if (trolley) {
    const current = stage3ShapePosition(artifact, trolley.shape, trolley.index)
    const target = frame.trolleyPosition
    if (
      Math.abs(current[0] - target[0]) > 0.01 ||
      Math.abs(current[1] - target[1]) > 0.01 ||
      Math.abs(current[2] - target[2]) > 0.01
    ) {
      setStage3ShapePosition(artifact, trolley.shape, trolley.index, target)
      changed = true
    }
  }

  const nextTrolley =
    trolley ?? findStage3ShapeWithIndex(artifact, /trolley|carriage/, /hook|load|suspended/)
  const rope = findStage3ShapeWithIndex(artifact, /wire_rope|rope|hoist_cable|cable/, /pendant/)
  const hook = findStage3ShapeWithIndex(artifact, /hook_block|hook|suspended|load/)
  const anchor = nextTrolley
    ? stage3ShapePosition(artifact, nextTrolley.shape, nextTrolley.index)
    : frame.trolleyPosition
  if (hook) {
    const hookHalf = stage3ShapeHalfHeight(hook.shape)
    const target: [number, number, number] = [
      anchor[0],
      anchor[1] - Math.max(0.9, hookHalf + 0.55),
      anchor[2],
    ]
    const current = stage3ShapePosition(artifact, hook.shape, hook.index)
    if (
      Math.abs(current[0] - target[0]) > 0.01 ||
      Math.abs(current[1] - target[1]) > 0.01 ||
      Math.abs(current[2] - target[2]) > 0.01
    ) {
      setStage3ShapePosition(artifact, hook.shape, hook.index, target)
      changed = true
    }
  }
  if (rope && hook) {
    const hookPosition = stage3ShapePosition(artifact, hook.shape, hook.index)
    const ropeHeight = Math.max(
      anchor[1] - hookPosition[1] - stage3ShapeHalfHeight(hook.shape),
      0.35,
    )
    setStage3ShapeHeight(rope.shape, ropeHeight)
    setStage3ShapePosition(artifact, rope.shape, rope.index, [
      anchor[0],
      hookPosition[1] + stage3ShapeHalfHeight(hook.shape) + ropeHeight / 2,
      anchor[2],
    ])
    changed = true
  }

  const counterweight = findStage3ShapeWithIndex(artifact, /counterweight|counter_weight|ballast/)
  const counterSpan = frame.counterSpan
  if (counterweight && counterSpan) {
    const counterPosition = stage3ShapePosition(artifact, counterSpan.shape, counterSpan.index)
    const counterLength = Math.max(
      shapeSpan(counterSpan.shape, 0),
      shapeSpan(counterSpan.shape, 2),
      1,
    )
    const target: [number, number, number] = [
      counterPosition[0] - frame.direction * counterLength * 0.38,
      counterPosition[1] +
        stage3ShapeHalfHeight(counterSpan.shape) +
        stage3ShapeHalfHeight(counterweight.shape) +
        0.06,
      counterPosition[2],
    ]
    setStage3ShapePosition(artifact, counterweight.shape, counterweight.index, target)
    changed = true
  }
  return changed
}

function ensureStage3TowerPendantCable(artifact: GeneratedGeometryArtifact): boolean {
  if (
    stage3RoleFamilyPresent(
      artifact.shapes as unknown as Record<string, unknown>[],
      'pendant_cable',
    )
  ) {
    return false
  }
  const frame = stage3LiftingAnchorFrame(artifact, 'tower')
  addStage3Shape(
    artifact,
    {
      kind: 'cylinder',
      axis: 'y',
      semanticRole: 'pendant_cable',
      name: 'semantic tower crane pendant cable',
      radius: 0.025,
      height: Math.max(frame.mainLength * 0.55, 1.2),
      rotation: [0, 0, -0.72 * frame.direction],
      color: '#111827',
    },
    [
      frame.supportPosition[0] + frame.direction * frame.mainLength * 0.28,
      frame.jibY + 0.28,
      frame.supportPosition[2],
    ],
  )
  return true
}

export function repairStage3SemanticArtifact(
  userPrompt: string,
  artifact: GeneratedGeometryArtifact,
): Stage3SemanticRepairResult | undefined {
  const intentText = stage3CombinedIntentText(userPrompt, artifact)
  const liftingIntent = isStage3LiftingIntent(intentText)
  const outdoorAcIntent = isStage3OutdoorAcIntent(intentText)
  if (!liftingIntent && !outdoorAcIntent) return undefined

  let changed = false
  const unrelatedPattern = liftingIntent
    ? /aircraft|fuselage|(?:^|[\s_])wing(?:[\s_]|$)|wing_panel|stabilizer|nacelle|landing_gear|cockpit|cabin_window/
    : outdoorAcIntent
      ? /vertical_pole|circular_base|fan_base|fan_pole|pedestal|support_bracket|fan_yoke/
      : undefined
  const acBody = outdoorAcIntent
    ? findStage3ShapeWithIndex(
        artifact,
        /condenser_body|main_body|machine_body|body|housing|casing|enclosure|shell/,
      )
    : undefined
  const acBodyTop = acBody ? stage3ShapeTopY(artifact, acBody.shape, acBody.index) : undefined
  const isFloatingAcFanPart = (shape: Record<string, unknown>, index: number) => {
    if (acBodyTop == null) return false
    const shapeText = stage3ShapeText(shape)
    if (!/motor_housing|protective_grill/.test(shapeText)) return false
    if (/front_grille|fan_guard|fan_grill/.test(shapeText)) return false
    return stage3ShapeBottomY(artifact, shape, index) > acBodyTop + 0.05
  }
  const keptShapeEntries = artifact.shapes
    .map((shape, index) => ({ shape, transform: artifact.transforms[index], index }))
    .filter(({ shape, index }) => {
      const shapeText = stage3ShapeText(shape as unknown as Record<string, unknown>)
      if (unrelatedPattern?.test(shapeText) ?? false) return false
      return !isFloatingAcFanPart(shape as unknown as Record<string, unknown>, index)
    })
  if (keptShapeEntries.length !== artifact.shapes.length && keptShapeEntries.length >= 2) {
    changed = true
  }

  const repaired: GeneratedGeometryArtifact = {
    ...artifact,
    shapes: keptShapeEntries.map(({ shape }) => ({ ...shape })),
    transforms: keptShapeEntries.map(({ shape, transform }) => ({
      position: transform?.position ?? shape.position,
      rotation: transform?.rotation ?? shape.rotation ?? [0, 0, 0],
    })),
    createdNames: keptShapeEntries.map(({ shape }) => shape.name ?? shape.kind),
  }

  if (liftingIntent) {
    const liftingKind = inferStage3LiftingKind(intentText) ?? 'generic'
    const requiredRoles = Array.from(
      new Set([...stage3RequiredRoles(repaired), ...stage3LiftingRequiredRoles(liftingKind)]),
    )
    changed = removeDuplicateStage3RoleFamilies(repaired, requiredRoles) || changed
    for (const requiredRole of requiredRoles) {
      changed = addLiftingRequiredRoleScaffold(repaired, requiredRole, liftingKind) || changed
    }
    changed = normalizeStage3LiftingTopology(repaired, liftingKind) || changed
    if (liftingKind === 'tower') {
      changed = ensureStage3TowerPendantCable(repaired) || changed
    }
  }

  if (outdoorAcIntent) {
    const body = findStage3ShapeWithIndex(
      repaired,
      /condenser_body|main_body|machine_body|body|housing|casing|enclosure|shell/,
    )
    const foot = findStage3ShapeWithIndex(
      repaired,
      /support_feet|support_foot|feet|foot|base_leg|leg/,
    )
    if (body && foot) {
      changed =
        stage3MoveBelow(repaired, foot.shape, foot.index, body.shape, body.index, 0.02) || changed
    }
  }

  if (!changed) return undefined
  repaired.shapeDetails = compactStage3ArtifactDetails(repaired)
  repaired.visualQualitySummary = [
    repaired.visualQualitySummary,
    'Stage3 semantic repair normalized unrelated-family drift and vertical topology.',
  ]
    .filter(Boolean)
    .join('\n')
  return { artifact: repaired, label: 'generic semantic topology repair' }
}

function cloneStage3Artifact(artifact: GeneratedGeometryArtifact): GeneratedGeometryArtifact {
  return {
    ...artifact,
    shapes: artifact.shapes.map((shape) => ({ ...shape })),
    transforms: artifact.shapes.map((shape, index) => ({
      position: artifact.transforms[index]?.position ?? shape.position ?? [0, 0, 0],
      rotation: artifact.transforms[index]?.rotation ?? shape.rotation ?? [0, 0, 0],
    })),
    createdNames: [...artifact.createdNames],
  }
}

function stage3ColorOf(shape: Record<string, unknown>, fallback: string): string {
  const material = shape.material
  if (typeof shape.color === 'string') return shape.color
  if (typeof shape.primaryColor === 'string') return shape.primaryColor
  if (typeof shape.metalColor === 'string') return shape.metalColor
  if (
    typeof material === 'object' &&
    material !== null &&
    'properties' in material &&
    typeof (material as { properties?: unknown }).properties === 'object' &&
    (material as { properties?: { color?: unknown } }).properties?.color
  ) {
    const color = (material as { properties?: { color?: unknown } }).properties?.color
    if (typeof color === 'string') return color
  }
  return fallback
}

function markStage3ShapeTransparent(shape: Record<string, unknown>, opacity: number) {
  const color = stage3ColorOf(shape, '#facc15')
  shape.material = {
    properties: {
      color,
      roughness: 0.62,
      metalness: 0.08,
      opacity,
      transparent: true,
    },
  }
}

function hasStage3RoleLike(artifact: GeneratedGeometryArtifact, pattern: RegExp): boolean {
  return (artifact.shapes as unknown as Record<string, unknown>[]).some((shape) =>
    pattern.test(stage3ShapeText(shape)),
  )
}

function addStage3TowerFramePolish(
  artifact: GeneratedGeometryArtifact,
  support: { shape: Record<string, unknown>; index: number },
): boolean {
  if (hasStage3RoleLike(artifact, /lattice_column|lattice_rung|tower_column/)) return false
  const position = stage3ShapePosition(artifact, support.shape, support.index)
  const height = Math.max(shapeSpan(support.shape, 1), 1)
  const xSpan = Math.max(shapeSpan(support.shape, 0), 0.7)
  const zSpan = Math.max(shapeSpan(support.shape, 2), 0.7)
  if (height < Math.max(xSpan, zSpan) * 1.8) return false

  markStage3ShapeTransparent(support.shape, 0.18)
  const color = stage3ColorOf(support.shape, '#d4a017')
  const columnSize = Math.min(Math.max(Math.min(xSpan, zSpan) * 0.08, 0.045), 0.12)
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      addStage3Shape(
        artifact,
        {
          semanticRole: 'lattice_column',
          name: 'semantic lattice tower column',
          length: columnSize,
          width: columnSize,
          height,
          color,
        },
        [position[0] + (xSign * xSpan) / 2, position[1], position[2] + (zSign * zSpan) / 2],
      )
    }
  }

  const levels = 4
  for (let level = 1; level < levels; level += 1) {
    const y = position[1] - height / 2 + (height * level) / levels
    for (const zSign of [-1, 1]) {
      addStage3Shape(
        artifact,
        {
          semanticRole: 'lattice_rung',
          name: 'semantic lattice horizontal rung',
          length: xSpan,
          width: columnSize * 0.65,
          height: columnSize * 0.65,
          color,
        },
        [position[0], y, position[2] + (zSign * zSpan) / 2],
      )
    }
    for (const xSign of [-1, 1]) {
      addStage3Shape(
        artifact,
        {
          semanticRole: 'lattice_rung',
          name: 'semantic lattice transverse rung',
          length: columnSize * 0.65,
          width: zSpan,
          height: columnSize * 0.65,
          color,
        },
        [position[0] + (xSign * xSpan) / 2, y, position[2]],
      )
    }
  }
  return true
}

function addStage3SpanTrussPolish(
  artifact: GeneratedGeometryArtifact,
  span: { shape: Record<string, unknown>; index: number },
): boolean {
  const text = stage3ShapeText(span.shape)
  if (!/girder|main_girder|bridge_girder|jib|counter_jib|boom/.test(text)) return false
  const position = stage3ShapePosition(artifact, span.shape, span.index)
  const length = Math.max(shapeSpan(span.shape, 0), shapeSpan(span.shape, 2))
  if (
    length < 2.2 ||
    hasStage3RoleLike(artifact, new RegExp(`${text.split(' ')[0]}.*truss_chord`))
  ) {
    return false
  }

  const color = stage3ColorOf(span.shape, '#facc15')
  span.shape.height = Math.min(Math.max(shapeSpan(span.shape, 1) * 0.45, 0.08), 0.18)
  span.shape.width = Math.min(Math.max(shapeSpan(span.shape, 2) * 0.55, 0.08), 0.22)
  const chordRole = `${normalizeStage3Role(span.shape.semanticRole) || 'span'}_truss_chord`
  const chordHeight = 0.055
  const verticalGap = Math.max(shapeSpan(span.shape, 1), 0.24)
  addStage3Shape(
    artifact,
    {
      semanticRole: chordRole,
      name: 'semantic truss upper chord',
      length,
      width: 0.06,
      height: chordHeight,
      color,
    },
    [position[0], position[1] + verticalGap / 2, position[2]],
  )
  addStage3Shape(
    artifact,
    {
      semanticRole: chordRole,
      name: 'semantic truss lower chord',
      length,
      width: 0.06,
      height: chordHeight,
      color,
    },
    [position[0], position[1] - verticalGap / 2, position[2]],
  )
  for (const offset of [-0.35, 0, 0.35]) {
    addStage3Shape(
      artifact,
      {
        semanticRole: `${normalizeStage3Role(span.shape.semanticRole) || 'span'}_truss_web`,
        name: 'semantic truss web post',
        length: 0.05,
        width: 0.05,
        height: verticalGap,
        color,
      },
      [position[0] + offset * length, position[1], position[2]],
    )
  }
  return true
}

function polishStage3LiftingArtifact(artifact: GeneratedGeometryArtifact): boolean {
  if (artifact.shapes.length > 70) return false
  let changed = false
  const support = findStage3ShapeWithIndex(
    artifact,
    /tower_mast|tower_body|tower_column|mast|support_column|support|leg|column/,
    /guard|rail|stair/,
  )
  if (support) changed = addStage3TowerFramePolish(artifact, support) || changed

  const spanEntries = (artifact.shapes as unknown as Record<string, unknown>[])
    .map((shape, index) => ({ shape, index }))
    .filter(({ shape }) =>
      /girder|main_girder|bridge_girder|jib|counter_jib|boom/.test(stage3ShapeText(shape)),
    )
    .slice(0, 3)
  for (const span of spanEntries) {
    changed = addStage3SpanTrussPolish(artifact, span) || changed
  }

  const trolley = findStage3ShapeWithIndex(artifact, /trolley|carriage/, /hook|load|suspended/)
  const hook = findStage3ShapeWithIndex(artifact, /hook|suspended|load/)
  const rope = findStage3ShapeWithIndex(artifact, /wire_rope|rope|cable/)
  if ((trolley || hook) && hook && !rope) {
    const parent = trolley ?? findStage3ShapeWithIndex(artifact, /girder|jib|boom|bridge_girder/)
    if (parent) {
      const parentPosition = stage3ShapePosition(artifact, parent.shape, parent.index)
      const hookPosition = stage3ShapePosition(artifact, hook.shape, hook.index)
      const ropeHeight = Math.max(
        parentPosition[1] - hookPosition[1] - stage3ShapeHalfHeight(hook.shape),
        0.4,
      )
      addStage3Shape(
        artifact,
        {
          kind: 'cylinder',
          axis: 'y',
          semanticRole: 'wire_rope',
          name: 'semantic vertical wire rope',
          radius: 0.025,
          height: ropeHeight,
          color: '#111827',
        },
        [
          hookPosition[0],
          hookPosition[1] + ropeHeight / 2 + stage3ShapeHalfHeight(hook.shape),
          hookPosition[2],
        ],
      )
      changed = true
    }
  }
  return changed
}

function polishStage3OutdoorEnclosureArtifact(artifact: GeneratedGeometryArtifact): boolean {
  const body = findStage3ShapeWithIndex(
    artifact,
    /condenser_body|main_body|machine_body|body|housing|casing|enclosure|shell/,
  )
  if (!body) return false
  let changed = false
  const bodyPosition = stage3ShapePosition(artifact, body.shape, body.index)
  const bodyHalfDepth = Math.max(shapeSpan(body.shape, 2) / 2, 0.16)
  const bodyHalfLength = Math.max(shapeSpan(body.shape, 0) / 2, 0.24)
  const bodyBottom = stage3ShapeBottomY(artifact, body.shape, body.index)
  const entriesBeforeCull = artifact.shapes.map((shape, index) => ({
    shape,
    index,
    text: stage3ShapeText(shape as unknown as Record<string, unknown>),
  }))
  const hasSpecificFaceFanOrVent = entriesBeforeCull.some(
    ({ text }) =>
      /front.*(grille|vent|fan)|fan_guard|fan_grill|fan_impeller|radial_blades|cooling_fan|front_vent/.test(
        text,
      ) && !/^protective_grill$/.test(normalizeStage3Role(text)),
  )
  if (hasSpecificFaceFanOrVent) {
    const keptShapeEntries = entriesBeforeCull
      .map(({ shape, index, text }) => ({ shape, transform: artifact.transforms[index], text }))
      .filter(({ text }) => {
        const genericProtectiveGrill =
          /protective_grill/.test(text) &&
          !/front.*(grille|fan)|fan_guard|fan_grill|fan_impeller|cooling_fan/.test(text)
        return !genericProtectiveGrill
      })
    if (keptShapeEntries.length !== artifact.shapes.length) {
      artifact.shapes = keptShapeEntries.map(({ shape }) => shape)
      artifact.transforms = keptShapeEntries.map(
        ({ transform, shape }) =>
          transform ?? {
            position: stage3ShapePosition(artifact, shape as unknown as Record<string, unknown>, 0),
            rotation: [0, 0, 0],
          },
      )
      changed = true
    }
  }
  const entries = (artifact.shapes as unknown as Record<string, unknown>[]).map((shape, index) => ({
    shape,
    index,
    text: stage3ShapeText(shape),
  }))
  const faceMountedEntries = entries.filter(({ text }) =>
    /front.*(grille|vent|fan)|fan_guard|fan_grill|fan_impeller|radial_blades|protective_grill/.test(
      text,
    ),
  )
  if (faceMountedEntries.length > 0) {
    const centers = faceMountedEntries.map(({ shape, index }) =>
      stage3ShapePosition(artifact, shape, index),
    )
    const centerX = centers.reduce((sum, position) => sum + position[0], 0) / centers.length
    const centerY = centers.reduce((sum, position) => sum + position[1], 0) / centers.length
    for (const { shape, index } of faceMountedEntries) {
      const current = stage3ShapePosition(artifact, shape, index)
      const next: [number, number, number] = [
        bodyPosition[0] + (current[0] - centerX),
        bodyPosition[1] + (current[1] - centerY),
        bodyPosition[2] + bodyHalfDepth + 0.04,
      ]
      setStage3ShapePosition(artifact, shape, index, next)
      changed = true
    }
  }

  for (const { shape, index, text } of entries) {
    if (/side.*(vent|radiator|heat|louver|grille)/.test(text)) {
      const current = stage3ShapePosition(artifact, shape, index)
      const next: [number, number, number] = [
        bodyPosition[0] - bodyHalfLength - 0.035,
        current[1],
        bodyPosition[2],
      ]
      setStage3ShapePosition(artifact, shape, index, next)
      changed = true
    } else if (/support_feet|support_foot|feet|foot|base_leg/.test(text)) {
      const current = stage3ShapePosition(artifact, shape, index)
      const next: [number, number, number] = [
        current[0],
        bodyBottom - stage3ShapeHalfHeight(shape) - 0.025,
        current[2],
      ]
      setStage3ShapePosition(artifact, shape, index, next)
      changed = true
    }
  }
  return changed
}

export function polishStage3SemanticArtifact(
  userPrompt: string,
  artifact: GeneratedGeometryArtifact,
): Stage3SemanticRepairResult | undefined {
  const intentText = stage3CombinedIntentText(userPrompt, artifact)
  const liftingIntent = isStage3LiftingIntent(intentText)
  const outdoorAcIntent = isStage3OutdoorAcIntent(intentText)
  if (!liftingIntent && !outdoorAcIntent) return undefined

  const polished = cloneStage3Artifact(artifact)
  let changed = false
  if (liftingIntent) changed = polishStage3LiftingArtifact(polished) || changed
  if (outdoorAcIntent) changed = polishStage3OutdoorEnclosureArtifact(polished) || changed
  if (!changed) return undefined

  polished.shapeDetails = compactStage3ArtifactDetails(polished)
  polished.visualQualitySummary = [
    polished.visualQualitySummary,
    'Stage3 semantic polish added frame/truss or face-anchored visual structure.',
  ]
    .filter(Boolean)
    .join('\n')
  return { artifact: polished, label: 'generic semantic visual polish' }
}

export function stage3QualityReview(
  userPrompt: string,
  artifact: GeneratedGeometryArtifact,
): Stage3QualityReview {
  const text = userPrompt.toLowerCase()
  const roles = new Set(artifact.shapes.map((shape) => shape.semanticRole).filter(Boolean))
  const sourceKinds = new Set(artifact.shapes.map((shape) => shape.sourcePartKind).filter(Boolean))
  const issues: string[] = []
  const warnings: string[] = []
  let repairPlan: Stage3RepairPlan | undefined
  let requiresModelRepair = false

  const hasAllRoles = (requiredRoles: string[]) => {
    const missing = requiredRoles.filter((role) => !roles.has(role))
    for (const role of missing) issues.push(`Stage3 missing required role "${role}".`)
    return missing.length === 0
  }
  const hasForbiddenRole = (forbiddenRoles: string[]) => {
    const found = forbiddenRoles.filter((role) => roles.has(role))
    for (const role of found) issues.push(`Stage3 found unrelated role "${role}".`)
    return found.length > 0
  }

  const explicitRequiredRoles = stage3RequiredRoles(artifact)
  const missingExplicitRoles = explicitRequiredRoles.filter(
    (role) => !stage3RolePresent(artifact.shapes as unknown as Record<string, unknown>[], role),
  )
  for (const role of missingExplicitRoles) {
    issues.push(`Stage3 missing declared required role "${role}".`)
  }
  if (missingExplicitRoles.length > 0) requiresModelRepair = true

  const promptAndArtifactText = [
    text,
    artifact.geometryBrief?.category,
    artifact.geometryBrief?.semanticRoles?.join(' '),
    artifact.geometryBrief?.requiredRoles?.join(' '),
    artifact.semanticSummary,
    artifact.visualQualitySummary,
    artifact.shapeDetails,
    artifact.shapes
      .map((shape) => [shape.name, shape.semanticRole, shape.sourcePartKind, shape.kind].join(' '))
      .join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const roundContainerIntentText = [text, artifact.geometryBrief?.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const roundContainerIntent =
    /(\u6696\u6c34\u74f6|\u5f00\u6c34\u74f6|\u70ed\u6c34\u74f6|\u4fdd\u6e29\u74f6|\u74f6|\u5706\u7b52|\u676f\u5b50|\u6c34\u676f|\u676f|bottle|flask|thermos|vacuum[_\s-]?flask|hot[_\s-]?water[_\s-]?bottle|cup|mug|(?:tin|soda|beverage)[_\s-]?can|canister|jar|round[_\s-]?container)/i.test(
      roundContainerIntentText,
    ) &&
    !/(\u50a8\u7f50|\u538b\u529b\u7f50|\u538b\u529b\u5bb9\u5668|storage[_\s-]?tank|pressure[_\s-]?(tank|vessel)|reactor|agitator|stirred)/i.test(
      text,
    ) &&
    !/(\u9f99\u95e8\u540a|\u5854\u540a|\u8d77\u91cd|\u540a\u8f66|\u884c\u8f66|gantry[_\s-]?crane|tower[_\s-]?crane|portal[_\s-]?crane|overhead[_\s-]?crane|crane|hoist)/i.test(
      text,
    )
  if (roundContainerIntent) {
    const hasRoundMainBody = artifact.shapes.some(
      (shape) =>
        /body|shell|vessel|container|bottle|flask|cup|(?:tin|soda|beverage)[_\s-]?can|canister|jar|main/i.test(
          `${shape.semanticRole ?? ''} ${shape.sourcePartKind ?? ''} ${shape.name ?? ''}`,
        ) && /^(cylinder|hollow-cylinder|capsule|lathe|sphere|ellipsoid|sweep)$/.test(shape.kind),
    )
    const hasBoxMainBody = artifact.shapes.some(
      (shape) =>
        shape.kind === 'box' &&
        /generic_body|body|shell|container|bottle|flask|cup|(?:tin|soda|beverage)[_\s-]?can|canister|jar|main/i.test(
          `${shape.semanticRole ?? ''} ${shape.sourcePartKind ?? ''} ${shape.name ?? ''}`,
        ),
    )
    if (!hasRoundMainBody || hasBoxMainBody) {
      issues.push(
        'Stage3 round container main body must use round primitive geometry, not generic_body box.',
      )
      repairPlan = {
        label: 'canonical round container primitive',
        tool: 'compose_primitive',
        args: {
          name: 'round container',
          geometryBrief:
            'round container with cylindrical body, neck/rim, cap, and optional side handle',
          shapes: [
            {
              kind: 'cylinder',
              name: 'round cylindrical body',
              semanticRole: 'bottle_body',
              position: [0, 0.15, 0],
              axis: 'y',
              radius: 0.065,
              height: 0.26,
              material: {
                properties: { color: '#c0c0c0', roughness: 0.32, metalness: 0.7 },
              },
            },
            {
              kind: 'cylinder',
              name: 'narrow neck',
              semanticRole: 'neck_rim',
              position: [0, 0.292, 0],
              axis: 'y',
              radius: 0.032,
              height: 0.024,
              material: {
                properties: { color: '#d4d4d4', roughness: 0.28, metalness: 0.75 },
              },
            },
            {
              kind: 'cylinder',
              name: 'top cap',
              semanticRole: 'bottle_cap',
              position: [0, 0.325, 0],
              axis: 'y',
              radius: 0.04,
              height: 0.035,
              material: {
                properties: { color: '#ef4444', roughness: 0.55, metalness: 0.05 },
              },
            },
            {
              kind: 'capsule',
              name: 'side handle',
              semanticRole: 'side_handle',
              position: [0.085, 0.18, 0],
              axis: 'y',
              radius: 0.012,
              height: 0.16,
              material: {
                properties: { color: '#111827', roughness: 0.6, metalness: 0.1 },
              },
            },
          ],
        },
      }
    }
  }

  const tankIntent =
    /(\u5367\u5f0f|\u50a8\u7f50|\u538b\u529b\u7f50|\u538b\u529b\u5bb9\u5668|storage[_\s-]?tank|pressure[_\s-]?(tank|vessel)|horizontal[_\s-]?(tank|vessel))/i.test(
      text,
    ) && !/(\u53cd\u5e94\u91dc|\u53cd\u5e94\u5668|reactor|agitator|stirred)/i.test(text)
  if (tankIntent) {
    const required = [
      'vessel_shell',
      'vessel_head',
      'top_nozzle',
      'manway_flange',
      'saddle_support',
    ]
    const complete = hasAllRoles(required)
    const unrelated = hasForbiddenRole([
      'fan_blades',
      'protective_grill',
      'machine_body',
      'machine_enclosure',
      'auger_screw',
      'bicycle_tire',
    ])
    if (!sourceKinds.has('cylindrical_tank')) {
      issues.push('Stage3 pressure tank must be backed by cylindrical_tank.')
    }
    if (!complete || unrelated || !sourceKinds.has('cylindrical_tank')) {
      repairPlan = {
        label: 'canonical horizontal pressure tank',
        tool: 'compose_parts',
        args: {
          name: 'horizontal pressure storage tank',
          family: 'generic',
          parts: [
            {
              kind: 'cylindrical_tank',
              semanticRole: 'vessel_shell',
              axis: 'x',
              length: 2.2,
              radius: 0.34,
            },
          ],
        },
      }
    }
  }

  const platformIntent =
    !/(\u673a\u5668\u81c2|\u673a\u68b0\u81c2|\u516d\u8f74|\u4e03\u8f74|\u56db\u8f74|robot[_\s-]?arm|industrial[_\s-]?robot|six[_\s-]?axis|6[_\s-]?axis|seven[_\s-]?axis|7[_\s-]?axis|four[_\s-]?axis|4[_\s-]?axis|fanuc|kuka|abb)/i.test(
      text,
    ) &&
    /(\u68c0\u4fee\u5e73\u53f0|\u5de5\u4e1a\u5e73\u53f0|\u722c\u68af|access[_\s-]?platform|inspection[_\s-]?platform|platform[_\s-]?ladder)/i.test(
      text,
    ) &&
    !/(\u50a8\u7f50|\u538b\u529b\u7f50|\u538b\u529b\u5bb9\u5668|\u53cd\u5e94\u91dc|\u53cd\u5e94\u5668|storage[_\s-]?tank|pressure[_\s-]?(tank|vessel)|reactor|agitator|stirred)/i.test(
      text,
    )
  if (platformIntent) {
    const complete = hasAllRoles([
      'access_platform',
      'platform_post',
      'guard_rail',
      'ladder_side_rail',
      'ladder_rung',
    ])
    const unrelated = hasForbiddenRole([
      'bicycle_tire',
      'vehicle_tire',
      'vessel_shell',
      'machine_body',
      'fan_blades',
    ])
    if (!sourceKinds.has('platform_ladder')) {
      issues.push('Stage3 inspection platform must be backed by platform_ladder.')
    }
    if (!complete || unrelated || !sourceKinds.has('platform_ladder')) {
      repairPlan = {
        label: 'canonical industrial platform ladder',
        tool: 'compose_parts',
        args: {
          name: 'industrial inspection platform ladder',
          family: 'generic',
          parts: [
            {
              kind: 'platform_ladder',
              semanticRole: 'access_platform',
              length: 1.2,
              width: 0.7,
              height: 1.6,
              count: 7,
            },
          ],
        },
      }
    }
  }

  const beforeSpatialIssueCount = issues.length
  addLiftingEquipmentSpatialIssues(artifact, text, issues)
  addBoxEnclosureEquipmentIssues(artifact, text, issues)
  if (issues.length > beforeSpatialIssueCount) requiresModelRepair = true

  if (artifact.shapes.length > 70) {
    warnings.push(`Stage3 high shape count (${artifact.shapes.length}); prefer reusable parts.`)
  }
  const score = Math.max(0, Math.min(1, 1 - issues.length * 0.18 - warnings.length * 0.05))
  return {
    passed: issues.length === 0 && score >= 0.75,
    score,
    issues,
    warnings,
    repairPlan,
    requiresModelRepair,
  }
}
