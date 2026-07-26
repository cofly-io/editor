import { NextResponse } from 'next/server'
import path from 'node:path'
import { assetCloudRoot } from '@/lib/asset-packs'
import { registerSemanticRecipe, semanticRecipeRegistry } from '@pascal-app/core/registry'
import {
  centrifugalPumpRecipe,
  controlRoomRecipe,
  distillationUnitRecipe,
  firedHeaterRecipe,
  flareStackRecipe,
  generateIndustryScene,
  horizontalVesselRecipe,
  shellTubeExchangerRecipe,
  storageTankRecipe,
  utilityBoilerRecipe,
} from '@pascal-app/plugin-factory-equipment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Realistic industry scene generation.
 *
 * Runs the plugin-factory-equipment pipeline (real geometry synthesis →
 * layout placement → connection routing → instancing + PBR material plan)
 * against an installed industry pack and returns the full scene as JSON.
 *
 * Unlike the AI-generation route, this is deterministic and fast: it reads
 * the pack's profiles/layout/connections and produces the whole refinery in
 * one shot. The renderer consumes `instancing.batches` + `materialPlan` +
 * `renderPayload` (see IndustrySceneBatches in @pascal-app/nodes).
 *
 * GET /api/industry-scene?packId=industry.refinery.basic
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const packId = url.searchParams.get('packId') ?? 'industry.refinery.basic'

  try {
    const cloudRoot = await assetCloudRoot()
    const workspaceRoot = path.dirname(cloudRoot)
    const industryPacksRoot = path.join(workspaceRoot, 'industry-packs')
    const componentPacksRoot = path.join(workspaceRoot, 'component-packs')

    const result = await generateIndustryScene(packId, {
      loader: { industryPacksRoot, componentPacksRoot },
      builtinRecipes: [
        centrifugalPumpRecipe,
        storageTankRecipe,
        distillationUnitRecipe,
        firedHeaterRecipe,
        shellTubeExchangerRecipe,
        utilityBoilerRecipe,
        flareStackRecipe,
        horizontalVesselRecipe,
        controlRoomRecipe,
      ],
      registry: {
        findByProfile: (id: string) => semanticRecipeRegistry.findByProfile(id),
        register: (recipe) => registerSemanticRecipe(recipe),
      },
      buildRenderPayload: false, // matrices/textures are renderer-side; keep JSON light
    })

    // Strip functions/non-serializable bits; keep what the UI + renderer need.
    return NextResponse.json({
      ok: true,
      packId,
      stations: result.scene.stations.map((station) => ({
        stationId: station.stationId,
        profileId: station.profileId,
        zone: station.zone,
        position: station.position,
        rotationY: station.rotationY,
        partCount: station.parts.length,
      })),
      zoneGrounds: result.scene.zoneGrounds,
      unresolvedStations: result.scene.unresolvedStations,
      routing: result.routing.summary,
      unrouted: result.routing.unrouted,
      spacingViolations: result.spacingViolations,
      instancing: result.instancing.summary,
      batches: result.instancing.batches.map((batch) => ({
        key: batch.key,
        instancingHint: batch.instancingHint,
        kind: batch.kind,
        count: batch.count,
        color: batch.color,
        materialFamily: batch.materialFamily,
      })),
      singletonCount: result.instancing.singletons.length,
      materialFamilies: result.materialPlan.families,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, packId, error: message }, { status: 500 })
  }
}
