/**
 * Generic spatial quality gate for AssemblyIR.
 *
 * Stage 6 of the Generator DSL plan, work item 4 — merged with the
 * spatial validation deferred from stage 1 (plan annotation 2026-07-26):
 * "质量门不能仅因角色齐全而放行'全重叠重复件'或'零角度 lid'".
 *
 * Layer 1 of the two-layer gate model (Appendix A.4):
 *   generic geometry gate (this file) — position uniqueness, bounds
 *   sanity, hinge rotation reality, no-overlap, partId continuity,
 *   port envelope checks (B.6). Industry engineering rules (spacing,
 *   support/grounding) are layered on top per category elsewhere.
 *
 * Pure function over the IR; no scene, no Three.js. AABBs are computed
 * from the primitive recipe's local envelope transformed by the part's
 * world transform (local-space parts are composed through their parent
 * chain). Rotation is approximated by rotating the local half-extent
 * vector — exact for AABB purposes.
 */

import type {
  AssemblyIR,
  AssemblyPart,
  Quat,
  Vec3,
} from '@pascal-app/core/lib/generated-assembly-ir'

// ---------------------------------------------------------------------------
// Result type (mirrors Stage3QualityReview shape so gates compose)
// ---------------------------------------------------------------------------

export type SpatialGateReview = {
  passed: boolean
  score: number
  issues: string[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function quatRotateVec(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * v[2] - qz * v[1])
  const ty = 2 * (qz * v[0] - qx * v[2])
  const tz = 2 * (qx * v[1] - qy * v[0])
  // v' = v + qw * t + cross(q.xyz, t)
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ]
}

function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

// ---------------------------------------------------------------------------
// Local envelopes per primitive recipe kind (mirrors the DSL builders and
// the generated-mesh renderer centering conventions)
// ---------------------------------------------------------------------------

type AABB = { min: Vec3; max: Vec3 }

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function pairs(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return []
  return value.filter(
    (p): p is [number, number] =>
      Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number',
  )
}

function vec3s(value: unknown): Vec3[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (p): p is Vec3 =>
      Array.isArray(p) &&
      typeof p[0] === 'number' &&
      typeof p[1] === 'number' &&
      typeof p[2] === 'number',
  )
}

/** Local-space AABB of a part's geometry, using renderer centering rules. */
export function localEnvelope(part: AssemblyPart): AABB {
  const fallback: AABB = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
  if (part.geometry.kind !== 'primitive-recipe') {
    if (part.geometry.kind === 'mesh-blob') return part.geometry.bounds
    return fallback
  }
  const params = part.geometry.params
  const kind = part.geometry.recipeId.startsWith('primitive.')
    ? part.geometry.recipeId.slice('primitive.'.length)
    : ''
  switch (kind) {
    case 'box': {
      const l = num(params.length, 1)
      const h = num(params.height, 1)
      const w = num(params.width, 1)
      return { min: [-l / 2, -h / 2, -w / 2], max: [l / 2, h / 2, w / 2] }
    }
    case 'cylinder':
    case 'cone': {
      const r = num(params.radius, 0.5)
      const h = num(params.height, 1)
      return { min: [-r, -h / 2, -r], max: [r, h / 2, r] }
    }
    case 'frustum': {
      const r = Math.max(num(params.radiusTop, 0.25), num(params.radiusBottom, 0.5))
      const h = num(params.height, 1)
      return { min: [-r, -h / 2, -r], max: [r, h / 2, r] }
    }
    case 'sphere': {
      const r = num(params.radius, 0.5)
      return { min: [-r, -r, -r], max: [r, r, r] }
    }
    case 'torus': {
      const r = num(params.majorRadius, 0.5) + num(params.tubeRadius, 0.1)
      const t = num(params.tubeRadius, 0.1)
      return { min: [-r, -t, -r], max: [r, t, r] }
    }
    case 'lathe': {
      const profile = pairs(params.profile)
      if (profile.length === 0) return fallback
      let maxX = 0
      let minY = Infinity
      let maxY = -Infinity
      for (const [x, y] of profile) {
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      // Renderer centers vertically.
      const cy = (minY + maxY) / 2
      return { min: [-maxX, minY - cy, -maxX], max: [maxX, maxY - cy, maxX] }
    }
    case 'extrude': {
      const profile = pairs(params.profile)
      const depth = num(params.depth, 0.1)
      if (profile.length === 0) return fallback
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const [x, y] of profile) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      // Renderer centers the whole bounding box (x=profile x, y=depth, z=profile y).
      const cx = (minX + maxX) / 2
      const cy2 = (minY + maxY) / 2
      return {
        min: [minX - cx, -depth / 2, minY - cy2],
        max: [maxX - cx, depth / 2, maxY - cy2],
      }
    }
    case 'sweep': {
      const path = vec3s(params.path)
      const radius = num(params.radius, 0.03)
      if (path.length === 0) return fallback
      let min: Vec3 = [Infinity, Infinity, Infinity]
      let max: Vec3 = [-Infinity, -Infinity, -Infinity]
      for (const p of path) {
        for (let i = 0; i < 3; i++) {
          if (p[i]! < min[i]!) min[i] = p[i]!
          if (p[i]! > max[i]!) max[i] = p[i]!
        }
      }
      // Renderer centers the bounding box, then the tube radius extends it.
      const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
      return {
        min: [
          min[0] - center[0] - radius,
          min[1] - center[1] - radius,
          min[2] - center[2] - radius,
        ],
        max: [
          max[0] - center[0] + radius,
          max[1] - center[1] + radius,
          max[2] - center[2] + radius,
        ],
      }
    }
    default:
      return fallback
  }
}

// ---------------------------------------------------------------------------
// World transforms (compose local-space parts through the parent chain)
// ---------------------------------------------------------------------------

type WorldTransform = { position: Vec3; rotation: Quat; scale: Vec3 }

function worldTransforms(ir: AssemblyIR): Map<string, WorldTransform> {
  const byId = new Map(ir.parts.map((p) => [p.id, p]))
  const memo = new Map<string, WorldTransform>()
  const visiting = new Set<string>()

  const resolve = (part: AssemblyPart): WorldTransform => {
    const cached = memo.get(part.id)
    if (cached) return cached
    const t = part.transform
    const self: WorldTransform = { position: t.position, rotation: t.rotation, scale: t.scale }
    if (t.space === 'world' || part.parentId === undefined || visiting.has(part.id)) {
      memo.set(part.id, self)
      return self
    }
    const parent = byId.get(part.parentId)
    if (!parent) {
      memo.set(part.id, self)
      return self
    }
    visiting.add(part.id)
    const pw = resolve(parent)
    visiting.delete(part.id)
    // Compose: world = parent ∘ local (scale applied component-wise).
    const scaled: Vec3 = [
      self.position[0] * pw.scale[0],
      self.position[1] * pw.scale[1],
      self.position[2] * pw.scale[2],
    ]
    const rotated = quatRotateVec(pw.rotation, scaled)
    const composed: WorldTransform = {
      position: [
        pw.position[0] + rotated[0],
        pw.position[1] + rotated[1],
        pw.position[2] + rotated[2],
      ],
      rotation: quatMultiply(pw.rotation, self.rotation),
      scale: [
        pw.scale[0] * self.scale[0],
        pw.scale[1] * self.scale[1],
        pw.scale[2] * self.scale[2],
      ],
    }
    memo.set(part.id, composed)
    return composed
  }

  for (const part of ir.parts) resolve(part)
  return memo
}

function worldAABB(part: AssemblyPart, wt: WorldTransform): AABB {
  const local = localEnvelope(part)
  // Rotate the half-extents; AABB of a rotated box.
  const half: Vec3 = [
    ((local.max[0] - local.min[0]) / 2) * Math.abs(wt.scale[0]),
    ((local.max[1] - local.min[1]) / 2) * Math.abs(wt.scale[1]),
    ((local.max[2] - local.min[2]) / 2) * Math.abs(wt.scale[2]),
  ]
  const localCenter: Vec3 = [
    ((local.min[0] + local.max[0]) / 2) * wt.scale[0],
    ((local.min[1] + local.max[1]) / 2) * wt.scale[1],
    ((local.min[2] + local.max[2]) / 2) * wt.scale[2],
  ]
  const ex = quatRotateVec(wt.rotation, [half[0], 0, 0])
  const ey = quatRotateVec(wt.rotation, [0, half[1], 0])
  const ez = quatRotateVec(wt.rotation, [0, 0, half[2]])
  const extent: Vec3 = [
    Math.abs(ex[0]) + Math.abs(ey[0]) + Math.abs(ez[0]),
    Math.abs(ex[1]) + Math.abs(ey[1]) + Math.abs(ez[1]),
    Math.abs(ex[2]) + Math.abs(ey[2]) + Math.abs(ez[2]),
  ]
  const centerOffset = quatRotateVec(wt.rotation, localCenter)
  const center: Vec3 = [
    wt.position[0] + centerOffset[0],
    wt.position[1] + centerOffset[1],
    wt.position[2] + centerOffset[2],
  ]
  return {
    min: [center[0] - extent[0], center[1] - extent[1], center[2] - extent[2]],
    max: [center[0] + extent[0], center[1] + extent[1], center[2] + extent[2]],
  }
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/** Two positions are "the same" when closer than this (meters). */
const POSITION_EPSILON = 1e-4
/** Overlap is only reported when the intersection exceeds this fraction
 *  of the smaller box's volume (ignores touching faces and keycap-style
 *  intentional adjacency). */
const OVERLAP_VOLUME_RATIO = 0.5
/** Sanity bound: a single part dimension above this is suspicious. */
const MAX_REASONABLE_DIMENSION = 500
/** Sanity bound: assembly extent above this is suspicious. */
const MAX_REASONABLE_EXTENT = 2000

export function reviewAssemblySpatial(ir: AssemblyIR): SpatialGateReview {
  const issues: string[] = []
  const warnings: string[] = []

  const wt = worldTransforms(ir)
  const aabbs = new Map<string, AABB>()
  for (const part of ir.parts) {
    const t = wt.get(part.id)
    if (t) aabbs.set(part.id, worldAABB(part, t))
  }

  checkDuplicatePositions(ir, wt, issues)
  checkBoundsSanity(ir, aabbs, issues, warnings)
  checkHinges(ir, wt, issues, warnings)
  checkPartIdContinuity(ir, warnings)
  checkOverlaps(ir, aabbs, issues)
  checkPorts(ir, aabbs, wt, issues, warnings)

  const score = Math.max(0, Math.min(1, 1 - issues.length * 0.2 - warnings.length * 0.05))
  return { passed: issues.length === 0, score, issues, warnings }
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkDuplicatePositions(
  ir: AssemblyIR,
  wt: Map<string, WorldTransform>,
  issues: string[],
): void {
  // Group parts by geometry identity (recipeId + serialized params).
  const groups = new Map<string, AssemblyPart[]>()
  for (const part of ir.parts) {
    const key =
      part.geometry.kind === 'primitive-recipe'
        ? `${part.geometry.recipeId}:${JSON.stringify(part.geometry.params)}`
        : `blob:${part.geometry.blobId}`
    const list = groups.get(key)
    if (list) list.push(part)
    else groups.set(key, [part])
  }
  for (const [key, parts] of groups) {
    if (parts.length < 2) continue
    const byPosition = new Map<string, string[]>()
    for (const part of parts) {
      const t = wt.get(part.id)
      if (!t) continue
      const posKey = t.position.map((n) => n.toFixed(4)).join(',')
      const list = byPosition.get(posKey)
      if (list) list.push(part.id)
      else byPosition.set(posKey, [part.id])
    }
    for (const [, ids] of byPosition) {
      if (ids.length > 1) {
        issues.push(
          `gate_duplicate_position: ${ids.length} identical parts share one world position: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? `, … (+${ids.length - 5})` : ''} [${key.slice(0, 60)}]`,
        )
      }
    }
  }
}

function checkBoundsSanity(
  ir: AssemblyIR,
  aabbs: Map<string, AABB>,
  issues: string[],
  warnings: string[],
): void {
  const assemblyMin: Vec3 = [Infinity, Infinity, Infinity]
  const assemblyMax: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const part of ir.parts) {
    const box = aabbs.get(part.id)
    if (!box) continue
    for (let i = 0; i < 3; i++) {
      const dim = box.max[i]! - box.min[i]!
      if (dim > MAX_REASONABLE_DIMENSION) {
        issues.push(
          `gate_bounds_unreasonable: part "${part.id}" dimension ${dim.toFixed(1)}m exceeds ${MAX_REASONABLE_DIMENSION}m on axis ${'xyz'[i]}.`,
        )
      }
      if (dim <= 0) {
        warnings.push(`gate_zero_dimension: part "${part.id}" has zero size on axis ${'xyz'[i]}.`)
      }
      if (box.min[i]! < assemblyMin[i]!) assemblyMin[i] = box.min[i]!
      if (box.max[i]! > assemblyMax[i]!) assemblyMax[i] = box.max[i]!
    }
  }
  if (ir.parts.length > 0) {
    for (let i = 0; i < 3; i++) {
      const extent = assemblyMax[i]! - assemblyMin[i]!
      if (extent > MAX_REASONABLE_EXTENT) {
        warnings.push(
          `gate_assembly_extent_large: assembly spans ${extent.toFixed(1)}m on axis ${'xyz'[i]}.`,
        )
      }
    }
  }
}

function checkHinges(
  ir: AssemblyIR,
  wt: Map<string, WorldTransform>,
  issues: string[],
  warnings: string[],
): void {
  for (const c of ir.constraints) {
    if (c.kind !== 'hinge') continue
    const part = ir.parts.find((p) => p.id === c.partId)
    const anchor = ir.parts.find((p) => p.id === c.anchorPartId)
    if (!part || !anchor) continue // validation layer reports missing refs
    const t = wt.get(part.id)
    if (!t) continue

    // "零角度 lid" — the deferred stage-1 check: a part declared with a
    // hinge constraint must actually be rotated relative to identity.
    const [qx, qy, qz, qw] = t.rotation
    const angle = 2 * Math.acos(Math.max(-1, Math.min(1, qw)))
    if (angle < (1 * Math.PI) / 180) {
      issues.push(
        `gate_hinge_zero_angle: part "${c.partId}" declares a hinge on "${c.anchorPartId}" but its world rotation is identity (${((angle * 180) / Math.PI).toFixed(2)}°).`,
      )
    }

    // Pivot sanity: the hinge pivot (declared in anchor-local space)
    // should lie near the anchor part's envelope. Compose pivot to world.
    const anchorWt = wt.get(anchor.id)
    if (anchorWt) {
      const pivotWorld = quatRotateVec(anchorWt.rotation, c.pivotLocal)
      const pw: Vec3 = [
        anchorWt.position[0] + pivotWorld[0],
        anchorWt.position[1] + pivotWorld[1],
        anchorWt.position[2] + pivotWorld[2],
      ]
      const anchorBox = localEnvelope(anchor)
      const half: Vec3 = [
        (anchorBox.max[0] - anchorBox.min[0]) / 2 + 0.05,
        (anchorBox.max[1] - anchorBox.min[1]) / 2 + 0.05,
        (anchorBox.max[2] - anchorBox.min[2]) / 2 + 0.05,
      ]
      const dx = Math.abs(pw[0] - anchorWt.position[0])
      const dy = Math.abs(pw[1] - anchorWt.position[1])
      const dz = Math.abs(pw[2] - anchorWt.position[2])
      if (dx > half[0] || dy > half[1] || dz > half[2]) {
        warnings.push(
          `gate_hinge_pivot_outside_anchor: hinge pivot of "${c.partId}" sits ${Math.max(dx - half[0], dy - half[1], dz - half[2]).toFixed(3)}m outside anchor "${c.anchorPartId}" envelope.`,
        )
      }
    }
  }
}

function checkPartIdContinuity(ir: AssemblyIR, warnings: string[]): void {
  // Indexed families: keyboard.key.r3.c7 → base 'keyboard.key', indices
  // per trailing dimension. Gaps in an otherwise dense range suggest the
  // generator dropped loop iterations.
  const family = new Map<string, Map<string, number[]>>()
  const re = /^(.*)\.([a-z])(\d+)$/
  for (const part of ir.parts) {
    const m = re.exec(part.id)
    if (!m) continue
    const [, base, dim, idxStr] = m
    if (!base || !dim || !idxStr) continue
    const idx = Number.parseInt(idxStr, 10)
    let dims = family.get(base)
    if (!dims) {
      dims = new Map()
      family.set(base, dims)
    }
    const list = dims.get(dim)
    if (list) list.push(idx)
    else dims.set(dim!, [idx])
  }
  for (const [base, dims] of family) {
    for (const [dim, indices] of dims) {
      if (indices.length < 3) continue
      const sorted = [...new Set(indices)].sort((a, b) => a - b)
      const lo = sorted[0]!
      const hi = sorted[sorted.length - 1]!
      if (hi - lo + 1 !== sorted.length) {
        warnings.push(
          `gate_part_id_gap: partId family "${base}" dimension "${dim}" spans ${lo}..${hi} but only ${sorted.length} of ${hi - lo + 1} indices exist.`,
        )
      }
    }
  }
}

function checkOverlaps(ir: AssemblyIR, aabbs: Map<string, AABB>, issues: string[]): void {
  // Only compare "key" structural parts against each other: skip pairs
  // in a parent-child relationship (screen-in-lid is intentional) and
  // skip grid-sibling families (keycaps tile by design — the duplicate
  // position check catches the pathological case).
  const partById = new Map(ir.parts.map((p) => [p.id, p]))
  const parentOf = new Map(ir.parts.map((p) => [p.id, p.parentId]))
  const isRelated = (a: string, b: string) => parentOf.get(a) === b || parentOf.get(b) === a
  const hingeAnchorPairs = new Set(
    ir.constraints
      .filter((c) => c.kind === 'hinge')
      .flatMap((c) => [`${c.partId}\u0000${c.anchorPartId}`, `${c.anchorPartId}\u0000${c.partId}`]),
  )
  const hingeAnchorByPart = new Map(
    ir.constraints.filter((c) => c.kind === 'hinge').map((c) => [c.partId, c.anchorPartId]),
  )
  const isHingeAnchorPair = (a: string, b: string) => hingeAnchorPairs.has(`${a}\u0000${b}`)
  const familyOf = (id: string) => id.replace(/\.[a-z]\d+$/g, '')
  const labelOf = (part: AssemblyPart) => `${part.id} ${part.semanticRole ?? ''}`.toLowerCase()
  const isDoorPanel = (part: AssemblyPart) => /(door|panel|lid|闂ㄦ澘)/i.test(labelOf(part))
  const isLeftSide = (part: AssemblyPart) =>
    /(^|[._\s-])left($|[._\s-])|left_|_left|左/i.test(labelOf(part))
  const isRightSide = (part: AssemblyPart) =>
    /(^|[._\s-])right($|[._\s-])|right_|_right|右/i.test(labelOf(part))
  const isOpposingHingedDoorPair = (a: AssemblyPart, b: AssemblyPart) => {
    const anchorA = hingeAnchorByPart.get(a.id)
    const anchorB = hingeAnchorByPart.get(b.id)
    if (!anchorA || anchorA !== anchorB) return false
    if (!isDoorPanel(a) || !isDoorPanel(b)) return false
    return (isLeftSide(a) && isRightSide(b)) || (isRightSide(a) && isLeftSide(b))
  }
  const nearestHingedAncestor = (partId: string) => {
    let current: string | undefined = partId
    const seen = new Set<string>()
    while (current && !seen.has(current)) {
      seen.add(current)
      if (hingeAnchorByPart.has(current)) return current
      current = parentOf.get(current)
    }
    return undefined
  }
  const isOpposingHingedDoorDescendantPair = (a: AssemblyPart, b: AssemblyPart) => {
    const hingedA = nearestHingedAncestor(a.id)
    const hingedB = nearestHingedAncestor(b.id)
    if (!hingedA || !hingedB || hingedA === hingedB) return false
    const doorA = partById.get(hingedA)
    const doorB = partById.get(hingedB)
    return Boolean(doorA && doorB && isOpposingHingedDoorPair(doorA, doorB))
  }
  const isEnclosureHost = (part: AssemblyPart) =>
    /(body|cabinet|case|shell|enclosure|housing|frame|cavity|compartment|interior|liner|箱体|柜体|内腔)/i.test(
      labelOf(part),
    )
  const isInternalFeature = (part: AssemblyPart) =>
    /(shelf|shelves|rack|cavity|compartment|divider|drawer|inner|interior|liner|隔板|搁架|内腔|抽屉)/i.test(
      labelOf(part),
    )
  const isSurfaceHost = (part: AssemblyPart) =>
    /(body|cabinet|case|shell|enclosure|housing|frame|door|panel|lid|cover|箱体|柜体|门板)/i.test(
      labelOf(part),
    )
  const isAttachedDetail = (part: AssemblyPart) =>
    /(handle|hinge|knob|display|screen|button|control|vent|grille|grill|logo|label|trim|accent|把手|铰链|按钮|屏幕|通风|格栅)/i.test(
      labelOf(part),
    )
  const isInteriorVolumeMarker = (part: AssemblyPart) =>
    /(cavity|compartment|inner|interior|liner|void|volume)/i.test(labelOf(part))
  const isInteriorContent = (part: AssemblyPart) =>
    /(shelf|shelves|rack|divider|drawer|basket|tray|bin)/i.test(labelOf(part))
  const isSupportDetail = (part: AssemblyPart) =>
    /(foot|feet|leg|support|base|caster|pad|脚|支撑)/i.test(labelOf(part))
  const contains = (outer: AABB, inner: AABB, epsilon = 1e-4) =>
    outer.min[0] <= inner.min[0] + epsilon &&
    outer.min[1] <= inner.min[1] + epsilon &&
    outer.min[2] <= inner.min[2] + epsilon &&
    outer.max[0] >= inner.max[0] - epsilon &&
    outer.max[1] >= inner.max[1] - epsilon &&
    outer.max[2] >= inner.max[2] - epsilon
  const isIntentionalInternalContainment = (
    a: AssemblyPart,
    boxA: AABB,
    b: AssemblyPart,
    boxB: AABB,
  ) =>
    (contains(boxA, boxB) && isEnclosureHost(a) && isInternalFeature(b)) ||
    (contains(boxB, boxA) && isEnclosureHost(b) && isInternalFeature(a))
  const isIntentionalSurfaceAttachment = (a: AssemblyPart, b: AssemblyPart) =>
    (isSurfaceHost(a) && isAttachedDetail(b)) || (isSurfaceHost(b) && isAttachedDetail(a))

  const isIntentionalInteriorVolumeOverlap = (a: AssemblyPart, b: AssemblyPart) =>
    (isInteriorVolumeMarker(a) && isInteriorContent(b)) ||
    (isInteriorVolumeMarker(b) && isInteriorContent(a))
  const isIntentionalSupportAttachment = (a: AssemblyPart, b: AssemblyPart) =>
    (isEnclosureHost(a) && isSupportDetail(b)) || (isEnclosureHost(b) && isSupportDetail(a))
  const isIntentionalPumpCasingComposition = (a: AssemblyPart, b: AssemblyPart) => {
    const roles = new Set([a.semanticRole, b.semanticRole])
    return roles.has('volute_casing') && roles.has('pump_casing_bulge')
  }

  const parts = ir.parts
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i]!
      const b = parts[j]!
      if (isRelated(a.id, b.id)) continue
      if (isHingeAnchorPair(a.id, b.id)) continue
      if (isOpposingHingedDoorPair(a, b)) continue
      if (isOpposingHingedDoorDescendantPair(a, b)) continue
      if (familyOf(a.id) === familyOf(b.id)) continue
      if (isInteriorVolumeMarker(a) || isInteriorVolumeMarker(b)) continue
      const boxA = aabbs.get(a.id)
      const boxB = aabbs.get(b.id)
      if (!boxA || !boxB) continue
      if (isIntentionalInternalContainment(a, boxA, b, boxB)) continue
      if (isIntentionalSurfaceAttachment(a, b)) continue
      if (isIntentionalInteriorVolumeOverlap(a, b)) continue
      if (isIntentionalSupportAttachment(a, b)) continue
      if (isIntentionalPumpCasingComposition(a, b)) continue
      const ix = Math.min(boxA.max[0], boxB.max[0]) - Math.max(boxA.min[0], boxB.min[0])
      const iy = Math.min(boxA.max[1], boxB.max[1]) - Math.max(boxA.min[1], boxB.min[1])
      const iz = Math.min(boxA.max[2], boxB.max[2]) - Math.max(boxA.min[2], boxB.min[2])
      if (ix <= 0 || iy <= 0 || iz <= 0) continue
      const intersection = ix * iy * iz
      const volA =
        (boxA.max[0] - boxA.min[0]) * (boxA.max[1] - boxA.min[1]) * (boxA.max[2] - boxA.min[2])
      const volB =
        (boxB.max[0] - boxB.min[0]) * (boxB.max[1] - boxB.min[1]) * (boxB.max[2] - boxB.min[2])
      const smaller = Math.min(volA, volB)
      if (smaller > 0 && intersection / smaller > OVERLAP_VOLUME_RATIO) {
        issues.push(
          `gate_part_overlap: parts "${a.id}" and "${b.id}" overlap ${((intersection / smaller) * 100).toFixed(0)}% of the smaller volume.`,
        )
      }
    }
  }
}

function checkPorts(
  ir: AssemblyIR,
  aabbs: Map<string, AABB>,
  wt: Map<string, WorldTransform>,
  issues: string[],
  warnings: string[],
): void {
  if (!ir.ports || ir.ports.length === 0) return
  const connectedPortIds = new Set<string>()
  for (const conn of ir.connections ?? []) {
    connectedPortIds.add(conn.fromPort)
    connectedPortIds.add(conn.toPort)
  }

  for (const port of ir.ports) {
    const ownerBox = aabbs.get(port.partId)
    const ownerWt = wt.get(port.partId)
    if (!ownerBox || !ownerWt) continue

    // B.6 gate_port_not_dangling: a connected port must sit on (or
    // within tolerance of) its owning part's envelope surface.
    if (connectedPortIds.has(port.id)) {
      const withinY = port.height >= ownerBox.min[1] - 0.01 && port.height <= ownerBox.max[1] + 0.01
      if (!withinY) {
        issues.push(
          `gate_port_not_dangling: port "${port.id}" height ${port.height.toFixed(3)}m is outside owning part "${port.partId}" envelope y-range [${ownerBox.min[1].toFixed(3)}, ${ownerBox.max[1].toFixed(3)}].`,
        )
      }
    }

    // B.6 gate_port_side_consistency: declared side should agree with
    // the port's position relative to the owner's center. We only know
    // height + optional lateral offset, so check the vertical sides.
    const centerY = (ownerBox.min[1] + ownerBox.max[1]) / 2
    if (port.side === 'top' && port.height < centerY - 0.01) {
      warnings.push(
        `gate_port_side_consistency: port "${port.id}" declares side 'top' but height ${port.height.toFixed(3)}m is below part center ${centerY.toFixed(3)}m.`,
      )
    }
    if (port.side === 'bottom' && port.height > centerY + 0.01) {
      warnings.push(
        `gate_port_side_consistency: port "${port.id}" declares side 'bottom' but height ${port.height.toFixed(3)}m is above part center ${centerY.toFixed(3)}m.`,
      )
    }
  }
}
