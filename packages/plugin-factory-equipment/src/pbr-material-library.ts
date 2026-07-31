/**
 * PBR Material Library
 *
 * Bridges the render contract's 8 industrial materials to a texture-backed
 * PBR description. The core vocabulary already defines scalar PBR params
 * (metalness/roughness/envMapIntensity/clearcoat); this library adds the
 * procedural texture spec each material needs (normal / roughness / metalness
 * maps) so the renderer can generate CanvasTexture/DataTexture maps without
 * shipping external image assets.
 *
 * Design:
 *  - Pure logic, no three.js import → unit-testable in isolation.
 *  - The renderer turns TextureSpec into an actual texture (procedural noise).
 *  - resolvePbrMaterial() returns a complete, ready-to-apply material plan for
 *    a given render contract, merging kernel overrides + material profile +
 *    texture spec.
 */

import {
  getIndustrialMaterialPbrProfile,
  isIndustrialRenderMaterial,
  type IndustrialRenderMaterial,
} from '@pascal-app/core/registry'

// ─── Texture specification ───────────────────────────────────────────────────

export type TextureNoiseKind =
  | 'none'
  | 'fine-grain' // galvanized steel / painted metal micro-texture
  | 'brushed-lines' // anisotropic brushing for process metal
  | 'coarse-granules' // granular solid / refractory
  | 'ripple' // liquid surface
  | 'speckle' // dark machinery casting
  | 'glow-noise' // emissive lamp/flame variation

export type TextureSpec = {
  /** Which PBR slot this texture feeds */
  slot: 'baseColor' | 'normal' | 'roughness' | 'metalness'
  /** Procedural noise pattern */
  noise: TextureNoiseKind
  /** UV repeat (tiling) */
  repeat: [number, number]
  /** Strength / intensity multiplier (0-1) */
  strength: number
  /** Resolution hint (px, square) */
  resolution: number
  /** Anisotropy direction for brushed metal (radians) */
  anisotropyAngle?: number
}

export type PbrMaterialPlan = {
  materialFamily: IndustrialRenderMaterial | 'unknown'
  /** Scalar PBR params (from core profile, possibly kernel-overridden) */
  metalness: number
  roughness: number
  envMapIntensity: number
  clearcoat?: number
  clearcoatRoughness?: number
  opacity?: number
  transparent?: boolean
  depthWrite?: boolean
  /** Procedural textures to generate + attach */
  textures: TextureSpec[]
  /** Whether any texture is present (false → flat scalar material) */
  hasTextures: boolean
}

// ─── Per-material texture specs ──────────────────────────────────────────────

const TEXTURE_SPECS: Record<IndustrialRenderMaterial, TextureSpec[]> = {
  'painted-metal': [
    { slot: 'normal', noise: 'fine-grain', repeat: [4, 4], strength: 0.25, resolution: 256 },
    { slot: 'roughness', noise: 'fine-grain', repeat: [4, 4], strength: 0.3, resolution: 256 },
  ],
  'galvanized-steel': [
    { slot: 'baseColor', noise: 'speckle', repeat: [6, 6], strength: 0.35, resolution: 256 },
    { slot: 'normal', noise: 'speckle', repeat: [6, 6], strength: 0.45, resolution: 256 },
    { slot: 'roughness', noise: 'speckle', repeat: [6, 6], strength: 0.4, resolution: 256 },
    { slot: 'metalness', noise: 'speckle', repeat: [6, 6], strength: 0.2, resolution: 128 },
  ],
  'brushed-metal': [
    { slot: 'normal', noise: 'brushed-lines', repeat: [2, 8], strength: 0.5, resolution: 256, anisotropyAngle: 0 },
    { slot: 'roughness', noise: 'brushed-lines', repeat: [2, 8], strength: 0.55, resolution: 256, anisotropyAngle: 0 },
    { slot: 'metalness', noise: 'brushed-lines', repeat: [2, 8], strength: 0.25, resolution: 128, anisotropyAngle: 0 },
  ],
  'translucent-liquid': [
    { slot: 'roughness', noise: 'ripple', repeat: [3, 3], strength: 0.2, resolution: 128 },
  ],
  'granular-solid': [
    { slot: 'baseColor', noise: 'coarse-granules', repeat: [5, 5], strength: 0.5, resolution: 256 },
    { slot: 'normal', noise: 'coarse-granules', repeat: [5, 5], strength: 0.8, resolution: 256 },
    { slot: 'roughness', noise: 'coarse-granules', repeat: [5, 5], strength: 0.5, resolution: 128 },
  ],
  'low-opacity-gas': [],
  'hot-refractory': [
    { slot: 'baseColor', noise: 'coarse-granules', repeat: [3, 3], strength: 0.4, resolution: 256 },
    { slot: 'normal', noise: 'coarse-granules', repeat: [3, 3], strength: 0.7, resolution: 256 },
    { slot: 'roughness', noise: 'coarse-granules', repeat: [3, 3], strength: 0.5, resolution: 128 },
  ],
  'dark-machinery': [
    { slot: 'baseColor', noise: 'speckle', repeat: [4, 4], strength: 0.3, resolution: 256 },
    { slot: 'normal', noise: 'fine-grain', repeat: [4, 4], strength: 0.35, resolution: 256 },
    { slot: 'roughness', noise: 'fine-grain', repeat: [4, 4], strength: 0.4, resolution: 128 },
  ],
  'emissive-flame': [
    { slot: 'baseColor', noise: 'glow-noise', repeat: [1, 2], strength: 0.7, resolution: 128 },
  ],
  'warm-lamp': [
    { slot: 'baseColor', noise: 'glow-noise', repeat: [1, 1], strength: 0.18, resolution: 64 },
  ],
}

// ─── Kernel overrides (align with industrial-render-contract-rendering) ─────

type KernelOverride = Partial<
  Pick<PbrMaterialPlan, 'metalness' | 'roughness' | 'envMapIntensity' | 'opacity' | 'transparent' | 'depthWrite' | 'clearcoat' | 'clearcoatRoughness'>
>

const KERNEL_OVERRIDES: Record<string, KernelOverride> = {
  'liquid-surface': { metalness: 0, roughness: 0.05, envMapIntensity: 0.85, opacity: 0.42, transparent: true, depthWrite: false },
  'translucent-fill-volume': { metalness: 0, roughness: 0.16, transparent: true, depthWrite: false },
  'solid-surface': { metalness: 0, roughness: 0.88, envMapIntensity: 0.35 },
  'gas-volume': { metalness: 0, roughness: 0.18, envMapIntensity: 0.1, opacity: 0.12, transparent: true, depthWrite: false },
  'painted-cylindrical-shell': { metalness: 0.16, roughness: 0.34, clearcoat: 0.3, clearcoatRoughness: 0.28, envMapIntensity: 1.2 },
  'horizontal-vessel-shell': { metalness: 0.2, roughness: 0.33, clearcoat: 0.22, clearcoatRoughness: 0.3, envMapIntensity: 1.2 },
  'distillation-column-shell': { metalness: 0.2, roughness: 0.33, clearcoat: 0.22, clearcoatRoughness: 0.3, envMapIntensity: 1.2 },
  'process-pipe-run': { metalness: 0.74, roughness: 0.26, envMapIntensity: 1.35 },
  'flanged-connection': { metalness: 0.74, roughness: 0.26, envMapIntensity: 1.35 },
  'shell-and-tube-exchanger': { metalness: 0.74, roughness: 0.26, envMapIntensity: 1.35 },
  'support-frame': { metalness: 0.62, roughness: 0.39, envMapIntensity: 0.85 },
  'service-platform': { metalness: 0.62, roughness: 0.39, envMapIntensity: 0.85 },
  'access-stair-or-ladder': { metalness: 0.62, roughness: 0.39, envMapIntensity: 0.85 },
  'skid-mounted-pump': { metalness: 0.62, roughness: 0.39, envMapIntensity: 0.85 },
  'fired-heater-body': { metalness: 0.38, roughness: 0.58, envMapIntensity: 0.5 },
  'ribbed-motor': { metalness: 0.28, roughness: 0.74, envMapIntensity: 0.45 },
  'lattice-or-stack-emission': { metalness: 0.7, roughness: 0.34, envMapIntensity: 0.9 },
  'fire-flare': { metalness: 0, roughness: 0.12, envMapIntensity: 0.25, opacity: 0.72, transparent: true, depthWrite: false },
  'site-lighting': { metalness: 0, roughness: 0.12, envMapIntensity: 0.4, opacity: 0.92, transparent: true },
  'volute-pump-casing': { metalness: 0.54, roughness: 0.36, envMapIntensity: 0.75 },
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type RenderContractLike = {
  kernel?: string
  material?: string | { family?: string; finish?: string; opacity?: number }
}

const MATERIAL_ALIASES: Record<string, IndustrialRenderMaterial> = {
  'painted-steel': 'brushed-metal',
  'galvanized-painted-steel': 'galvanized-steel',
  'weathered-metal-concrete': 'galvanized-steel',
  'weathered-civil': 'painted-metal',
  'painted-steel-emissive-lamp': 'warm-lamp',
}

function normalizeMaterialName(value: unknown): IndustrialRenderMaterial | undefined {
  if (isIndustrialRenderMaterial(value)) return value
  if (typeof value !== 'string') return undefined
  return MATERIAL_ALIASES[value]
}

/**
 * Resolve a complete PBR material plan (scalar params + procedural textures)
 * for a render contract. Merges: base profile → kernel override → texture spec.
 */
export function resolvePbrMaterial(contract: RenderContractLike | undefined): PbrMaterialPlan {
  const materialName =
    typeof contract?.material === 'string'
      ? normalizeMaterialName(contract.material)
      : undefined
  const profile = getIndustrialMaterialPbrProfile(materialName)

  const base: PbrMaterialPlan = {
    materialFamily: profile ? profile.id : 'unknown',
    metalness: profile?.metalness ?? 0.46,
    roughness: profile?.roughness ?? 0.42,
    envMapIntensity: profile?.envMapIntensity ?? 0.7,
    clearcoat: profile?.clearcoat,
    clearcoatRoughness: profile?.clearcoatRoughness,
    opacity: profile?.opacity,
    transparent: profile?.transparent,
    depthWrite: profile?.depthWrite,
    textures: materialName ? TEXTURE_SPECS[materialName] ?? [] : [],
    hasTextures: false,
  }

  // Apply kernel-level overrides on top of the material profile
  const override = contract?.kernel ? KERNEL_OVERRIDES[contract.kernel] : undefined
  if (override) {
    if (override.metalness !== undefined) base.metalness = override.metalness
    if (override.roughness !== undefined) base.roughness = override.roughness
    if (override.envMapIntensity !== undefined) base.envMapIntensity = override.envMapIntensity
    if (override.clearcoat !== undefined) base.clearcoat = override.clearcoat
    if (override.clearcoatRoughness !== undefined) base.clearcoatRoughness = override.clearcoatRoughness
    if (override.opacity !== undefined) base.opacity = override.opacity
    if (override.transparent !== undefined) base.transparent = override.transparent
    if (override.depthWrite !== undefined) base.depthWrite = override.depthWrite
  }

  // Explicit opacity on the material object wins
  if (typeof contract?.material === 'object' && typeof contract.material.opacity === 'number') {
    base.opacity = contract.material.opacity
    if (base.opacity < 1) base.transparent = true
  }

  base.hasTextures = base.textures.length > 0
  return base
}

/**
 * List the texture specs for a material family (empty array if none).
 */
export function textureSpecsFor(material: IndustrialRenderMaterial): TextureSpec[] {
  return TEXTURE_SPECS[material] ?? []
}

/**
 * All material families that carry procedural textures.
 */
export function texturedMaterialFamilies(): IndustrialRenderMaterial[] {
  return (Object.keys(TEXTURE_SPECS) as IndustrialRenderMaterial[]).filter(
    (key) => TEXTURE_SPECS[key].length > 0,
  )
}
