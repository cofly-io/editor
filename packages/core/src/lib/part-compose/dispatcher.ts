import {
  completePartBlueprint,
  enhancePartBlueprintWithVisualDetails,
  tagGeneratedPartShapes,
} from './blueprint'
import {
  composeAgitatorTank,
  composeAircraftEngine,
  composeAircraftFuselage,
  composeAircraftHorizontalStabilizer,
  composeAircraftLandingGear,
  composeAircraftVerticalStabilizer,
  composeAircraftWing,
  composeAirfoilBlade,
  composeBearingBlock,
  composeBeltSurface,
  composeBicycleFork,
  composeBicycleFrame,
  composeBicycleWheels,
  composeBoltPattern,
  composeBumper,
  composeCableTray,
  composeChainLoop,
  composeChimneyStack,
  composeCircularBase,
  composeConicalHopper,
  composeControlBox,
  composeControlKnob,
  composeConveyorFrame,
  composeCoolingTowerRim,
  composeCoolingTowerShell,
  composeCouplingGuard,
  composeCurvedLensPanel,
  composeCycloneSeparatorUnit,
  composeCylindricalTank,
  composeDeskTop,
  composeDrawerStack,
  composeElectricalCabinet,
  composeEllipsoidShell,
  composeEmergencyStopButton,
  composeErgonomicShell,
  composeFanBladeArray,
  composeFilterVessel,
  composeFlangedNozzle,
  composeFlangeRing,
  composeGearboxBody,
  composeGenericBase,
  composeGenericBody,
  composeGenericFootSet,
  composeGenericHandle,
  composeGenericPanel,
  composeGenericSpout,
  composeGuardFence,
  composeHandlebar,
  composeHandwheel,
  composeHeadlights,
  composeHeatExchanger,
  composeHelicalStair,
  composeHemisphere,
  composeHopperBody,
  composeImpellerBlades,
  composeInspectionHatch,
  composeInstrumentPort,
  composeJacketShell,
  composeKioskAwning,
  composeKioskBody,
  composeKioskCounter,
  composeKioskOpening,
  composeKioskRoof,
  composeKioskSign,
  composeLegSet,
  composeLidarSensor,
  composeLiquidVolume,
  composeLoftedPanel,
  composeManwayLid,
  composeMixerBlades,
  composeMobilePlatformChassis,
  composeMotorGearboxUnit,
  composeMotorHousing,
  composeNameplate,
  composeOperatorPanel,
  composePalletTable,
  composePipeElbow,
  composePipeManifold,
  composePipePort,
  composePipeRack,
  composePipeRun,
  composePlatformLadder,
  composePlatformWithLadder,
  composePropellerBladeSet,
  composeProtectiveGrill,
  composePyramid,
  composeRadialBlades,
  composeRibbedMotorBody,
  composeRollerArray,
  composeRoundedMachineBody,
  composeSaddle,
  composeSampleValve,
  composeSanitaryNozzle,
  composeSeamRing,
  composeServicePlatform,
  composeSightGlass,
  composeSkidBase,
  composeStainlessHighlightPanel,
  composeStatusLightStrip,
  composeStorageTankShell,
  composeStreamlinedBody,
  composeStructuralTowerFrame,
  composeSupportBracket,
  composeSupportRollerPair,
  composeValveBody,
  composeVehicleBody,
  composeVentSlats,
  composeVerticalPole,
  composeVoluteCasing,
  composeWarningLabel,
  composeWheelSet,
  composeWindowPanel,
  composeWindowStrip,
  wheelTireRole,
} from './composers'
import { normalizedPartKind } from './kind'
import { resolveLayout } from './layout'
import { normalizedRoleToken } from './roles'
import {
  applyBicycleLayoutDefaults,
  applyContextualPartDefaults,
  applyMixerPartDefaults,
  applyVehicleLayoutDefaults,
  isCompleteBicycleParts,
  normalizePartComposeInput,
} from './shared'
import type { PartComposeInput, PrimitiveShapeInput } from './types'

export function composePartPrimitives(input: PartComposeInput = {}): PrimitiveShapeInput[] {
  input = normalizePartComposeInput(input)
  const origin = input.position ?? [0, 0, 0]
  const requestedParts = applyMixerPartDefaults(input.parts ?? [], input)
  const completedBlueprintParts = completePartBlueprint(requestedParts, input.autoComplete, input)
  const completedParts = applyContextualPartDefaults(
    applyBicycleLayoutDefaults(applyVehicleLayoutDefaults(completedBlueprintParts, input), input),
    input,
  )
  const detailedParts = applyMixerPartDefaults(
    enhancePartBlueprintWithVisualDetails(completedParts, input),
    input,
  )
  const parts = resolveLayout({
    parts: applyMixerPartDefaults(
      applyBicycleLayoutDefaults(
        applyContextualPartDefaults(applyVehicleLayoutDefaults(detailedParts, input), input),
        input,
      ),
      input,
    ),
  })
  const shapes: PrimitiveShapeInput[] = []

  parts.forEach((part, index) => {
    const kind = normalizedPartKind(part)
    if (!kind) return

    const startIndex = shapes.length
    switch (kind) {
      case 'circular_base':
        shapes.push(...composeCircularBase(input, part, origin, index))
        break
      case 'vertical_pole':
        shapes.push(...composeVerticalPole(input, part, origin, index))
        break
      case 'motor_housing':
        shapes.push(...composeMotorHousing(input, part, origin, index))
        break
      case 'fan_blade':
        shapes.push(...composeFanBladeArray(input, part, origin))
        break
      case 'radial_blades':
        shapes.push(...composeRadialBlades(input, part, origin))
        break
      case 'protective_grill':
        shapes.push(...composeProtectiveGrill(input, part, origin))
        break
      case 'pyramid':
        shapes.push(...composePyramid(input, part, origin))
        break
      case 'hemisphere':
        shapes.push(...composeHemisphere(input, part, origin))
        break
      case 'support_bracket':
        shapes.push(...composeSupportBracket(input, part, origin))
        break
      case 'control_knob':
        shapes.push(...composeControlKnob(input, part, origin, index))
        break
      case 'vent_slats':
      case 'vent_grill':
        shapes.push(...composeVentSlats(input, part, origin, kind))
        break
      case 'skid_base':
        shapes.push(...composeSkidBase(input, part, origin))
        break
      case 'rounded_machine_body':
        shapes.push(...composeRoundedMachineBody(input, part, origin))
        break
      case 'volute_casing':
        shapes.push(...composeVoluteCasing(input, part, origin))
        break
      case 'impeller_blades':
        shapes.push(...composeImpellerBlades(input, part, origin))
        break
      case 'propeller_blade_set':
        shapes.push(...composePropellerBladeSet(input, part, origin))
        break
      case 'mixer_blades':
        shapes.push(...composeMixerBlades(input, part, origin))
        break
      case 'airfoil_blade':
        shapes.push(...composeAirfoilBlade(input, part, origin))
        break
      case 'ellipsoid_shell':
        shapes.push(...composeEllipsoidShell(input, part, origin))
        break
      case 'curved_lens_panel':
        shapes.push(...composeCurvedLensPanel(input, part, origin))
        break
      case 'ergonomic_shell':
        shapes.push(...composeErgonomicShell(input, part, origin))
        break
      case 'streamlined_body':
        shapes.push(...composeStreamlinedBody(input, part, origin))
        break
      case 'aircraft_fuselage':
        shapes.push(...composeAircraftFuselage(input, part, origin))
        break
      case 'aircraft_wing':
        shapes.push(...composeAircraftWing(input, part, origin))
        break
      case 'aircraft_engine':
        shapes.push(...composeAircraftEngine(input, part, origin))
        break
      case 'aircraft_vertical_stabilizer':
        shapes.push(...composeAircraftVerticalStabilizer(input, part, origin))
        break
      case 'aircraft_horizontal_stabilizer':
        shapes.push(...composeAircraftHorizontalStabilizer(input, part, origin))
        break
      case 'aircraft_landing_gear':
        shapes.push(...composeAircraftLandingGear(input, part, origin))
        break
      case 'generic_body':
        shapes.push(...composeGenericBody(input, part, origin))
        break
      case 'generic_base':
        shapes.push(...composeGenericBase(input, part, origin))
        break
      case 'generic_panel':
      case 'generic_control_panel':
      case 'generic_display':
      case 'generic_opening':
      case 'generic_detail_accent':
        shapes.push(...composeGenericPanel(input, part, origin, kind))
        break
      case 'generic_handle':
        shapes.push(...composeGenericHandle(input, part, origin))
        break
      case 'generic_spout':
        shapes.push(...composeGenericSpout(input, part, origin))
        break
      case 'generic_foot_set':
        shapes.push(...composeGenericFootSet(input, part, origin))
        break
      case 'mobile_platform_chassis':
        shapes.push(...composeMobilePlatformChassis(input, part, origin))
        break
      case 'lidar_sensor':
        shapes.push(...composeLidarSensor(input, part, origin))
        break
      case 'emergency_stop_button':
        shapes.push(...composeEmergencyStopButton(input, part, origin))
        break
      case 'status_light_strip':
        shapes.push(...composeStatusLightStrip(input, part, origin))
        break
      case 'operator_panel':
        shapes.push(...composeOperatorPanel(input, part, origin))
        break
      case 'guard_fence':
        shapes.push(...composeGuardFence(input, part, origin))
        break
      case 'pallet_table':
        shapes.push(...composePalletTable(input, part, origin))
        break
      case 'bearing_block':
        shapes.push(...composeBearingBlock(input, part, origin))
        break
      case 'support_roller_pair':
        shapes.push(...composeSupportRollerPair(input, part, origin))
        break
      case 'structural_tower_frame':
        shapes.push(...composeStructuralTowerFrame(input, part, origin))
        break
      case 'helical_ladder':
      case 'helical_stair':
        shapes.push(...composeHelicalStair(input, part, origin))
        break
      case 'cyclone_separator_unit':
        shapes.push(...composeCycloneSeparatorUnit(input, part, origin))
        break
      case 'coupling_guard':
        shapes.push(...composeCouplingGuard(input, part, origin))
        break
      case 'motor_gearbox_unit':
        shapes.push(...composeMotorGearboxUnit(input, part, origin))
        break
      case 'pipe_manifold':
        shapes.push(...composePipeManifold(input, part, origin))
        break
      case 'hopper_body':
        shapes.push(...composeHopperBody(input, part, origin))
        break
      case 'conical_hopper':
        shapes.push(...composeConicalHopper(input, part, origin))
        break
      case 'service_platform':
        shapes.push(...composeServicePlatform(input, part, origin))
        break
      case 'platform_with_ladder':
        shapes.push(...composePlatformWithLadder(input, part, origin))
        break
      case 'kiosk_body':
        shapes.push(...composeKioskBody(input, part, origin))
        break
      case 'kiosk_roof':
        shapes.push(...composeKioskRoof(input, part, origin))
        break
      case 'kiosk_opening':
        shapes.push(...composeKioskOpening(input, part, origin))
        break
      case 'kiosk_counter':
        shapes.push(...composeKioskCounter(input, part, origin))
        break
      case 'kiosk_sign':
        shapes.push(...composeKioskSign(input, part, origin))
        break
      case 'kiosk_awning':
        shapes.push(...composeKioskAwning(input, part, origin))
        break
      case 'lofted_panel':
        shapes.push(...composeLoftedPanel(input, part, origin))
        break
      case 'pipe_port':
        shapes.push(...composePipePort(input, part, origin, 'pipe_port'))
        break
      case 'inlet_port':
        shapes.push(...composePipePort(input, part, origin, 'inlet_port'))
        break
      case 'outlet_port':
        shapes.push(...composePipePort(input, part, origin, 'outlet_port'))
        break
      case 'flange_ring':
        shapes.push(...composeFlangeRing(input, part, origin))
        break
      case 'flanged_nozzle':
        shapes.push(...composeFlangedNozzle(input, part, origin))
        break
      case 'manway_lid':
        shapes.push(...composeManwayLid(input, part, origin))
        break
      case 'inspection_hatch':
        shapes.push(...composeInspectionHatch(input, part, origin))
        break
      case 'sanitary_nozzle':
        shapes.push(...composeSanitaryNozzle(input, part, origin))
        break
      case 'jacket_shell':
        shapes.push(...composeJacketShell(input, part, origin))
        break
      case 'sight_glass':
        shapes.push(...composeSightGlass(input, part, origin))
        break
      case 'sample_valve':
        shapes.push(...composeSampleValve(input, part, origin))
        break
      case 'instrument_port':
        shapes.push(...composeInstrumentPort(input, part, origin))
        break
      case 'stainless_highlight_panel':
        shapes.push(...composeStainlessHighlightPanel(input, part, origin))
        break
      case 'bolt_pattern':
        shapes.push(...composeBoltPattern(input, part, origin))
        break
      case 'control_box':
        shapes.push(...composeControlBox(input, part, origin))
        break
      case 'ribbed_motor_body':
        shapes.push(...composeRibbedMotorBody(input, part, origin))
        break
      case 'conveyor_frame':
        shapes.push(...composeConveyorFrame(input, part, origin))
        break
      case 'roller_array':
        shapes.push(...composeRollerArray(input, part, origin))
        break
      case 'belt_surface':
        shapes.push(...composeBeltSurface(input, part, origin))
        break
      case 'cylindrical_tank':
        shapes.push(...composeCylindricalTank(input, part, origin))
        break
      case 'storage_tank_shell':
        shapes.push(...composeStorageTankShell(input, part, origin))
        break
      case 'liquid_volume':
        shapes.push(...composeLiquidVolume(input, part, origin))
        break
      case 'cooling_tower_shell':
        shapes.push(...composeCoolingTowerShell(input, part, origin))
        break
      case 'cooling_tower_rim':
        shapes.push(...composeCoolingTowerRim(input, part, origin))
        break
      case 'chimney_stack':
        shapes.push(...composeChimneyStack(input, part, origin))
        break
      case 'valve_body':
        shapes.push(...composeValveBody(input, part, origin))
        break
      case 'handwheel':
        shapes.push(...composeHandwheel(input, part, origin))
        break
      case 'wheel':
      case 'wheel_set': {
        const partName =
          `${part.id ?? ''} ${part.name ?? ''} ${part.partName ?? ''} ${part.kind ?? ''}`.toLowerCase()
        const role = normalizedRoleToken(part.semanticRole)
        const completeBicycleContext = isCompleteBicycleParts(input.parts ?? [])
        const hasExplicitCount =
          typeof part.count === 'number' && Number.isFinite(part.count) && part.count > 0
        const forceSingleWheel =
          !completeBicycleContext &&
          !hasExplicitCount &&
          (kind === 'wheel' ||
            role === 'wheel' ||
            role === 'vehicle_wheel' ||
            role === 'car_wheel' ||
            role === 'bicycle_wheel' ||
            role === 'bike_wheel')
        const wheelPart = { ...part, count: forceSingleWheel ? 1 : part.count }
        const tireRole = wheelTireRole(input, wheelPart, partName)
        shapes.push(
          ...(tireRole === 'bicycle_tire'
            ? composeBicycleWheels(input, wheelPart, origin)
            : composeWheelSet(input, wheelPart, origin)),
        )
        break
      }
      case 'tube_frame':
        shapes.push(...composeBicycleFrame(input, part, origin))
        break
      case 'fork':
        shapes.push(...composeBicycleFork(input, part, origin))
        break
      case 'handlebar':
        shapes.push(...composeHandlebar(input, part, origin))
        break
      case 'saddle':
        shapes.push(...composeSaddle(input, part, origin))
        break
      case 'chain_loop':
        shapes.push(...composeChainLoop(input, part, origin))
        break
      case 'body_shell':
        shapes.push(...composeVehicleBody(input, part, origin))
        break

      case 'window_panel':
        shapes.push(...composeWindowPanel(input, part, origin))
        break
      case 'window_strip':
        shapes.push(...composeWindowStrip(input, part, origin))
        break
      case 'light_pair':
        shapes.push(...composeHeadlights(input, part, origin))
        break
      case 'bar_pair':
        shapes.push(...composeBumper(input, part, origin))
        break
      case 'gearbox_body':
        shapes.push(...composeGearboxBody(input, part, origin))
        break
      case 'filter_vessel':
        shapes.push(...composeFilterVessel(input, part, origin))
        break
      case 'heat_exchanger':
        shapes.push(...composeHeatExchanger(input, part, origin))
        break
      case 'agitator_tank':
        shapes.push(...composeAgitatorTank(input, part, origin))
        break
      case 'pipe_rack':
        shapes.push(...composePipeRack(input, part, origin))
        break
      case 'platform_ladder':
        shapes.push(...composePlatformLadder(input, part, origin))
        break
      case 'desk_top':
        shapes.push(...composeDeskTop(input, part, origin))
        break
      case 'leg_set':
        shapes.push(...composeLegSet(input, part, origin))
        break
      case 'drawer_stack':
        shapes.push(...composeDrawerStack(input, part, origin))
        break
      case 'electrical_cabinet':
        shapes.push(...composeElectricalCabinet(input, part, origin))
        break
      case 'pipe_run':
        shapes.push(...composePipeRun(input, part, origin))
        break
      case 'pipe_elbow':
        shapes.push(...composePipeElbow(input, part, origin))
        break
      case 'cable_tray':
        shapes.push(...composeCableTray(input, part, origin))
        break
      case 'nameplate':
        shapes.push(...composeNameplate(input, part, origin))
        break
      case 'warning_label':
        shapes.push(...composeWarningLabel(input, part, origin))
        break
      case 'seam_ring':
        shapes.push(...composeSeamRing(input, part, origin))
        break
    }
    tagGeneratedPartShapes(shapes, startIndex, kind, part, index)
  })

  return shapes
}
