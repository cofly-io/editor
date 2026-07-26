/**
 * Instance Matrix Builder
 *
 * Converts an InstanceBatch (from instancing-planner) into flat, column-major
 * 4x4 matrix arrays — exactly the layout three.js InstancedMesh expects for
 * `instanceMatrix` (16 floats per instance, column-major).
 *
 * Pure logic, no three.js: the renderer uploads the returned Float32Array
 * directly into an InstancedBufferAttribute.
 *
 * Per-instance transform composition:
 *   M = T(worldPosition) · Ry(rotationY) · AxisAlign · S(uniform scale)
 *
 * AxisAlign maps the part's local growth axis to +Y when the batch geometry
 * is authored Y-up (all part-compose primitives grow along +Y by default):
 *   axis 'y' → identity, axis 'x' → Rz(-90°), axis 'z' → Rx(+90°)
 */

import type { InstanceBatch } from './instancing-planner'

// ─── Public types ────────────────────────────────────────────────────────────

export type BatchInstanceData = {
  /** batch key (matches materialPlan.byBatch key) */
  key: string
  /** part-compose kind of the representative geometry */
  kind: string
  count: number
  /** Column-major 4x4 matrices, 16 floats per instance */
  matrices: Float32Array
}

// ─── Matrix helpers (column-major, matching three.js Matrix4.elements) ──────

/** Axis-alignment basis, written into the 3x3 upper-left of a column-major 4x4. */
function writeAxisBasis(out: Float32Array, offset: number, axis: 'x' | 'y' | 'z' | undefined) {
  if (axis === 'x') {
    // Rotate +90° about Z (then mirror): local +Y → world +X
    // columns: X=(0,-1,0) Y=(1,0,0) Z=(0,0,1)
    out[offset + 0] = 0
    out[offset + 1] = -1
    out[offset + 2] = 0
    out[offset + 4] = 1
    out[offset + 5] = 0
    out[offset + 6] = 0
    out[offset + 8] = 0
    out[offset + 9] = 0
    out[offset + 10] = 1
  } else if (axis === 'z') {
    // Rotate +90° about X: local +Y → world +Z
    // columns: X=(1,0,0) Y=(0,0,1) Z=(0,-1,0)
    out[offset + 0] = 1
    out[offset + 1] = 0
    out[offset + 2] = 0
    out[offset + 4] = 0
    out[offset + 5] = 0
    out[offset + 6] = 1
    out[offset + 8] = 0
    out[offset + 9] = -1
    out[offset + 10] = 0
  } else {
    // Identity (Y-up)
    out[offset + 0] = 1
    out[offset + 1] = 0
    out[offset + 2] = 0
    out[offset + 4] = 0
    out[offset + 5] = 1
    out[offset + 6] = 0
    out[offset + 8] = 0
    out[offset + 9] = 0
    out[offset + 10] = 1
  }
}

/**
 * Compose one instance matrix into `out` at `offset` (16-float stride).
 * M = T(position) · Ry(rotationY) · AxisAlign · S(scale)
 */
export function composeInstanceMatrix(
  out: Float32Array,
  offset: number,
  position: readonly [number, number, number],
  rotationY: number,
  axis: 'x' | 'y' | 'z' | undefined,
  scale: number,
): void {
  // Start from axis basis
  writeAxisBasis(out, offset, axis)

  // Apply uniform scale to the 3x3 basis (w components at 3/7/11 stay 0)
  for (let col = 0; col < 3; col += 1) {
    out[offset + col * 4] *= scale
    out[offset + col * 4 + 1] *= scale
    out[offset + col * 4 + 2] *= scale
  }

  // Apply rotationY: R = Ry(θ) · Basis — rotate basis columns in the XZ plane
  if (rotationY !== 0) {
    const cos = Math.cos(rotationY)
    const sin = Math.sin(rotationY)
    for (let col = 0; col < 3; col += 1) {
      const bx = out[offset + col * 4]
      const bz = out[offset + col * 4 + 2]
      out[offset + col * 4] = bx * cos + bz * sin
      out[offset + col * 4 + 2] = -bx * sin + bz * cos
    }
  }

  // Row 3 (w row of the 3x3 block)
  out[offset + 3] = 0
  out[offset + 7] = 0
  out[offset + 11] = 0

  // Translation column
  out[offset + 12] = position[0]
  out[offset + 13] = position[1]
  out[offset + 14] = position[2]
  out[offset + 15] = 1
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the instance matrix array for one batch. The returned Float32Array
 * has `batch.count * 16` elements in column-major order, ready for:
 *   new THREE.InstancedBufferAttribute(data.matrices, 16)
 * or direct assignment to instancedMesh.instanceMatrix.
 */
export function buildInstanceMatrices(batch: InstanceBatch): BatchInstanceData {
  const matrices = new Float32Array(batch.count * 16)
  batch.instances.forEach((instance, index) => {
    composeInstanceMatrix(
      matrices,
      index * 16,
      instance.position,
      instance.rotationY ?? 0,
      instance.axis,
      instance.scale ?? 1,
    )
  })
  return { key: batch.key, kind: batch.kind, count: batch.count, matrices }
}

/**
 * Build instance matrices for every batch of a plan.
 */
export function buildPlanInstanceMatrices(
  batches: readonly InstanceBatch[],
): BatchInstanceData[] {
  return batches.map((batch) => buildInstanceMatrices(batch))
}
