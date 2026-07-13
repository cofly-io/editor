import type { PrimitiveGeometryBrief, PrimitiveMaterialInput, Vec3 } from '../primitive-compose'

export type { FamilyId, LayoutFamilyId } from '../family-registry'
export type {
  PrimitiveGeometryBrief,
  PrimitiveMaterialInput,
  PrimitiveShapeInput,
  Vec3,
} from '../primitive-compose'

export type PartAxis = 'x' | 'y' | 'z'
export type PartSide = 'left' | 'right' | 'top' | 'bottom' | 'front' | 'back'
export type VehicleStyle = 'sedan' | 'suv' | 'sports' | 'van' | 'truck'

export type PartComposeKind =
  | 'circular_base'
  | 'vertical_pole'
  | 'motor_housing'
  | 'fan_blade'
  | 'radial_blades'
  | 'protective_grill'
  | 'pyramid'
  | 'hemisphere'
  | 'wheel'
  | 'wheel_set'
  | 'window_panel'
  | 'window_strip'
  | 'body_shell'
  | 'tube_frame'
  | 'fork'
  | 'light_pair'
  | 'bar_pair'
  | 'support_bracket'
  | 'control_knob'
  | 'vent_slats'
  | 'vent_grill'
  | 'skid_base'
  | 'rounded_machine_body'
  | 'volute_casing'
  | 'impeller_blades'
  | 'propeller_blade_set'
  | 'mixer_blades'
  | 'pipe_port'
  | 'inlet_port'
  | 'outlet_port'
  | 'flange_ring'
  | 'flanged_nozzle'
  | 'manway_lid'
  | 'inspection_hatch'
  | 'sanitary_nozzle'
  | 'jacket_shell'
  | 'sight_glass'
  | 'sample_valve'
  | 'instrument_port'
  | 'stainless_highlight_panel'
  | 'bolt_pattern'
  | 'control_box'
  | 'ribbed_motor_body'
  | 'conveyor_frame'
  | 'roller_array'
  | 'belt_surface'
  | 'cylindrical_tank'
  | 'storage_tank_shell'
  | 'cooling_tower_shell'
  | 'cooling_tower_rim'
  | 'chimney_stack'
  | 'liquid_volume'
  | 'valve_body'
  | 'handwheel'
  | 'bicycle_wheels'
  | 'bicycle_frame'
  | 'bicycle_fork'
  | 'handlebar'
  | 'saddle'
  | 'chain_loop'
  | 'vehicle_body'
  | 'vehicle_wheels'
  | 'vehicle_windows'
  | 'headlights'
  | 'bumper'
  | 'gearbox_body'
  | 'filter_vessel'
  | 'heat_exchanger'
  | 'agitator_tank'
  | 'pipe_rack'
  | 'platform_ladder'
  | 'desk_top'
  | 'leg_set'
  | 'drawer_stack'
  | 'electrical_cabinet'
  | 'pipe_run'
  | 'pipe_elbow'
  | 'cable_tray'
  | 'nameplate'
  | 'warning_label'
  | 'seam_ring'
  | 'airfoil_blade'
  | 'ellipsoid_shell'
  | 'curved_lens_panel'
  | 'ergonomic_shell'
  | 'streamlined_body'
  | 'lofted_panel'
  | 'aircraft_fuselage'
  | 'aircraft_wing'
  | 'aircraft_engine'
  | 'aircraft_vertical_stabilizer'
  | 'aircraft_horizontal_stabilizer'
  | 'aircraft_landing_gear'
  | 'generic_body'
  | 'generic_base'
  | 'generic_panel'
  | 'generic_handle'
  | 'generic_spout'
  | 'generic_control_panel'
  | 'generic_display'
  | 'generic_foot_set'
  | 'generic_opening'
  | 'generic_detail_accent'
  | 'mobile_platform_chassis'
  | 'lidar_sensor'
  | 'emergency_stop_button'
  | 'status_light_strip'
  | 'operator_panel'
  | 'guard_fence'
  | 'pallet_table'
  | 'bearing_block'
  | 'support_roller_pair'
  | 'structural_tower_frame'
  | 'helical_ladder'
  | 'helical_stair'
  | 'cyclone_separator_unit'
  | 'coupling_guard'
  | 'motor_gearbox_unit'
  | 'pipe_manifold'
  | 'hopper_body'
  | 'conical_hopper'
  | 'service_platform'
  | 'platform_with_ladder'
  | 'kiosk_body'
  | 'kiosk_roof'
  | 'kiosk_opening'
  | 'kiosk_counter'
  | 'kiosk_sign'
  | 'kiosk_awning'

export interface LoftedPanelSectionInput {
  width?: number
  height?: number
  length?: number
  x?: number
  y?: number
  z?: number
  topScale?: [number, number]
}

export type PartComposeDetail = 'low' | 'medium' | 'high'

export interface PartComposePartInput {
  kind?: PartComposeKind | string
  partType?: PartComposeKind | string
  type?: PartComposeKind | string
  id?: string
  name?: string
  partName?: string
  style?: string
  variant?: string
  detail?: PartComposeDetail | string
  detailLevel?: PartComposeDetail | string
  grillDetailLevel?: PartComposeDetail | string
  bottomStyle?: string
  legStyle?: string
  valveStyle?: string
  handleStyle?: string
  state?: string
  vehicleStyle?: VehicleStyle | string
  position?: Vec3
  rotation?: Vec3
  connectTo?: string | number
  attachToRole?: string
  connectPoint?: string
  childPoint?: string
  centeredOn?: string | number
  alignAbove?: string | number
  alignBeside?: string | number
  offsetFrom?: string | number
  offsetDirection?: PartSide | string
  offsetDistance?: number
  around?: string | number
  aroundIndex?: number
  aroundCount?: number
  aroundRadius?: number
  aroundAngle?: number
  aroundStartAngle?: number
  aroundAxis?: PartAxis | string
  cornerPattern?: boolean
  cornerInset?: number
  array?: { count?: number; axis?: PartAxis | string; spacing?: number }
  arrayAlong?: PartAxis | 'length' | 'width' | 'height' | string
  arrayAxis?: PartAxis | string
  arrayOffset?: number
  relationGap?: number
  anchor?: string
  childAnchor?: string
  axis?: PartAxis | string
  side?: PartSide | string
  offset?: Vec3 | number
  outletAngle?: number
  radius?: number
  baseRadius?: number
  waistRadius?: number
  majorRadius?: number
  tubeRadius?: number
  diameter?: number
  scale?: Vec3
  radiusTop?: number
  radiusBottom?: number
  outletRadius?: number
  flangeRadius?: number
  flangeThickness?: number
  bendRadius?: number
  dimensions?: Record<string, unknown>
  params?: Record<string, unknown>
  height?: number
  width?: number
  depth?: number
  domeDepth?: number
  length?: number
  thickness?: number
  sizeScale?: number
  cornerRadius?: number
  cornerSegments?: number
  count?: number
  portCount?: number
  doorCount?: number
  legCount?: number
  ringCount?: number
  rungCount?: number
  rollerLength?: number
  radialSegments?: number
  widthSegments?: number
  heightSegments?: number
  levelCount?: number
  bayCount?: number
  stageCount?: number
  stepCount?: number
  stairFlights?: number
  stairSide?: PartSide | string
  stairPlacement?: 'inside' | 'outside' | string
  externalStairs?: boolean
  innerRadius?: number
  outerRadius?: number
  sweepAngle?: number
  startAngle?: number
  railingHeight?: number
  includeDiagonalBraces?: boolean
  spokeCount?: number
  wireRadius?: number
  wheelRadius?: number
  wheelWidth?: number
  warningStripes?: boolean
  stripeCount?: number
  stripeHeight?: number
  frontX?: number
  rearX?: number
  frontZ?: number
  rearZ?: number
  overallHeight?: number
  bodyHeight?: number
  cabinHeight?: number
  roofCornerAngle?: number
  cabinTopScale?: number
  cabinTopLengthScale?: number
  cabinTopWidthScale?: number
  truncated?: boolean
  topScale?: number | [number, number]
  topLengthScale?: number
  topWidthScale?: number
  topRadius?: number
  topLength?: number
  topWidth?: number
  bladeRadius?: number
  hubRadius?: number
  bladeWidth?: number
  bladePitch?: number
  bladeSweep?: number
  bladeShape?: string
  rootWidth?: number
  tipWidth?: number
  twist?: number
  camber?: number
  verticalCurve?: number
  pitch?: number
  lensShape?: string
  curvature?: number
  shellThickness?: number
  openingRadius?: number
  cutBottom?: boolean
  noseSlope?: number
  tailSlope?: number
  sideTaper?: number
  noseRoundness?: number
  tailTaper?: number
  roofArc?: number
  sections?: LoftedPanelSectionInput[]
  slatCount?: number
  boltCount?: number
  includeBolts?: boolean
  includeSupportLegs?: boolean
  includeHub?: boolean
  material?: PrimitiveMaterialInput
  materialPreset?: string
  preset?: string
  semanticRole?: string
  semanticGroup?: string
  sourcePartKind?: string
  sourcePartId?: string
  renderContract?: unknown
  color?: string
  primaryColor?: string
  secondaryColor?: string
  metalColor?: string
  motorColor?: string
  rollerColor?: string
  darkColor?: string
  accentColor?: string
  opacity?: number
}

export interface PartComposeInput {
  name?: string
  partName?: string
  family?: string
  geometryBrief?: PrimitiveGeometryBrief
  position?: Vec3
  detail?: PartComposeDetail | string
  length?: number
  width?: number
  depth?: number
  height?: number
  diameter?: number
  radius?: number
  thickness?: number
  primaryColor?: string
  secondaryColor?: string
  metalColor?: string
  darkColor?: string
  accentColor?: string
  autoComplete?: boolean
  enhanceVisualDetails?: boolean
  registryPartPlan?: boolean
  __registryPartPlan?: boolean
  parts?: PartComposePartInput[]
}

export interface PartSpec {
  kind: PartComposeKind | string
  family?: string
  semanticRole?: string
  dimensions?: {
    length?: number
    width?: number
    depth?: number
    height?: number
    diameter?: number
    radius?: number
    thickness?: number
  }
  transform?: {
    position?: Vec3
    rotation?: Vec3
  }
  material?: PrimitiveMaterialInput
  color?: string
  attachTo?: string | number
  constraints?: Record<string, unknown>
}

export interface PartBlueprintAssessment {
  family:
    | 'fan'
    | 'pump'
    | 'conveyor'
    | 'bicycle'
    | 'vehicle'
    | 'valve'
    | 'desk'
    | 'pipe_system'
    | 'electrical'
    | 'aircraft'
    | 'unknown'
  required: PartComposeKind[]
  present: PartComposeKind[]
  missing: PartComposeKind[]
  optional: PartComposeKind[]
  recommendedDetails: PartComposeKind[]
  missingDetails: PartComposeKind[]
  score: number
  recommendations: string[]
}

export interface PartVisualAssessment {
  family: PartBlueprintAssessment['family']
  score: number
  presentDetails: PartComposeKind[]
  missingDetails: PartComposeKind[]
  recommendations: string[]
}

export interface PartRequirementGroup {
  label: string
  anyOf: PartComposeKind[]
  defaultPart: PartComposePartInput
}

export interface PartFamilySpec {
  family: PartBlueprintAssessment['family']
  required: PartRequirementGroup[]
  optional: PartComposeKind[]
  recommendedDetails: PartRequirementGroup[]
}
