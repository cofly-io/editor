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
  kind: 'box' | 'cylinder' | 'sphere' | 'torus' | 'sweep'
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

export function buildEquipment(_params: CommonParams): EquipmentPartSpec[] {
  return []
}
