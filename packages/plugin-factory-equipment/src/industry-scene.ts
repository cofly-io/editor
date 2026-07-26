/**
 * Industry Scene (one-stop orchestration)
 *
 * Full pipeline: load industry pack → register recipes → generate scene from
 * layout (auto-place stations) → route connections (auto-routing) → validate
 * spacing. This is the primary entry point for consumers that just want a
 * complete scene from a pack id.
 */

import type { SemanticRecipeDefinition } from '@pascal-app/core'
import {
  ConnectionRouter,
  type ConnectionRouterOptions,
  type RoutingResult,
} from './connection-router'
import {
  IndustryPackLoader,
  type IndustryPackLoaderOptions,
  type LoadedIndustryPack,
} from './industry-pack-loader'
import { LayoutRealism, type SpacingViolation } from './layout-realism'
import {
  InstancingPlanner,
  type InstancingPlan,
  type InstancingPlannerOptions,
} from './instancing-planner'
import {
  resolvePbrMaterial,
  type PbrMaterialPlan,
  type RenderContractLike,
} from './pbr-material-library'
import { generateTextureSet, type GeneratedTexture } from './procedural-textures'
import {
  buildPlanInstanceMatrices,
  type BatchInstanceData,
} from './instance-matrix-builder'
import {
  SceneGenerator,
  type GeneratedScene,
  type SceneGeneratorOptions,
} from './scene-generator'

export type IndustrySceneOptions = {
  loader: IndustryPackLoaderOptions
  /** Handwritten recipes tried before profile-derived ones */
  builtinRecipes?: readonly SemanticRecipeDefinition[]
  /** Recipe registry (e.g. semanticRecipeRegistry from core). Recipes are
   *  registered into it when `register` is provided. */
  registry?: SceneGeneratorOptions['registry'] & {
    register?(recipe: SemanticRecipeDefinition): void
  }
  routing?: ConnectionRouterOptions
  /** Instancing planner options (batching of repeated parts) */
  instancing?: InstancingPlannerOptions
  /** Pack root for layout rules (zone materials + spacing). Defaults to
   *  `${loader.industryPacksRoot}/${packId}` */
  packRoot?: string
  /** Skip spacing validation */
  skipSpacingValidation?: boolean
  /**
   * Pre-generate render-ready payload (instance matrices + procedural
   * textures). Costs a few ms + memory; enable when feeding a real renderer.
   */
  buildRenderPayload?: boolean
}

/** Per-batch PBR material plan, keyed by instancing batch key. */
export type SceneMaterialPlan = {
  /** batchKey → PBR plan (covers both instanced batches and singletons) */
  byBatch: Record<string, PbrMaterialPlan>
  /** Distinct material families used (for texture pre-warming) */
  families: string[]
}

/**
 * Render-ready payload: everything the renderer needs to draw the scene with
 * InstancedMesh + DataTexture, without re-deriving anything.
 */
export type SceneRenderPayload = {
  /** Per-batch instance matrices (column-major 4x4, 16 floats per instance) */
  batchInstances: BatchInstanceData[]
  /**
   * Pre-generated procedural textures per batch key (only batches whose
   * material family carries textures). Renderer wraps each GeneratedTexture
   * in a DataTexture and assigns it to the material slot of the same name.
   */
  batchTextures: Record<string, Partial<Record<TextureSpec['slot'], GeneratedTexture>>>
}

export type IndustryScene = {
  pack: LoadedIndustryPack
  scene: GeneratedScene
  routing: RoutingResult
  spacingViolations: SpacingViolation[]
  recipes: SemanticRecipeDefinition[]
  /** Instancing plan: repeated parts grouped into batches (Item 1) */
  instancing: InstancingPlan
  /** PBR material plans per batch/singleton (Item 2) */
  materialPlan: SceneMaterialPlan
  /** Render-ready: instance matrices + procedural textures (null unless requested) */
  renderPayload: SceneRenderPayload | null
}

/**
 * Resolve a PBR material plan for every batch and singleton in the instancing
 * plan, keyed so the renderer can look up the right material per draw.
 */
function resolveSceneMaterials(instancing: InstancingPlan): SceneMaterialPlan {
  const byBatch: Record<string, PbrMaterialPlan> = {}
  const families = new Set<string>()

  const register = (key: string, contract: RenderContractLike | undefined) => {
    const plan = resolvePbrMaterial(contract)
    byBatch[key] = plan
    if (plan.materialFamily !== 'unknown') families.add(plan.materialFamily)
  }

  for (const batch of instancing.batches) {
    register(batch.key, {
      ...(batch.renderContract as RenderContractLike | undefined),
      material: batch.materialFamily,
    })
  }
  for (const part of instancing.singletons) {
    const record = part as Record<string, unknown>
    const key = `singleton:${String(record.id ?? record.semanticRole ?? Math.random())}`
    const contract = record.renderContract as RenderContractLike | undefined
    register(key, contract)
  }

  return { byBatch, families: [...families].sort() }
}

/**
 * Build the render-ready payload: instance matrices for every batch plus
 * pre-generated procedural textures for batches whose material plan carries
 * texture specs.
 */
function buildSceneRenderPayload(
  instancing: InstancingPlan,
  materialPlan: SceneMaterialPlan,
): SceneRenderPayload {
  const batchInstances = buildPlanInstanceMatrices(instancing.batches)
  const batchTextures: SceneRenderPayload['batchTextures'] = {}
  for (const batch of instancing.batches) {
    const plan = materialPlan.byBatch[batch.key]
    if (!plan?.hasTextures) continue
    batchTextures[batch.key] = generateTextureSet(plan.textures)
  }
  return { batchInstances, batchTextures }
}

/**
 * Load a pack and generate the complete scene in one call.
 */
export async function generateIndustryScene(
  packId: string,
  options: IndustrySceneOptions,
): Promise<IndustryScene> {
  // 1. Load the pack
  const loader = new IndustryPackLoader(options.loader)
  const pack = await loader.loadIndustryPack(packId)

  // 2. Convert profiles to recipes and register them
  const recipes = loader.profilesToRecipes(pack)
  if (options.registry?.register) {
    for (const recipe of recipes) options.registry.register(recipe)
  }

  // 3. Load layout rules (zone materials + spacing)
  const packRoot = options.packRoot ?? `${options.loader.industryPacksRoot}/${packId}`
  const realism = new LayoutRealism()
  await realism.loadFromIndustryPack(packRoot)

  // 4. Generate scene (auto-place stations)
  const generator = new SceneGenerator({
    builtinRecipes: options.builtinRecipes,
    registry: options.registry,
    layoutRealism: realism,
  })
  const scene = generator.generateScene(pack)

  // 5. Route connections (auto-routing)
  const routing = new ConnectionRouter(options.routing).routeConnections(pack, scene)

  // 6. Validate spacing
  const spacingViolations = options.skipSpacingValidation
    ? []
    : realism.validateSpacing(
        pack.layouts[0]?.stations ?? [],
        pack.profiles,
      )

  // 7. Performance + realism plan: instanced batches + PBR materials
  const instancing = new InstancingPlanner(options.instancing).planWithConnections(
    scene,
    routing,
  )
  const materialPlan = resolveSceneMaterials(instancing)

  // 8. Optional: pre-generate render-ready payload (matrices + textures)
  const renderPayload = options.buildRenderPayload
    ? buildSceneRenderPayload(instancing, materialPlan)
    : null

  return {
    pack,
    scene,
    routing,
    spacingViolations,
    recipes,
    instancing,
    materialPlan,
    renderPayload,
  }
}
