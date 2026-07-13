import { INDUSTRIAL_RENDER_KERNELS } from '@pascal-app/core/registry'
import type * as THREE from 'three'

export type IndustrialRenderContract = {
  kernel?: string
  material?:
    | string
    | {
        family?: string
        finish?: string
        opacity?: number
      }
  runtimeEffects?: string[]
  instancingHint?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type MaterialWithSurfaceProps = THREE.Material & {
  color?: THREE.Color
  emissive?: THREE.Color
  emissiveIntensity?: number
  metalness?: number
  roughness?: number
  opacity: number
  transparent: boolean
  depthWrite: boolean
  needsUpdate: boolean
}

const CANONICAL_INDUSTRIAL_KERNELS = new Set<string>(INDUSTRIAL_RENDER_KERNELS)

export function industrialRenderContractFromMetadata(
  metadata: unknown,
): IndustrialRenderContract | undefined {
  if (!isRecord(metadata)) return undefined
  const contract = metadata.renderContract
  if (!isRecord(contract)) return undefined
  const kernel = typeof contract.kernel === 'string' ? contract.kernel : undefined
  if (!kernel) return undefined

  return {
    kernel,
    material: isRecord(contract.material)
      ? {
          family:
            typeof contract.material.family === 'string' ? contract.material.family : undefined,
          finish:
            typeof contract.material.finish === 'string' ? contract.material.finish : undefined,
          opacity:
            typeof contract.material.opacity === 'number' ? contract.material.opacity : undefined,
        }
      : typeof contract.material === 'string'
        ? contract.material
        : undefined,
    runtimeEffects: Array.isArray(contract.runtimeEffects)
      ? contract.runtimeEffects.filter((effect): effect is string => typeof effect === 'string')
      : undefined,
    instancingHint:
      typeof contract.instancingHint === 'string' ? contract.instancingHint : undefined,
  }
}

export function hasIndustrialRenderContract(metadata: unknown): boolean {
  return Boolean(industrialRenderContractFromMetadata(metadata))
}

export function isCanonicalIndustrialRenderKernel(kernel: string | undefined): boolean {
  return typeof kernel === 'string' && CANONICAL_INDUSTRIAL_KERNELS.has(kernel)
}

function materialParamsForContract(contract: IndustrialRenderContract) {
  const material = typeof contract.material === 'object' ? contract.material : undefined
  const materialName = typeof contract.material === 'string' ? contract.material : undefined
  const opacity = material?.opacity
  switch (contract.kernel) {
    case 'liquid-surface':
      return {
        color: '#38bdf8',
        emissive: '#0ea5e9',
        emissiveIntensity: 0.08,
        metalness: 0,
        opacity: opacity ?? 0.42,
        roughness: 0.05,
        transparent: true,
        depthWrite: false,
      }
    case 'translucent-fill-volume':
    case 'transparent-volume':
      return {
        color: materialName === 'granular-solid' ? '#c8b88a' : '#38bdf8',
        metalness: 0,
        opacity: opacity ?? (materialName === 'granular-solid' ? 0.58 : 0.24),
        roughness: 0.16,
        transparent: true,
        depthWrite: false,
      }
    case 'solid-surface':
    case 'solid-level':
      return {
        color: '#c8b88a',
        metalness: 0,
        opacity: opacity ?? 0.72,
        roughness: 0.88,
        transparent: opacity != null && opacity < 1,
      }
    case 'gas-volume':
      return {
        color: '#dbeafe',
        metalness: 0,
        opacity: opacity ?? 0.12,
        roughness: 0.18,
        transparent: true,
        depthWrite: false,
      }
    case 'painted-cylindrical-shell':
    case 'horizontal-vessel-shell':
    case 'distillation-column-shell':
    case 'metal-shell':
      return {
        color: '#cbd5e1',
        metalness: 0.68,
        roughness: 0.31,
      }
    case 'process-pipe-run':
    case 'pipe-run':
    case 'flanged-connection':
    case 'shell-and-tube-exchanger':
      return {
        color: '#aeb7c2',
        metalness: 0.74,
        roughness: 0.26,
      }
    case 'support-frame':
    case 'structural-frame':
    case 'service-platform':
    case 'access-stair-or-ladder':
    case 'skid-mounted-pump':
      return {
        color: '#7f8a96',
        metalness: 0.62,
        roughness: 0.39,
      }
    case 'fired-heater-body':
    case 'thermal-shell':
      return {
        color: '#4b5563',
        metalness: 0.38,
        roughness: 0.58,
      }
    case 'ribbed-motor':
    case 'rubber-coupling':
      return {
        color: '#111827',
        metalness: 0.28,
        roughness: 0.74,
      }
    case 'lattice-or-stack-emission':
    case 'fire-flare':
      return {
        color: '#9ca3af',
        metalness: 0.7,
        roughness: 0.34,
      }
    case 'volute-pump-casing':
      return {
        color: '#4f7f93',
        metalness: 0.54,
        roughness: 0.36,
      }
    default:
      return {
        color: '#b6bec8',
        metalness: 0.46,
        roughness: 0.42,
      }
  }
}

function isSurfaceMaterial(material: THREE.Material): material is MaterialWithSurfaceProps {
  return 'opacity' in material && 'transparent' in material && 'depthWrite' in material
}

function applyIndustrialEnhancement(
  material: THREE.Material,
  contract: IndustrialRenderContract,
): THREE.Material {
  if (!isSurfaceMaterial(material)) return material
  const params = materialParamsForContract(contract)
  const surface = material as MaterialWithSurfaceProps

  // Preserve the user's / recipe's assigned color. The contract upgrades
  // physical rendering properties instead of replacing the visual identity.
  if (typeof params.metalness === 'number' && 'metalness' in surface) {
    surface.metalness = Math.max(surface.metalness ?? 0, params.metalness)
  }
  if (typeof params.roughness === 'number' && 'roughness' in surface) {
    surface.roughness = Math.min(surface.roughness ?? params.roughness, params.roughness)
  }
  if (typeof params.opacity === 'number') {
    surface.opacity = surface.opacity < 1 ? surface.opacity : params.opacity
  }
  if (params.transparent === true || surface.opacity < 1) {
    surface.transparent = true
  }
  if (params.depthWrite === false) {
    surface.depthWrite = false
  }
  if (surface.emissive && typeof params.emissive === 'string') {
    surface.emissive.set(params.emissive)
  }
  if ('emissiveIntensity' in surface && typeof params.emissiveIntensity === 'number') {
    surface.emissiveIntensity = Math.max(surface.emissiveIntensity ?? 0, params.emissiveIntensity)
  }
  surface.userData.pascalIndustrialRenderContract = contract
  surface.needsUpdate = true
  return surface
}

export function createIndustrialMaterial(
  contract: IndustrialRenderContract | undefined,
  fallback: THREE.Material,
): THREE.Material {
  if (!contract?.kernel) return fallback
  return applyIndustrialEnhancement(fallback.clone(), contract)
}

export function industrialSurfaceEffectKind(
  contract: IndustrialRenderContract | undefined,
): 'liquid-wave' | 'stack-glow' | undefined {
  if (!contract) return undefined
  if (contract.kernel === 'liquid-surface') return 'liquid-wave'
  if (contract.kernel === 'lattice-or-stack-emission' || contract.kernel === 'fire-flare') {
    return 'stack-glow'
  }
  return undefined
}

export function industrialDetailKind(
  contract: IndustrialRenderContract | undefined,
):
  | 'cylindrical-shell'
  | 'column-shell'
  | 'pipe-run'
  | 'flanged-connection'
  | 'ribbed-motor'
  | 'heat-exchanger'
  | 'frame-box'
  | undefined {
  switch (contract?.kernel) {
    case 'painted-cylindrical-shell':
    case 'horizontal-vessel-shell':
    case 'metal-shell':
      return 'cylindrical-shell'
    case 'distillation-column-shell':
      return 'column-shell'
    case 'process-pipe-run':
    case 'pipe-run':
      return 'pipe-run'
    case 'flanged-connection':
      return 'flanged-connection'
    case 'ribbed-motor':
    case 'rubber-coupling':
      return 'ribbed-motor'
    case 'shell-and-tube-exchanger':
      return 'heat-exchanger'
    case 'service-platform':
    case 'support-frame':
    case 'structural-frame':
    case 'skid-mounted-pump':
    case 'access-stair-or-ladder':
      return 'frame-box'
    default:
      return undefined
  }
}
