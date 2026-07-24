export const INDUSTRIAL_RENDER_KERNELS = [
  'painted-cylindrical-shell',
  'horizontal-vessel-shell',
  'distillation-column-shell',
  'translucent-fill-volume',
  'liquid-surface',
  'solid-surface',
  'gas-volume',
  'process-pipe-run',
  'flanged-connection',
  'access-stair-or-ladder',
  'service-platform',
  'skid-mounted-pump',
  'volute-pump-casing',
  'ribbed-motor',
  'shell-and-tube-exchanger',
  'fired-heater-body',
  'lattice-or-stack-emission',
  'support-frame',
  'generic-industrial-part',
] as const

export type IndustrialRenderKernel = (typeof INDUSTRIAL_RENDER_KERNELS)[number]

export const INDUSTRIAL_RENDER_MATERIALS = [
  'painted-metal',
  'galvanized-steel',
  'brushed-metal',
  'translucent-liquid',
  'granular-solid',
  'low-opacity-gas',
  'hot-refractory',
  'dark-machinery',
] as const

export type IndustrialRenderMaterial = (typeof INDUSTRIAL_RENDER_MATERIALS)[number]

export const INDUSTRIAL_MATERIAL_MAP_SLOTS = [
  'baseColor',
  'normal',
  'roughness',
  'metalness',
] as const

export type IndustrialMaterialMapSlot = (typeof INDUSTRIAL_MATERIAL_MAP_SLOTS)[number]

export type IndustrialMaterialPbrProfile = {
  id: IndustrialRenderMaterial
  label: string
  metalness: number
  roughness: number
  envMapIntensity: number
  opacity?: number
  transparent?: boolean
  depthWrite?: boolean
  clearcoat?: number
  clearcoatRoughness?: number
  recommendedMaps: readonly IndustrialMaterialMapSlot[]
}

export const INDUSTRIAL_MATERIAL_PBR_PROFILES: Record<
  IndustrialRenderMaterial,
  IndustrialMaterialPbrProfile
> = {
  'painted-metal': {
    id: 'painted-metal',
    label: 'Painted industrial metal',
    metalness: 0.16,
    roughness: 0.34,
    envMapIntensity: 1.2,
    clearcoat: 0.3,
    clearcoatRoughness: 0.28,
    recommendedMaps: ['baseColor', 'normal', 'roughness'],
  },
  'galvanized-steel': {
    id: 'galvanized-steel',
    label: 'Galvanized steel',
    metalness: 0.72,
    roughness: 0.42,
    envMapIntensity: 1.05,
    recommendedMaps: ['baseColor', 'normal', 'roughness', 'metalness'],
  },
  'brushed-metal': {
    id: 'brushed-metal',
    label: 'Brushed process metal',
    metalness: 0.86,
    roughness: 0.28,
    envMapIntensity: 1.35,
    recommendedMaps: ['baseColor', 'normal', 'roughness', 'metalness'],
  },
  'translucent-liquid': {
    id: 'translucent-liquid',
    label: 'Translucent process liquid',
    metalness: 0,
    roughness: 0.05,
    envMapIntensity: 0.85,
    opacity: 0.42,
    transparent: true,
    depthWrite: false,
    recommendedMaps: ['baseColor', 'roughness'],
  },
  'granular-solid': {
    id: 'granular-solid',
    label: 'Granular bulk solid',
    metalness: 0,
    roughness: 0.88,
    envMapIntensity: 0.35,
    opacity: 0.72,
    recommendedMaps: ['baseColor', 'normal', 'roughness'],
  },
  'low-opacity-gas': {
    id: 'low-opacity-gas',
    label: 'Low-opacity process gas',
    metalness: 0,
    roughness: 0.18,
    envMapIntensity: 0.1,
    opacity: 0.12,
    transparent: true,
    depthWrite: false,
    recommendedMaps: ['baseColor'],
  },
  'hot-refractory': {
    id: 'hot-refractory',
    label: 'Hot refractory surface',
    metalness: 0.05,
    roughness: 0.85,
    envMapIntensity: 0.35,
    recommendedMaps: ['baseColor', 'normal', 'roughness'],
  },
  'dark-machinery': {
    id: 'dark-machinery',
    label: 'Dark machinery casing',
    metalness: 0.28,
    roughness: 0.68,
    envMapIntensity: 0.45,
    recommendedMaps: ['baseColor', 'normal', 'roughness'],
  },
}

export function isIndustrialRenderMaterial(value: unknown): value is IndustrialRenderMaterial {
  return (
    typeof value === 'string' && (INDUSTRIAL_RENDER_MATERIALS as readonly string[]).includes(value)
  )
}

export function getIndustrialMaterialPbrProfile(
  value: unknown,
): IndustrialMaterialPbrProfile | undefined {
  return isIndustrialRenderMaterial(value) ? INDUSTRIAL_MATERIAL_PBR_PROFILES[value] : undefined
}

export const INDUSTRIAL_RENDER_INSTANCING_HINTS = [
  'steps-rungs-rails',
  'bolts',
  'pipe-bundles',
  'frame-members',
] as const

export type IndustrialRenderInstancingHint = (typeof INDUSTRIAL_RENDER_INSTANCING_HINTS)[number]

export type IndustrialRenderContract = {
  kernel: IndustrialRenderKernel
  material: IndustrialRenderMaterial
  runtimeEffects?: readonly string[]
  instancingHint?: IndustrialRenderInstancingHint
}
