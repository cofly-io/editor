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
