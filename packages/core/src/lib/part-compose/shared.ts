import { familySpecForParts, isAircraftIntent, partKinds } from './family'
import { normalizedPartKind } from './kind'
import type {
  PartAxis,
  PartComposeInput,
  PartComposeKind,
  PartComposePartInput,
  PartSide,
  PrimitiveMaterialInput,
  PrimitiveShapeInput,
  Vec3,
  VehicleStyle,
} from './types'

export function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(
    min,
    Math.min(max, typeof value === 'number' && Number.isFinite(value) ? value : fallback),
  )
}

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clamp(value, fallback, min, max))
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function negate(v: Vec3): Vec3 {
  return [-v[0], -v[1], -v[2]]
}

export function partAxis(axis: unknown, fallback: PartAxis): PartAxis {
  return axis === 'x' || axis === 'y' || axis === 'z' ? axis : fallback
}

export function partSide(side: unknown): PartSide | undefined {
  switch (side) {
    case 'left':
    case 'right':
    case 'top':
    case 'bottom':
    case 'front':
    case 'back':
      return side
    default:
      return undefined
  }
}

export function axisForSide(side: PartSide, fallback: PartAxis): PartAxis {
  switch (side) {
    case 'left':
    case 'right':
      return 'x'
    case 'top':
    case 'bottom':
      return 'y'
    case 'front':
    case 'back':
      return 'z'
    default:
      return fallback
  }
}

export function signForSide(side: PartSide | undefined, axis: PartAxis): -1 | 1 {
  if (side === 'left' || side === 'bottom' || side === 'back') return -1
  if (side === 'right' || side === 'top' || side === 'front') return 1
  return axis === 'z' ? 1 : 1
}

export function offsetAlongAxis(center: Vec3, axis: PartAxis, distance: number): Vec3 {
  switch (axis) {
    case 'x':
      return [center[0] + distance, center[1], center[2]]
    case 'y':
      return [center[0], center[1] + distance, center[2]]
    default:
      return [center[0], center[1], center[2] + distance]
  }
}

export function axisNormal(axis: PartAxis, sign: -1 | 1 = 1): Vec3 {
  switch (axis) {
    case 'x':
      return [sign, 0, 0]
    case 'y':
      return [0, sign, 0]
    default:
      return [0, 0, sign]
  }
}

export function rotateVec(v: Vec3, euler: Vec3): Vec3 {
  let [x, y, z] = v

  const cz = Math.cos(euler[2])
  const sz = Math.sin(euler[2])
  ;[x, y] = [x * cz - y * sz, x * sz + y * cz]

  const cy = Math.cos(euler[1])
  const sy = Math.sin(euler[1])
  ;[x, z] = [x * cy + z * sy, -x * sy + z * cy]

  const cx = Math.cos(euler[0])
  const sx = Math.sin(euler[0])
  ;[y, z] = [y * cx - z * sx, y * sx + z * cx]

  return [x, y, z]
}

export function applyPartRotation(
  shapes: PrimitiveShapeInput[],
  pivot: Vec3,
  rotation: Vec3 | undefined,
): PrimitiveShapeInput[] {
  if (!rotation) return shapes
  return shapes.map((shape) => ({
    ...shape,
    position: shape.position
      ? add(pivot, rotateVec(sub(shape.position, pivot), rotation))
      : shape.position,
    rotation: add(shape.rotation ?? [0, 0, 0], rotation),
    cutouts: shape.cutouts?.map((cutout) => ({
      ...cutout,
      position: cutout.position
        ? add(pivot, rotateVec(sub(cutout.position, pivot), rotation))
        : cutout.position,
      normal: cutout.normal ? rotateVec(cutout.normal, rotation) : cutout.normal,
    })),
    ports: shape.ports?.map((port) => ({
      ...port,
      position: port.position
        ? add(pivot, rotateVec(sub(port.position, pivot), rotation))
        : port.position,
      normal: port.normal ? rotateVec(port.normal, rotation) : port.normal,
    })),
  }))
}

export function radialPoint(center: Vec3, angle: number, radius: number, zOffset = 0): Vec3 {
  return [
    center[0] + Math.cos(angle) * radius,
    center[1] + Math.sin(angle) * radius,
    center[2] + zOffset,
  ]
}

export function tubeBetween(
  name: string,
  start: Vec3,
  end: Vec3,
  radius: number,
  mat: PrimitiveMaterialInput,
): PrimitiveShapeInput {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const dz = end[2] - start[2]
  const length = Math.hypot(dx, dy, dz)
  const yaw = Math.atan2(dy, dx)
  const pitch = -Math.atan2(dz, Math.hypot(dx, dy))
  return {
    kind: 'cylinder',
    name,
    position: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2],
    rotation: [0, pitch, yaw],
    axis: 'x',
    radius,
    height: Math.max(length, 0.001),
    radialSegments: 12,
    material: mat,
  }
}

export function radialPointOnAxis(
  center: Vec3,
  axis: PartAxis,
  angle: number,
  radius: number,
): Vec3 {
  const c = Math.cos(angle) * radius
  const s = Math.sin(angle) * radius
  switch (axis) {
    case 'x':
      return [center[0], center[1] + c, center[2] + s]
    case 'y':
      return [center[0] + c, center[1], center[2] + s]
    default:
      return [center[0] + c, center[1] + s, center[2]]
  }
}

export function material(
  color: string,
  roughness = 0.55,
  metalness = 0.05,
  opacity = 1,
): PrimitiveMaterialInput {
  return {
    properties: {
      color,
      roughness,
      metalness,
      opacity,
      transparent: opacity < 1,
    },
  }
}

export function textOf(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase()
  if (Array.isArray(value)) return value.map(textOf).join(' ')
  if (typeof value === 'object' && value !== null) return Object.values(value).map(textOf).join(' ')
  return ''
}

export function partIntentText(input: PartComposeInput, part?: PartComposePartInput): string {
  return [
    input.name,
    input.geometryBrief,
    part?.name,
    part?.partName,
    part?.style,
    part?.variant,
    part?.valveStyle,
    part?.handleStyle,
    part?.state,
  ]
    .map(textOf)
    .join(' ')
}

export function isBallValveIntent(input: PartComposeInput, part?: PartComposePartInput): boolean {
  return /(ball\s*valve|球阀|quarter[-\s]?turn|90\s*°|90\s*degree)/i.test(
    partIntentText(input, part),
  )
}

export function partIdentityText(part: PartComposePartInput): string {
  return [
    part.kind,
    part.partType,
    part.type,
    part.id,
    part.name,
    part.partName,
    part.style,
    part.variant,
  ]
    .map(textOf)
    .join(' ')
}

export function isMixerPartContext(
  input: PartComposeInput,
  parts: PartComposePartInput[],
): boolean {
  const text = [input.name, input.partName, input.geometryBrief, ...parts.map(partIdentityText)]
    .map(textOf)
    .join(' ')
  const hasMixerLanguage = /mixer|agitator|impeller|mud|slurry|paddle|搅拌|泥浆|桨叶|叶轮/.test(
    text,
  )
  const hasPropellerSet = parts.some((part) => {
    const kind = normalizedPartKind(part)
    return kind === 'propeller_blade_set' || kind === 'mixer_blades'
  })
  const hasBladePart = parts.some((part) => {
    const kind = normalizedPartKind(part)
    return (
      kind === 'propeller_blade_set' ||
      kind === 'mixer_blades' ||
      kind === 'fan_blade' ||
      kind === 'radial_blades'
    )
  })
  const hasShaft = parts.some((part) => {
    const kind = normalizedPartKind(part)
    return kind === 'vertical_pole' || /shaft|rod|pole/.test(partIdentityText(part))
  })
  const hasHub = parts.some((part) => {
    const kind = normalizedPartKind(part)
    return kind === 'circular_base' || /hub|boss/.test(partIdentityText(part))
  })
  return (
    (hasMixerLanguage && hasPropellerSet && (hasShaft || hasHub)) ||
    (hasMixerLanguage && hasBladePart && hasShaft) ||
    (hasPropellerSet && hasShaft && hasHub)
  )
}

export function applyMixerPartDefaults(
  parts: PartComposePartInput[],
  input: PartComposeInput,
): PartComposePartInput[] {
  if (!isMixerPartContext(input, parts)) return parts
  const shaft = parts.find((part) => normalizedPartKind(part) === 'vertical_pole')
  const hub = parts.find((part) => normalizedPartKind(part) === 'circular_base')
  const shaftHeight = clamp(shaft?.height, 1.4, 0.25, 3)
  const hubHeight = clamp(hub?.height, 0.1, 0.03, 0.35)
  const hubY = hubHeight / 2

  return parts.map((part) => {
    const kind = normalizedPartKind(part)
    const identity = partIdentityText(part)
    if (kind === 'vertical_pole' && (/shaft|rod|pole/.test(identity) || part === shaft)) {
      return {
        ...part,
        id: part.id ?? 'mixer_shaft',
        position: part.position ?? [0, hubHeight + shaftHeight / 2, 0],
        semanticRole: part.semanticRole ?? 'mixer_shaft',
        semanticGroup: part.semanticGroup ?? 'mixer_shaft',
        sourcePartKind: part.sourcePartKind ?? 'mixer_shaft',
      }
    }
    if (kind === 'circular_base' && (/hub|boss/.test(identity) || part === hub)) {
      return {
        ...part,
        id: part.id ?? 'mixer_hub',
        alignAbove: undefined,
        alignBeside: undefined,
        centeredOn: undefined,
        around: undefined,
        position: part.position ?? [0, hubY, 0],
        semanticRole: part.semanticRole ?? 'mixer_hub',
        semanticGroup: part.semanticGroup ?? 'mixer_hub',
        sourcePartKind: part.sourcePartKind ?? 'mixer_hub',
      }
    }
    if (
      kind === 'propeller_blade_set' ||
      kind === 'mixer_blades' ||
      kind === 'fan_blade' ||
      kind === 'radial_blades'
    ) {
      return {
        ...part,
        kind: 'mixer_blades',
        id: part.id ?? 'mixer_blades',
        around: undefined,
        aroundCount: undefined,
        aroundIndex: undefined,
        aroundAngle: undefined,
        position: part.position ?? [0, hubY + hubHeight * 0.25, 0],
        bladeShape: part.bladeShape ?? 'taiji_half',
        count: part.count ?? 3,
        semanticRole: part.semanticRole ?? 'mixer_blade',
        semanticGroup: part.semanticGroup ?? 'mixer_blades',
        sourcePartKind: part.sourcePartKind ?? 'mixer_blades',
      }
    }
    return part
  })
}

export function partMaterial(
  part: PartComposePartInput,
  fallback: PrimitiveMaterialInput,
): PrimitiveMaterialInput {
  if (part.material) return part.material
  if (part.materialPreset) return { preset: part.materialPreset }
  if (part.color) return material(part.color)
  return fallback
}

export function ringSegments(detail: PartComposeInput['detail']): number {
  switch (detail) {
    case 'high':
      return 64
    case 'low':
      return 32
    default:
      return 48
  }
}

export function normalizeVehicleStyle(value: unknown): VehicleStyle | undefined {
  const text = textOf(value).replace(/[\s_-]+/g, '')
  if (!text) return undefined
  if (/sport|supercar|coupe|race|racing|跑车|赛车/.test(text)) return 'sports'
  if (/suv|offroad|offroader|jeep/.test(text)) return 'suv'
  if (/van|minivan|mpv|bus/.test(text)) return 'van'
  if (/truck|pickup|ute|lorry|皮卡|卡车|货车/.test(text)) return 'truck'
  if (/sedan|saloon|car|auto/.test(text)) return 'sedan'
  return undefined
}

export function vehicleStyleFor(
  input: PartComposeInput,
  part?: PartComposePartInput,
): VehicleStyle {
  return (
    normalizeVehicleStyle(part?.vehicleStyle) ??
    normalizeVehicleStyle(part?.style) ??
    normalizeVehicleStyle(part?.variant) ??
    normalizeVehicleStyle(partIntentText(input, part)) ??
    'sedan'
  )
}

export function vehicleSizeScale(part: PartComposePartInput): number {
  return clamp(part.sizeScale, 1, 0.2, 2)
}

export const VEHICLE_STYLE_DEFAULTS: Record<
  VehicleStyle,
  {
    length: number
    width: number
    heightRatio: number
    bodyHeightRatio: number
    cabinHeightRatio: number
    cabinLengthRatio: number
    cabinWidthRatio: number
    cabinXRatio: number
    cabinTopScale: number
    wheelRadiusRatio: number
    wheelbaseRatio: number
    trackRatio: number
    groundClearanceRatio: number
  }
> = {
  sedan: {
    length: 4.4,
    width: 1.8,
    heightRatio: 0.31,
    bodyHeightRatio: 0.36,
    cabinHeightRatio: 0.3,
    cabinLengthRatio: 0.42,
    cabinWidthRatio: 0.74,
    cabinXRatio: -0.05,
    cabinTopScale: 0.78,
    wheelRadiusRatio: 0.078,
    wheelbaseRatio: 0.72,
    trackRatio: 0.9,
    groundClearanceRatio: 0.15,
  },
  suv: {
    length: 4.65,
    width: 1.95,
    heightRatio: 0.38,
    bodyHeightRatio: 0.42,
    cabinHeightRatio: 0.44,
    cabinLengthRatio: 0.46,
    cabinWidthRatio: 0.82,
    cabinXRatio: -0.04,
    cabinTopScale: 0.9,
    wheelRadiusRatio: 0.088,
    wheelbaseRatio: 0.72,
    trackRatio: 0.92,
    groundClearanceRatio: 0.18,
  },
  sports: {
    length: 4.35,
    width: 1.9,
    heightRatio: 0.25,
    bodyHeightRatio: 0.34,
    cabinHeightRatio: 0.34,
    cabinLengthRatio: 0.32,
    cabinWidthRatio: 0.72,
    cabinXRatio: -0.12,
    cabinTopScale: 0.62,
    wheelRadiusRatio: 0.095,
    wheelbaseRatio: 0.76,
    trackRatio: 0.94,
    groundClearanceRatio: 0.11,
  },
  van: {
    length: 4.7,
    width: 1.9,
    heightRatio: 0.42,
    bodyHeightRatio: 0.48,
    cabinHeightRatio: 0.46,
    cabinLengthRatio: 0.62,
    cabinWidthRatio: 0.86,
    cabinXRatio: -0.04,
    cabinTopScale: 0.94,
    wheelRadiusRatio: 0.075,
    wheelbaseRatio: 0.7,
    trackRatio: 0.88,
    groundClearanceRatio: 0.14,
  },
  truck: {
    length: 5.2,
    width: 1.95,
    heightRatio: 0.36,
    bodyHeightRatio: 0.38,
    cabinHeightRatio: 0.42,
    cabinLengthRatio: 0.32,
    cabinWidthRatio: 0.8,
    cabinXRatio: 0.18,
    cabinTopScale: 0.86,
    wheelRadiusRatio: 0.087,
    wheelbaseRatio: 0.74,
    trackRatio: 0.92,
    groundClearanceRatio: 0.18,
  },
}

export function normalizePartInput(part: PartComposePartInput): PartComposePartInput {
  const kind = normalizedPartKind(part)
  const rawKind = `${part.kind ?? part.partType ?? part.type ?? ''}`.toLowerCase()
  const rawParams =
    typeof part.params === 'object' && part.params !== null && !Array.isArray(part.params)
      ? part.params
      : {}
  const rawDimensions =
    typeof part.dimensions === 'object' &&
    part.dimensions !== null &&
    !Array.isArray(part.dimensions)
      ? part.dimensions
      : {}
  const dimensionDefaults: Partial<PartComposePartInput> = {}
  for (const key of [
    'length',
    'width',
    'depth',
    'height',
    'diameter',
    'radius',
    'thickness',
  ] as const) {
    const value = rawDimensions[key] ?? rawParams[key]
    if (part[key] == null && typeof value === 'number' && Number.isFinite(value) && value > 0) {
      dimensionDefaults[key] = value
    }
  }
  const styleDefaults: Partial<PartComposePartInput> = {}
  for (const key of [
    'primaryColor',
    'metalColor',
    'darkColor',
    'accentColor',
    'color',
    'cornerRadius',
    'cornerSegments',
  ] as const) {
    const value = rawParams[key]
    if (part[key] == null && value != null) {
      const typedStyleDefaults = styleDefaults as Record<string, unknown>
      typedStyleDefaults[key] = value
    }
  }
  const semanticRole =
    part.semanticRole ??
    (kind === 'wheel_set' && /bicycle|bike/.test(rawKind)
      ? 'bicycle_tire'
      : kind === 'wheel_set' && /vehicle|car|auto/.test(rawKind)
        ? 'vehicle_tire'
        : kind === 'tube_frame' && /bicycle|bike/.test(rawKind)
          ? 'bicycle_frame'
          : kind === 'fork' && /bicycle|bike/.test(rawKind)
            ? 'bicycle_fork'
            : undefined)
  return {
    ...part,
    ...dimensionDefaults,
    ...styleDefaults,
    ...(kind ? { kind } : {}),
    ...(semanticRole ? { semanticRole } : {}),
    name: part.name ?? part.partName,
  }
}

export const PART_DIMENSION_KEYS = [
  'length',
  'width',
  'depth',
  'height',
  'diameter',
  'radius',
  'thickness',
] as const

export type PartDimensionKey = (typeof PART_DIMENSION_KEYS)[number]

export function partInputDimensions(
  input: PartComposeInput,
): Partial<Record<PartDimensionKey, number>> {
  const expected = input.geometryBrief?.expectedDimensions ?? {}
  const dimensions: Partial<Record<PartDimensionKey, number>> = {}
  for (const key of PART_DIMENSION_KEYS) {
    const value = input[key] ?? expected[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) dimensions[key] = value
  }
  return dimensions
}

export function primaryDimensionPartKinds(
  input: PartComposeInput,
  parts: PartComposePartInput[],
): PartComposeKind[] {
  const present = partKinds(parts)
  if (isAircraftIntent(input)) return ['aircraft_fuselage', 'streamlined_body']

  switch (familySpecForParts(present).family) {
    case 'vehicle':
      return ['body_shell']
    case 'desk':
      return ['desk_top']
    case 'conveyor':
      return ['conveyor_frame']
    case 'pipe_system':
      return ['pipe_run']
    case 'pump':
      return ['skid_base', 'rounded_machine_body']
    case 'electrical':
      return ['electrical_cabinet']
    case 'valve':
      return ['valve_body']
    case 'bicycle':
      return ['bicycle_frame', 'tube_frame']
    default:
      return []
  }
}

export function applyPartDimensionDefaults(input: PartComposeInput): PartComposeInput {
  const dimensions = partInputDimensions(input)
  if (Object.keys(dimensions).length === 0 || !input.parts?.length) return input

  const primaryKinds = primaryDimensionPartKinds(input, input.parts)
  const primaryIndex =
    primaryKinds.length > 0
      ? input.parts.findIndex((part) => {
          const kind = normalizedPartKind(part)
          return kind != null && primaryKinds.includes(kind)
        })
      : 0
  if (primaryIndex < 0) return input

  const parts = input.parts.map((part, index) => {
    if (index !== primaryIndex) return part
    const next = { ...part }
    for (const key of PART_DIMENSION_KEYS) {
      if (next[key] == null && dimensions[key] != null) next[key] = dimensions[key]
    }
    return next
  })

  return { ...input, parts }
}

export function normalizePartComposeInput(input: PartComposeInput): PartComposeInput {
  return applyPartDimensionDefaults({
    ...input,
    name: input.name ?? input.partName,
    parts: input.parts?.map(normalizePartInput),
  })
}

export function isRegistryPartPlanInput(input: PartComposeInput): boolean {
  return input.registryPartPlan === true || input.__registryPartPlan === true
}

export function vehicleLength(part: PartComposePartInput, style: VehicleStyle = 'sedan'): number {
  return clamp(
    part.length ?? part.depth,
    VEHICLE_STYLE_DEFAULTS[style].length * vehicleSizeScale(part),
    0.3,
    6,
  )
}

export function vehicleWidth(part: PartComposePartInput, style: VehicleStyle = 'sedan'): number {
  const defaults = VEHICLE_STYLE_DEFAULTS[style]
  const derivedFromLength =
    part.width == null && (part.length != null || part.depth != null)
      ? vehicleLength(part, style) * (defaults.width / defaults.length)
      : undefined
  return clamp(part.width, derivedFromLength ?? defaults.width * vehicleSizeScale(part), 0.12, 2.8)
}

export function vehicleOverallHeight(
  part: PartComposePartInput,
  length = vehicleLength(part),
  width = vehicleWidth(part),
  style: VehicleStyle = 'sedan',
): number {
  const defaults = VEHICLE_STYLE_DEFAULTS[style]
  const scale = vehicleSizeScale(part)
  const derivedFromLength =
    part.overallHeight == null && part.height == null && (part.length != null || part.depth != null)
      ? length * defaults.heightRatio
      : undefined
  return clamp(
    part.overallHeight ?? part.height,
    derivedFromLength ?? Math.max(width * 0.66, length * defaults.heightRatio, 0.46 * scale),
    0.22,
    2.4,
  )
}

export function vehicleWheelRadius(
  part: PartComposePartInput,
  length: number,
  width: number,
  overallHeight: number,
  style: VehicleStyle = 'sedan',
): number {
  const defaults = VEHICLE_STYLE_DEFAULTS[style]
  const scale = vehicleSizeScale(part)
  return clamp(
    part.radius ?? part.wheelRadius,
    Math.min(length * defaults.wheelRadiusRatio, width * 0.22, overallHeight * 0.28),
    0.04 * scale,
    0.6,
  )
}

export function numericDimension(
  input: PartComposeInput,
  key: PartDimensionKey,
): number | undefined {
  const direct = input[key]
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) return direct
  const value = input.geometryBrief?.expectedDimensions?.[key]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

export function isCompleteBicycleParts(parts: PartComposePartInput[]): boolean {
  const present = partKinds(parts)
  return familySpecForParts(present).family === 'bicycle'
}

export function bicycleLayoutBase(part: PartComposePartInput): PartComposePartInput {
  const {
    position: _position,
    rotation: _rotation,
    connectTo: _connectTo,
    connectPoint: _connectPoint,
    childPoint: _childPoint,
    centeredOn: _centeredOn,
    alignAbove: _alignAbove,
    alignBeside: _alignBeside,
    offsetFrom: _offsetFrom,
    offsetDirection: _offsetDirection,
    offsetDistance: _offsetDistance,
    around: _around,
    aroundIndex: _aroundIndex,
    aroundCount: _aroundCount,
    aroundRadius: _aroundRadius,
    aroundAngle: _aroundAngle,
    aroundStartAngle: _aroundStartAngle,
    aroundAxis: _aroundAxis,
    array: _array,
    arrayAxis: _arrayAxis,
    arrayOffset: _arrayOffset,
    relationGap: _relationGap,
    anchor: _anchor,
    childAnchor: _childAnchor,
    side: _side,
    ...rest
  } = part
  return rest
}

export function firstBicyclePart(
  parts: PartComposePartInput[],
  kinds: PartComposeKind[],
): PartComposePartInput | undefined {
  return parts.find((part) => {
    const kind = normalizedPartKind(part)
    return kind != null && kinds.includes(kind)
  })
}

export const BICYCLE_FORK_AXLE_FORWARD_RATIO = 0.2
export const BICYCLE_FORK_CROWN_RISE_RATIO = 0.35
export const BICYCLE_FORK_AXLE_DROP_RATIO = 0.55
export const BICYCLE_STEERER_FORWARD_RATIO = 0.08
export const BICYCLE_STEERER_RISE_RATIO = 0.16
export const BICYCLE_HANDLEBAR_STEM_REACH_RATIO = 0.08

export function applyBicycleLayoutDefaults(
  parts: PartComposePartInput[],
  input: PartComposeInput,
): PartComposePartInput[] {
  if (!isCompleteBicycleParts(parts)) return parts

  const wheelPart = firstBicyclePart(parts, ['wheel_set', 'wheel'])
  const framePart = firstBicyclePart(parts, ['tube_frame'])
  const totalLength = numericDimension(input, 'length')
  const totalHeight = numericDimension(input, 'height')
  const totalWidth = numericDimension(input, 'width')
  const requestedRadius = wheelPart?.radius ?? wheelPart?.wheelRadius ?? input.radius
  const defaultWheelRadius =
    totalHeight != null
      ? Math.min(totalHeight * 0.3, totalLength != null ? totalLength * 0.18 : 0.3)
      : totalLength != null
        ? Math.min(totalLength * 0.17, 0.32)
        : 0.22
  const maxWheelRadius =
    totalHeight != null
      ? Math.min(totalHeight * 0.32, totalLength != null ? totalLength * 0.19 : 0.32)
      : totalLength != null
        ? Math.min(totalLength * 0.17, 0.32)
        : 0.32
  const wheelRadius = clamp(requestedRadius, defaultWheelRadius, 0.08, maxWheelRadius)
  const fallbackWheelbase =
    totalLength != null ? Math.max(totalLength - wheelRadius * 2, totalLength * 0.54) : 0.86
  const wheelbase = clamp(
    wheelPart?.length ?? (totalLength == null ? framePart?.length : undefined),
    fallbackWheelbase,
    Math.max(wheelRadius * 2.2, 0.35),
    3,
  )
  const frameHeight = clamp(
    totalHeight == null ? framePart?.height : undefined,
    totalHeight != null ? totalHeight * 0.68 : Math.max(0.42, wheelRadius * 1.9),
    0.18,
    1.2,
  )
  const forkHeight = clamp(undefined, Math.max(frameHeight * 0.95, wheelRadius * 1.25), 0.18, 1.2)
  const handlebarWidth = clamp(totalWidth, 0.42, 0.18, 1.2)
  const forkSpread = clamp(totalWidth != null ? totalWidth * 0.18 : undefined, 0.08, 0.03, 0.22)
  const wheelY = wheelRadius
  const frameCenterY = wheelY + frameHeight * 0.52
  const saddleY = wheelY + frameHeight * 1.08
  const forkCenter: Vec3 = [
    wheelbase / 2 - forkHeight * BICYCLE_FORK_AXLE_FORWARD_RATIO,
    wheelY + forkHeight * BICYCLE_FORK_AXLE_DROP_RATIO,
    0,
  ]
  const forkCrown: Vec3 = [
    forkCenter[0],
    forkCenter[1] + forkHeight * BICYCLE_FORK_CROWN_RISE_RATIO,
    0,
  ]
  const steererTop: Vec3 = [
    forkCrown[0] + forkHeight * BICYCLE_STEERER_FORWARD_RATIO,
    forkCrown[1] + forkHeight * BICYCLE_STEERER_RISE_RATIO,
    0,
  ]
  const handlebarStemDrop = clamp(undefined, forkHeight * 0.14, 0.055, 0.16)
  const handlebarY = steererTop[1] + handlebarStemDrop
  const handlebarX = steererTop[0] + handlebarWidth * BICYCLE_HANDLEBAR_STEM_REACH_RATIO
  const chainSpan = clamp(undefined, wheelbase * 0.52, 0.28, 1.4)
  const bottomBracketX = -wheelbase * 0.02

  const laidOut: PartComposePartInput[] = []
  let hasWheelSet = false
  for (const part of parts) {
    const kind = normalizedPartKind(part)
    if (!kind) {
      laidOut.push(part)
      continue
    }
    switch (kind) {
      case 'wheel_set':
      case 'wheel':
        if (hasWheelSet) continue
        hasWheelSet = true
        laidOut.push({
          ...bicycleLayoutBase(part),
          kind: 'wheel_set',
          count: 2,
          axis: 'z',
          length: wheelbase,
          radius: wheelRadius,
          semanticRole: 'bicycle_tire',
          sourcePartKind: 'bicycle_wheels',
          position: [0, wheelY, 0] as Vec3,
        })
        break
      case 'tube_frame':
        laidOut.push({
          ...bicycleLayoutBase(part),
          kind: 'tube_frame',
          length: wheelbase,
          height: frameHeight,
          semanticRole: 'bicycle_frame',
          position: [0, frameCenterY, 0] as Vec3,
        })
        break
      case 'fork':
        laidOut.push({
          ...bicycleLayoutBase(part),
          kind: 'fork',
          height: forkHeight,
          width: forkSpread,
          semanticRole: 'bicycle_fork',
          position: forkCenter,
        })
        break
      case 'handlebar':
        laidOut.push({
          ...bicycleLayoutBase(part),
          kind: 'handlebar',
          width: handlebarWidth,
          height: handlebarStemDrop,
          position: [handlebarX, handlebarY, 0] as Vec3,
        })
        break
      case 'saddle':
        laidOut.push({
          ...bicycleLayoutBase(part),
          kind: 'saddle',
          position: [-wheelbase * 0.14, saddleY, 0] as Vec3,
        })
        break
      case 'chain_loop':
        laidOut.push({
          ...bicycleLayoutBase(part),
          kind: 'chain_loop',
          length: chainSpan,
          radius: wheelRadius * 0.3,
          position: [bottomBracketX - chainSpan / 2, wheelY + frameHeight * 0.32, 0.018] as Vec3,
        })
        break
      default:
        laidOut.push(part)
        break
    }
  }
  return laidOut
}

export function applyVehicleLayoutDefaults(
  parts: PartComposePartInput[],
  input: PartComposeInput,
): PartComposePartInput[] {
  const body = parts.find((part) => normalizedPartKind(part) === 'body_shell')
  if (!body) return parts

  const style = vehicleStyleFor(input, body)
  const defaults = VEHICLE_STYLE_DEFAULTS[style]
  const bodyLength = vehicleLength(body, style)
  const bodyWidth = vehicleWidth(body, style)
  const overallHeight = vehicleOverallHeight(body, bodyLength, bodyWidth, style)
  const groundClearance = Math.min(overallHeight * defaults.groundClearanceRatio, bodyWidth * 0.22)
  const bodyCenter = body.position ?? [0, groundClearance + overallHeight * 0.5, 0]
  const baseY = bodyCenter[1] - overallHeight / 2
  const wheelRadius = vehicleWheelRadius(body, bodyLength, bodyWidth, overallHeight, style)

  return parts.map((part) => {
    const kind = normalizedPartKind(part)
    switch (kind) {
      case 'body_shell':
        return {
          ...part,
          vehicleStyle: style,
          length: bodyLength,
          width: bodyWidth,
          height: overallHeight,
          position: bodyCenter,
        }
      case 'wheel_set': {
        const longitudinal = Math.abs(
          Number(part.frontX ?? part.frontZ ?? bodyLength * 0.36) -
            Number(part.rearX ?? part.rearZ ?? -bodyLength * 0.36),
        )
        return {
          ...part,
          length:
            Number.isFinite(longitudinal) && longitudinal > 0
              ? longitudinal
              : bodyLength * defaults.wheelbaseRatio,
          width: part.width ?? bodyWidth * defaults.trackRatio,
          radius: part.radius ?? part.wheelRadius ?? wheelRadius,
          wheelWidth: part.wheelWidth ?? part.depth ?? wheelRadius * 0.55,
          semanticRole: part.semanticRole ?? 'vehicle_tire',
          position: [bodyCenter[0], baseY + wheelRadius, bodyCenter[2]] as Vec3,
        }
      }
      case 'window_strip':
        return {
          ...part,
          vehicleStyle: style,
          semanticRole: part.semanticRole ?? 'vehicle_window',
          variant: part.variant ?? 'vehicle_glasshouse',
          length: part.length ?? bodyLength * defaults.cabinLengthRatio,
          width: part.width ?? bodyWidth * defaults.cabinWidthRatio,
          height: part.height ?? overallHeight * 0.24,
          position: [
            bodyCenter[0] + bodyLength * defaults.cabinXRatio,
            baseY + overallHeight * 0.72,
            bodyCenter[2],
          ] as Vec3,
        }
      case 'light_pair':
        return {
          ...part,
          width: part.width ?? bodyWidth,
          semanticRole: part.semanticRole ?? 'headlight',
          radius: part.radius ?? Math.min(bodyWidth * 0.045, overallHeight * 0.055),
          position: [
            bodyCenter[0] + bodyLength * 0.49,
            baseY + overallHeight * 0.36,
            bodyCenter[2],
          ] as Vec3,
        }
      case 'bar_pair':
        return {
          ...part,
          width: part.width ?? part.length ?? bodyWidth * 0.96,
          height: part.height ?? overallHeight * 0.055,
          position: [
            bodyCenter[0] + bodyLength * 0.51,
            baseY + overallHeight * 0.26,
            bodyCenter[2],
          ] as Vec3,
        }
      default:
        return part
    }
  })
}

export function hasExplicitPlacement(part: PartComposePartInput): boolean {
  return (
    part.position != null ||
    part.connectTo != null ||
    part.alignAbove != null ||
    part.alignBeside != null ||
    part.centeredOn != null ||
    part.around != null
  )
}

export function hasExplicitSpatialPlacement(part: PartComposePartInput): boolean {
  return (
    part.position != null ||
    part.alignAbove != null ||
    part.alignBeside != null ||
    part.centeredOn != null ||
    part.around != null
  )
}

export function partReference(part: PartComposePartInput, fallbackKind: PartComposeKind): string {
  return part.id ?? part.name ?? part.partName ?? fallbackKind
}

export function applyContextualPartDefaults(
  parts: PartComposePartInput[],
  _input: PartComposeInput,
): PartComposePartInput[] {
  const firstByKind = (kind: PartComposeKind) =>
    parts.find((part) => normalizedPartKind(part) === kind)
  const fanBlades = firstByKind('radial_blades')
  const volute = firstByKind('volute_casing')
  const conveyorFrame = firstByKind('conveyor_frame')

  return parts.map((part) => {
    const kind = normalizedPartKind(part)
    if (!kind) return part

    if (kind === 'protective_grill' && fanBlades) {
      const bladeRadius = clamp(fanBlades.bladeRadius ?? fanBlades.radius, 0.28, 0.05, 1.4)
      return {
        ...part,
        radius: part.radius ?? bladeRadius * 1.18,
        depth: part.depth ?? Math.max(0.05, bladeRadius * 0.24),
        ...(hasExplicitPlacement(part)
          ? {}
          : { centeredOn: partReference(fanBlades, 'radial_blades') }),
      }
    }

    if (kind === 'inlet_port' && volute && !hasExplicitSpatialPlacement(part)) {
      return {
        ...part,
        connectTo: partReference(volute, 'volute_casing'),
        connectPoint: part.connectPoint ?? 'inlet',
        childPoint: part.childPoint ?? 'base',
        axis: part.axis ?? 'z',
      }
    }

    if (kind === 'outlet_port' && volute && !hasExplicitSpatialPlacement(part)) {
      return {
        ...part,
        connectTo: partReference(volute, 'volute_casing'),
        connectPoint: part.connectPoint ?? 'outlet',
        childPoint: part.childPoint ?? 'base',
        axis: part.axis ?? 'x',
      }
    }

    if ((kind === 'roller_array' || kind === 'belt_surface') && conveyorFrame) {
      return {
        ...part,
        length: part.length ?? conveyorFrame.length,
        width: part.width ?? conveyorFrame.width,
        ...(hasExplicitPlacement(part)
          ? {}
          : {
              alignAbove: partReference(conveyorFrame, 'conveyor_frame'),
              relationGap: part.relationGap ?? (kind === 'belt_surface' ? 0.04 : 0.015),
            }),
      }
    }

    return part
  })
}
