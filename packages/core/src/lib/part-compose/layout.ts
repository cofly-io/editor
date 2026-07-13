import { normalizedPartKind, normalizePartKind } from './kind'
import {
  add,
  clamp,
  clampInt,
  negate,
  offsetAlongAxis,
  partAxis,
  partSide,
  signForSide,
  sub,
} from './shared'
import type {
  FamilyId,
  LayoutFamilyId,
  PartAxis,
  PartComposeKind,
  PartComposePartInput,
  Vec3,
} from './types'

export function partCenter(part: PartComposePartInput, kind: PartComposeKind | null): Vec3 {
  if (part.position) return part.position
  switch (kind) {
    case 'circular_base': {
      const height = clamp(part.height ?? part.depth, 0.08, 0.01, 0.4)
      return [0, height / 2, 0]
    }
    case 'vertical_pole': {
      const height = clamp(part.height ?? part.length, 1, 0.05, 50)
      return [0, height / 2 + 0.08, 0]
    }
    case 'motor_housing':
    case 'fan_blade':
    case 'radial_blades':
    case 'protective_grill':
      return [0, 1.18, kind === 'motor_housing' ? -0.024 : 0.04]
    case 'wheel':
    case 'wheel_set':
      return [0, clamp(part.radius ?? part.wheelRadius, 0.14, 0.025, 1.2), 0]
    case 'window_panel':
    case 'window_strip':
      return [0, 0.55, 0.02]
    case 'propeller_blade_set':
    case 'mixer_blades':
    case 'airfoil_blade':
      return [0, 0.4, 0]
    case 'ellipsoid_shell':
      return [0, clamp(part.height, 0.18, 0.02, 3) * 0.56, 0]
    case 'hemisphere': {
      const radius = clamp(
        part.radius ?? (part.diameter != null ? part.diameter / 2 : undefined),
        0.5,
        0.01,
        10,
      )
      const height = clamp(part.height, radius, 0.01, 10)
      return [0, height / 2, 0]
    }
    case 'curved_lens_panel':
      return [0, 0.45, 0]
    case 'ergonomic_shell':
      return [0, clamp(part.height, 0.036, 0.01, 0.6) * 0.72, 0]
    case 'streamlined_body':
      return [0, clamp(part.height, 0.22, 0.02, 2.5) * 0.55, 0]
    case 'lofted_panel':
      return [0, clamp(part.height, 0.12, 0.01, 1.8) * 0.7, 0]
    case 'support_bracket':
      return [0, 1.08, 0]
    case 'control_knob':
      return [0, 0.22, 0.2]
    case 'skid_base':
      return [0, 0.06, 0]
    case 'support_roller_pair':
      return [0, 0.22, 0]
    case 'structural_tower_frame':
      return [0, clamp(part.height, 5, 1, 16) / 2, 0]
    case 'helical_ladder':
    case 'helical_stair':
      return [0, clamp(part.height ?? part.overallHeight, 6, 0.8, 18) / 2, 0]
    case 'cyclone_separator_unit':
      return [0, clamp(part.height, 1.2, 0.3, 4) / 2, 0]
    case 'rounded_machine_body':
      return [0, 0.45, 0]
    case 'flange_ring':
    case 'bolt_pattern':
      return [0, 0.55, 0.5]
    case 'inlet_port':
    case 'outlet_port':
    case 'pipe_port':
      return [0, 0.55, 0.45]
    case 'volute_casing':
      return [0, 0.55, 0.18]
    case 'control_box':
      return [0.32, 0.62, 0.24]
    case 'ribbed_motor_body':
    case 'gearbox_body':
      return [kind === 'ribbed_motor_body' ? -0.24 : 0, 0.42, 0]
    case 'conveyor_frame':
      return [0, 0.38, 0]
    case 'roller_array':
      return [0, 0.52, 0]
    case 'belt_surface':
      return [0, 0.56, 0]
    case 'desk_top':
      return [0, 0.74, 0]
    case 'leg_set':
      return [0, clamp(part.height, 0.7, 0.12, 1.4) / 2, 0]
    case 'drawer_stack':
      return [0.38, 0.46, 0]
    case 'electrical_cabinet':
      return [0, clamp(part.height, 0.95, 0.32, 3) / 2, 0]
    case 'pipe_run':
    case 'pipe_elbow':
      return [0, 0.55, 0]
    case 'valve_body':
      return [0, 0.38, 0]
    case 'handwheel':
      return [0, 0.62, 0]
    case 'cable_tray':
      return [0, 0.72, 0]
    default:
      return [0, 0, 0]
  }
}

export function partHalfExtents(part: PartComposePartInput, kind: PartComposeKind | null): Vec3 {
  const axis = partAxis(part.axis, kind === 'outlet_port' ? 'x' : 'z')
  const radius = clamp(
    part.radius,
    kind === 'flange_ring' ? 0.12 : kind === 'valve_body' ? 0.12 : 0.08,
    0.01,
    2,
  )
  const length = clamp(
    part.length ?? part.depth ?? part.height,
    kind === 'flange_ring' ? 0.035 : kind === 'valve_body' ? 0.46 : 0.26,
    0.004,
    6,
  )
  const axisExtents = (alongAxis: number, radial: number): Vec3 => {
    switch (axis) {
      case 'x':
        return [alongAxis, radial, radial]
      case 'y':
        return [radial, alongAxis, radial]
      default:
        return [radial, radial, alongAxis]
    }
  }

  switch (kind) {
    case 'circular_base': {
      const baseRadius = clamp(part.radius, 0.28, 0.05, 2)
      const baseHeight = clamp(part.height ?? part.depth, 0.08, 0.01, 0.4)
      return [baseRadius, baseHeight / 2, baseRadius]
    }
    case 'vertical_pole': {
      const poleRadius = clamp(part.radius, 0.025, 0.005, 2)
      const poleHeight = clamp(part.height ?? part.length, 1, 0.05, 50)
      return [poleRadius, poleHeight / 2, poleRadius]
    }
    case 'motor_housing': {
      const motorRadius = clamp(part.radius, 0.11, 0.03, 0.5)
      const motorDepth = clamp(part.depth ?? part.length ?? part.height, 0.16, 0.03, 0.8)
      return [motorRadius, motorRadius, motorDepth / 2]
    }
    case 'fan_blade': {
      const bladeLength = clamp(part.length ?? part.bladeRadius ?? part.radius, 0.24, 0.04, 1.2)
      const bladeWidth = clamp(part.bladeWidth ?? part.width, bladeLength * 0.24, 0.012, 0.55)
      const bladeDepth = clamp(part.thickness ?? part.depth ?? part.height, 0.018, 0.003, 0.08)
      const hubRadius = clamp(part.wireRadius, bladeLength * 0.22, 0.01, bladeLength * 0.45)
      return [hubRadius + bladeLength, bladeWidth / 2, bladeDepth / 2]
    }
    case 'radial_blades': {
      const bladeRadius = clamp(part.bladeRadius ?? part.radius, 0.28, 0.05, 1.4)
      const bladeThickness = clamp(part.height ?? part.thickness, 0.012, 0.003, 0.05)
      return [bladeRadius, bladeRadius, bladeThickness / 2]
    }
    case 'propeller_blade_set':
    case 'mixer_blades': {
      const bladeLength = clamp(part.bladeRadius ?? part.radius ?? part.length, 0.34, 0.08, 1.2)
      const bladeWidth = clamp(part.bladeWidth ?? part.width, 0.13, 0.04, 0.45)
      const bladeDepth = clamp(part.depth ?? part.height, 0.028, 0.01, 0.09)
      const hubRadius = clamp(part.wireRadius, bladeLength * 0.12, 0.015, bladeLength * 0.32)
      return [hubRadius + bladeLength, bladeDepth / 2, hubRadius + bladeLength + bladeWidth / 2]
    }
    case 'wheel':
    case 'wheel_set': {
      const wheelRadius = clamp(part.radius ?? part.wheelRadius, 0.14, 0.025, 1.2)
      const wheelWidth = clamp(part.wheelWidth ?? part.depth, wheelRadius * 0.42, 0.012, 0.6)
      const length = clamp(part.length, 0.95, 0, 8)
      const width = clamp(part.width, 0.54, 0, 4)
      return [Math.max(length / 2, wheelRadius), wheelRadius, Math.max(width / 2, wheelWidth / 2)]
    }
    case 'window_panel':
      return [
        clamp(part.length ?? part.width, 0.32, 0.02, 4) / 2,
        clamp(part.height, 0.18, 0.015, 2) / 2,
        clamp(part.thickness ?? part.depth, 0.01, 0.002, 0.12) / 2,
      ]
    case 'window_strip':
      return [
        clamp(part.length, 1.2, 0.08, 12) / 2,
        clamp(part.height, 0.09, 0.01, 0.5) / 2,
        clamp(part.thickness ?? part.depth, 0.01, 0.002, 0.12) / 2,
      ]
    case 'airfoil_blade': {
      const bladeLength = clamp(part.length ?? part.bladeRadius ?? part.radius, 0.46, 0.06, 2.5)
      const rootWidth = clamp(part.rootWidth ?? part.bladeWidth ?? part.width, 0.13, 0.015, 0.8)
      const thickness = clamp(part.thickness ?? part.depth ?? part.height, 0.025, 0.003, 0.16)
      const hubRadius = clamp(part.wireRadius, bladeLength * 0.12, 0.01, bladeLength * 0.35)
      return [hubRadius + bladeLength, rootWidth / 2, hubRadius + bladeLength]
    }
    case 'ellipsoid_shell':
      return [
        clamp(part.length, 0.48, 0.04, 6) / 2,
        clamp(part.height, 0.18, 0.02, 3) / 2,
        clamp(part.width ?? part.depth, 0.28, 0.025, 4) / 2,
      ]
    case 'hemisphere': {
      const diameter = part.diameter ?? (part.radius != null ? part.radius * 2 : undefined)
      const length = clamp(part.length ?? diameter, 1, 0.02, 20)
      const width = clamp(part.width ?? part.depth ?? diameter, length, 0.02, 20)
      const radius = clamp(
        part.radius ?? (part.diameter != null ? part.diameter / 2 : undefined),
        0.5,
        0.01,
        10,
      )
      const height = clamp(part.height, radius, 0.01, 10)
      return [length / 2, height / 2, width / 2]
    }
    case 'curved_lens_panel':
      return [
        clamp(part.width ?? part.length, 0.32, 0.04, 2) / 2,
        clamp(part.height, 0.18, 0.025, 1.2) / 2,
        clamp(part.thickness ?? part.depth, 0.012, 0.002, 0.08) / 2,
      ]
    case 'ergonomic_shell':
      return [
        clamp(part.length, 0.12, 0.04, 2) / 2,
        clamp(part.height, 0.036, 0.01, 0.6) / 2,
        clamp(part.width ?? part.depth, 0.065, 0.02, 1) / 2,
      ]
    case 'streamlined_body':
      return [
        clamp(part.length, 1.2, 0.08, 8) / 2,
        clamp(part.height, 0.22, 0.02, 2.5) / 2,
        clamp(part.width ?? part.depth, 0.36, 0.03, 3) / 2,
      ]
    case 'aircraft_fuselage':
      return [
        clamp(part.length, 1.12, 0.4, 8) / 2,
        clamp(part.height, clamp(part.width ?? part.depth, 0.14, 0.05, 1.4) * 1.08, 0.04, 1.2) / 2,
        clamp(part.width ?? part.depth, 0.14, 0.05, 1.4) / 2,
      ]
    case 'aircraft_wing':
      return [
        clamp(part.width ?? part.depth, 0.18, 0.04, 1.2) / 2,
        clamp(part.thickness ?? part.height, 0.018, 0.004, 0.12) / 2,
        clamp(part.length, 0.95, 0.2, 5) / 2,
      ]
    case 'aircraft_engine': {
      const engineRadius = clamp(part.radius, 0.065, 0.018, 0.5)
      const engineLength = clamp(part.length ?? part.depth, 0.24, 0.05, 1.4)
      const engineSpacing = clamp(part.width, 0.46, engineRadius * 3, 2)
      return [engineLength / 2, engineRadius, engineSpacing / 2 + engineRadius]
    }
    case 'aircraft_vertical_stabilizer':
      return [
        clamp(part.length, 0.22, 0.04, 1.5) / 2,
        clamp(part.height, 0.28, 0.04, 1.4) / 2,
        clamp(part.width ?? part.thickness, 0.025, 0.004, 0.16) / 2,
      ]
    case 'aircraft_horizontal_stabilizer':
      return [
        clamp(part.width ?? part.depth, 0.1, 0.03, 0.8) / 2,
        clamp(part.thickness ?? part.height, 0.014, 0.003, 0.08) / 2,
        clamp(part.length, 0.42, 0.08, 2.5) / 2,
      ]
    case 'aircraft_landing_gear': {
      const gearRadius = clamp(part.radius ?? part.wheelRadius, 0.035, 0.012, 0.2)
      return [
        clamp(part.length, 0.62, gearRadius * 5, 2.5) / 2,
        gearRadius * 2.8,
        clamp(part.width, 0.32, gearRadius * 3, 1.4) / 2 + gearRadius,
      ]
    }
    case 'generic_body':
      return [
        clamp(part.length, 1, 0.08, 8) / 2,
        clamp(part.height, 0.8, 0.05, 5) / 2,
        clamp(part.width ?? part.depth, 0.65, 0.05, 5) / 2,
      ]
    case 'generic_base':
      return [
        clamp(part.length, 1.08, 0.08, 8) / 2,
        clamp(part.thickness ?? part.height, 0.08, 0.01, 0.8) / 2,
        clamp(part.width ?? part.depth, 0.72, 0.05, 5) / 2,
      ]
    case 'generic_panel':
    case 'generic_control_panel':
    case 'generic_display':
    case 'generic_opening':
    case 'generic_detail_accent':
      return [
        clamp(part.length, 0.3, 0.02, 4) / 2,
        clamp(part.height ?? part.width, 0.22, 0.02, 3) / 2,
        clamp(part.thickness ?? part.depth, 0.025, 0.002, 0.4) / 2,
      ]
    case 'generic_handle':
      return [
        clamp(part.length, 0.22, 0.03, 2) / 2,
        clamp(part.radius, 0.018, 0.004, 0.12),
        clamp(part.depth ?? part.width, 0.05, 0.01, 0.5) / 2,
      ]
    case 'generic_spout':
      return [
        clamp(part.radius, 0.035, 0.004, 0.2),
        clamp(part.radius, 0.035, 0.004, 0.2),
        clamp(part.length ?? part.depth ?? part.height, 0.2, 0.02, 1.2) / 2,
      ]
    case 'generic_foot_set':
      return [
        clamp(part.length, 0.9, 0.08, 8) / 2,
        clamp(part.height, 0.08, 0.02, 0.8) / 2,
        clamp(part.width ?? part.depth, 0.55, 0.05, 5) / 2,
      ]
    case 'kiosk_body':
      return [
        clamp(part.length, 1.8, 0.4, 8) / 2,
        clamp(part.height, 1.7, 0.4, 5) / 2,
        clamp(part.width ?? part.depth, 1.2, 0.3, 5) / 2,
      ]
    case 'kiosk_roof':
      return [
        clamp(part.length, 2.1, 0.4, 9) / 2,
        clamp(part.height ?? part.thickness, 0.28, 0.04, 1.2) / 2,
        clamp(part.width ?? part.depth, 1.45, 0.3, 6) / 2,
      ]
    case 'kiosk_opening':
      return [
        clamp(part.length, 0.8, 0.08, 5) / 2,
        clamp(part.height ?? part.width, 0.75, 0.08, 4) / 2,
        clamp(part.thickness ?? part.depth, 0.035, 0.004, 0.5) / 2,
      ]
    case 'kiosk_counter':
      return [
        clamp(part.length, 1, 0.08, 6) / 2,
        clamp(part.thickness ?? part.height, 0.08, 0.02, 0.6) / 2,
        clamp(part.width ?? part.depth, 0.28, 0.04, 2) / 2,
      ]
    case 'kiosk_sign':
      return [
        clamp(part.length, 1, 0.08, 6) / 2,
        clamp(part.height ?? part.width, 0.26, 0.04, 1.5) / 2,
        clamp(part.thickness ?? part.depth, 0.035, 0.004, 0.4) / 2,
      ]
    case 'kiosk_awning':
      return [
        clamp(part.length, 1.25, 0.08, 7) / 2,
        clamp(part.thickness ?? part.height, 0.08, 0.02, 0.8) / 2,
        clamp(part.width ?? part.depth, 0.45, 0.04, 2.4) / 2,
      ]
    case 'lofted_panel':
      return [
        clamp(part.length, 0.8, 0.08, 6) / 2,
        clamp(part.height, 0.12, 0.01, 1.8) / 2,
        clamp(part.width ?? part.depth, 0.28, 0.02, 2) / 2,
      ]
    case 'protective_grill': {
      const grillRadius = clamp(part.radius, 0.36, 0.08, 2)
      const grillDepth = clamp(part.depth, 0.12, 0.005, 0.6)
      return [grillRadius, grillRadius, grillDepth / 2]
    }
    case 'support_bracket':
      return [
        clamp(part.width ?? part.length, 0.22, 0.04, 1) / 2,
        clamp(part.height, 0.16, 0.03, 0.8) / 2,
        clamp(part.depth, 0.045, 0.01, 0.3) / 2,
      ]
    case 'control_knob': {
      const knobRadius = clamp(part.radius, 0.045, 0.01, 0.2)
      const knobDepth = clamp(part.depth ?? part.height, 0.025, 0.004, 0.12)
      return [knobRadius, knobRadius, knobDepth / 2]
    }
    case 'pyramid':
      return [
        clamp(part.length ?? part.width ?? part.diameter, 0.6, 0.02, 20) / 2,
        clamp(part.height ?? part.depth, 0.8, 0.02, 20) / 2,
        clamp(part.width ?? part.length ?? part.diameter, 0.6, 0.02, 20) / 2,
      ]
    case 'skid_base':
      return [
        clamp(part.length ?? part.depth, 1.1, 0.25, 5) / 2,
        clamp(part.height, 0.08, 0.02, 0.35) / 2,
        clamp(part.width, 0.46, 0.12, 2) / 2,
      ]
    case 'flange_ring':
    case 'bolt_pattern':
      return axisExtents(length / 2, radius)
    case 'pipe_port':
    case 'inlet_port':
    case 'outlet_port':
      return axisExtents(length / 2, radius)
    case 'valve_body':
      return axisExtents(length / 2, radius)
    case 'volute_casing': {
      const r = clamp(part.radius, 0.28, 0.06, 2)
      const d = clamp(part.depth ?? part.width, r * 0.48, 0.03, 1)
      return [r, r, d / 2]
    }
    case 'rounded_machine_body':
    case 'control_box':
    case 'gearbox_body':
    case 'ribbed_motor_body':
    case 'body_shell':
    case 'electrical_cabinet':
    case 'conveyor_frame':
    case 'roller_array':
    case 'belt_surface':
      if (kind === 'ribbed_motor_body') {
        return axisExtents(
          clamp(part.length ?? part.depth, 0.48, 0.12, 3) / 2,
          clamp(part.radius, 0.18, 0.04, 1),
        )
      }
      if (kind === 'conveyor_frame') {
        return [
          clamp(part.length, 1.4, 0.3, 6) / 2,
          clamp(part.height, 0.42, 0.12, 2) / 2,
          clamp(part.width, 0.42, 0.12, 2) / 2,
        ]
      }
      if (kind === 'roller_array') {
        return [
          clamp(part.length, 1.2, 0.2, 6) / 2,
          clamp(part.radius, 0.035, 0.008, 0.18),
          clamp(part.width, 0.46, 0.08, 2) / 2,
        ]
      }
      if (kind === 'belt_surface') {
        return [
          clamp(part.length, 1.35, 0.2, 6) / 2,
          clamp(part.height ?? part.depth, 0.025, 0.004, 0.12) / 2,
          clamp(part.width, 0.46, 0.08, 2) / 2,
        ]
      }
      if (kind === 'control_box') {
        return [
          clamp(part.width ?? part.length, 0.24, 0.04, 1.5) / 2,
          clamp(part.height, 0.32, 0.06, 1.5) / 2,
          clamp(part.depth, 0.11, 0.025, 0.7) / 2,
        ]
      }
      return [
        clamp(
          part.length,
          kind === 'body_shell' ? 1.2 : kind === 'electrical_cabinet' ? 0.55 : 0.6,
          0.1,
          6,
        ) / 2,
        clamp(part.height, kind === 'electrical_cabinet' ? 0.95 : 0.34, 0.05, 3) / 2,
        clamp(part.width ?? part.depth, kind === 'electrical_cabinet' ? 0.22 : 0.34, 0.05, 3) / 2,
      ]
    case 'desk_top':
      return [
        clamp(part.length, 1.2, 0.35, 4) / 2,
        clamp(part.height ?? part.depth, 0.055, 0.02, 0.18) / 2,
        clamp(part.width ?? part.depth, 0.6, 0.2, 2) / 2,
      ]
    case 'leg_set':
      return [
        clamp(part.length, 1.08, 0.25, 4) / 2,
        clamp(part.height, 0.7, 0.12, 1.4) / 2,
        clamp(part.width ?? part.depth, 0.5, 0.15, 2) / 2,
      ]
    case 'drawer_stack':
      return [
        clamp(part.length, 0.34, 0.14, 1.2) / 2,
        clamp(part.height, 0.52, 0.16, 1.1) / 2,
        clamp(part.width ?? part.depth, 0.44, 0.12, 1) / 2,
      ]
    case 'cable_tray':
      return [
        clamp(part.length, 1.2, 0.24, 6) / 2,
        clamp(part.height, 0.08, 0.025, 0.4) / 2,
        clamp(part.width ?? part.depth, 0.26, 0.08, 1.2) / 2,
      ]
    case 'pipe_run': {
      const pipeAxis = partAxis(part.axis, 'x')
      const pipeLength = clamp(part.length ?? part.height, 1, 0.08, 8)
      const pipeRadius = clamp(part.radius, 0.055, 0.008, 0.45)
      return pipeAxis === 'x'
        ? [pipeLength / 2, pipeRadius, pipeRadius]
        : pipeAxis === 'y'
          ? [pipeRadius, pipeLength / 2, pipeRadius]
          : [pipeRadius, pipeRadius, pipeLength / 2]
    }
    case 'pipe_elbow': {
      const pipeRadius = clamp(part.radius, 0.055, 0.008, 0.45)
      const bendRadius = clamp(
        part.bendRadius ?? part.length ?? part.depth,
        pipeRadius * 4.2,
        pipeRadius * 1.4,
        2,
      )
      return [bendRadius / 2 + pipeRadius, pipeRadius, bendRadius / 2 + pipeRadius]
    }
    case 'cylindrical_tank':
    case 'chimney_stack':
    case 'heat_exchanger': {
      const r = clamp(part.radius, 0.2, 0.04, 2)
      const l = clamp(part.length ?? part.height, 0.9, 0.1, 6) / 2
      if (kind === 'chimney_stack') {
        const h = clamp(part.height ?? part.length, 6, 0.6, 80)
        const chimneyRadius = clamp(part.radius ?? part.width ?? part.diameter, h * 0.055, 0.05, 6)
        return [chimneyRadius * 1.42, h / 2, chimneyRadius * 1.42]
      }
      return partAxis(part.axis, 'x') === 'x' ? [l, r, r] : [r, l, r]
    }
    default:
      return [0.1, 0.1, 0.1]
  }
}

export function anchorOffset(anchor: unknown, extents: Vec3): Vec3 {
  switch (anchor) {
    case 'left':
      return [-extents[0], 0, 0]
    case 'right':
      return [extents[0], 0, 0]
    case 'top':
      return [0, extents[1], 0]
    case 'bottom':
      return [0, -extents[1], 0]
    case 'front':
      return [0, 0, extents[2]]
    case 'back':
      return [0, 0, -extents[2]]
    default:
      return [0, 0, 0]
  }
}

export function connectionPointOffset(
  part: PartComposePartInput,
  kind: PartComposeKind | null,
  point: unknown,
): Vec3 {
  const normalizedPoint =
    typeof point === 'string'
      ? point
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '_')
      : ''
  const extents = partHalfExtents(part, kind)
  const axis = partAxis(part.axis, kind === 'outlet_port' ? 'x' : 'z')
  const radius = clamp(part.radius, 0.08, 0.01, 2)
  const length = clamp(
    part.length ?? part.depth ?? part.height,
    kind === 'flange_ring' ? 0.035 : 0.26,
    0.004,
    6,
  )
  const side = partSide(part.side)
  const sideSign = signForSide(side, axis)
  const axisOffset = (distance: number) =>
    sub(offsetAlongAxis([0, 0, 0], axis, distance), [0, 0, 0])

  switch (kind) {
    case 'circular_base':
      if (
        normalizedPoint === 'top' ||
        normalizedPoint === 'mount' ||
        normalizedPoint === 'center'
      ) {
        return [0, extents[1], 0]
      }
      if (normalizedPoint === 'bottom' || normalizedPoint === 'floor') return [0, -extents[1], 0]
      break
    case 'vertical_pole':
      if (normalizedPoint === 'top' || normalizedPoint === 'head' || normalizedPoint === 'mount') {
        return [0, extents[1], 0]
      }
      if (
        normalizedPoint === 'bottom' ||
        normalizedPoint === 'foot' ||
        normalizedPoint === 'base'
      ) {
        return [0, -extents[1], 0]
      }
      if (normalizedPoint === 'shaft' || normalizedPoint === 'center') return [0, 0, 0]
      break
    case 'motor_housing':
    case 'radial_blades':
    case 'protective_grill':
      if (
        normalizedPoint === 'front' ||
        normalizedPoint === 'face' ||
        normalizedPoint === 'blade_face' ||
        normalizedPoint === 'grill_face'
      ) {
        return [0, 0, extents[2]]
      }
      if (
        normalizedPoint === 'back' ||
        normalizedPoint === 'rear' ||
        normalizedPoint === 'motor_side' ||
        normalizedPoint === 'mount'
      ) {
        return [0, 0, -extents[2]]
      }
      if (
        normalizedPoint === 'hub' ||
        normalizedPoint === 'shaft' ||
        normalizedPoint === 'center'
      ) {
        return [0, 0, 0]
      }
      break
    case 'pipe_port':
    case 'inlet_port':
    case 'outlet_port':
      if (
        normalizedPoint === 'open' ||
        normalizedPoint === 'mouth' ||
        normalizedPoint === 'port' ||
        normalizedPoint === 'nozzle' ||
        normalizedPoint === 'front' ||
        normalizedPoint === 'outlet' ||
        normalizedPoint === 'inlet'
      ) {
        return axisOffset((length / 2) * sideSign)
      }
      if (normalizedPoint === 'base' || normalizedPoint === 'back' || normalizedPoint === 'rear') {
        return axisOffset((-length / 2) * sideSign)
      }
      break
    case 'pipe_run': {
      const pipeAxis = partAxis(part.axis, 'x')
      const pipeLength = clamp(part.length ?? part.height, 1, 0.08, 8)
      const pipeSideSign = signForSide(side, pipeAxis)
      const pipeAxisOffset = (distance: number) =>
        sub(offsetAlongAxis([0, 0, 0], pipeAxis, distance), [0, 0, 0])
      if (
        normalizedPoint === 'open' ||
        normalizedPoint === 'mouth' ||
        normalizedPoint === 'port' ||
        normalizedPoint === 'nozzle' ||
        normalizedPoint === 'front' ||
        normalizedPoint === 'outlet' ||
        normalizedPoint === 'end' ||
        normalizedPoint === 'right'
      ) {
        return pipeAxisOffset((pipeLength / 2) * pipeSideSign)
      }
      if (
        normalizedPoint === 'base' ||
        normalizedPoint === 'back' ||
        normalizedPoint === 'rear' ||
        normalizedPoint === 'start' ||
        normalizedPoint === 'left' ||
        normalizedPoint === 'inlet'
      ) {
        return pipeAxisOffset((-pipeLength / 2) * pipeSideSign)
      }
      break
    }
    case 'pipe_elbow': {
      const elbowRadius = clamp(part.radius, 0.055, 0.008, 0.45)
      const bendRadius = clamp(
        part.bendRadius ?? part.length ?? part.depth,
        elbowRadius * 4.2,
        elbowRadius * 1.4,
        2,
      )
      if (
        normalizedPoint === 'start' ||
        normalizedPoint === 'inlet' ||
        normalizedPoint === 'left'
      ) {
        return [-bendRadius, 0, 0]
      }
      if (
        normalizedPoint === 'end' ||
        normalizedPoint === 'outlet' ||
        normalizedPoint === 'front' ||
        normalizedPoint === 'open'
      ) {
        return [0, 0, bendRadius]
      }
      break
    }
    case 'desk_top':
      if (
        normalizedPoint === 'leg_mount' ||
        normalizedPoint === 'under' ||
        normalizedPoint === 'underside'
      ) {
        return [0, -extents[1], 0]
      }
      break
    case 'electrical_cabinet':
      if (normalizedPoint === 'front' || normalizedPoint === 'door') return [0, 0, extents[2]]
      if (normalizedPoint === 'cable_entry' || normalizedPoint === 'top') return [0, extents[1], 0]
      if (normalizedPoint === 'bottom' || normalizedPoint === 'base') return [0, -extents[1], 0]
      break
    case 'cable_tray':
      if (normalizedPoint === 'left' || normalizedPoint === 'start') return [-extents[0], 0, 0]
      if (normalizedPoint === 'right' || normalizedPoint === 'end') return [extents[0], 0, 0]
      if (normalizedPoint === 'bottom') return [0, -extents[1], 0]
      break
    case 'flange_ring':
    case 'bolt_pattern':
    case 'seam_ring':
      if (normalizedPoint === 'front' || normalizedPoint === 'face' || normalizedPoint === 'open') {
        return axisOffset(length / 2)
      }
      if (normalizedPoint === 'back' || normalizedPoint === 'rear' || normalizedPoint === 'mount') {
        return axisOffset(-length / 2)
      }
      break
    case 'volute_casing': {
      const r = clamp(part.radius, 0.28, 0.06, 2)
      const depth = clamp(part.depth ?? part.width, r * 0.48, 0.03, 1)
      const outletAngle = clamp(part.outletAngle, Math.atan2(0.34, 0.72), -Math.PI, Math.PI)
      if (
        normalizedPoint === 'inlet' ||
        normalizedPoint === 'suction' ||
        normalizedPoint === 'front'
      ) {
        return [0, 0, depth * 0.54]
      }
      if (normalizedPoint === 'outlet' || normalizedPoint === 'discharge') {
        return [Math.cos(outletAngle) * r * 1.06, Math.sin(outletAngle) * r * 1.06, 0]
      }
      break
    }
    case 'ribbed_motor_body':
    case 'gearbox_body': {
      const motorAxis = partAxis(part.axis, 'x')
      const bodyLength = clamp(
        part.length ?? part.depth,
        kind === 'gearbox_body' ? 0.46 : 0.48,
        0.12,
        3,
      )
      if (
        normalizedPoint === 'shaft' ||
        normalizedPoint === 'output' ||
        normalizedPoint === 'front'
      ) {
        return sub(offsetAlongAxis([0, 0, 0], motorAxis, bodyLength * 0.72), [0, 0, 0])
      }
      if (normalizedPoint === 'input' || normalizedPoint === 'back' || normalizedPoint === 'rear') {
        return sub(offsetAlongAxis([0, 0, 0], motorAxis, -bodyLength * 0.62), [0, 0, 0])
      }
      break
    }
    case 'valve_body':
      if (normalizedPoint === 'inlet' || normalizedPoint === 'left') return axisOffset(-length / 2)
      if (normalizedPoint === 'outlet' || normalizedPoint === 'right') return axisOffset(length / 2)
      if (normalizedPoint === 'stem' || normalizedPoint === 'top') return [0, radius * 1.8, 0]
      break
    case 'cylindrical_tank':
    case 'heat_exchanger': {
      const vesselAxis = partAxis(part.axis, 'x')
      const vesselLength = clamp(
        part.length ?? part.height,
        kind === 'heat_exchanger' ? 1 : 0.9,
        0.1,
        6,
      )
      const vesselRadius = clamp(part.radius, 0.2, 0.04, 2)
      if (normalizedPoint === 'left' || normalizedPoint === 'inlet') {
        return sub(offsetAlongAxis([0, 0, 0], vesselAxis, -vesselLength / 2), [0, 0, 0])
      }
      if (normalizedPoint === 'right' || normalizedPoint === 'outlet') {
        return sub(offsetAlongAxis([0, 0, 0], vesselAxis, vesselLength / 2), [0, 0, 0])
      }
      if (normalizedPoint === 'top' || normalizedPoint === 'nozzle') return [0, vesselRadius, 0]
      break
    }
  }

  return anchorOffset(point, extents)
}

export function alignAbovePosition(
  parent: PartComposePartInput,
  parentKind: PartComposeKind | null,
  child: PartComposePartInput,
  childKind: PartComposeKind | null,
): Vec3 {
  const parentCenter = partCenter(parent, parentKind)
  const parentExtents = partHalfExtents(parent, parentKind)
  const childExtents = partHalfExtents(child, childKind)
  const gap = clamp(child.relationGap, 0, 0, 2)
  return [
    parentCenter[0],
    parentCenter[1] + parentExtents[1] + childExtents[1] + gap,
    parentCenter[2],
  ]
}

export function centeredOnPosition(
  parent: PartComposePartInput,
  parentKind: PartComposeKind | null,
  child: PartComposePartInput,
  childKind: PartComposeKind | null,
): Vec3 {
  const parentCenter = partCenter(parent, parentKind)
  const childCenter = partCenter(child, childKind)
  return [parentCenter[0], childCenter[1], parentCenter[2]]
}

export function alignBesidePosition(
  parent: PartComposePartInput,
  parentKind: PartComposeKind | null,
  child: PartComposePartInput,
  childKind: PartComposeKind | null,
): Vec3 {
  const parentCenter = partCenter(parent, parentKind)
  const parentExtents = partHalfExtents(parent, parentKind)
  const childExtents = partHalfExtents(child, childKind)
  const side = partSide(child.side) ?? partSide(child.anchor) ?? 'right'
  const gap = clamp(child.relationGap, 0, 0, 2)
  switch (side) {
    case 'left':
      return [
        parentCenter[0] - parentExtents[0] - childExtents[0] - gap,
        parentCenter[1],
        parentCenter[2],
      ]
    case 'front':
      return [
        parentCenter[0],
        parentCenter[1],
        parentCenter[2] + parentExtents[2] + childExtents[2] + gap,
      ]
    case 'back':
      return [
        parentCenter[0],
        parentCenter[1],
        parentCenter[2] - parentExtents[2] - childExtents[2] - gap,
      ]
    case 'top':
      return alignAbovePosition(parent, parentKind, child, childKind)
    case 'bottom':
      return [
        parentCenter[0],
        parentCenter[1] - parentExtents[1] - childExtents[1] - gap,
        parentCenter[2],
      ]
    default:
      return [
        parentCenter[0] + parentExtents[0] + childExtents[0] + gap,
        parentCenter[1],
        parentCenter[2],
      ]
  }
}

export function aroundPosition(
  parent: PartComposePartInput,
  parentKind: PartComposeKind | null,
  child: PartComposePartInput,
  childKind: PartComposeKind | null,
): Vec3 {
  const parentCenter = partCenter(parent, parentKind)
  const parentExtents = partHalfExtents(parent, parentKind)
  const childCenter = partCenter(child, childKind)
  const childExtents = partHalfExtents(child, childKind)
  const gap = clamp(child.relationGap, 0, 0, 2)
  if (child.cornerPattern) {
    const count = clampInt(child.aroundCount ?? child.count, 4, 1, 128)
    const index = clampInt(child.aroundIndex, 0, 0, Math.max(0, count - 1))
    const cornerIndex = index % 4
    const inset = clamp(child.cornerInset, 0, 0, 20)
    const xSign = cornerIndex === 0 || cornerIndex === 3 ? -1 : 1
    const zSign = cornerIndex === 0 || cornerIndex === 1 ? -1 : 1
    return [
      parentCenter[0] + xSign * Math.max(0, parentExtents[0] - childExtents[0] - inset),
      childCenter[1],
      parentCenter[2] + zSign * Math.max(0, parentExtents[2] - childExtents[2] - inset),
    ]
  }
  const radius = clamp(
    child.aroundRadius,
    Math.max(parentExtents[0], parentExtents[2]) + Math.max(childExtents[0], childExtents[2]) + gap,
    0,
    20,
  )
  const count = clampInt(child.aroundCount ?? child.count, 1, 1, 128)
  const index = clampInt(child.aroundIndex, 0, 0, Math.max(0, count - 1))
  const angle =
    typeof child.aroundAngle === 'number' && Number.isFinite(child.aroundAngle)
      ? child.aroundAngle
      : clamp(child.aroundStartAngle, 0, -Math.PI * 2, Math.PI * 2) + (Math.PI * 2 * index) / count
  const axis = partAxis(child.aroundAxis, 'y')
  const cos = Math.cos(angle) * radius
  const sin = Math.sin(angle) * radius

  switch (axis) {
    case 'x':
      return [childCenter[0], parentCenter[1] + cos, parentCenter[2] + sin]
    case 'z':
      return [parentCenter[0] + cos, parentCenter[1] + sin, childCenter[2]]
    default:
      return [parentCenter[0] + cos, childCenter[1], parentCenter[2] + sin]
  }
}

export function positionWithArrayOffset(part: PartComposePartInput, position: Vec3): Vec3 {
  const axis = partAxis(part.arrayAxis, 'x')
  const offset = clamp(part.arrayOffset, 0, -50, 50)
  if (offset === 0) return position
  return offsetAlongAxis(position, axis, offset)
}

export function expandArrayParts(parts: PartComposePartInput[]): PartComposePartInput[] {
  const expanded: PartComposePartInput[] = []
  for (const part of parts) {
    const count = clampInt(part.array?.count, 1, 1, 128)
    const spacing = clamp(part.array?.spacing, 0, 0, 20)
    if (!part.array || count <= 1 || spacing === 0) {
      expanded.push(part)
      continue
    }
    const axis = partAxis(part.array.axis, 'x')
    const centerOffset = ((count - 1) * spacing) / 2
    const originalId = part.id
    for (let index = 0; index < count; index += 1) {
      expanded.push({
        ...part,
        id: originalId ? `${originalId}_${index + 1}` : undefined,
        // Preserve original id as alias so findParent can resolve references to it
        sourcePartId: part.sourcePartId ?? originalId,
        name: part.name
          ? `${part.name} ${index + 1}`
          : part.partName
            ? `${part.partName} ${index + 1}`
            : undefined,
        partName: part.partName ? `${part.partName} ${index + 1}` : undefined,
        array: undefined,
        arrayAxis: axis,
        arrayOffset: index * spacing - centerOffset,
      })
    }
  }
  return expanded
}

export function expandAroundDistributedParts(
  parts: PartComposePartInput[],
): PartComposePartInput[] {
  const expanded: PartComposePartInput[] = []
  for (const part of parts) {
    const kind = normalizedPartKind(part)
    if (kind === 'propeller_blade_set' || kind === 'mixer_blades') {
      expanded.push({
        ...part,
        around: undefined,
        aroundCount: undefined,
        aroundIndex: undefined,
        aroundAngle: undefined,
      })
      continue
    }
    const defaultCount = part.cornerPattern ? 4 : 1
    const count = clampInt(part.aroundCount, defaultCount, 1, 128)
    if (part.around == null || part.aroundIndex != null || count <= 1) {
      expanded.push(part)
      continue
    }
    const originalId = part.id
    for (let index = 0; index < count; index += 1) {
      expanded.push({
        ...part,
        id: originalId ? `${originalId}_${index + 1}` : undefined,
        sourcePartId: part.sourcePartId ?? originalId,
        name: part.name
          ? `${part.name} ${index + 1}`
          : part.partName
            ? `${part.partName} ${index + 1}`
            : undefined,
        partName: part.partName ? `${part.partName} ${index + 1}` : undefined,
        aroundIndex: index,
      })
    }
  }
  return expanded
}

export function resolveConnectedParts(parts: PartComposePartInput[]): PartComposePartInput[] {
  const resolved: PartComposePartInput[] = []
  const hasRelationPlacement = (part: PartComposePartInput) =>
    part.connectTo != null ||
    part.alignAbove != null ||
    part.alignBeside != null ||
    part.offsetFrom != null ||
    part.centeredOn != null ||
    part.around != null
  const findParent = (connectTo: string | number | undefined): PartComposePartInput | undefined => {
    if (typeof connectTo === 'number') return resolved[connectTo]
    if (typeof connectTo !== 'string') return undefined
    const normalized = normalizePartKind(connectTo)
    return resolved.find(
      (part) =>
        part.id === connectTo ||
        part.sourcePartId === connectTo ||
        part.name === connectTo ||
        part.kind === connectTo ||
        part.partType === connectTo ||
        (normalized !== null && normalizedPartKind(part) === normalized),
    )
  }

  parts.forEach((part) => {
    const kind = normalizedPartKind(part)
    if (part.position && !hasRelationPlacement(part)) {
      resolved.push({
        ...part,
        position: positionWithArrayOffset(part, part.position),
      })
      return
    }

    const connectionParent = findParent(part.connectTo)
    if (connectionParent) {
      const parentKind = normalizedPartKind(connectionParent)
      const parentCenter = partCenter(connectionParent, parentKind)
      const parentPoint = part.connectPoint ?? part.anchor ?? 'front'
      const childPoint = part.childPoint ?? part.childAnchor ?? 'back'
      resolved.push({
        ...part,
        position: positionWithArrayOffset(
          part,
          add(
            add(parentCenter, connectionPointOffset(connectionParent, parentKind, parentPoint)),
            negate(connectionPointOffset(part, kind, childPoint)),
          ),
        ),
      })
      return
    }

    const aboveParent = findParent(part.alignAbove)
    if (aboveParent) {
      const side = partSide(part.side)
      resolved.push({
        ...part,
        position: positionWithArrayOffset(
          part,
          side === 'bottom'
            ? alignBesidePosition(
                aboveParent,
                normalizedPartKind(aboveParent),
                { ...part, side },
                kind,
              )
            : alignAbovePosition(aboveParent, normalizedPartKind(aboveParent), part, kind),
        ),
      })
      return
    }

    const besideParent = findParent(part.alignBeside)
    if (besideParent) {
      resolved.push({
        ...part,
        position: positionWithArrayOffset(
          part,
          alignBesidePosition(besideParent, normalizedPartKind(besideParent), part, kind),
        ),
      })
      return
    }

    const offsetParent = findParent(part.offsetFrom)
    if (offsetParent) {
      resolved.push({
        ...part,
        side: part.offsetDirection ?? part.side,
        relationGap: (part.relationGap ?? 0) + (part.offsetDistance ?? 0),
        position: positionWithArrayOffset(
          part,
          alignBesidePosition(
            offsetParent,
            normalizedPartKind(offsetParent),
            {
              ...part,
              side: part.offsetDirection ?? part.side,
              relationGap: (part.relationGap ?? 0) + (part.offsetDistance ?? 0),
            },
            kind,
          ),
        ),
      })
      return
    }

    const centerParent = findParent(part.centeredOn)
    if (centerParent) {
      resolved.push({
        ...part,
        position: positionWithArrayOffset(
          part,
          centeredOnPosition(centerParent, normalizedPartKind(centerParent), part, kind),
        ),
      })
      return
    }

    const aroundParent = findParent(part.around)
    if (aroundParent) {
      resolved.push({
        ...part,
        position: positionWithArrayOffset(
          part,
          aroundPosition(aroundParent, normalizedPartKind(aroundParent), part, kind),
        ),
      })
      return
    }

    resolved.push(part)
  })

  return resolved
}

export interface PartRelationshipLayoutInput {
  parts: PartComposePartInput[]
}

export interface BoundingBox {
  min: Vec3
  max: Vec3
  size: Vec3
}

export interface LayoutAnchor {
  id: string
  role: string
  position: Vec3
}

export interface PartPlacement {
  partId: string
  kind: string
  semanticRole?: string
  anchorId?: string
  position: Vec3
}

export interface LayoutPlan {
  family: FamilyId | string
  layoutFamily?: LayoutFamilyId
  anchors: LayoutAnchor[]
  placements: PartPlacement[]
  bounds: BoundingBox
  parts: PartComposePartInput[]
}

export interface LayoutProfileInput {
  family: FamilyId | string
  layoutFamily?: LayoutFamilyId
  primarySemanticRole?: string
}

export interface LayoutDimensions {
  length?: number
  width?: number
  height?: number
  diameter?: number
}

export function resolvePlacedParts(plan: PartRelationshipLayoutInput): PartComposePartInput[] {
  return resolveConnectedParts(expandArrayParts(expandAroundDistributedParts(plan.parts)))
}

export function layoutNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

export function layoutKind(part: PartComposePartInput) {
  return String(part.kind ?? part.partType ?? part.type ?? part.id ?? 'part')
}

export function layoutRole(part: PartComposePartInput) {
  return typeof part.semanticRole === 'string' && part.semanticRole.trim()
    ? part.semanticRole.trim()
    : layoutKind(part)
}

export function normalizeLayoutAnchor(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (normalized === 'center') return 'shell_center'
  return normalized
}

export function layoutOffset(value: unknown): Vec3 {
  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value
    return [
      typeof x === 'number' && Number.isFinite(x) ? x : 0,
      typeof y === 'number' && Number.isFinite(y) ? y : 0,
      typeof z === 'number' && Number.isFinite(z) ? z : 0,
    ]
  }
  if (typeof value === 'number' && Number.isFinite(value)) return [value, 0, 0]
  return [0, 0, 0]
}

export function addLayoutOffset(position: Vec3, offset: unknown): Vec3 {
  return add(position, layoutOffset(offset))
}

export function arrayAlongAxis(value: unknown): PartAxis | undefined {
  const normalized = normalizeLayoutAnchor(value)
  if (normalized === 'x' || normalized === 'length') return 'x'
  if (normalized === 'y' || normalized === 'height' || normalized === 'vertical') return 'y'
  if (normalized === 'z' || normalized === 'width' || normalized === 'depth') return 'z'
  return undefined
}

export function layoutAxisSize(axis: PartAxis, dimensions: Required<LayoutDimensions>) {
  if (axis === 'x') return dimensions.length
  if (axis === 'y') return dimensions.height
  return dimensions.width
}

export function distributeArrayAlong(
  part: PartComposePartInput,
  position: Vec3,
  dimensions: Required<LayoutDimensions>,
) {
  const axis = arrayAlongAxis(part.arrayAlong)
  const count = axis ? clampInt(part.count, 1, 1, 64) : 1
  if (!axis || count <= 1) return [{ part, position }]
  const spacing = clamp(
    part.array?.spacing ?? part.arrayOffset,
    (layoutAxisSize(axis, dimensions) * 0.72) / Math.max(1, count - 1),
    0.02,
    100,
  )
  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  return Array.from({ length: count }, (_, index) => {
    const nextPosition: Vec3 = [...position]
    nextPosition[axisIndex] += (index - (count - 1) / 2) * spacing
    return {
      part: {
        ...part,
        id: part.id ? `${part.id}_${index + 1}` : undefined,
        sourcePartId: part.sourcePartId ? `${part.sourcePartId}_${index + 1}` : undefined,
        count: undefined,
        arrayAlong: undefined,
        arrayOffset: undefined,
      },
      position: nextPosition,
    }
  })
}

export function inferLayoutFamily(profile: LayoutProfileInput): LayoutFamilyId | undefined {
  if (profile.layoutFamily) return profile.layoutFamily
  switch (profile.family) {
    case 'pump':
    case 'compressor':
    case 'fan':
    case 'fluid_machine':
      return 'rotating_machine_layout'
    case 'tank':
    case 'reactor':
    case 'process_equipment':
    case 'heat_exchanger':
      return 'vessel_layout'
    case 'conveyor':
    case 'grate_cooler':
    case 'material_handling':
      return 'linear_transport_layout'
    case 'machine_tool':
    case 'electrical':
    case 'kiosk':
    case 'forming_machine':
      return 'box_enclosure_layout'
    default:
      return undefined
  }
}

export function anchorForRole(layoutFamily: LayoutFamilyId | undefined, role: string) {
  const normalized = role.toLowerCase()
  if (layoutFamily === 'rotating_machine_layout') {
    if (/base|skid|support/.test(normalized)) return 'base'
    if (/motor|drive/.test(normalized)) return 'drive'
    if (/casing|volute|body|compressor/.test(normalized)) return 'process_body'
    if (/inlet|suction/.test(normalized)) return 'inlet'
    if (/outlet|discharge/.test(normalized)) return 'outlet'
  }
  if (layoutFamily === 'vessel_layout') {
    if (/shell|vessel|tank|reactor|body/.test(normalized)) return 'shell'
    if (/support|base|skid/.test(normalized)) return 'support'
    if (/top|inlet|feed|manway/.test(normalized)) return 'top_nozzle'
    if (/drain|outlet|discharge/.test(normalized)) return 'side_nozzle'
    if (/ladder|platform|access/.test(normalized)) return 'access'
  }
  if (layoutFamily === 'linear_transport_layout') {
    if (/frame|support|leg/.test(normalized)) return 'frame'
    if (/roller|flight|slat/.test(normalized)) return 'repeaters'
    if (/belt|surface|trough|cover/.test(normalized)) return 'surface'
    if (/motor|drive/.test(normalized)) return 'drive'
  }
  if (layoutFamily === 'box_enclosure_layout' || layoutFamily === 'generic_industrial_layout') {
    if (/base|skid|foot/.test(normalized)) return 'base'
    if (/body|enclosure|cabinet|chamber|frame/.test(normalized)) return 'body'
    if (/control|display|screen/.test(normalized)) return 'controls'
    if (/panel|door|window|opening|plate/.test(normalized)) return 'front_panel'
    if (/vent|label|nameplate|warning/.test(normalized)) return 'details'
  }
  return 'body'
}

export function layoutAnchors(
  layoutFamily: LayoutFamilyId | undefined,
  dimensions: Required<LayoutDimensions>,
) {
  const length = dimensions.length
  const width = dimensions.width
  const height = dimensions.height
  const internal: LayoutAnchor[] = [
    { id: 'shell_center', role: 'shell_center', position: [0, height * 0.52, 0] },
    { id: 'top', role: 'top', position: [0, height, 0] },
    { id: 'bottom', role: 'bottom', position: [0, 0, 0] },
    { id: 'front', role: 'front', position: [0, height * 0.52, width * 0.52] },
    { id: 'back', role: 'back', position: [0, height * 0.52, -width * 0.52] },
    { id: 'left', role: 'left', position: [-length * 0.52, height * 0.52, 0] },
    { id: 'right', role: 'right', position: [length * 0.52, height * 0.52, 0] },
    { id: 'drive_side', role: 'drive_side', position: [-length * 0.42, height * 0.42, 0] },
    { id: 'service_side', role: 'service_side', position: [0, height * 0.55, width * 0.58] },
  ]
  const rotating: LayoutAnchor[] = [
    { id: 'base', role: 'support_base', position: [0, height * 0.08, 0] },
    { id: 'drive', role: 'drive_motor', position: [-length * 0.28, height * 0.42, 0] },
    { id: 'process_body', role: 'main_casing', position: [length * 0.18, height * 0.42, 0] },
    { id: 'inlet', role: 'inlet_port', position: [length * 0.35, height * 0.42, width * 0.45] },
    { id: 'outlet', role: 'outlet_port', position: [length * 0.22, height * 0.68, 0] },
    { id: 'shell_center', role: 'shell_center', position: [0, height * 0.48, 0] },
    { id: 'drive_side', role: 'drive_side', position: [-length * 0.42, height * 0.36, 0] },
    {
      id: 'service_side',
      role: 'service_side',
      position: [length * 0.18, height * 0.72, width * 0.55],
    },
  ]
  const vessel: LayoutAnchor[] = [
    { id: 'shell', role: 'vessel_shell', position: [0, height * 0.52, 0] },
    { id: 'shell_center', role: 'shell_center', position: [0, height * 0.52, 0] },
    { id: 'support', role: 'support_base', position: [0, height * 0.08, 0] },
    { id: 'top_nozzle', role: 'top_nozzle', position: [0, height * 1.03, 0] },
    { id: 'side_nozzle', role: 'side_nozzle', position: [0, height * 0.48, width * 0.56] },
    {
      id: 'access',
      role: 'access_platform',
      position: [-length * 0.44, height * 0.5, width * 0.52],
    },
    { id: 'drive_side', role: 'drive_side', position: [-length * 0.45, height * 0.22, 0] },
    {
      id: 'service_side',
      role: 'service_side',
      position: [-length * 0.44, height * 0.5, width * 0.52],
    },
  ]
  const linear: LayoutAnchor[] = [
    { id: 'frame', role: 'transport_frame', position: [0, height * 0.42, 0] },
    { id: 'repeaters', role: 'repeating_elements', position: [0, height * 0.7, 0] },
    { id: 'surface', role: 'transport_surface', position: [0, height * 0.75, 0] },
    { id: 'drive', role: 'drive_motor', position: [-length * 0.44, height * 0.42, 0] },
    { id: 'shell_center', role: 'shell_center', position: [0, height * 0.48, 0] },
    { id: 'drive_side', role: 'drive_side', position: [-length * 0.48, height * 0.42, 0] },
    { id: 'service_side', role: 'service_side', position: [0, height * 0.68, width * 0.55] },
  ]
  const box: LayoutAnchor[] = [
    { id: 'base', role: 'support_base', position: [0, height * 0.06, 0] },
    { id: 'body', role: 'enclosure_body', position: [0, height * 0.52, 0] },
    { id: 'shell_center', role: 'shell_center', position: [0, height * 0.52, 0] },
    { id: 'front_panel', role: 'front_panel', position: [0, height * 0.55, width * 0.51] },
    {
      id: 'controls',
      role: 'control_panel',
      position: [length * 0.32, height * 0.58, width * 0.53],
    },
    {
      id: 'details',
      role: 'detail_elements',
      position: [-length * 0.3, height * 0.68, width * 0.53],
    },
    { id: 'drive_side', role: 'drive_side', position: [-length * 0.46, height * 0.38, 0] },
    {
      id: 'service_side',
      role: 'service_side',
      position: [length * 0.46, height * 0.58, width * 0.52],
    },
  ]
  const mergeInternal = (anchors: LayoutAnchor[]) => {
    const ids = new Set(anchors.map((anchor) => anchor.id))
    return [...anchors, ...internal.filter((anchor) => !ids.has(anchor.id))]
  }
  switch (layoutFamily) {
    case 'rotating_machine_layout':
      return mergeInternal(rotating)
    case 'vessel_layout':
      return mergeInternal(vessel)
    case 'linear_transport_layout':
      return mergeInternal(linear)
    case 'box_enclosure_layout':
    case 'generic_industrial_layout':
      return mergeInternal(box)
    default:
      return mergeInternal(box)
  }
}

export function sideAnchorForPart(part: PartComposePartInput) {
  return normalizeLayoutAnchor(part.anchor) ?? normalizeLayoutAnchor(part.side)
}

export function roleKey(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : undefined
}

export function attachRolePosition(
  part: PartComposePartInput,
  parent: PartPlacement | undefined,
  parentPart: PartComposePartInput | undefined,
  dimensions: Required<LayoutDimensions>,
): Vec3 | undefined {
  if (!parent || !parentPart) return undefined
  const anchor = sideAnchorForPart(part) ?? 'shell_center'
  const parentExtents = partHalfExtents(parentPart, normalizedPartKind(parentPart))
  const childExtents = partHalfExtents(part, normalizedPartKind(part))
  const center = parent.position
  const along = (axis: PartAxis, sign: 1 | -1) => {
    const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
    const next: Vec3 = [...center]
    next[index] += sign * (parentExtents[index] + childExtents[index] * 0.5)
    return next
  }
  switch (anchor) {
    case 'top':
      return along('y', 1)
    case 'bottom':
      return along('y', -1)
    case 'front':
      return along('z', 1)
    case 'back':
      return along('z', -1)
    case 'left':
      return along('x', -1)
    case 'right':
      return along('x', 1)
    case 'drive_side':
      return [center[0] - dimensions.length * 0.36, center[1], center[2]]
    case 'service_side':
      return [center[0], center[1], center[2] + dimensions.width * 0.58]
    default:
      return center
  }
}

export function resolveLayoutPlan(
  profile: LayoutProfileInput,
  parts: readonly PartComposePartInput[],
  dimensions: LayoutDimensions = {},
): LayoutPlan {
  const resolvedDimensions: Required<LayoutDimensions> = {
    length: layoutNumber(dimensions.length, layoutNumber(dimensions.diameter, 1.6)),
    width: layoutNumber(dimensions.width, layoutNumber(dimensions.diameter, 0.8)),
    height: layoutNumber(dimensions.height, 1.1),
    diameter: layoutNumber(dimensions.diameter, layoutNumber(dimensions.width, 0.8)),
  }
  const layoutFamily = inferLayoutFamily(profile)
  const anchors = layoutAnchors(layoutFamily, resolvedDimensions)
  const anchorMap = new Map(anchors.map((anchor) => [anchor.id, anchor]))
  const placements: PartPlacement[] = []
  const placedParts: PartComposePartInput[] = []
  const rolePlacements = new Map<string, { placement: PartPlacement; part: PartComposePartInput }>()
  const registerPlacement = (
    part: PartComposePartInput,
    index: number,
    anchorId: string,
    position: Vec3,
  ) => {
    const role = layoutRole(part)
    const placement: PartPlacement = {
      partId: String(part.id ?? `${layoutKind(part)}-${index + 1}`),
      kind: layoutKind(part),
      semanticRole: role,
      anchorId,
      position,
    }
    placements.push(placement)
    placedParts.push({ ...part, position })
    const semanticKey = roleKey(role)
    if (semanticKey && !rolePlacements.has(semanticKey))
      rolePlacements.set(semanticKey, { placement, part })
    const kindKey = roleKey(layoutKind(part))
    if (kindKey && !rolePlacements.has(kindKey)) rolePlacements.set(kindKey, { placement, part })
  }
  parts.forEach((part, index) => {
    const role = layoutRole(part)
    const explicitAnchorId = sideAnchorForPart(part)
    const anchorId =
      explicitAnchorId && anchorMap.has(explicitAnchorId)
        ? explicitAnchorId
        : anchorForRole(layoutFamily, role)
    const anchor = anchorMap.get(anchorId) ?? anchors[0]
    const explicitPosition = Array.isArray(part.position) ? (part.position as Vec3) : undefined
    const attachKey = roleKey(part.attachToRole)
    const attached = attachKey ? rolePlacements.get(attachKey) : undefined
    const attachedPosition = attachRolePosition(
      part,
      attached?.placement,
      attached?.part,
      resolvedDimensions,
    )
    const basePosition = addLayoutOffset(
      explicitPosition ??
        attachedPosition ??
        anchor?.position ?? [0, resolvedDimensions.height / 2, 0],
      part.offset,
    )
    for (const expanded of distributeArrayAlong(part, basePosition, resolvedDimensions)) {
      registerPlacement(expanded.part, placedParts.length, anchorId, expanded.position)
    }
  })
  return {
    family: profile.family,
    layoutFamily,
    anchors,
    placements,
    bounds: {
      min: [-resolvedDimensions.length / 2, 0, -resolvedDimensions.width / 2],
      max: [resolvedDimensions.length / 2, resolvedDimensions.height, resolvedDimensions.width / 2],
      size: [resolvedDimensions.length, resolvedDimensions.height, resolvedDimensions.width],
    },
    parts: placedParts,
  }
}

export function resolveLayout(plan: PartRelationshipLayoutInput): PartComposePartInput[]
export function resolveLayout(
  profile: LayoutProfileInput,
  parts: readonly PartComposePartInput[],
  dimensions?: LayoutDimensions,
): LayoutPlan
export function resolveLayout(
  first: PartRelationshipLayoutInput | LayoutProfileInput,
  parts?: readonly PartComposePartInput[],
  dimensions?: LayoutDimensions,
): PartComposePartInput[] | LayoutPlan {
  if (Array.isArray(parts)) return resolveLayoutPlan(first as LayoutProfileInput, parts, dimensions)
  return resolvePlacedParts(first as PartRelationshipLayoutInput)
}
