import type { Vec3 } from '@pascal-app/core/lib/primitive-compose'
import type { GeneratedGeometryShapeSpec as ShapeSpec } from './ai-generated-geometry-core'
import { getExpectedAttachmentSide, isPrimitiveAnchor } from './ai-geometry-tool-anchors'
import type { RawGeometryToolShape as RawShape } from './ai-geometry-tool-constants'
import {
  pathCenter,
  positionForChildAnchorAtPoint,
  primitiveHalfExtent,
} from './ai-geometry-tool-geometry'
import {
  primitiveShapeReferenceText,
  rawShapeRead,
  resolvePrimitiveShapeReference,
} from './ai-geometry-tool-raw-shapes'

function primitiveSideAnchors(side: unknown): { anchor: string; childAnchor: string } {
  switch (side) {
    case 'left':
      return { anchor: 'left', childAnchor: 'right' }
    case 'front':
      return { anchor: 'front', childAnchor: 'back' }
    case 'back':
      return { anchor: 'back', childAnchor: 'front' }
    default:
      return { anchor: 'right', childAnchor: 'left' }
  }
}

function childAnchorForSide(anchor: unknown): string | undefined {
  switch (anchor) {
    case 'left':
      return 'right'
    case 'right':
      return 'left'
    case 'front':
      return 'back'
    case 'back':
      return 'front'
    default:
      return undefined
  }
}

function normalizePrimitiveAnchorAlias(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (
    normalized === 'path_start' ||
    normalized === 'pathstart' ||
    normalized === 'curve_start' ||
    normalized === 'sweep_start' ||
    normalized === 'start_point' ||
    normalized === 'endpoint_start'
  ) {
    return 'start'
  }
  if (
    normalized === 'path_end' ||
    normalized === 'pathend' ||
    normalized === 'curve_end' ||
    normalized === 'sweep_end' ||
    normalized === 'end_point' ||
    normalized === 'endpoint_end'
  ) {
    return 'end'
  }
  if (normalized === 'top_rim' || normalized === 'upper_rim' || normalized === 'rim_top') {
    return 'top'
  }
  if (normalized === 'bottom_rim' || normalized === 'lower_rim' || normalized === 'rim_bottom') {
    return 'bottom'
  }
  return normalized
}

function normalizeSemanticPrimitiveAnchors(
  shape: RawShape,
  anchor: string | undefined,
  childAnchor: string | undefined,
): { anchor?: string; childAnchor?: string } {
  const text = primitiveShapeReferenceText(shape)
  if (
    /(?:^|[_\s-])(stopper|cork|plug|lid|cap|knob)(?:$|[_\s-])|木塞|瓶塞|壶盖|盖子/.test(text) &&
    !/(?:^|[_\s-])bottom(?:$|[_\s-])/.test(text)
  ) {
    return { anchor: 'top', childAnchor: 'bottom' }
  }
  if (/(?:^|[_\s-])(handle|spout|nozzle|port)(?:$|[_\s-])|把手|壶嘴|喷嘴|接口/.test(text)) {
    const sideChildAnchor = childAnchorForSide(anchor)
    if (sideChildAnchor) return { anchor, childAnchor: sideChildAnchor }
  }
  return { anchor, childAnchor }
}

function childAnchorOppositeAnchor(anchor: string | undefined): string | undefined {
  if (!anchor) return undefined
  if (anchor === 'top') return 'bottom'
  if (anchor === 'bottom') return 'top'
  if (anchor === 'center') return 'center'
  return childAnchorForSide(anchor)
}

function pathEndpoint(shape: ShapeSpec | undefined, endpoint: unknown): Vec3 | undefined {
  if (!shape || !Array.isArray(shape.path) || shape.path.length === 0) return undefined
  const point =
    endpoint === 'start'
      ? shape.path[0]
      : endpoint === 'end'
        ? shape.path.at(-1)
        : endpoint === 'top'
          ? shape.path.reduce((best, point) => (point[1] > best[1] ? point : best), shape.path[0]!)
          : endpoint === 'bottom'
            ? shape.path.reduce((best, point) => (point[1] < best[1] ? point : best), shape.path[0]!)
            : endpoint === 'right'
              ? shape.path.reduce((best, point) => (point[0] > best[0] ? point : best), shape.path[0]!)
              : endpoint === 'left'
                ? shape.path.reduce((best, point) => (point[0] < best[0] ? point : best), shape.path[0]!)
                : endpoint === 'front'
                  ? shape.path.reduce((best, point) => (point[2] > best[2] ? point : best), shape.path[0]!)
                  : endpoint === 'back'
                    ? shape.path.reduce((best, point) => (point[2] < best[2] ? point : best), shape.path[0]!)
                    : undefined
  if (!point) return undefined
  const center = pathCenter(shape.path)
  return [
    (shape.position?.[0] ?? 0) + point[0] - center[0],
    (shape.position?.[1] ?? 0) + point[1] - center[1],
    (shape.position?.[2] ?? 0) + point[2] - center[2],
  ]
}

function primitiveAnchorWorldPosition(shape: ShapeSpec | undefined, anchor: unknown): Vec3 | undefined {
  if (!shape || !isPrimitiveAnchor(anchor)) return undefined
  const pathAnchor = pathEndpoint(shape, anchor)
  if (pathAnchor) return pathAnchor
  const position = shape.position ?? [0, 0, 0]
  if (anchor === 'center') return [position[0], position[1], position[2]]
  const next: Vec3 = [position[0], position[1], position[2]]
  if (anchor === 'top' || anchor === 'bottom') {
    next[1] += (anchor === 'top' ? 1 : -1) * primitiveHalfExtent(shape, 1)
    return next
  }
  if (anchor === 'right' || anchor === 'left') {
    next[0] += (anchor === 'right' ? 1 : -1) * primitiveHalfExtent(shape, 0)
    return next
  }
  next[2] += (anchor === 'front' ? 1 : -1) * primitiveHalfExtent(shape, 2)
  return next
}

export function normalizeSweepEndpointAttachment(
  kind: string,
  path: Vec3[] | undefined,
  relation: {
    attachTo?: number | string
    anchor?: string
    childAnchor?: string
    fromLayoutField?: boolean
  },
  normalizedShapes: readonly ShapeSpec[],
): { path: Vec3[]; position: Vec3; relation: typeof relation } | undefined {
  if (kind !== 'sweep' || !path || path.length === 0) return undefined
  if (typeof relation.attachTo !== 'number') return undefined
  if (
    relation.childAnchor !== 'start' &&
    relation.childAnchor !== 'end' &&
    relation.childAnchor !== 'bottom' &&
    relation.childAnchor !== 'top'
  )
    return undefined
  const parentAnchorPosition = primitiveAnchorWorldPosition(
    normalizedShapes[relation.attachTo],
    relation.anchor,
  )
  if (!parentAnchorPosition) return undefined

  const childEndpoint =
    relation.childAnchor === 'start'
      ? path[0]
      : relation.childAnchor === 'end'
        ? path.at(-1)
        : relation.childAnchor === 'bottom'
          ? path.reduce((best, point) => (point[1] < best[1] ? point : best), path[0]!)
          : path.reduce((best, point) => (point[1] > best[1] ? point : best), path[0]!)
  if (!childEndpoint) return undefined
  const localPath = path.map(
    ([x, y, z]) =>
      [x - childEndpoint[0], y - childEndpoint[1], z - childEndpoint[2]] as Vec3,
  )
  const center = pathCenter(localPath)
  return {
    path: localPath,
    position: [
      parentAnchorPosition[0] + center[0],
      parentAnchorPosition[1] + center[1],
      parentAnchorPosition[2] + center[2],
    ],
    relation: {},
  }
}

export function normalizeStandaloneSweepWorldPath(
  kind: string,
  path: Vec3[] | undefined,
  relation: {
    attachTo?: number | string
    anchor?: string
    childAnchor?: string
    fromLayoutField?: boolean
  },
): { path: Vec3[]; position: Vec3 } | undefined {
  if (kind !== 'sweep' || !path || path.length === 0 || relation.attachTo != null) return undefined
  const center = pathCenter(path)
  if (!Number.isFinite(center[0]) || !Number.isFinite(center[1]) || !Number.isFinite(center[2])) {
    return undefined
  }
  return {
    path: path.map(([x, y, z]) => [x - center[0], y - center[1], z - center[2]] as Vec3),
    position: center,
  }
}

export function repairPrimitiveRelationAnchors(
  relation: {
    attachTo?: number | string
    anchor?: string
    childAnchor?: string
    fromLayoutField?: boolean
  },
  normalizedShapes: readonly ShapeSpec[],
  childValues: {
    kind: string
    height?: unknown
    length?: unknown
    width?: unknown
    depth?: unknown
    radius?: unknown
    majorRadius?: unknown
    tubeRadius?: unknown
    axis?: unknown
  },
): {
  relation: typeof relation
  position?: Vec3
} {
  if (typeof relation.attachTo !== 'number') return { relation }
  const anchorIsValid = isPrimitiveAnchor(relation.anchor)
  const childAnchorIsValid = isPrimitiveAnchor(relation.childAnchor)
  const parent = normalizedShapes[relation.attachTo]
  const pathAnchorPosition = pathEndpoint(parent, relation.anchor)
  if (pathAnchorPosition) {
    return {
      relation: {},
      position: positionForChildAnchorAtPoint(
        pathAnchorPosition,
        relation.childAnchor,
        childValues,
      ),
    }
  }
  if (anchorIsValid && childAnchorIsValid) return { relation }
  if (relation.anchor == null && relation.childAnchor == null) return { relation }

  const endpointPosition = pathEndpoint(parent, relation.anchor)
  if (endpointPosition) {
    return {
      relation: {},
      position: positionForChildAnchorAtPoint(endpointPosition, relation.childAnchor, childValues),
    }
  }

  if (anchorIsValid && !childAnchorIsValid) {
    const repairedChildAnchor = childAnchorOppositeAnchor(relation.anchor)
    if (repairedChildAnchor) {
      return {
        relation: {
          ...relation,
          childAnchor: repairedChildAnchor,
          fromLayoutField: true,
        },
      }
    }
  }

  return { relation: {} }
}

export function normalizePrimitiveRelation(
  shape: RawShape,
  shapes: readonly RawShape[],
  index: number,
): {
  attachTo?: number | string
  anchor?: string
  childAnchor?: string
  fromLayoutField?: boolean
} {
  const explicitAttachTo = rawShapeRead(shape, 'attachTo')
  const explicitAnchor = rawShapeRead(shape, 'anchor')
  const explicitChildAnchor = rawShapeRead(shape, 'childAnchor')
  const resolvedExplicitAttachTo = resolvePrimitiveShapeReference(explicitAttachTo, shapes, index)
  if (resolvedExplicitAttachTo != null) {
    const rawAnchor = normalizePrimitiveAnchorAlias(explicitAnchor)
    const rawChildAnchor = normalizePrimitiveAnchorAlias(explicitChildAnchor)
    const semanticAnchors = normalizeSemanticPrimitiveAnchors(shape, rawAnchor, rawChildAnchor)
    return {
      attachTo: resolvedExplicitAttachTo,
      anchor: semanticAnchors.anchor,
      childAnchor: semanticAnchors.childAnchor,
      fromLayoutField:
        semanticAnchors.anchor !== rawAnchor || semanticAnchors.childAnchor !== rawChildAnchor,
    }
  }
  if (explicitAttachTo != null) {
    const rawAnchor = normalizePrimitiveAnchorAlias(explicitAnchor)
    const rawChildAnchor = normalizePrimitiveAnchorAlias(explicitChildAnchor)
    const semanticAnchors = normalizeSemanticPrimitiveAnchors(shape, rawAnchor, rawChildAnchor)
    return {
      attachTo: explicitAttachTo as number | string,
      anchor: semanticAnchors.anchor,
      childAnchor: semanticAnchors.childAnchor,
      fromLayoutField:
        semanticAnchors.anchor !== rawAnchor || semanticAnchors.childAnchor !== rawChildAnchor,
    }
  }

  const alignAbove = rawShapeRead(shape, 'alignAbove')
  const aboveIndex = resolvePrimitiveShapeReference(alignAbove, shapes, index)
  if (aboveIndex != null) {
    return { attachTo: aboveIndex, anchor: 'top', childAnchor: 'bottom', fromLayoutField: true }
  }

  const alignBeside = rawShapeRead(shape, 'alignBeside')
  const besideIndex = resolvePrimitiveShapeReference(alignBeside, shapes, index)
  if (besideIndex != null) {
    return {
      attachTo: besideIndex,
      ...primitiveSideAnchors(rawShapeRead(shape, 'side')),
      fromLayoutField: true,
    }
  }

  const centeredOn = rawShapeRead(shape, 'centeredOn')
  const centeredIndex = resolvePrimitiveShapeReference(centeredOn, shapes, index)
  if (centeredIndex != null) {
    const side = rawShapeRead(shape, 'side')
    return side
      ? { attachTo: centeredIndex, ...primitiveSideAnchors(side), fromLayoutField: true }
      : { attachTo: centeredIndex, anchor: 'center', childAnchor: 'center', fromLayoutField: true }
  }

  const connectTo = rawShapeRead(shape, 'connectTo')
  const connectIndex = resolvePrimitiveShapeReference(connectTo, shapes, index)
  if (connectIndex != null) {
    return {
      attachTo: connectIndex,
      anchor: normalizePrimitiveAnchorAlias(rawShapeRead(shape, 'connectPoint')),
      childAnchor: normalizePrimitiveAnchorAlias(rawShapeRead(shape, 'childPoint')),
      fromLayoutField: true,
    }
  }

  return {
    anchor: typeof explicitAnchor === 'string' ? explicitAnchor : undefined,
    childAnchor: typeof explicitChildAnchor === 'string' ? explicitChildAnchor : undefined,
  }
}


export function normalizePrimitiveLayoutPosition(
  position: Vec3,
  relation: {
    attachTo?: number | string
    anchor?: string
    childAnchor?: string
    fromLayoutField?: boolean
  },
  normalizedShapes: readonly ShapeSpec[],
  childHalfExtent = 0,
  childExplicitOffset?: Vec3,
): Vec3 {
  if (!relation.fromLayoutField || typeof relation.attachTo !== 'number') return position
  if (!relation.anchor || !relation.childAnchor) return position
  const parent = normalizedShapes[relation.attachTo]
  if (!parent) return position
  if (relation.anchor === 'center' && relation.childAnchor === 'center') {
    // Keep the child's own EXPLICIT offset relative to the parent center instead
    // of collapsing every centered child onto the exact parent center (which made
    // repeated parts overlap). When the child gave no explicit position we fall
    // back to the parent center exactly as before — we must NOT add the child's
    // default grounded position, or centered parts would be wrongly lifted.
    const offset = childExplicitOffset ?? [0, 0, 0]
    return [
      parent.position[0] + offset[0],
      parent.position[1] + offset[1],
      parent.position[2] + offset[2],
    ]
  }
  const expectedSide = getExpectedAttachmentSide(relation.anchor, relation.childAnchor)
  if (!expectedSide) return position
  const next: Vec3 = [parent.position[0], parent.position[1], parent.position[2]]
  next[expectedSide.axis] =
    parent.position[expectedSide.axis] +
    expectedSide.sign * (primitiveHalfExtent(parent, expectedSide.axis) + childHalfExtent)
  return next
}

export function normalizePrimitiveExplicitPositionRelation(
  position: Vec3 | undefined,
  relation: {
    attachTo?: number | string
    anchor?: string
    childAnchor?: string
    fromLayoutField?: boolean
  },
  normalizedShapes: readonly ShapeSpec[],
): {
  attachTo?: number | string
  anchor?: string
  childAnchor?: string
  fromLayoutField?: boolean
} {
  if (!position || relation.fromLayoutField || typeof relation.attachTo !== 'number') {
    return relation
  }
  if (!relation.anchor || !relation.childAnchor) return {}
  const expectedSide = getExpectedAttachmentSide(relation.anchor, relation.childAnchor)
  if (!expectedSide) return relation
  const parent = normalizedShapes[relation.attachTo]
  if (!parent) return relation
  const delta = position[expectedSide.axis] - parent.position[expectedSide.axis]
  if (!Number.isFinite(delta) || Math.abs(delta) <= 0.02 || delta * expectedSide.sign >= -0.02) {
    return relation
  }
  return {}
}

