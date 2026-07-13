import { normalizedPartKind } from './kind'
import type {
  PartComposeInput,
  PartComposeKind,
  PartComposePartInput,
  PartFamilySpec,
  PartRequirementGroup,
} from './types'

function textOf(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase()
  if (Array.isArray(value)) return value.map(textOf).join(' ')
  if (typeof value === 'object' && value !== null) return Object.values(value).map(textOf).join(' ')
  return ''
}

function partIdentityText(part: PartComposePartInput): string {
  return [
    part.kind,
    part.partType,
    part.type,
    part.id,
    part.name,
    part.partName,
    part.style,
    part.variant,
  ]
    .map(textOf)
    .join(' ')
}

export function familySpecForParts(present: PartComposeKind[]): PartFamilySpec {
  const has = (kind: PartComposeKind) => present.includes(kind)
  const group = (
    label: string,
    anyOf: PartComposeKind[],
    defaultPart: PartComposePartInput,
  ): PartRequirementGroup => ({ label, anyOf, defaultPart })

  if (has('desk_top') || has('leg_set') || has('drawer_stack')) {
    return {
      family: 'desk',
      required: [
        group('desktop', ['desk_top'], { kind: 'desk_top' }),
        group('legs/supports', ['leg_set', 'drawer_stack'], { kind: 'leg_set' }),
      ],
      optional: ['drawer_stack'],
      recommendedDetails: [group('drawer stack', ['drawer_stack'], { kind: 'drawer_stack' })],
    }
  }

  if (has('electrical_cabinet') || has('cable_tray')) {
    return {
      family: 'electrical',
      required: [group('cabinet', ['electrical_cabinet'], { kind: 'electrical_cabinet' })],
      optional: ['cable_tray', 'nameplate', 'warning_label', 'vent_slats'],
      recommendedDetails: [
        group('cable tray', ['cable_tray'], {
          kind: 'cable_tray',
          position: [0, 1.08, -0.32],
          length: 1.1,
        }),
        group('nameplate', ['nameplate'], {
          kind: 'nameplate',
          position: [-0.12, 0.36, 0.13],
          length: 0.16,
          width: 0.05,
        }),
        group('warning label', ['warning_label'], {
          kind: 'warning_label',
          position: [-0.12, 0.7, 0.13],
          length: 0.13,
          width: 0.06,
        }),
      ],
    }
  }

  if (has('pipe_run') || has('pipe_elbow')) {
    return {
      family: 'pipe_system',
      required: [group('straight pipe run', ['pipe_run'], { kind: 'pipe_run' })],
      optional: ['pipe_elbow', 'flange_ring', 'valve_body'],
      recommendedDetails: [
        group('elbow/bend', ['pipe_elbow'], {
          kind: 'pipe_elbow',
          position: [0.55, 0.55, 0],
          radius: 0.055,
        }),
        group('flange', ['flange_ring'], {
          kind: 'flange_ring',
          connectTo: 'pipe_run',
          connectPoint: 'open',
          childPoint: 'back',
          axis: 'x',
          radius: 0.09,
        }),
      ],
    }
  }

  if (has('volute_casing') || has('impeller_blades') || has('inlet_port') || has('outlet_port')) {
    return {
      family: 'pump',
      required: [
        group('base/skid', ['skid_base'], { kind: 'skid_base' }),
        group('motor/body', ['ribbed_motor_body', 'rounded_machine_body', 'motor_housing'], {
          kind: 'ribbed_motor_body',
          position: [-0.28, 0.42, 0],
          length: 0.48,
        }),
        group('volute casing', ['volute_casing'], { kind: 'volute_casing' }),
        group('inlet port', ['inlet_port'], {
          kind: 'inlet_port',
          position: [0.22, 0.55, 0.4],
          axis: 'z',
          radius: 0.07,
        }),
        group('outlet port', ['outlet_port'], {
          kind: 'outlet_port',
          position: [0.47, 0.62, 0.12],
          axis: 'x',
          radius: 0.06,
        }),
        group('flange', ['flange_ring'], {
          kind: 'flange_ring',
          position: [0.22, 0.55, 0.54],
          axis: 'z',
          radius: 0.12,
        }),
      ],
      optional: ['impeller_blades', 'control_box', 'vent_slats', 'bolt_pattern'],
      recommendedDetails: [
        group('impeller', ['impeller_blades'], {
          kind: 'impeller_blades',
          position: [0.22, 0.55, 0.24],
          count: 7,
          radius: 0.14,
        }),
        group('nameplate', ['nameplate'], { kind: 'nameplate', position: [-0.28, 0.5, 0.19] }),
        group('warning label', ['warning_label'], {
          kind: 'warning_label',
          position: [0.04, 0.62, 0.22],
        }),
      ],
    }
  }

  if (has('mixer_blades') || has('propeller_blade_set')) {
    return {
      family: 'unknown',
      required: [],
      optional: [],
      recommendedDetails: [],
    }
  }

  if (has('fan_blade') || has('radial_blades') || has('protective_grill')) {
    return {
      family: 'fan',
      required: [
        group('base', ['circular_base'], { kind: 'circular_base' }),
        group('pole', ['vertical_pole'], { kind: 'vertical_pole' }),
        group('support bracket', ['support_bracket'], { kind: 'support_bracket' }),
        group('motor housing', ['motor_housing'], { kind: 'motor_housing' }),
        group('editable fan blades', ['fan_blade', 'radial_blades'], {
          kind: 'fan_blade',
          count: 3,
        }),
        group('protective grill', ['protective_grill'], { kind: 'protective_grill' }),
      ],
      optional: ['control_knob'],
      recommendedDetails: [group('control knob', ['control_knob'], { kind: 'control_knob' })],
    }
  }

  if (has('conveyor_frame') || has('roller_array') || has('belt_surface')) {
    return {
      family: 'conveyor',
      required: [
        group('frame', ['conveyor_frame'], { kind: 'conveyor_frame' }),
        group('rollers', ['roller_array'], { kind: 'roller_array' }),
        group('belt', ['belt_surface'], { kind: 'belt_surface' }),
      ],
      optional: ['ribbed_motor_body', 'gearbox_body', 'warning_label'],
      recommendedDetails: [
        group('drive motor', ['ribbed_motor_body'], {
          kind: 'ribbed_motor_body',
          position: [0.72, 0.5, 0.36],
          radius: 0.08,
          length: 0.24,
        }),
        group('warning label', ['warning_label'], {
          kind: 'warning_label',
          position: [0, 0.6, 0.24],
        }),
      ],
    }
  }

  if (
    has('tube_frame') ||
    has('chain_loop') ||
    (has('wheel_set') && (has('handlebar') || has('saddle') || has('fork')))
  ) {
    return {
      family: 'bicycle',
      required: [
        group('wheels', ['wheel_set', 'wheel'], {
          kind: 'wheel_set',
          count: 2,
          semanticRole: 'bicycle_tire',
        }),
        group('frame', ['tube_frame'], { kind: 'tube_frame', semanticRole: 'bicycle_frame' }),
        group('fork', ['fork'], { kind: 'fork', semanticRole: 'bicycle_fork' }),
        group('handlebar', ['handlebar'], { kind: 'handlebar' }),
        group('saddle', ['saddle'], { kind: 'saddle' }),
        group('chain', ['chain_loop'], { kind: 'chain_loop' }),
      ],
      optional: [],
      recommendedDetails: [],
    }
  }

  if (
    has('aircraft_fuselage') ||
    has('aircraft_wing') ||
    has('aircraft_engine') ||
    has('aircraft_vertical_stabilizer') ||
    has('aircraft_horizontal_stabilizer') ||
    has('aircraft_landing_gear')
  ) {
    return {
      family: 'aircraft',
      required: [
        group('fuselage', ['aircraft_fuselage', 'streamlined_body'], {
          kind: 'aircraft_fuselage',
          id: 'fuselage',
        }),
        group('main wings', ['aircraft_wing', 'lofted_panel', 'airfoil_blade'], {
          kind: 'aircraft_wing',
          id: 'main-wings',
        }),
        group('aft engines', ['aircraft_engine'], { kind: 'aircraft_engine', id: 'engines' }),
        group('vertical stabilizer', ['aircraft_vertical_stabilizer'], {
          kind: 'aircraft_vertical_stabilizer',
          id: 'vertical-stabilizer',
        }),
        group('horizontal stabilizer', ['aircraft_horizontal_stabilizer'], {
          kind: 'aircraft_horizontal_stabilizer',
          id: 'horizontal-stabilizer',
        }),
        group('landing gear', ['aircraft_landing_gear'], {
          kind: 'aircraft_landing_gear',
          id: 'landing-gear',
        }),
      ],
      optional: ['window_strip', 'window_panel'],
      recommendedDetails: [],
    }
  }

  if (
    has('body_shell') ||
    (has('wheel_set') && (has('window_strip') || has('light_pair') || has('bar_pair')))
  ) {
    return {
      family: 'vehicle',
      required: [
        group('body', ['body_shell'], { kind: 'body_shell', semanticRole: 'vehicle_body' }),
        group('wheels', ['wheel_set'], {
          kind: 'wheel_set',
          count: 4,
          semanticRole: 'vehicle_tire',
        }),
        group('windows', ['window_strip'], {
          kind: 'window_strip',
          semanticRole: 'vehicle_window',
          variant: 'vehicle_glasshouse',
        }),
        group('lights', ['light_pair'], { kind: 'light_pair', semanticRole: 'headlight' }),
        group('bumper', ['bar_pair'], { kind: 'bar_pair' }),
      ],
      optional: ['seam_ring', 'nameplate'],
      recommendedDetails: [
        group('panel seam', ['seam_ring'], { kind: 'seam_ring', axis: 'x', radius: 0.18 }),
      ],
    }
  }

  if (has('valve_body') || has('handwheel')) {
    return {
      family: 'valve',
      required: [
        group('valve body', ['valve_body'], { kind: 'valve_body' }),
        group('handwheel', ['handwheel'], {
          kind: 'handwheel',
          connectTo: 'valve_body',
          connectPoint: 'stem',
          childPoint: 'center',
        }),
      ],
      optional: ['flange_ring', 'bolt_pattern'],
      recommendedDetails: [
        group('flanged ends', ['flange_ring'], { kind: 'flange_ring', radius: 0.12 }),
      ],
    }
  }

  return { family: 'unknown', required: [], optional: [], recommendedDetails: [] }
}

export function partKinds(parts: PartComposePartInput[]): PartComposeKind[] {
  return Array.from(
    new Set(parts.map((part) => normalizedPartKind(part)).filter(Boolean)),
  ) as PartComposeKind[]
}

export function isAircraftIntent(input: PartComposeInput): boolean {
  const text = [
    input.name,
    input.partName,
    input.geometryBrief,
    ...(input.parts ?? []).map(partIdentityText),
  ]
    .map(textOf)
    .join(' ')
    .toLowerCase()
  return /aircraft|airplane|airliner|plane|jet|boeing|airbus|fuselage|wing|t-tail|飞机|客机|波音|空客|机翼|机身/.test(
    text,
  )
}
