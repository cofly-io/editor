import type { Vec3 } from '@pascal-app/core/lib/primitive-compose'
import { isRecord } from './ai-geometry-tool-raw-shapes'

const AXIS_INDEX: Record<string, number> = { x: 0, y: 1, z: 2 }

export function normalizeVec3Object(value: unknown): Vec3 | undefined {
  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value
    if (
      typeof x === 'number' &&
      Number.isFinite(x) &&
      typeof y === 'number' &&
      Number.isFinite(y) &&
      typeof z === 'number' &&
      Number.isFinite(z)
    ) {
      return [x, y, z]
    }
  }
  if (isRecord(value)) {
    const { x, y, z } = value
    if (
      typeof x === 'number' &&
      Number.isFinite(x) &&
      typeof y === 'number' &&
      Number.isFinite(y) &&
      typeof z === 'number' &&
      Number.isFinite(z)
    ) {
      return [x, y, z]
    }
  }
  return undefined
}

/**
 * Parse a rotation given as a tagged single-axis rotation:
 *   { axis: 'x'|'y'|'z', degrees: number }  or  { axis, radians: number }
 * Returns a Vec3 euler (radians). Used ONLY for rotation, never position/scale.
 */
export function normalizeTaggedRotation(value: unknown): Vec3 | undefined {
  if (!isRecord(value)) return undefined
  const axisRaw = typeof value.axis === 'string' ? value.axis.toLowerCase() : undefined
  const axisIndex = axisRaw != null ? AXIS_INDEX[axisRaw] : undefined
  if (axisIndex == null) return undefined
  const degrees = finiteNumberValue(value.degrees)
  const radians = finiteNumberValue(value.radians)
  const angle = radians ?? (degrees != null ? (degrees * Math.PI) / 180 : undefined)
  if (angle == null) return undefined
  const out: Vec3 = [0, 0, 0]
  out[axisIndex] = angle
  return out
}

/** True when the value looks like an intended rotation but could not be parsed. */
export function isUnparseableRotation(value: unknown): boolean {
  if (value == null) return false
  // Already parseable as a plain Vec3 or tagged rotation → not an error.
  if (normalizeVec3Object(value) !== undefined) return false
  if (normalizeTaggedRotation(value) !== undefined) return false
  // Anything else that is present (array of wrong length, {axis,degrees} with
  // bad axis, a bare number, a string, ...) counts as an unparseable rotation.
  return true
}

function finiteNumberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function normalizePoint2Array(value: unknown): [number, number][] | undefined {
  if (!Array.isArray(value)) return undefined
  const points = value
    .map((point): [number, number] | undefined => {
      if (Array.isArray(point) && point.length >= 2) {
        const [x, y] = point
        return typeof x === 'number' &&
          Number.isFinite(x) &&
          typeof y === 'number' &&
          Number.isFinite(y)
          ? [x, y]
          : undefined
      }
      if (isRecord(point)) {
        const x =
          finiteNumberValue(point.x) ?? finiteNumberValue(point.radius) ?? finiteNumberValue(point.r)
        const y = finiteNumberValue(point.y) ?? finiteNumberValue(point.height)
        return x != null && y != null ? [x, y] : undefined
      }
      return undefined
    })
    .filter((point): point is [number, number] => Array.isArray(point))
  return points.length > 0 ? points : undefined
}

export function normalizePoint2Holes(value: unknown): [number, number][][] | undefined {
  if (!Array.isArray(value)) return undefined
  const holes = value
    .map((hole) => normalizePoint2Array(hole))
    .filter((hole): hole is [number, number][] => Array.isArray(hole) && hole.length > 0)
  return holes.length > 0 ? holes : undefined
}

export function normalizeVec3Array(value: unknown): Vec3[] | undefined {
  const rawPoints = isRecord(value) && Array.isArray(value.points) ? value.points : value
  if (!Array.isArray(rawPoints)) return undefined
  const points = rawPoints
    .map(normalizeVec3Object)
    .filter((point): point is Vec3 => Array.isArray(point))
  return points.length > 0 ? points : undefined
}

export function normalizePrimitiveArc(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value > Math.PI * 2 && value <= 360) return (value / 180) * Math.PI
  return value
}

export function defaultGroundedPosition(
  kind: string,
  values: {
    height?: unknown
    radius?: unknown
    radiusTop?: unknown
    radiusBottom?: unknown
    majorRadius?: unknown
    tubeRadius?: unknown
    thickness?: unknown
    axis?: unknown
  },
): Vec3 {
  const positive = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  const axis = values.axis === 'x' || values.axis === 'z' ? values.axis : 'y'
  const radius = positive(values.radius, 0.5)
  const height = positive(values.height, 1)

  switch (kind) {
    case 'box':
    case 'wedge':
    case 'trapezoid-prism':
    case 'pyramid':
      return [0, height / 2, 0]
    case 'rounded-panel':
    case 'disk':
    case 'ellipse-panel':
    case 'semi-ellipse-panel':
      return [0, positive(values.thickness ?? values.height, 0.04) / 2, 0]
    case 'conformal-strip':
      return [0, 0, 0]
    case 'cylinder':
    case 'hollow-cylinder':
    case 'cone':
    case 'capsule':
    case 'half-cylinder':
      return [0, axis === 'y' ? height / 2 : radius, 0]
    case 'frustum':
      return [
        0,
        axis === 'y'
          ? height / 2
          : Math.max(positive(values.radiusTop, 0.25), positive(values.radiusBottom, 0.5)),
        0,
      ]
    case 'sphere':
    case 'ellipsoid':
    case 'hemisphere':
      return [0, radius, 0]
    case 'torus':
      return [
        0,
        positive(values.majorRadius ?? values.radius, 0.5) + positive(values.tubeRadius, 0.08),
        0,
      ]
    default:
      return [0, 0, 0]
  }
}
