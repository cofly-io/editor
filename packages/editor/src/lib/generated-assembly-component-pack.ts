import { loadAssetUrl, saveAsset } from '@pascal-app/core'
import { type AssemblyIR, canonicalizeAssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import type { GeneratedAssemblyNode } from '@pascal-app/core/schema'

export const GENERATED_ASSEMBLY_COMPONENT_PACK_VERSION = 1 as const

export type GeneratedAssemblyComponentPack = {
  format: 'pascal-generated-assembly-component-pack'
  version: typeof GENERATED_ASSEMBLY_COMPONENT_PACK_VERSION
  id: string
  name: string
  generator: GeneratedAssemblyNode['generator']
  ir: AssemblyIR
  thumbnail?: {
    cacheKey: string
    dataUrl: string
  }
}

function hash(value: string): string {
  let result = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(16).padStart(8, '0')
}

/** Stable thumbnail cache key; material changes invalidate even when IR geometry does not. */
export function generatedAssemblyThumbnailCacheKey(
  irHash: string,
  materialHash: string,
  thumbnailRendererVersion: string,
): string {
  return `generated-assembly:${hash(`${irHash}:${materialHash}:${thumbnailRendererVersion}`)}`
}

/** Build the portable, editable artifact stored by a workspace component library. */
export function createGeneratedAssemblyComponentPack(input: {
  id: string
  name: string
  root: GeneratedAssemblyNode
  ir: AssemblyIR
  thumbnail?: GeneratedAssemblyComponentPack['thumbnail']
}): GeneratedAssemblyComponentPack {
  if (!input.id.trim() || !input.name.trim())
    throw new TypeError('Component pack id and name are required.')
  if (input.root.generator.sourceHash !== input.ir.generator.sourceHash) {
    throw new TypeError('Component pack root and IR source hashes must match.')
  }
  if (input.root.generator.paramsHash !== input.ir.generator.paramsHash) {
    throw new TypeError('Component pack root and IR params hashes must match.')
  }
  if (input.root.generator.apiVersion !== input.ir.generator.apiVersion) {
    throw new TypeError('Component pack root and IR API versions must match.')
  }
  return {
    format: 'pascal-generated-assembly-component-pack',
    version: GENERATED_ASSEMBLY_COMPONENT_PACK_VERSION,
    id: input.id,
    name: input.name,
    generator: input.root.generator,
    ir: canonicalizeAssemblyIR(input.ir),
    ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
  }
}

/** Defensive runtime validation for component packs loaded from workspace storage. */
export function isGeneratedAssemblyComponentPack(
  value: unknown,
): value is GeneratedAssemblyComponentPack {
  if (!value || typeof value !== 'object') return false
  const pack = value as Partial<GeneratedAssemblyComponentPack>
  return (
    pack.format === 'pascal-generated-assembly-component-pack' &&
    pack.version === GENERATED_ASSEMBLY_COMPONENT_PACK_VERSION &&
    typeof pack.id === 'string' &&
    typeof pack.name === 'string' &&
    Boolean(pack.generator) &&
    Boolean(pack.ir)
  )
}

/** Persist a component pack as a workspace-local `asset://` document. */
export async function saveGeneratedAssemblyComponentPack(
  pack: GeneratedAssemblyComponentPack,
): Promise<string> {
  return saveAsset(
    new File([JSON.stringify(pack)], `${pack.id}.generated-assembly.json`, {
      type: 'application/vnd.pascal.generated-assembly+json',
    }),
  )
}

/** Load and validate a component pack previously saved in workspace storage. */
export async function loadGeneratedAssemblyComponentPack(
  assetUrl: string,
): Promise<GeneratedAssemblyComponentPack | null> {
  const resolvedUrl = await loadAssetUrl(assetUrl)
  if (!resolvedUrl) return null
  try {
    const value: unknown = await (await fetch(resolvedUrl)).json()
    return isGeneratedAssemblyComponentPack(value) ? value : null
  } finally {
    if (resolvedUrl.startsWith('blob:')) URL.revokeObjectURL(resolvedUrl)
  }
}

/** Delete a workspace-local component pack. */
export async function deleteGeneratedAssemblyComponentPack(assetUrl: string): Promise<void> {
  const core = (await import('@pascal-app/core')) as typeof import('@pascal-app/core') & {
    deleteAsset?: (url: string) => Promise<void>
  }
  if (!core.deleteAsset) {
    throw new Error('Component pack deletion requires @pascal-app/core with deleteAsset support.')
  }
  await core.deleteAsset(assetUrl)
}
