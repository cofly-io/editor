import { angularStep } from '../../orientation-utils'
import { genericPartRole } from '../roles'
import {
  add,
  applyPartRotation,
  axisForSide,
  axisNormal,
  clamp,
  clampInt,
  isBallValveIntent,
  material,
  offsetAlongAxis,
  partAxis,
  partIntentText,
  partMaterial,
  partSide,
  radialPointOnAxis,
  ringSegments,
  signForSide,
} from '../shared'
import type {
  PartComposeInput,
  PartComposePartInput,
  PartSide,
  PrimitiveMaterialInput,
  PrimitiveShapeInput,
  Vec3,
} from '../types'
import { detailDefaultInt, detailSegmentLevel } from './basic-machine'

export function composePipePort(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
  label: string,
): PrimitiveShapeInput[] {
  const side = partSide(part.side)
  const axis = side
    ? axisForSide(side, label === 'outlet_port' ? 'x' : 'z')
    : partAxis(part.axis, label === 'outlet_port' ? 'x' : 'z')
  const sign = signForSide(side, axis)
  const center = add(origin, part.position ?? [0, 0.55, 0.45])
  const radius = clamp(part.radius, 0.08, 0.01, 0.8)
  const length = clamp(part.length ?? part.depth ?? part.height, 0.26, 0.02, 2)
  const rimCenter = offsetAlongAxis(center, axis, (length / 2) * sign)
  const pipeMat = partMaterial(part, material(input.primaryColor ?? '#6b7280', 0.45, 0.35))
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'object'} ${label.replace('_', ' ')}`,
      position: center,
      axis,
      radius,
      height: length,
      radialSegments: Math.max(20, Math.round(ringSegments(input.detail) * 0.55)),
      wallThickness: radius * 0.18,
      duct: {
        crossSection: 'round',
        radius,
        wallThickness: radius * 0.18,
      },
      ports: [
        {
          id: label,
          kind: label === 'inlet_port' ? 'inlet' : label === 'outlet_port' ? 'outlet' : 'generic',
          semanticRole: label,
          position: rimCenter,
          normal: axisNormal(axis, sign),
          axis,
          radius,
          direction:
            label === 'inlet_port' ? 'in' : label === 'outlet_port' ? 'out' : 'bidirectional',
        },
      ],
      material: pipeMat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} ${label.replace('_', ' ')} rim`,
      position: rimCenter,
      axis,
      majorRadius: radius,
      tubeRadius: radius * 0.08,
      radialSegments: 12,
      tubularSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.65)),
      material: pipeMat,
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeFlangeRing(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const segmentDetail = detailSegmentLevel(input, part)
  const side = partSide(part.side)
  const axis = side ? axisForSide(side, 'z') : partAxis(part.axis, 'z')
  const center = add(origin, part.position ?? [0, 0.55, 0.5])
  const radius = clamp(part.radius, 0.12, 0.02, 1)
  const thickness = clamp(part.depth ?? part.height, 0.035, 0.006, 0.3)
  const boltCount = clampInt(
    part.boltCount ?? part.count,
    detailDefaultInt(input, part, { low: 4, medium: 6, high: 10 }),
    3,
    20,
  )
  const mat = partMaterial(part, material(input.metalColor ?? '#9ca3af', 0.34, 0.68))
  const gasketMat = material(input.darkColor ?? '#111827', 0.62, 0.08)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} flange ring`,
      position: center,
      axis,
      radius,
      height: thickness,
      radialSegments: ringSegments(segmentDetail),
      wallThickness: radius * 0.28,
      material: mat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} flange gasket`,
      position: offsetAlongAxis(center, axis, thickness * 0.54),
      axis,
      majorRadius: radius * 0.62,
      tubeRadius: radius * 0.035,
      radialSegments: 12,
      tubularSegments: Math.max(24, Math.round(ringSegments(segmentDetail) * 0.65)),
      material: gasketMat,
    },
  ]
  if (part.includeBolts !== false) {
    shapes.push(
      ...composeBoltPattern(
        input,
        {
          ...part,
          name: `${part.name ?? input.name ?? 'object'} flange`,
          position: center,
          rotation: undefined,
          axis,
          radius: radius * 0.76,
          count: boltCount,
          depth: thickness * 1.2,
        },
        [0, 0, 0],
      ),
    )
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function panelRotationForSide(side: PartSide | undefined): Vec3 {
  switch (side) {
    case 'left':
    case 'right':
      return [0, Math.PI / 2, 0]
    case 'top':
    case 'bottom':
      return [Math.PI / 2, 0, 0]
    default:
      return [0, 0, 0]
  }
}

export function defaultSurfacePosition(input: PartComposeInput, side: PartSide | undefined): Vec3 {
  const length = input.length ?? input.diameter ?? (input.radius ? input.radius * 2 : 1)
  const width =
    input.width ?? input.depth ?? input.diameter ?? (input.radius ? input.radius * 2 : 0.8)
  const height = input.height ?? 1.2
  switch (side) {
    case 'left':
      return [-length * 0.51, height * 0.56, 0]
    case 'right':
      return [length * 0.51, height * 0.56, 0]
    case 'back':
      return [0, height * 0.56, -width * 0.51]
    case 'top':
      return [0, height * 1.02, 0]
    case 'bottom':
      return [0, -height * 0.02, 0]
    default:
      return [0, height * 0.56, width * 0.51]
  }
}

export function composeManwayLid(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const segmentDetail = detailSegmentLevel(input, part)
  const side = partSide(part.side)
  const axis = side ? axisForSide(side, 'y') : partAxis(part.axis, 'y')
  const center = add(origin, part.position ?? defaultSurfacePosition(input, side ?? 'top'))
  const radius = clamp(
    part.radius,
    input.radius ?? (input.diameter ? input.diameter / 2 : 0.18),
    0.04,
    1,
  )
  const thickness = clamp(part.thickness ?? part.depth ?? part.height, 0.035, 0.006, 0.25)
  const boltCount = clampInt(
    part.boltCount ?? part.count,
    detailDefaultInt(input, part, { low: 4, medium: 8, high: 12 }),
    0,
    24,
  )
  const lidMat = partMaterial(
    part,
    material(part.metalColor ?? input.metalColor ?? '#cbd5e1', 0.28, 0.78),
  )
  const darkMat = material(part.darkColor ?? input.darkColor ?? '#111827', 0.55, 0.2)
  const role = genericPartRole(part, 'manway_lid')
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} manway lid`,
      semanticRole: role,
      position: center,
      axis,
      radius,
      height: thickness,
      radialSegments: ringSegments(segmentDetail),
      material: lidMat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} manway gasket`,
      semanticRole: 'manway_gasket',
      position: offsetAlongAxis(center, axis, thickness * 0.55),
      axis,
      majorRadius: radius * 0.72,
      tubeRadius: radius * 0.035,
      radialSegments: 12,
      tubularSegments: Math.max(24, Math.round(ringSegments(segmentDetail) * 0.65)),
      material: darkMat,
    },
    {
      kind: 'capsule',
      name: `${part.name ?? input.name ?? 'object'} manway handle`,
      semanticRole: 'manway_handle',
      position: offsetAlongAxis(center, axis, thickness * 0.9),
      axis: axis === 'x' ? 'z' : 'x',
      radius: Math.max(0.006, radius * 0.055),
      height: radius * 0.78,
      radialSegments: 10,
      capSegments: 3,
      material: darkMat,
    },
  ]
  if (boltCount > 0) {
    shapes.push(
      ...composeBoltPattern(
        input,
        {
          ...part,
          name: `${part.name ?? input.name ?? 'object'} manway`,
          position: center,
          rotation: undefined,
          axis,
          radius: radius * 0.82,
          count: boltCount,
          depth: thickness * 1.3,
          wireRadius: radius * 0.045,
        },
        [0, 0, 0],
      ),
    )
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeSanitaryNozzle(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const segmentDetail = detailSegmentLevel(input, part)
  const side = partSide(part.side)
  const axis = side ? axisForSide(side, 'y') : partAxis(part.axis, 'y')
  const sign = signForSide(side, axis)
  const center = add(origin, part.position ?? defaultSurfacePosition(input, side ?? 'top'))
  const radius = clamp(part.radius, 0.08, 0.01, 0.5)
  const length = clamp(part.length ?? part.depth ?? part.height, 0.18, 0.03, 1)
  const mat = partMaterial(
    part,
    material(part.metalColor ?? input.metalColor ?? '#cbd5e1', 0.24, 0.82),
  )
  const role = genericPartRole(part, 'sanitary_nozzle')
  const outer = offsetAlongAxis(center, axis, (length / 2) * sign)
  return applyPartRotation(
    [
      {
        kind: 'hollow-cylinder',
        name: `${part.name ?? input.name ?? 'object'} sanitary nozzle`,
        semanticRole: role,
        position: center,
        axis,
        radius,
        height: length,
        radialSegments: Math.max(20, Math.round(ringSegments(input.detail) * 0.55)),
        wallThickness: radius * 0.16,
        material: mat,
      },
      {
        kind: 'torus',
        name: `${part.name ?? input.name ?? 'object'} sanitary clamp bead`,
        semanticRole: 'sanitary_clamp_bead',
        position: outer,
        axis,
        majorRadius: radius * 1.08,
        tubeRadius: radius * 0.08,
        radialSegments: 12,
        tubularSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.65)),
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeFlangedNozzle(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const segmentDetail = detailSegmentLevel(input, part)
  const side = partSide(part.side)
  const axis = side ? axisForSide(side, 'y') : partAxis(part.axis, 'y')
  const sign = signForSide(side, axis)
  const center = add(origin, part.position ?? defaultSurfacePosition(input, side ?? 'front'))
  const radius = clamp(part.radius, 0.09, 0.015, 0.8)
  const length = clamp(part.length ?? part.depth ?? part.height, 0.26, 0.06, 1.8)
  const flangeRadius = clamp(part.flangeRadius, radius * 1.75, radius * 1.1, radius * 3.2)
  const flangeThickness = clamp(part.flangeThickness ?? part.thickness, radius * 0.28, 0.008, 0.22)
  const mat = partMaterial(
    part,
    material(part.metalColor ?? input.metalColor ?? '#cbd5e1', 0.24, 0.82),
  )
  const role = genericPartRole(part, 'flanged_nozzle')
  const nozzleCenter = offsetAlongAxis(center, axis, length * 0.22 * sign)
  const flangeCenter = offsetAlongAxis(center, axis, length * 0.58 * sign)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'object'} flanged nozzle neck`,
      semanticRole: role,
      sourcePartKind: 'flanged_nozzle',
      position: nozzleCenter,
      axis,
      radius,
      height: length,
      radialSegments: Math.max(24, Math.round(ringSegments(segmentDetail) * 0.65)),
      wallThickness: radius * 0.14,
      material: mat,
    },
    {
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'object'} nozzle flange`,
      semanticRole: 'nozzle_flange',
      sourcePartKind: 'flanged_nozzle',
      position: flangeCenter,
      axis,
      radius: flangeRadius,
      height: flangeThickness,
      wallThickness: Math.max(radius * 0.22, flangeRadius - radius * 1.05),
      radialSegments: ringSegments(segmentDetail),
      material: mat,
    },
  ]
  if (part.includeBolts !== false) {
    shapes.push(
      ...composeBoltPattern(
        input,
        {
          ...part,
          name: `${part.name ?? input.name ?? 'object'} nozzle flange`,
          position: flangeCenter,
          rotation: undefined,
          axis,
          radius: flangeRadius * 0.76,
          count: clampInt(
            part.boltCount ?? part.count,
            detailDefaultInt(input, part, { low: 4, medium: 8, high: 12 }),
            0,
            24,
          ),
          depth: flangeThickness * 1.4,
          wireRadius: flangeRadius * 0.035,
        },
        [0, 0, 0],
      ),
    )
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeInspectionHatch(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const side = partSide(part.side)
  const axis = side ? axisForSide(side, 'z') : partAxis(part.axis, 'z')
  const center = add(origin, part.position ?? defaultSurfacePosition(input, side ?? 'front'))
  const radius = clamp(part.radius, 0.18, 0.04, 1.2)
  const thickness = clamp(part.thickness ?? part.depth ?? part.height, 0.035, 0.006, 0.28)
  const hatchMat = partMaterial(
    part,
    material(part.metalColor ?? input.metalColor ?? '#cbd5e1', 0.3, 0.75),
  )
  const darkMat = material(part.darkColor ?? input.darkColor ?? '#111827', 0.55, 0.18)
  const role = genericPartRole(part, 'inspection_hatch')
  const handleAxis = axis === 'x' ? 'z' : 'x'
  return applyPartRotation(
    [
      {
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} inspection hatch cover`,
        semanticRole: role,
        sourcePartKind: 'inspection_hatch',
        position: center,
        axis,
        radius,
        height: thickness,
        radialSegments: ringSegments(input.detail),
        material: hatchMat,
      },
      {
        kind: 'box',
        name: `${part.name ?? input.name ?? 'object'} hatch hinge block`,
        semanticRole: 'hatch_hinge',
        sourcePartKind: 'inspection_hatch',
        position: add(offsetAlongAxis(center, axis, thickness * 0.7), [radius * 0.78, 0, 0]),
        length: radius * 0.18,
        width: thickness * 1.2,
        height: radius * 0.42,
        material: darkMat,
      },
      {
        kind: 'capsule',
        name: `${part.name ?? input.name ?? 'object'} hatch handle`,
        semanticRole: 'hatch_handle',
        sourcePartKind: 'inspection_hatch',
        position: offsetAlongAxis(center, axis, thickness * 0.95),
        axis: handleAxis,
        radius: Math.max(0.006, radius * 0.045),
        height: radius * 0.72,
        radialSegments: 10,
        capSegments: 3,
        material: darkMat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeJacketShell(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const axis = partAxis(part.axis, 'y')
  const radius = clamp(
    part.radius,
    input.radius ? input.radius * 1.06 : (input.diameter ?? 1) * 0.53,
    0.08,
    3,
  )
  const height = clamp(part.height, (input.height ?? 1.4) * 0.74, 0.12, 8)
  const center = add(origin, part.position ?? [0, height * 0.5, 0])
  const opacity = clamp(part.opacity, 0.28, 0.08, 1)
  const mat = partMaterial(
    part,
    material(part.primaryColor ?? input.secondaryColor ?? '#dbe3ea', 0.3, 0.56, opacity),
  )
  const seamMat = material(part.metalColor ?? input.metalColor ?? '#cbd5e1', 0.24, 0.82)
  const role = genericPartRole(part, 'jacket_shell')
  return applyPartRotation(
    [
      {
        kind: 'hollow-cylinder',
        name: `${part.name ?? input.name ?? 'object'} jacket shell`,
        semanticRole: role,
        position: center,
        axis,
        radius,
        height,
        radialSegments: ringSegments(input.detail),
        wallThickness: clamp(part.thickness, radius * 0.025, 0.004, 0.12),
        material: mat,
      },
      {
        kind: 'torus',
        name: `${part.name ?? input.name ?? 'object'} jacket upper seam`,
        semanticRole: 'jacket_seam',
        position: offsetAlongAxis(center, axis, height * 0.5),
        axis,
        majorRadius: radius,
        tubeRadius: radius * 0.018,
        radialSegments: 12,
        tubularSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.65)),
        material: seamMat,
      },
      {
        kind: 'torus',
        name: `${part.name ?? input.name ?? 'object'} jacket lower seam`,
        semanticRole: 'jacket_seam',
        position: offsetAlongAxis(center, axis, -height * 0.5),
        axis,
        majorRadius: radius,
        tubeRadius: radius * 0.018,
        radialSegments: 12,
        tubularSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.65)),
        material: seamMat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeSightGlass(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const side = partSide(part.side) ?? 'front'
  const center = add(origin, part.position ?? defaultSurfacePosition(input, side))
  const length = clamp(part.length, 0.18, 0.03, 1.4)
  const height = clamp(part.height ?? part.width, 0.24, 0.03, 1.6)
  const thickness = clamp(part.thickness ?? part.depth, 0.012, 0.002, 0.08)
  const rotation = part.rotation ?? panelRotationForSide(side)
  const glass = material(
    part.color ?? input.accentColor ?? '#93c5fd',
    0.06,
    0.02,
    clamp(part.opacity, 0.42, 0.12, 0.9),
  )
  const rim = material(part.metalColor ?? input.metalColor ?? '#cbd5e1', 0.25, 0.82)
  const role = genericPartRole(part, 'sight_glass')
  return [
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} sight glass rim`,
      semanticRole: 'sight_glass_rim',
      position: center,
      rotation,
      length: length * 1.18,
      width: height * 1.14,
      thickness: thickness * 1.25,
      cornerRadius: Math.min(length, height) * 0.16,
      cornerSegments: 5,
      material: rim,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} sight glass`,
      semanticRole: role,
      position: offsetAlongAxis(
        center,
        axisForSide(side, 'z'),
        signForSide(side, axisForSide(side, 'z')) * thickness * 0.8,
      ),
      rotation,
      length,
      width: height,
      thickness,
      cornerRadius: Math.min(length, height) * 0.14,
      cornerSegments: 5,
      material: glass,
    },
  ]
}

export function composeSampleValve(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const side = partSide(part.side) ?? 'front'
  const axis = axisForSide(side, 'z')
  const sign = signForSide(side, axis)
  const center = add(origin, part.position ?? defaultSurfacePosition(input, side))
  const radius = clamp(part.radius, 0.045, 0.008, 0.25)
  const length = clamp(part.length ?? part.depth ?? part.height, 0.22, 0.04, 0.8)
  const mat = partMaterial(
    part,
    material(part.metalColor ?? input.metalColor ?? '#cbd5e1', 0.27, 0.78),
  )
  const dark = material(part.darkColor ?? input.darkColor ?? '#111827', 0.48, 0.35)
  const role = genericPartRole(part, 'sample_valve')
  const knobCenter = offsetAlongAxis(center, axis, length * 0.42 * sign)
  return applyPartRotation(
    [
      {
        kind: 'hollow-cylinder',
        name: `${part.name ?? input.name ?? 'object'} sample valve nozzle`,
        semanticRole: role,
        position: center,
        axis,
        radius,
        height: length,
        radialSegments: 20,
        wallThickness: radius * 0.18,
        material: mat,
      },
      {
        kind: 'sphere',
        name: `${part.name ?? input.name ?? 'object'} sample valve body`,
        semanticRole: 'sample_valve_body',
        position: knobCenter,
        radius: radius * 1.25,
        widthSegments: 20,
        heightSegments: 12,
        material: mat,
      },
      {
        kind: 'capsule',
        name: `${part.name ?? input.name ?? 'object'} sample valve handle`,
        semanticRole: 'sample_valve_handle',
        position: offsetAlongAxis(knobCenter, 'y', radius * 1.35),
        axis: 'x',
        radius: radius * 0.18,
        height: radius * 3.2,
        radialSegments: 10,
        capSegments: 3,
        material: dark,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeInstrumentPort(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const side = partSide(part.side)
  const axis = side ? axisForSide(side, 'y') : partAxis(part.axis, 'y')
  const sign = signForSide(side, axis)
  const center = add(origin, part.position ?? defaultSurfacePosition(input, side ?? 'top'))
  const radius = clamp(part.radius, 0.035, 0.006, 0.22)
  const length = clamp(part.length ?? part.depth ?? part.height, 0.16, 0.03, 0.7)
  const mat = partMaterial(
    part,
    material(part.metalColor ?? input.metalColor ?? '#cbd5e1', 0.24, 0.8),
  )
  const dark = material(part.darkColor ?? input.darkColor ?? '#0f172a', 0.48, 0.3)
  const role = genericPartRole(part, 'instrument_port')
  const head = offsetAlongAxis(center, axis, length * 0.62 * sign)
  return applyPartRotation(
    [
      {
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} instrument stem`,
        semanticRole: role,
        position: center,
        axis,
        radius,
        height: length,
        radialSegments: 18,
        material: mat,
      },
      {
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} instrument gauge`,
        semanticRole: 'instrument_gauge',
        position: head,
        axis,
        radius: radius * 1.8,
        height: radius * 0.65,
        radialSegments: 24,
        material: dark,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeStainlessHighlightPanel(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const side = partSide(part.side) ?? 'front'
  const center = add(origin, part.position ?? defaultSurfacePosition(input, side))
  const length = clamp(part.length, (input.length ?? input.diameter ?? 1) * 0.16, 0.02, 1.2)
  const height = clamp(part.height ?? part.width, (input.height ?? 1.2) * 0.55, 0.04, 4)
  const thickness = clamp(part.thickness ?? part.depth, 0.006, 0.001, 0.05)
  const mat = partMaterial(
    part,
    material(part.color ?? '#f8fafc', 0.18, 0.68, clamp(part.opacity, 0.5, 0.12, 0.95)),
  )
  return [
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} stainless highlight panel`,
      semanticRole: genericPartRole(part, 'stainless_highlight_panel'),
      position: center,
      rotation: part.rotation ?? panelRotationForSide(side),
      length,
      width: height,
      thickness,
      cornerRadius: Math.min(length, height) * 0.35,
      cornerSegments: 6,
      material: mat,
    },
  ]
}

export function composeBoltPattern(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const side = partSide(part.side)
  const axis = side ? axisForSide(side, 'z') : partAxis(part.axis, 'z')
  const center = add(origin, part.position ?? [0, 0.55, 0.5])
  const radius = clamp(part.radius, 0.12, 0.01, 2)
  const count = clampInt(part.boltCount ?? part.count, 6, 3, 32)
  const boltRadius = clamp(part.wireRadius ?? part.width, radius * 0.08, 0.003, 0.08)
  const boltDepth = clamp(part.depth ?? part.height, boltRadius * 1.5, 0.004, 0.2)
  const boltMat = partMaterial(part, material(input.darkColor ?? '#1f2937', 0.42, 0.5))
  const pattern = {
    id: `${part.id ?? part.sourcePartId ?? part.name ?? 'bolt_pattern'}_radial`,
    kind: 'radial' as const,
    semanticRole: part.semanticRole ?? 'bolt_pattern',
    count,
    axis,
    radius,
    startAngle: 0,
    endAngle: Math.PI * 2,
    mode: 'expanded' as const,
  }
  const shapes = Array.from({ length: count }, (_, i) => {
    const angle = angularStep(i, count)
    return {
      kind: 'cylinder' as const,
      name: `${part.name ?? input.name ?? 'object'} bolt ${i + 1}`,
      position: radialPointOnAxis(center, axis, angle, radius),
      axis,
      radius: boltRadius,
      height: boltDepth,
      radialSegments: 12,
      pattern,
      material: boltMat,
    }
  })
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeControlBox(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0.32, 0.62, 0.24])
  const width = clamp(part.width ?? part.length, 0.24, 0.04, 1.5)
  const height = clamp(part.height, 0.32, 0.06, 1.5)
  const depth = clamp(part.depth, 0.11, 0.025, 0.7)
  const boxMat = partMaterial(part, material(input.secondaryColor ?? '#334155', 0.55, 0.18))
  return [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} control box`,
      position: center,
      length: width,
      width: depth,
      height,
      cornerRadius: Math.min(width, depth, height) * 0.08,
      cornerSegments: 4,
      material: boxMat,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} control face plate`,
      position: [center[0], center[1], center[2] + depth * 0.52],
      length: width * 0.78,
      width: height * 0.62,
      thickness: depth * 0.08,
      cornerRadius: Math.min(width, height) * 0.025,
      cornerSegments: 4,
      material: material(input.darkColor ?? '#0f172a', 0.5, 0.08),
    },
  ]
}

export function composeRibbedMotorBody(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const axis = partAxis(part.axis, 'x')
  const center = add(origin, part.position ?? [-0.24, 0.42, 0])
  const radius = clamp(part.radius, 0.18, 0.04, 1)
  const length = clamp(part.length ?? part.depth, 0.48, 0.12, 3)
  const finCount = clampInt(part.slatCount ?? part.count, 8, 3, 20)
  const bodyMat = partMaterial(part, material(input.primaryColor ?? '#64748b', 0.46, 0.42))
  const darkMat = material(input.darkColor ?? '#1f2937', 0.5, 0.28)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} ribbed motor body`,
      position: center,
      axis,
      radius,
      height: length,
      radialSegments: ringSegments(input.detail),
      material: bodyMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} motor front end cap`,
      position: offsetAlongAxis(center, axis, length * 0.53),
      axis,
      radius: radius * 0.92,
      height: length * 0.08,
      radialSegments: ringSegments(input.detail),
      material: darkMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} motor rear fan cover`,
      position: offsetAlongAxis(center, axis, -length * 0.53),
      axis,
      radius: radius * 0.98,
      height: length * 0.1,
      radialSegments: ringSegments(input.detail),
      material: darkMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} motor shaft`,
      position: offsetAlongAxis(center, axis, length * 0.72),
      axis,
      radius: radius * 0.18,
      height: length * 0.32,
      radialSegments: 20,
      material: material(input.metalColor ?? '#cbd5e1', 0.28, 0.78),
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} motor terminal box`,
      position: [center[0], center[1] + radius * 1.05, center[2]],
      length: length * 0.34,
      width: radius * 0.72,
      height: radius * 0.38,
      cornerRadius: radius * 0.05,
      cornerSegments: 3,
      material: darkMat,
    },
  ]

  for (let i = 0; i < finCount; i += 1) {
    const z = center[2] + (i - (finCount - 1) / 2) * ((radius * 1.55) / Math.max(1, finCount - 1))
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} motor cooling fin ${i + 1}`,
      position: [center[0], center[1] + radius * 0.98, z],
      length: length * 0.82,
      width: radius * 0.025,
      height: radius * 0.18,
      cornerRadius: radius * 0.01,
      cornerSegments: 2,
      material: bodyMat,
    })
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeConveyorFrame(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.38, 0])
  const length = clamp(part.length, 1.4, 0.3, 6)
  const width = clamp(part.width, 0.42, 0.12, 2)
  const height = clamp(part.height, 0.42, 0.12, 2)
  const railSize = clamp(part.radius, 0.025, 0.006, 0.12)
  const mat = partMaterial(part, material(input.metalColor ?? '#94a3b8', 0.34, 0.72))
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} conveyor left rail`,
      position: [center[0], center[1] + height * 0.2, center[2] - width / 2],
      length,
      width: railSize,
      height: railSize,
      material: mat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} conveyor right rail`,
      position: [center[0], center[1] + height * 0.2, center[2] + width / 2],
      length,
      width: railSize,
      height: railSize,
      material: mat,
    },
  ]

  const legPairs = clampInt(
    part.legCount != null ? Math.ceil(part.legCount / 2) : undefined,
    2,
    1,
    8,
  )
  const legOffsets = Array.from({ length: legPairs }, (_, index) =>
    legPairs === 1 ? 0 : -0.44 + (0.88 * index) / (legPairs - 1),
  )
  for (const x of legOffsets) {
    for (const z of [-0.5, 0.5]) {
      shapes.push({
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} conveyor support leg`,
        position: [center[0] + x * length, center[1] - height * 0.26, center[2] + z * width],
        axis: 'y',
        radius: railSize * 0.58,
        height,
        radialSegments: 12,
        material: mat,
      })
    }
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeRollerArray(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.52, 0])
  const count = clampInt(part.count, 7, 2, 32)
  const length = clamp(part.length, 1.2, 0.2, 6)
  const width = clamp(part.width, 0.46, 0.08, 2)
  const radius = clamp(part.radius, 0.035, 0.008, 0.18)
  const mat = partMaterial(part, material(input.metalColor ?? '#cbd5e1', 0.26, 0.82))
  const pattern = {
    id: `${part.id ?? part.sourcePartId ?? part.name ?? 'roller_array'}_linear`,
    kind: 'linear' as const,
    semanticRole: part.semanticRole ?? 'roller_array',
    count,
    axis: 'x' as const,
    spacing: count > 1 ? length / (count - 1) : 0,
    mode: 'expanded' as const,
  }
  const shapes = Array.from({ length: count }, (_, i) => ({
    kind: 'cylinder' as const,
    name: `${part.name ?? input.name ?? 'object'} conveyor roller ${i + 1}`,
    position: [
      center[0] + (i - (count - 1) / 2) * (length / Math.max(1, count - 1)),
      center[1],
      center[2],
    ] as Vec3,
    axis: 'z',
    radius,
    height: width,
    radialSegments: 20,
    pattern,
    material: mat,
  }))
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeBeltSurface(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.56, 0])
  const length = clamp(part.length, 1.35, 0.2, 6)
  const width = clamp(part.width, 0.46, 0.08, 2)
  const thickness = clamp(part.height ?? part.depth, 0.025, 0.004, 0.12)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} conveyor belt surface`,
      position: center,
      length,
      width,
      height: thickness,
      cornerRadius: thickness * 0.4,
      cornerSegments: 3,
      material: partMaterial(part, material(input.darkColor ?? '#111827', 0.64, 0.02)),
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeCylindricalTank(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const axis = partAxis(part.axis, 'x')
  const center = add(origin, part.position ?? [0, 0.55, 0])
  const radius = clamp(part.radius, 0.24, 0.05, 2)
  const length = clamp(part.length ?? part.height, 0.9, 0.16, 24)
  const wallThickness = clamp(
    part.thickness ?? part.shellThickness,
    radius * 0.075,
    radius * 0.02,
    radius * 0.28,
  )
  const mat = partMaterial(part, material(input.primaryColor ?? '#94a3b8', 0.42, 0.48))
  const metal = material(input.metalColor ?? '#cbd5e1', 0.28, 0.76)
  const dark = material(input.darkColor ?? '#1f2937', 0.56, 0.24)
  const supportMat = material(input.darkColor ?? '#334155', 0.58, 0.36)
  const headScale = axis === 'x' ? [radius * 0.36, radius, radius] : [radius, radius * 0.36, radius]
  const leftEnd = offsetAlongAxis(center, axis, -length * 0.52)
  const rightEnd = offsetAlongAxis(center, axis, length * 0.52)
  const topNozzleCenter: Vec3 = [center[0], center[1] + radius * 1.08, center[2]]
  const manwayCenter: Vec3 =
    axis === 'x'
      ? [center[0] - length * 0.18, center[1], center[2] + radius * 1.04]
      : [center[0] + radius * 1.04, center[1] + length * 0.16, center[2]]
  const manwayAxis = axis === 'x' ? 'z' : 'x'
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'object'} cylindrical tank shell`,
      semanticRole: part.semanticRole ?? 'vessel_shell',
      sourcePartKind: part.sourcePartKind ?? 'cylindrical_tank',
      position: center,
      axis,
      radius,
      height: length,
      wallThickness,
      radialSegments: ringSegments(input.detail),
      duct: {
        crossSection: 'round',
        radius,
        wallThickness,
      },
      ports: [
        {
          id: 'vessel_left_head',
          kind: 'support',
          semanticRole: 'vessel_head',
          position: leftEnd,
          normal: axisNormal(axis, -1),
          axis,
          radius,
          direction: 'bidirectional',
        },
        {
          id: 'vessel_right_head',
          kind: 'support',
          semanticRole: 'vessel_head',
          position: rightEnd,
          normal: axisNormal(axis, 1),
          axis,
          radius,
          direction: 'bidirectional',
        },
        {
          id: 'top_nozzle',
          kind: 'generic',
          semanticRole: 'top_nozzle',
          position: topNozzleCenter,
          normal: axisNormal('y', 1),
          axis: 'y',
          radius: radius * 0.16,
          direction: 'bidirectional',
        },
        {
          id: 'manway',
          kind: 'access',
          semanticRole: 'manway_flange',
          position: manwayCenter,
          normal: axisNormal(manwayAxis, 1),
          axis: manwayAxis,
          radius: radius * 0.22,
          direction: 'bidirectional',
        },
      ],
      cutouts: [
        {
          id: 'top_nozzle_opening',
          kind: 'round',
          semanticRole: 'top_nozzle',
          position: topNozzleCenter,
          normal: axisNormal('y', 1),
          axis: 'y',
          radius: radius * 0.16,
          through: true,
          bevelRadius: wallThickness * 0.5,
        },
        {
          id: 'manway_opening',
          kind: 'round',
          semanticRole: 'manway_flange',
          position: manwayCenter,
          normal: axisNormal(manwayAxis, 1),
          axis: manwayAxis,
          radius: radius * 0.22,
          through: true,
          bevelRadius: wallThickness * 0.5,
        },
      ],
      material: mat,
    },
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} tank left dished end`,
      semanticRole: 'vessel_head',
      sourcePartKind: part.sourcePartKind ?? 'cylindrical_tank',
      position: leftEnd,
      radius: 1,
      scale: headScale as Vec3,
      widthSegments: ringSegments(input.detail),
      heightSegments: Math.max(16, Math.round(ringSegments(input.detail) * 0.5)),
      material: mat,
    },
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} tank right dished end`,
      semanticRole: 'vessel_head',
      sourcePartKind: part.sourcePartKind ?? 'cylindrical_tank',
      position: rightEnd,
      radius: 1,
      scale: headScale as Vec3,
      widthSegments: ringSegments(input.detail),
      heightSegments: Math.max(16, Math.round(ringSegments(input.detail) * 0.5)),
      material: mat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} tank left seam ring`,
      semanticRole: 'vessel_seam',
      sourcePartKind: part.sourcePartKind ?? 'cylindrical_tank',
      position: leftEnd,
      axis,
      majorRadius: radius * 1.01,
      tubeRadius: wallThickness * 0.48,
      radialSegments: 10,
      tubularSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.7)),
      material: metal,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} tank right seam ring`,
      semanticRole: 'vessel_seam',
      sourcePartKind: part.sourcePartKind ?? 'cylindrical_tank',
      position: rightEnd,
      axis,
      majorRadius: radius * 1.01,
      tubeRadius: wallThickness * 0.48,
      radialSegments: 10,
      tubularSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.7)),
      material: metal,
    },
    {
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'object'} tank top nozzle`,
      semanticRole: 'top_nozzle',
      sourcePartKind: part.sourcePartKind ?? 'cylindrical_tank',
      position: topNozzleCenter,
      axis: 'y',
      radius: radius * 0.16,
      height: radius * 0.35,
      wallThickness: wallThickness * 0.65,
      radialSegments: 20,
      material: mat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} tank manway flange`,
      semanticRole: 'manway_flange',
      sourcePartKind: part.sourcePartKind ?? 'cylindrical_tank',
      position: manwayCenter,
      axis: manwayAxis,
      radius: radius * 0.22,
      height: wallThickness * 3,
      radialSegments: 28,
      material: dark,
    },
  ]
  if (axis === 'x') {
    for (const x of [-length * 0.28, length * 0.28]) {
      shapes.push({
        kind: 'box',
        name: `${part.name ?? input.name ?? 'object'} tank saddle support`,
        semanticRole: 'saddle_support',
        sourcePartKind: part.sourcePartKind ?? 'cylindrical_tank',
        position: [center[0] + x, center[1] - radius * 0.86, center[2]],
        length: radius * 0.48,
        width: radius * 1.72,
        height: radius * 0.32,
        cornerRadius: radius * 0.08,
        cornerSegments: 3,
        material: supportMat,
      })
    }
  } else {
    for (const [x, z] of [
      [radius * 0.72, radius * 0.72],
      [radius * 0.72, -radius * 0.72],
      [-radius * 0.72, radius * 0.72],
      [-radius * 0.72, -radius * 0.72],
    ] as const) {
      shapes.push({
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} tank support leg`,
        semanticRole: 'support_leg',
        sourcePartKind: part.sourcePartKind ?? 'cylindrical_tank',
        position: [center[0] + x, center[1] - length * 0.5 - radius * 0.28, center[2] + z],
        axis: 'y',
        radius: radius * 0.045,
        height: radius * 0.56,
        radialSegments: 12,
        material: supportMat,
      })
    }
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeStorageTankShell(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const axis = partAxis(part.axis, 'y')
  if (axis !== 'y') return composeCylindricalTank(input, part, origin)

  const center = add(origin, part.position ?? [0, 1.2, 0])
  const radius = clamp(
    part.radius ?? (part.diameter != null ? part.diameter / 2 : undefined),
    0.8,
    0.12,
    6,
  )
  const height = clamp(part.height ?? part.length, 2.4, 0.6, 24)
  const wallThickness = clamp(
    part.thickness ?? part.shellThickness,
    radius * 0.045,
    radius * 0.012,
    radius * 0.12,
  )
  const roofThickness = clamp(
    part.domeDepth ?? part.thickness,
    Math.max(0.035, radius * 0.035),
    0.015,
    0.24,
  )
  const foundationHeight = clamp(part.baseRadius, Math.max(0.06, radius * 0.12), 0.03, 0.8)
  const topY = center[1] + height / 2
  const bottomY = center[1] - height / 2
  const mat = partMaterial(part, material(input.primaryColor ?? '#cbd5e1', 0.42, 0.48))
  const roofMat = material(part.primaryColor ?? input.primaryColor ?? '#cbd5e1', 0.36, 0.58, 0.88)
  const metal = material(input.metalColor ?? '#cbd5e1', 0.28, 0.76)
  const foundationMat = material(input.darkColor ?? '#475569', 0.62, 0.22)

  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'object'} straight storage tank shell`,
      semanticRole: part.semanticRole ?? 'vessel_shell',
      sourcePartKind: part.sourcePartKind ?? 'storage_tank_shell',
      position: center,
      axis: 'y',
      radius,
      height,
      wallThickness,
      radialSegments: ringSegments(input.detail),
      duct: {
        crossSection: 'round',
        radius,
        wallThickness,
      },
      material: mat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} flat storage tank roof`,
      semanticRole: 'vessel_roof',
      sourcePartKind: part.sourcePartKind ?? 'storage_tank_shell',
      position: [center[0], topY + roofThickness / 2, center[2]],
      axis: 'y',
      radius: radius * 1.01,
      height: roofThickness,
      radialSegments: ringSegments(input.detail),
      material: roofMat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} storage tank bottom plate`,
      semanticRole: 'tank_bottom',
      sourcePartKind: part.sourcePartKind ?? 'storage_tank_shell',
      position: [center[0], bottomY + roofThickness / 2, center[2]],
      axis: 'y',
      radius: radius * 0.99,
      height: roofThickness,
      radialSegments: ringSegments(input.detail),
      material: roofMat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} storage tank top rim`,
      semanticRole: 'top_rim',
      sourcePartKind: part.sourcePartKind ?? 'storage_tank_shell',
      position: [center[0], topY + roofThickness * 0.9, center[2]],
      axis: 'y',
      majorRadius: radius * 1.015,
      tubeRadius: Math.max(0.012, wallThickness * 0.58),
      radialSegments: 10,
      tubularSegments: Math.max(28, Math.round(ringSegments(input.detail) * 0.75)),
      material: metal,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} storage tank bottom rim`,
      semanticRole: 'bottom_rim',
      sourcePartKind: part.sourcePartKind ?? 'storage_tank_shell',
      position: [center[0], bottomY + roofThickness * 0.45, center[2]],
      axis: 'y',
      majorRadius: radius * 1.015,
      tubeRadius: Math.max(0.012, wallThickness * 0.52),
      radialSegments: 10,
      tubularSegments: Math.max(28, Math.round(ringSegments(input.detail) * 0.75)),
      material: metal,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} storage tank ring foundation`,
      semanticRole: 'foundation_ring',
      sourcePartKind: part.sourcePartKind ?? 'storage_tank_shell',
      position: [center[0], bottomY - foundationHeight / 2, center[2]],
      axis: 'y',
      radius: radius * 1.13,
      height: foundationHeight,
      radialSegments: ringSegments(input.detail),
      material: foundationMat,
    },
  ]

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeLiquidVolume(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const axis = partAxis(part.axis, 'y')
  const radius = clamp(part.radius, 0.5, 0.04, 6)
  const height = clamp(part.height ?? part.length, 1, 0.02, 24)
  const center = add(origin, part.position ?? [0, height / 2, 0])
  const opacity = clamp(part.opacity, 0.58, 0.08, 0.92)
  const mat =
    part.material ??
    (part.materialPreset
      ? { preset: part.materialPreset }
      : material(part.color ?? input.secondaryColor ?? '#38bdf8', 0.24, 0.04, opacity))
  return applyPartRotation(
    [
      {
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} liquid volume`,
        semanticRole: part.semanticRole ?? 'liquid_volume',
        sourcePartKind: part.sourcePartKind ?? 'liquid_volume',
        position: center,
        axis,
        radius,
        height,
        radialSegments: ringSegments(input.detail),
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeCoolingTowerShell(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const height = clamp(part.height, 7.2, 1.8, 24)
  const baseRadius = clamp(part.radius ?? part.baseRadius, 1.15, 0.25, 6)
  const waistRadius = clamp(part.waistRadius, baseRadius * 0.62, 0.16, baseRadius * 0.96)
  const topRadius = clamp(part.topRadius, baseRadius * 0.94, waistRadius * 1.05, baseRadius * 1.35)
  const center = add(origin, part.position ?? [0, height / 2, 0])
  const mat = partMaterial(
    part,
    material(part.primaryColor ?? input.primaryColor ?? '#f8fafc', 0.54, 0.12),
  )
  const profile: Array<[number, number]> = [
    [baseRadius, -height / 2],
    [baseRadius * 0.9, -height * 0.4],
    [waistRadius, -height * 0.07],
    [waistRadius * 1.08, height * 0.22],
    [topRadius * 0.92, height * 0.42],
    [topRadius, height / 2],
  ]
  return applyPartRotation(
    [
      {
        kind: 'lathe',
        name: `${part.name ?? input.name ?? 'cooling tower'} hyperboloid shell`,
        semanticRole: part.semanticRole ?? 'cooling_tower_shell',
        sourcePartKind: part.sourcePartKind ?? 'cooling_tower_shell',
        position: center,
        profile,
        segments: ringSegments(input.detail),
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeCoolingTowerRim(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const radius = clamp(part.radius ?? part.majorRadius, 1.1, 0.16, 7)
  const tubeRadius = clamp(part.tubeRadius, Math.max(radius * 0.045, 0.025), 0.006, 0.28)
  const center = add(origin, part.position ?? [0, 7.2, 0])
  const mat = partMaterial(
    part,
    material(part.primaryColor ?? input.primaryColor ?? '#ffffff', 0.5, 0.14),
  )
  return applyPartRotation(
    [
      {
        kind: 'torus',
        name: `${part.name ?? input.name ?? 'cooling tower'} open top rim`,
        semanticRole: part.semanticRole ?? 'top_steam_opening',
        sourcePartKind: part.sourcePartKind ?? 'cooling_tower_rim',
        position: center,
        axis: 'y',
        majorRadius: radius,
        tubeRadius,
        radialSegments: ringSegments(input.detail),
        tubularSegments: 12,
        material: mat,
      },
    ],
    center,
    part.rotation,
  )
}

export function composeChimneyStack(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const height = clamp(part.height ?? part.length, 6, 0.6, 80)
  const baseRadius = clamp(part.radius ?? part.width ?? part.diameter, height * 0.055, 0.05, 6)
  const topRadius = clamp(part.topRadius, baseRadius * 0.72, baseRadius * 0.28, baseRadius)
  const rawCenter = add(origin, part.position ?? [0, height / 2, 0])
  const center: Vec3 = [rawCenter[0], Math.max(rawCenter[1], origin[1] + height / 2), rawCenter[2]]
  const shaftMaterial = partMaterial(part, material(input.primaryColor ?? '#d8d4ca', 0.58, 0.18))
  const concreteMaterial = material('#d8d4ca', 0.62, 0.12)
  const redMaterial = material(part.secondaryColor ?? input.secondaryColor ?? '#b91c1c', 0.46, 0.22)
  const whiteMaterial = material('#f8fafc', 0.5, 0.1)
  const darkMaterial = material(input.darkColor ?? '#111827', 0.5, 0.25)
  const radiusAt = (y: number) => {
    const t = Math.max(0, Math.min(1, y / height))
    return baseRadius + (topRadius - baseRadius) * t
  }
  const makeBand = (
    name: string,
    yMin: number,
    yMax: number,
    bandMaterial: PrimitiveMaterialInput,
    semanticRole: string,
    oversize = 1.018,
  ): PrimitiveShapeInput => ({
    kind: 'frustum',
    name,
    semanticRole,
    sourcePartKind: part.sourcePartKind ?? 'chimney_stack',
    position: [center[0], center[1] - height / 2 + (yMin + yMax) / 2, center[2]],
    axis: 'y',
    radiusBottom: radiusAt(yMin) * oversize,
    radiusTop: radiusAt(yMax) * oversize,
    height: yMax - yMin,
    radialSegments: ringSegments(input.detail),
    material: bandMaterial,
  })

  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'frustum',
      name: `${part.name ?? input.name ?? 'chimney'} tapered chimney shell`,
      semanticRole: part.semanticRole ?? 'chimney_body',
      sourcePartKind: part.sourcePartKind ?? 'chimney_stack',
      position: center,
      axis: 'y',
      radiusBottom: baseRadius,
      radiusTop: topRadius,
      height,
      radialSegments: ringSegments(input.detail),
      material: shaftMaterial,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'chimney'} reinforced base plinth`,
      semanticRole: 'chimney_base',
      sourcePartKind: part.sourcePartKind ?? 'chimney_stack',
      position: [center[0], center[1] - height / 2 + height * 0.025, center[2]],
      axis: 'y',
      radius: baseRadius * 1.42,
      height: height * 0.05,
      radialSegments: ringSegments(input.detail),
      material: concreteMaterial,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'chimney'} top rim`,
      semanticRole: 'chimney_top_rim',
      sourcePartKind: part.sourcePartKind ?? 'chimney_stack',
      position: [center[0], center[1] + height / 2, center[2]],
      axis: 'y',
      majorRadius: topRadius * 1.03,
      tubeRadius: Math.max(topRadius * 0.045, 0.012),
      radialSegments: ringSegments(input.detail),
      tubularSegments: 12,
      material: darkMaterial,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'chimney'} lower access door`,
      semanticRole: 'access_door',
      sourcePartKind: part.sourcePartKind ?? 'chimney_stack',
      position: [center[0], center[1] - height * 0.42, center[2] + baseRadius * 1.025],
      rotation: [Math.PI / 2, 0, 0],
      length: baseRadius * 0.46,
      width: height * 0.11,
      thickness: Math.max(baseRadius * 0.025, 0.006),
      cornerRadius: baseRadius * 0.03,
      cornerSegments: 3,
      material: darkMaterial,
    },
  ]

  const seamCount = clampInt(part.ringCount, Math.max(5, Math.round(height / 1.1)), 3, 24)
  for (let i = 1; i < seamCount; i += 1) {
    const y = (height * i) / seamCount
    shapes.push({
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'chimney'} concrete lift seam`,
      semanticRole: 'chimney_seam_ring',
      sourcePartKind: part.sourcePartKind ?? 'chimney_stack',
      position: [center[0], center[1] - height / 2 + y, center[2]],
      axis: 'y',
      majorRadius: radiusAt(y) * 1.012,
      tubeRadius: Math.max(baseRadius * 0.006, 0.004),
      radialSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.6)),
      tubularSegments: 8,
      material: material('#b8b4aa', 0.64, 0.08),
    })
  }

  const stripeIntent = `${part.variant ?? ''} ${part.style ?? ''} ${input.name ?? ''}`.toLowerCase()
  const warningStripes =
    part.warningStripes === true || /red.?white|stripe|striped|warning|红白|紅白/.test(stripeIntent)
  if (warningStripes) {
    const stripeCount = clampInt(part.stripeCount ?? part.count, 5, 2, 12)
    const stripeZoneHeight = clamp(part.stripeHeight, height * 0.36, height * 0.12, height * 0.7)
    const yStart = height - stripeZoneHeight
    const stripeStep = stripeZoneHeight / stripeCount
    for (let i = 0; i < stripeCount; i += 1) {
      const yMin = yStart + i * stripeStep
      const yMax = yStart + (i + 1) * stripeStep
      shapes.push(
        makeBand(
          `${part.name ?? input.name ?? 'chimney'} ${i % 2 === 0 ? 'red' : 'white'} warning band`,
          yMin,
          yMax,
          i % 2 === 0 ? redMaterial : whiteMaterial,
          i % 2 === 0 ? 'chimney_warning_red_band' : 'chimney_warning_white_band',
        ),
      )
    }
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeValveBody(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const ballValve = isBallValveIntent(input, part)
  const axis = partAxis(part.axis, 'x')
  const center = add(origin, part.position ?? [0, 0.38, 0])
  const radius = clamp(part.radius, 0.12, 0.03, 0.8)
  const length = clamp(part.length ?? part.depth, 0.46, 0.12, 2)
  const mat = partMaterial(part, material(input.primaryColor ?? '#475569', 0.45, 0.45))
  const metalMat = material(input.metalColor ?? '#cbd5e1', 0.28, 0.78)
  const darkMat = material(input.darkColor ?? '#1f2937', 0.42, 0.5)
  const bonnetY = center[1] + radius * 1.16
  const yokeBaseY = center[1] + radius * 1.72
  const ballValveDetails: PrimitiveShapeInput[] = [
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} valve ball`,
      position: center,
      radius: 1,
      scale: [radius * 0.68, radius * 0.68, radius * 0.68],
      widthSegments: ringSegments(input.detail),
      heightSegments: Math.max(16, Math.round(ringSegments(input.detail) * 0.5)),
      material: metalMat,
      semanticRole: 'valve_ball',
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} valve ball bore`,
      position: center,
      axis,
      radius: radius * 0.24,
      height: length * 0.72,
      radialSegments: 20,
      material: darkMat,
      semanticRole: 'valve_bore',
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} inlet seat ring`,
      position: offsetAlongAxis(center, axis, -length * 0.28),
      axis,
      majorRadius: radius * 0.38,
      tubeRadius: radius * 0.035,
      radialSegments: 8,
      tubularSegments: 32,
      material: darkMat,
      semanticRole: 'seat_ring',
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} outlet seat ring`,
      position: offsetAlongAxis(center, axis, length * 0.28),
      axis,
      majorRadius: radius * 0.38,
      tubeRadius: radius * 0.035,
      radialSegments: 8,
      tubularSegments: 32,
      material: darkMat,
      semanticRole: 'seat_ring',
    },
  ]
  const gateValveDetails: PrimitiveShapeInput[] = [
    {
      kind: 'wedge',
      name: `${part.name ?? input.name ?? 'object'} valve gate wedge`,
      position: [center[0], center[1] - radius * 0.1, center[2]],
      length: radius * 0.8,
      width: radius * 0.42,
      height: radius * 0.72,
      slopeAxis: 'x',
      slopeDirection: 'positive',
      material: material(input.secondaryColor ?? '#334155', 0.48, 0.35),
      semanticRole: 'gate_wedge',
    },
  ]
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} valve body barrel`,
      position: center,
      axis,
      radius,
      height: length,
      radialSegments: ringSegments(input.detail),
      material: mat,
      semanticRole: 'valve_body',
    },
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} valve bulb chamber`,
      position: center,
      radius: 1,
      scale: [radius * 1.08, radius * 1.2, radius * 1.08],
      widthSegments: ringSegments(input.detail),
      heightSegments: Math.max(16, Math.round(ringSegments(input.detail) * 0.5)),
      material: mat,
      semanticRole: 'valve_body',
    },
    ...(ballValve ? ballValveDetails : gateValveDetails),
    {
      kind: 'frustum',
      name: `${part.name ?? input.name ?? 'object'} valve bonnet`,
      position: [center[0], bonnetY, center[2]],
      axis: 'y',
      radiusBottom: radius * 0.62,
      radiusTop: radius * 0.42,
      height: radius * 0.42,
      radialSegments: Math.max(20, Math.round(ringSegments(input.detail) * 0.55)),
      material: mat,
      semanticRole: 'bonnet',
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} valve stem`,
      position: [center[0], center[1] + radius * 1.35, center[2]],
      axis: 'y',
      radius: radius * 0.18,
      height: radius * 0.9,
      radialSegments: 16,
      material: metalMat,
      semanticRole: 'stem',
    },
  ]
  if (!ballValve) {
    for (const z of [-radius * 0.48, radius * 0.48]) {
      shapes.push({
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} valve yoke post`,
        position: [center[0], yokeBaseY, center[2] + z],
        axis: 'y',
        radius: radius * 0.08,
        height: radius * 0.95,
        radialSegments: 12,
        material: metalMat,
        semanticRole: 'yoke',
      })
    }
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} valve yoke bridge`,
      position: [center[0], yokeBaseY + radius * 0.48, center[2]],
      axis: 'z',
      radius: radius * 0.07,
      height: radius * 1.15,
      radialSegments: 12,
      material: metalMat,
      semanticRole: 'yoke',
    })
  }
  for (let i = 0; i < 6; i += 1) {
    const angle = (i * Math.PI * 2) / 6
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} valve bonnet bolt ${i + 1}`,
      position: [
        center[0] + Math.cos(angle) * radius * 0.54,
        bonnetY - radius * 0.22,
        center[2] + Math.sin(angle) * radius * 0.54,
      ],
      axis: 'y',
      radius: radius * 0.045,
      height: radius * 0.12,
      radialSegments: 8,
      material: darkMat,
      semanticRole: 'bonnet_bolts',
    })
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeHandwheel(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const leverHandle = /lever|handle|bar|手柄|把手/i.test(partIntentText(input, part))
  const axis = partAxis(part.axis, 'y')
  const center = add(origin, part.position ?? [0, 0.62, 0])
  const radius = clamp(part.radius, 0.11, 0.025, 0.6)
  const wire = clamp(part.wireRadius, radius * 0.08, 0.002, 0.04)
  const spokeCount = clampInt(part.spokeCount ?? part.count, 4, 3, 8)
  const mat = partMaterial(part, material(input.darkColor ?? '#1f2937', 0.45, 0.45))
  if (leverHandle) {
    const leverLength = clamp(part.length, radius * 2.6, radius * 1.1, radius * 5)
    return applyPartRotation(
      [
        {
          kind: 'cylinder',
          name: `${part.name ?? input.name ?? 'object'} handwheel hub`,
          position: center,
          axis: 'y',
          radius: radius * 0.22,
          height: wire * 3.2,
          radialSegments: 16,
          material: mat,
        },
        {
          kind: 'capsule',
          name: `${part.name ?? input.name ?? 'object'} lever handle`,
          position: [center[0], center[1], center[2] + leverLength * 0.42] as Vec3,
          axis: 'z',
          radius: wire,
          height: leverLength,
          radialSegments: 12,
          material: mat,
        },
        {
          kind: 'sphere',
          name: `${part.name ?? input.name ?? 'object'} lever end knob`,
          position: [center[0], center[1], center[2] + leverLength * 0.92] as Vec3,
          radius: wire * 2.3,
          material: mat,
        },
      ],
      center,
      part.rotation,
    )
  }
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} handwheel rim`,
      position: center,
      axis,
      majorRadius: radius,
      tubeRadius: wire,
      radialSegments: 12,
      tubularSegments: ringSegments(input.detail),
      material: mat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} handwheel hub`,
      position: center,
      axis,
      radius: radius * 0.22,
      height: wire * 2.6,
      radialSegments: 16,
      material: mat,
    },
  ]
  for (let i = 0; i < spokeCount; i += 1) {
    const angle = angularStep(i, spokeCount)
    const position = radialPointOnAxis(center, axis, angle, radius * 0.5)
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} handwheel spoke ${i + 1}`,
      position,
      rotation: axis === 'y' ? [0, 0, angle] : [0, angle, 0],
      axis: axis === 'y' ? 'x' : 'z',
      radius: wire * 0.5,
      height: radius,
      radialSegments: 8,
      material: mat,
    })
  }
  return applyPartRotation(shapes, center, part.rotation)
}
