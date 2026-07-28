import type { Vec3 } from '../primitive-compose'

export type EquipmentMaterialPreset =
  | 'painted_steel'
  | 'stainless_steel'
  | 'cast_iron'
  | 'transparent_polycarbonate'
  | 'wire_mesh'
  | 'rubber_belt'
  | 'aluminum_frame'
  | 'yellow_safety'
  | 'dark_fastener'
  | 'control_panel_glass'

export type EquipmentMaterial = {
  color: string
  roughness: number
  metalness: number
  opacity?: number
}

export const EQUIPMENT_MATERIALS: Record<EquipmentMaterialPreset, EquipmentMaterial> = {
  painted_steel: { color: '#64748b', roughness: 0.5, metalness: 0.65 },
  stainless_steel: { color: '#c0c5c9', roughness: 0.28, metalness: 0.9 },
  cast_iron: { color: '#4a4a4a', roughness: 0.78, metalness: 0.55 },
  transparent_polycarbonate: {
    color: '#d4f0ff',
    roughness: 0.08,
    metalness: 0,
    opacity: 0.35,
  },
  wire_mesh: { color: '#8899aa', roughness: 0.58, metalness: 0.7 },
  rubber_belt: { color: '#2d2d2d', roughness: 0.95, metalness: 0 },
  aluminum_frame: { color: '#d0d5d8', roughness: 0.22, metalness: 0.82 },
  yellow_safety: { color: '#facc15', roughness: 0.42, metalness: 0.2 },
  dark_fastener: { color: '#111827', roughness: 0.55, metalness: 0.8 },
  control_panel_glass: { color: '#0f172a', roughness: 0.16, metalness: 0, opacity: 0.72 },
}

export type EquipmentBounds = {
  id: string
  center: Vec3
  size: Vec3
  semanticRole?: string
}

export type EquipmentPartSpec = {
  id: string
  kind: 'box' | 'cylinder' | 'sphere' | 'frustum' | 'torus' | 'sweep'
  params: Record<string, unknown>
  position: Vec3
  rotation?: { axis: 'x' | 'y' | 'z'; degrees: number }
  semanticRole: string
  material?: EquipmentMaterialPreset
  color?: string
  bounds?: EquipmentBounds
}

export type EquipmentBuildContext = {
  resolveTarget?: (idOrRole: string | undefined) => EquipmentBounds | undefined
}

type CommonParams = {
  id: string
  material?: EquipmentMaterialPreset
  color?: string
}

export type BeltParams = CommonParams & {
  length?: number
  width?: number
  thickness?: number
  y?: number
  z?: number
}

export type RollerArrayParams = CommonParams & {
  length?: number
  width?: number
  count?: number
  radius?: number
  y?: number
  z?: number
}

export type BoxFrameParams = CommonParams & {
  length?: number
  width?: number
  height?: number
  railThickness?: number
  legCount?: number
}

export type GuardCoverParams = CommonParams & {
  side?: 'top' | 'left' | 'right'
  target?: string
  length?: number
  width?: number
  height?: number
  clearance?: number
  panelThickness?: number
  frameWidth?: number
}

export type MotorParams = CommonParams & {
  side?: 'left' | 'right'
  position?: 'front' | 'rear' | 'center'
  target?: string
  diameter?: number
  length?: number
}

export type InspectionDoorParams = CommonParams & {
  side?: 'left' | 'right' | 'front' | 'back'
  count?: number
  target?: string
  width?: number
  height?: number
}

export type NameplateParams = CommonParams & {
  text?: string
  target?: string
  side?: 'front' | 'back' | 'left' | 'right'
  width?: number
  height?: number
}

export type SheetCoverParams = CommonParams & {
  target?: string
  side?: 'top' | 'front' | 'back' | 'left' | 'right'
  length?: number
  width?: number
  height?: number
  thickness?: number
  clearance?: number
}

export type FlangePortParams = CommonParams & {
  target?: string
  side?: 'front' | 'back' | 'left' | 'right' | 'top'
  nominalDiameter?: number
  length?: number
}

export type PipeRunParams = CommonParams & {
  from?: Vec3
  to?: Vec3
  radius?: number
  includeFlanges?: boolean
}

export type ControlCabinetParams = CommonParams & {
  target?: string
  side?: 'left' | 'right' | 'front' | 'back'
  width?: number
  height?: number
  depth?: number
}

export type SkidBaseParams = CommonParams & {
  length?: number
  width?: number
  height?: number
  railThickness?: number
}

export type PumpCasingParams = CommonParams & {
  target?: string
  diameter?: number
  width?: number
}

export type GearboxParams = CommonParams & {
  target?: string
  side?: 'left' | 'right' | 'front' | 'back'
  position?: 'front' | 'rear' | 'center'
  length?: number
  width?: number
  height?: number
}

export type BearingBlockParams = CommonParams & {
  target?: string
  side?: 'left' | 'right'
  position?: 'front' | 'rear' | 'center'
  width?: number
  height?: number
  depth?: number
}

export type PlatformParams = CommonParams & {
  target?: string
  side?: 'front' | 'back' | 'left' | 'right'
  length?: number
  width?: number
  height?: number
  thickness?: number
  legCount?: number
}

export type LadderParams = CommonParams & {
  target?: string
  side?: 'front' | 'back' | 'left' | 'right'
  height?: number
  width?: number
  rungCount?: number
}

export type HandrailParams = CommonParams & {
  target?: string
  side?: 'front' | 'back' | 'left' | 'right' | 'all'
  length?: number
  width?: number
  height?: number
  postCount?: number
}

export type VerticalVesselParams = CommonParams & {
  diameter?: number
  height?: number
  shellThickness?: number
  includeLadder?: boolean
  includeManway?: boolean
  includePorts?: boolean
}

export type DustCollectorParams = CommonParams & {
  width?: number
  depth?: number
  height?: number
  bagCount?: number
  includeLadder?: boolean
}

const round = (value: number) => Number(value.toFixed(4))

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(min, Math.min(max, n))
}

const spec = (
  input: Omit<EquipmentPartSpec, 'bounds'> & { size?: Vec3; boundsRole?: string },
): EquipmentPartSpec => ({
  id: input.id,
  kind: input.kind,
  params: input.params,
  position: input.position,
  ...(input.rotation ? { rotation: input.rotation } : {}),
  semanticRole: input.semanticRole,
  ...(input.material ? { material: input.material } : {}),
  ...(input.color ? { color: input.color } : {}),
  ...(input.size
    ? {
        bounds: {
          id: input.id,
          center: input.position,
          size: input.size,
          semanticRole: input.boundsRole ?? input.semanticRole,
        },
      }
    : {}),
})

export function buildBelt(params: BeltParams): EquipmentPartSpec[] {
  const length = clamp(params.length, 6, 0.5, 30)
  const width = clamp(params.width, 0.72, 0.15, 3)
  const thickness = clamp(params.thickness, 0.055, 0.015, 0.18)
  const y = clamp(params.y, 0.82, 0.1, 3)
  const z = clamp(params.z, 0, -10, 10)
  const radius = Math.min(width * 0.04, 0.055)
  return [
    spec({
      id: `${params.id}.surface`,
      kind: 'box',
      semanticRole: 'belt',
      position: [0, y, z],
      size: [length, thickness, width],
      material: params.material ?? 'rubber_belt',
      color: params.color,
      params: {
        length,
        width,
        height: thickness,
        cornerRadius: radius,
        cornerSegments: 6,
      },
    }),
    spec({
      id: `${params.id}.front_pulley_hint`,
      kind: 'cylinder',
      semanticRole: 'belt_pulley',
      position: [length / 2 - width * 0.08, y - thickness * 0.1, z],
      rotation: { axis: 'x', degrees: 90 },
      material: 'dark_fastener',
      params: { radius: width * 0.075, height: width * 1.04, radialSegments: 40 },
    }),
    spec({
      id: `${params.id}.rear_pulley_hint`,
      kind: 'cylinder',
      semanticRole: 'belt_pulley',
      position: [-length / 2 + width * 0.08, y - thickness * 0.1, z],
      rotation: { axis: 'x', degrees: 90 },
      material: 'dark_fastener',
      params: { radius: width * 0.075, height: width * 1.04, radialSegments: 40 },
    }),
  ]
}

export function buildRollerArray(params: RollerArrayParams): EquipmentPartSpec[] {
  const length = clamp(params.length, 6, 0.5, 30)
  const width = clamp(params.width, 0.78, 0.15, 3)
  const count = Math.round(clamp(params.count, Math.max(4, Math.ceil(length / 0.55)), 2, 64))
  const radius = clamp(params.radius, width * 0.045, 0.015, 0.16)
  const y = clamp(params.y, 0.72, 0.05, 3)
  const z = clamp(params.z, 0, -10, 10)
  const spacing = count <= 1 ? 0 : length / (count - 1)
  const start = -length / 2
  return Array.from({ length: count }, (_, i) =>
    spec({
      id: `${params.id}.roller.${i}`,
      kind: 'cylinder',
      semanticRole: 'roller',
      position: [round(start + spacing * i), y, z],
      rotation: { axis: 'x', degrees: 90 },
      material: params.material ?? 'stainless_steel',
      color: params.color,
      params: { radius, height: width, radialSegments: 32 },
    }),
  )
}

export function buildBoxFrame(params: BoxFrameParams): EquipmentPartSpec[] {
  const length = clamp(params.length, 6, 0.5, 30)
  const width = clamp(params.width, 0.9, 0.2, 4)
  const height = clamp(params.height, 0.8, 0.2, 4)
  const rail = clamp(params.railThickness, width * 0.035, 0.025, 0.16)
  const legCount = Math.round(clamp(params.legCount, Math.max(4, Math.ceil(length / 2)), 4, 16))
  const material = params.material ?? 'aluminum_frame'
  const parts: EquipmentPartSpec[] = [
    spec({
      id: `${params.id}.left_rail`,
      kind: 'box',
      semanticRole: 'support_frame',
      position: [0, height, -width / 2],
      size: [length, rail, rail],
      material,
      color: params.color,
      params: { length, width: rail, height: rail, cornerRadius: rail * 0.22, cornerSegments: 5 },
    }),
    spec({
      id: `${params.id}.right_rail`,
      kind: 'box',
      semanticRole: 'support_frame',
      position: [0, height, width / 2],
      size: [length, rail, rail],
      material,
      color: params.color,
      params: { length, width: rail, height: rail, cornerRadius: rail * 0.22, cornerSegments: 5 },
    }),
  ]
  const spacing = length / (legCount - 1)
  for (let i = 0; i < legCount; i += 1) {
    const x = -length / 2 + spacing * i
    for (const [side, z] of [
      ['left', -width / 2],
      ['right', width / 2],
    ] as const) {
      parts.push(
        spec({
          id: `${params.id}.leg.${i}.${side}`,
          kind: 'box',
          semanticRole: 'support_leg',
          position: [round(x), height / 2, z],
          size: [rail, height, rail],
          material,
          color: params.color,
          params: {
            length: rail,
            width: rail,
            height,
            cornerRadius: rail * 0.18,
            cornerSegments: 4,
          },
        }),
      )
    }
  }
  for (let i = 1; i < legCount - 1; i += 2) {
    const x = -length / 2 + spacing * i
    parts.push(
      spec({
        id: `${params.id}.cross_tie.${i}`,
        kind: 'box',
        semanticRole: 'frame_cross_member',
        position: [round(x), height * 0.52, 0],
        size: [rail, rail, width],
        material,
        color: params.color,
        params: { length: rail, width, height: rail, cornerRadius: rail * 0.18, cornerSegments: 4 },
      }),
    )
  }
  return parts
}

export function buildGuardCover(
  params: GuardCoverParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const side = params.side ?? 'top'
  const clearance = clamp(params.clearance, 0.08, 0.02, 0.5)
  const length = clamp(params.length, target ? target.size[0] * 0.6 : 3.5, 0.3, 30)
  const width = clamp(params.width, target ? target.size[2] + clearance * 2 : 1.0, 0.2, 5)
  const height = clamp(
    params.height,
    target ? Math.max(0.42, target.size[1] + 0.45) : 0.55,
    0.12,
    4,
  )
  const t = clamp(params.panelThickness, 0.012, 0.003, 0.06)
  const rail = clamp(params.frameWidth, Math.max(width * 0.025, 0.025), 0.015, 0.12)
  const material = params.material ?? 'transparent_polycarbonate'
  const frameMaterial: EquipmentMaterialPreset =
    material === 'wire_mesh' ? 'yellow_safety' : 'aluminum_frame'
  const center: Vec3 = target
    ? [
        target.center[0],
        target.center[1] + target.size[1] / 2 + height / 2 + clearance,
        target.center[2],
      ]
    : [0, 1.25, 0]
  if (side === 'left') center[2] -= width / 2
  if (side === 'right') center[2] += width / 2
  const yBase = center[1] - height / 2
  const yTop = center[1] + height / 2
  const zFront = center[2] + width / 2
  const zBack = center[2] - width / 2
  const xLeft = center[0] - length / 2
  const xRight = center[0] + length / 2
  const cr = Math.min(t * 0.45, 0.008)
  const parts: EquipmentPartSpec[] = [
    spec({
      id: `${params.id}.top_panel`,
      kind: 'box',
      semanticRole: 'safety_guard_cover',
      position: [center[0], yTop, center[2]],
      size: [length, t, width],
      material,
      color: params.color,
      params: { length, width, height: t, cornerRadius: cr, cornerSegments: 6 },
    }),
    spec({
      id: `${params.id}.front_panel`,
      kind: 'box',
      semanticRole: 'cover_panel',
      position: [center[0], center[1], zFront],
      size: [length, height, t],
      material,
      color: params.color,
      params: { length, width: t, height, cornerRadius: cr, cornerSegments: 6 },
    }),
    spec({
      id: `${params.id}.back_panel`,
      kind: 'box',
      semanticRole: 'cover_panel',
      position: [center[0], center[1], zBack],
      size: [length, height, t],
      material,
      color: params.color,
      params: { length, width: t, height, cornerRadius: cr, cornerSegments: 6 },
    }),
    spec({
      id: `${params.id}.left_end_panel`,
      kind: 'box',
      semanticRole: 'cover_panel',
      position: [xLeft, center[1], center[2]],
      size: [t, height, width],
      material,
      color: params.color,
      params: { length: t, width, height, cornerRadius: cr, cornerSegments: 6 },
    }),
    spec({
      id: `${params.id}.right_end_panel`,
      kind: 'box',
      semanticRole: 'cover_panel',
      position: [xRight, center[1], center[2]],
      size: [t, height, width],
      material,
      color: params.color,
      params: { length: t, width, height, cornerRadius: cr, cornerSegments: 6 },
    }),
  ]
  for (const [name, z] of [
    ['front', zFront],
    ['back', zBack],
  ] as const) {
    parts.push(
      spec({
        id: `${params.id}.top_${name}_frame`,
        kind: 'box',
        semanticRole: 'cover_frame_rail',
        position: [center[0], yTop + rail * 0.55, z],
        size: [length, rail, rail],
        material: frameMaterial,
        params: { length, width: rail, height: rail, cornerRadius: rail * 0.2, cornerSegments: 5 },
      }),
      spec({
        id: `${params.id}.bottom_${name}_frame`,
        kind: 'box',
        semanticRole: 'cover_frame_rail',
        position: [center[0], yBase, z],
        size: [length, rail, rail],
        material: frameMaterial,
        params: { length, width: rail, height: rail, cornerRadius: rail * 0.2, cornerSegments: 5 },
      }),
    )
  }
  for (const [label, x, z] of [
    ['fl', xLeft, zFront],
    ['fr', xRight, zFront],
    ['bl', xLeft, zBack],
    ['br', xRight, zBack],
  ] as const) {
    parts.push(
      spec({
        id: `${params.id}.mount_${label}`,
        kind: 'box',
        semanticRole: 'cover_mounting_bracket',
        position: [x, yBase - rail * 0.7, z],
        size: [rail * 1.6, rail * 1.2, rail * 1.6],
        material: 'yellow_safety',
        params: {
          length: rail * 1.6,
          width: rail * 1.6,
          height: rail * 1.2,
          cornerRadius: rail * 0.16,
          cornerSegments: 4,
        },
      }),
    )
  }
  return parts
}

export function buildMotor(
  params: MotorParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const side = params.side ?? 'right'
  const diameter = clamp(params.diameter, target ? target.size[2] * 0.48 : 0.38, 0.12, 1.4)
  const length = clamp(params.length, diameter * 1.45, 0.16, 2.4)
  const x =
    params.position === 'front'
      ? (target?.center[0] ?? 0) + (target?.size[0] ?? 4) * 0.42
      : params.position === 'center'
        ? (target?.center[0] ?? 0)
        : (target?.center[0] ?? 0) - (target?.size[0] ?? 4) * 0.42
  const z =
    (target?.center[2] ?? 0) +
    (side === 'right' ? 1 : -1) * ((target?.size[2] ?? 0.8) / 2 + length * 0.35)
  const y = (target?.center[1] ?? 0.8) + diameter * 0.05
  const body: Vec3 = [x, y, z]
  const parts: EquipmentPartSpec[] = [
    spec({
      id: `${params.id}.ribbed_body`,
      kind: 'cylinder',
      semanticRole: 'drive_motor',
      position: body,
      rotation: { axis: 'z', degrees: 90 },
      material: params.material ?? 'painted_steel',
      color: params.color,
      params: { radius: diameter / 2, height: length, radialSegments: 48 },
    }),
    spec({
      id: `${params.id}.front_end_cap`,
      kind: 'cylinder',
      semanticRole: 'motor_end_cap',
      position: [x + length / 2 + diameter * 0.035, y, z],
      rotation: { axis: 'z', degrees: 90 },
      material: 'cast_iron',
      params: { radius: diameter * 0.47, height: diameter * 0.07, radialSegments: 48 },
    }),
    spec({
      id: `${params.id}.rear_end_cap`,
      kind: 'cylinder',
      semanticRole: 'motor_end_cap',
      position: [x - length / 2 - diameter * 0.035, y, z],
      rotation: { axis: 'z', degrees: 90 },
      material: 'cast_iron',
      params: { radius: diameter * 0.47, height: diameter * 0.07, radialSegments: 48 },
    }),
    spec({
      id: `${params.id}.terminal_box`,
      kind: 'box',
      semanticRole: 'motor_terminal_box',
      position: [x, y + diameter * 0.52, z],
      material: 'painted_steel',
      params: {
        length: length * 0.36,
        width: diameter * 0.22,
        height: diameter * 0.18,
        cornerRadius: diameter * 0.025,
        cornerSegments: 5,
      },
    }),
  ]
  for (const dx of [-length * 0.25, length * 0.25]) {
    parts.push(
      spec({
        id: `${params.id}.mount_foot.${dx < 0 ? 'rear' : 'front'}`,
        kind: 'box',
        semanticRole: 'motor_mounting_foot',
        position: [x + dx, y - diameter * 0.48, z],
        material: 'cast_iron',
        params: {
          length: length * 0.22,
          width: diameter * 0.46,
          height: diameter * 0.12,
          cornerRadius: diameter * 0.02,
          cornerSegments: 4,
        },
      }),
    )
  }
  return parts
}

export function buildGearbox(
  params: GearboxParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const side = params.side ?? 'right'
  const length = clamp(params.length, target ? target.size[2] * 0.62 : 0.56, 0.16, 2.4)
  const width = clamp(params.width, target ? target.size[2] * 0.52 : 0.42, 0.12, 1.8)
  const height = clamp(params.height, target ? target.size[2] * 0.46 : 0.36, 0.1, 1.6)
  const targetLength = target?.size[0] ?? 4
  const targetWidth = target?.size[2] ?? 0.8
  const x =
    params.position === 'front'
      ? (target?.center[0] ?? 0) + targetLength * 0.42
      : params.position === 'center'
        ? (target?.center[0] ?? 0)
        : (target?.center[0] ?? 0) - targetLength * 0.42
  const y = (target?.center[1] ?? 0.8) + height * 0.1
  const zSign = side === 'left' || side === 'back' ? -1 : 1
  const z =
    side === 'front' || side === 'back'
      ? (target?.center[2] ?? 0) + zSign * (targetWidth / 2 + length * 0.5)
      : (target?.center[2] ?? 0) + zSign * (targetWidth / 2 + width * 0.6)
  const shaftRotation =
    side === 'front' || side === 'back'
      ? ({ axis: 'x', degrees: 90 } as const)
      : ({ axis: 'z', degrees: 90 } as const)
  const shaftOffset: Vec3 =
    side === 'front' || side === 'back'
      ? [0, 0, zSign * length * 0.54]
      : [zSign * width * 0.54, 0, 0]
  const parts: EquipmentPartSpec[] = [
    spec({
      id: `${params.id}.housing`,
      kind: 'box',
      semanticRole: 'gearbox_housing',
      position: [x, y, z],
      size: [length, height, width],
      material: params.material ?? 'cast_iron',
      color: params.color,
      params: {
        length,
        width,
        height,
        cornerRadius: Math.min(length, width, height) * 0.08,
        cornerSegments: 8,
      },
    }),
    spec({
      id: `${params.id}.input_shaft`,
      kind: 'cylinder',
      semanticRole: 'gearbox_input_shaft',
      position: [x - length * 0.42, y, z],
      rotation: { axis: 'z', degrees: 90 },
      material: 'stainless_steel',
      params: { radius: height * 0.12, height: length * 0.34, radialSegments: 40 },
    }),
    spec({
      id: `${params.id}.output_shaft`,
      kind: 'cylinder',
      semanticRole: 'gearbox_output_shaft',
      position: [x + shaftOffset[0], y + shaftOffset[1], z + shaftOffset[2]],
      rotation: shaftRotation,
      material: 'stainless_steel',
      params: { radius: height * 0.14, height: width * 0.42, radialSegments: 40 },
    }),
    spec({
      id: `${params.id}.inspection_plate`,
      kind: 'box',
      semanticRole: 'gearbox_inspection_plate',
      position: [x, y + height * 0.52, z],
      material: 'painted_steel',
      params: {
        length: length * 0.48,
        width: width * 0.34,
        height: 0.012,
        cornerRadius: Math.min(length, width) * 0.018,
        cornerSegments: 4,
      },
    }),
    spec({
      id: `${params.id}.nameplate`,
      kind: 'box',
      semanticRole: 'equipment_nameplate',
      position: [x + length * 0.22, y + height * 0.08, z + width * 0.51],
      material: 'stainless_steel',
      params: {
        length: length * 0.24,
        width: 0.008,
        height: height * 0.18,
        cornerRadius: 0.004,
        cornerSegments: 3,
      },
    }),
  ]
  for (const dx of [-length * 0.28, length * 0.28]) {
    parts.push(
      spec({
        id: `${params.id}.mount_foot.${dx < 0 ? 'rear' : 'front'}`,
        kind: 'box',
        semanticRole: 'gearbox_mounting_foot',
        position: [x + dx, y - height * 0.52, z],
        material: 'cast_iron',
        params: {
          length: length * 0.22,
          width: width * 0.62,
          height: height * 0.12,
          cornerRadius: height * 0.025,
          cornerSegments: 4,
        },
      }),
    )
  }
  for (const [label, bx, bz] of [
    ['fl', -length * 0.2, width * 0.18],
    ['fr', length * 0.2, width * 0.18],
    ['bl', -length * 0.2, -width * 0.18],
    ['br', length * 0.2, -width * 0.18],
  ] as const) {
    parts.push(
      spec({
        id: `${params.id}.cover_bolt.${label}`,
        kind: 'cylinder',
        semanticRole: 'gearbox_cover_bolt',
        position: [x + bx, y + height * 0.54, z + bz],
        material: 'dark_fastener',
        params: { radius: height * 0.025, height: 0.018, radialSegments: 20 },
      }),
    )
  }
  return parts
}

export function buildBearingBlock(
  params: BearingBlockParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const side = params.side ?? 'right'
  const width = clamp(params.width, target ? target.size[2] * 0.28 : 0.28, 0.08, 1.2)
  const height = clamp(params.height, width * 0.8, 0.06, 1.2)
  const depth = clamp(params.depth, width * 0.56, 0.05, 0.9)
  const targetLength = target?.size[0] ?? 4
  const targetWidth = target?.size[2] ?? 0.8
  const x =
    params.position === 'front'
      ? (target?.center[0] ?? 0) + targetLength * 0.42
      : params.position === 'center'
        ? (target?.center[0] ?? 0)
        : (target?.center[0] ?? 0) - targetLength * 0.42
  const zSign = side === 'left' ? -1 : 1
  const z = (target?.center[2] ?? 0) + zSign * (targetWidth / 2 + depth * 0.54)
  const y = (target?.center[1] ?? 0.72) + height * 0.08
  const parts: EquipmentPartSpec[] = [
    spec({
      id: `${params.id}.base`,
      kind: 'box',
      semanticRole: 'bearing_block_base',
      position: [x, y - height * 0.38, z],
      size: [width * 1.28, height * 0.22, depth * 1.18],
      material: params.material ?? 'cast_iron',
      color: params.color,
      params: {
        length: width * 1.28,
        width: depth * 1.18,
        height: height * 0.22,
        cornerRadius: height * 0.035,
        cornerSegments: 4,
      },
    }),
    spec({
      id: `${params.id}.pillow_housing`,
      kind: 'box',
      semanticRole: 'bearing_block',
      position: [x, y, z],
      size: [width, height, depth],
      material: params.material ?? 'cast_iron',
      color: params.color,
      params: {
        length: width,
        width: depth,
        height,
        cornerRadius: height * 0.16,
        cornerSegments: 8,
      },
    }),
    spec({
      id: `${params.id}.bearing_ring`,
      kind: 'cylinder',
      semanticRole: 'bearing_ring',
      position: [x, y + height * 0.08, z + zSign * depth * 0.54],
      rotation: { axis: 'x', degrees: 90 },
      material: 'stainless_steel',
      params: { radius: height * 0.28, height: depth * 0.14, radialSegments: 48 },
    }),
    spec({
      id: `${params.id}.shaft_hint`,
      kind: 'cylinder',
      semanticRole: 'bearing_shaft',
      position: [x, y + height * 0.08, z + zSign * depth * 0.64],
      rotation: { axis: 'x', degrees: 90 },
      material: 'dark_fastener',
      params: { radius: height * 0.12, height: depth * 0.72, radialSegments: 36 },
    }),
  ]
  for (const dx of [-width * 0.42, width * 0.42]) {
    parts.push(
      spec({
        id: `${params.id}.base_bolt.${dx < 0 ? 'left' : 'right'}`,
        kind: 'cylinder',
        semanticRole: 'bearing_mounting_bolt',
        position: [x + dx, y - height * 0.24, z],
        material: 'dark_fastener',
        params: { radius: height * 0.045, height: height * 0.06, radialSegments: 20 },
      }),
    )
  }
  return parts
}

export function buildPlatform(
  params: PlatformParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const side = params.side ?? 'front'
  const length = clamp(params.length, target ? target.size[0] * 0.7 : 1.8, 0.4, 12)
  const width = clamp(params.width, target ? Math.min(target.size[2] * 0.7, 1.2) : 0.9, 0.35, 3)
  const height = clamp(
    params.height,
    target ? target.center[1] + target.size[1] * 0.58 : 1.2,
    0.3,
    8,
  )
  const thickness = clamp(params.thickness, 0.045, 0.018, 0.16)
  const legCount = Math.round(
    clamp(params.legCount, Math.max(4, Math.ceil(length / 1.4) * 2), 4, 16),
  )
  const base = target?.center ?? ([0, height, 0] satisfies Vec3)
  const xSign = side === 'left' ? -1 : side === 'right' ? 1 : 0
  const zSign = side === 'back' ? -1 : side === 'front' ? 1 : 0
  const center: Vec3 = [
    base[0] + xSign * ((target?.size[0] ?? length) / 2 + width / 2 + 0.08),
    height,
    base[2] + zSign * ((target?.size[2] ?? width) / 2 + width / 2 + 0.08),
  ]
  const longAxis = side === 'left' || side === 'right' ? 'z' : 'x'
  const deckLength = longAxis === 'x' ? length : width
  const deckWidth = longAxis === 'x' ? width : length
  const parts: EquipmentPartSpec[] = [
    spec({
      id: `${params.id}.grating_panel`,
      kind: 'box',
      semanticRole: 'platform_grating',
      position: center,
      size: [deckLength, thickness, deckWidth],
      material: params.material ?? 'wire_mesh',
      color: params.color,
      params: {
        length: deckLength,
        width: deckWidth,
        height: thickness,
        cornerRadius: thickness * 0.18,
        cornerSegments: 4,
      },
    }),
  ]
  const rail = Math.max(thickness * 0.9, 0.035)
  for (const offset of [-deckWidth / 2, deckWidth / 2]) {
    parts.push(
      spec({
        id: `${params.id}.edge_beam.${offset < 0 ? 'inner' : 'outer'}`,
        kind: 'box',
        semanticRole: 'platform_edge_beam',
        position: [center[0], center[1] - thickness * 0.65, center[2] + offset],
        material: 'yellow_safety',
        params: {
          length: deckLength,
          width: rail,
          height: rail,
          cornerRadius: rail * 0.18,
          cornerSegments: 4,
        },
      }),
    )
  }
  const legPairs = Math.max(2, Math.floor(legCount / 2))
  for (let i = 0; i < legPairs; i += 1) {
    const t = legPairs === 1 ? 0 : i / (legPairs - 1)
    const along = -deckLength / 2 + deckLength * t
    for (const sideOffset of [-deckWidth / 2, deckWidth / 2]) {
      parts.push(
        spec({
          id: `${params.id}.support_leg.${i}.${sideOffset < 0 ? 'inner' : 'outer'}`,
          kind: 'box',
          semanticRole: 'platform_support_leg',
          position: [center[0] + along, center[1] / 2, center[2] + sideOffset],
          material: 'aluminum_frame',
          params: {
            length: rail,
            width: rail,
            height: center[1],
            cornerRadius: rail * 0.16,
            cornerSegments: 4,
          },
        }),
      )
    }
  }
  return parts
}

export function buildLadder(
  params: LadderParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const side = params.side ?? 'front'
  const height = clamp(params.height, target ? target.size[1] * 0.9 : 2.2, 0.8, 12)
  const width = clamp(params.width, 0.48, 0.32, 0.75)
  const rungCount = Math.round(
    clamp(params.rungCount, Math.max(4, Math.ceil(height / 0.28)), 4, 48),
  )
  const base = target?.center ?? ([0, height / 2, 0] satisfies Vec3)
  const xSign = side === 'left' ? -1 : side === 'right' ? 1 : 0
  const zSign = side === 'back' ? -1 : side === 'front' ? 1 : 0
  const center: Vec3 = [
    base[0] + xSign * ((target?.size[0] ?? 1) / 2 + 0.08),
    height / 2,
    base[2] + zSign * ((target?.size[2] ?? 1) / 2 + 0.08),
  ]
  const railRadius = 0.025
  const horizontalAxis = side === 'left' || side === 'right' ? 'z' : 'x'
  const parts: EquipmentPartSpec[] = []
  for (const offset of [-width / 2, width / 2]) {
    parts.push(
      spec({
        id: `${params.id}.side_rail.${offset < 0 ? 'left' : 'right'}`,
        kind: 'cylinder',
        semanticRole: 'ladder_side_rail',
        position:
          horizontalAxis === 'x'
            ? [center[0] + offset, center[1], center[2]]
            : [center[0], center[1], center[2] + offset],
        material: params.material ?? 'yellow_safety',
        color: params.color,
        params: { radius: railRadius, height, radialSegments: 24 },
      }),
    )
  }
  for (let i = 0; i < rungCount; i += 1) {
    const y = 0.18 + (height - 0.36) * (i / Math.max(1, rungCount - 1))
    parts.push(
      spec({
        id: `${params.id}.rung.${i}`,
        kind: 'cylinder',
        semanticRole: 'ladder_rung',
        position: [center[0], y, center[2]],
        rotation: { axis: horizontalAxis === 'x' ? 'z' : 'x', degrees: 90 },
        material: params.material ?? 'yellow_safety',
        color: params.color,
        params: { radius: railRadius * 0.8, height: width, radialSegments: 20 },
      }),
    )
  }
  return parts
}

export function buildHandrail(
  params: HandrailParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const side = params.side ?? 'front'
  const length = clamp(params.length, target ? target.size[0] : 1.8, 0.4, 16)
  const width = clamp(params.width, target ? target.size[2] : 0.9, 0.3, 6)
  const height = clamp(params.height, 1.1, 0.8, 1.3)
  const postCount = Math.round(
    clamp(params.postCount, Math.max(2, Math.ceil(length / 1.1) + 1), 2, 24),
  )
  const base = target?.center ?? ([0, 1.2, 0] satisfies Vec3)
  const yBase = target ? target.center[1] + target.size[1] / 2 : base[1]
  const railY = yBase + height
  const radius = 0.025
  const sides = side === 'all' ? (['front', 'back', 'left', 'right'] as const) : ([side] as const)
  const parts: EquipmentPartSpec[] = []
  for (const s of sides) {
    const isX = s === 'front' || s === 'back'
    const railLength = isX ? length : width
    const fixedOffset = (isX ? width : length) / 2
    const sign = s === 'back' || s === 'left' ? -1 : 1
    const center: Vec3 = isX
      ? [base[0], railY, base[2] + sign * fixedOffset]
      : [base[0] + sign * fixedOffset, railY, base[2]]
    parts.push(
      spec({
        id: `${params.id}.${s}.top_rail`,
        kind: 'cylinder',
        semanticRole: 'handrail_top_rail',
        position: center,
        rotation: { axis: isX ? 'z' : 'x', degrees: 90 },
        material: params.material ?? 'yellow_safety',
        color: params.color,
        params: { radius, height: railLength, radialSegments: 24 },
      }),
      spec({
        id: `${params.id}.${s}.mid_rail`,
        kind: 'cylinder',
        semanticRole: 'handrail_mid_rail',
        position: [center[0], yBase + height * 0.55, center[2]],
        rotation: { axis: isX ? 'z' : 'x', degrees: 90 },
        material: params.material ?? 'yellow_safety',
        color: params.color,
        params: { radius: radius * 0.8, height: railLength, radialSegments: 20 },
      }),
    )
    const skipCornerPosts = side === 'all' && !isX
    const firstPost = skipCornerPosts ? 1 : 0
    const lastPost = skipCornerPosts ? postCount - 2 : postCount - 1
    for (let i = firstPost; i <= lastPost; i += 1) {
      const t = postCount === 1 ? 0 : i / (postCount - 1)
      const along = -railLength / 2 + railLength * t
      const postPosition: Vec3 = isX
        ? [base[0] + along, yBase + height / 2, center[2]]
        : [center[0], yBase + height / 2, base[2] + along]
      parts.push(
        spec({
          id: `${params.id}.${s}.post.${i}`,
          kind: 'cylinder',
          semanticRole: 'handrail_post',
          position: postPosition,
          material: params.material ?? 'yellow_safety',
          color: params.color,
          params: { radius: radius * 0.9, height, radialSegments: 20 },
        }),
      )
    }
  }
  return parts
}

export function buildInspectionDoor(
  params: InspectionDoorParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const count = Math.round(clamp(params.count, 1, 1, 8))
  const side = params.side ?? 'right'
  const width = clamp(params.width, target ? target.size[0] / (count + 2) : 0.45, 0.15, 2)
  const height = clamp(params.height, target ? target.size[1] * 0.55 : 0.36, 0.12, 2)
  const baseX = target?.center[0] ?? 0
  const baseY = target ? target.center[1] : 0.9
  const zSign = side === 'left' ? -1 : 1
  const z = (target?.center[2] ?? 0) + zSign * ((target?.size[2] ?? 1) / 2 + 0.018)
  const spacing = width * 1.18
  const start = baseX - ((count - 1) * spacing) / 2
  const parts: EquipmentPartSpec[] = []
  for (let i = 0; i < count; i += 1) {
    const id = `${params.id}.door.${i}`
    const x = start + spacing * i
    parts.push(
      spec({
        id: `${id}.panel`,
        kind: 'box',
        semanticRole: 'inspection_door',
        position: [x, baseY, z],
        material: params.material ?? 'painted_steel',
        color: params.color,
        params: {
          length: width,
          width: 0.018,
          height,
          cornerRadius: Math.min(width, height) * 0.035,
          cornerSegments: 5,
        },
      }),
      spec({
        id: `${id}.handle`,
        kind: 'cylinder',
        semanticRole: 'door_handle',
        position: [x + width * 0.28, baseY, z + zSign * 0.026],
        rotation: { axis: 'x', degrees: 90 },
        material: 'dark_fastener',
        params: { radius: 0.012, height: height * 0.38, radialSegments: 20 },
      }),
      spec({
        id: `${id}.hinge_strip`,
        kind: 'box',
        semanticRole: 'door_hinge',
        position: [x - width * 0.48, baseY, z + zSign * 0.018],
        material: 'dark_fastener',
        params: {
          length: 0.018,
          width: 0.014,
          height: height * 0.9,
          cornerRadius: 0.004,
          cornerSegments: 3,
        },
      }),
    )
  }
  return parts
}

export function buildNameplate(
  params: NameplateParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const side = params.side ?? 'front'
  const width = clamp(params.width, 0.28, 0.08, 1)
  const height = clamp(params.height, 0.1, 0.04, 0.5)
  const zSign = side === 'back' ? -1 : 1
  const x = target?.center[0] ?? 0
  const y = target ? target.center[1] + target.size[1] * 0.1 : 0.95
  const z = (target?.center[2] ?? 0) + zSign * ((target?.size[2] ?? 1) / 2 + 0.025)
  return [
    spec({
      id: `${params.id}.plate`,
      kind: 'box',
      semanticRole: 'equipment_nameplate',
      position: [x, y, z],
      material: params.material ?? 'stainless_steel',
      color: params.color,
      params: { length: width, width: 0.008, height, cornerRadius: 0.006, cornerSegments: 4 },
    }),
  ]
}

export function buildSheetCover(
  params: SheetCoverParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const side = params.side ?? 'top'
  const clearance = clamp(params.clearance, 0.045, 0.005, 0.35)
  const length = clamp(params.length, target ? target.size[0] * 1.04 : 1.2, 0.12, 12)
  const width = clamp(params.width, target ? target.size[2] * 1.04 : 0.7, 0.08, 6)
  const height = clamp(params.height, target ? target.size[1] * 1.04 : 0.5, 0.08, 5)
  const thickness = clamp(params.thickness, 0.018, 0.004, 0.08)
  const rail = Math.max(thickness * 1.5, 0.018)
  const material = params.material ?? 'painted_steel'
  const base = target?.center ?? ([0, 1, 0] satisfies Vec3)
  const x = base[0]
  const y = side === 'top' ? base[1] + (target?.size[1] ?? height) / 2 + clearance : base[1]
  const z =
    side === 'front'
      ? base[2] + (target?.size[2] ?? width) / 2 + clearance
      : side === 'back'
        ? base[2] - (target?.size[2] ?? width) / 2 - clearance
        : base[2]
  const panelSize: Vec3 =
    side === 'top'
      ? [length, thickness, width]
      : side === 'left' || side === 'right'
        ? [length, height, thickness]
        : [length, height, thickness]
  const panelPosition: Vec3 =
    side === 'left'
      ? [x, y, base[2] - (target?.size[2] ?? width) / 2 - clearance]
      : side === 'right'
        ? [x, y, base[2] + (target?.size[2] ?? width) / 2 + clearance]
        : [x, y, z]
  const panelWidth = side === 'top' ? width : thickness
  const cr = Math.min(Math.min(length, width, height) * 0.025, 0.035)
  const parts: EquipmentPartSpec[] = [
    spec({
      id: `${params.id}.panel`,
      kind: 'box',
      semanticRole: 'sheet_cover_panel',
      position: panelPosition,
      size: panelSize,
      material,
      color: params.color,
      params: {
        length: panelSize[0],
        width: panelWidth,
        height: panelSize[1],
        cornerRadius: cr,
        cornerSegments: 6,
      },
    }),
  ]
  for (const dx of [-length / 2, length / 2]) {
    parts.push(
      spec({
        id: `${params.id}.stiffener.${dx < 0 ? 'left' : 'right'}`,
        kind: 'box',
        semanticRole: 'cover_stiffener',
        position: [panelPosition[0] + dx, panelPosition[1] - thickness * 0.9, panelPosition[2]],
        material: 'aluminum_frame',
        params: {
          length: rail,
          width: side === 'top' ? width : rail,
          height: rail,
          cornerRadius: rail * 0.18,
          cornerSegments: 4,
        },
      }),
    )
  }
  return parts
}

export function buildFlangePort(
  params: FlangePortParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const side = params.side ?? 'front'
  const diameter = clamp(params.nominalDiameter, 0.18, 0.04, 1.4)
  const length = clamp(params.length, diameter * 0.9, 0.04, 1.2)
  const base = target?.center ?? ([0, 0.9, 0] satisfies Vec3)
  const half = target?.size ?? ([1, 1, 1] satisfies Vec3)
  const zSign = side === 'back' ? -1 : 1
  const xSign = side === 'left' ? -1 : 1
  const position: Vec3 =
    side === 'left' || side === 'right'
      ? [base[0] + xSign * (half[0] / 2 + length / 2), base[1], base[2]]
      : side === 'top'
        ? [base[0], base[1] + half[1] / 2 + length / 2, base[2]]
        : [base[0], base[1], base[2] + zSign * (half[2] / 2 + length / 2)]
  const rotation =
    side === 'left' || side === 'right'
      ? ({ axis: 'z', degrees: 90 } as const)
      : side === 'top'
        ? undefined
        : ({ axis: 'x', degrees: 90 } as const)
  return [
    spec({
      id: `${params.id}.neck`,
      kind: 'cylinder',
      semanticRole: 'flange_port',
      position,
      ...(rotation ? { rotation } : {}),
      material: params.material ?? 'stainless_steel',
      color: params.color,
      params: { radius: diameter / 2, height: length, radialSegments: 48 },
    }),
    spec({
      id: `${params.id}.flange_ring`,
      kind: 'cylinder',
      semanticRole: 'flange_ring',
      position:
        side === 'left' || side === 'right'
          ? [position[0] + xSign * length * 0.45, position[1], position[2]]
          : side === 'top'
            ? [position[0], position[1] + length * 0.45, position[2]]
            : [position[0], position[1], position[2] + zSign * length * 0.45],
      ...(rotation ? { rotation } : {}),
      material: 'cast_iron',
      params: { radius: diameter * 0.72, height: diameter * 0.14, radialSegments: 56 },
    }),
  ]
}

export function buildPipeRun(params: PipeRunParams): EquipmentPartSpec[] {
  const from = params.from ?? ([-1, 1, 0] satisfies Vec3)
  const to = params.to ?? ([1, 1, 0] satisfies Vec3)
  const radius = clamp(params.radius, 0.06, 0.015, 0.45)
  const parts: EquipmentPartSpec[] = [
    spec({
      id: `${params.id}.pipe`,
      kind: 'sweep',
      semanticRole: 'pipe_run',
      position: [0, 0, 0],
      material: params.material ?? 'stainless_steel',
      color: params.color,
      params: { path: [from, to], radius, radialSegments: 32, tubularSegments: 24 },
    }),
  ]
  if (params.includeFlanges ?? true) {
    for (const [label, p] of [
      ['from', from],
      ['to', to],
    ] as const) {
      parts.push(
        spec({
          id: `${params.id}.flange.${label}`,
          kind: 'cylinder',
          semanticRole: 'pipe_flange',
          position: p,
          rotation: { axis: 'x', degrees: 90 },
          material: 'cast_iron',
          params: { radius: radius * 1.55, height: radius * 0.45, radialSegments: 48 },
        }),
      )
    }
  }
  return parts
}

export function buildControlCabinet(
  params: ControlCabinetParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const width = clamp(params.width, 0.72, 0.25, 2.4)
  const height = clamp(params.height, 1.4, 0.45, 3)
  const depth = clamp(params.depth, 0.36, 0.12, 1.2)
  const side = params.side ?? 'right'
  const base = target?.center ?? ([0, height / 2, 0] satisfies Vec3)
  const x =
    side === 'left'
      ? base[0] - (target?.size[0] ?? 1) / 2 - width / 2 - 0.12
      : side === 'right'
        ? base[0] + (target?.size[0] ?? 1) / 2 + width / 2 + 0.12
        : base[0]
  const z =
    side === 'front'
      ? base[2] + (target?.size[2] ?? 1) / 2 + depth / 2 + 0.12
      : side === 'back'
        ? base[2] - (target?.size[2] ?? 1) / 2 - depth / 2 - 0.12
        : base[2]
  const y = height / 2
  return [
    spec({
      id: `${params.id}.body`,
      kind: 'box',
      semanticRole: 'control_cabinet',
      position: [x, y, z],
      size: [width, height, depth],
      material: params.material ?? 'painted_steel',
      color: params.color,
      params: { length: width, width: depth, height, cornerRadius: 0.035, cornerSegments: 8 },
    }),
    spec({
      id: `${params.id}.door_seam`,
      kind: 'box',
      semanticRole: 'cabinet_door_seam',
      position: [x, y, z + depth / 2 + 0.006],
      material: 'dark_fastener',
      params: { length: 0.01, width: 0.008, height: height * 0.86, cornerRadius: 0.002 },
    }),
    spec({
      id: `${params.id}.window`,
      kind: 'box',
      semanticRole: 'control_panel_glass',
      position: [x - width * 0.18, y + height * 0.18, z + depth / 2 + 0.012],
      material: 'control_panel_glass',
      params: {
        length: width * 0.32,
        width: 0.012,
        height: height * 0.16,
        cornerRadius: 0.01,
        cornerSegments: 5,
      },
    }),
    spec({
      id: `${params.id}.handle`,
      kind: 'cylinder',
      semanticRole: 'cabinet_handle',
      position: [x + width * 0.32, y, z + depth / 2 + 0.03],
      rotation: { axis: 'x', degrees: 90 },
      material: 'dark_fastener',
      params: { radius: 0.014, height: height * 0.22, radialSegments: 24 },
    }),
    spec({
      id: `${params.id}.nameplate`,
      kind: 'box',
      semanticRole: 'equipment_nameplate',
      position: [x, y - height * 0.28, z + depth / 2 + 0.014],
      material: 'stainless_steel',
      params: {
        length: width * 0.38,
        width: 0.008,
        height: height * 0.07,
        cornerRadius: 0.006,
        cornerSegments: 4,
      },
    }),
  ]
}

export function buildSkidBase(params: SkidBaseParams): EquipmentPartSpec[] {
  const length = clamp(params.length, 2.2, 0.6, 8)
  const width = clamp(params.width, 0.9, 0.25, 3)
  const height = clamp(params.height, 0.18, 0.06, 0.8)
  const rail = clamp(params.railThickness, Math.max(width * 0.045, 0.04), 0.025, 0.18)
  const material = params.material ?? 'painted_steel'
  return [
    spec({
      id: `${params.id}.left_rail`,
      kind: 'box',
      semanticRole: 'skid_base',
      position: [0, height, -width / 2],
      size: [length, rail, rail],
      material,
      color: params.color,
      params: { length, width: rail, height: rail, cornerRadius: rail * 0.2, cornerSegments: 5 },
    }),
    spec({
      id: `${params.id}.right_rail`,
      kind: 'box',
      semanticRole: 'skid_base',
      position: [0, height, width / 2],
      size: [length, rail, rail],
      material,
      color: params.color,
      params: { length, width: rail, height: rail, cornerRadius: rail * 0.2, cornerSegments: 5 },
    }),
    spec({
      id: `${params.id}.front_cross_member`,
      kind: 'box',
      semanticRole: 'skid_cross_member',
      position: [length * 0.36, height, 0],
      material,
      color: params.color,
      params: { length: rail, width, height: rail, cornerRadius: rail * 0.18, cornerSegments: 4 },
    }),
    spec({
      id: `${params.id}.rear_cross_member`,
      kind: 'box',
      semanticRole: 'skid_cross_member',
      position: [-length * 0.36, height, 0],
      material,
      color: params.color,
      params: { length: rail, width, height: rail, cornerRadius: rail * 0.18, cornerSegments: 4 },
    }),
  ]
}

export function buildPumpCasing(
  params: PumpCasingParams,
  context: EquipmentBuildContext = {},
): EquipmentPartSpec[] {
  const target = context.resolveTarget?.(params.target)
  const diameter = clamp(params.diameter, 0.52, 0.16, 2)
  const width = clamp(params.width, diameter * 0.38, 0.08, 0.9)
  const x = (target?.center[0] ?? 0) + (target?.size[0] ?? 2.2) * 0.24
  const y = (target?.center[1] ?? 0.18) + diameter * 0.62
  const z = target?.center[2] ?? 0
  return [
    spec({
      id: `${params.id}.volute_body`,
      kind: 'cylinder',
      semanticRole: 'volute_casing',
      position: [x, y, z],
      rotation: { axis: 'x', degrees: 90 },
      material: params.material ?? 'painted_steel',
      color: params.color,
      params: { radius: diameter / 2, height: width, radialSegments: 64 },
    }),
    spec({
      id: `${params.id}.volute_bulge`,
      kind: 'sphere',
      semanticRole: 'pump_casing_bulge',
      position: [x + diameter * 0.38, y + diameter * 0.18, z],
      material: params.material ?? 'painted_steel',
      color: params.color,
      params: { radius: diameter * 0.2 },
    }),
    spec({
      id: `${params.id}.suction_nozzle`,
      kind: 'cylinder',
      semanticRole: 'pump_suction_nozzle',
      position: [x, y, z - width * 0.9],
      rotation: { axis: 'x', degrees: 90 },
      material: 'cast_iron',
      params: { radius: diameter * 0.22, height: width * 0.9, radialSegments: 48 },
    }),
    spec({
      id: `${params.id}.discharge_nozzle`,
      kind: 'cylinder',
      semanticRole: 'pump_discharge_nozzle',
      position: [x, y + diameter * 0.52, z],
      material: 'cast_iron',
      params: { radius: diameter * 0.18, height: diameter * 0.42, radialSegments: 48 },
    }),
  ]
}

export function buildVerticalVessel(params: VerticalVesselParams): EquipmentPartSpec[] {
  const diameter = clamp(params.diameter, 1.4, 0.35, 8)
  const height = clamp(params.height, 3.2, 0.9, 18)
  const shellThickness = clamp(params.shellThickness, 0.028, 0.006, 0.12)
  const radius = diameter / 2
  const shellHeight = Math.max(height - diameter * 0.42, height * 0.68)
  const shellY = shellHeight / 2 + diameter * 0.22
  const headHeight = Math.max(diameter * 0.12, 0.12)
  const shellTop = shellY + shellHeight / 2
  const shellBottom = shellY - shellHeight / 2
  const supportHeight = Math.max(shellBottom - 0.03, 0.22)
  const includePorts = params.includePorts ?? true
  const includeManway = params.includeManway ?? true
  const includeLadder = params.includeLadder ?? true
  const shellMaterial = params.material ?? 'painted_steel'
  const parts: EquipmentPartSpec[] = [
    spec({
      id: `${params.id}.shell`,
      kind: 'cylinder',
      semanticRole: 'vessel_shell',
      position: [0, shellY, 0],
      size: [diameter, shellHeight, diameter],
      material: shellMaterial,
      color: params.color,
      params: { radius, height: shellHeight, radialSegments: 72 },
    }),
    spec({
      id: `${params.id}.top_head`,
      kind: 'cylinder',
      semanticRole: 'vessel_head',
      position: [0, shellTop + headHeight / 2 + 0.01, 0],
      material: shellMaterial,
      color: params.color,
      params: { radius: radius * 0.98, height: headHeight, radialSegments: 72 },
    }),
    spec({
      id: `${params.id}.bottom_head`,
      kind: 'cylinder',
      semanticRole: 'vessel_head',
      position: [0, shellBottom - headHeight / 2 - 0.01, 0],
      material: shellMaterial,
      color: params.color,
      params: { radius: radius * 0.98, height: headHeight, radialSegments: 72 },
    }),
    spec({
      id: `${params.id}.nameplate`,
      kind: 'box',
      semanticRole: 'equipment_nameplate',
      position: [0, shellY, radius + 0.018],
      material: 'stainless_steel',
      params: {
        length: diameter * 0.24,
        width: 0.01,
        height: diameter * 0.1,
        cornerRadius: 0.008,
        cornerSegments: 4,
      },
    }),
  ]
  for (const [label, x, z] of [
    ['front_left', -radius * 1.15, radius * 1.15],
    ['front_right', radius * 1.15, radius * 1.15],
    ['back_left', -radius * 1.15, -radius * 1.15],
    ['back_right', radius * 1.15, -radius * 1.15],
  ] as const) {
    parts.push(
      spec({
        id: `${params.id}.support_leg.${label}`,
        kind: 'box',
        semanticRole: 'support_leg',
        position: [x, supportHeight / 2, z],
        material: 'painted_steel',
        params: {
          length: diameter * 0.055,
          width: diameter * 0.055,
          height: supportHeight,
          cornerRadius: diameter * 0.006,
          cornerSegments: 4,
        },
      }),
    )
  }
  if (includePorts) {
    const topNozzleHeight = diameter * 0.28
    parts.push(
      spec({
        id: `${params.id}.top_nozzle`,
        kind: 'cylinder',
        semanticRole: 'flange_port',
        position: [0, shellTop + headHeight + 0.02 + topNozzleHeight / 2, 0],
        material: 'stainless_steel',
        params: { radius: diameter * 0.08, height: topNozzleHeight, radialSegments: 48 },
      }),
      spec({
        id: `${params.id}.side_inlet_nozzle`,
        kind: 'cylinder',
        semanticRole: 'flange_port',
        position: [radius + diameter * 0.12, shellY + shellHeight * 0.18, 0],
        rotation: { axis: 'z', degrees: 90 },
        material: 'stainless_steel',
        params: { radius: diameter * 0.075, height: diameter * 0.24, radialSegments: 48 },
      }),
      spec({
        id: `${params.id}.bottom_outlet_nozzle`,
        kind: 'cylinder',
        semanticRole: 'flange_port',
        position: [0, Math.max(0.12, supportHeight * 0.45), radius + diameter * 0.11],
        rotation: { axis: 'x', degrees: 90 },
        material: 'stainless_steel',
        params: { radius: diameter * 0.06, height: diameter * 0.22, radialSegments: 48 },
      }),
    )
  }
  if (includeManway) {
    parts.push(
      spec({
        id: `${params.id}.manway_cover`,
        kind: 'cylinder',
        semanticRole: 'inspection_door',
        position: [-radius - 0.018, shellY + shellHeight * 0.08, 0],
        rotation: { axis: 'z', degrees: 90 },
        material: 'painted_steel',
        params: { radius: diameter * 0.13, height: 0.035, radialSegments: 48 },
      }),
      spec({
        id: `${params.id}.manway_handle`,
        kind: 'cylinder',
        semanticRole: 'door_handle',
        position: [-radius - 0.055, shellY + shellHeight * 0.08, 0],
        rotation: { axis: 'z', degrees: 90 },
        material: 'dark_fastener',
        params: { radius: 0.012, height: diameter * 0.22, radialSegments: 20 },
      }),
    )
  }
  if (includeLadder) {
    const ladderWidth = clamp(diameter * 0.28, 0.42, 0.62, 0.75)
    const rungCount = Math.max(6, Math.ceil(height / 0.32))
    const ladderZ = -radius - 0.08
    for (const x of [-ladderWidth / 2, ladderWidth / 2]) {
      parts.push(
        spec({
          id: `${params.id}.ladder_side_rail.${x < 0 ? 'left' : 'right'}`,
          kind: 'cylinder',
          semanticRole: 'ladder_side_rail',
          position: [x, height / 2, ladderZ],
          material: 'yellow_safety',
          params: { radius: 0.024, height: height * 0.86, radialSegments: 24 },
        }),
      )
    }
    for (let i = 0; i < rungCount; i += 1) {
      const y = 0.28 + (height * 0.78 * i) / Math.max(1, rungCount - 1)
      parts.push(
        spec({
          id: `${params.id}.ladder_rung.${i}`,
          kind: 'cylinder',
          semanticRole: 'ladder_rung',
          position: [0, round(y), ladderZ],
          rotation: { axis: 'z', degrees: 90 },
          material: 'yellow_safety',
          params: { radius: 0.018, height: ladderWidth, radialSegments: 20 },
        }),
      )
    }
  }
  return parts
}

export function buildDustCollector(params: DustCollectorParams): EquipmentPartSpec[] {
  const width = clamp(params.width, 1.8, 0.6, 8)
  const depth = clamp(params.depth, 1.2, 0.45, 5)
  const height = clamp(params.height, 3.2, 1.4, 12)
  const bagCount = Math.round(clamp(params.bagCount, Math.max(4, Math.ceil(width * 3)), 4, 24))
  const bodyHeight = height * 0.48
  const hopperHeight = height * 0.24
  const legHeight = height * 0.22
  const bodyY = legHeight + hopperHeight + bodyHeight / 2
  const hopperY = legHeight + hopperHeight / 2
  const material = params.material ?? 'painted_steel'
  const parts: EquipmentPartSpec[] = [
    spec({
      id: `${params.id}.filter_body`,
      kind: 'box',
      semanticRole: 'filter_body',
      position: [0, bodyY, 0],
      size: [width, bodyHeight, depth],
      material,
      color: params.color,
      params: {
        length: width,
        width: depth,
        height: bodyHeight,
        cornerRadius: Math.min(width, depth) * 0.035,
        cornerSegments: 8,
      },
    }),
    spec({
      id: `${params.id}.hopper`,
      kind: 'frustum',
      semanticRole: 'bottom_discharge_hopper',
      position: [0, hopperY, 0],
      material,
      color: params.color,
      params: {
        radiusTop: Math.min(width, depth) * 0.48,
        radiusBottom: Math.min(width, depth) * 0.12,
        height: hopperHeight,
        radialSegments: 4,
      },
    }),
    spec({
      id: `${params.id}.outlet`,
      kind: 'cylinder',
      semanticRole: 'outlet_duct',
      position: [width / 2 + depth * 0.18, bodyY + bodyHeight * 0.18, 0],
      rotation: { axis: 'z', degrees: 90 },
      material: 'stainless_steel',
      params: { radius: depth * 0.13, height: depth * 0.36, radialSegments: 40 },
    }),
    spec({
      id: `${params.id}.inlet`,
      kind: 'cylinder',
      semanticRole: 'inlet_duct',
      position: [-width / 2 - depth * 0.18, bodyY - bodyHeight * 0.08, 0],
      rotation: { axis: 'z', degrees: 90 },
      material: 'stainless_steel',
      params: { radius: depth * 0.12, height: depth * 0.36, radialSegments: 40 },
    }),
    spec({
      id: `${params.id}.discharge_valve`,
      kind: 'cylinder',
      semanticRole: 'hopper_outlet',
      position: [0, legHeight * 0.74, 0],
      material: 'cast_iron',
      params: { radius: Math.min(width, depth) * 0.11, height: 0.16, radialSegments: 40 },
    }),
    spec({
      id: `${params.id}.access_door`,
      kind: 'box',
      semanticRole: 'inspection_door',
      position: [0, bodyY, depth / 2 + 0.018],
      material,
      params: {
        length: width * 0.24,
        width: 0.018,
        height: bodyHeight * 0.34,
        cornerRadius: 0.012,
        cornerSegments: 5,
      },
    }),
    spec({
      id: `${params.id}.nameplate`,
      kind: 'box',
      semanticRole: 'equipment_nameplate',
      position: [width * 0.24, bodyY - bodyHeight * 0.28, depth / 2 + 0.02],
      material: 'stainless_steel',
      params: {
        length: width * 0.18,
        width: 0.008,
        height: bodyHeight * 0.08,
        cornerRadius: 0.006,
        cornerSegments: 4,
      },
    }),
  ]
  for (const [label, x, z] of [
    ['front_left', -width * 0.42, depth * 0.42],
    ['front_right', width * 0.42, depth * 0.42],
    ['back_left', -width * 0.42, -depth * 0.42],
    ['back_right', width * 0.42, -depth * 0.42],
  ] as const) {
    parts.push(
      spec({
        id: `${params.id}.support_leg.${label}`,
        kind: 'box',
        semanticRole: 'support_leg',
        position: [x, legHeight / 2, z],
        material: 'painted_steel',
        params: {
          length: 0.07,
          width: 0.07,
          height: legHeight,
          cornerRadius: 0.012,
          cornerSegments: 4,
        },
      }),
    )
  }
  const pulseSpacing = width / (bagCount + 1)
  for (let i = 0; i < bagCount; i += 1) {
    const x = -width / 2 + pulseSpacing * (i + 1)
    parts.push(
      spec({
        id: `${params.id}.pulse_valve.${i}`,
        kind: 'cylinder',
        semanticRole: 'pulse_valve',
        position: [round(x), bodyY + bodyHeight / 2 + 0.08, 0],
        rotation: { axis: 'x', degrees: 90 },
        material: 'cast_iron',
        params: { radius: 0.045, height: depth * 0.72, radialSegments: 24 },
      }),
    )
  }
  if (params.includeLadder ?? true) {
    const ladderHeight = Math.min(height * 0.82, 8)
    const ladderZ = depth / 2 + 0.1
    for (const x of [-width * 0.38, -width * 0.18]) {
      parts.push(
        spec({
          id: `${params.id}.ladder_rail.${x < -width * 0.28 ? 'left' : 'right'}`,
          kind: 'cylinder',
          semanticRole: 'ladder_side_rail',
          position: [x, ladderHeight / 2, ladderZ],
          material: 'yellow_safety',
          params: { radius: 0.023, height: ladderHeight, radialSegments: 24 },
        }),
      )
    }
    for (let i = 0; i < Math.max(5, Math.ceil(ladderHeight / 0.32)); i += 1) {
      parts.push(
        spec({
          id: `${params.id}.ladder_rung.${i}`,
          kind: 'cylinder',
          semanticRole: 'ladder_rung',
          position: [-width * 0.28, 0.24 + i * 0.3, ladderZ],
          rotation: { axis: 'z', degrees: 90 },
          material: 'yellow_safety',
          params: { radius: 0.018, height: width * 0.2, radialSegments: 20 },
        }),
      )
    }
  }
  return parts
}

export function buildEquipment(_params: CommonParams): EquipmentPartSpec[] {
  return []
}
