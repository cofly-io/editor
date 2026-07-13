import {
  angularStep,
  radialExtrudeRotationInHorizontalPlane,
  radialExtrudeRotationInLocalPlane,
} from '../../orientation-utils'
import {
  add,
  applyPartRotation,
  clamp,
  clampInt,
  material,
  partMaterial,
  radialPoint,
  ringSegments,
  textOf,
} from '../shared'
import type {
  PartComposeDetail,
  PartComposeInput,
  PartComposePartInput,
  PrimitiveShapeInput,
  Vec3,
} from '../types'

export function composeCircularBase(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
  index: number,
): PrimitiveShapeInput[] {
  const radius = clamp(part.radius, 0.28, 0.05, 2)
  const height = clamp(part.height ?? part.depth, 0.08, 0.01, 0.4)
  const center = add(origin, part.position ?? [0, height / 2, 0])
  return [
    {
      kind: 'cylinder',
      name: part.name ?? `${input.name ?? 'object'} circular base ${index + 1}`,
      position: center,
      axis: 'y',
      radius,
      height,
      radialSegments: ringSegments(input.detail),
      material: partMaterial(part, material(input.darkColor ?? '#24262b', 0.72, 0.18)),
    },
  ]
}

export function composeVerticalPole(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
  index: number,
): PrimitiveShapeInput[] {
  const radius = clamp(part.radius, 0.025, 0.005, 2)
  const height = clamp(part.height ?? part.length, 1, 0.05, 50)
  const center = add(origin, part.position ?? [0, height / 2 + 0.08, 0])
  return [
    {
      kind: 'cylinder',
      name: part.name ?? `${input.name ?? 'object'} vertical pole ${index + 1}`,
      position: center,
      axis: 'y',
      radius,
      height,
      radialSegments: 24,
      material: partMaterial(part, material(input.metalColor ?? '#b9bec7', 0.32, 0.68)),
    },
  ]
}

export function composeMotorHousing(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
  index: number,
): PrimitiveShapeInput[] {
  const radius = clamp(part.radius, 0.11, 0.03, 0.5)
  const depth = clamp(part.depth ?? part.length ?? part.height, 0.16, 0.03, 0.8)
  const center = add(origin, part.position ?? [0, 1.18, -depth * 0.15])
  const body = partMaterial(part, material(input.darkColor ?? '#30343b', 0.56, 0.25))
  return [
    {
      kind: 'cylinder',
      name: part.name ?? `${input.name ?? 'object'} motor housing ${index + 1}`,
      position: center,
      axis: 'z',
      radius,
      height: depth,
      radialSegments: ringSegments(input.detail),
      material: body,
    },
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} rear motor dome`,
      position: [center[0], center[1], center[2] - depth * 0.48],
      radius: 1,
      scale: [radius * 0.95, radius * 0.95, depth * 0.32],
      widthSegments: ringSegments(input.detail),
      heightSegments: Math.max(16, Math.round(ringSegments(input.detail) * 0.5)),
      material: body,
    },
  ]
}

export function composeRadialBlades(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 1.18, 0.04])
  const count = clampInt(part.count, 3, 2, 8)
  const radius = clamp(part.bladeRadius ?? part.radius, 0.28, 0.05, 1.4)
  const bladeWidth = clamp(
    part.bladeWidth ?? part.width,
    radius * 0.26,
    radius * 0.08,
    radius * 0.55,
  )
  const pitch = clamp(part.bladePitch, 0.24, -0.65, 0.65)
  const sweep = clamp(part.bladeSweep, bladeWidth * 0.32, -bladeWidth, bladeWidth)
  const bladeLength = radius * 0.78
  const rootRadius = radius * 0.18
  const bladeCenterRadius = rootRadius + bladeLength / 2
  const bladeDepth = clamp(part.depth ?? part.height, 0.018, 0.004, 0.08)
  const rootWidth = bladeWidth * 0.42
  const bladeMat = partMaterial(part, material(input.accentColor ?? '#8ec5ff', 0.42, 0.02, 0.82))
  const rootMat = material(input.darkColor ?? '#25272c', 0.48, 0.35)
  const shapes: PrimitiveShapeInput[] = []
  const profile: [number, number][] = [
    [0, -rootWidth * 0.5],
    [bladeLength * 0.16, -bladeWidth * 0.42 + sweep * 0.12],
    [bladeLength * 0.52, -bladeWidth * 0.55 + sweep * 0.38],
    [bladeLength * 0.94, -bladeWidth * 0.25 + sweep],
    [bladeLength, bladeWidth * 0.08 + sweep * 0.92],
    [bladeLength * 0.72, bladeWidth * 0.44 + sweep * 0.46],
    [bladeLength * 0.26, bladeWidth * 0.36 + sweep * 0.14],
    [0, rootWidth * 0.5],
  ]

  for (let i = 0; i < count; i += 1) {
    const angle = angularStep(i, count, -Math.PI / 2)
    shapes.push({
      kind: 'extrude',
      name: `${part.name ?? input.name ?? 'object'} blade ${i + 1}`,
      position: radialPoint(
        center,
        angle,
        bladeCenterRadius,
        Math.sin(i * 1.7) * bladeDepth * 0.25,
      ),
      rotation: radialExtrudeRotationInLocalPlane(angle, pitch),
      profile,
      depth: bladeDepth,
      bevelSize: bladeDepth * 0.16,
      bevelThickness: bladeDepth * 0.18,
      bevelSegments: 2,
      curveSegments: 10,
      material: bladeMat,
    })
    shapes.push({
      kind: 'capsule',
      name: `${part.name ?? input.name ?? 'object'} blade root ${i + 1}`,
      position: radialPoint(center, angle, rootRadius * 0.82, -bladeDepth * 0.08),
      rotation: [0, 0, angle],
      axis: 'x',
      radius: rootWidth * 0.22,
      height: rootRadius * 1.2,
      capSegments: 4,
      radialSegments: 16,
      material: rootMat,
    })
  }

  shapes.push({
    kind: 'cylinder',
    name: `${part.name ?? input.name ?? 'object'} blade hub`,
    position: center,
    axis: 'z',
    radius: radius * 0.16,
    height: clamp(part.depth, 0.055, 0.015, 0.2),
    radialSegments: 32,
    material: rootMat,
  })

  return shapes
}

export function composeFanBladeArray(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 1.18, 0.04])
  const count = clampInt(part.count ?? part.aroundCount, 1, 1, 16)
  const bladeLength = clamp(part.length ?? part.bladeRadius ?? part.radius, 0.24, 0.04, 1.2)
  const bladeWidth = clamp(
    part.bladeWidth ?? part.width,
    bladeLength * 0.26,
    bladeLength * 0.06,
    bladeLength * 0.55,
  )
  const thickness = clamp(part.thickness ?? part.depth ?? part.height, 0.018, 0.003, 0.08)
  const pitch = clamp(part.pitch ?? part.bladePitch, 0.24, -0.8, 0.8)
  const sweep = clamp(part.bladeSweep, bladeWidth * 0.32, -bladeWidth, bladeWidth)
  const hubRadius = clamp(part.wireRadius, bladeLength * 0.22, 0.01, bladeLength * 0.45)
  const rootWidth = clamp(part.rootWidth, bladeWidth * 0.42, bladeWidth * 0.16, bladeWidth)
  const profile: [number, number][] = [
    [0, -rootWidth * 0.5],
    [bladeLength * 0.18, -bladeWidth * 0.42 + sweep * 0.12],
    [bladeLength * 0.54, -bladeWidth * 0.55 + sweep * 0.38],
    [bladeLength * 0.96, -bladeWidth * 0.25 + sweep],
    [bladeLength, bladeWidth * 0.08 + sweep * 0.92],
    [bladeLength * 0.72, bladeWidth * 0.44 + sweep * 0.46],
    [bladeLength * 0.24, bladeWidth * 0.36 + sweep * 0.14],
    [0, rootWidth * 0.5],
  ]
  const mat = partMaterial(
    part,
    material(
      part.primaryColor ?? input.accentColor ?? input.primaryColor ?? '#8ec5ff',
      0.42,
      0.05,
      0.86,
    ),
  )
  const hubMat = material(input.darkColor ?? '#25272c', 0.48, 0.35)
  const radialCenter = hubRadius + bladeLength * 0.5
  const baseId = part.id ?? part.name ?? part.partName ?? 'fan_blade'
  const shapes: PrimitiveShapeInput[] = []

  for (let index = 0; index < count; index += 1) {
    const angle = part.aroundAngle ?? angularStep(index, count, -Math.PI / 2)
    shapes.push({
      kind: 'extrude',
      name: `${part.name ?? input.name ?? 'object'} fan blade ${index + 1}`,
      semanticRole: part.semanticRole ?? 'fan_blade',
      semanticGroup: part.semanticGroup ?? 'fan_blades',
      sourcePartKind: part.sourcePartKind ?? 'fan_blade',
      sourcePartId: count > 1 ? `${baseId}_${index + 1}` : baseId,
      editableHints: {
        primaryDimension: 'length',
        canScale: ['primary', 'length', 'width', 'thickness'],
        minFactor: 0.35,
        maxFactor: 2.2,
      },
      position: radialPoint(center, angle, radialCenter, Math.sin(index * 1.7) * thickness * 0.2),
      rotation: radialExtrudeRotationInLocalPlane(angle, pitch),
      profile,
      depth: thickness,
      bevelSize: thickness * 0.16,
      bevelThickness: thickness * 0.18,
      bevelSegments: 2,
      curveSegments: 10,
      material: mat,
    })
  }

  if (part.includeHub !== false && count > 1) {
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} fan blade hub`,
      semanticRole: 'fan_hub',
      semanticGroup: part.semanticGroup ?? 'fan_blades',
      sourcePartKind: part.sourcePartKind ?? 'fan_blade',
      sourcePartId: `${baseId}_hub`,
      position: center,
      axis: 'z',
      radius: hubRadius,
      height: Math.max(thickness * 2.4, 0.045),
      radialSegments: 32,
      material: hubMat,
    })
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeProtectiveGrill(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const detailLevel = partDetailLevel(input, part)
  const segmentDetail =
    detailLevel === 'high' ? 'high' : detailLevel === 'low' ? 'low' : input.detail
  const defaultRingCount = detailLevel === 'high' ? 5 : detailLevel === 'low' ? 3 : 4
  const defaultSpokeCount = detailLevel === 'high' ? 24 : detailLevel === 'low' ? 12 : 18
  const center = add(origin, part.position ?? [0, 1.18, 0.04])
  const radius = clamp(part.radius, 0.36, 0.08, 2)
  const cageDepth = clamp(part.depth, 0.12, 0.005, 0.6)
  const domeDepth = clamp(part.domeDepth, cageDepth * 0.72, 0.005, radius * 0.85)
  const ringCount = clampInt(part.ringCount ?? part.count, defaultRingCount, 1, 8)
  const spokeCount = clampInt(part.spokeCount, defaultSpokeCount, 6, 36)
  const wireRadius = clamp(part.wireRadius, radius * 0.018, 0.002, 0.05)
  const grillMat = partMaterial(part, material(input.metalColor ?? '#d1d5db', 0.38, 0.62))
  const shapes: PrimitiveShapeInput[] = []
  const frontZForRatio = (ratio: number) => center[2] + domeDepth * (1 - ratio * ratio)
  const ringTubularSegments = ringSegments(segmentDetail)
  const ringRadialSegments = Math.max(12, Math.round(ringTubularSegments * 0.35))

  for (let i = 0; i < ringCount; i += 1) {
    const ratio = ringCount === 1 ? 1 : 0.22 + (i / (ringCount - 1)) * 0.78
    shapes.push({
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} grill front ring ${i + 1}`,
      position: [center[0], center[1], frontZForRatio(ratio)],
      axis: 'z',
      majorRadius: radius * ratio,
      tubeRadius: wireRadius,
      radialSegments: ringRadialSegments,
      tubularSegments: ringTubularSegments,
      material: grillMat,
    })
  }

  shapes.push(
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} grill rear outer ring`,
      position: [center[0], center[1], center[2] - cageDepth],
      axis: 'z',
      majorRadius: radius,
      tubeRadius: wireRadius,
      radialSegments: ringRadialSegments,
      tubularSegments: ringTubularSegments,
      material: grillMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} grill center cap`,
      position: [center[0], center[1], frontZForRatio(0.08) + wireRadius * 0.4],
      axis: 'z',
      radius: radius * 0.13,
      height: wireRadius * 2.2,
      radialSegments: Math.max(24, Math.round(ringTubularSegments * 0.6)),
      material: grillMat,
    },
  )

  if (detailLevel !== 'low') {
    shapes.splice(shapes.length - 1, 0, {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} grill rear inner support ring`,
      position: [center[0], center[1], center[2] - cageDepth * 0.82],
      axis: 'z',
      majorRadius: radius * 0.42,
      tubeRadius: wireRadius * 0.82,
      radialSegments: ringRadialSegments,
      tubularSegments: Math.max(24, Math.round(ringTubularSegments * 0.75)),
      material: grillMat,
    })
  }

  const innerRatio = 0.12
  const spokeStartZ = frontZForRatio(innerRatio)
  const spokeEndZ = frontZForRatio(1)
  const spokeRadialLength = radius * (1 - innerRatio)
  const spokeDepth = spokeStartZ - spokeEndZ
  const spokeLength = Math.hypot(spokeRadialLength, spokeDepth)
  const spokeTilt = -Math.atan2(spokeDepth, spokeRadialLength)
  const spokeMidRadius = radius * (innerRatio + (1 - innerRatio) / 2)
  const spokeMidZ = (spokeStartZ + spokeEndZ) / 2

  for (let i = 0; i < spokeCount; i += 1) {
    const angle = angularStep(i, spokeCount)
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} grill spoke ${i + 1}`,
      position: [center[0] + dx * spokeMidRadius, center[1] + dy * spokeMidRadius, spokeMidZ],
      rotation: [0, spokeTilt, angle],
      axis: 'x',
      radius: wireRadius * 0.72,
      height: spokeLength,
      radialSegments: 8,
      material: grillMat,
    })
  }

  const sideRibCount =
    detailLevel === 'high'
      ? Math.max(12, Math.min(18, Math.round(spokeCount / 2)))
      : Math.max(6, Math.min(12, Math.round(spokeCount / 2)))
  for (let i = 0; i < sideRibCount; i += 1) {
    const angle = angularStep(i, sideRibCount)
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} grill side rib ${i + 1}`,
      position: [center[0] + dx * radius, center[1] + dy * radius, center[2] - cageDepth / 2],
      axis: 'z',
      radius: wireRadius * 0.75,
      height: cageDepth,
      radialSegments: 8,
      material: grillMat,
    })
  }

  return shapes
}

export function partDetailLevel(
  input: PartComposeInput,
  part: PartComposePartInput,
): PartComposeDetail {
  const raw =
    `${part.detailLevel ?? part.grillDetailLevel ?? part.detail ?? input.detail ?? ''}`.toLowerCase()
  if (/(low|simple|coarse|light|\u4f4e|\u7b80)/i.test(raw)) return 'low'
  if (/(high|fine|detailed|dense|\u9ad8|\u7ec6|\u5bc6)/i.test(raw)) return 'high'
  return 'medium'
}

export function detailDefaultInt(
  input: PartComposeInput,
  part: PartComposePartInput,
  values: Record<PartComposeDetail, number>,
): number {
  return values[partDetailLevel(input, part)]
}

export function detailSegmentLevel(
  input: PartComposeInput,
  part: PartComposePartInput,
): PartComposeDetail {
  const detailLevel = partDetailLevel(input, part)
  if (detailLevel !== 'medium') return detailLevel
  const raw = `${input.detail ?? ''}`.toLowerCase()
  if (/(low|simple|coarse|light|\u4f4e|\u7b80)/i.test(raw)) return 'low'
  if (/(high|fine|detailed|dense|\u9ad8|\u7ec6|\u5bc6)/i.test(raw)) return 'high'
  return 'medium'
}

export function composePyramid(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length ?? part.width ?? part.diameter, 0.6, 0.02, 20)
  const width = clamp(part.width ?? part.length ?? part.diameter, length, 0.02, 20)
  const height = clamp(part.height ?? part.depth, 0.8, 0.02, 20)
  const requestedRadius = part.radius ?? (part.diameter != null ? part.diameter / 2 : undefined)
  const radius = clamp(requestedRadius, Math.max(length, width) / 2, 0.01, 20)
  const center = add(origin, part.position ?? [0, height / 2, 0])
  const scale: Vec3 = [length / (radius * 2), 1, width / (radius * 2)]
  const topScale = pyramidTopScale(part, length, width)
  const isTruncated = part.truncated === true || topScale != null || part.topRadius != null
  const topRadius = isTruncated
    ? clamp(part.topRadius, radius * (topScale ?? 0.35), 0.005, radius * 0.98)
    : 0

  // Three.js CylinderGeometry with 4 segments places the first vertex at +X,
  // making edges face front/back/left/right (diamond orientation).
  // Rotating 45° (π/4) around Y makes the flat faces front-facing (correct pyramid look).
  const pyramidRotation: Vec3 = part.rotation
    ? [part.rotation[0], (part.rotation[1] ?? 0) + Math.PI / 4, part.rotation[2]]
    : [0, Math.PI / 4, 0]

  return [
    {
      kind: isTruncated ? 'frustum' : 'cone',
      name: `${part.name ?? input.name ?? 'object'} pyramid`,
      semanticRole: part.semanticRole ?? 'pyramid',
      sourcePartKind: part.sourcePartKind ?? 'pyramid',
      position: center,
      rotation: pyramidRotation,
      axis: part.axis ?? 'y',
      ...(isTruncated ? { radiusBottom: radius, radiusTop: topRadius } : { radius }),
      height,
      scale,
      radialSegments: 4,
      material: partMaterial(part, material(input.primaryColor ?? '#c08457', 0.56, 0.18)),
    },
  ]
}

export function composeHemisphere(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const diameter = part.diameter ?? (part.radius != null ? part.radius * 2 : undefined)
  const length = clamp(part.length ?? diameter, 1, 0.02, 20)
  const width = clamp(part.width ?? part.depth ?? diameter, length, 0.02, 20)
  const radius = clamp(
    part.radius ?? (part.diameter != null ? part.diameter / 2 : undefined),
    0.5,
    0.01,
    10,
  )
  const height = clamp(part.height, radius, 0.01, 10)
  const center = add(origin, part.position ?? [0, height / 2, 0])
  const scale: Vec3 = part.scale ?? [length / (radius * 2), height / radius, width / (radius * 2)]

  return applyPartRotation(
    [
      {
        kind: 'hemisphere',
        name: `${part.name ?? input.name ?? 'object'} hemisphere`,
        semanticRole: part.semanticRole ?? 'hemisphere',
        sourcePartKind: part.sourcePartKind ?? 'hemisphere',
        position: center,
        radius,
        scale,
        widthSegments: clampInt(part.widthSegments, input.detail === 'high' ? 48 : 32, 8, 64),
        heightSegments: clampInt(part.heightSegments, input.detail === 'high' ? 20 : 16, 4, 32),
        material: partMaterial(part, material(input.primaryColor ?? '#94a3b8', 0.42, 0.2)),
      },
    ],
    center,
    part.rotation,
  )
}

export function pyramidTopScale(
  part: PartComposePartInput,
  length: number,
  width: number,
): number | undefined {
  if (typeof part.topScale === 'number' && Number.isFinite(part.topScale)) {
    return clamp(part.topScale, 0.35, 0.02, 0.95)
  }
  if (Array.isArray(part.topScale)) {
    const [xScale, zScale] = part.topScale
    const scales = [xScale, zScale].filter(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
    if (scales.length > 0) {
      return clamp(scales.reduce((sum, value) => sum + value, 0) / scales.length, 0.35, 0.02, 0.95)
    }
  }

  const lengthScale =
    typeof part.topLength === 'number' && Number.isFinite(part.topLength)
      ? part.topLength / length
      : undefined
  const widthScale =
    typeof part.topWidth === 'number' && Number.isFinite(part.topWidth)
      ? part.topWidth / width
      : undefined
  const scales = [lengthScale, widthScale].filter((value): value is number => value != null)
  if (scales.length === 0) return undefined
  return clamp(scales.reduce((sum, value) => sum + value, 0) / scales.length, 0.35, 0.02, 0.95)
}

export function composeSupportBracket(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 1.08, -0.02])
  const width = clamp(part.width ?? part.length, 0.26, 0.04, 1)
  const height = clamp(part.height, 0.18, 0.04, 0.8)
  const depth = clamp(part.depth, 0.05, 0.01, 0.3)
  const r = clamp(part.radius ?? part.wireRadius, 0.018, 0.004, 0.08)
  const bracketMat = partMaterial(part, material(input.metalColor ?? '#9ca3af', 0.34, 0.72))
  return [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} bracket left arm`,
      position: [center[0] - width / 2, center[1] + height / 2, center[2]],
      axis: 'y',
      radius: r,
      height,
      radialSegments: 16,
      material: bracketMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} bracket right arm`,
      position: [center[0] + width / 2, center[1] + height / 2, center[2]],
      axis: 'y',
      radius: r,
      height,
      radialSegments: 16,
      material: bracketMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} bracket crossbar`,
      position: [center[0], center[1], center[2]],
      axis: 'x',
      radius: r,
      height: width,
      radialSegments: 16,
      material: bracketMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} bracket neck block`,
      position: [center[0], center[1] - depth * 0.2, center[2]],
      length: width * 0.32,
      width: depth,
      height: depth,
      cornerRadius: depth * 0.2,
      cornerSegments: 4,
      material: bracketMat,
    },
  ]
}

export function composeControlKnob(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
  index: number,
): PrimitiveShapeInput[] {
  const radius = clamp(part.radius, 0.035, 0.005, 0.2)
  const depth = clamp(part.depth ?? part.height, 0.025, 0.005, 0.15)
  const center = add(origin, part.position ?? [0.12, 1.18, -0.04])
  return [
    {
      kind: 'cylinder',
      name: part.name ?? `${input.name ?? 'object'} control knob ${index + 1}`,
      position: center,
      axis: 'x',
      radius,
      height: depth,
      radialSegments: 24,
      material: partMaterial(part, material(input.darkColor ?? '#25272c', 0.5, 0.2)),
    },
  ]
}

export function composeVentSlats(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
  kind: 'vent_slats' | 'vent_grill' = 'vent_slats',
): PrimitiveShapeInput[] {
  const detailLevel = partDetailLevel(input, part)
  const center = add(origin, part.position ?? [0, 0.5, 0.02])
  const defaultCount =
    kind === 'vent_grill'
      ? detailDefaultInt(input, part, { low: 5, medium: 8, high: 12 })
      : detailDefaultInt(input, part, { low: 4, medium: 6, high: 10 })
  const count = clampInt(part.slatCount ?? part.count, defaultCount, 2, 20)
  const width = clamp(part.width ?? part.length, 0.5, 0.05, 3)
  const height = clamp(part.height, 0.018, 0.004, 0.08)
  const spacing = clamp(part.depth, 0.055, 0.01, 0.3)
  const panelHeight = Math.max(height * 2.4, spacing * (count - 1) + height * 2.4)
  const frameWidth = clamp(
    part.wireRadius ?? part.thickness,
    Math.min(width, panelHeight) * 0.035,
    0.004,
    0.08,
  )
  const panelDepth = clamp(part.thickness ?? part.wireRadius, height * 0.7, 0.003, 0.08)
  const slatMat = partMaterial(part, material(input.darkColor ?? '#4b5563', 0.62, 0.08))
  const frameMat = material(input.metalColor ?? '#9ca3af', 0.42, 0.48)
  const recessMat = material(input.darkColor ?? '#111827', 0.7, 0.04)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} vent recess panel`,
      position: [center[0], center[1], center[2] - panelDepth * 0.45],
      length: width + frameWidth * 2.4,
      width: panelHeight + frameWidth * 2.2,
      thickness: panelDepth,
      cornerRadius: frameWidth * 1.2,
      cornerSegments: detailLevel === 'high' ? 4 : detailLevel === 'low' ? 1 : 3,
      material: recessMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} vent top frame`,
      position: [center[0], center[1] + panelHeight / 2 + frameWidth / 2, center[2]],
      length: width + frameWidth * 2,
      width: frameWidth,
      height: frameWidth,
      cornerRadius: frameWidth * 0.25,
      cornerSegments: detailLevel === 'low' ? 1 : 3,
      material: frameMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} vent bottom frame`,
      position: [center[0], center[1] - panelHeight / 2 - frameWidth / 2, center[2]],
      length: width + frameWidth * 2,
      width: frameWidth,
      height: frameWidth,
      cornerRadius: frameWidth * 0.25,
      cornerSegments: detailLevel === 'low' ? 1 : 3,
      material: frameMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} vent left frame`,
      position: [center[0] - width / 2 - frameWidth / 2, center[1], center[2]],
      length: frameWidth,
      width: frameWidth,
      height: panelHeight,
      cornerRadius: frameWidth * 0.25,
      cornerSegments: detailLevel === 'low' ? 1 : 3,
      material: frameMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} vent right frame`,
      position: [center[0] + width / 2 + frameWidth / 2, center[1], center[2]],
      length: frameWidth,
      width: frameWidth,
      height: panelHeight,
      cornerRadius: frameWidth * 0.25,
      cornerSegments: detailLevel === 'low' ? 1 : 3,
      material: frameMat,
    },
  ]
  for (let i = 0; i < count; i += 1) {
    const y = center[1] + (i - (count - 1) / 2) * spacing
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} vent slat ${i + 1}`,
      position: [center[0], y, center[2] + panelDepth * 0.15],
      rotation: [0, 0, 0],
      length: width,
      width: height,
      height,
      cornerRadius: height * 0.3,
      cornerSegments: detailLevel === 'low' ? 1 : 3,
      material: slatMat,
    })
  }
  if (kind === 'vent_grill' && detailLevel !== 'low') {
    for (const offset of [-0.25, 0.25]) {
      shapes.push({
        kind: 'box',
        name: `${part.name ?? input.name ?? 'object'} vent vertical mullion`,
        position: [center[0] + offset * width, center[1], center[2] + panelDepth * 0.2],
        length: frameWidth * 0.8,
        width: frameWidth * 0.7,
        height: panelHeight * 0.92,
        cornerRadius: frameWidth * 0.2,
        cornerSegments: 3,
        material: frameMat,
      })
    }
  }
  return shapes
}

export function composeSkidBase(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.06, 0])
  const length = clamp(part.length ?? part.depth, 1.1, 0.25, 5)
  const width = clamp(part.width, 0.46, 0.12, 2)
  const railHeight = clamp(part.height, 0.08, 0.02, 0.35)
  const railWidth = clamp(part.radius, Math.min(width, length) * 0.08, 0.015, 0.18)
  const frameMat = partMaterial(part, material(input.darkColor ?? '#2f343b', 0.6, 0.42))
  const railZ = width / 2 - railWidth / 2
  return [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} skid left rail`,
      position: [center[0], center[1], center[2] - railZ],
      length,
      width: railWidth,
      height: railHeight,
      cornerRadius: railHeight * 0.12,
      cornerSegments: 3,
      material: frameMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} skid right rail`,
      position: [center[0], center[1], center[2] + railZ],
      length,
      width: railWidth,
      height: railHeight,
      cornerRadius: railHeight * 0.12,
      cornerSegments: 3,
      material: frameMat,
    },
    ...[-0.36, 0, 0.36].map((offset, index) => ({
      kind: 'box' as const,
      name: `${part.name ?? input.name ?? 'object'} skid cross member ${index + 1}`,
      position: [center[0] + offset * length, center[1] + railHeight * 0.18, center[2]] as Vec3,
      length: railWidth,
      width: width,
      height: railHeight * 0.72,
      cornerRadius: railHeight * 0.08,
      cornerSegments: 3,
      material: frameMat,
    })),
  ]
}

export function composeRoundedMachineBody(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.45, 0])
  const length = clamp(part.length, 0.7, 0.1, 5)
  const width = clamp(part.width ?? part.depth, 0.36, 0.08, 2)
  const height = clamp(part.height, 0.36, 0.08, 2)
  const cornerRadius = clamp(part.cornerRadius, Math.min(length, width, height) * 0.12, 0.004, 0.22)
  const bodyMat = partMaterial(part, material(input.primaryColor ?? '#64748b', 0.48, 0.28))
  const secondaryMat = material(input.secondaryColor ?? '#334155', 0.55, 0.18)
  const darkMat = material(input.darkColor ?? '#1f2937', 0.62, 0.18)
  const metalMat = material(input.metalColor ?? '#cbd5e1', 0.34, 0.68)
  const seamThickness = Math.min(length, width, height) * 0.012
  return [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} rounded machine body`,
      position: center,
      length,
      width,
      height,
      cornerRadius,
      cornerSegments: clampInt(part.cornerSegments, input.detail === 'high' ? 8 : 6, 3, 12),
      material: bodyMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} recessed front access cover plate`,
      position: [center[0], center[1] + height * 0.02, center[2] + width * 0.515],
      length: length * 0.72,
      width: width * 0.035,
      height: height * 0.58,
      cornerRadius: Math.min(length, height) * 0.025,
      cornerSegments: 3,
      material: secondaryMat,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} raised top service hatch`,
      position: [center[0] - length * 0.06, center[1] + height * 0.51, center[2]],
      length: length * 0.54,
      width: width * 0.72,
      thickness: seamThickness * 1.8,
      cornerRadius: cornerRadius * 0.55,
      cornerSegments: 4,
      material: secondaryMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} lower shadow plinth`,
      position: [center[0], center[1] - height * 0.52 - seamThickness, center[2]],
      length: length * 0.94,
      width: width * 0.92,
      height: seamThickness * 2,
      cornerRadius: cornerRadius * 0.35,
      cornerSegments: 3,
      material: darkMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} front horizontal seam`,
      position: [center[0], center[1] + height * 0.22, center[2] + width * 0.535],
      length: length * 0.8,
      width: seamThickness,
      height: seamThickness,
      cornerRadius: seamThickness * 0.25,
      cornerSegments: 2,
      material: metalMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} side service seam`,
      position: [center[0] - length * 0.18, center[1], center[2] + width * 0.536],
      length: seamThickness,
      width: seamThickness,
      height: height * 0.62,
      cornerRadius: seamThickness * 0.25,
      cornerSegments: 2,
      material: metalMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} rear foot pad left`,
      position: [center[0] - length * 0.32, center[1] - height * 0.58, center[2] - width * 0.28],
      length: length * 0.12,
      width: width * 0.16,
      height: seamThickness * 2.2,
      cornerRadius: seamThickness * 0.4,
      cornerSegments: 3,
      material: darkMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} rear foot pad right`,
      position: [center[0] + length * 0.32, center[1] - height * 0.58, center[2] - width * 0.28],
      length: length * 0.12,
      width: width * 0.16,
      height: seamThickness * 2.2,
      cornerRadius: seamThickness * 0.4,
      cornerSegments: 3,
      material: darkMat,
    },
  ]
}

export function composeVoluteCasing(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.55, 0.18])
  const radius = clamp(part.radius, 0.28, 0.06, 2)
  const depth = clamp(part.depth ?? part.width, radius * 0.48, 0.03, 1)
  const outletAngle = clamp(part.outletAngle, Math.atan2(0.34, 0.72), -Math.PI, Math.PI)
  const casingMat = partMaterial(part, material(input.primaryColor ?? '#6b7280', 0.5, 0.32))
  const darkMat = material(input.darkColor ?? '#1f2937', 0.58, 0.18)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} volute scroll casing`,
      position: center,
      axis: 'z',
      majorRadius: radius * 0.5,
      tubeRadius: radius * 0.24,
      arc: Math.PI * 1.78,
      radialSegments: Math.max(12, Math.round(ringSegments(input.detail) * 0.4)),
      tubularSegments: ringSegments(input.detail),
      material: casingMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} volute circular cover`,
      position: [center[0], center[1], center[2] + depth * 0.04],
      axis: 'z',
      radius: radius * 0.72,
      height: depth * 0.64,
      radialSegments: ringSegments(input.detail),
      wallThickness: radius * 0.08,
      material: casingMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} volute inlet lip`,
      position: [center[0], center[1], center[2] + depth * 0.42],
      axis: 'z',
      radius: radius * 0.34,
      height: depth * 0.18,
      radialSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.75)),
      wallThickness: radius * 0.07,
      material: darkMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} volute discharge neck`,
      position: [
        center[0] + Math.cos(outletAngle) * radius * 0.8,
        center[1] + Math.sin(outletAngle) * radius * 0.8,
        center[2],
      ],
      rotation: [0, 0, outletAngle],
      axis: 'x',
      radius: radius * 0.18,
      height: radius * 0.52,
      radialSegments: Math.max(20, Math.round(ringSegments(input.detail) * 0.55)),
      material: casingMat,
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeImpellerBlades(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.55, 0.34])
  const count = clampInt(part.count, 7, 4, 16)
  const radius = clamp(part.bladeRadius ?? part.radius, 0.18, 0.04, 1.2)
  const bladeWidth = clamp(
    part.bladeWidth ?? part.width,
    radius * 0.18,
    radius * 0.06,
    radius * 0.36,
  )
  const bladeDepth = clamp(part.depth ?? part.height, 0.025, 0.006, 0.12)
  const sweep = clamp(part.bladeSweep, bladeWidth * 0.55, -bladeWidth, bladeWidth)
  const mat = partMaterial(part, material(input.accentColor ?? '#94a3b8', 0.4, 0.45))
  const profile: [number, number][] = [
    [0, -bladeWidth * 0.32],
    [radius * 0.38, -bladeWidth * 0.48 + sweep * 0.2],
    [radius * 0.92, -bladeWidth * 0.22 + sweep],
    [radius, bladeWidth * 0.18 + sweep * 0.8],
    [radius * 0.45, bladeWidth * 0.44 + sweep * 0.24],
    [0, bladeWidth * 0.28],
  ]
  const shapes: PrimitiveShapeInput[] = []

  for (let i = 0; i < count; i += 1) {
    const angle = angularStep(i, count)
    shapes.push({
      kind: 'extrude',
      name: `${part.name ?? input.name ?? 'object'} impeller vane ${i + 1}`,
      position: radialPoint(center, angle, radius * 0.42, 0),
      rotation: radialExtrudeRotationInLocalPlane(angle, 0),
      profile,
      depth: bladeDepth,
      bevelSize: bladeDepth * 0.12,
      bevelThickness: bladeDepth * 0.12,
      bevelSegments: 1,
      curveSegments: 8,
      material: mat,
    })
  }

  shapes.push({
    kind: 'cylinder',
    name: `${part.name ?? input.name ?? 'object'} impeller hub`,
    position: center,
    axis: 'z',
    radius: radius * 0.26,
    height: bladeDepth * 1.45,
    radialSegments: 32,
    material: mat,
  })

  return shapes
}

export function normalizedBladeShape(value: unknown): 'taiji_half' | 'airfoil' {
  const text = textOf(value).replace(/[\s-]+/g, '_')
  if (/airfoil|wing|aero|翼型|飞机|航空/.test(text)) return 'airfoil'
  return 'taiji_half'
}

export function taijiHalfBladeProfile(
  length: number,
  rootWidth: number,
  bladeWidth: number,
  longitudinalCurve: number,
  steps: number,
): [number, number][] {
  const profile: [number, number][] = []
  const halfRoot = rootWidth * 0.5
  const maxHalfWidth = bladeWidth * 0.78
  const halfWidthAt = (t: number) => {
    const bulb = Math.sin(Math.PI * t) ** 0.48
    const outerWeight = 0.72 + t * 0.28
    const rootNeck = halfRoot * (1 - t) ** 2.2
    return rootNeck + maxHalfWidth * bulb * outerWeight
  }
  const spineOffset = (t: number) =>
    longitudinalCurve * (Math.sin(Math.PI * (t - 0.06)) + 0.28 * Math.sin(Math.PI * 2 * t))
  const innerCut = (t: number) => longitudinalCurve * 0.72 * Math.sin(Math.PI * t) * (1 - t * 0.35)

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const x = length * (t - 0.5)
    profile.push([x, spineOffset(t) + halfWidthAt(t) * (0.92 + t * 0.18)])
  }
  for (let step = steps; step >= 0; step -= 1) {
    const t = step / steps
    const x = length * (t - 0.5)
    const width = halfWidthAt(t)
    profile.push([x, spineOffset(t) - width * (0.5 + 0.32 * (1 - t)) + innerCut(t)])
  }
  return profile
}

export function rotateBladeProfile(profile: [number, number][], angle: number): [number, number][] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return profile.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos])
}

export function composePropellerBladeSet(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
  options?: {
    semanticRole?: string
    semanticGroup?: string
    sourcePartKind?: string
    namePrefix?: string
  },
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.12, 0])
  const count = clampInt(part.count, 3, 2, 8)
  const bladeLength = clamp(part.bladeRadius ?? part.radius ?? part.length, 0.34, 0.08, 1.2)
  const bladeWidth = clamp(part.bladeWidth ?? part.width, 0.13, 0.04, 0.45)
  const bladeDepth = clamp(part.depth ?? part.height, 0.028, 0.01, 0.09)
  const pitch = clamp(part.bladePitch, 0.52, 0, 1.05)
  const hubRadius = clamp(
    part.hubRadius ?? part.wireRadius,
    bladeLength * 0.12,
    0.015,
    bladeLength * 0.32,
  )
  const rootWidth = Math.max(bladeDepth * 1.05, hubRadius * 0.36)
  const tipWidth = Math.max(bladeDepth * 1.8, bladeWidth * 0.24)
  const camber = clamp(part.camber, bladeWidth * 0.22, -bladeWidth * 0.8, bladeWidth * 0.8)
  const sweep = clamp(part.bladeSweep, bladeWidth * 0.18, -bladeWidth, bladeWidth)
  const longitudinalCurve = clamp(
    part.verticalCurve ?? part.curvature,
    bladeWidth * 0.38,
    -bladeWidth,
    bladeWidth,
  )
  const bladeShape = normalizedBladeShape(part.bladeShape ?? part.style ?? part.variant)
  const mat = partMaterial(part, material(input.accentColor ?? '#64748b', 0.5, 0.45))
  const shapes: PrimitiveShapeInput[] = []
  const profile =
    bladeShape === 'airfoil'
      ? airfoilProfile(
          bladeLength,
          rootWidth,
          tipWidth,
          camber,
          sweep,
          input.detail === 'low' ? 12 : input.detail === 'high' ? 30 : 22,
        )
      : taijiHalfBladeProfile(
          bladeLength,
          rootWidth,
          Math.max(bladeWidth, tipWidth * 1.8),
          longitudinalCurve,
          input.detail === 'low' ? 14 : input.detail === 'high' ? 36 : 28,
        )
  const planarMixerBlades = options?.sourcePartKind === 'mixer_blades'

  for (let i = 0; i < count; i += 1) {
    const angle = (i * Math.PI * 2) / count
    const bladeProfile = planarMixerBlades ? rotateBladeProfile(profile, angle) : profile
    shapes.push({
      kind: 'extrude',
      name: `${part.name ?? input.name ?? 'object'} ${options?.namePrefix ?? bladeShape.replace('_', ' ')} propeller blade ${i + 1}`,
      semanticRole: options?.semanticRole ?? part.semanticRole ?? 'propeller_blade',
      semanticGroup: options?.semanticGroup ?? part.semanticGroup ?? 'propeller_blade_set',
      sourcePartKind: options?.sourcePartKind ?? part.sourcePartKind ?? 'propeller_blade_set',
      position: [
        center[0] + Math.cos(angle) * (hubRadius + bladeLength * 0.5),
        center[1],
        center[2] + Math.sin(angle) * (hubRadius + bladeLength * 0.5),
      ],
      rotation: planarMixerBlades
        ? [-Math.PI / 2, 0, 0]
        : radialExtrudeRotationInHorizontalPlane(angle, pitch * 0.55),
      profile: bladeProfile,
      depth: bladeDepth,
      bevelSize: bladeDepth * 0.12,
      bevelThickness: bladeDepth * 0.16,
      bevelSegments: input.detail === 'high' ? 3 : 2,
      curveSegments: input.detail === 'high' ? 24 : 18,
      material: mat,
    })
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeMixerBlades(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  return composePropellerBladeSet(input, { bladeShape: 'taiji_half', ...part }, origin, {
    semanticRole: 'mixer_blade',
    semanticGroup: 'mixer_blades',
    sourcePartKind: 'mixer_blades',
    namePrefix: 'taiji half mixer',
  })
}

export function airfoilProfile(
  length: number,
  rootWidth: number,
  tipWidth: number,
  camber: number,
  sweep: number,
  steps: number,
): [number, number][] {
  const profile: [number, number][] = []
  const halfRoot = rootWidth / 2
  const halfTip = tipWidth / 2
  const halfWidthAt = (t: number) =>
    halfTip + (halfRoot - halfTip) * Math.sqrt(Math.max(0, 1 - t * t))
  const centerOffset = (t: number) =>
    sweep * Math.sin(Math.PI * t) + camber * Math.sin(Math.PI * t) * (1 - t * 0.35)

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    profile.push([length * (t - 0.5), centerOffset(t) - halfWidthAt(t)])
  }
  for (let step = steps; step >= 0; step -= 1) {
    const t = step / steps
    profile.push([length * (t - 0.5), centerOffset(t) + halfWidthAt(t)])
  }
  return profile
}

export function composeAirfoilBlade(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.4, 0])
  const count = clampInt(part.count, 1, 1, 64)
  const bladeLength = clamp(part.length ?? part.bladeRadius ?? part.radius, 0.46, 0.06, 2.5)
  const rootWidth = clamp(part.rootWidth ?? part.bladeWidth ?? part.width, 0.13, 0.015, 0.8)
  const tipWidth = clamp(part.tipWidth, rootWidth * 0.34, 0.006, rootWidth)
  const thickness = clamp(part.thickness ?? part.depth ?? part.height, 0.025, 0.003, 0.16)
  const pitch = clamp(part.pitch ?? part.bladePitch, 0.34, -1.2, 1.2)
  const twist = clamp(part.twist, 0.18, -1.2, 1.2)
  const camber = clamp(part.camber, rootWidth * 0.18, -rootWidth * 0.8, rootWidth * 0.8)
  const sweep = clamp(part.bladeSweep, rootWidth * 0.18, -rootWidth, rootWidth)
  const hubRadius = clamp(part.wireRadius, bladeLength * 0.12, 0.01, bladeLength * 0.35)
  const profile = airfoilProfile(
    bladeLength,
    rootWidth,
    tipWidth,
    camber,
    sweep,
    input.detail === 'low' ? 10 : 18,
  )
  const mat = partMaterial(part, material(input.accentColor ?? '#64748b', 0.45, 0.45))
  const shapes: PrimitiveShapeInput[] = []

  for (let index = 0; index < count; index += 1) {
    const angle = angularStep(index, count)
    const radialCenter = hubRadius + bladeLength * 0.5
    shapes.push({
      kind: 'extrude',
      name: `${part.name ?? input.name ?? 'object'} airfoil blade ${index + 1}`,
      semanticRole: part.semanticRole ?? 'airfoil_blade',
      semanticGroup: 'airfoil_blades',
      sourcePartKind: 'airfoil_blade',
      position: [
        center[0] + Math.cos(angle) * radialCenter,
        center[1],
        center[2] + Math.sin(angle) * radialCenter,
      ],
      rotation: radialExtrudeRotationInHorizontalPlane(angle, pitch + twist * 0.35),
      profile,
      depth: thickness,
      bevelSize: thickness * 0.12,
      bevelThickness: thickness * 0.16,
      bevelSegments: 1,
      curveSegments: 16,
      material: mat,
    })
  }

  if (count > 1) {
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} airfoil blade hub`,
      semanticRole: 'airfoil_hub',
      semanticGroup: 'airfoil_blades',
      sourcePartKind: 'airfoil_blade',
      position: center,
      axis: 'y',
      radius: hubRadius,
      height: thickness * 1.8,
      radialSegments: 32,
      material: partMaterial(part, material(input.metalColor ?? '#94a3b8', 0.35, 0.7)),
    })
  }

  return applyPartRotation(shapes, center, part.rotation)
}
