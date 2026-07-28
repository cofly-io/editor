/**
 * Generated Assembly IR — Typed Assembly Intermediate Representation.
 *
 * Stage 2 of the Generator DSL plan: pin down the data boundary between
 * DSL compilers, sandbox runners, scene persistence, and the viewer.
 *
 * Design rules:
 * - Pure data, zero dependencies. This file MUST NOT import Three.js,
 *   the viewer, the editor, or any app-layer process/industrial types.
 * - JSON-serializable round-trip. An AssemblyIR value must survive
 *   `JSON.parse(JSON.stringify(ir))` without losing meaning or changing
 *   its deterministic hash.
 * - Hash stability. Given the same `generator.sourceHash` and
 *   `generator.paramsHash`, two runs must produce the same partId set
 *   and the same per-part fingerprint. To make this true, all
 *   collection-typed fields that semantically behave as sets (parts,
 *   ports, connections) are canonically ordered by `id` before hashing.
 */

import type { Vec3 } from './primitive-compose'

export type { Vec3 } from './primitive-compose'

/**
 * Quaternion in `[x, y, z, w]` order, right-handed, unit length.
 * Introduced here instead of importing from a rendering library so the
 * IR stays render-agnostic.
 */
export type Quat = [number, number, number, number]

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * Reference to a primitive recipe understood by the existing
 * primitive-compose pipeline. Stage 2 keeps the legacy primitive path
 * usable through this recipe variant while the DSL emits MeshBlobRef for
 * parts the recipe vocabulary cannot express.
 */
export type GeometryRecipe = {
  kind: 'primitive-recipe'
  /** Stable identifier of the recipe (e.g. 'primitive.box', 'primitive.lathe'). */
  recipeId: string
  /** Recipe-specific parameters. JSON-serializable. */
  params: Record<string, unknown>
}

/**
 * Reference to a serialized mesh payload produced by the DSL sandbox.
 * The actual bytes live outside the IR (scene blob store); the IR keeps
 * only addressing + verification metadata so it stays small and diffable.
 */
export type MeshBlobRef = {
  kind: 'mesh-blob'
  /** Content-addressed blob id, e.g. a SHA-256 of the mesh payload. */
  blobId: string
  format: 'pascal-mesh-v1'
  vertexCount: number
  indexCount: number
  /** Bounding box in the mesh's local space, [min, max]. */
  bounds: { min: Vec3; max: Vec3 }
  hasNormals: boolean
  hasUVs: boolean
}

export type AssemblyGeometry = GeometryRecipe | MeshBlobRef

// ---------------------------------------------------------------------------
// Material
// ---------------------------------------------------------------------------

/**
 * Serializable material description. Intentionally a small closed shape
 * so IR hashing is stable and downstream renderers can map onto their
 * own material system.
 */
export type SerializableMaterial = {
  /** Preset id understood by the material registry, e.g. 'metal', 'plastic'. */
  preset?: string
  /** RGB in linear 0..1. */
  color?: Vec3
  roughness?: number
  metalness?: number
  opacity?: number
  emissive?: Vec3
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

export type AssemblyTransform = {
  /**
   * 'world' — position/rotation/scale are world-space.
   * 'local' — they are relative to the parent part (requires parentId).
   */
  space: 'world' | 'local'
  position: Vec3
  rotation: Quat
  scale: Vec3
}

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

export type HingeConstraint = {
  kind: 'hinge'
  /** Part that rotates around the hinge. */
  partId: string
  /** Part that the hinge is attached to (the "frame"). */
  anchorPartId: string
  /** Hinge axis in the anchor part's local space. */
  axisLocal: Vec3
  /** Hinge pivot point in the anchor part's local space. */
  pivotLocal: Vec3
  /** Rest angle in radians. */
  restAngle: number
  /** Optional [min, max] angle clamp in radians. */
  limits?: [number, number]
}

export type GridConstraint = {
  kind: 'grid'
  /** Parts laid out by this grid. */
  partIds: string[]
  rows: number
  columns: number
  layers?: number
  /** Spacing between adjacent cell centers along each axis. */
  spacing: Vec3
  /** World-space origin of cell (0,0,0). */
  origin: Vec3
}

export type AttachmentConstraint = {
  kind: 'attachment'
  partId: string
  anchorPartId: string
  /** Face on the anchor part. */
  anchorFace: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'
  /** Face on the child part that touches the anchor face. */
  childFace: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'center'
  /** Additional offset in the anchor face's tangent plane. */
  offset?: Vec3
}

export type AssemblyConstraint = HingeConstraint | GridConstraint | AttachmentConstraint

// ---------------------------------------------------------------------------
// Industrial semantics (Appendix B)
// ---------------------------------------------------------------------------

/** Faces of a part's bounding envelope. */
export type IRPortSide = 'left' | 'right' | 'front' | 'back' | 'top' | 'bottom'

/**
 * Industrial port (pipe nozzle / cable gland / conveyor interface).
 * Attached to a part; describes which face, at what height, carrying
 * what medium, in what direction.
 */
export type IRPort = {
  /** Stable identity, unique within the assembly. Convention: `${partId}.${name}`. */
  id: string
  /** Owning part. Must reference an existing part id. */
  partId: string
  /** Medium. Open string; soft-validated against KNOWN_MEDIA. */
  medium: string
  /** Face of the owning part's envelope the port sits on. */
  side: IRPortSide
  /** Port center height above the assembly's ground plane (y=0), meters. */
  height: number
  /** Lateral offset along the face (meters), defaults to 0 = face center. */
  offset?: number
  /** Outward direction (unit vector, world space). Defaults to the face normal. */
  direction?: Vec3
  /** Nominal bore diameter (meters). Used for pipe diameter matching. */
  nominalDiameter?: number
  /** Semantic role: 'inlet' | 'outlet' | 'vent' | 'drain' | 'signal_power' | ... */
  role?: string
}

/** A single pipe/cable/conveyor connection between two ports. */
export type IRConnection = {
  /** Stable identity, unique within the assembly. */
  id: string
  fromPort: string
  toPort: string
  /** Medium. Should match both endpoint port media (mismatch → warning). */
  medium: string
  /** Physical form: 'pipe' | 'cable_tray' | 'conveyor' | ... open string. */
  kind?: string
  /** World-space waypoints, optional. Router fills in if absent. */
  waypoints?: Vec3[]
}

/**
 * Known media (soft validation only, NOT exhaustive). Industries may
 * extend with new medium strings; warnings only fire when the string is
 * within edit-distance 1 of a known medium (typo hint).
 */
export const KNOWN_MEDIA: ReadonlySet<string> = new Set([
  'water',
  'hydrogen',
  'oxygen',
  'power',
  'cooling',
  'material',
  'gas',
  'molten_metal',
  'steam',
  'oil',
  'air',
  'signal',
  'chemical',
  'refrigerant',
])

// ---------------------------------------------------------------------------
// Part
// ---------------------------------------------------------------------------

export type AssemblyPart = {
  /**
   * Stable identity, deterministic per (sourceHash, paramsHash).
   * Convention: dotted path with explicit loop indices, e.g.
   * `keyboard.key.r3.c7`. NEVER an array index, NEVER a random id.
   */
  id: string
  /** Free-form semantic role, e.g. 'laptop_lid', 'column_shell'. */
  semanticRole?: string
  /** Parent part id. Must reference an existing part; cycles are rejected. */
  parentId?: string
  transform: AssemblyTransform
  geometry: AssemblyGeometry
  material: SerializableMaterial
  /**
   * Deterministic fingerprint of this part's geometry + material +
   * transform, computed by the compiler. Two runs of the same source
   * and params must yield identical fingerprints.
   */
  fingerprint: string
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export type AssemblyIR = {
  schemaVersion: 1
  generator: {
    /** SHA-256 (or equivalent) of the DSL source text. */
    sourceHash: string
    /** Version of the DSL API the source was compiled against. */
    apiVersion: string
    /** Hash of the params block. */
    paramsHash: string
  }
  parts: AssemblyPart[]
  constraints: AssemblyConstraint[]

  // Appendix B — industrial semantics. Optional; non-industrial objects
  // (laptops, furniture) simply omit these fields.

  /** Port table. Omit when the object has no industrial interfaces. */
  ports?: IRPort[]
  /** Connection table. Only meaningful when `ports` is present. */
  connections?: IRConnection[]
  /** Process metadata tying this assembly back to a process contract. */
  process?: {
    profileId?: string
    equipmentFamily?: string
    primarySemanticRole?: string
  }
}

// ---------------------------------------------------------------------------
// Canonical ordering (for hashing & comparison)
// ---------------------------------------------------------------------------

/**
 * Return a copy of the IR with parts / ports / connections / constraints
 * sorted by stable keys so semantically equivalent IRs always hash to
 * the same value. Does NOT mutate the input.
 */
export function canonicalizeAssemblyIR(ir: AssemblyIR): AssemblyIR {
  const sortedParts = [...ir.parts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const sortedPorts = ir.ports
    ? [...ir.ports].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    : undefined
  const sortedConnections = ir.connections
    ? [...ir.connections].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    : undefined
  const sortedConstraints = [...ir.constraints].sort((a, b) => {
    const ka = constraintSortKey(a)
    const kb = constraintSortKey(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
  return {
    ...ir,
    parts: sortedParts,
    constraints: sortedConstraints,
    ...(sortedPorts !== undefined ? { ports: sortedPorts } : {}),
    ...(sortedConnections !== undefined ? { connections: sortedConnections } : {}),
  }
}

function constraintSortKey(c: AssemblyConstraint): string {
  switch (c.kind) {
    case 'hinge':
      return `hinge:${c.partId}:${c.anchorPartId}`
    case 'grid':
      return `grid:${c.partIds.join(',')}`
    case 'attachment':
      return `attachment:${c.partId}:${c.anchorPartId}`
  }
}
