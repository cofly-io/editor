/**
 * Generated geometry placement — AssemblyIR → scene nodes.
 *
 * Stage 5 of the Generator DSL plan, work item 2:
 *   Convert a validated AssemblyIR into a GeneratedAssemblyNode root plus
 *   one GeneratedMeshNode per IR part, layering user overrides on top.
 *
 * Follows the established three-step pattern from
 * ai-generated-geometry-nodes.ts:
 *   buildGeneratedAssemblyNodes(ir, options)      → nodes + partId mapping
 *   buildGeneratedAssemblyCreatePatches(...)      → ordered create patches
 *   (insertion stays with the caller via useScene.createNodes)
 *
 * Transform notes:
 * - The node layer stores rotations as XYZ euler Vec3; the IR stores
 *   quaternions [x,y,z,w]. Conversion uses R = Rx·Ry·Rz, the same
 *   convention as primitive-compose's eulerToMatrix/matrixToEuler.
 * - Parts with transform.space = 'world' become direct children of the
 *   root with position relative to the root origin (root rotation is
 *   assumed identity, matching the legacy path).
 * - Parts with transform.space = 'local' become children of their
 *   parent part's node, keeping their local transform.
 */

import type {
  AssemblyIR,
  AssemblyPart,
  Quat,
  Vec3,
} from '@pascal-app/core/lib/generated-assembly-ir'
import {
  type AnyNode,
  type AnyNodeId,
  DEFAULT_MATERIALS,
  GeneratedAssemblyNode,
  GeneratedMeshNode,
  type MaterialPreset,
} from '@pascal-app/core/schema'
import type { PartOverride } from './generated-assembly-diff'

// ---------------------------------------------------------------------------
// Quaternion → euler (XYZ order, R = Rx·Ry·Rz — same as primitive-compose)
// ---------------------------------------------------------------------------

export function quatToEuler(q: Quat): Vec3 {
  const [x, y, z, w] = q
  // Rotation matrix elements (row-major), unit quaternion assumed.
  const m00 = 1 - 2 * (y * y + z * z)
  const m02 = 2 * (x * z + w * y)
  const m12 = 2 * (y * z - w * x)
  const m22 = 1 - 2 * (x * x + y * y)
  const m01 = 2 * (x * y - w * z)
  // Inverse of R = Rx·Ry·Rz: y = asin(m02), x = atan2(-m12, m22), z = atan2(-m01, m00)
  const clamped = Math.max(-1, Math.min(1, m02))
  const ey = Math.asin(clamped)
  const gimbalLocked = Math.abs(clamped) >= 0.9999999
  const ex = gimbalLocked ? 0 : Math.atan2(-m12, m22)
  const ez = gimbalLocked ? 0 : Math.atan2(-m01, m00)
  const zero = (value: number) => (Object.is(value, -0) ? 0 : value)
  return [zero(ex), zero(ey), zero(ez)]
}

/**
 * Convert an IR linear-space RGB Vec3 (0..1) to a CSS hex color string
 * ('#rrggbb') for MaterialSchema.properties.color. Channels are clamped
 * and rounded so out-of-gamut input never produces an invalid string.
 */
export function vec3ToHex(rgb: Vec3 | undefined): string | undefined {
  if (!rgb) return undefined
  const to255 = (c: number) => {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(c) ? c : 0))
    return Math.round(clamped * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${to255(rgb[0])}${to255(rgb[1])}${to255(rgb[2])}`
}

// ---------------------------------------------------------------------------
// Placement options / result
// ---------------------------------------------------------------------------

export type GeneratedAssemblyPlacementOptions = {
  /** World position of the assembly root. */
  origin?: Vec3
  /** Display name for the root node. */
  name?: string
  /** Generator provenance; defaults to the IR's own hashes. */
  generator?: {
    sourceHash: string
    apiVersion: string
    paramsHash: string
    irHash: string
    source: string
    params: Record<string, unknown>
  }
  /** User overrides to layer on top of the generated parts. */
  overrides?: readonly PartOverride[]
}

export type GeneratedAssemblyNodesResult = {
  rootNode: GeneratedAssemblyNode
  childNodes: GeneratedMeshNode[]
  /** IR partId → scene node id, for override wiring and selection. */
  nodeIdByPartId: Map<string, string>
  /** Overrides whose partId matched a part in this IR. */
  reappliedOverrides: PartOverride[]
}

function applyOverride(
  part: AssemblyPart,
  override: PartOverride | undefined,
): { position: Vec3; rotation: Vec3; scale: Vec3; visible: boolean } {
  const basePosition = part.transform.position
  const baseRotation = quatToEuler(part.transform.rotation)
  const baseScale = part.transform.scale
  if (!override) {
    return {
      position: basePosition,
      rotation: baseRotation,
      scale: baseScale,
      visible: true,
    }
  }
  return {
    position: override.transform?.position ?? basePosition,
    rotation: override.transform?.rotation
      ? quatToEuler(override.transform.rotation)
      : baseRotation,
    scale: override.transform?.scale ?? baseScale,
    visible: override.visibility ?? true,
  }
}

/**
 * Build the scene nodes for an AssemblyIR. Pure — does not touch stores.
 */
export function buildGeneratedAssemblyNodes(
  ir: AssemblyIR,
  options: GeneratedAssemblyPlacementOptions = {},
): GeneratedAssemblyNodesResult {
  const origin = options.origin ?? [0, 0, 0]
  const overridesByPartId = new Map((options.overrides ?? []).map((o) => [o.partId, o]))

  const rootNode = GeneratedAssemblyNode.parse({
    name: options.name ?? 'generated-assembly',
    position: origin,
    generator: options.generator ?? {
      sourceHash: ir.generator.sourceHash,
      apiVersion: ir.generator.apiVersion,
      paramsHash: ir.generator.paramsHash,
      irHash: '',
      source: '',
      params: {},
    },
    overrides: [...(options.overrides ?? [])],
    ports: ir.ports ?? [],
    connections: ir.connections ?? [],
    metadata: {
      generatedBy: 'generator-dsl',
      schemaVersion: ir.schemaVersion,
    },
  })

  const nodeIdByPartId = new Map<string, string>()
  const partById = new Map(ir.parts.map((p) => [p.id, p]))
  const childNodes: GeneratedMeshNode[] = []
  const reappliedOverrides: PartOverride[] = []

  for (const part of ir.parts) {
    const override = overridesByPartId.get(part.id)
    if (override) reappliedOverrides.push(override)

    const { position, rotation, scale, visible } = applyOverride(part, override)

    // Parent resolution: 'local' parts hang under their IR parent part's
    // node; 'world' parts hang directly under the assembly root.
    let parentNodeId: string = rootNode.id
    let nodePosition = position
    if (part.transform.space === 'local' && part.parentId) {
      const parentPart = partById.get(part.parentId)
      const parentSceneId = parentPart ? nodeIdByPartId.get(parentPart.id) : undefined
      if (parentSceneId) {
        parentNodeId = parentSceneId
      }
      // If the parent hasn't been emitted yet (IR not topologically
      // ordered), fall through and fix up in a second pass below.
    } else {
      // World-space part: store position relative to the root origin.
      nodePosition = [position[0] - origin[0], position[1] - origin[1], position[2] - origin[2]]
    }

    const geometry = part.geometry
    const colorHex = vec3ToHex(part.material.color)
    const hasInlineProps =
      colorHex !== undefined ||
      part.material.roughness !== undefined ||
      part.material.metalness !== undefined
    // Renderer precedence is node.material FIRST, then node.materialPreset.
    // So when the DSL supplies a tint (or PBR scalars) we must put the full
    // resolved appearance on node.material — a bare materialPreset would be
    // ignored. To keep a 'metal' + '#cc0000' part looking like red metal
    // (not red plastic), seed the inline properties from the named preset's
    // DEFAULT_MATERIALS base when the preset is one of the known enum names
    // ('plastic' etc. are DSL-only names with no table entry → skipped).
    const presetName = part.material.preset
    const presetBase =
      hasInlineProps && presetName !== undefined && presetName in DEFAULT_MATERIALS
        ? DEFAULT_MATERIALS[presetName as MaterialPreset]
        : undefined
    const node = GeneratedMeshNode.parse({
      partId: part.id,
      ...(part.semanticRole !== undefined ? { semanticRole: part.semanticRole } : {}),
      parentId: parentNodeId,
      position: nodePosition,
      rotation,
      scale,
      visible,
      geometry,
      ...(presetName !== undefined ? { materialPreset: presetName } : {}),
      ...(hasInlineProps
        ? {
            material: {
              properties: {
                // Seed from the preset base (color/roughness/metalness), then
                // let explicit DSL values override per-field.
                ...(presetBase
                  ? {
                      color: presetBase.color,
                      roughness: presetBase.roughness,
                      metalness: presetBase.metalness,
                    }
                  : {}),
                ...(colorHex !== undefined ? { color: colorHex } : {}),
                ...(part.material.roughness !== undefined
                  ? { roughness: part.material.roughness }
                  : {}),
                ...(part.material.metalness !== undefined
                  ? { metalness: part.material.metalness }
                  : {}),
              },
            },
          }
        : {}),
      fingerprint: part.fingerprint,
      metadata: {
        transformSpace: part.transform.space,
      },
    })
    nodeIdByPartId.set(part.id, node.id)
    childNodes.push(node)
  }

  // Second pass: fix up local-space parts whose IR parent appears later
  // in the parts array (validation guarantees acyclicity, not ordering).
  for (const node of childNodes) {
    const part = partById.get(node.partId)
    if (!part || part.transform.space !== 'local' || !part.parentId) continue
    const parentSceneId = nodeIdByPartId.get(part.parentId)
    if (parentSceneId && node.parentId !== parentSceneId) {
      node.parentId = parentSceneId
    }
  }

  return { rootNode, childNodes, nodeIdByPartId, reappliedOverrides }
}

// ---------------------------------------------------------------------------
// Create patches (ordered: root first, then parts)
// ---------------------------------------------------------------------------

export type GeneratedAssemblyPatchPlan = {
  patches: Array<{ op: 'create'; node: AnyNode; parentId?: AnyNodeId }>
  rootNode: GeneratedAssemblyNode
  nodeIdByPartId: Map<string, string>
}

export function buildGeneratedAssemblyCreatePatches(
  ir: AssemblyIR,
  options: GeneratedAssemblyPlacementOptions & { parentId?: string | null } = {},
): GeneratedAssemblyPatchPlan {
  const { rootNode, childNodes, nodeIdByPartId } = buildGeneratedAssemblyNodes(ir, options)
  const patches: GeneratedAssemblyPatchPlan['patches'] = [
    {
      op: 'create',
      node: rootNode as AnyNode,
      ...(options.parentId !== undefined && options.parentId !== null
        ? { parentId: options.parentId as AnyNodeId }
        : {}),
    },
  ]
  // Emit parts in an order where parents precede children so the scene
  // store's children-array sync sees the parent already present.
  const byId = new Map(childNodes.map((n) => [n.partId, n]))
  const partIdByNodeId = new Map<string, string>(childNodes.map((n) => [n.id, n.partId]))
  const emitted = new Set<string>()
  const emit = (node: GeneratedMeshNode) => {
    if (emitted.has(node.partId)) return
    const parentPartId =
      node.parentId && node.parentId !== rootNode.id ? partIdByNodeId.get(node.parentId) : undefined
    if (parentPartId) {
      const parent = byId.get(parentPartId)
      if (parent) emit(parent)
    }
    emitted.add(node.partId)
    patches.push({
      op: 'create',
      node: node as AnyNode,
      parentId: (node.parentId ?? rootNode.id) as AnyNodeId,
    })
  }
  for (const node of childNodes) emit(node)

  return { patches, rootNode, nodeIdByPartId }
}
