import type { Vec3 } from '@pascal-app/core/lib/primitive-compose'
import type { GeneratedGeometryShapeSpec as ShapeSpec } from './ai-generated-geometry-core'

export function pathCenter(path: readonly Vec3[]): Vec3 {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const [x, y, z] of path) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
}

export function primitiveHalfExtent(shape: ShapeSpec, axis: 0 | 1 | 2): number {
  return primitiveHalfExtentFromRawValues(axis, {
    kind: shape.kind,
    height: shape.height,
    length: shape.length,
    width: shape.width,
    depth: shape.depth,
    radius: shape.radius,
    majorRadius: shape.majorRadius,
    tubeRadius: shape.tubeRadius,
    axis: shape.axis,
  })
}

function primitiveHalfExtentFromRawValues(
  axis: 0 | 1 | 2,
  values: {
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
): number {
  const positive = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
  const height = positive(values.height)
  const length = positive(values.length)
  const width = positive(values.width)
  const depth = positive(values.depth)
  const radius = positive(values.radius)
  const majorRadius = positive(values.majorRadius)
  const tubeRadius = positive(values.tubeRadius)
  const primitiveAxis = values.axis === 'x' || values.axis === 'z' ? values.axis : 'y'

  if (axis === 0) {
    if (length != null) return length / 2
    if (primitiveAxis === 'x' && height != null) return height / 2
    if (majorRadius != null || tubeRadius != null) return (majorRadius ?? 0) + (tubeRadius ?? 0)
    return radius ?? 0
  }
  if (axis === 2) {
    if (width != null) return width / 2
    if (depth != null) return depth / 2
    if (primitiveAxis === 'z' && height != null) return height / 2
    if (majorRadius != null || tubeRadius != null) return (majorRadius ?? 0) + (tubeRadius ?? 0)
    return radius ?? 0
  }
  if (height != null && primitiveAxis === 'y') return height / 2
  if (height != null && !radius) return height / 2
  if (majorRadius != null || tubeRadius != null) return (majorRadius ?? 0) + (tubeRadius ?? 0)
  return radius ?? 0
}

export function primitiveChildAnchorHalfExtent(
  childAnchor: string | undefined,
  axis: 0 | 1 | 2,
  values: {
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
): number {
  if (childAnchor === 'center') return 0
  return primitiveHalfExtentFromRawValues(axis, values)
}

export function positionForChildAnchorAtPoint(
  point: Vec3,
  childAnchor: string | undefined,
  values: {
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
): Vec3 {
  const next: Vec3 = [point[0], point[1], point[2]]
  if (childAnchor === 'top' || childAnchor === 'bottom') {
    next[1] +=
      (childAnchor === 'top' ? -1 : 1) *
      primitiveChildAnchorHalfExtent(childAnchor, 1, values)
  } else if (childAnchor === 'right' || childAnchor === 'left') {
    next[0] +=
      (childAnchor === 'right' ? -1 : 1) *
      primitiveChildAnchorHalfExtent(childAnchor, 0, values)
  } else if (childAnchor === 'front' || childAnchor === 'back') {
    next[2] +=
      (childAnchor === 'front' ? -1 : 1) *
      primitiveChildAnchorHalfExtent(childAnchor, 2, values)
  }
  return next
}
