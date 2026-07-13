import { genericPartRole } from '../roles'
import {
  add,
  applyPartRotation,
  clamp,
  clampInt,
  material,
  offsetAlongAxis,
  partAxis,
  partMaterial,
  partSide,
  ringSegments,
  tubeBetween,
} from '../shared'
import type { PartComposeInput, PartComposePartInput, PrimitiveShapeInput, Vec3 } from '../types'
import { detailDefaultInt, partDetailLevel } from './basic-machine'

export function composeGenericBody(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, input.length ?? 1, 0.08, 8)
  const width = clamp(part.width ?? part.depth, input.width ?? input.depth ?? 0.65, 0.05, 5)
  const height = clamp(part.height, input.height ?? 0.8, 0.05, 5)
  const center = add(origin, part.position ?? [0, height * 0.5, 0])
  const mat = partMaterial(part, material(part.primaryColor ?? input.primaryColor ?? '#8b9aae'))
  return applyPartRotation(
    [
      {
        kind: 'box',
        name: part.name ?? `${input.name ?? 'generic object'} body`,
        semanticRole: genericPartRole(part, 'main_body'),
        semanticGroup: part.semanticGroup ?? 'generic_parts',
        sourcePartKind: 'generic_body',
        position: center,
        length,
        width,
        height,
        cornerRadius: clamp(part.cornerRadius, Math.min(length, width, height) * 0.06, 0, 0.5),
        cornerSegments: part.cornerSegments ?? 5,
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeGenericBase(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, (input.length ?? 1) * 1.08, 0.08, 8)
  const width = clamp(
    part.width ?? part.depth,
    (input.width ?? input.depth ?? 0.65) * 1.08,
    0.05,
    5,
  )
  const thickness = clamp(part.thickness ?? part.height, (input.height ?? 0.8) * 0.08, 0.01, 0.8)
  const center = add(origin, part.position ?? [0, thickness * 0.5, 0])
  const mat = partMaterial(part, material(part.darkColor ?? input.darkColor ?? '#1f2937', 0.66))
  return applyPartRotation(
    [
      {
        kind: 'rounded-panel',
        name: part.name ?? `${input.name ?? 'generic object'} base`,
        semanticRole: genericPartRole(part, 'support_base'),
        semanticGroup: part.semanticGroup ?? 'generic_parts',
        sourcePartKind: 'generic_base',
        position: center,
        length,
        width,
        thickness,
        cornerRadius: clamp(part.cornerRadius, Math.min(length, width) * 0.04, 0, 0.35),
        cornerSegments: part.cornerSegments ?? 5,
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeGenericPanel(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
  kind:
    | 'generic_panel'
    | 'generic_control_panel'
    | 'generic_display'
    | 'generic_opening'
    | 'generic_detail_accent',
): PrimitiveShapeInput[] {
  const objectLength = input.length ?? 1
  const objectWidth = input.width ?? input.depth ?? 0.65
  const objectHeight = input.height ?? 0.8
  const length = clamp(
    part.length,
    kind === 'generic_detail_accent' ? objectLength * 0.24 : objectLength * 0.3,
    0.02,
    4,
  )
  const panelHeight = clamp(
    part.height ?? part.width,
    kind === 'generic_opening' ? objectHeight * 0.34 : objectHeight * 0.22,
    0.02,
    3,
  )
  const thickness = clamp(part.thickness ?? part.depth, 0.025, 0.002, 0.4)
  const fallbackZ = objectWidth * 0.51
  const fallbackY =
    kind === 'generic_opening'
      ? objectHeight * 0.36
      : kind === 'generic_detail_accent'
        ? objectHeight * 0.68
        : objectHeight * 0.62
  const center = add(
    origin,
    part.position ?? [
      kind === 'generic_detail_accent' ? objectLength * 0.18 : 0,
      fallbackY,
      fallbackZ,
    ],
  )
  const fallbackColor =
    kind === 'generic_display'
      ? '#0f172a'
      : kind === 'generic_opening'
        ? '#111827'
        : kind === 'generic_control_panel'
          ? '#38bdf8'
          : '#94a3b8'
  const mat = partMaterial(
    part,
    material(part.color ?? part.accentColor ?? input.accentColor ?? fallbackColor, 0.4),
  )
  return applyPartRotation(
    [
      {
        kind: 'rounded-panel',
        name:
          part.name ??
          `${input.name ?? 'generic object'} ${kind.replace(/^generic_/, '').replace(/_/g, ' ')}`,
        semanticRole: genericPartRole(
          part,
          kind === 'generic_control_panel'
            ? 'control_detail'
            : kind === 'generic_display'
              ? 'display'
              : kind === 'generic_opening'
                ? 'opening'
                : kind === 'generic_detail_accent'
                  ? 'detail_accent'
                  : 'panel',
        ),
        semanticGroup: part.semanticGroup ?? 'generic_parts',
        sourcePartKind: kind,
        position: center,
        length,
        width: panelHeight,
        thickness,
        cornerRadius: clamp(part.cornerRadius, Math.min(length, panelHeight) * 0.06, 0, 0.2),
        cornerSegments: part.cornerSegments ?? 4,
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeGenericHandle(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const objectWidth = input.width ?? input.depth ?? 0.65
  const objectHeight = input.height ?? 0.8
  const length = clamp(part.length, 0.22, 0.03, 2)
  const radius = clamp(part.radius ?? part.wireRadius, 0.018, 0.004, 0.12)
  const center = add(origin, part.position ?? [0, objectHeight * 0.46, objectWidth * 0.56])
  return applyPartRotation(
    [
      {
        kind: 'capsule',
        name: part.name ?? `${input.name ?? 'generic object'} handle`,
        semanticRole: genericPartRole(part, 'handle'),
        semanticGroup: part.semanticGroup ?? 'generic_parts',
        sourcePartKind: 'generic_handle',
        position: center,
        axis: 'x',
        radius,
        height: length,
        radialSegments: 12,
        capSegments: 4,
        material: partMaterial(part, material(input.darkColor ?? '#111827', 0.62, 0.12)),
      },
    ],
    center,
    part.rotation,
  )
}

export function composeGenericSpout(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const objectLength = input.length ?? 1
  const objectWidth = input.width ?? input.depth ?? 0.65
  const objectHeight = input.height ?? 0.8
  const radius = clamp(part.radius, Math.min(objectLength, objectWidth) * 0.035, 0.004, 0.2)
  const length = clamp(part.length ?? part.depth ?? part.height, objectWidth * 0.22, 0.02, 1.2)
  const center = add(origin, part.position ?? [0, objectHeight * 0.52, objectWidth * 0.58])
  return applyPartRotation(
    [
      {
        kind: 'cylinder',
        name: part.name ?? `${input.name ?? 'generic object'} spout`,
        semanticRole: genericPartRole(part, 'spout'),
        semanticGroup: part.semanticGroup ?? 'generic_parts',
        sourcePartKind: 'generic_spout',
        position: center,
        axis: partAxis(part.axis, 'z'),
        radius,
        height: length,
        radialSegments: 16,
        material: partMaterial(part, material(input.darkColor ?? '#111827', 0.5, 0.24)),
      },
    ],
    center,
    part.rotation,
  )
}

export function composeGenericFootSet(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const objectLength = input.length ?? 1
  const objectWidth = input.width ?? input.depth ?? 0.65
  const radius = clamp(part.radius, 0.035, 0.006, 0.18)
  const height = clamp(part.height, 0.08, 0.02, 0.8)
  const inset = clamp(part.cornerInset, radius * 2.2, 0, Math.min(objectLength, objectWidth) * 0.45)
  const center = add(origin, part.position ?? [0, height * 0.5, 0])
  const xs = [-objectLength / 2 + inset, objectLength / 2 - inset]
  const zs = [-objectWidth / 2 + inset, objectWidth / 2 - inset]
  const mat = partMaterial(part, material(input.darkColor ?? '#111827', 0.66, 0.08))
  const shapes: PrimitiveShapeInput[] = []
  for (const x of xs) {
    for (const z of zs) {
      shapes.push({
        kind: 'cylinder',
        name: part.name ?? `${input.name ?? 'generic object'} foot`,
        semanticRole: genericPartRole(part, 'support_foot'),
        semanticGroup: part.semanticGroup ?? 'generic_parts',
        sourcePartKind: 'generic_foot_set',
        position: [center[0] + x, center[1], center[2] + z],
        axis: 'y',
        radius,
        height,
        radialSegments: 10,
        material: mat,
      })
    }
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeMobilePlatformChassis(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, input.length ?? 1.45, 0.3, 4)
  const width = clamp(part.width ?? part.depth, input.width ?? input.depth ?? 0.9, 0.24, 2.4)
  const height = clamp(part.height, input.height ?? 0.28, 0.08, 1.2)
  const center = add(origin, part.position ?? [0, height * 0.5, 0])
  const cornerRadius = clamp(
    part.cornerRadius,
    Math.min(length, width) * 0.18,
    0,
    Math.min(length, width) * 0.35,
  )
  const bodyMat = material(part.primaryColor ?? input.primaryColor ?? '#e5e7eb', 0.48, 0.08)
  const skirtMat = material(part.darkColor ?? input.darkColor ?? '#111827', 0.62, 0.12)
  const deckMat = material(part.secondaryColor ?? input.secondaryColor ?? '#334155', 0.55, 0.12)
  const seamMat = material(part.accentColor ?? input.accentColor ?? '#38bdf8', 0.35, 0.02, 0.9)
  const skirtHeight = Math.max(0.035, height * 0.32)
  const deckThickness = Math.max(0.024, height * 0.16)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'mobile platform'} lower bumper skirt`,
      semanticRole: 'lower_bumper_skirt',
      sourcePartKind: 'mobile_platform_chassis',
      position: [center[0], center[1] - height * 0.35, center[2]],
      length: length * 1.04,
      width: width * 1.04,
      thickness: skirtHeight,
      cornerRadius: cornerRadius * 1.02,
      cornerSegments: part.cornerSegments ?? 8,
      material: skirtMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'mobile platform'} rounded chassis body`,
      semanticRole: part.semanticRole ?? 'vehicle_body',
      sourcePartKind: 'mobile_platform_chassis',
      position: center,
      length,
      width,
      height,
      cornerRadius,
      cornerSegments: part.cornerSegments ?? 8,
      material: bodyMat,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'mobile platform'} top load deck`,
      semanticRole: 'cargo_platform',
      sourcePartKind: 'mobile_platform_chassis',
      position: [center[0], center[1] + height * 0.52, center[2]],
      length: length * 0.74,
      width: width * 0.68,
      thickness: deckThickness,
      cornerRadius: Math.min(length, width) * 0.07,
      cornerSegments: 5,
      material: deckMat,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'mobile platform'} left side status seam`,
      semanticRole: 'status_light_strip',
      sourcePartKind: 'mobile_platform_chassis',
      position: [center[0], center[1] + height * 0.02, center[2] + width * 0.53],
      length: length * 0.62,
      width: Math.max(0.018, height * 0.08),
      thickness: Math.max(0.006, width * 0.01),
      cornerRadius: Math.max(0.01, height * 0.05),
      cornerSegments: 3,
      material: seamMat,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'mobile platform'} right side status seam`,
      semanticRole: 'status_light_strip',
      sourcePartKind: 'mobile_platform_chassis',
      position: [center[0], center[1] + height * 0.02, center[2] - width * 0.53],
      length: length * 0.62,
      width: Math.max(0.018, height * 0.08),
      thickness: Math.max(0.006, width * 0.01),
      cornerRadius: Math.max(0.01, height * 0.05),
      cornerSegments: 3,
      material: seamMat,
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeLidarSensor(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const radius = clamp(part.radius, 0.045, 0.012, 0.18)
  const height = clamp(part.height ?? part.length, radius * 0.8, radius * 0.25, radius * 2.5)
  const center = add(origin, part.position ?? [0, 0.24, 0])
  const bodyMat = partMaterial(
    part,
    material(part.darkColor ?? input.darkColor ?? '#0f172a', 0.42, 0.3),
  )
  const lensMat = material(part.accentColor ?? input.accentColor ?? '#38bdf8', 0.18, 0.02, 0.72)
  const axis = partAxis(part.axis, 'x')
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'mobile platform'} lidar housing`,
      semanticRole: part.semanticRole ?? 'navigation_sensor',
      sourcePartKind: 'lidar_sensor',
      position: center,
      axis,
      radius,
      height,
      radialSegments: 24,
      material: bodyMat,
    },
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'mobile platform'} lidar lens`,
      semanticRole: 'sensor_lens',
      sourcePartKind: 'lidar_sensor',
      position: offsetAlongAxis(center, axis, height * 0.52),
      radius: radius * 0.55,
      scale: axis === 'x' ? [0.35, 0.68, 1] : axis === 'z' ? [1, 0.68, 0.35] : [0.8, 0.35, 0.8],
      material: lensMat,
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeEmergencyStopButton(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const radius = clamp(part.radius, 0.04, 0.012, 0.16)
  const height = clamp(part.height ?? part.length, radius * 0.55, radius * 0.2, radius * 1.8)
  const center = add(origin, part.position ?? [0.35, 0.38, 0.2])
  const axis = partAxis(part.axis, 'y')
  const baseMat = material(input.darkColor ?? '#111827', 0.55, 0.25)
  const redMat = partMaterial(part, material(part.color ?? '#ef4444', 0.38, 0.02))
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'mobile platform'} emergency stop base`,
      semanticRole: 'emergency_stop_base',
      sourcePartKind: 'emergency_stop_button',
      position: offsetAlongAxis(center, axis, -height * 0.35),
      axis,
      radius: radius * 1.12,
      height: height * 0.38,
      radialSegments: 24,
      material: baseMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'mobile platform'} emergency stop button`,
      semanticRole: part.semanticRole ?? 'emergency_stop_button',
      sourcePartKind: 'emergency_stop_button',
      position: center,
      axis,
      radius,
      height,
      radialSegments: 28,
      material: redMat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'mobile platform'} emergency stop guard ring`,
      semanticRole: 'emergency_stop_guard',
      sourcePartKind: 'emergency_stop_button',
      position: offsetAlongAxis(center, axis, height * 0.08),
      axis,
      majorRadius: radius * 1.1,
      tubeRadius: radius * 0.08,
      radialSegments: 8,
      tubularSegments: 28,
      material: baseMat,
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeStatusLightStrip(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const objectLength = input.length ?? 1.4
  const objectWidth = input.width ?? input.depth ?? 0.85
  const length = clamp(part.length, objectLength * 0.5, 0.04, 4)
  const stripHeight = clamp(part.height ?? part.width, 0.035, 0.008, 0.25)
  const thickness = clamp(part.thickness ?? part.depth, 0.012, 0.002, 0.08)
  const side = partSide(part.side)
  const defaultZ =
    side === 'left'
      ? objectWidth * 0.52
      : side === 'right'
        ? -objectWidth * 0.52
        : objectWidth * 0.52
  const center = add(origin, part.position ?? [0, (input.height ?? 0.45) * 0.45, defaultZ])
  const lightMat = partMaterial(
    part,
    material(part.color ?? part.accentColor ?? input.accentColor ?? '#38bdf8', 0.18, 0.02, 0.82),
  )
  return applyPartRotation(
    [
      {
        kind: 'rounded-panel',
        name: `${part.name ?? input.name ?? 'mobile platform'} status light strip`,
        semanticRole: part.semanticRole ?? 'status_light_strip',
        semanticGroup: part.semanticGroup ?? 'generic_parts',
        sourcePartKind: 'status_light_strip',
        position: center,
        length,
        width: stripHeight,
        thickness,
        cornerRadius: Math.min(length, stripHeight) * 0.3,
        cornerSegments: 4,
        material: lightMat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeOperatorPanel(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const height = clamp(part.height, 0.62, 0.18, 2)
  const width = clamp(part.width ?? part.length, 0.32, 0.12, 1.2)
  const depth = clamp(part.depth ?? part.thickness, 0.12, 0.03, 0.5)
  const center = add(
    origin,
    part.position ?? [
      (input.length ?? 1.6) * 0.42,
      height * 0.55,
      (input.width ?? input.depth ?? 0.8) * 0.52,
    ],
  )
  const bodyMat = partMaterial(
    part,
    material(part.primaryColor ?? input.primaryColor ?? '#e5e7eb', 0.48, 0.08),
  )
  const screenMat = material(part.darkColor ?? '#0f172a', 0.24, 0.02)
  const buttonMat = material(part.accentColor ?? input.accentColor ?? '#22c55e', 0.3, 0.02)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'machine'} operator panel body`,
      semanticRole: part.semanticRole ?? 'control_panel',
      sourcePartKind: 'operator_panel',
      position: center,
      length: width,
      width: depth,
      height,
      cornerRadius: Math.min(width, depth, height) * 0.08,
      cornerSegments: 4,
      material: bodyMat,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'machine'} operator panel screen`,
      semanticRole: 'display_screen',
      sourcePartKind: 'operator_panel',
      position: [center[0], center[1] + height * 0.16, center[2] + depth * 0.54],
      length: width * 0.62,
      width: height * 0.22,
      thickness: 0.012,
      cornerRadius: width * 0.04,
      cornerSegments: 3,
      material: screenMat,
    },
  ]
  for (const x of [-0.18, 0, 0.18]) {
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'machine'} operator panel button`,
      semanticRole: 'control_button',
      sourcePartKind: 'operator_panel',
      position: [center[0] + x * width, center[1] - height * 0.16, center[2] + depth * 0.55],
      axis: 'z',
      radius: Math.max(0.012, width * 0.035),
      height: 0.012,
      radialSegments: 14,
      material: buttonMat,
    })
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeGuardFence(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, input.length ?? 1.8, 0.25, 8)
  const height = clamp(part.height, 0.9, 0.2, 3)
  const width = clamp(part.width ?? part.depth, 0.08, 0.02, 0.5)
  const postRadius = clamp(part.radius ?? part.wireRadius, 0.018, 0.006, 0.08)
  const count = clampInt(part.count, 4, 2, 12)
  const center = add(
    origin,
    part.position ?? [0, height * 0.5, -(input.width ?? input.depth ?? 1) * 0.55],
  )
  const postMat = partMaterial(
    part,
    material(part.color ?? input.accentColor ?? '#facc15', 0.42, 0.16),
  )
  const railMat = material(part.darkColor ?? input.darkColor ?? '#111827', 0.5, 0.12)
  const shapes: PrimitiveShapeInput[] = []
  for (let i = 0; i < count; i += 1) {
    const x = center[0] - length / 2 + (length * i) / Math.max(1, count - 1)
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'machine'} guard fence post ${i + 1}`,
      semanticRole: 'guard_fence_post',
      sourcePartKind: 'guard_fence',
      position: [x, center[1], center[2]],
      axis: 'y',
      radius: postRadius,
      height,
      radialSegments: 10,
      material: postMat,
    })
  }
  for (const y of [center[1] + height * 0.28, center[1] - height * 0.12]) {
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'machine'} guard fence rail`,
      semanticRole: part.semanticRole ?? 'safety_barrier',
      sourcePartKind: 'guard_fence',
      position: [center[0], y, center[2]],
      length,
      width,
      height: Math.max(0.025, postRadius * 1.8),
      material: railMat,
    })
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composePalletTable(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 1, 0.25, 4)
  const width = clamp(part.width ?? part.depth, 0.7, 0.2, 3)
  const height = clamp(part.height, 0.28, 0.08, 1.2)
  const center = add(origin, part.position ?? [0, height * 0.5, 0])
  const deckMat = partMaterial(
    part,
    material(part.primaryColor ?? input.primaryColor ?? '#475569', 0.55, 0.12),
  )
  const legMat = material(part.darkColor ?? input.darkColor ?? '#111827', 0.55, 0.2)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'machine'} pallet table deck`,
      semanticRole: part.semanticRole ?? 'pallet_table',
      sourcePartKind: 'pallet_table',
      position: [center[0], center[1] + height * 0.45, center[2]],
      length,
      width,
      thickness: Math.max(0.045, height * 0.16),
      cornerRadius: Math.min(length, width) * 0.04,
      cornerSegments: 3,
      material: deckMat,
    },
  ]
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      shapes.push({
        kind: 'box',
        name: `${part.name ?? input.name ?? 'machine'} pallet table leg`,
        semanticRole: 'support_leg',
        sourcePartKind: 'pallet_table',
        position: [center[0] + x * length * 0.38, center[1], center[2] + z * width * 0.36],
        length: Math.max(0.04, length * 0.04),
        width: Math.max(0.04, width * 0.05),
        height,
        material: legMat,
      })
    }
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeBearingBlock(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 0.42, 0.12, 1.6)
  const width = clamp(part.width ?? part.depth, 0.22, 0.08, 1)
  const height = clamp(part.height, 0.26, 0.08, 1.2)
  const radius = clamp(part.radius ?? part.diameter, Math.min(width, height) * 0.24, 0.015, 0.4)
  const center = add(origin, part.position ?? [0, height * 0.5, 0])
  const bodyMat = partMaterial(
    part,
    material(part.metalColor ?? input.metalColor ?? '#64748b', 0.72, 0.22),
  )
  const darkMat = material(part.darkColor ?? input.darkColor ?? '#111827', 0.5, 0.18)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'machine'} bearing block base`,
      semanticRole: 'bearing_base',
      sourcePartKind: 'bearing_block',
      position: [center[0], center[1] - height * 0.34, center[2]],
      length,
      width,
      height: height * 0.22,
      cornerRadius: Math.min(length, width) * 0.06,
      cornerSegments: 3,
      material: bodyMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'machine'} bearing block housing`,
      semanticRole: part.semanticRole ?? 'bearing_block',
      sourcePartKind: 'bearing_block',
      position: [center[0], center[1], center[2]],
      length: length * 0.55,
      width: width * 0.86,
      height: height * 0.72,
      cornerRadius: Math.min(width, height) * 0.12,
      cornerSegments: 5,
      material: bodyMat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'machine'} bearing ring`,
      semanticRole: 'bearing_ring',
      sourcePartKind: 'bearing_block',
      position: [center[0], center[1] + height * 0.04, center[2] + width * 0.45],
      axis: 'z',
      majorRadius: radius,
      tubeRadius: Math.max(0.008, radius * 0.18),
      radialSegments: 10,
      tubularSegments: 32,
      material: darkMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'machine'} bearing bore`,
      semanticRole: 'bearing_bore',
      sourcePartKind: 'bearing_block',
      position: [center[0], center[1] + height * 0.04, center[2] + width * 0.46],
      axis: 'z',
      radius: radius * 0.58,
      height: Math.max(0.018, width * 0.08),
      radialSegments: 24,
      material: darkMat,
    },
  ]
  for (const x of [-1, 1]) {
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'machine'} bearing mounting bolt`,
      semanticRole: 'mounting_bolt',
      sourcePartKind: 'bearing_block',
      position: [
        center[0] + x * length * 0.34,
        center[1] - height * 0.21,
        center[2] + width * 0.18,
      ],
      axis: 'y',
      radius: Math.max(0.008, radius * 0.16),
      height: height * 0.05,
      radialSegments: 12,
      material: darkMat,
    })
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeSupportRollerPair(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 0.9, 0.28, 3)
  const width = clamp(part.width ?? part.depth, 1.18, 0.28, 4)
  const height = clamp(part.height, 0.34, 0.12, 1.4)
  const rollerRadius = clamp(part.radius ?? part.wheelRadius, height * 0.28, 0.035, 0.5)
  const rollerLength = clamp(part.rollerLength ?? part.thickness, width * 0.24, 0.08, width * 0.48)
  const center = add(origin, part.position ?? [0, height * 0.5, 0])
  const bodyMat = partMaterial(
    part,
    material(part.metalColor ?? input.metalColor ?? '#64748b', 0.68, 0.28),
  )
  const darkMat = material(part.darkColor ?? input.darkColor ?? '#111827', 0.54, 0.28)
  const rollerMat = material(part.rollerColor ?? part.metalColor ?? '#374151', 0.38, 0.62)
  const role = part.semanticRole ?? 'support_roller'
  const rollerY = center[1] + height * 0.16
  const rollerZ = Math.max(width * 0.22, rollerRadius * 1.7)
  const blockLength = Math.max(length * 0.18, rollerRadius * 1.2)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'kiln'} support roller foundation`,
      semanticRole: 'support_roller_base',
      sourcePartKind: 'support_roller_pair',
      position: [center[0], center[1] - height * 0.32, center[2]],
      length,
      width,
      height: height * 0.26,
      cornerRadius: Math.min(length, width) * 0.035,
      cornerSegments: 3,
      material: bodyMat,
    },
  ]
  for (const side of [-1, 1]) {
    const z = center[2] + side * rollerZ
    shapes.push(
      {
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'kiln'} ${side < 0 ? 'left' : 'right'} support roller`,
        semanticRole: role,
        sourcePartKind: 'support_roller_pair',
        position: [center[0], rollerY, z],
        axis: 'x',
        radius: rollerRadius,
        height: rollerLength,
        radialSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.5)),
        material: rollerMat,
      },
      {
        kind: 'box',
        name: `${part.name ?? input.name ?? 'kiln'} ${side < 0 ? 'left' : 'right'} roller pedestal`,
        semanticRole: 'support_roller_pedestal',
        sourcePartKind: 'support_roller_pair',
        position: [center[0], center[1] - height * 0.05, z],
        length: blockLength,
        width: rollerLength * 1.18,
        height: height * 0.28,
        cornerRadius: Math.min(blockLength, rollerLength) * 0.05,
        cornerSegments: 3,
        material: bodyMat,
      },
    )
  }
  shapes.push({
    kind: 'cylinder',
    name: `${part.name ?? input.name ?? 'kiln'} thrust roller`,
    semanticRole: 'thrust_roller',
    sourcePartKind: 'support_roller_pair',
    position: [center[0] + length * 0.32, rollerY + rollerRadius * 0.2, center[2]],
    axis: 'z',
    radius: rollerRadius * 0.48,
    height: Math.max(0.04, width * 0.08),
    radialSegments: 20,
    material: darkMat,
  })
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeStructuralTowerFrame(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 2.2, 0.8, 12)
  const width = clamp(part.width ?? part.depth, 1.6, 0.6, 8)
  const height = clamp(part.height, 6, 1.4, 18)
  const levels = Math.max(2, Math.min(9, Math.round(part.levelCount ?? part.count ?? 5)))
  const bayCount = Math.max(1, Math.min(5, Math.round(part.bayCount ?? 2)))
  const columnSize = clamp(part.thickness, Math.min(length, width) * 0.035, 0.025, 0.18)
  const deckThickness = Math.max(0.018, columnSize * 0.45)
  const includeDiagonalBraces = part.includeDiagonalBraces !== false
  const includeExternalStairs = part.externalStairs !== false
  const stairFlights = Math.max(2, Math.min(levels, Math.round(part.stairFlights ?? levels)))
  const stairSide = part.stairSide === 'left' ? -1 : 1
  const stairPlacement = part.stairPlacement === 'outside' ? 'outside' : 'inside'
  const center = add(origin, part.position ?? [0, height / 2, 0])
  const bottomY = center[1] - height / 2
  const frameMat = partMaterial(
    part,
    material(part.darkColor ?? input.darkColor ?? '#111827', 0.58, 0.42),
  )
  const deckMat = material(part.metalColor ?? input.metalColor ?? '#475569', 0.72, 0.3, 0.28)
  const railMat = material(part.accentColor ?? input.accentColor ?? '#1f2937', 0.54, 0.34)
  const shapes: PrimitiveShapeInput[] = []
  const cornerXs = [-length / 2, length / 2]
  const cornerZs = [-width / 2, width / 2]

  for (const x of cornerXs) {
    for (const z of cornerZs) {
      shapes.push({
        kind: 'box',
        name: `${part.name ?? input.name ?? 'tower'} corner column`,
        semanticRole: 'tower_column',
        sourcePartKind: 'structural_tower_frame',
        position: [center[0] + x, center[1], center[2] + z],
        length: columnSize,
        width: columnSize,
        height,
        material: frameMat,
      })
    }
  }

  for (let bay = 1; bay < bayCount; bay += 1) {
    const x = -length / 2 + (length * bay) / bayCount
    for (const z of cornerZs) {
      shapes.push({
        kind: 'box',
        name: `${part.name ?? input.name ?? 'tower'} intermediate column`,
        semanticRole: 'tower_column',
        sourcePartKind: 'structural_tower_frame',
        position: [center[0] + x, center[1], center[2] + z],
        length: columnSize * 0.85,
        width: columnSize * 0.85,
        height,
        material: frameMat,
      })
    }
  }

  for (let level = 0; level <= levels; level += 1) {
    const y = bottomY + (height * level) / levels
    for (const z of cornerZs) {
      shapes.push({
        kind: 'box',
        name: `${part.name ?? input.name ?? 'tower'} level ${level} longitudinal beam`,
        semanticRole: level === 0 ? (part.semanticRole ?? 'preheater_tower_body') : 'tower_beam',
        sourcePartKind: 'structural_tower_frame',
        position: [center[0], y, center[2] + z],
        length,
        width: columnSize,
        height: columnSize,
        material: frameMat,
      })
    }
    for (const x of cornerXs) {
      shapes.push({
        kind: 'box',
        name: `${part.name ?? input.name ?? 'tower'} level ${level} transverse beam`,
        semanticRole: 'tower_beam',
        sourcePartKind: 'structural_tower_frame',
        position: [center[0] + x, y, center[2]],
        length: columnSize,
        width,
        height: columnSize,
        material: frameMat,
      })
    }
    if (level > 0) {
      const gratingZs = [-width * 0.28, 0, width * 0.28]
      for (const gratingZ of gratingZs) {
        shapes.push({
          kind: 'box',
          name: `${part.name ?? input.name ?? 'tower'} level ${level} open grating beam`,
          semanticRole: 'multi_level_platform',
          sourcePartKind: 'structural_tower_frame',
          position: [center[0], y + deckThickness * 0.55, center[2] + gratingZ],
          length: length * 0.86,
          width: columnSize * 0.55,
          height: deckThickness,
          material: deckMat,
        })
      }
      shapes.push(
        {
          kind: 'box',
          name: `${part.name ?? input.name ?? 'tower'} level ${level} front guard rail`,
          semanticRole: 'platform_guard_rail',
          sourcePartKind: 'structural_tower_frame',
          position: [center[0], y + columnSize * 2.2, center[2] + width * 0.5],
          length: length,
          width: columnSize * 0.55,
          height: columnSize * 0.55,
          material: railMat,
        },
        {
          kind: 'box',
          name: `${part.name ?? input.name ?? 'tower'} level ${level} rear guard rail`,
          semanticRole: 'platform_guard_rail',
          sourcePartKind: 'structural_tower_frame',
          position: [center[0], y + columnSize * 2.2, center[2] - width * 0.5],
          length,
          width: columnSize * 0.55,
          height: columnSize * 0.55,
          material: railMat,
        },
      )
    }
  }

  if (includeDiagonalBraces) {
    const bayHeight = height / levels
    const braceLength = Math.hypot(length, bayHeight)
    const sideBraceLength = Math.hypot(width, bayHeight)
    const braceAngle = Math.atan2(bayHeight, length)
    const sideBraceAngle = Math.atan2(bayHeight, width)
    for (let level = 0; level < levels; level += 1) {
      const y = bottomY + bayHeight * (level + 0.5)
      for (const z of cornerZs) {
        shapes.push(
          {
            kind: 'box',
            name: `${part.name ?? input.name ?? 'tower'} level ${level + 1} diagonal brace`,
            semanticRole: 'tower_diagonal_brace',
            sourcePartKind: 'structural_tower_frame',
            position: [center[0], y, center[2] + z],
            length: braceLength,
            width: columnSize * 0.42,
            height: columnSize * 0.42,
            rotation: [0, 0, braceAngle],
            material: railMat,
          },
          {
            kind: 'box',
            name: `${part.name ?? input.name ?? 'tower'} level ${level + 1} cross brace`,
            semanticRole: 'tower_diagonal_brace',
            sourcePartKind: 'structural_tower_frame',
            position: [center[0], y, center[2] + z],
            length: braceLength,
            width: columnSize * 0.38,
            height: columnSize * 0.38,
            rotation: [0, 0, -braceAngle],
            material: railMat,
          },
        )
      }
      for (const x of cornerXs) {
        shapes.push(
          {
            kind: 'box',
            name: `${part.name ?? input.name ?? 'tower'} level ${level + 1} side diagonal brace`,
            semanticRole: 'tower_diagonal_brace',
            sourcePartKind: 'structural_tower_frame',
            position: [center[0] + x, y, center[2]],
            length: columnSize * 0.38,
            width: sideBraceLength,
            height: columnSize * 0.38,
            rotation: [sideBraceAngle, 0, 0],
            material: railMat,
          },
          {
            kind: 'box',
            name: `${part.name ?? input.name ?? 'tower'} level ${level + 1} side cross brace`,
            semanticRole: 'tower_diagonal_brace',
            sourcePartKind: 'structural_tower_frame',
            position: [center[0] + x, y, center[2]],
            length: columnSize * 0.36,
            width: sideBraceLength,
            height: columnSize * 0.36,
            rotation: [-sideBraceAngle, 0, 0],
            material: railMat,
          },
        )
      }
    }
  }

  if (includeExternalStairs) {
    const stairDepth = Math.max(
      columnSize * 4.2,
      width * (stairPlacement === 'inside' ? 0.14 : 0.24),
    )
    const stairWidth = Math.max(
      columnSize * 1.8,
      length * (stairPlacement === 'inside' ? 0.045 : 0.08),
    )
    const sideX =
      stairPlacement === 'inside'
        ? center[0] + stairSide * (length * 0.5 - stairWidth * 0.8 - columnSize * 2.2)
        : center[0] + stairSide * (length * 0.5 + columnSize * 3.2)
    const stairCenterZ =
      stairPlacement === 'inside'
        ? center[2] + width * 0.18
        : center[2] + width * 0.5 + columnSize * 2.4
    const flightHeight = height / stairFlights
    const flightRun = Math.max(stairDepth * 0.72, columnSize * 5)
    const flightLength = Math.hypot(flightRun, flightHeight * 0.72)
    const flightAngle = Math.atan2(flightHeight * 0.72, flightRun)

    for (let flight = 0; flight < stairFlights; flight += 1) {
      const y = bottomY + flightHeight * (flight + 0.5)
      const direction = flight % 2 === 0 ? 1 : -1
      shapes.push(
        {
          kind: 'box',
          name: `${part.name ?? input.name ?? 'tower'} ${stairPlacement} stair flight ${flight + 1}`,
          semanticRole:
            stairPlacement === 'inside' ? 'internal_stair_flight' : 'external_stair_flight',
          sourcePartKind: 'structural_tower_frame',
          position: [sideX, y, stairCenterZ + direction * stairDepth * 0.18],
          length: stairWidth,
          width: flightLength,
          height: columnSize * 0.48,
          rotation: [direction * flightAngle, 0, 0],
          material: deckMat,
        },
        {
          kind: 'box',
          name: `${part.name ?? input.name ?? 'tower'} ${stairPlacement} stair landing ${flight + 1}`,
          semanticRole:
            stairPlacement === 'inside' ? 'internal_stair_landing' : 'external_stair_landing',
          sourcePartKind: 'structural_tower_frame',
          position: [
            sideX,
            bottomY + flightHeight * (flight + 1),
            stairCenterZ - direction * stairDepth * 0.34,
          ],
          length: stairWidth * 1.35,
          width: stairDepth * 0.45,
          height: deckThickness,
          material: deckMat,
        },
        {
          kind: 'box',
          name: `${part.name ?? input.name ?? 'tower'} ${stairPlacement} stair guard rail ${flight + 1}`,
          semanticRole:
            stairPlacement === 'inside' ? 'internal_stair_guard_rail' : 'external_stair_guard_rail',
          sourcePartKind: 'structural_tower_frame',
          position: [
            sideX + stairSide * stairWidth * 0.58,
            y + columnSize * 1.8,
            stairCenterZ + direction * stairDepth * 0.18,
          ],
          length: columnSize * 0.52,
          width: flightLength,
          height: columnSize * 0.55,
          rotation: [direction * flightAngle, 0, 0],
          material: railMat,
        },
      )
    }
  } else {
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'tower'} vertical access ladder`,
      semanticRole: 'access_ladder',
      sourcePartKind: 'structural_tower_frame',
      position: [center[0] - length * 0.56, center[1], center[2] + width * 0.56],
      length: columnSize * 1.1,
      width: columnSize * 2.4,
      height: height * 0.86,
      material: railMat,
    })
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeHelicalStair(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const height = clamp(part.height ?? part.overallHeight, 6, 0.8, 18)
  const treadWidth = clamp(part.width, 0.32, 0.12, 1.2)
  const innerRadius = clamp(part.innerRadius ?? part.radius, 0.9, 0.08, 6)
  const outerRadius = clamp(part.outerRadius, innerRadius + treadWidth, innerRadius + 0.08, 7)
  const stairWidth = outerRadius - innerRadius
  const centerRadius = innerRadius + stairWidth / 2
  const detail = partDetailLevel(input, part)
  const defaultTurns = clamp(height / 3.2, 2, 1.15, 4.5)
  const sweepAngle = clamp(
    part.sweepAngle,
    defaultTurns * Math.PI * 2,
    Math.PI * 0.75,
    Math.PI * 10,
  )
  const minimumStepCount = clampInt(
    undefined,
    Math.max(
      Math.ceil(height / (detail === 'high' ? 0.24 : detail === 'medium' ? 0.28 : 0.32)),
      Math.ceil((Math.abs(sweepAngle) * centerRadius) / 0.58),
      8,
    ),
    8,
    72,
  )
  const defaultStepCount =
    detail === 'high'
      ? Math.max(28, Math.round(height * 3.2))
      : detail === 'medium'
        ? Math.max(22, Math.round(height * 2.4))
        : Math.max(16, Math.round(height * 1.6))
  const stepCount = clampInt(
    part.stepCount ?? part.count,
    Math.max(defaultStepCount, minimumStepCount),
    minimumStepCount,
    96,
  )
  const startAngle = part.startAngle ?? part.aroundStartAngle ?? 0
  const treadArc = Math.abs(sweepAngle / stepCount) * centerRadius
  const treadDepth = clamp(part.depth, Math.min(0.72, treadArc * 0.82), 0.04, 0.9)
  const treadThickness = clamp(part.thickness, 0.035, 0.012, 0.16)
  const railHeight = clamp(part.railingHeight, 0.42, 0.18, 1.1)
  const wireRadius = clamp(part.wireRadius, 0.018, 0.004, 0.08)
  const center = add(origin, part.position ?? [0, height / 2, 0])
  const bottomY = center[1] - height / 2
  const steel = partMaterial(
    part,
    material(part.metalColor ?? input.metalColor ?? '#64748b', 0.4, 0.66),
  )
  const treadMat = material(
    part.color ?? part.metalColor ?? input.metalColor ?? '#94a3b8',
    0.48,
    0.5,
  )
  const sourcePartKind =
    part.sourcePartKind ?? (part.kind === 'helical_ladder' ? 'helical_ladder' : 'helical_stair')
  const accessLabel = sourcePartKind === 'helical_ladder' ? 'helical ladder' : 'helical stair'
  const shapes: PrimitiveShapeInput[] = []
  const pointAt = (radius: number, angle: number, y: number): Vec3 => [
    center[0] + Math.cos(angle) * radius,
    y,
    center[2] + Math.sin(angle) * radius,
  ]
  const localHelixPath = (radius: number, pointCount: number): Vec3[] =>
    Array.from({ length: pointCount + 1 }, (_, i) => {
      const t = i / pointCount
      const angle = startAngle + sweepAngle * t
      return [Math.cos(angle) * radius, -height / 2 + height * t, Math.sin(angle) * radius]
    })

  for (let i = 0; i < stepCount; i += 1) {
    const t = (i + 0.5) / stepCount
    const angle = startAngle + sweepAngle * t
    const y = bottomY + height * t
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'tower'} ${accessLabel} tread ${i + 1}`,
      semanticRole:
        sourcePartKind === 'helical_ladder'
          ? 'helical_ladder_tread'
          : (part.semanticRole ?? 'helical_stair_tread'),
      sourcePartKind,
      position: pointAt(centerRadius, angle, y),
      rotation: [0, -angle, 0],
      length: stairWidth,
      width: treadDepth,
      height: treadThickness,
      material: treadMat,
    })
  }

  const railPathPointCount = clampInt(
    part.ringCount,
    Math.max(detail === 'high' ? 32 : detail === 'medium' ? 24 : 18, Math.ceil(stepCount / 2)),
    8,
    72,
  )
  const innerStringerRadius = innerRadius + wireRadius * 1.5
  const outerStringerRadius = outerRadius - wireRadius * 1.5
  const helixPath = localHelixPath(outerStringerRadius, railPathPointCount)
  const innerHelixPath = localHelixPath(innerStringerRadius, railPathPointCount)
  const railSegments = Math.max(24, railPathPointCount * 4)
  shapes.push(
    {
      kind: 'sweep',
      name: `${part.name ?? input.name ?? 'tower'} continuous outer guard rail`,
      semanticRole:
        sourcePartKind === 'helical_ladder'
          ? 'helical_ladder_guard_rail'
          : 'helical_stair_guard_rail',
      sourcePartKind,
      position: [center[0], center[1] + railHeight, center[2]],
      path: helixPath,
      radius: wireRadius,
      tubularSegments: railSegments,
      radialSegments: 8,
      material: steel,
    },
    {
      kind: 'sweep',
      name: `${part.name ?? input.name ?? 'tower'} continuous outer mid rail`,
      semanticRole:
        sourcePartKind === 'helical_ladder' ? 'helical_ladder_mid_rail' : 'helical_stair_mid_rail',
      sourcePartKind,
      position: [center[0], center[1] + railHeight * 0.55, center[2]],
      path: helixPath,
      radius: wireRadius * 0.78,
      tubularSegments: railSegments,
      radialSegments: 8,
      material: steel,
    },
    {
      kind: 'sweep',
      name: `${part.name ?? input.name ?? 'tower'} outer tread stringer`,
      semanticRole:
        sourcePartKind === 'helical_ladder' ? 'helical_ladder_stringer' : 'helical_stair_stringer',
      sourcePartKind,
      position: [center[0], center[1] - treadThickness * 0.4, center[2]],
      path: helixPath,
      radius: wireRadius * 0.92,
      tubularSegments: railSegments,
      radialSegments: 8,
      material: steel,
    },
    {
      kind: 'sweep',
      name: `${part.name ?? input.name ?? 'tower'} inner tread stringer`,
      semanticRole:
        sourcePartKind === 'helical_ladder' ? 'helical_ladder_stringer' : 'helical_stair_stringer',
      sourcePartKind,
      position: [center[0], center[1] - treadThickness * 0.4, center[2]],
      path: innerHelixPath,
      radius: wireRadius * 0.92,
      tubularSegments: railSegments,
      radialSegments: 8,
      material: steel,
    },
  )

  const landingWidth = Math.min(0.95, treadDepth * 1.65)
  for (const [index, t] of [0, 1].entries()) {
    const angle = startAngle + sweepAngle * t
    const y = bottomY + height * t
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'tower'} ${accessLabel} ${index === 0 ? 'bottom' : 'top'} landing`,
      semanticRole:
        sourcePartKind === 'helical_ladder' ? 'helical_ladder_landing' : 'helical_stair_landing',
      sourcePartKind,
      position: pointAt(centerRadius, angle, y),
      rotation: [0, -angle, 0],
      length: stairWidth * 1.18,
      width: landingWidth,
      height: treadThickness * 1.15,
      material: treadMat,
    })
  }

  const postEvery = detail === 'high' ? 3 : detail === 'medium' ? 4 : 5
  for (let i = 0; i <= stepCount; i += postEvery) {
    const t = i / stepCount
    const angle = startAngle + sweepAngle * t
    const y = bottomY + height * t
    shapes.push({
      ...tubeBetween(
        `${part.name ?? input.name ?? 'tower'} ${accessLabel} post ${i + 1}`,
        pointAt(outerStringerRadius, angle, y),
        pointAt(outerStringerRadius, angle, y + railHeight),
        wireRadius,
        steel,
      ),
      semanticRole:
        sourcePartKind === 'helical_ladder' ? 'helical_ladder_post' : 'helical_stair_post',
      sourcePartKind,
    })
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeCycloneSeparatorUnit(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const height = clamp(part.height, 1.2, 0.45, 4)
  const radius = clamp(part.radius ?? part.diameter, 0.26, 0.08, 1.4)
  const coneHeight = clamp(part.depth, height * 0.28, height * 0.16, height * 0.42)
  const bodyHeight = clamp(part.bodyHeight, height * 0.48, height * 0.28, height * 0.68)
  const outletHeight = clamp(part.length, height * 0.2, height * 0.08, height * 0.34)
  const ductRadius = clamp(part.thickness, radius * 0.26, 0.025, radius * 0.5)
  const center = add(origin, part.position ?? [0, height / 2, 0])
  const bottomY = center[1] - height / 2
  const coneCenterY = bottomY + coneHeight / 2
  const bodyCenterY = bottomY + coneHeight + bodyHeight / 2
  const topY = bottomY + coneHeight + bodyHeight
  const sideSign = part.side === 'left' ? -1 : 1
  const shellMat = partMaterial(
    part,
    material(part.primaryColor ?? input.metalColor ?? '#9ca3af', 0.38, 0.44),
  )
  const darkMat = material(part.darkColor ?? input.darkColor ?? '#1f2937', 0.56, 0.28)
  const ductMat = material(part.metalColor ?? input.metalColor ?? '#64748b', 0.48, 0.42)
  const segments = Math.max(24, Math.round(ringSegments(input.detail) * 0.75))
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'cyclone'} cylindrical cyclone body`,
      semanticRole: part.semanticRole ?? 'preheater_cyclone',
      sourcePartKind: 'cyclone_separator_unit',
      position: [center[0], bodyCenterY, center[2]],
      axis: 'y',
      radius,
      height: bodyHeight,
      radialSegments: segments,
      material: shellMat,
    },
    {
      kind: 'frustum',
      name: `${part.name ?? input.name ?? 'cyclone'} conical lower hopper`,
      semanticRole: 'cyclone_cone',
      sourcePartKind: 'cyclone_separator_unit',
      position: [center[0], coneCenterY, center[2]],
      axis: 'y',
      radiusTop: radius,
      radiusBottom: radius * 0.22,
      height: coneHeight,
      radialSegments: segments,
      material: shellMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'cyclone'} top outlet riser`,
      semanticRole: 'cyclone_top_outlet',
      sourcePartKind: 'cyclone_separator_unit',
      position: [center[0], topY + outletHeight / 2, center[2]],
      axis: 'y',
      radius: radius * 0.46,
      height: outletHeight,
      radialSegments: Math.max(20, Math.round(segments * 0.66)),
      material: ductMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'cyclone'} tangential gas inlet`,
      semanticRole: 'preheater_gas_duct',
      sourcePartKind: 'cyclone_separator_unit',
      position: [center[0] + sideSign * radius * 1.12, bodyCenterY + bodyHeight * 0.22, center[2]],
      axis: 'x',
      radius: ductRadius,
      height: radius * 1.2,
      radialSegments: 16,
      material: ductMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'cyclone'} meal drop pipe`,
      semanticRole: 'meal_drop_pipe',
      sourcePartKind: 'cyclone_separator_unit',
      position: [center[0], bottomY - height * 0.18, center[2]],
      axis: 'y',
      radius: radius * 0.14,
      height: height * 0.36,
      radialSegments: 14,
      material: darkMat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'cyclone'} body flange band`,
      semanticRole: 'cyclone_connection_band',
      sourcePartKind: 'cyclone_separator_unit',
      position: [center[0], topY - bodyHeight * 0.08, center[2]],
      axis: 'y',
      majorRadius: radius * 1.01,
      tubeRadius: Math.max(0.006, radius * 0.035),
      radialSegments: 8,
      tubularSegments: segments,
      material: darkMat,
    },
  ]

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeCouplingGuard(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 0.58, 0.16, 2.4)
  const radius = clamp(part.radius ?? part.diameter, 0.16, 0.04, 0.7)
  const thickness = clamp(part.thickness, 0.028, 0.006, 0.16)
  const center = add(origin, part.position ?? [0, radius, 0])
  const guardMat = partMaterial(
    part,
    material(part.color ?? input.accentColor ?? '#facc15', 0.42, 0.16),
  )
  const darkMat = material(part.darkColor ?? input.darkColor ?? '#111827', 0.5, 0.16)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'half-cylinder',
      name: `${part.name ?? input.name ?? 'machine'} coupling guard cover`,
      semanticRole: part.semanticRole ?? 'coupling_guard',
      sourcePartKind: 'coupling_guard',
      position: center,
      axis: 'x',
      radius,
      height: length,
      thickness,
      radialSegments: 24,
      material: guardMat,
    },
  ]
  for (const x of [-1, 1]) {
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'machine'} coupling guard end flange`,
      semanticRole: 'guard_end_flange',
      sourcePartKind: 'coupling_guard',
      position: [center[0] + x * length * 0.5, center[1] - radius * 0.12, center[2]],
      length: thickness,
      width: radius * 2.05,
      height: radius * 0.18,
      material: darkMat,
    })
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeMotorGearboxUnit(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 1.05, 0.3, 4)
  const radius = clamp(part.radius ?? part.diameter, 0.18, 0.05, 0.8)
  const height = clamp(part.height, radius * 2.1, 0.12, 1.8)
  const center = add(origin, part.position ?? [0, height * 0.52, 0])
  const motorMat = partMaterial(
    part,
    material(part.primaryColor ?? input.primaryColor ?? '#64748b', 0.68, 0.22),
  )
  const gearboxMat = material(part.secondaryColor ?? input.secondaryColor ?? '#475569', 0.72, 0.2)
  const darkMat = material(part.darkColor ?? input.darkColor ?? '#111827', 0.5, 0.18)
  const motorLength = length * 0.55
  const gearboxLength = length * 0.26
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'machine'} drive motor`,
      semanticRole: 'drive_motor',
      sourcePartKind: 'motor_gearbox_unit',
      position: [center[0] - length * 0.16, center[1], center[2]],
      axis: 'x',
      radius,
      height: motorLength,
      radialSegments: 32,
      material: motorMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'machine'} gearbox housing`,
      semanticRole: part.semanticRole ?? 'gearbox_body',
      sourcePartKind: 'motor_gearbox_unit',
      position: [center[0] + length * 0.32, center[1], center[2]],
      length: gearboxLength,
      width: radius * 1.85,
      height: height,
      cornerRadius: radius * 0.12,
      cornerSegments: 4,
      material: gearboxMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'machine'} output shaft`,
      semanticRole: 'output_shaft',
      sourcePartKind: 'motor_gearbox_unit',
      position: [center[0] + length * 0.52, center[1], center[2]],
      axis: 'x',
      radius: radius * 0.18,
      height: length * 0.18,
      radialSegments: 20,
      material: darkMat,
    },
  ]
  for (let i = 0; i < 6; i += 1) {
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'machine'} motor cooling rib`,
      semanticRole: 'motor_cooling_rib',
      sourcePartKind: 'motor_gearbox_unit',
      position: [
        center[0] - length * 0.16 - motorLength * 0.32 + i * motorLength * 0.13,
        center[1] + radius,
        center[2],
      ],
      length: motorLength * 0.05,
      width: radius * 1.55,
      height: Math.max(0.015, radius * 0.08),
      material: darkMat,
    })
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composePipeManifold(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 1.2, 0.25, 6)
  const radius = clamp(part.radius ?? part.diameter, 0.065, 0.012, 0.4)
  const count = clampInt(part.count ?? part.portCount, 4, 2, 10)
  const center = add(origin, part.position ?? [0, radius * 2.2, 0])
  const pipeMat = partMaterial(
    part,
    material(part.metalColor ?? input.metalColor ?? '#94a3b8', 0.8, 0.22),
  )
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'machine'} manifold header`,
      semanticRole: part.semanticRole ?? 'pipe_manifold',
      sourcePartKind: 'pipe_manifold',
      position: center,
      axis: 'x',
      radius,
      height: length,
      wallThickness: Math.max(0.004, radius * 0.16),
      radialSegments: 28,
      material: pipeMat,
    },
  ]
  for (let i = 0; i < count; i += 1) {
    const x = center[0] - length * 0.38 + (length * 0.76 * i) / Math.max(1, count - 1)
    shapes.push({
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'machine'} manifold branch ${i + 1}`,
      semanticRole: 'manifold_branch',
      sourcePartKind: 'pipe_manifold',
      position: [x, center[1] + radius * 1.9, center[2]],
      axis: 'y',
      radius: radius * 0.62,
      height: radius * 3.2,
      wallThickness: Math.max(0.003, radius * 0.12),
      radialSegments: 20,
      material: pipeMat,
    })
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeHopperBody(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 0.9, 0.25, 4)
  const width = clamp(part.width ?? part.depth, 0.7, 0.2, 3)
  const height = clamp(part.height, 0.8, 0.25, 3.5)
  const center = add(origin, part.position ?? [0, height * 0.62, 0])
  const topLengthScale = Array.isArray(part.topScale)
    ? clamp(part.topScale[0], 1.65, 0.2, 3)
    : clamp(typeof part.topScale === 'number' ? part.topScale : part.topLengthScale, 1.65, 0.2, 3)
  const topWidthScale = Array.isArray(part.topScale)
    ? clamp(part.topScale[1], 1.45, 0.2, 3)
    : clamp(typeof part.topScale === 'number' ? part.topScale : part.topWidthScale, 1.45, 0.2, 3)
  const bodyMat = partMaterial(
    part,
    material(part.primaryColor ?? input.primaryColor ?? '#94a3b8', 0.55, 0.14),
  )
  const darkMat = material(part.darkColor ?? input.darkColor ?? '#374151', 0.5, 0.16)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'trapezoid-prism',
      name: `${part.name ?? input.name ?? 'machine'} tapered hopper body`,
      semanticRole: part.semanticRole ?? 'hopper_body',
      sourcePartKind: 'hopper_body',
      position: center,
      length,
      width,
      height,
      topScale: [topLengthScale, topWidthScale],
      topLengthScale,
      topWidthScale,
      material: bodyMat,
    },
    {
      kind: 'frustum',
      name: `${part.name ?? input.name ?? 'machine'} hopper outlet throat`,
      semanticRole: 'hopper_outlet',
      sourcePartKind: 'hopper_body',
      position: [center[0], center[1] - height * 0.58, center[2]],
      axis: 'y',
      radiusTop: Math.min(length, width) * 0.22,
      radiusBottom: Math.min(length, width) * 0.1,
      height: height * 0.25,
      radialSegments: 4,
      material: darkMat,
    },
  ]
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      shapes.push({
        kind: 'box',
        name: `${part.name ?? input.name ?? 'machine'} hopper support leg`,
        semanticRole: 'hopper_support_leg',
        sourcePartKind: 'hopper_body',
        position: [center[0] + x * length * 0.38, height * 0.28, center[2] + z * width * 0.36],
        length: Math.max(0.035, length * 0.035),
        width: Math.max(0.035, width * 0.04),
        height: height * 0.56,
        material: darkMat,
      })
    }
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeConicalHopper(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const radiusTop = clamp(part.radiusTop ?? part.radius ?? part.width, 0.42, 0.08, 3)
  const radiusBottom = clamp(
    part.radiusBottom ?? part.outletRadius,
    radiusTop * 0.18,
    0.02,
    radiusTop,
  )
  const height = clamp(part.height, 0.82, 0.18, 5)
  const center = add(origin, part.position ?? [0, height * 0.5, 0])
  const mat = partMaterial(
    part,
    material(part.primaryColor ?? input.primaryColor ?? '#94a3b8', 0.52, 0.16),
  )
  const darkMat = material(part.darkColor ?? input.darkColor ?? '#374151', 0.5, 0.16)
  const role = genericPartRole(part, 'conical_hopper')
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'frustum',
      name: `${part.name ?? input.name ?? 'machine'} conical hopper`,
      semanticRole: role,
      sourcePartKind: 'conical_hopper',
      position: center,
      axis: 'y',
      radiusTop,
      radiusBottom,
      height,
      radialSegments: clampInt(part.radialSegments, 32, 4, 64),
      material: mat,
    },
    {
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'machine'} hopper outlet collar`,
      semanticRole: 'hopper_outlet_collar',
      sourcePartKind: 'conical_hopper',
      position: [center[0], center[1] - height * 0.52, center[2]],
      axis: 'y',
      radius: radiusBottom * 1.08,
      height: Math.max(0.04, height * 0.08),
      wallThickness: Math.max(0.004, radiusBottom * 0.12),
      radialSegments: 24,
      material: darkMat,
    },
  ]
  if (part.includeSupportLegs !== false) {
    for (const angle of [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4]) {
      shapes.push({
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'machine'} hopper support leg`,
        semanticRole: 'support_leg',
        sourcePartKind: 'conical_hopper',
        position: [
          center[0] + Math.cos(angle) * radiusTop * 0.72,
          height * 0.25,
          center[2] + Math.sin(angle) * radiusTop * 0.72,
        ],
        axis: 'y',
        radius: Math.max(0.014, radiusTop * 0.035),
        height: height * 0.5,
        radialSegments: 8,
        material: darkMat,
      })
    }
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeServicePlatform(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 1.2, 0.3, 6)
  const width = clamp(part.width ?? part.depth, 0.65, 0.2, 3)
  const height = clamp(part.height, 0.9, 0.2, 3.5)
  const railHeight = clamp(part.overallHeight, height * 0.42, 0.18, 1.4)
  const center = add(origin, part.position ?? [0, height, 0])
  const deckMat = partMaterial(
    part,
    material(part.metalColor ?? input.metalColor ?? '#64748b', 0.65, 0.18),
  )
  const railMat = material(part.color ?? input.accentColor ?? '#facc15', 0.42, 0.12)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'machine'} service platform deck`,
      semanticRole: part.semanticRole ?? 'service_platform',
      sourcePartKind: 'service_platform',
      position: center,
      length,
      width,
      thickness: Math.max(0.04, height * 0.06),
      cornerRadius: Math.min(length, width) * 0.025,
      cornerSegments: 2,
      material: deckMat,
    },
  ]
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      shapes.push({
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'machine'} platform post`,
        semanticRole: 'platform_post',
        sourcePartKind: 'service_platform',
        position: [
          center[0] + x * length * 0.46,
          center[1] + railHeight * 0.5,
          center[2] + z * width * 0.44,
        ],
        axis: 'y',
        radius: 0.018,
        height: railHeight,
        radialSegments: 10,
        material: railMat,
      })
    }
  }
  for (const z of [-1, 1]) {
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'machine'} platform guard rail`,
      semanticRole: 'guard_rail',
      sourcePartKind: 'service_platform',
      position: [center[0], center[1] + railHeight * 0.85, center[2] + z * width * 0.44],
      length,
      width: 0.035,
      height: 0.035,
      material: railMat,
    })
  }
  shapes.push({
    kind: 'box',
    name: `${part.name ?? input.name ?? 'machine'} access ladder`,
    semanticRole: 'access_ladder',
    sourcePartKind: 'service_platform',
    position: [center[0] - length * 0.48, center[1] - height * 0.35, center[2]],
    length: 0.04,
    width: width * 0.35,
    height,
    material: railMat,
  })
  return applyPartRotation(shapes, center, part.rotation)
}

export function composePlatformWithLadder(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const shapes = composeServicePlatform(input, part, origin)
  const center = add(origin, part.position ?? [0, clamp(part.height, 0.9, 0.2, 3.5), 0])
  const length = clamp(part.length, 1.2, 0.3, 6)
  const width = clamp(part.width ?? part.depth, 0.65, 0.2, 3)
  const height = clamp(part.height, 0.9, 0.2, 3.5)
  const railMat = material(part.color ?? input.accentColor ?? '#facc15', 0.42, 0.12)
  const rungCount = clampInt(
    part.rungCount ?? part.count,
    detailDefaultInt(input, part, { low: 4, medium: 6, high: 10 }),
    3,
    16,
  )
  const ladderX = center[0] - length * 0.52
  const ladderZ = center[2] - width * 0.18
  for (const zOffset of [-0.08, 0.08]) {
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'machine'} ladder side rail`,
      semanticRole: 'ladder_side_rail',
      sourcePartKind: 'platform_with_ladder',
      position: [ladderX, center[1] - height * 0.45, ladderZ + zOffset],
      axis: 'y',
      radius: 0.014,
      height,
      radialSegments: 8,
      material: railMat,
    })
  }
  for (let index = 0; index < rungCount; index += 1) {
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'machine'} ladder rung ${index + 1}`,
      semanticRole: 'ladder_rung',
      sourcePartKind: 'platform_with_ladder',
      position: [
        ladderX,
        center[1] - height * 0.88 + (height * 0.78 * index) / Math.max(1, rungCount - 1),
        ladderZ,
      ],
      axis: 'z',
      radius: 0.012,
      height: 0.22,
      radialSegments: 8,
      material: railMat,
    })
  }
  return shapes.map((shape) =>
    shape.sourcePartKind === 'service_platform'
      ? { ...shape, sourcePartKind: 'platform_with_ladder' }
      : shape,
  )
}

export function kioskTotalDimensions(input: PartComposeInput) {
  const length = clamp(input.length, 1.8, 0.4, 8)
  const width = clamp(input.width ?? input.depth, 1.2, 0.3, 5)
  const height = clamp(input.height, 2.1, 0.7, 5)
  return { length, width, height }
}

export function composeKioskBody(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const total = kioskTotalDimensions(input)
  const length = clamp(part.length, total.length, 0.4, 8)
  const width = clamp(part.width ?? part.depth, total.width, 0.3, 5)
  const height = clamp(part.height, total.height * 0.78, 0.4, 5)
  const center = add(origin, part.position ?? [0, height * 0.5, 0])
  const mat = partMaterial(part, material(part.primaryColor ?? input.primaryColor ?? '#d1d5db'))
  return applyPartRotation(
    [
      {
        kind: 'box',
        name: part.name ?? `${input.name ?? 'kiosk'} body`,
        semanticRole: part.semanticRole ?? 'kiosk_body',
        semanticGroup: part.semanticGroup ?? 'kiosk',
        sourcePartKind: 'kiosk_body',
        position: center,
        length,
        width,
        height,
        cornerRadius: clamp(part.cornerRadius, Math.min(length, width, height) * 0.025, 0, 0.3),
        cornerSegments: part.cornerSegments ?? 3,
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeKioskRoof(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const total = kioskTotalDimensions(input)
  const bodyHeight = total.height * 0.78
  const length = clamp(part.length, total.length * 1.16, 0.4, 9)
  const width = clamp(part.width ?? part.depth, total.width * 1.18, 0.3, 6)
  const height = clamp(part.height ?? part.thickness, total.height * 0.16, 0.04, 1.2)
  const center = add(origin, part.position ?? [0, bodyHeight + height * 0.5, 0])
  const mat = partMaterial(part, material(part.color ?? input.secondaryColor ?? '#7f1d1d'))
  return applyPartRotation(
    [
      {
        kind: part.variant === 'flat' ? 'box' : 'wedge',
        name: part.name ?? `${input.name ?? 'kiosk'} roof`,
        semanticRole: part.semanticRole ?? 'roof',
        semanticGroup: part.semanticGroup ?? 'kiosk',
        sourcePartKind: 'kiosk_roof',
        position: center,
        length,
        width,
        height,
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeKioskOpening(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const total = kioskTotalDimensions(input)
  const length = clamp(part.length, total.length * 0.42, 0.08, 5)
  const panelHeight = clamp(part.height ?? part.width, total.height * 0.34, 0.08, 4)
  const thickness = clamp(part.thickness ?? part.depth, 0.035, 0.004, 0.5)
  const center = add(origin, part.position ?? [0, total.height * 0.42, total.width * 0.515])
  const mat = partMaterial(part, material(part.color ?? input.darkColor ?? '#111827', 0.58, 0.04))
  return applyPartRotation(
    [
      {
        kind: 'rounded-panel',
        name: part.name ?? `${input.name ?? 'kiosk'} service opening`,
        semanticRole: part.semanticRole ?? 'opening',
        semanticGroup: part.semanticGroup ?? 'kiosk',
        sourcePartKind: 'kiosk_opening',
        position: center,
        length,
        width: panelHeight,
        thickness,
        cornerRadius: clamp(part.cornerRadius, Math.min(length, panelHeight) * 0.05, 0, 0.25),
        cornerSegments: part.cornerSegments ?? 4,
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeKioskCounter(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const total = kioskTotalDimensions(input)
  const length = clamp(part.length, total.length * 0.62, 0.08, 6)
  const width = clamp(part.width ?? part.depth, total.width * 0.2, 0.04, 2)
  const thickness = clamp(part.thickness ?? part.height, total.height * 0.04, 0.02, 0.6)
  const center = add(origin, part.position ?? [0, total.height * 0.27, total.width * 0.62])
  const mat = partMaterial(part, material(part.color ?? input.metalColor ?? '#9ca3af', 0.45, 0.18))
  return applyPartRotation(
    [
      {
        kind: 'rounded-panel',
        name: part.name ?? `${input.name ?? 'kiosk'} service counter`,
        semanticRole: part.semanticRole ?? 'service_counter',
        semanticGroup: part.semanticGroup ?? 'kiosk',
        sourcePartKind: 'kiosk_counter',
        position: center,
        length,
        width,
        thickness,
        cornerRadius: clamp(part.cornerRadius, Math.min(length, width) * 0.04, 0, 0.2),
        cornerSegments: part.cornerSegments ?? 4,
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeKioskSign(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const total = kioskTotalDimensions(input)
  const length = clamp(part.length, total.length * 0.64, 0.08, 6)
  const panelHeight = clamp(part.height ?? part.width, total.height * 0.12, 0.04, 1.5)
  const thickness = clamp(part.thickness ?? part.depth, 0.035, 0.004, 0.4)
  const center = add(origin, part.position ?? [0, total.height * 0.72, total.width * 0.54])
  const mat = partMaterial(part, material(part.accentColor ?? input.accentColor ?? '#facc15', 0.32))
  return applyPartRotation(
    [
      {
        kind: 'rounded-panel',
        name: part.name ?? `${input.name ?? 'kiosk'} sign panel`,
        semanticRole: part.semanticRole ?? 'sign_panel',
        semanticGroup: part.semanticGroup ?? 'kiosk',
        sourcePartKind: 'kiosk_sign',
        position: center,
        length,
        width: panelHeight,
        thickness,
        cornerRadius: clamp(part.cornerRadius, Math.min(length, panelHeight) * 0.08, 0, 0.2),
        cornerSegments: part.cornerSegments ?? 4,
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeKioskAwning(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const total = kioskTotalDimensions(input)
  const length = clamp(part.length, total.length * 0.72, 0.08, 7)
  const width = clamp(part.width ?? part.depth, total.width * 0.32, 0.04, 2.4)
  const thickness = clamp(part.thickness ?? part.height, total.height * 0.04, 0.02, 0.8)
  const center = add(origin, part.position ?? [0, total.height * 0.58, total.width * 0.64])
  const mat = partMaterial(part, material(part.color ?? input.secondaryColor ?? '#ef4444', 0.48))
  return applyPartRotation(
    [
      {
        kind: 'wedge',
        name: part.name ?? `${input.name ?? 'kiosk'} front awning`,
        semanticRole: part.semanticRole ?? 'awning',
        semanticGroup: part.semanticGroup ?? 'kiosk',
        sourcePartKind: 'kiosk_awning',
        position: center,
        rotation: part.rotation ?? [0, 0, 0],
        length,
        width,
        height: thickness,
        material: mat,
      },
    ],
    center,
    undefined,
  )
}
