import type { ProcessEquipmentContract } from './process-line-types'
import type { ProcessRouteObstacle } from './process-line-routing'

const NON_EQUIPMENT_ROUTE_OBSTACLE_STATION_IDS = new Set([
  'site_layout',
  'site_visual_layout',
  'visual_layout',
  'site_context',
  'main_pipe_rack',
  'pipe_rack',
])

const NON_EQUIPMENT_ROUTE_OBSTACLE_FAMILIES = new Set([
  'site_visual_context',
  'site_context',
  'visual_context',
  'landscape',
])

const NON_EQUIPMENT_ROUTE_OBSTACLE_ROLES = new Set([
  'site_ground',
  'site_visual_context',
  'site_context',
  'site_layout',
  'visual_layout',
  'process_area_pad',
  'green_buffer_lawn',
  'landscape_lawn',
  'trimmed_grass',
  'road_network',
  'tank_farm_containment',
  'main_pipe_rack_spine',
  'perimeter_fence',
  'street_light',
  'warning_beacon',
  'fire_hydrant',
  'parking_lot',
  'service_vehicle',
  'main_pipe_rack',
  'main_pipe_rack_spine',
  'pipe_rack',
  'pipe_rack_spine',
  'pipe_rack_support',
  'pipe_support',
])

function normalizedString(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : undefined
}

export function isFactoryVisualContextRouteObstacle(input: {
  metadata?: Record<string, unknown>
  routeObstacle?: Partial<ProcessRouteObstacle> | Record<string, unknown>
  stationId?: string
  stationRole?: string
  equipmentContract?: ProcessEquipmentContract
}) {
  const metadata = input.metadata ?? {}
  const routeObstacle = input.routeObstacle ?? {}

  const stationId =
    normalizedString(routeObstacle.stationId) ??
    normalizedString(metadata.stationId) ??
    normalizedString(input.stationId)
  if (stationId && NON_EQUIPMENT_ROUTE_OBSTACLE_STATION_IDS.has(stationId)) return true

  const family =
    normalizedString(input.equipmentContract?.equipmentFamily) ??
    normalizedString(metadata.family) ??
    normalizedString(metadata.equipmentFamily) ??
    normalizedString(metadata.profileFamily) ??
    normalizedString(metadata.factoryEquipmentFamily)
  if (family && NON_EQUIPMENT_ROUTE_OBSTACLE_FAMILIES.has(family)) return true

  const profileId =
    normalizedString(input.equipmentContract?.profileId) ??
    normalizedString(metadata.profileId) ??
    normalizedString(metadata.equipmentProfileId) ??
    normalizedString(metadata.factoryEquipmentProfileId)
  if (profileId?.includes('.site_visual_layout')) return true

  const role =
    normalizedString(input.equipmentContract?.primarySemanticRole) ??
    normalizedString(metadata.primarySemanticRole) ??
    normalizedString(metadata.semanticRole) ??
    normalizedString(metadata.equipmentRole) ??
    normalizedString(input.stationRole) ??
    normalizedString(metadata.stationRole) ??
    normalizedString(metadata.role)
  return Boolean(role && NON_EQUIPMENT_ROUTE_OBSTACLE_ROLES.has(role))
}
