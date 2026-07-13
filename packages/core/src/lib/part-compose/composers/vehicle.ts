import { angularStep } from '../../orientation-utils'
import { normalizedRoleToken } from '../roles'
import {
  add,
  applyPartRotation,
  BICYCLE_FORK_AXLE_DROP_RATIO,
  BICYCLE_FORK_AXLE_FORWARD_RATIO,
  BICYCLE_FORK_CROWN_RISE_RATIO,
  BICYCLE_HANDLEBAR_STEM_REACH_RATIO,
  BICYCLE_STEERER_FORWARD_RATIO,
  BICYCLE_STEERER_RISE_RATIO,
  clamp,
  clampInt,
  material,
  partAxis,
  partIdentityText,
  partMaterial,
  partSide,
  ringSegments,
  textOf,
  tubeBetween,
  VEHICLE_STYLE_DEFAULTS,
  vehicleLength,
  vehicleOverallHeight,
  vehicleStyleFor,
  vehicleWheelRadius,
  vehicleWidth,
} from '../shared'
import type { PartComposeInput, PartComposePartInput, PrimitiveShapeInput, Vec3 } from '../types'

export function composeBicycleWheels(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.32, 0])
  const wheelRadius = clamp(part.radius, 0.22, 0.06, 1)
  const length = clamp(part.length, 0.86, 0.25, 3)
  const count = clampInt(part.count, 2, 1, 2)
  const tube = clamp(part.wireRadius, wheelRadius * 0.045, 0.004, 0.04)
  const tireMat = material(input.darkColor ?? '#111827', 0.68, 0.02)
  const metalMat = material(input.metalColor ?? '#cbd5e1', 0.28, 0.78)
  const shapes: PrimitiveShapeInput[] = []
  const positions = wheelSetPositions(count, length, 0)
  positions.forEach((offset, index) => {
    const label = count === 1 ? 'single' : index === 0 ? 'rear' : 'front'
    const wheelCenter: Vec3 = [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]]
    shapes.push({
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} bicycle ${label} tire`,
      semanticRole: 'bicycle_tire',
      sourcePartKind: part.sourcePartKind ?? 'bicycle_wheels',
      position: wheelCenter,
      axis: 'z',
      majorRadius: wheelRadius,
      tubeRadius: tube * 1.7,
      radialSegments: 12,
      tubularSegments: ringSegments(input.detail),
      material: tireMat,
    })
    shapes.push({
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} bicycle ${label} rim`,
      semanticRole: 'bicycle_rim',
      sourcePartKind: part.sourcePartKind ?? 'bicycle_wheels',
      position: wheelCenter,
      axis: 'z',
      majorRadius: wheelRadius * 0.76,
      tubeRadius: tube * 0.55,
      radialSegments: 8,
      tubularSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.65)),
      material: metalMat,
    })
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} bicycle ${label} hub`,
      semanticRole: 'bicycle_hub',
      sourcePartKind: part.sourcePartKind ?? 'bicycle_wheels',
      position: wheelCenter,
      axis: 'z',
      radius: wheelRadius * 0.08,
      height: tube * 5,
      radialSegments: 16,
      material: metalMat,
    })
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * Math.PI * 2) / 8
      shapes.push({
        ...tubeBetween(
          `${part.name ?? input.name ?? 'object'} bicycle ${label} spoke ${i + 1}`,
          wheelCenter,
          [
            wheelCenter[0] + Math.cos(angle) * wheelRadius * 0.72,
            wheelCenter[1] + Math.sin(angle) * wheelRadius * 0.72,
            wheelCenter[2],
          ],
          tube * 0.22,
          metalMat,
        ),
        semanticRole: 'bicycle_spoke',
        sourcePartKind: part.sourcePartKind ?? 'bicycle_wheels',
      })
    }
  })
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeBicycleFrame(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.52, 0])
  const length = clamp(part.length, 0.86, 0.25, 3)
  const height = clamp(part.height, 0.36, 0.12, 1.5)
  const r = clamp(part.radius ?? part.wireRadius, 0.018, 0.004, 0.08)
  const mat = partMaterial(part, material(input.primaryColor ?? '#2563eb', 0.42, 0.18))
  const rear: Vec3 = [center[0] - length / 2, center[1] - height * 0.55, center[2]]
  const front: Vec3 = [center[0] + length / 2, center[1] - height * 0.55, center[2]]
  const seat: Vec3 = [center[0] - length * 0.12, center[1] + height * 0.35, center[2]]
  const head: Vec3 = [center[0] + length * 0.34, center[1] + height * 0.28, center[2]]
  const bottom: Vec3 = [center[0] - length * 0.02, center[1] - height * 0.2, center[2]]
  const pedalOffset = Math.max(r * 4.5, 0.08)
  const pedalLength = Math.max(r * 3.5, 0.07)
  const metalMat = material(input.darkColor ?? '#111827', 0.48, 0.35)
  const shapes: PrimitiveShapeInput[] = [
    tubeBetween(`${part.name ?? input.name ?? 'object'} bicycle top tube`, seat, head, r, mat),
    tubeBetween(`${part.name ?? input.name ?? 'object'} bicycle down tube`, head, bottom, r, mat),
    tubeBetween(`${part.name ?? input.name ?? 'object'} bicycle seat tube`, seat, bottom, r, mat),
    tubeBetween(`${part.name ?? input.name ?? 'object'} bicycle chain stay`, bottom, rear, r, mat),
    tubeBetween(`${part.name ?? input.name ?? 'object'} bicycle seat stay`, seat, rear, r, mat),
    tubeBetween(`${part.name ?? input.name ?? 'object'} bicycle front stay`, head, front, r, mat),
    {
      kind: 'cylinder' as const,
      name: `${part.name ?? input.name ?? 'object'} bicycle crank`,
      position: bottom,
      axis: 'z',
      radius: r * 2.2,
      height: r * 3,
      radialSegments: 18,
      semanticRole: 'crank',
      material: metalMat,
    },
    {
      ...tubeBetween(
        `${part.name ?? input.name ?? 'object'} bicycle left crank arm`,
        bottom,
        [bottom[0], bottom[1] - r * 2.5, bottom[2] - pedalOffset],
        r * 0.38,
        metalMat,
      ),
      semanticRole: 'crank',
    },
    {
      ...tubeBetween(
        `${part.name ?? input.name ?? 'object'} bicycle right crank arm`,
        bottom,
        [bottom[0], bottom[1] + r * 2.5, bottom[2] + pedalOffset],
        r * 0.38,
        metalMat,
      ),
      semanticRole: 'crank',
    },
    {
      kind: 'box' as const,
      name: `${part.name ?? input.name ?? 'object'} bicycle left pedal`,
      position: [bottom[0], bottom[1] - r * 2.5, bottom[2] - pedalOffset - pedalLength * 0.4],
      length: pedalLength,
      width: r * 1.2,
      height: r * 0.75,
      semanticRole: 'pedal',
      material: metalMat,
    },
    {
      kind: 'box' as const,
      name: `${part.name ?? input.name ?? 'object'} bicycle right pedal`,
      position: [bottom[0], bottom[1] + r * 2.5, bottom[2] + pedalOffset + pedalLength * 0.4],
      length: pedalLength,
      width: r * 1.2,
      height: r * 0.75,
      semanticRole: 'pedal',
      material: metalMat,
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeBicycleFork(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0.37, 0.5, 0])
  const height = clamp(part.height, 0.42, 0.12, 1.5)
  const spread = clamp(part.width, 0.08, 0.02, 0.4)
  const r = clamp(part.radius ?? part.wireRadius, 0.014, 0.003, 0.06)
  const mat = partMaterial(part, material(input.metalColor ?? '#cbd5e1', 0.3, 0.75))
  const crown: Vec3 = [center[0], center[1] + height * BICYCLE_FORK_CROWN_RISE_RATIO, center[2]]
  const axle: Vec3 = [
    center[0] + height * BICYCLE_FORK_AXLE_FORWARD_RATIO,
    center[1] - height * BICYCLE_FORK_AXLE_DROP_RATIO,
    center[2],
  ]
  const shapes = [
    tubeBetween(
      `${part.name ?? input.name ?? 'object'} bicycle left fork blade`,
      [crown[0], crown[1], crown[2] - spread / 2],
      [axle[0], axle[1], axle[2] - spread / 2],
      r,
      mat,
    ),
    tubeBetween(
      `${part.name ?? input.name ?? 'object'} bicycle right fork blade`,
      [crown[0], crown[1], crown[2] + spread / 2],
      [axle[0], axle[1], axle[2] + spread / 2],
      r,
      mat,
    ),
    tubeBetween(
      `${part.name ?? input.name ?? 'object'} bicycle steerer tube`,
      crown,
      [
        crown[0] + height * BICYCLE_STEERER_FORWARD_RATIO,
        crown[1] + height * BICYCLE_STEERER_RISE_RATIO,
        crown[2],
      ],
      r,
      mat,
    ),
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeHandlebar(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0.44, 0.78, 0])
  const width = clamp(part.width ?? part.length, 0.32, 0.06, 1.2)
  const stemDrop = clamp(part.height, width * 0.22, 0.025, 0.45)
  const r = clamp(part.radius ?? part.wireRadius, 0.014, 0.003, 0.06)
  const mat = partMaterial(part, material(input.metalColor ?? '#cbd5e1', 0.28, 0.78))
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} handlebar crossbar`,
      position: center,
      axis: 'z',
      radius: r,
      height: width,
      radialSegments: 12,
      material: mat,
    },
    tubeBetween(
      `${part.name ?? input.name ?? 'object'} handlebar stem`,
      [center[0] - width * BICYCLE_HANDLEBAR_STEM_REACH_RATIO, center[1] - stemDrop, center[2]],
      center,
      r,
      mat,
    ),
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeSaddle(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [-0.12, 0.76, 0])
  const length = clamp(part.length, 0.18, 0.04, 0.6)
  const width = clamp(part.width, 0.12, 0.03, 0.4)
  const height = clamp(part.height, 0.035, 0.01, 0.16)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} saddle cushion`,
      position: center,
      length,
      width,
      height,
      cornerRadius: height * 0.55,
      cornerSegments: 5,
      material: partMaterial(part, material(input.darkColor ?? '#111827', 0.62, 0.02)),
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} saddle post`,
      position: [center[0], center[1] - height * 2.4, center[2]],
      axis: 'y',
      radius: height * 0.22,
      height: height * 3.6,
      radialSegments: 12,
      material: material(input.metalColor ?? '#cbd5e1', 0.3, 0.75),
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeChainLoop(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [-0.23, 0.36, 0.018])
  const chainringRadius = clamp(part.radius, 0.105, 0.04, 0.24)
  const rearCogRadius = clamp(part.depth, chainringRadius * 0.52, 0.025, chainringRadius * 0.8)
  const span = clamp(part.length, 0.46, 0.22, 1.4)
  const tubeRadius = clamp(part.wireRadius, chainringRadius * 0.045, 0.002, 0.018)
  const chainHalfHeight = Math.max(chainringRadius * 0.62, rearCogRadius * 1.15)
  const frontX = span / 2
  const rearX = -span / 2
  const chainPath: Vec3[] = [
    [rearX, chainHalfHeight * 0.72, 0],
    [-span * 0.18, chainHalfHeight, 0],
    [frontX, chainHalfHeight, 0],
    [frontX + chainHalfHeight * 0.34, chainHalfHeight * 0.45, 0],
    [frontX + chainHalfHeight * 0.34, -chainHalfHeight * 0.45, 0],
    [frontX, -chainHalfHeight, 0],
    [-span * 0.18, -chainHalfHeight * 0.82, 0],
    [rearX, -chainHalfHeight * 0.58, 0],
    [rearX - chainHalfHeight * 0.28, -chainHalfHeight * 0.18, 0],
    [rearX - chainHalfHeight * 0.24, chainHalfHeight * 0.36, 0],
  ]
  const chainMat = partMaterial(part, material(input.darkColor ?? '#111827', 0.48, 0.35))
  const metalMat = material(input.metalColor ?? '#cbd5e1', 0.3, 0.7)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'sweep',
      name: `${part.name ?? input.name ?? 'object'} chain elongated loop`,
      position: center,
      path: chainPath,
      radius: tubeRadius,
      radialSegments: 6,
      tubularSegments: Math.max(32, Math.round(ringSegments(input.detail) * 0.7)),
      closed: true,
      semanticRole: 'chain_loop',
      material: chainMat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} front chainring`,
      position: [center[0] + frontX, center[1], center[2] - tubeRadius * 1.6],
      axis: 'z',
      majorRadius: chainringRadius,
      tubeRadius: tubeRadius * 0.75,
      radialSegments: 8,
      tubularSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.55)),
      semanticRole: 'chainring',
      material: metalMat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} rear sprocket`,
      position: [
        center[0] + rearX,
        center[1] - chainHalfHeight * 0.1,
        center[2] - tubeRadius * 1.6,
      ],
      axis: 'z',
      majorRadius: rearCogRadius,
      tubeRadius: tubeRadius * 0.65,
      radialSegments: 8,
      tubularSegments: 24,
      semanticRole: 'rear_sprocket',
      material: metalMat,
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeVehicleBody(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const style = vehicleStyleFor(input, part)
  const defaults = VEHICLE_STYLE_DEFAULTS[style]
  const length = vehicleLength(part, style)
  const width = vehicleWidth(part, style)
  const overallHeight = vehicleOverallHeight(part, length, width, style)
  const center = add(origin, part.position ?? [0, Math.max(0.34, overallHeight * 0.58), 0])
  const baseY = center[1] - overallHeight / 2
  const bodyHeight = clamp(
    part.bodyHeight,
    overallHeight * defaults.bodyHeightRatio,
    0.08,
    overallHeight * 0.65,
  )
  const cabinHeight = clamp(
    part.cabinHeight,
    overallHeight * defaults.cabinHeightRatio,
    0.06,
    overallHeight * 0.7,
  )
  const bodyY = baseY + overallHeight * 0.38
  const deckY = bodyY + bodyHeight * 0.48
  const cabinY = baseY + overallHeight * 0.72
  const bodyColor = part.primaryColor ?? part.color ?? input.primaryColor ?? '#ef4444'
  const mat = partMaterial(part, material(bodyColor, 0.42, 0.18))
  const shadowMat = material(part.darkColor ?? input.darkColor ?? '#1f2937', 0.58, 0.16)
  const bodyCornerRadius = clamp(
    part.cornerRadius,
    Math.min(length, width, bodyHeight) * 0.12,
    0,
    Math.min(length, width, bodyHeight) * 0.45,
  )
  const bodyCornerSegments = clampInt(part.cornerSegments, 6, 1, 12)
  const roofCornerAngle = clamp(part.roofCornerAngle, 90, 65, 90)
  const angleTopScale = roofCornerAngle < 90 ? 1 - (90 - roofCornerAngle) * 0.02 : undefined
  const cabinTopLengthScale = clamp(
    part.cabinTopLengthScale ?? part.cabinTopScale ?? angleTopScale,
    defaults.cabinTopScale,
    0.55,
    1,
  )
  const cabinTopWidthScale = clamp(
    part.cabinTopWidthScale ?? part.cabinTopScale ?? angleTopScale,
    defaults.cabinTopScale,
    0.55,
    1,
  )
  const useTaperedCabin = cabinTopLengthScale < 0.995 || cabinTopWidthScale < 0.995
  const cabinLength = length * defaults.cabinLengthRatio
  const cabinWidth = width * defaults.cabinWidthRatio
  const cabinX = center[0] + length * defaults.cabinXRatio
  const roofHeight = Math.max(bodyHeight * 0.06, 0.024)
  const cabinFrameHeight = Math.max(roofHeight * 1.4, cabinHeight * 0.14)
  const roofLength = cabinLength * cabinTopLengthScale * 0.96
  const roofWidth = cabinWidth * cabinTopWidthScale * 0.94
  const noseLength = style === 'truck' || style === 'van' ? length * 0.18 : length * 0.24
  const tailLength = style === 'sports' ? length * 0.22 : length * 0.18
  const fenderRadius = Math.min(overallHeight * 0.22, width * 0.2)
  const wheelWellRadius = vehicleWheelRadius(part, length, width, overallHeight, style) * 1.08
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'trapezoid-prism',
      name: `${part.name ?? input.name ?? 'object'} vehicle body shell`,
      position: [center[0], bodyY, center[2]],
      length,
      width,
      height: bodyHeight,
      topLengthScale: style === 'van' ? 0.98 : 0.94,
      topWidthScale: style === 'truck' || style === 'suv' ? 0.93 : 0.88,
      cornerRadius: bodyCornerRadius,
      cornerSegments: bodyCornerSegments,
      material: mat,
    },
    {
      kind: 'wedge',
      name: `${part.name ?? input.name ?? 'object'} vehicle rounded front nose`,
      position: [center[0] + length * 0.43, bodyY + bodyHeight * 0.04, center[2]],
      length: noseLength,
      width: width * 0.86,
      height: bodyHeight * 0.46,
      slopeAxis: 'x',
      slopeDirection: 'negative',
      cornerRadius: Math.min(bodyCornerRadius, bodyHeight * 0.18),
      cornerSegments: Math.max(4, bodyCornerSegments - 1),
      material: mat,
    },
    {
      kind: 'wedge',
      name: `${part.name ?? input.name ?? 'object'} vehicle tapered rear quarter`,
      position: [center[0] - length * 0.43, bodyY + bodyHeight * 0.02, center[2]],
      length: tailLength,
      width: width * 0.84,
      height: bodyHeight * 0.4,
      slopeAxis: 'x',
      slopeDirection: 'positive',
      cornerRadius: Math.min(bodyCornerRadius, bodyHeight * 0.15),
      cornerSegments: Math.max(4, bodyCornerSegments - 1),
      material: mat,
    },
    {
      kind: 'wedge',
      name: `${part.name ?? input.name ?? 'object'} vehicle front deck hood surface`,
      position: [center[0] + length * 0.25, deckY, center[2]],
      length: length * 0.36,
      width: width * 0.82,
      height: bodyHeight * 0.1,
      slopeAxis: 'x',
      slopeDirection: 'negative',
      cornerRadius: Math.min(bodyCornerRadius, bodyHeight * 0.08),
      cornerSegments: Math.max(3, bodyCornerSegments - 1),
      material: mat,
    },
    {
      kind: 'wedge',
      name: `${part.name ?? input.name ?? 'object'} vehicle rear deck trunk surface`,
      position: [center[0] - length * 0.35, deckY - bodyHeight * 0.02, center[2]],
      length: length * 0.24,
      width: width * 0.82,
      height: bodyHeight * 0.085,
      slopeAxis: 'x',
      slopeDirection: 'positive',
      cornerRadius: Math.min(bodyCornerRadius, bodyHeight * 0.08),
      cornerSegments: Math.max(3, bodyCornerSegments - 1),
      material: mat,
    },
    {
      kind: useTaperedCabin ? 'trapezoid-prism' : 'box',
      name: `${part.name ?? input.name ?? 'object'} vehicle cabin frame`,
      position: [cabinX, cabinY - cabinHeight * 0.42, center[2]],
      length: cabinLength,
      width: cabinWidth,
      height: cabinFrameHeight,
      cornerRadius: Math.min(bodyCornerRadius, cabinHeight * 0.12),
      cornerSegments: Math.max(3, bodyCornerSegments - 1),
      topLengthScale: cabinTopLengthScale,
      topWidthScale: cabinTopWidthScale,
      material: mat,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} vehicle roof cap`,
      position: [cabinX, cabinY + cabinHeight * 0.5 + roofHeight * 0.18, center[2]],
      length: roofLength,
      width: roofWidth,
      thickness: roofHeight,
      cornerRadius: Math.min(bodyCornerRadius, roofHeight * 0.65),
      cornerSegments: Math.max(3, bodyCornerSegments - 1),
      material: mat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} vehicle rocker shadow`,
      position: [center[0], baseY + overallHeight * 0.2, center[2]],
      length: length * 0.9,
      width: width * 0.86,
      height: bodyHeight * 0.16,
      cornerRadius: bodyHeight * 0.04,
      cornerSegments: 3,
      material: shadowMat,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} vehicle lower front intake`,
      position: [center[0] + length * 0.47, baseY + overallHeight * 0.24, center[2]],
      rotation: [0, Math.PI / 2, 0],
      length: width * 0.52,
      width: bodyHeight * 0.16,
      thickness: Math.max(length * 0.008, 0.016),
      cornerRadius: bodyHeight * 0.055,
      cornerSegments: 4,
      material: shadowMat,
    },
  ]
  const pillarHeight = Math.max(cabinHeight * 0.72, 0.08)
  const pillarY = cabinY + cabinHeight * 0.08
  const pillarWidth = Math.max(width * 0.022, 0.028)
  const pillarLength = Math.max(length * 0.012, 0.032)
  for (const [label, x] of [
    ['A', cabinX + cabinLength * 0.43],
    ['B', cabinX],
    ['C', cabinX - cabinLength * 0.43],
  ] as const) {
    for (const [side, z] of [
      ['left', center[2] - cabinWidth * 0.49],
      ['right', center[2] + cabinWidth * 0.49],
    ] as const) {
      shapes.push({
        kind: 'box',
        name: `${part.name ?? input.name ?? 'object'} vehicle ${label} pillar ${side}`,
        position: [x, pillarY, z],
        length: pillarLength,
        width: pillarWidth,
        height: pillarHeight,
        cornerRadius: pillarWidth * 0.35,
        cornerSegments: 3,
        material: mat,
      })
    }
  }
  for (const [side, z] of [
    ['left', center[2] - roofWidth * 0.52],
    ['right', center[2] + roofWidth * 0.52],
  ] as const) {
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} vehicle roof rail ${side}`,
      position: [cabinX, cabinY + cabinHeight * 0.44, z],
      length: roofLength,
      width: pillarWidth,
      height: roofHeight * 0.9,
      cornerRadius: pillarWidth * 0.35,
      cornerSegments: 3,
      material: mat,
    })
  }
  for (const [side, z] of [
    ['left', center[2] - width * 0.515],
    ['right', center[2] + width * 0.515],
  ] as const) {
    shapes.push({
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} vehicle side character line ${side}`,
      position: [center[0], bodyY + bodyHeight * 0.22, z],
      rotation: [Math.PI / 2, 0, 0],
      length: length * 0.78,
      width: Math.max(bodyHeight * 0.055, 0.02),
      thickness: width * 0.012,
      cornerRadius: bodyHeight * 0.03,
      cornerSegments: 3,
      material: shadowMat,
    })
    shapes.push({
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} vehicle lower sill ${side}`,
      position: [center[0], baseY + overallHeight * 0.28, z],
      rotation: [Math.PI / 2, 0, 0],
      length: length * 0.74,
      width: Math.max(bodyHeight * 0.08, 0.026),
      thickness: width * 0.014,
      cornerRadius: bodyHeight * 0.04,
      cornerSegments: 3,
      material: mat,
    })
    for (const x of [cabinX + cabinLength * 0.43, cabinX - cabinLength * 0.43]) {
      shapes.push({
        kind: 'rounded-panel',
        name: `${part.name ?? input.name ?? 'object'} vehicle door cutline ${side}`,
        position: [x, bodyY + bodyHeight * 0.16, z],
        rotation: [Math.PI / 2, 0, Math.PI / 2],
        length: bodyHeight * 0.48,
        width: Math.max(length * 0.006, 0.012),
        thickness: width * 0.01,
        cornerRadius: bodyHeight * 0.018,
        cornerSegments: 2,
        material: shadowMat,
      })
    }
  }
  if (style === 'truck') {
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} truck cargo bed`,
      position: [center[0] - length * 0.24, deckY - bodyHeight * 0.02, center[2]],
      length: length * 0.42,
      width: width * 0.88,
      height: bodyHeight * 0.2,
      cornerRadius: Math.min(bodyCornerRadius, bodyHeight * 0.06),
      cornerSegments: Math.max(3, bodyCornerSegments - 1),
      material: mat,
    })
  }
  if (input.enhanceVisualDetails === true || input.detail === 'high') {
    for (const x of [-length * 0.36, length * 0.36]) {
      for (const z of [-width * 0.515, width * 0.515]) {
        shapes.push({
          kind: 'rounded-panel',
          name: `${part.name ?? input.name ?? 'object'} vehicle wheel well shadow`,
          position: [center[0] + x, baseY + wheelWellRadius * 1.05, center[2] + z],
          rotation: [Math.PI / 2, 0, 0],
          length: wheelWellRadius * 2.35,
          width: wheelWellRadius * 1.75,
          thickness: width * 0.012,
          cornerRadius: wheelWellRadius * 0.42,
          cornerSegments: 5,
          material: shadowMat,
        })
        shapes.push({
          kind: 'torus',
          name: `${part.name ?? input.name ?? 'object'} vehicle wheel arch lip`,
          position: [center[0] + x, baseY + wheelWellRadius * 1.16, center[2] + z],
          axis: 'z',
          majorRadius: wheelWellRadius,
          tubeRadius: Math.max(width * 0.01, 0.012),
          radialSegments: 8,
          tubularSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.62)),
          scale: [1.16, 0.72, 1],
          material: mat,
        })
        shapes.push({
          kind: 'rounded-panel',
          name: `${part.name ?? input.name ?? 'object'} vehicle fender crown`,
          position: [center[0] + x, baseY + wheelWellRadius * 1.82, center[2] + z],
          rotation: [Math.PI / 2, 0, 0],
          length: fenderRadius * 2.1,
          width: Math.max(fenderRadius * 0.28, 0.028),
          thickness: width * 0.014,
          cornerRadius: fenderRadius * 0.16,
          cornerSegments: 4,
          material: mat,
        })
      }
    }
  }
  return applyPartRotation(shapes, center, part.rotation)
}
export function wheelSetPositions(count: number, length: number, width: number): Vec3[] {
  if (count <= 1) return [[0, 0, 0]]
  if (count === 2)
    return [
      [-length / 2, 0, 0],
      [length / 2, 0, 0],
    ]
  if (count === 3) {
    return [
      [length / 2, 0, 0],
      [-length / 2, 0, -width / 2],
      [-length / 2, 0, width / 2],
    ]
  }
  return [
    [-length / 2, 0, -width / 2],
    [-length / 2, 0, width / 2],
    [length / 2, 0, -width / 2],
    [length / 2, 0, width / 2],
  ]
}

export function isBicycleWheelContext(
  input: PartComposeInput,
  part: PartComposePartInput,
): boolean {
  const text = [
    input.name,
    input.geometryBrief,
    part.kind,
    part.partType,
    part.type,
    part.id,
    part.name,
    part.partName,
    part.semanticRole,
    ...(input.parts ?? []).map(partIdentityText),
  ]
    .map(textOf)
    .join(' ')
  return /bicycle|bike/.test(text)
}

export function isVehicleWheelContext(
  input: PartComposeInput,
  part: PartComposePartInput,
): boolean {
  const text = [
    input.name,
    input.geometryBrief,
    part.kind,
    part.partType,
    part.type,
    part.id,
    part.name,
    part.partName,
    part.semanticRole,
    ...(input.parts ?? []).map(partIdentityText),
  ]
    .map(textOf)
    .join(' ')
  return /vehicle|car|auto|automobile|sedan|suv|truck|van/.test(text)
}

export function wheelTireRole(
  input: PartComposeInput,
  part: PartComposePartInput,
  partName: string,
) {
  const role = normalizedRoleToken(part.semanticRole)
  if (
    role === 'bicycle_tire' ||
    ((role === '' || role === 'wheel' || role === 'wheels' || role === 'bicycle_wheel') &&
      isBicycleWheelContext(input, part))
  ) {
    return 'bicycle_tire'
  }
  if (
    role === 'vehicle_tire' ||
    role === 'vehicle_tires' ||
    role === 'car_tire' ||
    role === 'car_tires' ||
    role === 'vehicle_tyre' ||
    role === 'car_tyre' ||
    ((role === '' || role === 'wheel' || role === 'wheels' || role === 'vehicle_wheel') &&
      isVehicleWheelContext(input, part))
  ) {
    return 'vehicle_tire'
  }
  if (/bicycle|bike/.test(partName)) return 'bicycle_tire'
  if (/vehicle|car|auto/.test(partName)) return 'vehicle_tire'
  return role || 'wheel_tire'
}

export function composeWheelSet(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.16, 0])
  const partName = `${part.name ?? part.partName ?? part.kind ?? ''}`.toLowerCase()
  const tireRole = wheelTireRole(input, part, partName)
  const defaultCount = tireRole === 'bicycle_tire' ? 2 : tireRole === 'vehicle_tire' ? 4 : 4
  const count = clampInt(part.count, defaultCount, 1, 8)
  const length = clamp(part.length, count === 2 ? 0.86 : 0.95, 0, 8)
  const width = clamp(part.width, count >= 4 ? 0.54 : 0, 0, 4)
  const radius = clamp(part.radius ?? part.wheelRadius, count === 2 ? 0.22 : 0.14, 0.025, 1.2)
  const wheelWidth = clamp(part.wheelWidth ?? part.depth, radius * 0.42, 0.012, 0.6)
  const tireMat = partMaterial(part, material(input.darkColor ?? '#111827', 0.72, 0.02))
  const rimMat = material(input.metalColor ?? '#d1d5db', 0.25, 0.75)
  const hubDarkMat = material(input.darkColor ?? '#1f2937', 0.48, 0.36)
  const axis =
    tireRole === 'bicycle_tire' || tireRole === 'vehicle_tire' ? 'z' : partAxis(part.axis, 'z')
  const shapes: PrimitiveShapeInput[] = []
  const tireNamePrefix =
    tireRole === 'vehicle_tire' ? 'vehicle' : tireRole === 'bicycle_tire' ? 'bicycle' : 'wheel'
  const positions = wheelSetPositions(count, length, width)
  positions.forEach((offset, index) => {
    const wheelCenter: Vec3 = [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]]
    const label =
      count === 2
        ? index === 0
          ? 'rear'
          : 'front'
        : count === 3
          ? index === 0
            ? 'nose'
            : `main ${index}`
          : `${index + 1}`
    shapes.push({
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} ${tireNamePrefix} tire ${label}`,
      semanticRole: tireRole,
      sourcePartKind:
        part.sourcePartKind ?? (tireRole === 'bicycle_tire' ? 'bicycle_wheels' : 'wheel_set'),
      position: wheelCenter,
      axis,
      majorRadius: radius,
      tubeRadius: Math.min(radius * 0.22, wheelWidth * 0.42),
      radialSegments: 12,
      tubularSegments: ringSegments(input.detail),
      material: tireMat,
    })
    shapes.push({
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} ${label} wheel rim ring`,
      semanticRole: tireRole === 'bicycle_tire' ? 'bicycle_rim' : 'wheel_rim',
      sourcePartKind:
        part.sourcePartKind ?? (tireRole === 'bicycle_tire' ? 'bicycle_wheels' : 'wheel_set'),
      position: wheelCenter,
      axis,
      majorRadius: radius * 0.55,
      tubeRadius: Math.max(radius * 0.045, wheelWidth * 0.06),
      radialSegments: 8,
      tubularSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.55)),
      material: rimMat,
    })
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} ${label} wheel hub`,
      semanticRole: tireRole === 'bicycle_tire' ? 'bicycle_hub' : 'wheel_hub',
      sourcePartKind:
        part.sourcePartKind ?? (tireRole === 'bicycle_tire' ? 'bicycle_wheels' : 'wheel_set'),
      position: wheelCenter,
      axis,
      radius: radius * 0.45,
      height: wheelWidth * 0.35,
      radialSegments: 20,
      material: rimMat,
    })
    if (input.detail === 'high' || input.enhanceVisualDetails === true) {
      const spokeCount = tireRole === 'bicycle_tire' ? 8 : 5
      for (let spoke = 0; spoke < spokeCount; spoke += 1) {
        const angle = angularStep(spoke, spokeCount)
        const spokeLength = radius * 0.58
        shapes.push({
          kind: 'capsule',
          name: `${part.name ?? input.name ?? 'object'} ${label} wheel spoke ${spoke + 1}`,
          semanticRole: tireRole === 'bicycle_tire' ? 'bicycle_spoke' : 'wheel_spoke',
          sourcePartKind:
            part.sourcePartKind ?? (tireRole === 'bicycle_tire' ? 'bicycle_wheels' : 'wheel_set'),
          position: [
            wheelCenter[0] + Math.cos(angle) * radius * 0.28,
            wheelCenter[1] + Math.sin(angle) * radius * 0.28,
            wheelCenter[2],
          ],
          rotation: [0, 0, angle],
          axis: 'x',
          radius: Math.max(radius * 0.018, 0.004),
          height: spokeLength,
          radialSegments: 8,
          capSegments: 2,
          material: hubDarkMat,
        })
      }
    }
  })
  if (axis === 'z' && count >= 4) {
    const axleXs = Array.from(new Set(positions.map((position) => Number(position[0].toFixed(4)))))
    for (const x of axleXs) {
      shapes.push({
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} wheel axle`,
        semanticRole: 'wheel_axle',
        sourcePartKind: part.sourcePartKind ?? 'wheel_set',
        position: [center[0] + x, center[1], center[2]],
        axis: 'z',
        radius: radius * 0.12,
        height: width + wheelWidth * 1.2,
        radialSegments: 16,
        material: hubDarkMat,
      })
    }
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeWindowPanel(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.55, 0])
  const length = clamp(part.length ?? part.width, 0.32, 0.02, 4)
  const height = clamp(part.height, 0.18, 0.015, 2)
  const thickness = clamp(part.thickness ?? part.depth, 0.01, 0.002, 0.12)
  const glass = partMaterial(
    part,
    material(part.accentColor ?? input.accentColor ?? '#38bdf8', 0.12, 0.02, 0.58),
  )
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'rounded-panel',
      name: part.name ?? `${input.name ?? 'object'} glass panel`,
      semanticRole: part.semanticRole ?? 'window_panel',
      sourcePartKind: part.sourcePartKind ?? 'window_panel',
      position: center,
      rotation: part.rotation,
      length,
      width: height,
      thickness,
      cornerRadius: clamp(
        part.cornerRadius,
        Math.min(length, height) * 0.16,
        0,
        Math.min(length, height) * 0.45,
      ),
      cornerSegments: clampInt(part.cornerSegments, 4, 1, 12),
      material: glass,
    },
  ]
  return shapes
}

export function composeWindowStrip(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  if (
    part.vehicleStyle ||
    part.style === 'vehicle_glasshouse' ||
    part.variant === 'vehicle_glasshouse'
  ) {
    return composeVehicleWindows(input, part, origin)
  }
  const center = add(origin, part.position ?? [0, 0.65, 0.02])
  const count = clampInt(part.count, 8, 2, 60)
  const length = clamp(part.length, 1.2, 0.08, 12)
  const panelWidth = clamp(part.width, Math.min(0.12, length / Math.max(count * 1.6, 1)), 0.01, 0.8)
  const height = clamp(part.height, panelWidth * 0.72, 0.01, 0.5)
  const spacing = count <= 1 ? 0 : length / Math.max(count - 1, 1)
  const shapes: PrimitiveShapeInput[] = []
  for (let i = 0; i < count; i += 1) {
    shapes.push(
      ...composeWindowPanel(
        input,
        {
          ...part,
          name: `${part.name ?? input.name ?? 'object'} window ${i + 1}`,
          semanticRole: part.semanticRole ?? 'window_panel',
          sourcePartKind: part.sourcePartKind ?? 'window_strip',
          position: [center[0] - length / 2 + i * spacing, center[1], center[2]],
          length: panelWidth,
          height,
        },
        origin,
      ),
    )
  }
  return shapes
}

export function composeVehicleWheels(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  return composeWheelSet(input, { semanticRole: 'vehicle_tire', ...part }, origin)
}

export function composeVehicleWindows(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const style = vehicleStyleFor(input, part)
  const defaults = VEHICLE_STYLE_DEFAULTS[style]
  const center = add(origin, part.position ?? [0, 0.55, 0])
  const length = clamp(part.length, 0.5, 0.1, 2)
  const width = clamp(part.width, 0.52, 0.08, 1.8)
  const height = clamp(part.height, 0.12, 0.03, 0.6)
  const glass = partMaterial(
    part,
    material(part.accentColor ?? input.accentColor ?? '#1e3a8a', 0.18, 0.02, 0.68),
  )
  const trim = material(input.darkColor ?? '#0f172a', 0.42, 0.12)
  const glasshouseTopScale = clamp(part.cabinTopScale, defaults.cabinTopScale, 0.55, 1)
  const sideWindowLength = length * (style === 'sports' ? 0.58 : 0.66)
  const sidePanelLength = sideWindowLength * 0.43
  const quarterPanelLength = length * 0.16
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'trapezoid-prism',
      name: `${part.name ?? input.name ?? 'object'} integrated vehicle glasshouse`,
      semanticRole: part.semanticRole ?? 'vehicle_window',
      sourcePartKind: part.sourcePartKind ?? 'window_strip',
      position: [center[0], center[1] + height * 0.1, center[2]],
      length: length * 0.72,
      width: width * 0.76,
      height: height * 0.82,
      topLengthScale: glasshouseTopScale,
      topWidthScale: Math.min(0.92, glasshouseTopScale + 0.04),
      material: glass,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} windshield`,
      semanticRole: part.semanticRole ?? 'vehicle_window',
      sourcePartKind: part.sourcePartKind ?? 'window_strip',
      position: [center[0] + length * 0.42, center[1] + height * 0.1, center[2]],
      rotation: [0, 0, Math.PI / 2 - 0.22],
      length: height * 1.02,
      width: width * 0.46,
      thickness: 0.01,
      cornerRadius: height * 0.12,
      cornerSegments: 4,
      material: glass,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} rear window`,
      semanticRole: part.semanticRole ?? 'vehicle_window',
      sourcePartKind: part.sourcePartKind ?? 'window_strip',
      position: [center[0] - length * 0.42, center[1] + height * 0.1, center[2]],
      rotation: [0, 0, Math.PI / 2 + 0.18],
      length: height * 0.96,
      width: width * 0.44,
      thickness: 0.01,
      cornerRadius: height * 0.12,
      cornerSegments: 4,
      material: glass,
    },
  ]
  for (const side of [-1, 1]) {
    for (const [label, x] of [
      ['front', center[0] + length * 0.14],
      ['rear', center[0] - length * 0.15],
    ] as const) {
      shapes.push({
        kind: 'rounded-panel',
        name: `${part.name ?? input.name ?? 'object'} ${label} side window ${
          side < 0 ? 'left' : 'right'
        }`,
        semanticRole: part.semanticRole ?? 'vehicle_window',
        sourcePartKind: part.sourcePartKind ?? 'window_strip',
        position: [x, center[1] + height * 0.1, center[2] + side * width * 0.505],
        rotation: [Math.PI / 2, 0, 0],
        length: sidePanelLength,
        width: height * 0.82,
        thickness: 0.01,
        cornerRadius: height * 0.12,
        cornerSegments: 4,
        material: glass,
      })
    }
    shapes.push({
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} rear quarter window ${side < 0 ? 'left' : 'right'}`,
      semanticRole: part.semanticRole ?? 'vehicle_window',
      sourcePartKind: part.sourcePartKind ?? 'window_strip',
      position: [
        center[0] - length * 0.26,
        center[1] + height * 0.06,
        center[2] + side * width * 0.51,
      ],
      rotation: [Math.PI / 2, 0, 0],
      length: quarterPanelLength,
      width: height * 0.72,
      thickness: 0.01,
      cornerRadius: height * 0.11,
      cornerSegments: 4,
      material: glass,
    })
    for (const x of [center[0] - length * 0.01, center[0] - length * 0.3]) {
      shapes.push({
        kind: 'rounded-panel',
        name: `${part.name ?? input.name ?? 'object'} side window divider ${
          side < 0 ? 'left' : 'right'
        }`,
        sourcePartKind: part.sourcePartKind ?? 'window_strip',
        position: [x, center[1] + height * 0.1, center[2] + side * width * 0.512],
        rotation: [Math.PI / 2, 0, Math.PI / 2],
        length: height * 0.86,
        width: Math.max(length * 0.01, 0.012),
        thickness: 0.012,
        cornerRadius: height * 0.04,
        cornerSegments: 2,
        material: trim,
      })
    }
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeHeadlights(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0.62, 0.34, 0])
  const width = clamp(part.width, 0.5, 0.08, 2)
  const radius = clamp(part.radius, 0.035, 0.008, 0.16)
  const lightMat = partMaterial(part, material('#fde68a', 0.2, 0.02, 0.86))
  return [-1, 1].map(
    (side): PrimitiveShapeInput => ({
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} ${side < 0 ? 'left' : 'right'} headlight`,
      semanticRole: part.semanticRole ?? 'headlight',
      sourcePartKind: part.sourcePartKind ?? 'light_pair',
      position: [center[0], center[1], center[2] + side * width * 0.34],
      radius,
      scale: [0.55, 0.75, 1],
      material: lightMat,
    }),
  )
}

export function composeBumper(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0.66, 0.24, 0])
  const width = clamp(part.width ?? part.length, 0.56, 0.08, 2.5)
  const height = clamp(part.height, 0.045, 0.01, 0.2)
  const bumperMat = partMaterial(part, material(input.darkColor ?? '#1f2937', 0.48, 0.25))
  const makeBar = (name: string, position: Vec3): PrimitiveShapeInput => ({
    kind: 'box',
    name,
    position,
    length: height,
    width,
    height,
    cornerRadius: height * 0.35,
    cornerSegments: 4,
    material: bumperMat,
  })
  const side = partSide(part.side)
  const shapes: PrimitiveShapeInput[] = []

  if (!side || side === 'front') {
    shapes.push(makeBar(`${part.name ?? input.name ?? 'object'} front bumper bar`, center))
  }
  if (!side || side === 'back') {
    shapes.push(
      makeBar(`${part.name ?? input.name ?? 'object'} rear bumper bar`, [
        center[0] - Math.abs(center[0]) * 2,
        center[1],
        center[2],
      ]),
    )
  }

  return shapes
}
