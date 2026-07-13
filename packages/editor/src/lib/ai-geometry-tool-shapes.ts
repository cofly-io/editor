import {
  expandPrimitiveShapeArrays,
  type PrimitiveArrayExpandableShape,
  type PrimitiveShapeInput,
} from '@pascal-app/core/lib/primitive-compose'
import { lowerDerivedPrimitiveShape } from '@pascal-app/core/lib/primitive-registry'
import {
  normalizePrimitiveKind,
  type GeneratedGeometryShapeSpec as ShapeSpec,
} from './ai-generated-geometry-core'
import { getExpectedAttachmentSide } from './ai-geometry-tool-anchors'
import type { RawGeometryToolShape as RawShape } from './ai-geometry-tool-constants'
import {
  normalizePrimitiveMaterial,
  shouldApplyGlassMaterial,
  withGlassMaterial,
} from './ai-geometry-tool-materials'
import { primitiveChildAnchorHalfExtent } from './ai-geometry-tool-geometry'
import {
  defaultGroundedPosition,
  normalizePoint2Array,
  normalizePoint2Holes,
  normalizePrimitiveArc,
  normalizeVec3Array,
  normalizeVec3Object,
} from './ai-geometry-tool-normalizers'
import {
  normalizePrimitiveExplicitPositionRelation,
  normalizePrimitiveLayoutPosition,
  normalizePrimitiveRelation,
  normalizeStandaloneSweepWorldPath,
  normalizeSweepEndpointAttachment,
  repairPrimitiveRelationAnchors,
} from './ai-geometry-tool-relations'
import { isRecord } from './ai-geometry-tool-raw-shapes'

export { pathCenter, primitiveHalfExtent } from './ai-geometry-tool-geometry'

export function normalizeGeometryToolShapes(
  rawShapes: RawShape[],
  options: { prompt?: string } = {},
): ShapeSpec[] {
  const expandedShapes = expandPrimitiveShapeArrays(
    rawShapes as PrimitiveArrayExpandableShape[],
  ) as RawShape[]
  const normalizedShapes: ShapeSpec[] = []
  return expandedShapes.map((shape, index) => {
    const shapeRecord = shape as Record<string, unknown>
    const params = isRecord(shapeRecord.params) ? shapeRecord.params : {}
    const dimensions = isRecord(shapeRecord.dimensions)
      ? shapeRecord.dimensions
      : isRecord(params.dimensions)
        ? params.dimensions
        : {}
    const read = (key: string) => shapeRecord[key] ?? params[key] ?? dimensions[key]
    const initialRelation = normalizePrimitiveRelation(shape, expandedShapes, index)
    const size = Array.isArray(read('size')) ? (read('size') as number[]) : undefined
    const color = Array.isArray(read('color')) ? (read('color') as number[]) : undefined
    const kind = normalizePrimitiveKind(
      read('kind') ?? read('primitive') ?? read('shape') ?? read('type'),
    )
    const materialPreset = read('materialPreset')
    const normalizedMaterial = normalizePrimitiveMaterial(
      read('material'),
      read('materialColor'),
      color,
    )
    const material = shouldApplyGlassMaterial(
      shape,
      kind,
      normalizedMaterial,
      materialPreset,
      options.prompt,
      expandedShapes.length,
    )
      ? withGlassMaterial(normalizedMaterial)
      : normalizedMaterial
    const isBoxLike =
      kind === 'box' || kind === 'rounded-panel' || kind === 'wedge' || kind === 'trapezoid-prism'
    const isAxisLengthPrimitive =
      kind === 'cylinder' ||
      kind === 'hollow-cylinder' ||
      kind === 'cone' ||
      kind === 'frustum' ||
      kind === 'capsule' ||
      kind === 'half-cylinder' ||
      kind === 'hemisphere'
    const rawLength = read('length')
    const rawWidth = read('width')
    const rawHeight = read('height')
    const rawDepth = read('depth')
    const rawThickness = read('thickness')
    const rawWheelWidth = read('wheelWidth')
    const naturalWidthDepth = isBoxLike && rawLength == null && rawWidth != null && rawDepth != null
    const normalizedLength = rawLength ?? (naturalWidthDepth ? rawWidth : undefined) ?? size?.[0]
    const normalizedWidth =
      (isBoxLike ? rawDepth : undefined) ?? rawWidth ?? (isBoxLike ? size?.[2] : undefined)
    const normalizedHeight = isAxisLengthPrimitive
      ? (rawHeight ?? rawLength ?? rawDepth ?? rawWheelWidth ?? rawWidth ?? size?.[1])
      : (rawHeight ?? size?.[1])
    const normalizedThickness =
      kind === 'rounded-panel' ? (rawThickness ?? rawHeight ?? size?.[1]) : rawThickness
    const normalizedDepth = kind === 'extrude' ? (rawDepth ?? rawWidth ?? size?.[2]) : rawDepth
    const rawDiameter = read('diameter')
    const diameter =
      typeof rawDiameter === 'number' && Number.isFinite(rawDiameter) && rawDiameter > 0
        ? rawDiameter
        : undefined
    const radiusKind =
      kind === 'cylinder' ||
      kind === 'hollow-cylinder' ||
      kind === 'cone' ||
      kind === 'capsule' ||
      kind === 'half-cylinder' ||
      kind === 'sphere' ||
      kind === 'hemisphere'
    const radius =
      (read('radius') as number | undefined) ??
      (radiusKind && diameter != null ? diameter / 2 : undefined)
    const radiusTop = read('radiusTop') as number | undefined
    const radiusBottom = read('radiusBottom') as number | undefined
    const majorRadius = read('majorRadius') as number | undefined
    const tubeRadius = read('tubeRadius') as number | undefined
    const axis = read('axis') as string | undefined
    const explicitPosition = normalizeVec3Object(read('position'))
    let normalizedPath = normalizeVec3Array(read('path'))
    let relation = normalizePrimitiveExplicitPositionRelation(
      explicitPosition,
      initialRelation,
      normalizedShapes,
    )
    let rawPosition =
      explicitPosition ??
      defaultGroundedPosition(kind, {
        height: normalizedHeight,
        radius,
        radiusTop,
        radiusBottom,
        majorRadius,
        tubeRadius,
        thickness: normalizedThickness,
        axis,
      })
    const sweepEndpointAttachment = normalizeSweepEndpointAttachment(
      kind,
      normalizedPath,
      relation,
      normalizedShapes,
    )
    let sweepWasEndpointAttached = false
    if (!explicitPosition && sweepEndpointAttachment) {
      normalizedPath = sweepEndpointAttachment.path
      rawPosition = sweepEndpointAttachment.position
      relation = sweepEndpointAttachment.relation
      sweepWasEndpointAttached = true
    }
    const standaloneSweepPath = sweepWasEndpointAttached
      ? undefined
      : normalizeStandaloneSweepWorldPath(kind, normalizedPath, relation)
    if (!explicitPosition && standaloneSweepPath) {
      normalizedPath = standaloneSweepPath.path
      rawPosition = standaloneSweepPath.position
    }
    const childValues = {
      kind,
      height: normalizedHeight,
      length: normalizedLength,
      width: normalizedWidth,
      depth: normalizedDepth,
      radius,
      majorRadius,
      tubeRadius,
      axis,
    }
    const repairedRelation = repairPrimitiveRelationAnchors(relation, normalizedShapes, childValues)
    relation = repairedRelation.relation
    if (!explicitPosition && repairedRelation.position) rawPosition = repairedRelation.position
    const layoutRelation =
      explicitPosition || relation.fromLayoutField
        ? relation
        : relation.attachTo != null
          ? { ...relation, fromLayoutField: true }
          : relation
    const childHalfExtent =
      typeof layoutRelation.attachTo === 'number' &&
      layoutRelation.anchor &&
      layoutRelation.childAnchor
        ? primitiveChildAnchorHalfExtent(
            layoutRelation.childAnchor,
            getExpectedAttachmentSide(layoutRelation.anchor, layoutRelation.childAnchor)?.axis ?? 1,
            childValues,
          )
        : 0
    const position = normalizePrimitiveLayoutPosition(
      rawPosition,
      layoutRelation,
      normalizedShapes,
      childHalfExtent,
    )
    const normalizedShape: ShapeSpec = {
      kind,
      position,
      rotation: normalizeVec3Object(read('rotation')) ?? [0, 0, 0],
      scale: normalizeVec3Object(read('scale')) ?? [1, 1, 1],
      name: read('name') as string | undefined,
      semanticRole: read('semanticRole') as string | undefined,
      semanticGroup: read('semanticGroup') as string | undefined,
      sourcePartKind: read('sourcePartKind') as string | undefined,
      sourcePartId: read('sourcePartId') as string | undefined,
      editableHints: isRecord(read('editableHints'))
        ? (read('editableHints') as ShapeSpec['editableHints'])
        : undefined,
      length: normalizedLength as number | undefined,
      width: normalizedWidth as number | undefined,
      height: normalizedHeight as number | undefined,
      depth: normalizedDepth as number | undefined,
      thickness: normalizedThickness as number | undefined,
      cornerRadius: read('cornerRadius') as number | undefined,
      cornerSegments: read('cornerSegments') as number | undefined,
      radius,
      radiusTop,
      radiusBottom,
      majorRadius,
      tubeRadius,
      topScale: read('topScale') as [number, number] | undefined,
      topLengthScale: read('topLengthScale') as number | undefined,
      topWidthScale: read('topWidthScale') as number | undefined,
      slopeAxis: read('slopeAxis') as string | undefined,
      slopeDirection: read('slopeDirection') as string | undefined,
      axis,
      capSegments: read('capSegments') as number | undefined,
      radialSegments: read('radialSegments') as number | undefined,
      tubularSegments: read('tubularSegments') as number | undefined,
      widthSegments: read('widthSegments') as number | undefined,
      heightSegments: read('heightSegments') as number | undefined,
      wallThickness: read('wallThickness') as number | undefined,
      surface: read('surface') as string | undefined,
      side: read('side') as string | undefined,
      xStart: read('xStart') as number | undefined,
      xEnd: read('xEnd') as number | undefined,
      verticalOffset: read('verticalOffset') as number | undefined,
      surfaceRadiusY: read('surfaceRadiusY') as number | undefined,
      surfaceRadiusZ: read('surfaceRadiusZ') as number | undefined,
      surfaceLength: read('surfaceLength') as number | undefined,
      endTaper: read('endTaper') as number | undefined,
      profile: normalizePoint2Array(read('profile')),
      holes: normalizePoint2Holes(read('holes')),
      path: normalizedPath,
      segments: read('segments') as number | undefined,
      arc: normalizePrimitiveArc(read('arc')),
      bevelSize: read('bevelSize') as number | undefined,
      bevelThickness: read('bevelThickness') as number | undefined,
      bevelSegments: read('bevelSegments') as number | undefined,
      curveSegments: read('curveSegments') as number | undefined,
      closed: read('closed') as boolean | undefined,
      material,
      materialPreset: materialPreset as string | undefined,
      attachTo: relation.attachTo,
      anchor: relation.anchor,
      childAnchor: relation.childAnchor,
    }
    const lowered = lowerDerivedPrimitiveShape(normalizedShape as PrimitiveShapeInput) as ShapeSpec
    normalizedShapes.push(lowered)
    return lowered
  })
}

export { validateGeometryToolShapes } from './ai-geometry-tool-validation'
