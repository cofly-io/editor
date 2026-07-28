/**
 * Validation for AssemblyIR.
 *
 * Pure-data checks, no Three.js, no rendering, no scene access.
 * See GENERATED_GEOMETRY_DSL_DEVELOPMENT_PLAN0722.md §阶段 2 工作项 2 and
 * 附录 B.3 for the rule table.
 *
 * Levels:
 * - 'error'   — IR is rejected; nothing is committed to the scene.
 * - 'warning' — IR is accepted but flagged in diagnostics.
 * - 'info'    — purely informational; does not affect acceptance.
 */

import type {
  AssemblyConstraint,
  AssemblyIR,
  AssemblyPart,
  IRConnection,
  IRPort,
  Quat,
  Vec3,
} from './generated-assembly-ir'
import { KNOWN_MEDIA } from './generated-assembly-ir'

export type AssemblyDiagnosticSeverity = 'error' | 'warning' | 'info'

export type AssemblyDiagnostic = {
  /** Stable machine-readable code, e.g. 'ir_part_id_duplicate'. */
  code: string
  severity: AssemblyDiagnosticSeverity
  message: string
  /** Optional path (e.g. 'parts[3]', 'ports[feed_in]') for localization. */
  path?: string
}

// ---------------------------------------------------------------------------
// Resource budgets (phase 1 defaults; tunable per workspace later)
// ---------------------------------------------------------------------------

export const ASSEMBLY_BUDGET = {
  maxParts: 256,
  maxVerticesPerAssembly: 500_000,
  maxIndicesPerAssembly: 1_500_000,
  maxSerializedMeshBytes: 64 * 1024 * 1024,
  maxHierarchyDepth: 32,
} as const

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export function validateAssemblyIR(ir: AssemblyIR): AssemblyDiagnostic[] {
  const diagnostics: AssemblyDiagnostic[] = []
  const push = (
    severity: AssemblyDiagnosticSeverity,
    code: string,
    message: string,
    path?: string,
  ) => {
    diagnostics.push(path ? { code, severity, message, path } : { code, severity, message })
  }

  if (ir.schemaVersion !== 1) {
    push(
      'error',
      'ir_schema_version_unsupported',
      `schemaVersion must be 1; got ${String(ir.schemaVersion)}.`,
      'schemaVersion',
    )
  }

  validateParts(ir, push)
  validateConstraints(ir, push)
  validatePorts(ir, push)
  validateConnections(ir, push)
  validateProcess(ir, push)
  validateBudgets(ir, push)

  return diagnostics
}

export function hasAssemblyErrors(diagnostics: readonly AssemblyDiagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error')
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

type Push = (
  severity: AssemblyDiagnosticSeverity,
  code: string,
  message: string,
  path?: string,
) => void

function validateParts(ir: AssemblyIR, push: Push): void {
  const seen = new Map<string, number>()
  ir.parts.forEach((part, index) => {
    const path = `parts[${JSON.stringify(part.id)}]`
    if (typeof part.id !== 'string' || part.id.length === 0) {
      push('error', 'ir_part_id_empty', `part at index ${index} has empty or non-string id.`, path)
      return
    }
    const existing = seen.get(part.id)
    if (existing !== undefined) {
      push(
        'error',
        'ir_part_id_duplicate',
        `part id "${part.id}" is used at both index ${existing} and ${index}.`,
        path,
      )
    } else {
      seen.set(part.id, index)
    }
  })

  const byId = new Map(ir.parts.map((p) => [p.id, p]))
  for (const part of ir.parts) {
    const path = `parts[${JSON.stringify(part.id)}]`
    if (part.parentId !== undefined) {
      if (!byId.has(part.parentId)) {
        push(
          'error',
          'ir_part_parent_missing',
          `part "${part.id}" references missing parent "${part.parentId}".`,
          path,
        )
      } else if (part.parentId === part.id) {
        push('error', 'ir_part_parent_self', `part "${part.id}" cannot be its own parent.`, path)
      }
    }
    validateTransform(part, push, path)
    validateGeometry(part, push, path)
    validateMaterial(part, push, path)
    if (typeof part.fingerprint !== 'string' || part.fingerprint.length === 0) {
      push(
        'error',
        'ir_part_fingerprint_missing',
        `part "${part.id}" has no fingerprint.`,
        path,
      )
    }
  }

  // Cycle detection (DFS over parentId).
  for (const part of ir.parts) {
    const visited = new Set<string>()
    let cursor: AssemblyPart | undefined = part
    while (cursor?.parentId !== undefined) {
      if (visited.has(cursor.id)) {
        push(
          'error',
          'ir_part_hierarchy_cycle',
          `parent chain of "${part.id}" loops back to "${cursor.id}".`,
          `parts[${JSON.stringify(part.id)}]`,
        )
        break
      }
      visited.add(cursor.id)
      cursor = byId.get(cursor.parentId)
    }
  }

  // Hierarchy depth budget. Use iterative traversal with a visiting-set so
  // cycles (already reported above) don't blow the stack.
  const depth = new Map<string, number>()
  const depthOf = (start: AssemblyPart): number => {
    const cached = depth.get(start.id)
    if (cached !== undefined) return cached
    const chain: AssemblyPart[] = []
    const visiting = new Set<string>()
    let cursor: AssemblyPart | undefined = start
    let d = 0
    while (cursor) {
      const memoized = depth.get(cursor.id)
      if (memoized !== undefined) {
        d = memoized + 1
        break
      }
      if (visiting.has(cursor.id)) {
        // Cycle — bail out; the cycle check above already reported it.
        d = 0
        break
      }
      visiting.add(cursor.id)
      chain.push(cursor)
      cursor = cursor.parentId !== undefined ? byId.get(cursor.parentId) : undefined
      if (cursor) d += 1
    }
    // Walk the chain back, assigning depths.
    for (let i = chain.length - 1; i >= 0; i--) {
      depth.set(chain[i]!.id, d)
      d += 1
    }
    return depth.get(start.id) ?? 0
  }
  for (const part of ir.parts) {
    if (depthOf(part) > ASSEMBLY_BUDGET.maxHierarchyDepth) {
      push(
        'error',
        'ir_part_hierarchy_too_deep',
        `part "${part.id}" exceeds max hierarchy depth of ${ASSEMBLY_BUDGET.maxHierarchyDepth}.`,
        `parts[${JSON.stringify(part.id)}]`,
      )
    }
  }
}

function validateTransform(part: AssemblyPart, push: Push, path: string): void {
  const t = part.transform
  if (t.space !== 'world' && t.space !== 'local') {
    push(
      'error',
      'ir_transform_space_invalid',
      `transform.space must be 'world' or 'local'; got ${String(t.space)}.`,
      path,
    )
  }
  if (t.space === 'local' && part.parentId === undefined) {
    push(
      'error',
      'ir_transform_local_without_parent',
      `part "${part.id}" uses local transform but has no parentId.`,
      path,
    )
  }
  if (!isFiniteVec3(t.position)) {
    push('error', 'ir_transform_position_invalid', `position must be a finite Vec3.`, path)
  }
  if (!isFiniteVec3(t.scale)) {
    push('error', 'ir_transform_scale_invalid', `scale must be a finite Vec3.`, path)
  }
  if (!isFiniteQuat(t.rotation)) {
    push('error', 'ir_transform_rotation_invalid', `rotation must be a finite Quat.`, path)
  } else if (!isUnitQuat(t.rotation)) {
    push(
      'error',
      'ir_transform_rotation_not_unit',
      `rotation must be a unit quaternion (|q|≈1).`,
      path,
    )
  }
}

function validateGeometry(part: AssemblyPart, push: Push, path: string): void {
  const g = part.geometry
  if (g.kind === 'primitive-recipe') {
    if (typeof g.recipeId !== 'string' || g.recipeId.length === 0) {
      push('error', 'ir_geometry_recipe_id_empty', `recipeId must be a non-empty string.`, path)
    }
    return
  }
  if (g.kind === 'mesh-blob') {
    if (typeof g.blobId !== 'string' || g.blobId.length === 0) {
      push('error', 'ir_geometry_blob_id_empty', `blobId must be a non-empty string.`, path)
    }
    if (!Number.isInteger(g.vertexCount) || g.vertexCount < 0) {
      push('error', 'ir_geometry_vertex_count_invalid', `vertexCount must be ≥ 0 integer.`, path)
    }
    if (!Number.isInteger(g.indexCount) || g.indexCount < 0) {
      push('error', 'ir_geometry_index_count_invalid', `indexCount must be ≥ 0 integer.`, path)
    }
    if (!isFiniteVec3(g.bounds.min) || !isFiniteVec3(g.bounds.max)) {
      push('error', 'ir_geometry_bounds_invalid', `bounds must be finite Vec3 min/max.`, path)
    }
    return
  }
  push(
    'error',
    'ir_geometry_kind_unknown',
    `geometry.kind must be 'primitive-recipe' or 'mesh-blob'; got ${String((g as { kind?: unknown }).kind)}.`,
    path,
  )
}

function validateMaterial(part: AssemblyPart, push: Push, path: string): void {
  const m = part.material
  if (m.color !== undefined && !isFiniteVec3(m.color)) {
    push('error', 'ir_material_color_invalid', `material.color must be a finite Vec3.`, path)
  }
  if (m.emissive !== undefined && !isFiniteVec3(m.emissive)) {
    push('error', 'ir_material_emissive_invalid', `material.emissive must be a finite Vec3.`, path)
  }
  if (m.roughness !== undefined && !isUnitInterval(m.roughness)) {
    push('warning', 'ir_material_roughness_outside', `roughness should be in [0,1].`, path)
  }
  if (m.metalness !== undefined && !isUnitInterval(m.metalness)) {
    push('warning', 'ir_material_metalness_outside', `metalness should be in [0,1].`, path)
  }
  if (m.opacity !== undefined && !isUnitInterval(m.opacity)) {
    push('warning', 'ir_material_opacity_outside', `opacity should be in [0,1].`, path)
  }
}

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

function validateConstraints(ir: AssemblyIR, push: Push): void {
  const partIds = new Set(ir.parts.map((p) => p.id))
  ir.constraints.forEach((c, index) => {
    const path = `constraints[${index}]`
    switch (c.kind) {
      case 'hinge':
        requirePart(c.partId, partIds, push, path)
        requirePart(c.anchorPartId, partIds, push, path)
        if (!isFiniteVec3(c.axisLocal)) {
          push('error', 'ir_constraint_hinge_axis_invalid', `axisLocal must be finite Vec3.`, path)
        }
        if (!isFiniteVec3(c.pivotLocal)) {
          push(
            'error',
            'ir_constraint_hinge_pivot_invalid',
            `pivotLocal must be finite Vec3.`,
            path,
          )
        }
        if (!Number.isFinite(c.restAngle)) {
          push('error', 'ir_constraint_hinge_angle_invalid', `restAngle must be finite.`, path)
        }
        break
      case 'grid':
        for (const pid of c.partIds) requirePart(pid, partIds, push, path)
        if (c.rows < 1 || c.columns < 1 || (c.layers !== undefined && c.layers < 1)) {
          push(
            'error',
            'ir_constraint_grid_dims_invalid',
            `rows/columns/layers must all be ≥ 1.`,
            path,
          )
        }
        if (!isFiniteVec3(c.spacing) || !isFiniteVec3(c.origin)) {
          push(
            'error',
            'ir_constraint_grid_vector_invalid',
            `spacing and origin must be finite Vec3.`,
            path,
          )
        }
        break
      case 'attachment':
        requirePart(c.partId, partIds, push, path)
        requirePart(c.anchorPartId, partIds, push, path)
        if (c.offset !== undefined && !isFiniteVec3(c.offset)) {
          push(
            'error',
            'ir_constraint_attachment_offset_invalid',
            `offset must be a finite Vec3.`,
            path,
          )
        }
        break
    }
  })
}

function requirePart(id: string, valid: Set<string>, push: Push, path: string): void {
  if (!valid.has(id)) {
    push(
      'error',
      'ir_constraint_part_missing',
      `constraint references missing part "${id}".`,
      path,
    )
  }
}

// ---------------------------------------------------------------------------
// Ports (Appendix B.3)
// ---------------------------------------------------------------------------

function validatePorts(ir: AssemblyIR, push: Push): void {
  if (!ir.ports) return
  const partIds = new Set(ir.parts.map((p) => p.id))
  const partById = new Map(ir.parts.map((p) => [p.id, p]))
  const seen = new Set<string>()

  ir.ports.forEach((port, index) => {
    const path = `ports[${JSON.stringify(port.id)}]`
    if (seen.has(port.id)) {
      push('error', 'ir_port_id_unique', `port id "${port.id}" is duplicated.`, path)
    }
    seen.add(port.id)

    if (!partIds.has(port.partId)) {
      push(
        'error',
        'ir_port_part_exists',
        `port "${port.id}" references missing part "${port.partId}".`,
        path,
      )
    }

    if (!['left', 'right', 'front', 'back', 'top', 'bottom'].includes(port.side)) {
      push(
        'error',
        'ir_port_side_valid',
        `port "${port.id}".side must be one of left/right/front/back/top/bottom; got ${String(port.side)}.`,
        path,
      )
    }

    if (!Number.isFinite(port.height)) {
      push('error', 'ir_port_height_finite', `port "${port.id}".height must be finite.`, path)
    } else {
      const owner = partById.get(port.partId)
      if (owner && owner.geometry.kind === 'mesh-blob') {
        const envelopeTop = owner.geometry.bounds.max[1] + owner.transform.position[1]
        if (port.height > envelopeTop + 1e-3) {
          push(
            'warning',
            'ir_port_height_outside_part',
            `port "${port.id}".height (${port.height}) is above owning part's envelope top (${envelopeTop.toFixed(3)}).`,
            path,
          )
        }
      }
    }

    if (port.direction !== undefined) {
      if (!isFiniteVec3(port.direction)) {
        push('error', 'ir_port_direction_unit', `direction must be a finite Vec3.`, path)
      } else {
        const len = Math.hypot(port.direction[0], port.direction[1], port.direction[2])
        if (Math.abs(len - 1) > 1e-3) {
          push(
            'error',
            'ir_port_direction_unit',
            `port "${port.id}".direction must be a unit vector (|v|=${len.toFixed(4)}).`,
            path,
          )
        }
      }
    }

    if (!KNOWN_MEDIA.has(port.medium)) {
      const hint = closestKnownMedium(port.medium)
      push(
        'warning',
        'ir_port_medium_known',
        `port "${port.id}".medium "${port.medium}" is not in KNOWN_MEDIA.${hint ? ` Did you mean "${hint}"?` : ''}`,
        path,
      )
    }
    void index
  })
}

// ---------------------------------------------------------------------------
// Connections (Appendix B.3)
// ---------------------------------------------------------------------------

function validateConnections(ir: AssemblyIR, push: Push): void {
  if (!ir.connections) return
  const portById = new Map((ir.ports ?? []).map((p) => [p.id, p]))

  ir.connections.forEach((conn) => {
    const path = `connections[${JSON.stringify(conn.id)}]`

    const from = portById.get(conn.fromPort)
    const to = portById.get(conn.toPort)
    if (!from) {
      push(
        'error',
        'ir_conn_endpoints_exist',
        `connection "${conn.id}".fromPort references missing port "${conn.fromPort}".`,
        path,
      )
    }
    if (!to) {
      push(
        'error',
        'ir_conn_endpoints_exist',
        `connection "${conn.id}".toPort references missing port "${conn.toPort}".`,
        path,
      )
    }

    if (conn.fromPort === conn.toPort) {
      push(
        'error',
        'ir_conn_no_self_loop',
        `connection "${conn.id}" connects port "${conn.fromPort}" to itself.`,
        path,
      )
    }

    if (from && to) {
      if (from.medium !== conn.medium || to.medium !== conn.medium) {
        push(
          'warning',
          'ir_conn_medium_match',
          `connection "${conn.id}".medium "${conn.medium}" does not match endpoints ("${from.medium}" / "${to.medium}").`,
          path,
        )
      }
    }

    if (conn.waypoints !== undefined) {
      for (const wp of conn.waypoints) {
        if (!isFiniteVec3(wp)) {
          push(
            'error',
            'ir_conn_waypoints_finite',
            `connection "${conn.id}".waypoints must all be finite Vec3.`,
            path,
          )
          break
        }
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Process metadata (Appendix B.3)
// ---------------------------------------------------------------------------

function validateProcess(ir: AssemblyIR, push: Push): void {
  if (!ir.process) return
  if (
    ir.process.equipmentFamily !== undefined &&
    typeof ir.process.equipmentFamily === 'string' &&
    ir.process.equipmentFamily.length === 0
  ) {
    push('info', 'ir_process_family_known', `process.equipmentFamily is empty.`, 'process')
  }
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

function validateBudgets(ir: AssemblyIR, push: Push): void {
  if (ir.parts.length > ASSEMBLY_BUDGET.maxParts) {
    push(
      'error',
      'ir_budget_parts_exceeded',
      `assembly has ${ir.parts.length} parts; budget is ${ASSEMBLY_BUDGET.maxParts}.`,
    )
  }
  let totalVertices = 0
  let totalIndices = 0
  for (const part of ir.parts) {
    if (part.geometry.kind === 'mesh-blob') {
      totalVertices += part.geometry.vertexCount
      totalIndices += part.geometry.indexCount
    }
  }
  if (totalVertices > ASSEMBLY_BUDGET.maxVerticesPerAssembly) {
    push(
      'error',
      'ir_budget_vertices_exceeded',
      `assembly has ${totalVertices} vertices; budget is ${ASSEMBLY_BUDGET.maxVerticesPerAssembly}.`,
    )
  }
  if (totalIndices > ASSEMBLY_BUDGET.maxIndicesPerAssembly) {
    push(
      'error',
      'ir_budget_indices_exceeded',
      `assembly has ${totalIndices} indices; budget is ${ASSEMBLY_BUDGET.maxIndicesPerAssembly}.`,
    )
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFiniteVec3(v: Vec3): boolean {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    Number.isFinite(v[2])
  )
}

function isFiniteQuat(q: Quat): boolean {
  return (
    Array.isArray(q) &&
    q.length === 4 &&
    Number.isFinite(q[0]) &&
    Number.isFinite(q[1]) &&
    Number.isFinite(q[2]) &&
    Number.isFinite(q[3])
  )
}

function isUnitQuat(q: Quat): boolean {
  const len = Math.hypot(q[0], q[1], q[2], q[3])
  return Math.abs(len - 1) < 1e-3
}

function isUnitInterval(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 1
}

function closestKnownMedium(medium: string): string | undefined {
  let best: string | undefined
  let bestDist = Number.POSITIVE_INFINITY
  for (const known of KNOWN_MEDIA) {
    const d = damerauLevenshtein(medium.toLowerCase(), known)
    if (d < bestDist) {
      bestDist = d
      best = known
    }
  }
  // Threshold ≤ 2: covers single-char typos (d=1) and the common
  // adjacent-transposition pattern (e.g. 'hydorgen' vs 'hydrogen', d=1
  // under Damerau; plain Levenshtein would call it 2).
  return bestDist <= 2 ? best : undefined
}

/**
 * Damerau-Levenshtein distance: adjacent transposition counts as 1 edit.
 * Plain Levenshtein counts 'ab' → 'ba' as 2; for typo hinting we want 1.
 */
function damerauLevenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + cost)
      }
    }
  }
  return dp[m]![n]!
}
