'use client'

import {
  type AnimationEffect,
  type AnyNodeId,
  type Interactive,
  type ItemNode,
  type LightEffect,
  useInteractive,
  useRegistry,
  useScene,
} from '@pascal-app/core'
import {
  type ColorPreset,
  configureKtx2Support,
  createDefaultMaterial,
  createMaterial,
  createMaterialFromPresetRef,
  createSurfaceRoleMaterial,
  ErrorBoundary,
  glassMaterial,
  NodeRenderer,
  type RenderShading,
  resolveCdnUrl,
  useGLTFKTX2,
  useItemLightPool,
  useNodeEvents,
  useViewer,
} from '@pascal-app/viewer'
import { useAnimations, useGLTF } from '@react-three/drei'
import { Clone } from '@react-three/drei/core/Clone'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AnimationAction, AnimationClip, Group, Material, Mesh, Object3D } from 'three'
import { MathUtils } from 'three'
import { positionLocal, smoothstep, time } from 'three/tsl'
import { getItemColorOverride, isImportedGlbAsset } from './color-metadata'

type MutableMaterial = Material & {
  depthTest?: boolean
  metalness?: number
  opacity?: number
  opacityNode?: unknown
  transparent?: boolean
  wireframe?: boolean
}

const getMaterialForOriginal = (
  original: Material,
  shading: RenderShading,
  textures: boolean,
  colorPreset: ColorPreset,
): Material => {
  if (original.name.toLowerCase() === 'glass') {
    return glassMaterial
  }
  if (!textures) {
    return createSurfaceRoleMaterial('furnishing', colorPreset, undefined, undefined, shading)
  }
  return createDefaultMaterial('#f2f0ed', 0.5, shading)
}

const BrokenItemFallback = ({ node }: { node: ItemNode }) => {
  const handlers = useNodeEvents(node, 'item')
  const shading = useViewer((state) => state.shading)
  const isExporting = useViewer((state) => state.isExporting)
  const [w, h, d] = node.asset.dimensions
  const material = useMemo(() => {
    const next = createDefaultMaterial('#ef4444', 1, shading) as MutableMaterial
    next.opacity = 0.6
    next.transparent = true
    next.wireframe = true
    next.needsUpdate = true
    return next
  }, [shading])

  if (isExporting) return null

  return (
    <mesh position-y={h / 2} {...handlers}>
      <boxGeometry args={[w, h, d]} />
      <primitive attach="material" object={material} />
    </mesh>
  )
}

const MODEL_RETRY_DELAYS_MS = [1_000, 3_000]

function resolveItemModelUrl(node: ItemNode) {
  const src = resolveCdnUrl(node.asset.src) || ''
  if (!(src && isImportedGlbAsset(node))) return src
  return `${src}${src.includes('?') ? '&' : '?'}pascalImportedGlb=1`
}

const configureItemModelLoader = (loader: ItemGLTFLoader, renderer: unknown) => {
  configureKtx2Support(loader, renderer)
  if (!itemDracoLoader) {
    itemDracoLoader = new DRACOLoader(loader.manager)
    itemDracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/')
  }
  loader.setDRACOLoader(itemDracoLoader)
  loader.setMeshoptDecoder(MeshoptDecoder)
}

type LoadedItemGltf = GLTF & {
  materials: Record<string, Material>
  nodes: Record<string, Object3D>
}

const useItemGltf = (url: string): LoadedItemGltf => {
  const renderer = useThree((state) => state.gl)
  return useLoader(ItemGLTFLoader, url, (loader) =>
    configureItemModelLoader(loader, renderer),
  ) as LoadedItemGltf
}

type DeferredUnavailableCleanup = {
  consumers: number
  timer: ReturnType<typeof setTimeout> | null
}

const unavailableAssetConsumers = new Map<string, DeferredUnavailableCleanup>()
const unavailableFailureConsumers = new Map<string, DeferredUnavailableCleanup>()

const retainUnavailableConsumer = (
  entries: Map<string, DeferredUnavailableCleanup>,
  key: string,
) => {
  const entry = entries.get(key) ?? { consumers: 0, timer: null }
  if (entry.timer !== null) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
  entry.consumers += 1
  entries.set(key, entry)
}

const releaseUnavailableConsumer = (
  entries: Map<string, DeferredUnavailableCleanup>,
  key: string,
  onLastRelease: () => void,
) => {
  const entry = entries.get(key)
  if (!entry) return
  entry.consumers = Math.max(0, entry.consumers - 1)
  if (entry.consumers > 0 || entry.timer !== null) return

  // A zero-delay release distinguishes a real unmount from Strict Mode's
  // immediate setup-cleanup-setup cycle and same-tick replacements.
  entry.timer = setTimeout(() => {
    if (entry.consumers > 0 || entries.get(key) !== entry) return
    entries.delete(key)
    onLastRelease()
  }, 0)
}

const UnavailableItemModel = ({
  markSettled,
  node,
  url,
}: {
  markSettled: () => void
  node: ItemNode
  url: string
}) => {
  useEffect(() => {
    retainUnavailableConsumer(unavailableFailureConsumers, node.id)
    if (url) retainUnavailableConsumer(unavailableAssetConsumers, url)
    markSettled()
    useViewer.getState().reportItemLoadFailure(node.id, url)
    return () => {
      releaseUnavailableConsumer(unavailableFailureConsumers, node.id, () =>
        useViewer.getState().clearItemLoadFailure(node.id),
      )
      if (url) {
        releaseUnavailableConsumer(unavailableAssetConsumers, url, () => {
          cancelItemModelLoad(url)
          useLoader.clear(ItemGLTFLoader, url)
        })
      }
    }
  }, [markSettled, node.id, url])

  return <BrokenItemFallback node={node} />
}

/**
 * Expected network failures resolve through ItemGLTFLoader as an unavailable
 * scene so they never become React render errors. Parse and renderer failures
 * still reach this boundary and remain visible to developers.
 */
const ModelWithRetry = ({
  node,
  setSettled,
}: {
  node: ItemNode
  setSettled: (value: boolean) => void
}) {
  const [failures, setFailures] = useState(0)
  const [epoch, setEpoch] = useState(0)
  const modelUrl = resolveItemModelUrl(node)
  const gaveUp = !modelUrl || failures > MODEL_RETRY_DELAYS_MS.length

  const handleError = useCallback(() => setFailures((current) => current + 1), [])
  const markSettled = useCallback(() => setSettled(true), [setSettled])

  useLayoutEffect(() => {
    setSettled(false)
  }, [setSettled])

  useEffect(() => {
    if (failures === 0 || gaveUp) return
    const delay = MODEL_RETRY_DELAYS_MS[failures - 1]
    const timer = window.setTimeout(() => {
      useGLTF.clear(modelUrl)
      setEpoch((current) => current + 1)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [failures, gaveUp, modelUrl])

  useEffect(() => {
    if (!gaveUp) return
    markSettled()
    useViewer.getState().reportItemLoadFailure(node.id, modelUrl)
    return () => useViewer.getState().clearItemLoadFailure(node.id)
  }, [gaveUp, markSettled, modelUrl, node.id])

  if (gaveUp) return <BrokenItemFallback node={node} />

  return (
    <ErrorBoundary fallback={<PreviewModel node={node} />} onError={handleError} resetKey={epoch}>
      <Suspense fallback={<PreviewModel node={node} />}>
        <ModelRenderer markSettled={markSettled} node={node} />
      </Suspense>
    </ErrorBoundary>
  )
}

function isTransientItem(node: ItemNode) {
  return (
    typeof node.metadata === 'object' &&
    node.metadata !== null &&
    !Array.isArray(node.metadata) &&
    (node.metadata as Record<string, unknown>).isTransient === true
  )
}

export const ItemRenderer = ({ node }: { node: ItemNode }) => {
  const ref = useRef<Group>(null!)
  const useImportedModelProxy = useViewer((state) => state.sceneComplexity.useImportedModelProxy)
  const selected = useViewer((state) => state.selection.selectedIds.includes(node.id))
  const previewSelected = useViewer((state) => state.previewSelectedIds.includes(node.id))
  const hovered = useViewer((state) => state.hoveredId === node.id)
  const useProxy =
    isImportedGlbAsset(node) &&
    (isTransientItem(node) || (useImportedModelProxy && !(selected || previewSelected || hovered)))

  useRegistry(node.id, node.type, ref)

  const setSettled = useCallback((value: boolean) => {
    if (ref.current) ref.current.userData.itemModelSettled = value
  }, [])

  useLayoutEffect(() => {
    if (useProxy) setSettled(true)
  }, [setSettled, useProxy])

  return (
    <group position={node.position} ref={ref} rotation={node.rotation} visible={node.visible}>
      {useProxy ? (
        <PreviewModel hideDuringExport={false} node={node} />
      ) : (
        <ModelWithRetry key={node.asset.src ?? 'no-src'} node={node} setSettled={setSettled} />
      )}
      {node.children?.map((childId) => (
        <NodeRenderer key={childId} nodeId={childId} />
      ))}
    </group>
  )
}

const previewOpacity = smoothstep(0.42, 0.55, positionLocal.y.add(time.mul(-0.2)).mul(10).fract())

const previewMaterialCache = new Map<RenderShading, Material>()

function getPreviewMaterial(shading: RenderShading) {
  const cached = previewMaterialCache.get(shading)
  if (cached) return cached
  const material = createDefaultMaterial('#cccccc', 1, shading) as MutableMaterial
  material.depthTest = false
  material.opacityNode = previewOpacity
  material.transparent = true
  material.needsUpdate = true
  previewMaterialCache.set(shading, material)
  return material
}

const PreviewModel = ({ node }: { node: ItemNode }) => {
  const shading = useViewer((s) => s.shading)
  const isExporting = useViewer((s) => s.isExporting)
  const [w, h, d] = getScaledDimensions(node)
  // Loading placeholder — must never land in an exported GLB.
  if (isExporting) return null
  return (
    <mesh material={getPreviewMaterial(shading)} position-y={h / 2}>
      <boxGeometry args={[w, h, d]} />
    </mesh>
    </mesh>
  )
}

const ClearPreviewModel = ({ node }: { node: ItemNode }) => {
  const shading = useViewer((s) => s.shading)
  const [w, h, d] = getScaledDimensions(node)
  const material = useMemo(() => {
    const next = createDefaultMaterial('#ef4444', 1, shading) as MutableMaterial
    next.depthTest = false
    next.opacity = 0.35
    next.transparent = true
    next.wireframe = true
    next.needsUpdate = true
    return next
  }, [shading])

  return (
    <mesh material={material} position-y={h / 2}>
      <boxGeometry args={[w, h, d]} />
    </mesh>
  )
}

const ModelRenderer = ({ node, markSettled }: { node: ItemNode; markSettled: () => void }) => {
  const importedGlb = isImportedGlbAsset(node)
  const modelUrl = resolveItemModelUrl(node)
  const { scene, nodes, animations } = useGLTFKTX2(modelUrl) as {
    scene: Group
    nodes: Record<string, Object3D>
    animations: AnimationClip[]
  }
  const ref = useRef<Group>(null!)
  const { actions } = useAnimations(animations, ref)
  const legacyColorOverride =
    node.material || node.materialPreset ? null : getItemColorOverride(node)
  const shading = useViewer((state) => state.shading)
  const textures = useViewer((state) => state.textures)
  const colorPreset = useViewer((state) => state.colorPreset)
  // Freeze the interactive definition at mount — asset schemas don't change at runtime
  const interactiveRef = useRef(node.asset.interactive)

  useEffect(() => {
    markSettled()
  }, [markSettled])

  if (!importedGlb && nodes.cutout) {
    nodes.cutout.visible = false
  }

  const handlers = useNodeEvents(node, 'item')

  useEffect(() => {
    if (!node.parentId) return
    useScene.getState().dirtyNodes.add(node.parentId as AnyNodeId)
  }, [node.parentId])

  useEffect(() => {
    const interactive = interactiveRef.current
    if (!interactive) return
    useInteractive.getState().initItem(node.id, interactive)
    return () => useInteractive.getState().removeItem(node.id)
  }, [node.id])

  const preparedScene = useMemo(() => {
    const clonedScene = scene.clone(true)
    const overrideMaterial =
      (node.materialPreset ? createMaterialFromPresetRef(node.materialPreset, shading) : null) ??
      (node.material ? createMaterial(node.material, shading) : null) ??
      (legacyColorOverride
        ? (createDefaultMaterial(legacyColorOverride, 0.72, shading) as MutableMaterial)
        : null)
    if (legacyColorOverride && overrideMaterial && 'metalness' in overrideMaterial) {
      ;(overrideMaterial as MutableMaterial).metalness = 0.05
    }

    clonedScene.traverse((child: Object3D) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        if (!importedGlb && mesh.name === 'cutout') {
          child.visible = false
          return
        }

        if (overrideMaterial) {
          mesh.material = overrideMaterial
          mesh.castShadow = true
          mesh.receiveShadow = true
          return
        }

        if (importedGlb) {
          mesh.castShadow = true
          mesh.receiveShadow = true
          return
        }

        let hasGlass = false

        // Handle both single material and material array cases
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((mat) =>
            getMaterialForOriginal(mat, shading, textures, colorPreset),
          )
          hasGlass = mesh.material.some((mat) => mat.name === 'glass')

          // Fix geometry groups that reference materialIndex beyond the material
          // array length — this causes three-mesh-bvh to crash with
          // "Cannot read properties of undefined (reading 'side')"
          const matCount = mesh.material.length
          if (mesh.geometry.groups.length > 0) {
            for (const group of mesh.geometry.groups) {
              if (group.materialIndex !== undefined && group.materialIndex >= matCount) {
                group.materialIndex = 0
              }
            }
          }
        } else {
          mesh.material = getMaterialForOriginal(mesh.material, shading, textures, colorPreset)
          hasGlass = mesh.material.name === 'glass'
        }
        mesh.castShadow = !hasGlass
        mesh.receiveShadow = !hasGlass
      }
    })
    return clonedScene
  }, [
    scene,
    importedGlb,
    node.material,
    node.materialPreset,
    legacyColorOverride,
    shading,
    textures,
    colorPreset,
  ])

  const interactive = interactiveRef.current
  const animEffect =
    interactive?.effects.find((e): e is AnimationEffect => e.kind === 'animation') ?? null
  const lightEffects =
    interactive?.effects.filter((e): e is LightEffect => e.kind === 'light') ?? []

  // useGLTF caches scenes, and Clone shares child geometry/material references.
  // Undo can unmount one item while another clone of the same asset still needs them.
  return (
    <>
      <group scale={node.scale}>
        <Clone
          dispose={null}
          object={preparedScene}
          position={node.asset.offset}
          ref={ref}
          rotation={node.asset.rotation}
          scale={node.asset.scale || [1, 1, 1]}
          {...handlers}
        />
      </group>
      {animations.length > 0 && (
        <ItemAnimation
          actions={actions}
          animations={animations}
          animEffect={animEffect}
          interactive={interactive ?? null}
          nodeId={node.id}
        />
      )}
      {lightEffects.map((effect, i) => (
        <ItemLightRegistrar
          effect={effect}
          index={i}
          interactive={interactive!}
          key={i}
          nodeId={node.id}
        />
      ))}
    </>
  )
}

const ItemAnimation = ({
  nodeId,
  animEffect,
  interactive,
  actions,
  animations,
}: {
  nodeId: AnyNodeId
  animEffect: AnimationEffect | null
  interactive: Interactive | null
  actions: Record<string, AnimationAction | null>
  animations: { name: string }[]
}) => {
  const activeClipRef = useRef<string | null>(null)
  const fadingOutRef = useRef<AnimationAction | null>(null)

  // Reactive: derive target clip name — only re-renders when the clip name itself changes
  const targetClip = useInteractive((s) => {
    const values = s.items[nodeId]?.controlValues
    if (!animEffect) return animations[0]?.name ?? null
    const toggleIndex = interactive!.controls.findIndex((c) => c.kind === 'toggle')
    const isOn = toggleIndex >= 0 ? Boolean(values?.[toggleIndex]) : false
    return isOn
      ? (animEffect.clips.on ?? null)
      : (animEffect.clips.off ?? animEffect.clips.loop ?? null)
  })

  // When target clip changes: kick off the transition
  useEffect(() => {
    // Cancel any ongoing fade-out immediately
    if (fadingOutRef.current) {
      fadingOutRef.current.timeScale = 0
      fadingOutRef.current = null
    }
    // Move current clip to fade-out
    if (activeClipRef.current && activeClipRef.current !== targetClip) {
      const old = actions[activeClipRef.current]
      if (old?.isRunning()) fadingOutRef.current = old
    }
    // Start new clip at timeScale 0.01 (as 0 would cause isRunning to be false and thus not play at all), then fade in to 1
    activeClipRef.current = targetClip
    if (targetClip) {
      const next = actions[targetClip]
      if (next) {
        next.timeScale = 0.01
        next.play()
      }
    }
  }, [targetClip, actions])

  // useFrame: only lerping — no logic
  useFrame((_, delta) => {
    if (fadingOutRef.current) {
      const action = fadingOutRef.current
      action.timeScale = MathUtils.lerp(action.timeScale, 0, Math.min(delta * 5, 1))
      if (action.timeScale < 0.01) {
        action.timeScale = 0
        fadingOutRef.current = null
      }
    }
    if (activeClipRef.current) {
      const action = actions[activeClipRef.current]
      if (action?.isRunning() && action.timeScale < 1) {
        action.timeScale = MathUtils.lerp(action.timeScale, 1, Math.min(delta * 5, 1))
        if (1 - action.timeScale < 0.01) action.timeScale = 1
      }
    }
  })

  return null
}

const ItemLightRegistrar = ({
  nodeId,
  effect,
  interactive,
  index,
}: {
  nodeId: AnyNodeId
  effect: LightEffect
  interactive: Interactive
  index: number
}) => {
  useEffect(() => {
    const key = `${nodeId}:${index}`
    useItemLightPool.getState().register(key, nodeId, effect, interactive)
    return () => useItemLightPool.getState().unregister(key)
  }, [nodeId, index, effect, interactive])

  return null
}

export default ItemRenderer
