import {
  add,
  applyPartRotation,
  axisNormal,
  clamp,
  clampInt,
  material,
  offsetAlongAxis,
  partAxis,
  partMaterial,
  ringSegments,
  tubeBetween,
} from '../shared'
import type { PartComposeInput, PartComposePartInput, PrimitiveShapeInput, Vec3 } from '../types'
import { detailDefaultInt } from './basic-machine'
import { composePipePort } from './process-equipment'

export function composeGearboxBody(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.34, 0])
  const length = clamp(part.length, 0.46, 0.12, 2)
  const width = clamp(part.width, 0.34, 0.08, 1.4)
  const height = clamp(part.height, 0.34, 0.08, 1.4)
  const mat = partMaterial(part, material(input.primaryColor ?? '#64748b', 0.46, 0.38))
  const metal = material(input.metalColor ?? '#cbd5e1', 0.28, 0.78)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} gearbox housing`,
      position: center,
      length,
      width,
      height,
      cornerRadius: Math.min(length, width, height) * 0.1,
      cornerSegments: 5,
      material: mat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} gearbox output shaft`,
      position: [center[0] + length * 0.68, center[1], center[2]],
      axis: 'x',
      radius: height * 0.14,
      height: length * 0.34,
      radialSegments: 20,
      material: metal,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} gearbox input shaft`,
      position: [center[0] - length * 0.62, center[1] + height * 0.18, center[2]],
      axis: 'x',
      radius: height * 0.1,
      height: length * 0.24,
      radialSegments: 18,
      material: metal,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} gearbox nameplate`,
      position: [center[0], center[1] + height * 0.04, center[2] + width * 0.51],
      length: length * 0.36,
      width: height * 0.18,
      thickness: width * 0.025,
      cornerRadius: height * 0.015,
      cornerSegments: 3,
      material: material(input.metalColor ?? '#facc15', 0.24, 0.65),
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeFilterVessel(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.62, 0])
  const radius = clamp(part.radius, 0.18, 0.05, 1.2)
  const height = clamp(part.height ?? part.length, 0.72, 0.18, 3)
  const mat = partMaterial(part, material(input.primaryColor ?? '#94a3b8', 0.42, 0.45))
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} filter vessel shell`,
      position: center,
      axis: 'y',
      radius,
      height,
      radialSegments: ringSegments(input.detail),
      material: mat,
    },
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} filter top cap`,
      position: [center[0], center[1] + height * 0.53, center[2]],
      radius: 1,
      scale: [radius, radius * 0.32, radius],
      material: mat,
    },
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} filter bottom cap`,
      position: [center[0], center[1] - height * 0.53, center[2]],
      radius: 1,
      scale: [radius, radius * 0.32, radius],
      material: mat,
    },
    ...composePipePort(
      input,
      {
        kind: 'inlet_port',
        name: `${part.name ?? input.name ?? 'object'} filter inlet`,
        position: [center[0] - radius * 0.95, center[1] + height * 0.18, center[2]],
        axis: 'x',
        side: 'left',
        radius: radius * 0.18,
        length: radius * 0.7,
      },
      [0, 0, 0],
      'inlet_port',
    ),
    ...composePipePort(
      input,
      {
        kind: 'outlet_port',
        name: `${part.name ?? input.name ?? 'object'} filter outlet`,
        position: [center[0] + radius * 0.95, center[1] - height * 0.18, center[2]],
        axis: 'x',
        side: 'right',
        radius: radius * 0.18,
        length: radius * 0.7,
      },
      [0, 0, 0],
      'outlet_port',
    ),
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeHeatExchanger(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const axis = partAxis(part.axis, 'x')
  const center = add(origin, part.position ?? [0, 0.52, 0])
  const radius = clamp(part.radius, 0.18, 0.05, 1.2)
  const length = clamp(part.length ?? part.height, 1.0, 0.24, 5)
  const mat = partMaterial(part, material(input.primaryColor ?? '#9ca3af', 0.42, 0.5))
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} heat exchanger shell`,
      position: center,
      axis,
      radius,
      height: length,
      radialSegments: ringSegments(input.detail),
      material: mat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} heat exchanger left channel head`,
      position: offsetAlongAxis(center, axis, -length * 0.55),
      axis,
      radius: radius * 1.04,
      height: length * 0.08,
      radialSegments: ringSegments(input.detail),
      material: mat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} heat exchanger right channel head`,
      position: offsetAlongAxis(center, axis, length * 0.55),
      axis,
      radius: radius * 1.04,
      height: length * 0.08,
      radialSegments: ringSegments(input.detail),
      material: mat,
    },
    ...[-0.36, -0.12, 0.12, 0.36].map(
      (offset): PrimitiveShapeInput => ({
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} heat exchanger tube bundle`,
        position:
          axis === 'x'
            ? [center[0], center[1] + radius * offset, center[2] + radius * 0.18]
            : [center[0] + radius * offset, center[1], center[2] + radius * 0.18],
        axis,
        radius: radius * 0.035,
        height: length * 0.86,
        radialSegments: 10,
        material: material(input.metalColor ?? '#cbd5e1', 0.3, 0.75),
      }),
    ),
    ...composePipePort(
      input,
      {
        kind: 'inlet_port',
        name: `${part.name ?? input.name ?? 'object'} heat exchanger top nozzle`,
        position: [center[0] - length * 0.25, center[1] + radius * 1.15, center[2]],
        axis: 'y',
        side: 'top',
        radius: radius * 0.14,
        length: radius * 0.45,
      },
      [0, 0, 0],
      'inlet_port',
    ),
    ...composePipePort(
      input,
      {
        kind: 'outlet_port',
        name: `${part.name ?? input.name ?? 'object'} heat exchanger bottom nozzle`,
        position: [center[0] + length * 0.25, center[1] - radius * 1.15, center[2]],
        axis: 'y',
        side: 'bottom',
        radius: radius * 0.14,
        length: radius * 0.45,
      },
      [0, 0, 0],
      'outlet_port',
    ),
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeAgitatorTank(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.58, 0])
  const radius = clamp(part.radius, 0.24, 0.06, 1.5)
  const height = clamp(part.height ?? part.length, 0.7, 0.2, 3)
  const wallThickness = clamp(
    part.thickness ?? part.shellThickness,
    radius * 0.075,
    radius * 0.02,
    radius * 0.28,
  )
  const mat = partMaterial(part, material(input.primaryColor ?? '#94a3b8', 0.42, 0.46))
  const metal = material(input.metalColor ?? '#cbd5e1', 0.28, 0.78)
  const dark = material(part.motorColor ?? input.darkColor ?? '#1f2937', 0.56, 0.24)
  const legStyle = String(part.legStyle ?? '').toLowerCase()
  const bottomStyle = String(part.bottomStyle ?? '').toLowerCase()
  const legCount = clampInt(part.legCount ?? part.count, legStyle === 'splayed' ? 3 : 4, 3, 4)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'object'} agitator tank shell`,
      semanticRole: part.semanticRole ?? 'reactor_vessel_shell',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      position: center,
      axis: 'y',
      radius,
      height,
      wallThickness,
      radialSegments: ringSegments(input.detail),
      material: mat,
    },
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} agitator top dished head`,
      semanticRole: 'vessel_head',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      position: [center[0], center[1] + height * 0.52, center[2]],
      radius: 1,
      scale: [radius, radius * 0.32, radius],
      widthSegments: ringSegments(input.detail),
      heightSegments: Math.max(16, Math.round(ringSegments(input.detail) * 0.5)),
      material: mat,
    },
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} agitator bottom dished head`,
      semanticRole: 'vessel_head',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      position: [center[0], center[1] - height * 0.52, center[2]],
      radius: 1,
      scale: [radius, radius * 0.26, radius],
      widthSegments: ringSegments(input.detail),
      heightSegments: Math.max(16, Math.round(ringSegments(input.detail) * 0.5)),
      material: mat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} agitator top seam ring`,
      semanticRole: 'vessel_seam',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      position: [center[0], center[1] + height * 0.5, center[2]],
      axis: 'y',
      majorRadius: radius * 1.01,
      tubeRadius: wallThickness * 0.45,
      radialSegments: 10,
      tubularSegments: Math.max(24, Math.round(ringSegments(input.detail) * 0.7)),
      material: metal,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} agitator motor`,
      semanticRole: 'agitator_motor',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      position: [center[0], center[1] + height * 0.66, center[2]],
      axis: 'y',
      radius: radius * 0.22,
      height: radius * 0.38,
      radialSegments: 24,
      material: dark,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} agitator shaft`,
      semanticRole: 'agitator_shaft',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      position: [center[0], center[1] + height * 0.05, center[2]],
      axis: 'y',
      radius: radius * 0.035,
      height: height * 0.9,
      radialSegments: 12,
      material: metal,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} agitator hub`,
      semanticRole: 'agitator_hub',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      position: [center[0], center[1] - height * 0.22, center[2]],
      axis: 'y',
      radius: radius * 0.12,
      height: radius * 0.16,
      radialSegments: 18,
      material: metal,
    },
  ]
  if (bottomStyle === 'conical') {
    shapes.push({
      kind: 'frustum',
      name: `${part.name ?? input.name ?? 'object'} conical discharge bottom`,
      semanticRole: 'conical_discharge_bottom',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      position: [center[0], center[1] - height * 0.52 - radius * 0.18, center[2]],
      axis: 'y',
      radiusTop: radius * 0.42,
      radiusBottom: radius * 0.12,
      height: radius * 0.36,
      radialSegments: ringSegments(input.detail),
      material: mat,
    })
  }
  for (let i = 0; i < 3; i += 1) {
    const angle = (i * Math.PI * 2) / 3
    shapes.push({
      kind: 'capsule',
      name: `${part.name ?? input.name ?? 'object'} agitator blade ${i + 1}`,
      semanticRole: 'reactor_impeller',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      position: [
        center[0] + Math.cos(angle) * radius * 0.22,
        center[1] - height * 0.22,
        center[2] + Math.sin(angle) * radius * 0.22,
      ],
      rotation: [0, 0, angle],
      axis: 'x',
      radius: radius * 0.035,
      height: radius * 0.55,
      radialSegments: 10,
      capSegments: 3,
      material: metal,
    })
  }
  shapes.push(
    {
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'object'} agitator side inlet nozzle`,
      semanticRole: 'feed_nozzle',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      position: [center[0] - radius * 1.06, center[1] + height * 0.16, center[2]],
      axis: 'x',
      radius: radius * 0.13,
      height: radius * 0.48,
      wallThickness: wallThickness * 0.65,
      radialSegments: 20,
      material: mat,
    },
    {
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} agitator manway flange`,
      semanticRole: 'manway_flange',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      position: [center[0] + radius * 1.04, center[1] + height * 0.1, center[2]],
      axis: 'x',
      radius: radius * 0.2,
      height: wallThickness * 3,
      radialSegments: 28,
      material: dark,
    },
  )
  for (let i = 0; i < legCount; i += 1) {
    const angle =
      legCount === 3 ? -Math.PI / 2 + (i * Math.PI * 2) / 3 : Math.PI / 4 + (i * Math.PI * 2) / 4
    const topRadius = radius * 0.58
    const footRadius = legStyle === 'splayed' ? radius * 0.86 : radius * 0.62
    const topY = center[1] - height * 0.5 - radius * 0.02
    const bottomY = center[1] - height * 0.5 - radius * 0.5
    const start: Vec3 = [
      center[0] + Math.cos(angle) * topRadius,
      topY,
      center[2] + Math.sin(angle) * topRadius,
    ]
    const end: Vec3 = [
      center[0] + Math.cos(angle) * footRadius,
      bottomY,
      center[2] + Math.sin(angle) * footRadius,
    ]
    shapes.push({
      ...tubeBetween(
        `${part.name ?? input.name ?? 'object'} agitator support leg`,
        start,
        end,
        radius * 0.04,
        dark,
      ),
      semanticRole: 'support_leg',
      sourcePartKind: part.sourcePartKind ?? 'agitator_tank',
      radialSegments: 12,
    })
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composePipeRack(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.45, 0])
  const length = clamp(part.length, 1.4, 0.3, 6)
  const width = clamp(part.width, 0.5, 0.12, 2.5)
  const height = clamp(part.height, 0.7, 0.2, 3)
  const pipeCount = clampInt(part.count, 3, 1, 8)
  const r = clamp(part.radius ?? part.wireRadius, 0.025, 0.006, 0.12)
  const steel = partMaterial(part, material(input.metalColor ?? '#94a3b8', 0.34, 0.72))
  const pipeMat = material(input.primaryColor ?? '#64748b', 0.45, 0.42)
  const shapes: PrimitiveShapeInput[] = []
  for (const x of [-length / 2, length / 2]) {
    for (const z of [-width / 2, width / 2]) {
      shapes.push({
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} pipe rack column`,
        position: [center[0] + x, center[1], center[2] + z],
        axis: 'y',
        radius: r,
        height,
        radialSegments: 12,
        material: steel,
      })
    }
  }
  for (const z of [-width / 2, width / 2]) {
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} pipe rack beam`,
      position: [center[0], center[1] + height / 2, center[2] + z],
      length,
      width: r * 1.6,
      height: r * 1.6,
      material: steel,
    })
  }
  for (let i = 0; i < pipeCount; i += 1) {
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} rack pipe ${i + 1}`,
      position: [
        center[0],
        center[1] + height * 0.55,
        center[2] + (i - (pipeCount - 1) / 2) * ((width * 0.72) / Math.max(1, pipeCount - 1)),
      ],
      axis: 'x',
      radius: r * 0.85,
      height: length * 1.08,
      radialSegments: 16,
      material: pipeMat,
    })
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composePlatformLadder(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.75, 0])
  const length = clamp(part.length, 0.72, 0.2, 3)
  const width = clamp(part.width, 0.48, 0.12, 2)
  const height = clamp(part.height, 0.9, 0.25, 4)
  const r = clamp(part.radius ?? part.wireRadius, 0.018, 0.004, 0.08)
  const steel = partMaterial(part, material(input.metalColor ?? '#94a3b8', 0.34, 0.72))
  const defaultRungCount = detailDefaultInt(input, part, {
    low: Math.max(4, Math.round(height / 0.26)),
    medium: Math.max(5, Math.round(height / 0.18)),
    high: Math.max(7, Math.round(height / 0.14)),
  })
  const rungCount = clampInt(part.rungCount ?? part.count, defaultRungCount, 4, 16)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} access platform deck`,
      semanticRole: part.semanticRole ?? 'access_platform',
      sourcePartKind: part.sourcePartKind ?? 'platform_ladder',
      position: [center[0], center[1] + height * 0.18, center[2]],
      length,
      width,
      height: r * 0.8,
      material: steel,
    },
  ]
  for (let i = 1; i < 4; i += 1) {
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} platform deck grating ${i}`,
      semanticRole: 'platform_grating',
      sourcePartKind: part.sourcePartKind ?? 'platform_ladder',
      position: [
        center[0],
        center[1] + height * 0.185,
        center[2] - width * 0.35 + i * width * 0.18,
      ],
      length: length * 0.92,
      width: r * 0.36,
      height: r * 0.9,
      material: steel,
    })
  }
  for (const x of [-length / 2, length / 2]) {
    for (const z of [-width / 2, width / 2]) {
      shapes.push({
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} platform support post`,
        semanticRole: 'platform_post',
        sourcePartKind: part.sourcePartKind ?? 'platform_ladder',
        position: [center[0] + x, center[1] - height * 0.25, center[2] + z],
        axis: 'y',
        radius: r,
        height,
        radialSegments: 12,
        material: steel,
      })
    }
  }
  for (const [name, z] of [
    ['front', width / 2],
    ['back', -width / 2],
  ] as const) {
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} platform guard rail ${name}`,
      semanticRole: 'guard_rail',
      sourcePartKind: part.sourcePartKind ?? 'platform_ladder',
      position: [center[0], center[1] + height * 0.42, center[2] + z],
      axis: 'x',
      radius: r,
      height: length,
      radialSegments: 12,
      material: steel,
    })
  }
  for (const [name, x] of [
    ['left', -length / 2],
    ['right', length / 2],
  ] as const) {
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} platform side guard rail ${name}`,
      semanticRole: 'guard_rail',
      sourcePartKind: part.sourcePartKind ?? 'platform_ladder',
      position: [center[0] + x, center[1] + height * 0.42, center[2]],
      axis: 'z',
      radius: r,
      height: width,
      radialSegments: 12,
      material: steel,
    })
  }
  for (const z of [center[2] - width * 0.68, center[2] - width * 0.48]) {
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} ladder side rail`,
      semanticRole: 'ladder_side_rail',
      sourcePartKind: part.sourcePartKind ?? 'platform_ladder',
      position: [center[0] - length * 0.62, center[1] - height * 0.1, z],
      axis: 'y',
      radius: r,
      height: height * 0.92,
      radialSegments: 10,
      material: steel,
    })
  }
  for (let i = 0; i < rungCount; i += 1) {
    shapes.push({
      kind: 'cylinder',
      name: `${part.name ?? input.name ?? 'object'} ladder rung ${i + 1}`,
      semanticRole: 'ladder_rung',
      sourcePartKind: part.sourcePartKind ?? 'platform_ladder',
      position: [
        center[0] - length * 0.62,
        center[1] - height * 0.55 + ((i + 1) * (height * 0.82)) / (rungCount + 1),
        center[2] - width * 0.58,
      ],
      axis: 'z',
      radius: r * 0.65,
      height: width * 0.42,
      radialSegments: 10,
      material: steel,
    })
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeNameplate(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.45, 0.21])
  const length = clamp(part.length, 0.18, 0.04, 0.8)
  const width = clamp(part.width ?? part.height, 0.08, 0.02, 0.4)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} nameplate`,
      position: center,
      length,
      width,
      thickness: clamp(part.depth, 0.008, 0.002, 0.04),
      cornerRadius: Math.min(length, width) * 0.08,
      cornerSegments: 3,
      material: partMaterial(part, material(input.metalColor ?? '#facc15', 0.24, 0.65)),
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeWarningLabel(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0.08, 0.5, 0.215])
  const length = clamp(part.length, 0.14, 0.04, 0.6)
  const width = clamp(part.width ?? part.height, 0.07, 0.02, 0.3)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} warning label`,
      position: center,
      length,
      width,
      thickness: clamp(part.depth, 0.006, 0.001, 0.03),
      cornerRadius: Math.min(length, width) * 0.06,
      cornerSegments: 3,
      material: partMaterial(part, material('#f59e0b', 0.5, 0.02)),
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeSeamRing(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const axis = partAxis(part.axis, 'z')
  const center = add(origin, part.position ?? [0, 0.5, 0])
  const radius = clamp(part.radius, 0.2, 0.02, 2)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} seam ring`,
      position: center,
      axis,
      majorRadius: radius,
      tubeRadius: clamp(part.wireRadius, radius * 0.018, 0.002, 0.03),
      radialSegments: 8,
      tubularSegments: ringSegments(input.detail),
      material: partMaterial(part, material(input.darkColor ?? '#334155', 0.5, 0.18)),
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeDeskTop(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 1.2, 0.35, 4)
  const width = clamp(part.width ?? part.depth, 0.6, 0.2, 2)
  const thickness = clamp(part.height ?? part.depth, 0.055, 0.02, 0.18)
  const center = add(origin, part.position ?? [0, 0.74, 0])
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} desk top`,
      position: center,
      length,
      width,
      thickness,
      cornerRadius: Math.min(length, width) * 0.035,
      cornerSegments: 5,
      material: partMaterial(part, material(input.primaryColor ?? '#b7794b', 0.62, 0.02)),
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeLegSet(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 1.08, 0.25, 4)
  const width = clamp(part.width ?? part.depth, 0.5, 0.15, 2)
  const height = clamp(part.height, 0.7, 0.12, 1.4)
  const radius = clamp(part.radius, 0.025, 0.008, 0.09)
  const center = add(origin, part.position ?? [0, height / 2, 0])
  const insetX = Math.max(radius * 2.2, length * 0.08)
  const insetZ = Math.max(radius * 2.2, width * 0.1)
  const legMat = partMaterial(part, material(input.metalColor ?? '#9ca3af', 0.36, 0.68))
  const shapes: PrimitiveShapeInput[] = []

  for (const x of [-length / 2 + insetX, length / 2 - insetX]) {
    for (const z of [-width / 2 + insetZ, width / 2 - insetZ]) {
      shapes.push({
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} desk leg`,
        position: [center[0] + x, center[1], center[2] + z],
        axis: 'y',
        radius,
        height,
        radialSegments: 16,
        material: legMat,
      })
    }
  }

  shapes.push({
    kind: 'cylinder',
    name: `${part.name ?? input.name ?? 'object'} rear stretcher`,
    position: [center[0], center[1] + height * 0.2, center[2] - width / 2 + insetZ],
    axis: 'x',
    radius: radius * 0.6,
    height: length - insetX * 2,
    radialSegments: 10,
    material: legMat,
  })

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeDrawerStack(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 0.34, 0.14, 1.2)
  const width = clamp(part.width ?? part.depth, 0.44, 0.12, 1)
  const height = clamp(part.height, 0.52, 0.16, 1.1)
  const drawerCount = clampInt(part.count, 3, 1, 6)
  const center = add(origin, part.position ?? [0.38, 0.46, 0])
  const mat = partMaterial(part, material(input.primaryColor ?? '#a16207', 0.58, 0.03))
  const faceMat = material(input.secondaryColor ?? '#c08457', 0.56, 0.02)
  const metal = material(input.metalColor ?? '#d1d5db', 0.26, 0.72)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} drawer stack cabinet`,
      position: center,
      length,
      width,
      height,
      cornerRadius: Math.min(length, width, height) * 0.045,
      cornerSegments: 4,
      material: mat,
    },
  ]

  for (let i = 0; i < drawerCount; i += 1) {
    const y = center[1] + height / 2 - ((i + 0.5) * height) / drawerCount
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} drawer front ${i + 1}`,
      position: [center[0], y, center[2] + width * 0.51],
      length: length * 0.88,
      width: width * 0.035,
      height: (height / drawerCount) * 0.72,
      cornerRadius: Math.min(length, height / drawerCount) * 0.035,
      cornerSegments: 3,
      material: faceMat,
    })
    shapes.push({
      kind: 'capsule',
      name: `${part.name ?? input.name ?? 'object'} drawer handle ${i + 1}`,
      position: [center[0], y, center[2] + width * 0.545],
      axis: 'x',
      radius: length * 0.018,
      height: length * 0.34,
      radialSegments: 10,
      capSegments: 3,
      material: metal,
    })
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeElectricalCabinet(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 0.55, 0.18, 2)
  const width = clamp(part.width ?? part.depth, 0.22, 0.08, 1)
  const height = clamp(part.height, 0.95, 0.32, 3)
  const center = add(origin, part.position ?? [0, height / 2, 0])
  const bodyMat = partMaterial(part, material(input.primaryColor ?? '#d1d5db', 0.48, 0.22))
  const dark = material(input.darkColor ?? '#334155', 0.48, 0.22)
  const warning = material('#f59e0b', 0.5, 0.02)
  const metal = material(input.metalColor ?? '#cbd5e1', 0.28, 0.74)
  const doorCount = clampInt(part.doorCount, 1, 1, 4)
  const frontNormal: Vec3 = [0, 0, 1]
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} electrical cabinet body`,
      position: center,
      length,
      width,
      height,
      cornerRadius: Math.min(length, width, height) * 0.035,
      bevelRadius: Math.min(length, width, height) * 0.035,
      cornerSegments: 4,
      cutouts: [
        {
          id: 'cabinet_door_recess',
          kind: 'rectangular',
          semanticRole: 'access_door',
          position: [center[0], center[1], center[2] + width * 0.51],
          normal: frontNormal,
          axis: 'z',
          length: length * 0.92,
          height: height * 0.86,
          depth: width * 0.035,
          bevelRadius: Math.min(length, height) * 0.02,
        },
        {
          id: 'cabinet_nameplate_recess',
          kind: 'rectangular',
          semanticRole: 'nameplate',
          position: [
            center[0] - length * 0.22,
            center[1] - height * 0.22,
            center[2] + width * 0.56,
          ],
          normal: frontNormal,
          axis: 'z',
          length: length * 0.24,
          height: height * 0.055,
          depth: width * 0.02,
          bevelRadius: length * 0.008,
        },
        {
          id: 'cabinet_vent_opening',
          kind: 'slot',
          semanticRole: 'vent',
          position: [center[0], center[1] - height * 0.28, center[2] + width * 0.56],
          normal: frontNormal,
          axis: 'z',
          length: length * 0.42,
          height: height * 0.16,
          depth: width * 0.02,
          bevelRadius: height * 0.006,
        },
      ],
      ports: [
        {
          id: 'cabinet_access_front',
          kind: 'access',
          semanticRole: 'access_door',
          position: [center[0], center[1], center[2] + width * 0.56],
          normal: frontNormal,
          axis: 'z',
          width: length * 0.92,
          height: height * 0.86,
          direction: 'bidirectional',
        },
      ],
      material: bodyMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} electrical cabinet door panel`,
      position: [center[0], center[1], center[2] + width * 0.515],
      length: length * 0.92,
      width: width * 0.035,
      height: height * 0.86,
      cornerRadius: Math.min(length, height) * 0.02,
      cornerSegments: 3,
      material: bodyMat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} electrical cabinet warning label`,
      position: [center[0] - length * 0.22, center[1] + height * 0.22, center[2] + width * 0.57],
      length: length * 0.2,
      width: width * 0.02,
      height: height * 0.08,
      cornerRadius: length * 0.01,
      cornerSegments: 3,
      material: warning,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} electrical cabinet nameplate`,
      position: [center[0] - length * 0.22, center[1] - height * 0.22, center[2] + width * 0.57],
      length: length * 0.24,
      width: width * 0.02,
      height: height * 0.055,
      cornerRadius: length * 0.008,
      cornerSegments: 3,
      material: metal,
    },
  ]

  for (let i = 1; i < doorCount; i += 1) {
    const x = center[0] - length * 0.46 + (length * 0.92 * i) / doorCount
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} electrical cabinet door seam ${i}`,
      position: [x, center[1], center[2] + width * 0.54],
      length: length * 0.012,
      width: width * 0.015,
      height: height * 0.82,
      material: dark,
    })
  }

  for (let i = 0; i < doorCount; i += 1) {
    const doorCenterX = center[0] - length * 0.46 + (length * 0.92 * (i + 0.5)) / doorCount
    shapes.push({
      kind: 'capsule',
      name: `${part.name ?? input.name ?? 'object'} electrical cabinet handle ${i + 1}`,
      position: [
        doorCenterX + (length * 0.28) / doorCount,
        center[1] + height * 0.03,
        center[2] + width * 0.565,
      ],
      axis: 'y',
      radius: length * 0.018,
      height: height * 0.2,
      radialSegments: 10,
      capSegments: 3,
      material: metal,
    })
  }

  const slatCount = clampInt(part.slatCount ?? part.count, 5, 2, 10)
  for (let i = 0; i < slatCount; i += 1) {
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} electrical cabinet vent slat ${i + 1}`,
      position: [
        center[0],
        center[1] - height * 0.34 + i * height * 0.028,
        center[2] + width * 0.575,
      ],
      length: length * 0.42,
      width: width * 0.018,
      height: height * 0.008,
      material: dark,
    })
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composePipeRun(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const axis = partAxis(part.axis, 'x')
  const length = clamp(part.length ?? part.height, 1, 0.08, 8)
  const radius = clamp(part.radius, 0.055, 0.008, 0.45)
  const center = add(origin, part.position ?? [0, 0.55, 0])
  const pipeMat = partMaterial(part, material(input.primaryColor ?? '#64748b', 0.42, 0.42))
  const metal = material(input.metalColor ?? '#cbd5e1', 0.28, 0.75)
  const wallThickness = clamp(part.depth, radius * 0.18, radius * 0.05, radius * 0.45)
  const start = offsetAlongAxis(center, axis, -length / 2)
  const end = offsetAlongAxis(center, axis, length / 2)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'hollow-cylinder',
      name: `${part.name ?? input.name ?? 'object'} pipe run`,
      position: center,
      axis,
      radius,
      height: length,
      wallThickness,
      radialSegments: 24,
      duct: {
        crossSection: 'round',
        radius,
        wallThickness,
      },
      ports: [
        {
          id: 'pipe_start',
          kind: 'inlet',
          semanticRole: 'pipe_start',
          position: start,
          normal: axisNormal(axis, -1),
          axis,
          radius,
          direction: 'in',
        },
        {
          id: 'pipe_end',
          kind: 'outlet',
          semanticRole: 'pipe_end',
          position: end,
          normal: axisNormal(axis, 1),
          axis,
          radius,
          direction: 'out',
        },
      ],
      material: pipeMat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} pipe run left coupling`,
      position: start,
      axis,
      majorRadius: radius,
      tubeRadius: radius * 0.12,
      radialSegments: 8,
      tubularSegments: 24,
      material: metal,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} pipe run right coupling`,
      position: end,
      axis,
      majorRadius: radius,
      tubeRadius: radius * 0.12,
      radialSegments: 8,
      tubularSegments: 24,
      material: metal,
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composePipeElbow(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const radius = clamp(part.radius, 0.055, 0.008, 0.45)
  const bendRadius = clamp(
    part.bendRadius ?? part.length ?? part.depth,
    radius * 4.2,
    radius * 1.4,
    2,
  )
  const center = add(origin, part.position ?? [0, 0.55, 0])
  const mat = partMaterial(part, material(input.primaryColor ?? '#64748b', 0.42, 0.42))
  const start: Vec3 = [center[0] - bendRadius, center[1], center[2]]
  const end: Vec3 = [center[0], center[1], center[2] + bendRadius]
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'sweep',
      name: `${part.name ?? input.name ?? 'object'} pipe elbow`,
      position: center,
      path: [
        [-bendRadius, 0, 0],
        [-bendRadius * 0.72, 0, bendRadius * 0.55],
        [-bendRadius * 0.28, 0, bendRadius * 0.9],
        [0, 0, bendRadius],
      ],
      radius,
      radialSegments: 16,
      tubularSegments: 32,
      duct: {
        crossSection: 'round',
        radius,
        wallThickness: radius * 0.18,
      },
      ports: [
        {
          id: 'elbow_start',
          kind: 'inlet',
          semanticRole: 'pipe_start',
          position: start,
          normal: [-1, 0, 0],
          axis: 'x',
          radius,
          direction: 'in',
        },
        {
          id: 'elbow_end',
          kind: 'outlet',
          semanticRole: 'pipe_end',
          position: end,
          normal: [0, 0, 1],
          axis: 'z',
          radius,
          direction: 'out',
        },
      ],
      material: mat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} elbow start rim`,
      position: start,
      axis: 'x',
      majorRadius: radius,
      tubeRadius: radius * 0.12,
      radialSegments: 8,
      tubularSegments: 24,
      material: material(input.metalColor ?? '#cbd5e1', 0.28, 0.75),
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} elbow end rim`,
      position: end,
      axis: 'z',
      majorRadius: radius,
      tubeRadius: radius * 0.12,
      radialSegments: 8,
      tubularSegments: 24,
      material: material(input.metalColor ?? '#cbd5e1', 0.28, 0.75),
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeCableTray(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.72, 0])
  const length = clamp(part.length, 1.2, 0.24, 6)
  const width = clamp(part.width ?? part.depth, 0.26, 0.08, 1.2)
  const railHeight = clamp(part.height, 0.08, 0.025, 0.4)
  const thickness = clamp(part.radius ?? part.wireRadius, 0.018, 0.004, 0.08)
  const slatCount = clampInt(part.slatCount ?? part.count, 7, 2, 18)
  const mat = partMaterial(part, material(input.metalColor ?? '#94a3b8', 0.34, 0.72))
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} cable tray left rail`,
      position: [center[0], center[1], center[2] - width / 2],
      length,
      width: thickness,
      height: railHeight,
      material: mat,
    },
    {
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} cable tray right rail`,
      position: [center[0], center[1], center[2] + width / 2],
      length,
      width: thickness,
      height: railHeight,
      material: mat,
    },
  ]

  for (let i = 0; i < slatCount; i += 1) {
    shapes.push({
      kind: 'box',
      name: `${part.name ?? input.name ?? 'object'} cable tray rung ${i + 1}`,
      position: [
        center[0] - length / 2 + ((i + 0.5) * length) / slatCount,
        center[1] - railHeight * 0.42,
        center[2],
      ],
      length: thickness * 1.2,
      width,
      height: thickness * 0.65,
      material: mat,
    })
  }

  return applyPartRotation(shapes, center, part.rotation)
}
