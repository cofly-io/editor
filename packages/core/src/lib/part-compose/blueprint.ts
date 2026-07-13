import { familySpecForParts, isAircraftIntent, partKinds } from './family'
import { normalizedPartKind } from './kind'
import { normalizedRoleToken } from './roles'
import { clamp, isBallValveIntent, isRegistryPartPlanInput, partInputDimensions } from './shared'
import type {
  PartBlueprintAssessment,
  PartComposeInput,
  PartComposeKind,
  PartComposePartInput,
  PartRequirementGroup,
  PartVisualAssessment,
  PrimitiveShapeInput,
} from './types'

export const singletonBlueprintParts = new Set<PartComposeKind>([
  'wheel_set',
  'tube_frame',
  'fork',
  'handlebar',
  'saddle',
  'chain_loop',
  'body_shell',
  'window_strip',
  'light_pair',
  'bar_pair',
])

export function dedupeSingletonBlueprintParts(
  parts: PartComposePartInput[],
): PartComposePartInput[] {
  const seen = new Set<PartComposeKind>()
  return parts.filter((part) => {
    const kind = normalizedPartKind(part)
    if (!kind || !singletonBlueprintParts.has(kind)) return true
    if (seen.has(kind)) return false
    seen.add(kind)
    return true
  })
}

export function hasAnyPart(present: PartComposeKind[], group: PartRequirementGroup): boolean {
  return group.anyOf.some((kind) => present.includes(kind))
}

export const aircraftRequiredPartKinds: PartComposeKind[] = [
  'aircraft_fuselage',
  'aircraft_wing',
  'aircraft_engine',
  'aircraft_vertical_stabilizer',
  'aircraft_horizontal_stabilizer',
  'aircraft_landing_gear',
]

export function isAircraftPartKind(kind: PartComposeKind): boolean {
  return (
    aircraftRequiredPartKinds.includes(kind) ||
    kind === 'streamlined_body' ||
    kind === 'lofted_panel' ||
    kind === 'airfoil_blade'
  )
}

export function aircraftDefaultParts(input: PartComposeInput): PartComposePartInput[] {
  const dimensions = partInputDimensions(input)
  const fuselageLength = clamp(dimensions.length ?? dimensions.depth, 1.12, 0.4, 20)
  const scale = fuselageLength / 1.12
  const fuselageWidth = clamp(dimensions.width ?? dimensions.diameter, 0.13 * scale, 0.04, 3)
  const fuselageHeight = clamp(dimensions.height, 0.145 * scale, 0.04, 3)
  const gearRadius = clamp(undefined, 0.035 * scale, 0.012, 0.2)
  const engineRadius = clamp(undefined, 0.032 * scale, 0.018, 0.34)
  const verticalTailHeight = clamp(undefined, 0.21 * scale, 0.04, 1.15)
  const fuselageCenterY = gearRadius * 3.8 + fuselageHeight * 0.6
  const wingY = fuselageCenterY - fuselageHeight * 0.18
  const engineY = wingY - Math.max(engineRadius * 1.1, fuselageHeight * 0.22)
  const verticalTailY = fuselageCenterY + fuselageHeight * 0.48
  const horizontalTailY = verticalTailY + verticalTailHeight * 0.46
  const gearY = gearRadius * 1.08

  return [
    {
      kind: 'aircraft_fuselage',
      id: 'fuselage',
      name: 'Boeing 717 fuselage',
      position: [0, fuselageCenterY, 0],
      length: fuselageLength,
      width: fuselageWidth,
      height: fuselageHeight,
      primaryColor: input.primaryColor ?? '#f8fafc',
      accentColor: input.accentColor ?? '#0f8fb3',
      noseRoundness: 0.42,
      count: 14,
    },
    {
      kind: 'aircraft_wing',
      id: 'main-wings',
      name: 'low mounted swept wings',
      position: [0.02 * scale, wingY, 0],
      length: 0.95 * scale,
      width: 0.14 * scale,
      thickness: 0.009 * scale,
      bladeSweep: 0.18,
    },
    {
      kind: 'aircraft_engine',
      id: 'underwing-engines',
      name: 'underwing turbofan engines',
      position: [0.08 * scale, engineY, 0],
      length: 0.16 * scale,
      radius: engineRadius,
      width: 0.36 * scale,
    },
    {
      kind: 'aircraft_vertical_stabilizer',
      id: 'vertical-stabilizer',
      name: 'swept vertical fin',
      position: [-0.48 * scale, verticalTailY, 0],
      length: 0.18 * scale,
      height: verticalTailHeight,
      width: 0.018 * scale,
    },
    {
      kind: 'aircraft_horizontal_stabilizer',
      id: 't-tail',
      name: 'T-tail horizontal stabilizer',
      position: [-0.53 * scale, horizontalTailY, 0],
      length: 0.3 * scale,
      width: 0.07 * scale,
      thickness: 0.008 * scale,
    },
    {
      kind: 'aircraft_landing_gear',
      id: 'landing-gear',
      name: 'tricycle landing gear',
      position: [0.02 * scale, gearY, 0],
      length: 0.62 * scale,
      width: 0.32 * scale,
      radius: gearRadius,
    },
  ]
}

export function requestedDetails(input: PartComposeInput): boolean {
  const text = `${input.name ?? ''}`.toLowerCase()
  return /(detail|detailed|realistic|真实|细节|精细|铭牌|警示|螺栓|接缝|散热|label|nameplate|warning|bolt|seam)/i.test(
    text,
  )
}

export function assessPartVisualDetails(input: PartComposeInput = {}): PartVisualAssessment {
  const present = partKinds(input.parts ?? [])
  const blueprint = assessPartBlueprint(input)
  const detailSet = new Set<PartComposeKind>([
    ...blueprint.recommendedDetails,
    'nameplate',
    'warning_label',
    'seam_ring',
    'bolt_pattern',
    'vent_slats',
  ])

  const familySpecific: Partial<Record<PartBlueprintAssessment['family'], PartComposeKind[]>> = {
    pump: ['impeller_blades', 'nameplate', 'warning_label', 'flange_ring'],
    fan: ['control_knob', 'protective_grill'],
    conveyor: ['ribbed_motor_body', 'warning_label'],
    vehicle: ['window_strip', 'light_pair', 'bar_pair', 'seam_ring'],
    valve: ['flange_ring', 'handwheel'],
    bicycle: ['chain_loop'],
    desk: ['drawer_stack'],
    pipe_system: ['pipe_elbow', 'flange_ring', 'valve_body'],
    electrical: ['cable_tray', 'nameplate', 'warning_label', 'vent_slats'],
    aircraft: [
      'aircraft_fuselage',
      'aircraft_wing',
      'aircraft_engine',
      'aircraft_vertical_stabilizer',
      'aircraft_horizontal_stabilizer',
      'aircraft_landing_gear',
    ],
  }

  for (const kind of familySpecific[blueprint.family] ?? []) detailSet.add(kind)

  const expected = Array.from(detailSet)
  const missingDetails = expected.filter((kind) => !present.includes(kind))
  const presentDetails = expected.filter((kind) => present.includes(kind))
  const score =
    expected.length === 0 ? 1 : Number((presentDetails.length / expected.length).toFixed(4))
  return {
    family: blueprint.family,
    score,
    presentDetails,
    missingDetails,
    recommendations: missingDetails.map((kind) => `Add visual detail ${kind}.`),
  }
}

export function enhancePartBlueprintWithVisualDetails(
  parts: PartComposePartInput[],
  input: PartComposeInput,
): PartComposePartInput[] {
  if (isRegistryPartPlanInput(input)) return parts
  if (input.autoComplete === false) return parts
  if (input.enhanceVisualDetails === false) return parts
  const shouldEnhance = input.enhanceVisualDetails === true || requestedDetails(input)
  if (!shouldEnhance) return parts

  const completed = [...parts]
  const present = () => partKinds(completed)
  const has = (kind: PartComposeKind) => present().includes(kind)
  const addIfMissing = (part: PartComposePartInput) => {
    const kind = normalizedPartKind(part)
    if (kind && !has(kind)) completed.push(part)
  }
  const spec = familySpecForParts(present())
  if (spec.family === 'vehicle' && isAircraftIntent(input)) return parts

  switch (spec.family) {
    case 'pump':
      addIfMissing({
        kind: 'impeller_blades',
        position: [0.22, 0.55, 0.24],
        count: 7,
        radius: 0.14,
      })
      addIfMissing({ kind: 'nameplate', position: [-0.28, 0.5, 0.19] })
      addIfMissing({ kind: 'warning_label', position: [0.04, 0.62, 0.22] })
      break
    case 'fan':
      addIfMissing({ kind: 'control_knob' })
      break
    case 'conveyor':
      addIfMissing({
        kind: 'ribbed_motor_body',
        position: [0.72, 0.5, 0.36],
        radius: 0.08,
        length: 0.24,
      })
      addIfMissing({ kind: 'warning_label', position: [0, 0.6, 0.24] })
      break
    case 'vehicle':
      addIfMissing({ kind: 'seam_ring', axis: 'x', radius: 0.18 })
      addIfMissing({ kind: 'nameplate', position: [-0.42, 0.36, 0.28], length: 0.12, width: 0.05 })
      break
    case 'valve':
      addIfMissing({
        kind: 'flange_ring',
        connectTo: 'valve_body',
        connectPoint: 'inlet',
        childPoint: 'back',
        axis: 'x',
        radius: 0.12,
      })
      break
    case 'desk':
      addIfMissing({ kind: 'drawer_stack' })
      break
    case 'pipe_system':
      addIfMissing({ kind: 'pipe_elbow', position: [0.55, 0.55, 0], radius: 0.055 })
      addIfMissing({
        kind: 'flange_ring',
        connectTo: 'pipe_run',
        connectPoint: 'open',
        childPoint: 'back',
        axis: 'x',
        radius: 0.09,
      })
      break
    case 'electrical':
      addIfMissing({ kind: 'cable_tray', position: [0, 1.08, -0.32], length: 1.1 })
      addIfMissing({ kind: 'nameplate', position: [-0.12, 0.36, 0.13], length: 0.16, width: 0.05 })
      addIfMissing({
        kind: 'warning_label',
        position: [-0.12, 0.7, 0.13],
        length: 0.13,
        width: 0.06,
      })
      break
  }

  return completed
}

export function assessPartBlueprint(input: PartComposeInput = {}): PartBlueprintAssessment {
  const present = partKinds(input.parts ?? [])
  const spec = familySpecForParts(present)
  const required = spec.required.map(
    (requirement) => requirement.defaultPart.kind as PartComposeKind,
  )
  const missing = spec.required
    .filter((requirement) => !hasAnyPart(present, requirement))
    .map((requirement) => requirement.defaultPart.kind as PartComposeKind)
  const recommendedDetails = spec.recommendedDetails.map(
    (requirement) => requirement.defaultPart.kind as PartComposeKind,
  )
  const missingDetails = spec.recommendedDetails
    .filter((requirement) => !hasAnyPart(present, requirement))
    .map((requirement) => requirement.defaultPart.kind as PartComposeKind)
  const requiredScore =
    spec.required.length === 0 ? 1 : (spec.required.length - missing.length) / spec.required.length
  const detailScore =
    spec.recommendedDetails.length === 0
      ? 1
      : (spec.recommendedDetails.length - missingDetails.length) / spec.recommendedDetails.length
  const score = Number((requiredScore * 0.82 + detailScore * 0.18).toFixed(4))
  const recommendations = [
    ...missing.map((kind) => `Add required ${kind}.`),
    ...missingDetails.map((kind) => `Consider adding detail ${kind}.`),
  ]
  return {
    family: spec.family,
    required,
    present,
    missing,
    optional: spec.optional,
    recommendedDetails,
    missingDetails,
    score,
    recommendations,
  }
}

export function completePartBlueprint(
  parts: PartComposePartInput[],
  autoComplete: boolean | undefined,
  input: PartComposeInput,
): PartComposePartInput[] {
  const completed = dedupeSingletonBlueprintParts(parts)
  const ballValve =
    isBallValveIntent(input) || completed.some((part) => isBallValveIntent(input, part))
  const tuneValveDefaults = () => {
    if (!ballValve) return
    for (let i = 0; i < completed.length; i += 1) {
      const part = completed[i]
      if (!part) continue
      const kind = normalizedPartKind(part)
      if (kind === 'valve_body' && !part.valveStyle && !part.style && !part.variant) {
        completed[i] = { ...part, valveStyle: 'ball' }
      }
      if (kind === 'handwheel' && !part.handleStyle && !part.style && !part.variant) {
        completed[i] = { ...part, handleStyle: 'lever' }
      }
    }
  }
  if (isRegistryPartPlanInput(input)) {
    tuneValveDefaults()
    return completed
  }
  if (autoComplete === false) return completed

  if (isAircraftIntent(input)) {
    const present = partKinds(completed)
    const hasSpecificAircraftPart = present.some(
      (kind) => aircraftRequiredPartKinds.includes(kind) || kind === 'aircraft_landing_gear',
    )
    const hasGenericAircraftPart = present.some(isAircraftPartKind)
    const defaults = aircraftDefaultParts(input)
    if (!hasGenericAircraftPart) {
      completed.push(...defaults)
    } else if (hasSpecificAircraftPart) {
      for (let index = 0; index < completed.length; index += 1) {
        const part = completed[index]
        if (!part) continue
        const kind = normalizedPartKind(part)
        const defaultPart = defaults.find((candidate) => normalizedPartKind(candidate) === kind)
        if (defaultPart) completed[index] = { ...defaultPart, ...part }
      }
      const refreshedPresent = partKinds(completed)
      for (const defaultPart of defaults) {
        const defaultKind = normalizedPartKind(defaultPart)
        if (
          defaultKind &&
          aircraftRequiredPartKinds.includes(defaultKind) &&
          !refreshedPresent.includes(defaultKind)
        ) {
          completed.push(defaultPart)
        }
      }
    }
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const present = partKinds(completed)
    const spec = familySpecForParts(present)
    if (spec.family === 'unknown') break
    if (spec.family === 'vehicle' && isAircraftIntent(input)) break

    for (const requirement of spec.required) {
      if (!hasAnyPart(present, requirement)) completed.push(requirement.defaultPart)
    }
  }
  tuneValveDefaults()

  const completedKinds = partKinds(completed)
  const completedFlangeCount = completed.filter(
    (part) => normalizedPartKind(part) === 'flange_ring',
  ).length
  if (familySpecForParts(completedKinds).family === 'valve' && completedFlangeCount < 2) {
    if (completedFlangeCount === 0) {
      completed.push(
        {
          id: 'flange_inlet',
          name: 'flange_inlet',
          kind: 'flange_ring',
          connectTo: 'valve_body',
          connectPoint: 'inlet',
          childPoint: 'front',
          axis: 'x',
          radius: 0.14,
        },
        {
          id: 'flange_outlet',
          name: 'flange_outlet',
          kind: 'flange_ring',
          connectTo: 'valve_body',
          connectPoint: 'outlet',
          childPoint: 'back',
          axis: 'x',
          radius: 0.14,
        },
      )
    } else {
      completed.push({
        id: 'flange_outlet',
        name: 'flange_outlet',
        kind: 'flange_ring',
        connectTo: 'valve_body',
        connectPoint: 'outlet',
        childPoint: 'back',
        axis: 'x',
        radius: 0.14,
      })
    }
  }

  return completed
}

export function semanticRoleForPartShape(
  kind: PartComposeKind,
  shape: PrimitiveShapeInput,
): string {
  const name = shape.name?.toLowerCase() ?? ''

  switch (kind) {
    case 'body_shell':
      if (name.includes('body shell')) return 'vehicle_body'
      if (name.includes('cabin')) return 'vehicle_cabin'
      if (name.includes('pillar')) return 'vehicle_pillar'
      if (name.includes('roof')) return 'vehicle_roof'
      if (name.includes('deck')) return 'vehicle_deck'
      if (name.includes('rocker')) return 'vehicle_rocker'
      return 'vehicle_body_detail'
    case 'wheel_set':
    case 'wheel':
      if (name.includes('bicycle') && name.includes('tire')) return 'bicycle_tire'
      if ((name.includes('vehicle') || name.includes('car')) && name.includes('tire'))
        return 'vehicle_tire'
      if (name.includes('tire')) return 'wheel_tire'
      if (name.includes('hub')) return 'wheel_hub'
      return 'wheel_detail'
    case 'window_panel':
      return name.includes('vehicle') ? 'vehicle_window' : 'window_panel'
    case 'window_strip':
      return name.includes('vehicle') ? 'vehicle_window' : 'window_panel'
    case 'light_pair':
      return 'headlight'
    case 'pyramid':
      return 'pyramid'
    case 'hemisphere':
      return 'hemisphere'
    case 'chimney_stack':
      if (name.includes('base')) return 'chimney_base'
      if (name.includes('rim')) return 'chimney_top_rim'
      if (name.includes('seam')) return 'chimney_seam_ring'
      if (name.includes('warning band')) return 'chimney_warning_band'
      if (name.includes('door')) return 'access_door'
      return 'chimney_body'
    case 'bar_pair':
      if (name.includes('front')) return 'front_bumper'
      if (name.includes('rear')) return 'rear_bumper'
      return 'bumper'
    case 'tube_frame':
      return name.includes('bicycle') || name.includes('bike') ? 'bicycle_frame' : 'tube_frame'
    case 'fork':
      return name.includes('bicycle') || name.includes('bike') ? 'bicycle_fork' : 'fork'
    case 'handlebar':
      return 'handlebar'
    case 'saddle':
      return 'saddle'
    case 'chain_loop':
      return 'chain_loop'
    case 'radial_blades':
      return name.includes('blade root') ? 'fan_blade_root' : 'fan_blade'
    case 'fan_blade':
      return name.includes('hub') ? 'fan_hub' : 'fan_blade'
    case 'propeller_blade_set':
      if (name.includes('hub')) return 'propeller_hub'
      return 'propeller_blade'
    case 'mixer_blades':
      if (name.includes('root')) return 'mixer_blade_root'
      if (name.includes('tip') || name.includes('edge')) return 'mixer_blade_edge'
      return 'mixer_blade'
    case 'airfoil_blade':
      if (name.includes('hub')) return 'airfoil_hub'
      return 'airfoil_blade'
    case 'ellipsoid_shell':
      if (name.includes('top access')) return 'ellipsoid_shell_top_opening'
      if (name.includes('opening')) return 'ellipsoid_shell_opening'
      if (name.includes('rim')) return 'ellipsoid_shell_rim'
      return 'ellipsoid_shell'
    case 'curved_lens_panel':
      if (name.includes('rim')) return 'lens_rim'
      return 'curved_lens'
    case 'ergonomic_shell':
      if (name.includes('button')) return 'mouse_button'
      if (name.includes('scroll')) return 'scroll_wheel'
      if (name.includes('nose')) return 'ergonomic_shell_nose'
      if (name.includes('tail')) return 'ergonomic_shell_tail'
      if (name.includes('base')) return 'ergonomic_shell_base'
      return 'ergonomic_shell'
    case 'aircraft_fuselage':
      if (name.includes('cockpit')) return 'cockpit_window'
      if (name.includes('window')) return 'cabin_window'
      if (name.includes('stripe')) return 'aircraft_livery_stripe'
      if (name.includes('nose')) return 'aircraft_nose'
      if (name.includes('tail')) return 'aircraft_tail'
      return 'aircraft_fuselage'
    case 'aircraft_wing':
      return 'aircraft_wing'
    case 'aircraft_engine':
      if (name.includes('fan')) return 'engine_fan'
      if (name.includes('intake')) return 'engine_intake'
      return 'engine_nacelle'
    case 'aircraft_vertical_stabilizer':
      return 'vertical_stabilizer'
    case 'aircraft_horizontal_stabilizer':
      return 'horizontal_stabilizer'
    case 'aircraft_landing_gear':
      if (name.includes('nose')) return 'aircraft_landing_gear_nose'
      if (name.includes('main')) return 'aircraft_landing_gear_main'
      return 'landing_gear_wheel'
    case 'generic_body':
      return name.includes('building')
        ? 'building_body'
        : name.includes('furniture')
          ? 'furniture_body'
          : 'main_body'
    case 'generic_base':
      return name.includes('cup') ? 'cup_platform' : 'support_base'
    case 'generic_panel':
      return 'panel'
    case 'generic_handle':
      return 'handle'
    case 'generic_spout':
      return 'spout'
    case 'generic_control_panel':
      return 'control_detail'
    case 'generic_display':
      return 'display'
    case 'generic_foot_set':
      return 'support_foot'
    case 'generic_opening':
      return 'opening'
    case 'generic_detail_accent':
      return 'detail_accent'
    case 'manway_lid':
      if (name.includes('gasket')) return 'manway_gasket'
      if (name.includes('handle')) return 'manway_handle'
      if (name.includes('bolt')) return 'manway_bolt'
      return 'manway_lid'
    case 'sanitary_nozzle':
      if (name.includes('bead')) return 'sanitary_clamp_bead'
      return 'sanitary_nozzle'
    case 'jacket_shell':
      if (name.includes('seam')) return 'jacket_seam'
      return 'jacket_shell'
    case 'sight_glass':
      if (name.includes('rim')) return 'sight_glass_rim'
      return 'sight_glass'
    case 'sample_valve':
      if (name.includes('handle')) return 'sample_valve_handle'
      if (name.includes('body')) return 'sample_valve_body'
      return 'sample_valve'
    case 'instrument_port':
      if (name.includes('gauge')) return 'instrument_gauge'
      return 'instrument_port'
    case 'stainless_highlight_panel':
      return 'stainless_highlight_panel'
    case 'mobile_platform_chassis':
      if (name.includes('skirt')) return 'lower_bumper_skirt'
      if (name.includes('deck')) return 'cargo_platform'
      if (name.includes('status')) return 'status_light_strip'
      return 'vehicle_body'
    case 'lidar_sensor':
      return name.includes('lens') ? 'sensor_lens' : 'navigation_sensor'
    case 'emergency_stop_button':
      if (name.includes('base')) return 'emergency_stop_base'
      if (name.includes('guard')) return 'emergency_stop_guard'
      return 'emergency_stop_button'
    case 'status_light_strip':
      return 'status_light_strip'
    case 'operator_panel':
      if (name.includes('screen')) return 'display_screen'
      if (name.includes('button')) return 'control_button'
      return 'control_panel'
    case 'guard_fence':
      if (name.includes('post')) return 'guard_fence_post'
      return 'safety_barrier'
    case 'pallet_table':
      if (name.includes('leg')) return 'support_leg'
      return 'pallet_table'
    case 'bearing_block':
      if (name.includes('base')) return 'bearing_base'
      if (name.includes('ring')) return 'bearing_ring'
      if (name.includes('bore')) return 'bearing_bore'
      if (name.includes('bolt')) return 'mounting_bolt'
      return 'bearing_block'
    case 'structural_tower_frame':
      if (name.includes('platform')) return 'multi_level_platform'
      if (name.includes('rail')) return 'platform_guard_rail'
      if (name.includes('internal stair flight')) return 'internal_stair_flight'
      if (name.includes('internal stair landing')) return 'internal_stair_landing'
      if (name.includes('stair flight')) return 'external_stair_flight'
      if (name.includes('stair landing')) return 'external_stair_landing'
      if (name.includes('diagonal') || name.includes('cross brace')) return 'tower_diagonal_brace'
      if (name.includes('ladder')) return 'access_ladder'
      if (name.includes('column')) return 'tower_column'
      if (name.includes('beam')) return 'tower_beam'
      return 'preheater_tower_body'
    case 'cyclone_separator_unit':
      if (name.includes('hopper') || name.includes('cone')) return 'cyclone_cone'
      if (name.includes('outlet')) return 'cyclone_top_outlet'
      if (name.includes('inlet') || name.includes('duct')) return 'preheater_gas_duct'
      if (name.includes('drop pipe')) return 'meal_drop_pipe'
      if (name.includes('band')) return 'cyclone_connection_band'
      return 'preheater_cyclone'
    case 'coupling_guard':
      if (name.includes('flange')) return 'guard_end_flange'
      return 'coupling_guard'
    case 'motor_gearbox_unit':
      if (name.includes('motor')) return 'drive_motor'
      if (name.includes('shaft')) return 'output_shaft'
      if (name.includes('rib')) return 'motor_cooling_rib'
      return 'gearbox_body'
    case 'pipe_manifold':
      if (name.includes('branch')) return 'manifold_branch'
      return 'pipe_manifold'
    case 'hopper_body':
      if (name.includes('outlet')) return 'hopper_outlet'
      if (name.includes('leg')) return 'hopper_support_leg'
      return 'hopper_body'
    case 'conical_hopper':
      if (name.includes('outlet')) return 'hopper_outlet_collar'
      if (name.includes('leg')) return 'support_leg'
      return 'conical_hopper'
    case 'service_platform':
      if (name.includes('post')) return 'platform_post'
      if (name.includes('rail')) return 'guard_rail'
      if (name.includes('ladder')) return 'access_ladder'
      return 'service_platform'
    case 'platform_with_ladder':
      if (name.includes('rung')) return 'ladder_rung'
      if (name.includes('side rail')) return 'ladder_side_rail'
      if (name.includes('post')) return 'platform_post'
      if (name.includes('rail')) return 'guard_rail'
      if (name.includes('ladder')) return 'access_ladder'
      return 'service_platform'
    case 'kiosk_body':
      return 'kiosk_body'
    case 'kiosk_roof':
      return 'roof'
    case 'kiosk_opening':
      return 'opening'
    case 'kiosk_counter':
      return 'service_counter'
    case 'kiosk_sign':
      return 'sign_panel'
    case 'kiosk_awning':
      return 'awning'
    case 'streamlined_body':
      if (name.includes('nose')) return 'streamlined_nose'
      if (name.includes('tail')) return 'streamlined_tail'
      if (name.includes('roof')) return 'streamlined_roof_arc'
      return 'streamlined_body'
    case 'lofted_panel':
      if (name.includes('root')) return 'lofted_panel_root'
      if (name.includes('tip')) return 'lofted_panel_tip'
      if (name.includes('seam')) return 'lofted_panel_section'
      return 'lofted_panel_segment'
    case 'protective_grill':
      return 'protective_grill'
    case 'volute_casing':
      return 'volute_casing'
    case 'inlet_port':
      return 'inlet_port'
    case 'outlet_port':
      return 'outlet_port'
    case 'flange_ring':
      if (name.includes('flange_inlet') || name.includes('inlet')) {
        if (name.includes('gasket')) return 'flange_gasket'
        return name.includes('bolt') ? 'flange_inlet_bolt' : 'flange_inlet'
      }
      if (name.includes('flange_outlet') || name.includes('outlet')) {
        if (name.includes('gasket')) return 'flange_gasket'
        return name.includes('bolt') ? 'flange_outlet_bolt' : 'flange_outlet'
      }
      return name.includes('bolt') ? 'flange_bolt' : 'flange_ring'
    case 'flanged_nozzle':
      if (name.includes('flange'))
        return name.includes('bolt') ? 'nozzle_flange_bolt' : 'nozzle_flange'
      if (name.includes('neck')) return 'flanged_nozzle'
      return 'flanged_nozzle'
    case 'inspection_hatch':
      if (name.includes('hinge')) return 'hatch_hinge'
      if (name.includes('handle')) return 'hatch_handle'
      return 'inspection_hatch'
    case 'valve_body':
      if (name.includes('seat ring')) return 'seat_ring'
      if (name.includes('ball bore')) return 'valve_bore'
      if (name.includes('valve ball')) return 'valve_ball'
      if (name.includes('bonnet bolt')) return 'bonnet_bolts'
      if (name.includes('bonnet')) return 'bonnet'
      if (name.includes('stem')) return 'stem'
      if (name.includes('gate wedge')) return 'gate_wedge'
      if (name.includes('yoke')) return 'yoke'
      return 'valve_body'
    case 'cylindrical_tank':
      if (name.includes('nozzle')) return 'inlet_port'
      if (name.includes('dished end')) return 'vessel_head'
      return 'vessel_shell'
    case 'liquid_volume':
      return 'liquid_volume'
    case 'agitator_tank':
      if (name.includes('motor')) return 'agitator_motor'
      if (name.includes('shaft')) return 'agitator_shaft'
      if (name.includes('hub')) return 'reactor_impeller_hub'
      if (name.includes('blade')) return 'reactor_impeller'
      return 'reactor_vessel_shell'
    case 'heat_exchanger':
      if (name.includes('top nozzle')) return 'inlet_port'
      if (name.includes('bottom nozzle')) return 'outlet_port'
      if (name.includes('tube bundle')) return 'tube_bundle'
      if (name.includes('channel head')) return 'heat_exchanger_channel_head'
      return 'heat_exchanger_shell'
    default:
      return kind
  }
}

export function shouldPreferPartShapeRole(
  kind: PartComposeKind,
  partRole: string,
  inferredRole: string,
): boolean {
  if (!partRole || partRole === inferredRole) return false
  switch (kind) {
    case 'tube_frame':
      return (
        inferredRole === 'bicycle_frame' &&
        ['frame', 'bike_frame', 'bicycle', 'bike', 'complete_bicycle'].includes(partRole)
      )
    case 'fork':
      return (
        inferredRole === 'bicycle_fork' &&
        ['fork', 'front_fork', 'bike_fork', 'bicycle', 'bike', 'complete_bicycle'].includes(
          partRole,
        )
      )
    case 'handlebar':
      return [
        'bike_handlebar',
        'bike_handlebars',
        'bicycle_handlebar',
        'bicycle_handlebars',
      ].includes(partRole)
    case 'saddle':
      return [
        'seat',
        'bike_seat',
        'bicycle_seat',
        'bike_saddle',
        'bicycle_saddle',
        'bicycle',
        'bike',
      ].includes(partRole)
    case 'chain_loop':
      return [
        'chain',
        'bicycle_chain',
        'crank',
        'bicycle_crank',
        'chainring',
        'bicycle_chainring',
        'pedal',
        'pedals',
        'bicycle_pedals',
      ].includes(partRole)
    case 'cylindrical_tank':
    case 'agitator_tank':
    case 'heat_exchanger':
      return true
    default:
      return false
  }
}

export function semanticRoleForTaggedPartShape(
  kind: PartComposeKind,
  shape: PrimitiveShapeInput,
  part: PartComposePartInput,
): string {
  const inferredRole = semanticRoleForPartShape(kind, shape)
  const partRole = normalizedRoleToken(part.semanticRole)
  if (shouldPreferPartShapeRole(kind, partRole, inferredRole)) return inferredRole
  return partRole || inferredRole
}

export function tagGeneratedPartShapes(
  shapes: PrimitiveShapeInput[],
  startIndex: number,
  kind: PartComposeKind,
  part: PartComposePartInput,
  index: number,
) {
  const sourcePartId = part.id ?? part.name ?? part.partName ?? `${kind}-${index + 1}`
  for (let i = startIndex; i < shapes.length; i += 1) {
    const shape = shapes[i]
    if (!shape) continue
    shape.sourcePartKind ??= part.sourcePartKind ?? kind
    shape.sourcePartId ??= sourcePartId
    shape.semanticGroup ??= part.semanticGroup ?? sourcePartId
    shape.renderContract ??= part.renderContract
    shape.semanticRole ??=
      kind === 'body_shell'
        ? semanticRoleForPartShape(kind, shape)
        : semanticRoleForTaggedPartShape(kind, shape, part)
  }
}
