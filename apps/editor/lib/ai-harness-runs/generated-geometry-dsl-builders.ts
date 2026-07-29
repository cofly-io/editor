/**
 * DSL builder API — whitelisted geometry / assembly constructors injected
 * into the DSL evaluator.
 *
 * Stage 3 design decisions honored here:
 *  - A: chained builders (part(...).atWorld(...).withRole(...))
 *  - B: rotateAround accepts either {axis, degrees} or {axis, radians}
 *  - F: atWorld / atLocal are separate APIs; mixing is a compile error
 *  - H: childOf(...) must precede atLocal(...); evaluator enforces
 */

import {
  type AgitatorTankParams,
  type BearingBlockParams,
  type BeltParams,
  type BlowerPackageParams,
  type BoxFrameParams,
  buildAgitatorTank,
  buildBearingBlock,
  buildBelt,
  buildBlowerPackage,
  buildBoxFrame,
  buildCentrifugalFan,
  buildControlCabinet,
  buildDustCollector,
  buildFlangePort,
  buildGearbox,
  buildGuardCover,
  buildHandrail,
  buildHeatExchanger,
  buildInspectionDoor,
  buildLadder,
  buildMotor,
  buildNameplate,
  buildPipeRun,
  buildPlatform,
  buildPumpCasing,
  buildRollerArray,
  buildSheetCover,
  buildSkidBase,
  buildVerticalVessel,
  type CentrifugalFanParams,
  type ControlCabinetParams,
  type DustCollectorParams,
  EQUIPMENT_MATERIALS,
  type EquipmentBounds,
  type EquipmentBuildContext,
  type EquipmentPartSpec,
  type FlangePortParams,
  type GearboxParams,
  type GuardCoverParams,
  type HandrailParams,
  type HeatExchangerParams,
  type InspectionDoorParams,
  type LadderParams,
  type MotorParams,
  type NameplateParams,
  type PipeRunParams,
  type PlatformParams,
  type PumpCasingParams,
  type RollerArrayParams,
  type SheetCoverParams,
  type SkidBaseParams,
  type VerticalVesselParams,
} from '@pascal-app/core/lib/equipment-sdk/equipment-functions'
import type {
  AssemblyConstraint,
  AssemblyIR,
  AssemblyPart,
  GeometryRecipe,
  IRConnection,
  IRPort,
  Quat,
  SerializableMaterial,
  Vec3,
} from '@pascal-app/core/lib/generated-assembly-ir'
import { DSL_API_VERSION } from '@pascal-app/core/lib/generated-geometry-dsl-contract'

// ---------------------------------------------------------------------------
// Geometry builders
// ---------------------------------------------------------------------------

/**
 * Optional appearance inputs shared by every geometry constructor. `color`
 * is a CSS-style hex string ('#cc0000' or '#c00'); roughness / metalness
 * are 0..1 PBR scalars. These ride alongside the `material` preset so a
 * part can be e.g. a *red metal* (preset drives the shading model, color
 * tints it).
 */
export type GeometryAppearance = {
  color?: string
  roughness?: number
  metalness?: number
  opacity?: number
}

export type GeometryBuilder =
  | ({
      kind: 'box'
      length: number
      width: number
      height: number
      material?: string
      cornerRadius?: number
      cornerSegments?: number
    } & GeometryAppearance)
  | ({
      kind: 'cylinder'
      radius: number
      height: number
      material?: string
      radialSegments?: number
    } & GeometryAppearance)
  | ({ kind: 'sphere'; radius: number; material?: string } & GeometryAppearance)
  | ({
      kind: 'cone'
      radius: number
      height: number
      material?: string
      radialSegments?: number
    } & GeometryAppearance)
  | ({
      kind: 'frustum'
      radiusTop: number
      radiusBottom: number
      height: number
      material?: string
      radialSegments?: number
    } & GeometryAppearance)
  | ({
      kind: 'torus'
      majorRadius: number
      tubeRadius: number
      material?: string
      radialSegments?: number
      tubularSegments?: number
    } & GeometryAppearance)
  | ({ kind: 'lathe'; profile: Array<[number, number]>; material?: string } & GeometryAppearance)
  | ({
      kind: 'extrude'
      profile: Array<[number, number]>
      depth: number
      material?: string
      bevelSize?: number
      bevelThickness?: number
      bevelSegments?: number
    } & GeometryAppearance)
  | ({
      kind: 'sweep'
      path: Vec3[]
      radius: number
      material?: string
      radialSegments?: number
      tubularSegments?: number
    } & GeometryAppearance)

function toRecipe(g: GeometryBuilder): GeometryRecipe {
  const {
    kind,
    material: _m,
    color: _c,
    roughness: _r,
    metalness: _met,
    opacity: _opacity,
    ...params
  } = g
  return { kind: 'primitive-recipe', recipeId: `primitive.${kind}`, params }
}

const GEOMETRY_BUILDER_KINDS = new Set([
  'box',
  'cylinder',
  'sphere',
  'cone',
  'frustum',
  'torus',
  'lathe',
  'extrude',
  'sweep',
])

function isGeometryBuilder(value: unknown): value is GeometryBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as { kind: unknown }).kind === 'string' &&
    GEOMETRY_BUILDER_KINDS.has((value as { kind: string }).kind)
  )
}

/**
 * Parse a CSS hex color ('#rrggbb' or '#rgb') into a linear-ish RGB Vec3
 * in 0..1. Returns undefined for malformed input so a bad color never
 * crashes a compile — it just drops the tint.
 */
export function hexToVec3(hex: string | undefined): Vec3 | undefined {
  if (typeof hex !== 'string') return undefined
  let h = hex.trim()
  if (!h.startsWith('#')) return undefined
  h = h.slice(1)
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return undefined
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return [r, g, b]
}

// ---------------------------------------------------------------------------
// Rotation spec
// ---------------------------------------------------------------------------

export type AxisRotation =
  | { axis: 'x' | 'y' | 'z'; degrees: number }
  | { axis: 'x' | 'y' | 'z'; radians: number }

function axisRotationToQuat(spec: AxisRotation): Quat {
  const radians = 'radians' in spec ? spec.radians : (spec.degrees * Math.PI) / 180
  const half = radians / 2
  const s = Math.sin(half)
  const c = Math.cos(half)
  switch (spec.axis) {
    case 'x':
      return [s, 0, 0, c]
    case 'y':
      return [0, s, 0, c]
    case 'z':
      return [0, 0, s, c]
  }
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

function quatRotateVec(q: Quat, v: Vec3): Vec3 {
  // v' = q * (v, 0) * q⁻¹; for unit quat q⁻¹ = conjugate
  const [qx, qy, qz, qw] = q
  const [vx, vy, vz] = v
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy)
  const ty = 2 * (qz * vx - qx * vz)
  const tz = 2 * (qx * vy - qy * vx)
  // v' = v + qw * t + cross(q.xyz, t)
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ]
}

// ---------------------------------------------------------------------------
// Part builder
// ---------------------------------------------------------------------------

export type PartBuilderDiagnostic = {
  code: string
  message: string
}

export type PartBuilder = {
  readonly id: string
  readonly geometry: GeometryBuilder
  parentId?: string
  semanticRole?: string
  material: SerializableMaterial
  position: Vec3
  rotation: Quat
  scale: Vec3
  transformSpace: 'world' | 'local'
  ports: IRPort[]
  /** Internal: errors accumulated during chained calls. */
  readonly __errors: PartBuilderDiagnostic[]
  /** Internal: track which position API was used. */
  __positionKind: 'world' | 'local' | undefined

  atWorld(pos: Vec3): PartBuilder
  atLocal(pos: Vec3): PartBuilder
  /**
   * Rotate around a world-space pivot. Must be called AFTER atWorld.
   * The rotation is applied about the pivot; the part's position is updated
   * so the pivot stays fixed in world space.
   */
  rotateAround(pivotWorld: Vec3, spec: AxisRotation): PartBuilder
  /**
   * Apply an additional rotation about the part's own center. Composition
   * order: rotation = new * existing (pre-multiply).
   */
  rotate(spec: AxisRotation): PartBuilder
  scaleBy(s: Vec3): PartBuilder
  withMaterial(m: SerializableMaterial): PartBuilder
  withRole(role: string): PartBuilder
  childOf(parentId: string): PartBuilder
  port(name: string, spec: Omit<IRPort, 'id' | 'partId'>): PartBuilder
}

export function makePartBuilder(id: string, geometry: GeometryBuilder): PartBuilder {
  const color = hexToVec3(geometry.color)
  const builder: PartBuilder = {
    id,
    geometry,
    material: {
      ...(geometry.material ? { preset: geometry.material } : {}),
      ...(color ? { color } : {}),
      ...(geometry.roughness !== undefined ? { roughness: geometry.roughness } : {}),
      ...(geometry.metalness !== undefined ? { metalness: geometry.metalness } : {}),
      ...(geometry.opacity !== undefined ? { opacity: geometry.opacity } : {}),
    },
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    transformSpace: 'world',
    ports: [],
    __errors: [],
    __positionKind: undefined,

    atWorld(pos: Vec3) {
      if (this.parentId !== undefined) {
        this.__errors.push({
          code: 'dsl_world_after_childof',
          message: `part '${this.id}' called atWorld() after childOf('${this.parentId}'). Use atLocal() for child parts.`,
        })
        return this
      }
      if (this.__positionKind === 'local') {
        this.__errors.push({
          code: 'dsl_world_local_mismatch',
          message: `part '${this.id}' mixed atLocal() and atWorld(). Pick one.`,
        })
        return this
      }
      this.position = [pos[0], pos[1], pos[2]]
      this.transformSpace = 'world'
      this.__positionKind = 'world'
      return this
    },

    atLocal(pos: Vec3) {
      if (this.parentId === undefined) {
        this.__errors.push({
          code: 'dsl_local_without_parent',
          message: `part '${this.id}' called atLocal() but has no parent. Call childOf(parentId) first, or use atWorld() instead.`,
        })
        return this
      }
      if (this.__positionKind === 'world') {
        this.__errors.push({
          code: 'dsl_world_local_mismatch',
          message: `part '${this.id}' mixed atWorld() and atLocal(). Pick one.`,
        })
        return this
      }
      this.position = [pos[0], pos[1], pos[2]]
      this.transformSpace = 'local'
      this.__positionKind = 'local'
      return this
    },

    rotateAround(pivotWorld: Vec3, spec: AxisRotation) {
      if (this.__positionKind !== 'world') {
        this.__errors.push({
          code: 'dsl_rotatearound_requires_world',
          message: `part '${this.id}' must call atWorld() before rotateAround(). rotateAround operates in world space.`,
        })
        return this
      }
      const q = axisRotationToQuat(spec)
      // Offset from pivot to current position
      const offset: Vec3 = [
        this.position[0] - pivotWorld[0],
        this.position[1] - pivotWorld[1],
        this.position[2] - pivotWorld[2],
      ]
      const rotated = quatRotateVec(q, offset)
      this.position = [
        pivotWorld[0] + rotated[0],
        pivotWorld[1] + rotated[1],
        pivotWorld[2] + rotated[2],
      ]
      // Pre-multiply rotation so the part's local axes also rotate about the pivot
      this.rotation = quatMultiply(q, this.rotation)
      return this
    },

    rotate(spec: AxisRotation) {
      const q = axisRotationToQuat(spec)
      this.rotation = quatMultiply(q, this.rotation)
      return this
    },

    scaleBy(s: Vec3) {
      this.scale = [s[0], s[1], s[2]]
      return this
    },

    withMaterial(m: SerializableMaterial) {
      this.material = { ...this.material, ...m }
      return this
    },

    withRole(role: string) {
      this.semanticRole = role
      return this
    },

    childOf(parentId: string) {
      if (this.parentId !== undefined && this.parentId !== parentId) {
        this.__errors.push({
          code: 'dsl_multiple_parents',
          message: `part '${this.id}' already has parent '${this.parentId}'; cannot also be child of '${parentId}'.`,
        })
        return this
      }
      if (this.__positionKind === 'world') {
        this.__errors.push({
          code: 'dsl_world_local_mismatch',
          message: `part '${this.id}' called atWorld() before childOf(). Call childOf() first, then atLocal().`,
        })
        return this
      }
      this.parentId = parentId
      this.transformSpace = 'local'
      return this
    },

    port(name: string, spec: Omit<IRPort, 'id' | 'partId'>) {
      this.ports.push({ id: `${this.id}.${name}`, partId: this.id, ...spec })
      return this
    },
  }
  return builder
}

// ---------------------------------------------------------------------------
// Constraint & connection builders
// ---------------------------------------------------------------------------

export type HingeBuilder = {
  kind: 'hinge'
  partId: string
  anchorPartId: string
  axisLocal: Vec3
  pivotLocal: Vec3
  restAngle: number
  limits?: [number, number]
}

export type GridBuilder = {
  kind: 'grid'
  partIds: string[]
  rows: number
  columns: number
  layers?: number
  spacing: Vec3
  origin: Vec3
}

export type ConnectionBuilder = {
  id: string
  fromPort: string
  toPort: string
  medium: string
  kind?: string
  waypoints?: Vec3[]
}

// ---------------------------------------------------------------------------
// Assembly accumulator
// ---------------------------------------------------------------------------

export type AssemblyAccumulator = {
  parts: PartBuilder[]
  constraints: AssemblyConstraint[]
  connections: ConnectionBuilder[]
}

export function createAssemblyAccumulator(): AssemblyAccumulator {
  return { parts: [], constraints: [], connections: [] }
}

// ---------------------------------------------------------------------------
// IR materialization
// ---------------------------------------------------------------------------

export function buildAssemblyIRFromBuilders(
  acc: AssemblyAccumulator,
  hashes: { sourceHash: string; paramsHash: string; apiVersion: string },
): AssemblyIR {
  const parts: AssemblyPart[] = acc.parts.map((p) => {
    const geometry = toRecipe(p.geometry)
    const fingerprint = computePartFingerprint(p, geometry)
    return {
      id: p.id,
      ...(p.semanticRole !== undefined ? { semanticRole: p.semanticRole } : {}),
      ...(p.parentId !== undefined ? { parentId: p.parentId } : {}),
      transform: {
        space: p.transformSpace,
        position: p.position,
        rotation: p.rotation,
        scale: p.scale,
      },
      geometry,
      material: p.material,
      fingerprint,
    }
  })

  const allPorts: IRPort[] = acc.parts.flatMap((p) => p.ports)

  const ir: AssemblyIR = {
    schemaVersion: 1,
    generator: {
      sourceHash: hashes.sourceHash,
      apiVersion: hashes.apiVersion,
      paramsHash: hashes.paramsHash,
    },
    parts,
    constraints: acc.constraints,
    ...(allPorts.length > 0 ? { ports: allPorts } : {}),
    ...(acc.connections.length > 0
      ? {
          connections: acc.connections.map(
            (c): IRConnection => ({
              id: c.id,
              fromPort: c.fromPort,
              toPort: c.toPort,
              medium: c.medium,
              ...(c.kind !== undefined ? { kind: c.kind } : {}),
              ...(c.waypoints !== undefined ? { waypoints: c.waypoints } : {}),
            }),
          ),
        }
      : {}),
  }
  return ir
}

function computePartFingerprint(p: PartBuilder, geometry: GeometryRecipe): string {
  const payload = {
    id: p.id,
    geometry,
    material: p.material,
    position: p.position,
    rotation: p.rotation,
    scale: p.scale,
    parentId: p.parentId,
    role: p.semanticRole,
    transformSpace: p.transformSpace,
    ports: [...p.ports].sort((a, b) => a.id.localeCompare(b.id)),
  }
  return stableHash(payload)
}

// ---------------------------------------------------------------------------
// Stable hashing (FNV-1a over canonical JSON)
// ---------------------------------------------------------------------------

export function stableHash(value: unknown): string {
  const json = canonicalJson(value)
  let h = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `fnv1a:${(h >>> 0).toString(16).padStart(8, '0')}`
}

function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null'
    return value === 0 ? '0' : String(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return 'null'
}

// ---------------------------------------------------------------------------
// DSL API factory (injected into the evaluator)
// ---------------------------------------------------------------------------

export type CreateBuildersOptions = {
  acc: AssemblyAccumulator
  onDiagnostic: (message: string, code?: string) => void
}

export function createDslApiBuilders(opts: CreateBuildersOptions) {
  const { acc, onDiagnostic } = opts
  const equipmentTargets = new Map<string, EquipmentBounds>()

  const registerPart = (id: unknown, geometry: unknown): PartBuilder | undefined => {
    if (typeof id !== 'string' || id.length === 0) {
      onDiagnostic('part() requires a non-empty string id', 'dsl_invalid_part_id')
      return undefined
    }
    if (Array.isArray(geometry)) {
      onDiagnostic(
        `part('${id}', ...) requires a primitive geometry builder such as box() or cylinder(). Equipment semantic constructors such as nameplate(), inspectionDoor(), motor(), guardCover(), belt(), rollerArray(), boxFrame(), verticalVessel(), dustCollector(), heatExchanger(), and agitatorTank() already create parts and must be called as top-level statements, not wrapped in part().`,
        'dsl_equipment_constructor_wrapped_in_part',
      )
      return undefined
    }
    if (!isGeometryBuilder(geometry)) {
      onDiagnostic(
        `part('${id}', ...) requires a primitive geometry builder such as box(), cylinder(), sphere(), cone(), frustum(), torus(), lathe(), extrude(), or sweep().`,
        'dsl_invalid_part_geometry',
      )
      return undefined
    }
    if (acc.parts.some((p) => p.id === id)) {
      onDiagnostic(`duplicate part id '${id}'`, 'dsl_duplicate_part_id')
      return undefined
    }
    if (acc.parts.length >= 256) {
      onDiagnostic(`part budget exceeded (max 256)`, 'dsl_budget_exceeded')
      return undefined
    }
    const builder = makePartBuilder(id, geometry)
    acc.parts.push(builder)
    return builder
  }

  const rememberTarget = (key: string | undefined, bounds: EquipmentBounds | undefined) => {
    if (!key || !bounds || equipmentTargets.has(key)) return
    equipmentTargets.set(key, bounds)
  }

  const unionBounds = (id: string, bounds: EquipmentBounds[]): EquipmentBounds | undefined => {
    if (bounds.length === 0) return undefined
    const mins: Vec3 = [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ]
    const maxs: Vec3 = [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]
    for (const b of bounds) {
      const [cx, cy, cz] = b.center
      const [sx, sy, sz] = b.size
      mins[0] = Math.min(mins[0], cx - sx / 2)
      mins[1] = Math.min(mins[1], cy - sy / 2)
      mins[2] = Math.min(mins[2], cz - sz / 2)
      maxs[0] = Math.max(maxs[0], cx + sx / 2)
      maxs[1] = Math.max(maxs[1], cy + sy / 2)
      maxs[2] = Math.max(maxs[2], cz + sz / 2)
    }
    return {
      id,
      center: [(mins[0] + maxs[0]) / 2, (mins[1] + maxs[1]) / 2, (mins[2] + maxs[2]) / 2],
      size: [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]],
      ...(bounds[0]?.semanticRole ? { semanticRole: bounds[0].semanticRole } : {}),
    }
  }

  const baseIdOf = (id: string) => id.split('.')[0] ?? id

  const registerEquipmentSpecs = (specs: EquipmentPartSpec[]): PartBuilder[] => {
    const builders: PartBuilder[] = []
    const boundsByBase = new Map<string, EquipmentBounds[]>()

    for (const s of specs) {
      if (s.bounds) {
        const baseId = baseIdOf(s.id)
        const list = boundsByBase.get(baseId) ?? []
        list.push(s.bounds)
        boundsByBase.set(baseId, list)
      }
    }
    for (const [baseId, bounds] of boundsByBase) {
      rememberTarget(baseId, unionBounds(baseId, bounds))
    }

    for (const s of specs) {
      const materialPreset = s.material ? EQUIPMENT_MATERIALS[s.material] : undefined
      const geometry = {
        kind: s.kind,
        ...s.params,
        ...(s.material ? { material: s.material } : {}),
        ...((s.color ?? materialPreset?.color) ? { color: s.color ?? materialPreset?.color } : {}),
        ...(materialPreset?.roughness !== undefined ? { roughness: materialPreset.roughness } : {}),
        ...(materialPreset?.metalness !== undefined ? { metalness: materialPreset.metalness } : {}),
        ...(materialPreset?.opacity !== undefined ? { opacity: materialPreset.opacity } : {}),
      } as GeometryBuilder
      const builder = registerPart(s.id, geometry)
      if (!builder) continue
      builder.atWorld(s.position).withRole(s.semanticRole)
      if (s.rotation) builder.rotate(s.rotation)
      builders.push(builder)
      rememberTarget(s.id, s.bounds)
      rememberTarget(s.semanticRole, s.bounds)
    }
    return builders
  }

  const equipmentContext: EquipmentBuildContext = {
    resolveTarget: (idOrRole) => (idOrRole ? equipmentTargets.get(idOrRole) : undefined),
  }

  return {
    box: (
      o: { length: number; width: number; height: number; material?: string } & GeometryAppearance,
    ) => ({ kind: 'box', ...o }) as GeometryBuilder,
    cylinder: (o: { radius: number; height: number; material?: string } & GeometryAppearance) =>
      ({ kind: 'cylinder', ...o }) as GeometryBuilder,
    sphere: (o: { radius: number; material?: string } & GeometryAppearance) =>
      ({ kind: 'sphere', ...o }) as GeometryBuilder,
    cone: (o: { radius: number; height: number; material?: string } & GeometryAppearance) =>
      ({ kind: 'cone', ...o }) as GeometryBuilder,
    frustum: (
      o: {
        radiusTop: number
        radiusBottom: number
        height: number
        material?: string
      } & GeometryAppearance,
    ) => ({ kind: 'frustum', ...o }) as GeometryBuilder,
    torus: (
      o: { majorRadius: number; tubeRadius: number; material?: string } & GeometryAppearance,
    ) => ({ kind: 'torus', ...o }) as GeometryBuilder,
    lathe: (o: { profile: Array<[number, number]>; material?: string } & GeometryAppearance) =>
      ({ kind: 'lathe', ...o }) as GeometryBuilder,
    extrude: (
      o: {
        profile: Array<[number, number]>
        depth: number
        material?: string
      } & GeometryAppearance,
    ) => ({ kind: 'extrude', ...o }) as GeometryBuilder,
    sweep: (o: { path: Vec3[]; radius: number; material?: string } & GeometryAppearance) =>
      ({ kind: 'sweep', ...o }) as GeometryBuilder,

    part: registerPart,

    equipment: (_kind: string | Record<string, unknown>, _o?: Record<string, unknown>) => [],
    belt: (o: BeltParams) => registerEquipmentSpecs(buildBelt(o)),
    rollerArray: (o: RollerArrayParams) => registerEquipmentSpecs(buildRollerArray(o)),
    boxFrame: (o: BoxFrameParams) => registerEquipmentSpecs(buildBoxFrame(o)),
    guardCover: (o: GuardCoverParams) =>
      registerEquipmentSpecs(buildGuardCover(o, equipmentContext)),
    motor: (o: MotorParams) => registerEquipmentSpecs(buildMotor(o, equipmentContext)),
    gearbox: (o: GearboxParams) => registerEquipmentSpecs(buildGearbox(o, equipmentContext)),
    bearingBlock: (o: BearingBlockParams) =>
      registerEquipmentSpecs(buildBearingBlock(o, equipmentContext)),
    platform: (o: PlatformParams) => registerEquipmentSpecs(buildPlatform(o, equipmentContext)),
    ladder: (o: LadderParams) => registerEquipmentSpecs(buildLadder(o, equipmentContext)),
    handrail: (o: HandrailParams) => registerEquipmentSpecs(buildHandrail(o, equipmentContext)),
    inspectionDoor: (o: InspectionDoorParams) =>
      registerEquipmentSpecs(buildInspectionDoor(o, equipmentContext)),
    nameplate: (o: NameplateParams) => registerEquipmentSpecs(buildNameplate(o, equipmentContext)),
    sheetCover: (o: SheetCoverParams) =>
      registerEquipmentSpecs(buildSheetCover(o, equipmentContext)),
    flangePort: (o: FlangePortParams) =>
      registerEquipmentSpecs(buildFlangePort(o, equipmentContext)),
    pipeRun: (o: PipeRunParams) => registerEquipmentSpecs(buildPipeRun(o)),
    controlCabinet: (o: ControlCabinetParams) =>
      registerEquipmentSpecs(buildControlCabinet(o, equipmentContext)),
    skidBase: (o: SkidBaseParams) => registerEquipmentSpecs(buildSkidBase(o)),
    pumpCasing: (o: PumpCasingParams) =>
      registerEquipmentSpecs(buildPumpCasing(o, equipmentContext)),
    verticalVessel: (o: VerticalVesselParams) => registerEquipmentSpecs(buildVerticalVessel(o)),
    dustCollector: (o: DustCollectorParams) => registerEquipmentSpecs(buildDustCollector(o)),
    heatExchanger: (o: HeatExchangerParams) => registerEquipmentSpecs(buildHeatExchanger(o)),
    agitatorTank: (o: AgitatorTankParams) => registerEquipmentSpecs(buildAgitatorTank(o)),
    centrifugalFan: (o: CentrifugalFanParams) => registerEquipmentSpecs(buildCentrifugalFan(o)),
    blowerPackage: (o: BlowerPackageParams) => registerEquipmentSpecs(buildBlowerPackage(o)),

    hinge: (o: {
      part: string
      anchor: string
      axis: Vec3
      pivot: Vec3
      restAngle: number
      limits?: [number, number]
    }) => {
      const c: HingeBuilder = {
        kind: 'hinge',
        partId: o.part,
        anchorPartId: o.anchor,
        axisLocal: o.axis,
        pivotLocal: o.pivot,
        restAngle: o.restAngle,
        ...(o.limits !== undefined ? { limits: o.limits } : {}),
      }
      acc.constraints.push(c)
      return c
    },

    grid: (o: {
      partIds: string[]
      rows: number
      columns: number
      layers?: number
      spacing: Vec3
      origin: Vec3
    }) => {
      const c: GridBuilder = {
        kind: 'grid',
        partIds: o.partIds,
        rows: o.rows,
        columns: o.columns,
        ...(o.layers !== undefined ? { layers: o.layers } : {}),
        spacing: o.spacing,
        origin: o.origin,
      }
      acc.constraints.push(c)
      return c
    },

    connect: (
      id: string,
      o: { from: string; to: string; medium: string; kind?: string; waypoints?: Vec3[] },
    ) => {
      const c: ConnectionBuilder = {
        id,
        fromPort: o.from,
        toPort: o.to,
        medium: o.medium,
        ...(o.kind !== undefined ? { kind: o.kind } : {}),
        ...(o.waypoints !== undefined ? { waypoints: o.waypoints } : {}),
      }
      acc.connections.push(c)
      return c
    },

    math: buildMathNamespace(),

    params: (decls: Record<string, unknown>) => decls,

    apiVersion: DSL_API_VERSION,
  }
}

function buildMathNamespace() {
  return {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sqrt: Math.sqrt,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    min: Math.min,
    max: Math.max,
    hypot: Math.hypot,
    pow: Math.pow,
    clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
    lerp: (a: number, b: number, t: number) => a + (b - a) * t,
    PI: Math.PI,
    TAU: Math.PI * 2,
    HALF_PI: Math.PI / 2,
    DEG_TO_RAD: Math.PI / 180,
    RAD_TO_DEG: 180 / Math.PI,
  }
}
