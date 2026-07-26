import type { AnyNodeDefinition, Plugin } from '@pascal-app/core'
import { pumpDefinition } from './pump/definition'
import { distillationUnitRecipe } from './recipes/distillation-recipe'
import { centrifugalPumpRecipe } from './recipes/pump-recipe'
import { refineryAuxiliaryUnitRecipe } from './recipes/refinery-auxiliary-recipe'
import { refineryReactorUnitRecipe } from './recipes/refinery-reactor-recipe'
import { storageTankRecipe } from './recipes/tank-recipe'
import {
  controlRoomRecipe,
  firedHeaterRecipe,
  flareStackRecipe,
  horizontalVesselRecipe,
  shellTubeExchangerRecipe,
  utilityBoilerRecipe,
} from './recipes/utility-equipment-recipes'
import { tankDefinition } from './tank/definition'

export const FACTORY_EQUIPMENT_PLUGIN_ID = 'pascal:factory-equipment'

export const factoryEquipmentPlugin: Plugin = {
  id: FACTORY_EQUIPMENT_PLUGIN_ID,
  apiVersion: 1,
  nodes: [
    pumpDefinition as unknown as AnyNodeDefinition,
    tankDefinition as unknown as AnyNodeDefinition,
  ],
  semanticRecipes: [
    centrifugalPumpRecipe,
    storageTankRecipe,
    distillationUnitRecipe,
    refineryAuxiliaryUnitRecipe,
    refineryReactorUnitRecipe,
    firedHeaterRecipe,
    shellTubeExchangerRecipe,
    utilityBoilerRecipe,
    flareStackRecipe,
    horizontalVesselRecipe,
    controlRoomRecipe,
  ],
}

export type {
  IndustrialRenderContract,
  IndustrialRenderKernel,
  IndustrialRenderMaterial,
} from '@pascal-app/core/registry'
export {
  applyIndustrialRenderContractsToShapes,
  attachIndustrialRenderContracts,
  type IndustrialRenderContractSummary,
  resolveIndustrialRenderContract,
  resolveIndustrialRenderContractWithPack,
  summarizeIndustrialRenderContracts,
} from './industrial-render-contract'
export {
  LayoutRealism,
  validateLayoutSpacing,
  type LayoutRulesDocument,
  type SpacingRule,
  type SpacingViolation,
  type ZoneGroundMaterial,
} from './layout-realism'
export {
  hasGeometryDimensions,
  synthesizeGeometryParts,
  type GeometryEnvelope,
  type SynthesizedPart,
} from './runtime-geometry-synthesizer'
export {
  InstancingPlanner,
  planSceneInstancing,
  type InstanceBatch,
  type InstanceTransform,
  type InstancingPlan,
  type InstancingPlannerOptions,
} from './instancing-planner'
export {
  resolvePbrMaterial,
  textureSpecsFor,
  texturedMaterialFamilies,
  type PbrMaterialPlan,
  type RenderContractLike,
  type TextureNoiseKind,
  type TextureSpec,
} from './pbr-material-library'
export {
  generateTextureData,
  generateTextureSet,
  textureSpecKey,
  valueNoise,
  type GeneratedTexture,
} from './procedural-textures'
export {
  buildInstanceMatrices,
  buildPlanInstanceMatrices,
  composeInstanceMatrix,
  type BatchInstanceData,
} from './instance-matrix-builder'
export {
  generateSceneFromLayout,
  SceneGenerator,
  type GeneratedScene,
  type PlacedPart,
  type PlacedStation,
  type SceneGeneratorOptions,
  type UnresolvedStation,
  type ZoneGround,
} from './scene-generator'
export {
  ConnectionRouter,
  routeConnections,
  type ConnectionRouterOptions,
  type RoutedConnection,
  type RoutedSegment,
  type RoutingResult,
  type UnroutedConnection,
} from './connection-router'
export {
  generateIndustryScene,
  type IndustryScene,
  type IndustrySceneOptions,
  type SceneMaterialPlan,
  type SceneRenderPayload,
} from './industry-scene'
export {
  loadRenderRulesForIndustryPack,
  RenderContractRulesLoader,
  renderContractRulesLoader,
  type RenderRuleDefinition,
  type RenderRulesDocument,
} from './render-contract-rules-loader'
export { pumpDefinition } from './pump/definition'
export { buildPumpFloorplan } from './pump/floorplan'
export { buildPumpGeometry } from './pump/geometry'
export { pumpParametrics } from './pump/parametrics'
export { factoryPumpPorts } from './pump/ports'
export { FactoryPumpNode, PumpType } from './pump/schema'
export {
  buildDistillationUnitPorts,
  buildDistillationUnitProfileParts,
  DISTILLATION_UNIT_CORE_PART_ROLES,
  DISTILLATION_UNIT_EDITABLE_PARAMS,
  DISTILLATION_UNIT_EDITABLE_PART_ROLES,
  DISTILLATION_UNIT_RECIPE_ID,
  distillationUnitRecipe,
} from './recipes/distillation-recipe'
export {
  buildCentrifugalPumpPorts,
  buildCentrifugalPumpProfileParts,
  CENTRIFUGAL_PUMP_CORE_PART_ROLES,
  CENTRIFUGAL_PUMP_EDITABLE_PARAMS,
  CENTRIFUGAL_PUMP_EDITABLE_PART_ROLES,
  CENTRIFUGAL_PUMP_PROFILE_ID,
  CENTRIFUGAL_PUMP_RECIPE_ID,
  centrifugalPumpRecipe,
} from './recipes/pump-recipe'
export {
  buildRefineryAuxiliaryUnitPorts,
  buildRefineryAuxiliaryUnitProfileParts,
  REFINERY_AUXILIARY_UNIT_CORE_PART_ROLES,
  REFINERY_AUXILIARY_UNIT_EDITABLE_PARAMS,
  REFINERY_AUXILIARY_UNIT_EDITABLE_PART_ROLES,
  REFINERY_AUXILIARY_UNIT_RECIPE_ID,
  refineryAuxiliaryUnitRecipe,
} from './recipes/refinery-auxiliary-recipe'
export {
  buildRefineryReactorUnitPorts,
  buildRefineryReactorUnitProfileParts,
  REFINERY_REACTOR_UNIT_CORE_PART_ROLES,
  REFINERY_REACTOR_UNIT_EDITABLE_PARAMS,
  REFINERY_REACTOR_UNIT_EDITABLE_PART_ROLES,
  REFINERY_REACTOR_UNIT_RECIPE_ID,
  refineryReactorUnitRecipe,
} from './recipes/refinery-reactor-recipe'
export {
  buildStorageTankPorts,
  buildStorageTankProfileParts,
  STORAGE_TANK_CORE_PART_ROLES,
  STORAGE_TANK_EDITABLE_PARAMS,
  STORAGE_TANK_EDITABLE_PART_ROLES,
  STORAGE_TANK_PART_GROUPS,
  STORAGE_TANK_RECIPE_ID,
  storageTankRecipe,
} from './recipes/tank-recipe'
export {
  buildControlRoomPorts,
  buildControlRoomProfileParts,
  buildFiredHeaterPorts,
  buildFiredHeaterProfileParts,
  buildFlareStackPorts,
  buildFlareStackProfileParts,
  buildHorizontalVesselPorts,
  buildHorizontalVesselProfileParts,
  buildShellTubeExchangerPorts,
  buildShellTubeExchangerProfileParts,
  buildUtilityBoilerPorts,
  buildUtilityBoilerProfileParts,
  CONTROL_ROOM_CORE_PART_ROLES,
  CONTROL_ROOM_EDITABLE_PARAMS,
  CONTROL_ROOM_EDITABLE_PART_ROLES,
  CONTROL_ROOM_RECIPE_ID,
  controlRoomRecipe,
  FIRED_HEATER_CORE_PART_ROLES,
  FIRED_HEATER_EDITABLE_PARAMS,
  FIRED_HEATER_EDITABLE_PART_ROLES,
  FIRED_HEATER_RECIPE_ID,
  firedHeaterRecipe,
  FLARE_STACK_CORE_PART_ROLES,
  FLARE_STACK_EDITABLE_PARAMS,
  FLARE_STACK_EDITABLE_PART_ROLES,
  FLARE_STACK_RECIPE_ID,
  flareStackRecipe,
  HORIZONTAL_VESSEL_CORE_PART_ROLES,
  HORIZONTAL_VESSEL_EDITABLE_PARAMS,
  HORIZONTAL_VESSEL_EDITABLE_PART_ROLES,
  HORIZONTAL_VESSEL_RECIPE_ID,
  horizontalVesselRecipe,
  SHELL_TUBE_EXCHANGER_CORE_PART_ROLES,
  SHELL_TUBE_EXCHANGER_EDITABLE_PARAMS,
  SHELL_TUBE_EXCHANGER_EDITABLE_PART_ROLES,
  SHELL_TUBE_EXCHANGER_RECIPE_ID,
  shellTubeExchangerRecipe,
  UTILITY_BOILER_CORE_PART_ROLES,
  UTILITY_BOILER_EDITABLE_PARAMS,
  UTILITY_BOILER_EDITABLE_PART_ROLES,
  UTILITY_BOILER_RECIPE_ID,
  utilityBoilerRecipe,
} from './recipes/utility-equipment-recipes'
export { tankDefinition } from './tank/definition'
export { buildTankFloorplan } from './tank/floorplan'
export { buildTankGeometry } from './tank/geometry'
export { tankParametrics } from './tank/parametrics'
export { factoryTankPorts } from './tank/ports'
export { FactoryTankNode, TankOrientation } from './tank/schema'
export {
  IndustryPackLoader,
  loadIndustryPackRecipes,
  registerIndustryPack,
  type IndustryPackLoaderOptions,
  type LoadedIndustryPack,
  type IndustryPackManifest,
  type Profile,
  type Layout,
  type LayoutStation,
  type Connections,
  type Connection,
  type GeneratorManifest,
  type GeneratorParamSchema,
  type GeneratorPort,
  type ComponentPackManifest,
} from './industry-pack-loader'
export {
  generatorParamsToZodSchema,
  generatorManifestToZodSchema,
  validateGeneratorParams,
  assertGeneratorParams,
  mergeParamsWithDefaults,
  clearParamSchemaCache,
} from './param-schema-converter'
