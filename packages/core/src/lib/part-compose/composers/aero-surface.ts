import {
  add,
  applyPartRotation,
  clamp,
  clampInt,
  material,
  partMaterial,
  partSide,
  ringSegments,
} from '../shared'
import type {
  PartComposeInput,
  PartComposePartInput,
  PrimitiveMaterialInput,
  PrimitiveShapeInput,
  Vec3,
} from '../types'

export function lensProfile(
  shape: string | undefined,
  width: number,
  height: number,
): [number, number][] {
  const normalized =
    shape
      ?.trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_') ?? ''
  const steps = 24
  const profile: [number, number][] = []
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const aviatorDrop = normalized.includes('aviator') || normalized.includes('teardrop')
    const frog = normalized.includes('frog') || normalized.includes('toad')
    const lowerBulge = aviatorDrop ? (sin < 0 ? 1.26 : 0.92) : frog ? (sin < 0 ? 1.12 : 0.9) : 1
    const outerLift = frog ? 1 + Math.max(0, cos) * 0.16 : 1
    const innerPinch = frog ? 1 - Math.max(0, -cos) * 0.08 : 1
    profile.push([
      cos * width * 0.5 * outerLift * innerPinch,
      sin * height * 0.5 * lowerBulge - (aviatorDrop ? height * 0.05 : 0),
    ])
  }
  return profile
}

export function composeCurvedLensPanel(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, 0.45, 0])
  const width = clamp(part.width ?? part.length, 0.32, 0.04, 2)
  const height = clamp(part.height, 0.18, 0.025, 1.2)
  const thickness = clamp(part.thickness ?? part.depth, 0.012, 0.002, 0.08)
  const curvature = clamp(part.curvature, 0.05, -0.4, 0.4)
  const profile = lensProfile(part.lensShape ?? part.style ?? part.variant, width, height)
  const tint = part.color ?? part.primaryColor ?? input.primaryColor ?? '#1f2937'
  const lensMat: PrimitiveMaterialInput = {
    properties: {
      color: tint,
      roughness: 0.18,
      metalness: 0.05,
      opacity: 0.46,
      transparent: true,
      side: 'double',
    },
  }
  const rimMat = material(input.darkColor ?? '#111827', 0.42, 0.35)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'extrude',
      name: `${part.name ?? input.name ?? 'object'} curved lens panel`,
      semanticRole: 'curved_lens',
      semanticGroup: 'curved_lens_panel',
      sourcePartKind: 'curved_lens_panel',
      position: center,
      rotation: [0, curvature, 0],
      profile,
      depth: thickness,
      bevelSize: thickness * 0.2,
      bevelThickness: thickness * 0.24,
      bevelSegments: 2,
      curveSegments: 18,
      material: lensMat,
    },
    {
      kind: 'extrude',
      name: `${part.name ?? input.name ?? 'object'} curved lens rim`,
      semanticRole: 'lens_rim',
      semanticGroup: 'curved_lens_panel',
      sourcePartKind: 'curved_lens_panel',
      position: [center[0], center[1], center[2] - thickness * 0.7],
      rotation: [0, curvature, 0],
      profile: profile.map(([x, y]) => [x * 1.045, y * 1.06]),
      holes: [profile.map(([x, y]) => [x * 0.94, y * 0.92])],
      depth: thickness * 0.9,
      bevelSize: thickness * 0.14,
      bevelThickness: thickness * 0.18,
      bevelSegments: 1,
      curveSegments: 18,
      material: rimMat,
    },
  ]
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeEllipsoidShell(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 0.48, 0.04, 6)
  const width = clamp(part.width ?? part.depth, 0.28, 0.025, 4)
  const height = clamp(part.height, 0.18, 0.02, 3)
  const shellThickness = clamp(part.shellThickness ?? part.thickness, height * 0.05, 0.002, 0.18)
  const openingRadius = clamp(part.openingRadius, Math.min(length, width) * 0.16, 0.01, 1)
  const center = add(origin, part.position ?? [0, height * 0.56, 0])
  const role = part.semanticRole ?? 'ellipsoid_shell'
  const group = part.semanticGroup ?? 'ellipsoid_shell'
  const source = part.sourcePartKind ?? 'ellipsoid_shell'
  const shellMat = partMaterial(part, material(input.primaryColor ?? '#64748b', 0.44, 0.22))
  const rimMat = material(input.darkColor ?? '#1f2937', 0.56, 0.2)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} ellipsoid shell body`,
      semanticRole: role,
      semanticGroup: group,
      sourcePartKind: source,
      position: center,
      radius: 0.5,
      scale: [length, height * 1.22, width],
      widthSegments: part.cornerSegments ?? 40,
      heightSegments: part.cornerSegments ?? 22,
      material: shellMat,
    },
    {
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} ellipsoid shell base rim`,
      semanticRole: 'ellipsoid_shell_rim',
      semanticGroup: group,
      sourcePartKind: source,
      position: [center[0], center[1] - height * 0.45, center[2]],
      axis: 'y',
      majorRadius: Math.min(length, width) * 0.34,
      tubeRadius: shellThickness * 0.45,
      radialSegments: 14,
      tubularSegments: 44,
      scale: [length / Math.max(width, 0.01), 1, 1],
      material: rimMat,
    },
  ]

  if (part.cutBottom !== false) {
    shapes.push({
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} flattened shell opening lip`,
      semanticRole: 'ellipsoid_shell_opening',
      semanticGroup: group,
      sourcePartKind: source,
      position: [center[0], center[1] - height * 0.5, center[2]],
      length: length * 0.82,
      width: width * 0.82,
      thickness: shellThickness,
      cornerRadius: Math.min(length, width) * 0.22,
      cornerSegments: 8,
      material: rimMat,
    })
  }

  if (part.openingRadius != null || part.style === 'vessel_head' || part.variant === 'manway') {
    shapes.push({
      kind: 'torus',
      name: `${part.name ?? input.name ?? 'object'} top access opening rim`,
      semanticRole: 'ellipsoid_shell_top_opening',
      semanticGroup: group,
      sourcePartKind: source,
      position: [center[0], center[1] + height * 0.48, center[2]],
      axis: 'y',
      majorRadius: openingRadius,
      tubeRadius: shellThickness * 0.42,
      radialSegments: 12,
      tubularSegments: 32,
      material: rimMat,
    })
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeErgonomicShell(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 0.12, 0.04, 2)
  const width = clamp(part.width ?? part.depth, 0.065, 0.02, 1)
  const height = clamp(part.height, 0.036, 0.01, 0.6)
  const center = add(origin, part.position ?? [0, height * 0.72, 0])
  const sideTaper = clamp(part.sideTaper, 0.18, 0, 0.6)
  const noseSlope = clamp(part.noseSlope, 0.38, 0, 1)
  const tailSlope = clamp(part.tailSlope, 0.22, 0, 1)
  const shellMat = partMaterial(part, material(input.primaryColor ?? '#374151', 0.5, 0.2))
  const darkMat = material(input.darkColor ?? '#111827', 0.56, 0.18)
  const panelWidth = width * (1 - sideTaper * 0.4)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} ergonomic shell base lip`,
      semanticRole: 'ergonomic_shell_base',
      semanticGroup: 'ergonomic_shell',
      sourcePartKind: 'ergonomic_shell',
      position: [center[0], center[1] - height * 0.44, center[2]],
      length,
      width,
      thickness: Math.max(height * 0.08, 0.004),
      cornerRadius: Math.min(length, width) * 0.24,
      cornerSegments: 8,
      material: darkMat,
    },
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} ergonomic domed shell`,
      semanticRole: 'ergonomic_shell',
      semanticGroup: 'ergonomic_shell',
      sourcePartKind: 'ergonomic_shell',
      position: [center[0], center[1], center[2]],
      radius: 0.5,
      scale: [length, height * 1.55, panelWidth],
      widthSegments: 32,
      heightSegments: 20,
      material: shellMat,
    },
    {
      kind: 'wedge',
      name: `${part.name ?? input.name ?? 'object'} ergonomic low nose slope`,
      semanticRole: 'ergonomic_shell_nose',
      semanticGroup: 'ergonomic_shell',
      sourcePartKind: 'ergonomic_shell',
      position: [center[0] + length * 0.34, center[1] - height * 0.1, center[2]],
      rotation: [0, 0, -noseSlope * 0.22],
      length: length * 0.34,
      width: panelWidth * 0.92,
      height: height * 0.42,
      material: shellMat,
    },
    {
      kind: 'wedge',
      name: `${part.name ?? input.name ?? 'object'} ergonomic tail taper`,
      semanticRole: 'ergonomic_shell_tail',
      semanticGroup: 'ergonomic_shell',
      sourcePartKind: 'ergonomic_shell',
      position: [center[0] - length * 0.34, center[1] - height * 0.14, center[2]],
      rotation: [0, 0, Math.PI + tailSlope * 0.18],
      length: length * 0.32,
      width: panelWidth * 0.9,
      height: height * 0.36,
      material: shellMat,
    },
  ]

  if (
    part.style === 'mouse' ||
    part.variant === 'mouse' ||
    part.name?.toLowerCase().includes('mouse')
  ) {
    shapes.push(
      {
        kind: 'rounded-panel',
        name: `${part.name ?? input.name ?? 'object'} left button panel`,
        semanticRole: 'mouse_button',
        semanticGroup: 'ergonomic_shell',
        sourcePartKind: 'ergonomic_shell',
        position: [center[0] + length * 0.18, center[1] + height * 0.42, center[2] - width * 0.18],
        rotation: [0, 0, -0.12],
        length: length * 0.32,
        width: width * 0.28,
        thickness: height * 0.04,
        cornerRadius: width * 0.08,
        cornerSegments: 5,
        material: material(input.secondaryColor ?? '#4b5563', 0.48, 0.12),
      },
      {
        kind: 'rounded-panel',
        name: `${part.name ?? input.name ?? 'object'} right button panel`,
        semanticRole: 'mouse_button',
        semanticGroup: 'ergonomic_shell',
        sourcePartKind: 'ergonomic_shell',
        position: [center[0] + length * 0.18, center[1] + height * 0.42, center[2] + width * 0.18],
        rotation: [0, 0, -0.12],
        length: length * 0.32,
        width: width * 0.28,
        thickness: height * 0.04,
        cornerRadius: width * 0.08,
        cornerSegments: 5,
        material: material(input.secondaryColor ?? '#4b5563', 0.48, 0.12),
      },
      {
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'object'} scroll wheel`,
        semanticRole: 'scroll_wheel',
        semanticGroup: 'ergonomic_shell',
        sourcePartKind: 'ergonomic_shell',
        position: [center[0] + length * 0.24, center[1] + height * 0.47, center[2]],
        rotation: [Math.PI / 2, 0, 0],
        axis: 'z',
        radius: Math.min(width, height) * 0.08,
        height: width * 0.16,
        radialSegments: 18,
        material: darkMat,
      },
    )
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeStreamlinedBody(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 1.2, 0.08, 20)
  const width = clamp(part.width ?? part.depth, 0.36, 0.03, 3)
  const height = clamp(part.height, 0.22, 0.02, 2.5)
  const center = add(origin, part.position ?? [0, height * 0.55, 0])
  const noseRoundness = clamp(part.noseRoundness, 0.56, 0, 1)
  const tailTaper = clamp(part.tailTaper, 0.34, 0, 0.9)
  const roofArc = clamp(part.roofArc, 0.22, 0, 0.8)
  const shellMat = partMaterial(part, material(input.primaryColor ?? '#64748b', 0.45, 0.28))
  const darkMat = material(input.darkColor ?? '#1f2937', 0.52, 0.22)
  const shapes: PrimitiveShapeInput[] = [
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} streamlined central body`,
      semanticRole: 'streamlined_body',
      semanticGroup: 'streamlined_body',
      sourcePartKind: 'streamlined_body',
      position: center,
      radius: 0.5,
      scale: [length * 0.78, height * 1.18, width],
      widthSegments: 36,
      heightSegments: 20,
      material: shellMat,
    },
    {
      kind: 'sphere',
      name: `${part.name ?? input.name ?? 'object'} rounded nose fairing`,
      semanticRole: 'streamlined_nose',
      semanticGroup: 'streamlined_body',
      sourcePartKind: 'streamlined_body',
      position: [
        center[0] + length * (0.4 + noseRoundness * 0.03),
        center[1] - height * 0.035,
        center[2],
      ],
      radius: 0.5,
      scale: [
        length * 0.28 * Math.max(0.28, noseRoundness),
        height * (0.68 + noseRoundness * 0.18),
        width * (0.6 + noseRoundness * 0.2),
      ],
      widthSegments: 28,
      heightSegments: 16,
      material: shellMat,
    },
    {
      kind: 'trapezoid-prism',
      name: `${part.name ?? input.name ?? 'object'} tapered tail fairing`,
      semanticRole: 'streamlined_tail',
      semanticGroup: 'streamlined_body',
      sourcePartKind: 'streamlined_body',
      position: [center[0] - length * 0.405, center[1] - height * 0.015, center[2]],
      rotation: [0, 0, Math.PI],
      length: length * 0.18,
      width: width * 0.58,
      height: height * 0.42,
      topScale: [Math.max(0.18, 1 - tailTaper), Math.max(0.22, 1 - tailTaper * 0.8)],
      cornerRadius: Math.min(width, height) * 0.12,
      cornerSegments: 5,
      material: shellMat,
    },
    {
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} smooth roof highlight`,
      semanticRole: 'streamlined_roof_arc',
      semanticGroup: 'streamlined_body',
      sourcePartKind: 'streamlined_body',
      position: [
        center[0] - length * 0.03,
        center[1] + height * (0.38 + roofArc * 0.25),
        center[2],
      ],
      rotation: [0, 0, -roofArc * 0.18],
      length: length * 0.42,
      width: width * 0.48,
      thickness: Math.max(height * 0.035, 0.006),
      cornerRadius: Math.min(width, length) * 0.08,
      cornerSegments: 6,
      material: darkMat,
    },
  ]

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeAircraftFuselage(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const length = clamp(part.length, 1.12, 0.4, 20)
  const width = clamp(part.width ?? part.depth, 0.14, 0.05, 1.4)
  const height = clamp(part.height, width * 1.08, 0.04, 1.2)
  const center = add(origin, part.position ?? [0, height * 3.2, 0])
  const fuselageMat = partMaterial(
    part,
    material(part.primaryColor ?? input.primaryColor ?? '#f8fafc', 0.5, 0.04),
  )
  const stripeMat = material(part.accentColor ?? input.accentColor ?? '#0f8fb3', 0.36, 0.08)
  const glassMat = material(input.darkColor ?? '#1e293b', 0.22, 0.02, 0.9)
  const cockpitGlassMat = material(input.darkColor ?? '#020617', 0.24, 0.02, 0.94)
  const base = composeStreamlinedBody(
    input,
    {
      ...part,
      kind: 'streamlined_body',
      name: part.name ?? 'aircraft fuselage',
      length,
      width,
      height,
      position: center,
      noseRoundness: part.noseRoundness ?? 0.62,
      tailTaper: part.tailTaper ?? 0.56,
      roofArc: part.roofArc ?? 0.08,
      material: fuselageMat,
      semanticGroup: 'aircraft_fuselage',
      rotation: undefined,
    },
    [0, 0, 0],
  )
    .filter(
      (shape) =>
        shape.semanticRole !== 'streamlined_roof_arc' && shape.semanticRole !== 'streamlined_nose',
    )
    .map((shape) => ({
      ...shape,
      sourcePartKind: 'aircraft_fuselage',
      semanticGroup: 'aircraft_fuselage',
      semanticRole:
        shape.semanticRole === 'streamlined_body'
          ? 'aircraft_fuselage'
          : shape.semanticRole === 'streamlined_tail'
            ? 'aircraft_tail'
            : shape.semanticRole,
    }))
  const windowCount = clampInt(part.count, length > 1.6 ? 18 : 14, 6, 40)
  const cabinWindowStart = -length * 0.31
  const cabinWindowEnd = length * 0.2
  const windowSpacing = (cabinWindowEnd - cabinWindowStart) / Math.max(windowCount - 1, 1)
  const shapes: PrimitiveShapeInput[] = [
    ...base,
    {
      kind: 'conformal-strip',
      name: `${part.name ?? input.name ?? 'aircraft'} left blue conformal cheatline stripe`,
      semanticRole: 'aircraft_livery_stripe',
      semanticGroup: 'aircraft_fuselage',
      sourcePartKind: 'aircraft_fuselage',
      position: center,
      side: 'left',
      surface: 'ellipsoid-cylinder',
      xStart: -length * 0.38,
      xEnd: length * 0.34,
      verticalOffset: height * 0.04,
      width: height * 0.075,
      thickness: width * 0.025,
      surfaceRadiusY: height * 0.5,
      surfaceRadiusZ: width * 0.5,
      surfaceLength: length,
      endTaper: 0.42,
      segments: 32,
      widthSegments: 4,
      material: stripeMat,
    },
    {
      kind: 'conformal-strip',
      name: `${part.name ?? input.name ?? 'aircraft'} right blue conformal cheatline stripe`,
      semanticRole: 'aircraft_livery_stripe',
      semanticGroup: 'aircraft_fuselage',
      sourcePartKind: 'aircraft_fuselage',
      position: center,
      side: 'right',
      surface: 'ellipsoid-cylinder',
      xStart: -length * 0.38,
      xEnd: length * 0.34,
      verticalOffset: height * 0.04,
      width: height * 0.075,
      thickness: width * 0.025,
      surfaceRadiusY: height * 0.5,
      surfaceRadiusZ: width * 0.5,
      surfaceLength: length,
      endTaper: 0.42,
      segments: 32,
      widthSegments: 4,
      material: stripeMat,
    },
  ]

  for (const sideName of ['left', 'right'] as const) {
    for (let index = 0; index < windowCount; index += 1) {
      const x = cabinWindowStart + index * windowSpacing
      const windowDecalLength = clamp(undefined, length * 0.01, 0.025, 0.075)
      shapes.push({
        kind: 'conformal-strip',
        name: `${part.name ?? input.name ?? 'aircraft'} ${sideName} conformal cabin window ${index + 1}`,
        semanticRole: 'cabin_window',
        semanticGroup: 'aircraft_windows',
        sourcePartKind: 'aircraft_fuselage',
        position: center,
        side: sideName,
        surface: 'ellipsoid-cylinder',
        xStart: x - windowDecalLength / 2,
        xEnd: x + windowDecalLength / 2,
        verticalOffset: height * 0.24,
        width: clamp(undefined, height * 0.075, 0.025, 0.075),
        thickness: width * 0.018,
        surfaceRadiusY: height * 0.5,
        surfaceRadiusZ: width * 0.5,
        surfaceLength: length,
        endTaper: 0.42,
        segments: 2,
        widthSegments: 2,
        material: glassMat,
      })
    }
  }

  for (const sideName of ['left', 'right'] as const) {
    shapes.push({
      kind: 'conformal-strip',
      name: `${part.name ?? input.name ?? 'aircraft'} ${sideName} conformal cockpit side window`,
      semanticRole: 'cockpit_window',
      semanticGroup: 'aircraft_windows',
      sourcePartKind: 'aircraft_fuselage',
      position: center,
      side: sideName,
      surface: 'ellipsoid-cylinder',
      xStart: length * 0.275,
      xEnd: length * 0.305,
      verticalOffset: height * 0.34,
      width: clamp(undefined, height * 0.085, 0.035, 0.09),
      thickness: width * 0.018,
      surfaceRadiusY: height * 0.5,
      surfaceRadiusZ: width * 0.5,
      surfaceLength: length,
      endTaper: 0.3,
      segments: 3,
      widthSegments: 2,
      material: cockpitGlassMat,
    })
    shapes.push({
      kind: 'conformal-strip',
      name: `${part.name ?? input.name ?? 'aircraft'} ${sideName} conformal forward windshield pane`,
      semanticRole: 'cockpit_window',
      semanticGroup: 'aircraft_windows',
      sourcePartKind: 'aircraft_fuselage',
      position: center,
      side: sideName,
      surface: 'ellipsoid-cylinder',
      xStart: length * 0.318,
      xEnd: length * 0.34,
      verticalOffset: height * 0.39,
      width: clamp(undefined, height * 0.095, 0.035, 0.095),
      thickness: width * 0.018,
      surfaceRadiusY: height * 0.5,
      surfaceRadiusZ: width * 0.5,
      surfaceLength: length,
      endTaper: 0.3,
      segments: 3,
      widthSegments: 2,
      material: cockpitGlassMat,
    })
  }

  return applyPartRotation(shapes, center, part.rotation)
}

export function composeAircraftWing(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0.04, 0.47, 0])
  const span = clamp(part.length, 0.95, 0.2, 16)
  const chord = clamp(part.width ?? part.depth, 0.18, 0.04, 1.2)
  const thickness = clamp(part.thickness ?? part.height, 0.014, 0.004, 0.08)
  const dihedral = clamp(part.verticalCurve ?? part.pitch, 0.045, -0.25, 0.25)
  const sweep = clamp(part.bladeSweep ?? part.twist, 0.12, -0.5, 0.5)
  const mat = partMaterial(part, material(input.secondaryColor ?? '#cbd5e1', 0.48, 0.18))
  const includeWinglets = part.sourcePartKind !== 'aircraft_horizontal_stabilizer'
  const side = partSide(part.side)
  const sides = side === 'left' ? [-1] : side === 'right' ? [1] : [-1, 1]
  const halfSpan = span / 2
  const shapes: PrimitiveShapeInput[] = []
  for (const wingSide of sides) {
    const rootY = wingSide < 0 ? -halfSpan / 2 : halfSpan / 2
    const tipY = -rootY
    const sweptTipX = sweep * halfSpan
    const rootLeadingX = chord * 0.52
    const rootTrailingX = -chord * 0.48
    const tipLeadingX = chord * 0.18 + sweptTipX
    const tipTrailingX = -chord * 0.22 + sweptTipX
    const profile: [number, number][] = [
      [rootTrailingX, rootY],
      [rootLeadingX, rootY],
      [tipLeadingX, tipY],
      [tipTrailingX, tipY],
    ]
    const wingCenter: Vec3 = [center[0], center[1], center[2] + wingSide * halfSpan * 0.5]
    const tipPosition: Vec3 = [
      center[0] + (tipLeadingX + tipTrailingX) / 2,
      center[1] + Math.abs(halfSpan * dihedral),
      center[2] + wingSide * halfSpan,
    ]
    shapes.push({
      kind: 'extrude',
      name: `${part.name ?? input.name ?? 'aircraft'} ${wingSide < 0 ? 'left' : 'right'} swept tapered airfoil wing`,
      semanticRole: 'aircraft_wing',
      semanticGroup: 'aircraft_wings',
      sourcePartKind: 'aircraft_wing',
      position: wingCenter,
      rotation: [-Math.PI / 2 - wingSide * dihedral, 0, 0],
      profile,
      depth: thickness,
      bevelSize: thickness * 0.12,
      bevelThickness: thickness * 0.2,
      bevelSegments: 1,
      curveSegments: 8,
      material: mat,
    })
    if (includeWinglets) {
      shapes.push({
        kind: 'trapezoid-prism',
        name: `${part.name ?? input.name ?? 'aircraft'} ${wingSide < 0 ? 'left' : 'right'} upturned winglet`,
        semanticRole: 'aircraft_winglet',
        semanticGroup: 'aircraft_wings',
        sourcePartKind: 'aircraft_wing',
        position: tipPosition,
        rotation: [0, 0, wingSide * 0.18],
        length: chord * 0.18,
        width: thickness * 1.8,
        height: Math.max(thickness * 6, chord * 0.16),
        topLengthScale: 0.55,
        topWidthScale: 0.72,
        cornerRadius: thickness * 0.4,
        cornerSegments: 3,
        material: mat,
      })
    }
  }
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeAircraftEngine(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [-0.38, 0.52, 0])
  const radius = clamp(part.radius, 0.05, 0.018, 0.36)
  const length = clamp(part.length ?? part.depth, 0.2, 0.05, 1.25)
  const spacing = clamp(part.width, 0.46, radius * 3, 4)
  const count = clampInt(part.count, 2, 1, 4)
  const nacelleMat = partMaterial(part, material(input.metalColor ?? '#64748b', 0.34, 0.56))
  const intakeMat = material(input.darkColor ?? '#111827', 0.42, 0.2)
  const fanMat = material(input.secondaryColor ?? '#cbd5e1', 0.3, 0.65)
  const offsets =
    count === 1
      ? [0]
      : Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * spacing)
  const shapes: PrimitiveShapeInput[] = []
  offsets.forEach((zOffset, index) => {
    const nacelleCenter: Vec3 = [center[0], center[1], center[2] + zOffset]
    const sideRole = zOffset < 0 ? 'engine_nacelle_left' : 'engine_nacelle_right'
    shapes.push(
      {
        kind: 'hollow-cylinder',
        name: `${part.name ?? input.name ?? 'aircraft'} engine nacelle ${index + 1}`,
        semanticRole: count === 1 ? 'engine_nacelle' : sideRole,
        semanticGroup: 'aircraft_engines',
        sourcePartKind: 'aircraft_engine',
        position: nacelleCenter,
        axis: 'x',
        radius,
        height: length,
        wallThickness: radius * 0.16,
        radialSegments: ringSegments(input.detail),
        material: nacelleMat,
      },
      {
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'aircraft'} engine intake fan ${index + 1}`,
        semanticRole: 'engine_fan',
        semanticGroup: 'aircraft_engines',
        sourcePartKind: 'aircraft_engine',
        position: [nacelleCenter[0] + length * 0.48, nacelleCenter[1], nacelleCenter[2]],
        axis: 'x',
        radius: radius * 0.72,
        height: length * 0.04,
        radialSegments: 18,
        material: fanMat,
      },
      {
        kind: 'torus',
        name: `${part.name ?? input.name ?? 'aircraft'} dark engine intake lip ${index + 1}`,
        semanticRole: 'engine_intake',
        semanticGroup: 'aircraft_engines',
        sourcePartKind: 'aircraft_engine',
        position: [nacelleCenter[0] + length * 0.52, nacelleCenter[1], nacelleCenter[2]],
        axis: 'x',
        majorRadius: radius * 0.88,
        tubeRadius: radius * 0.08,
        tubularSegments: ringSegments(input.detail),
        radialSegments: 12,
        material: intakeMat,
      },
    )
  })
  return applyPartRotation(shapes, center, part.rotation)
}

export function composeAircraftVerticalStabilizer(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [-0.48, 0.73, 0])
  const length = clamp(part.length, 0.22, 0.04, 1.5)
  const height = clamp(part.height, 0.28, 0.04, 1.4)
  const width = clamp(part.width ?? part.thickness, 0.025, 0.004, 0.16)
  return applyPartRotation(
    [
      {
        kind: 'trapezoid-prism',
        name: `${part.name ?? input.name ?? 'aircraft'} swept vertical stabilizer`,
        semanticRole: 'vertical_stabilizer',
        semanticGroup: 'aircraft_tail',
        sourcePartKind: 'aircraft_vertical_stabilizer',
        position: center,
        rotation: [0, 0, -0.12],
        length,
        width,
        height,
        topLengthScale: 0.42,
        topWidthScale: 0.82,
        cornerRadius: Math.min(length, height) * 0.04,
        cornerSegments: 3,
        material: partMaterial(part, material(input.secondaryColor ?? '#cbd5e1', 0.48, 0.18)),
      },
    ],
    center,
    part.rotation,
  )
}

export function composeAircraftHorizontalStabilizer(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  return composeAircraftWing(
    input,
    {
      ...part,
      name: part.name ?? 'T-tail',
      position: part.position ?? [-0.53, 0.84, 0],
      length: part.length ?? 0.34,
      width: part.width ?? 0.08,
      thickness: part.thickness ?? part.height ?? 0.009,
      verticalCurve: part.verticalCurve ?? 0.015,
      sourcePartKind: 'aircraft_horizontal_stabilizer',
    },
    origin,
  ).map((shape) => ({
    ...shape,
    name: shape.name?.replace('swept main wing', 'horizontal stabilizer'),
    semanticRole: 'horizontal_stabilizer',
    semanticGroup: 'aircraft_tail',
    sourcePartKind: 'aircraft_horizontal_stabilizer',
  }))
}

export function composeAircraftLandingGear(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0.02, 0.12, 0])
  const radius = clamp(part.radius ?? part.wheelRadius, 0.035, 0.012, 0.2)
  const track = clamp(part.width, 0.32, radius * 3, 1.4)
  const wheelbase = clamp(part.length, 0.62, radius * 5, 2.5)
  const tireMat = partMaterial(part, material(input.darkColor ?? '#111827', 0.72, 0.02))
  const strutMat = material(input.metalColor ?? '#94a3b8', 0.28, 0.72)
  const positions: Vec3[] = [
    [center[0] + wheelbase * 0.42, center[1], center[2]],
    [center[0] - wheelbase * 0.28, center[1], center[2] - track / 2],
    [center[0] - wheelbase * 0.28, center[1], center[2] + track / 2],
  ]
  const shapes: PrimitiveShapeInput[] = []
  positions.forEach((wheelCenter, index) => {
    const label = index === 0 ? 'nose' : `main ${index}`
    const wheelRole = index === 0 ? 'aircraft_landing_gear_nose' : 'aircraft_landing_gear_main'
    shapes.push(
      {
        kind: 'torus',
        name: `${part.name ?? input.name ?? 'aircraft'} landing gear wheel ${label}`,
        semanticRole: wheelRole,
        semanticGroup: 'aircraft_landing_gear',
        sourcePartKind: 'aircraft_landing_gear',
        position: wheelCenter,
        axis: 'z',
        majorRadius: radius,
        tubeRadius: radius * 0.22,
        radialSegments: 10,
        tubularSegments: ringSegments(input.detail),
        material: tireMat,
      },
      {
        kind: 'cylinder',
        name: `${part.name ?? input.name ?? 'aircraft'} landing gear strut ${label}`,
        semanticRole: wheelRole,
        semanticGroup: 'aircraft_landing_gear',
        sourcePartKind: 'aircraft_landing_gear',
        position: [wheelCenter[0], wheelCenter[1] + radius * 1.65, wheelCenter[2]],
        axis: 'y',
        radius: radius * 0.18,
        height: radius * 2.4,
        radialSegments: 10,
        material: strutMat,
      },
    )
  })
  return applyPartRotation(shapes, center, part.rotation)
}

export function normalizedLoftSections(part: PartComposePartInput) {
  const length = clamp(part.length, 0.8, 0.08, 6)
  const baseWidth = clamp(part.width ?? part.depth, 0.28, 0.02, 2)
  const baseHeight = clamp(part.height, 0.12, 0.01, 1.8)
  const provided = Array.isArray(part.sections) ? part.sections.filter(Boolean) : []
  if (provided.length >= 2) {
    return provided.slice(0, 12).map((section, index) => ({
      x:
        typeof section.x === 'number' && Number.isFinite(section.x)
          ? section.x
          : -length / 2 + (index * length) / Math.max(1, provided.length - 1),
      width: clamp(section.width ?? section.length, baseWidth, 0.01, 3),
      height: clamp(section.height, baseHeight, 0.005, 2),
      y: clamp(section.y, 0, -2, 2),
      z: clamp(section.z, 0, -2, 2),
      topScale: section.topScale,
    }))
  }
  return [
    { x: -length / 2, width: baseWidth * 1.05, height: baseHeight * 0.82, y: 0, z: 0 },
    { x: 0, width: baseWidth, height: baseHeight * 1.12, y: baseHeight * 0.12, z: 0 },
    { x: length / 2, width: baseWidth * 0.45, height: baseHeight * 0.62, y: 0, z: 0 },
  ]
}

export function composeLoftedPanel(
  input: PartComposeInput,
  part: PartComposePartInput,
  origin: Vec3,
): PrimitiveShapeInput[] {
  const center = add(origin, part.position ?? [0, clamp(part.height, 0.12, 0.01, 1.8) * 0.7, 0])
  const thickness = clamp(part.thickness ?? part.depth, 0.024, 0.003, 0.18)
  const sections = normalizedLoftSections(part)
  const mat = partMaterial(part, material(input.primaryColor ?? '#64748b', 0.46, 0.24))
  const seamMat = material(input.darkColor ?? '#1f2937', 0.56, 0.2)
  const shapes: PrimitiveShapeInput[] = []

  for (let index = 0; index < sections.length - 1; index += 1) {
    const a = sections[index]
    const b = sections[index + 1]
    if (!a || !b) continue
    const segmentLength = Math.max(0.01, Math.abs(b.x - a.x))
    shapes.push({
      kind: 'trapezoid-prism',
      name: `${part.name ?? input.name ?? 'object'} lofted panel segment ${index + 1}`,
      semanticRole: part.semanticRole ?? 'lofted_panel_segment',
      semanticGroup: 'lofted_panel',
      sourcePartKind: 'lofted_panel',
      position: [
        center[0] + (a.x + b.x) / 2,
        center[1] + (a.y + b.y) / 2,
        center[2] + (a.z + b.z) / 2,
      ],
      length: segmentLength,
      width: Math.max(a.width, b.width),
      height: Math.max(a.height, b.height),
      topScale: [
        Math.max(0.05, b.width / Math.max(a.width, 0.01)),
        Math.max(0.05, b.height / Math.max(a.height, 0.01)),
      ],
      cornerRadius: Math.min(a.width, b.width, a.height, b.height) * 0.08,
      cornerSegments: 5,
      material: mat,
    })
  }

  sections.forEach((section, index) => {
    shapes.push({
      kind: 'rounded-panel',
      name: `${part.name ?? input.name ?? 'object'} loft section seam ${index + 1}`,
      semanticRole:
        index === 0
          ? 'lofted_panel_root'
          : index === sections.length - 1
            ? 'lofted_panel_tip'
            : 'lofted_panel_section',
      semanticGroup: 'lofted_panel',
      sourcePartKind: 'lofted_panel',
      position: [center[0] + section.x, center[1] + section.y, center[2] + section.z],
      rotation: [0, Math.PI / 2, 0],
      length: section.width,
      width: section.height,
      thickness,
      cornerRadius: Math.min(section.width, section.height) * 0.12,
      cornerSegments: 5,
      material: seamMat,
    })
  })

  return applyPartRotation(shapes, center, part.rotation)
}
