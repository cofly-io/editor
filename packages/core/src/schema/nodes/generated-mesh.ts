import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { MaterialSchema } from '../material'

/**
 * Generated geometry nodes (Generator DSL plan, stage 5).
 *
 * Two node types work together:
 * - `generated-assembly` — the root. Carries generator provenance (which
 *   DSL source / params produced this), the IR hash for staleness
 *   checks, and the user override layer that survives re-generation.
 * - `generated-mesh` — one IR part. A child of a generated-assembly
 *   node; addressable by its stable IR partId.
 *
 * MVP keeps geometry as a primitive recipe (kind = 'primitive-recipe'),
 * so the existing primitive renderer can display these nodes without a
 * mesh blob store.
 */

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])
const QuatSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

// ---------------------------------------------------------------------------
// Override layer (mirror of packages/editor generated-assembly-diff types,
// declared as zod so they persist through scene save/load)
// ---------------------------------------------------------------------------

const PartOverrideSchema = z.object({
  partId: z.string(),
  transform: z
    .object({
      position: Vec3Schema.optional(),
      rotation: QuatSchema.optional(),
      scale: Vec3Schema.optional(),
    })
    .optional(),
  material: z
    .object({
      preset: z.string().optional(),
      color: Vec3Schema.optional(),
      roughness: z.number().optional(),
      metalness: z.number().optional(),
      opacity: z.number().optional(),
    })
    .optional(),
  visibility: z.boolean().optional(),
  note: z.string().optional(),
})

const OverrideOrphanSchema = z.object({
  partId: z.string(),
  override: PartOverrideSchema,
  detectedAt: z.string(),
  reason: z.literal('part_removed'),
})

const GeneratedPortSchema = z.object({
  id: z.string(),
  partId: z.string(),
  medium: z.string(),
  side: z.enum(['left', 'right', 'front', 'back', 'top', 'bottom']),
  height: z.number(),
  offset: z.number().optional(),
  direction: Vec3Schema.optional(),
  nominalDiameter: z.number().optional(),
  role: z.string().optional(),
})

const GeneratedConnectionSchema = z.object({
  id: z.string(),
  fromPort: z.string(),
  toPort: z.string(),
  medium: z.string(),
  kind: z.string().optional(),
  waypoints: z.array(Vec3Schema).optional(),
})

// ---------------------------------------------------------------------------
// generated-assembly (root)
// ---------------------------------------------------------------------------

export const GeneratedAssemblyNode = BaseNode.extend({
  id: objectId('generated-assembly'),
  type: nodeType('generated-assembly'),
  position: Vec3Schema.default([0, 0, 0]),
  rotation: z.preprocess(
    (val) => (typeof val === 'number' ? [0, val, 0] : val),
    Vec3Schema.default([0, 0, 0]),
  ),
  generator: z.object({
    /** Hash of the DSL source text that produced this assembly. */
    sourceHash: z.string(),
    /** DSL API version the source was compiled against. */
    apiVersion: z.string(),
    /** Hash of the params block. */
    paramsHash: z.string(),
    /** Hash of the canonical IR (staleness check on load). */
    irHash: z.string(),
    /** The DSL source, kept as the author truth for re-runs. */
    source: z.string(),
    /** Resolved params used for the last successful run. */
    params: z.record(z.string(), z.unknown()).default({}),
  }),
  /** Child generated-mesh node ids; maintained by the scene store. */
  children: z.array(z.string()).default([]),
  /** Monotonic revision used to compare-and-swap asynchronous generator reruns. */
  revision: z.number().int().nonnegative().default(0),
  /**
   * User edits layered on top of generated parts. Auto-reapplied after
   * re-runs when the partId still exists; otherwise moved to orphans.
   */
  overrides: z.array(PartOverrideSchema).default([]),
  /** Overrides whose partId vanished from the latest IR. Never dropped. */
  overrideOrphans: z.array(OverrideOrphanSchema).default([]),
  /** Industrial interface data retained for routing and reuse after scene reload. */
  ports: z.array(GeneratedPortSchema).default([]),
  connections: z.array(GeneratedConnectionSchema).default([]),
}).describe(
  'Root node of a DSL-generated assembly. Children are generated-mesh nodes, one per IR part. Carries generator provenance and the override layer.',
)

export type GeneratedAssemblyNode = z.infer<typeof GeneratedAssemblyNode>

// ---------------------------------------------------------------------------
// generated-mesh (one IR part)
// ---------------------------------------------------------------------------

const GeneratedGeometryRecipeSchema = z.object({
  kind: z.literal('primitive-recipe'),
  recipeId: z.string(),
  params: z.record(z.string(), z.unknown()),
})

const GeneratedMeshBlobSchema = z.object({
  kind: z.literal('mesh-blob'),
  blobId: z.string(),
  format: z.literal('pascal-mesh-v1'),
  vertexCount: z.number().int().nonnegative(),
  indexCount: z.number().int().nonnegative(),
  bounds: z.object({ min: Vec3Schema, max: Vec3Schema }),
  hasNormals: z.boolean(),
  hasUVs: z.boolean(),
})

export const GeneratedMeshNode = BaseNode.extend({
  id: objectId('generated-mesh'),
  type: nodeType('generated-mesh'),
  /** Stable IR part id, e.g. 'keyboard.key.r3.c7'. Identity across re-runs. */
  partId: z.string(),
  /** Free-form semantic role copied from the IR part. */
  semanticRole: z.string().optional(),
  position: Vec3Schema.default([0, 0, 0]),
  rotation: z.preprocess(
    (val) => (typeof val === 'number' ? [0, val, 0] : val),
    Vec3Schema.default([0, 0, 0]),
  ),
  scale: Vec3Schema.default([1, 1, 1]),
  geometry: z.union([GeneratedGeometryRecipeSchema, GeneratedMeshBlobSchema]),
  material: MaterialSchema.optional(),
  materialPreset: z.string().optional(),
  /** Deterministic fingerprint from the compiler; used for change detection. */
  fingerprint: z.string(),
}).describe(
  'One part of a generated assembly. Geometry is a primitive recipe in the MVP; the parent generated-assembly node owns provenance and overrides.',
)

export type GeneratedMeshNode = z.infer<typeof GeneratedMeshNode>
