import { describe, expect, test } from 'bun:test'
import { INDUSTRIAL_RENDER_KERNELS } from '@pascal-app/core/registry'
import * as THREE from 'three'
import {
  createIndustrialMaterial,
  hasIndustrialRenderContract,
  industrialDetailKind,
  industrialRenderContractFromMetadata,
  industrialSurfaceEffectKind,
  isCanonicalIndustrialRenderKernel,
} from './industrial-render-contract-rendering'
import { primitiveBatchDisabled } from './primitive-contract-rendering'

describe('industrial render contract rendering', () => {
  test('reads industrial render contracts from generated node metadata', () => {
    const contract = industrialRenderContractFromMetadata({
      renderContract: {
        kernel: 'liquid-surface',
        material: { family: 'process-fluid', opacity: 0.36 },
        runtimeEffects: ['tank-liquid-wave'],
      },
    })

    expect(contract).toMatchObject({
      kernel: 'liquid-surface',
      material: { family: 'process-fluid', opacity: 0.36 },
      runtimeEffects: ['tank-liquid-wave'],
    })
    expect(industrialSurfaceEffectKind(contract)).toBe('liquid-wave')
    expect(hasIndustrialRenderContract({ renderContract: contract })).toBe(true)
  })

  test('creates kernel-specific industrial materials', () => {
    const fallback = new THREE.MeshStandardMaterial({ color: '#ff0000', opacity: 0.8 })
    const material = createIndustrialMaterial(
      {
        kernel: 'painted-cylindrical-shell',
        material: 'painted-metal',
      },
      fallback,
    )

    expect(material).not.toBe(fallback)
    expect(
      (material as THREE.Material & { isMeshPhysicalNodeMaterial?: boolean })
        .isMeshPhysicalNodeMaterial,
    ).toBe(true)
    expect((material as THREE.MeshStandardMaterial).metalness).toBeGreaterThan(0.1)
    expect((material as THREE.MeshStandardMaterial).envMapIntensity).toBeGreaterThan(1)
    expect(
      (material as THREE.MeshStandardMaterial & { clearcoat?: number }).clearcoat,
    ).toBeGreaterThan(0)
    expect((material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ff0000')
    expect((material as THREE.MeshStandardMaterial).opacity).toBe(0.8)
    expect(material.userData.pascalIndustrialRenderContract).toMatchObject({
      kernel: 'painted-cylindrical-shell',
    })
  })

  test('uses the named PBR profile for generic generated industrial parts', () => {
    const material = createIndustrialMaterial(
      {
        kernel: 'generic-industrial-part',
        material: 'brushed-metal',
      },
      new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0, roughness: 1 }),
    ) as THREE.MeshStandardMaterial

    expect(material.metalness).toBe(0.86)
    expect(material.roughness).toBe(0.28)
    expect(material.envMapIntensity).toBe(1.35)
  })

  test('preserves user opacity when the source material already declared transparency', () => {
    const fallback = new THREE.MeshStandardMaterial({
      color: '#22c55e',
      opacity: 0.3,
      transparent: true,
    })
    const material = createIndustrialMaterial(
      {
        kernel: 'translucent-fill-volume',
        material: 'translucent-liquid',
      },
      fallback,
    ) as THREE.MeshStandardMaterial

    expect(material.color.getHexString()).toBe('22c55e')
    expect(material.opacity).toBe(0.3)
    expect(material.transparent).toBe(true)
  })

  test('maps real industrial kernels to renderer detail hints', () => {
    expect(industrialDetailKind({ kernel: 'distillation-column-shell' })).toBe('column-shell')
    expect(industrialDetailKind({ kernel: 'process-pipe-run' })).toBe('pipe-run')
    expect(industrialDetailKind({ kernel: 'flanged-connection' })).toBe('flanged-connection')
    expect(industrialDetailKind({ kernel: 'service-platform' })).toBe('frame-box')
    expect(industrialDetailKind({ kernel: 'metal-shell' })).toBe('cylindrical-shell')
    expect(industrialDetailKind({ kernel: 'pipe-run' })).toBe('pipe-run')
    expect(industrialDetailKind({ kernel: 'structural-frame' })).toBe('frame-box')
    expect(industrialSurfaceEffectKind({ kernel: 'lattice-or-stack-emission' })).toBe('stack-glow')
  })

  test('handles every canonical industrial render kernel without replacing user color', () => {
    for (const kernel of INDUSTRIAL_RENDER_KERNELS) {
      const fallback = new THREE.MeshStandardMaterial({ color: '#a855f7' })
      const material = createIndustrialMaterial(
        {
          kernel,
          material: 'painted-metal',
        },
        fallback,
      ) as THREE.MeshStandardMaterial

      expect(isCanonicalIndustrialRenderKernel(kernel)).toBe(true)
      expect(material).not.toBe(fallback)
      expect(material.color.getHexString()).toBe('a855f7')
      expect(material.userData.pascalIndustrialRenderContract).toMatchObject({ kernel })
    }
  })

  test('allows industrial base geometry batching unless explicitly disabled', () => {
    expect(
      primitiveBatchDisabled({
        renderContract: {
          kernel: 'process-pipe-run',
          material: 'brushed-metal',
        },
      }),
    ).toBe(false)
    expect(primitiveBatchDisabled({ disablePrimitiveBatch: true })).toBe(true)
    expect(primitiveBatchDisabled({ equipmentRootId: 'generated_bicycle' })).toBe(true)
    expect(primitiveBatchDisabled({})).toBe(false)
  })
})
