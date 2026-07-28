import { get, set } from 'idb-keyval'
import type { MeshBlobRef, Vec3 } from './generated-assembly-ir'
import { ASSEMBLY_BUDGET } from './generated-assembly-validation'

const GENERATED_MESH_BLOB_PREFIX = 'generated_mesh_blob:'

export type GeneratedMeshBlobPayload = {
  positions: number[]
  indices?: number[]
  normals?: number[]
  uvs?: number[]
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
}

function assertPayload(payload: GeneratedMeshBlobPayload): void {
  if (payload.positions.length === 0 || payload.positions.length % 3 !== 0) {
    throw new TypeError('Generated mesh positions must contain complete XYZ vertices.')
  }
  if (!isFiniteNumberArray(payload.positions)) {
    throw new TypeError('Generated mesh positions must contain only finite numbers.')
  }
  if (
    payload.indices &&
    (!isFiniteNumberArray(payload.indices) ||
      payload.indices.some((index) => !Number.isInteger(index) || index < 0))
  ) {
    throw new TypeError('Generated mesh indices must contain non-negative integers.')
  }
  if (
    payload.normals &&
    (payload.normals.length !== payload.positions.length || !isFiniteNumberArray(payload.normals))
  ) {
    throw new TypeError('Generated mesh normals must contain one finite XYZ value per vertex.')
  }
  if (
    payload.uvs &&
    (payload.uvs.length !== (payload.positions.length / 3) * 2 || !isFiniteNumberArray(payload.uvs))
  ) {
    throw new TypeError('Generated mesh UVs must contain one finite UV value per vertex.')
  }
  const byteLength =
    (payload.positions.length +
      (payload.indices?.length ?? 0) +
      (payload.normals?.length ?? 0) +
      (payload.uvs?.length ?? 0)) *
    Float64Array.BYTES_PER_ELEMENT
  if (byteLength > ASSEMBLY_BUDGET.maxSerializedMeshBytes) {
    throw new RangeError(
      `Generated mesh payload exceeds the ${ASSEMBLY_BUDGET.maxSerializedMeshBytes}-byte budget.`,
    )
  }
}

function boundsOf(positions: number[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis]!
      min[axis] = Math.min(min[axis], value)
      max[axis] = Math.max(max[axis], value)
    }
  }
  return { min, max }
}

async function contentHash(payload: GeneratedMeshBlobPayload): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

/**
 * Stores a mesh payload independently from the scene document and returns a
 * content-addressed descriptor that can safely be persisted in a node.
 */
export async function saveGeneratedMeshBlob(
  payload: GeneratedMeshBlobPayload,
): Promise<MeshBlobRef> {
  assertPayload(payload)
  const blobId = await contentHash(payload)
  await set(`${GENERATED_MESH_BLOB_PREFIX}${blobId}`, payload)
  return {
    kind: 'mesh-blob',
    blobId,
    format: 'pascal-mesh-v1',
    vertexCount: payload.positions.length / 3,
    indexCount: payload.indices?.length ?? 0,
    bounds: boundsOf(payload.positions),
    hasNormals: Boolean(payload.normals),
    hasUVs: Boolean(payload.uvs),
  }
}

/** Loads and validates a persisted mesh payload. Missing or corrupt blobs are not rendered. */
export async function loadGeneratedMeshBlob(
  blobId: string,
): Promise<GeneratedMeshBlobPayload | null> {
  const payload = await get<GeneratedMeshBlobPayload>(`${GENERATED_MESH_BLOB_PREFIX}${blobId}`)
  if (!payload) return null
  try {
    assertPayload(payload)
    return payload
  } catch {
    return null
  }
}
