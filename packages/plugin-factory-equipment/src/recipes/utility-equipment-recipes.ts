import type {
  EquipmentParamValue,
  SemanticRecipeDefinition,
  SemanticRecipeEditableParam,
  SemanticRecipePort,
} from '@pascal-app/core'
import { numberParam, stringParam, type FactorySemanticRecipePart } from './common'

// ─── Shared helpers ─────────────────────────────────────────────────────────

function vec3(x: number, y: number, z: number): [number, number, number] {
  return [x, y, z]
}

function colorParam(
  key: string,
  label: string,
  role: string,
  color: string,
): SemanticRecipeEditableParam {
  return {
    key,
    label,
    kind: 'color',
    defaultValue: color,
    effects: [
      { kind: 'set-param' },
      { kind: 'set-part-material', partRole: role, property: 'color' },
    ],
  }
}

function boxPart(input: {
  id: string
  role: string
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
  color: string
  kind?: string
  roughness?: number
  metalness?: number
}): FactorySemanticRecipePart {
  return {
    id: input.id,
    kind: input.kind ?? 'generic_body',
    semanticRole: input.role,
    position: vec3(input.x, input.y, input.z),
    length: input.length,
    width: input.width,
    height: input.height,
    primaryColor: input.color,
    material: {
      properties: {
        color: input.color,
        roughness: input.roughness ?? 0.5,
        metalness: input.metalness ?? 0.3,
      },
    },
  }
}

function cylinderPart(input: {
  id: string
  role: string
  kind?: string
  axis?: 'x' | 'y' | 'z'
  x: number
  y: number
  z: number
  length: number
  radius: number
  color: string
  roughness?: number
  metalness?: number
}): FactorySemanticRecipePart {
  return {
    id: input.id,
    kind: input.kind ?? 'cylindrical_tank',
    semanticRole: input.role,
    axis: input.axis ?? 'y',
    position: vec3(input.x, input.y, input.z),
    length: input.length,
    height: input.length,
    radius: input.radius,
    primaryColor: input.color,
    material: {
      properties: {
        color: input.color,
        roughness: input.roughness ?? 0.46,
        metalness: input.metalness ?? 0.35,
      },
    },
  }
}

// ─── 1. Fired Heater (加热炉) ────────────────────────────────────────────────

export const FIRED_HEATER_RECIPE_ID = 'factory:fired-heater'

export const FIRED_HEATER_EDITABLE_PART_ROLES = [
  'heater_radiant_box',
  'convection_bank',
  'burner',
  'heater_stack_stub',
] as const

export const FIRED_HEATER_CORE_PART_ROLES = ['heater_radiant_box', 'burner'] as const

export const FIRED_HEATER_EDITABLE_PARAMS: readonly SemanticRecipeEditableParam[] = [
  colorParam('chamberColor', 'Chamber color', 'heater_radiant_box', '#78716c'),
  colorParam('stackColor', 'Stack color', 'heater_stack_stub', '#cbd5e1'),
]

export function buildFiredHeaterProfileParts(input: {
  length: number
  width: number
  height: number
  params?: Record<string, EquipmentParamValue>
}): FactorySemanticRecipePart[] {
  const chamberColor = stringParam(input.params, 'chamberColor', '#78716c')
  const stackColor = stringParam(input.params, 'stackColor', '#cbd5e1')
  const burnerCount = Math.max(2, Math.round(numberParam(input.params, 'burnerCount', 4)))
  const radiantHeight = input.height * 0.62
  const convectionHeight = input.height * 0.2

  const parts: FactorySemanticRecipePart[] = [
    boxPart({
      id: 'radiant_box',
      role: 'heater_radiant_box',
      x: 0,
      y: radiantHeight / 2,
      z: 0,
      length: input.length,
      width: input.width,
      height: radiantHeight,
      color: chamberColor,
      roughness: 0.62,
      metalness: 0.24,
    }),
    boxPart({
      id: 'convection_bank',
      role: 'convection_bank',
      x: -input.length * 0.18,
      y: radiantHeight + convectionHeight / 2,
      z: 0,
      length: input.length * 0.62,
      width: input.width * 0.82,
      height: convectionHeight,
      color: '#8a8578',
      roughness: 0.58,
      metalness: 0.28,
    }),
    cylinderPart({
      id: 'stack_stub',
      role: 'heater_stack_stub',
      kind: 'chimney_stack',
      x: -input.length * 0.18,
      y: radiantHeight + convectionHeight + input.height * 0.09,
      z: 0,
      length: Math.max(1.2, input.height * 0.18),
      radius: Math.max(0.14, input.width * 0.07),
      color: stackColor,
      roughness: 0.52,
      metalness: 0.22,
    }),
  ]

  for (let i = 0; i < burnerCount; i++) {
    const fraction = burnerCount === 1 ? 0 : i / (burnerCount - 1) - 0.5
    parts.push({
      id: `burner_${i}`,
      kind: 'burner_nozzle',
      semanticRole: 'burner',
      position: vec3(fraction * input.length * 0.72, input.height * 0.06, input.width * 0.44),
      radius: Math.max(0.08, input.width * 0.035),
      length: Math.max(0.22, input.height * 0.05),
      primaryColor: '#3f3f46',
      material: { properties: { color: '#3f3f46', roughness: 0.44, metalness: 0.6 } },
    })
  }

  parts.push(
    { id: 'feed_inlet', kind: 'inlet_port', semanticRole: 'feed_in', side: 'left' },
    { id: 'product_outlet', kind: 'outlet_port', semanticRole: 'product_out', side: 'right' },
    { id: 'fuel_gas_inlet', kind: 'inlet_port', semanticRole: 'fuel_gas', side: 'front' },
    { id: 'flue_gas_outlet', kind: 'outlet_port', semanticRole: 'flue_gas', side: 'top' },
  )
  return parts
}

export function buildFiredHeaterPorts(
  input: { height?: number; medium?: string } = {},
): SemanticRecipePort[] {
  const height = input.height ?? 6.5
  const medium = input.medium ?? 'material'
  return [
    { id: 'feed_in', role: 'process-inlet', medium, side: 'left', height: height * 0.72, offset: 0 },
    { id: 'product_out', role: 'process-outlet', medium, side: 'right', height: height * 0.68, offset: 0 },
    { id: 'fuel_gas_in', role: 'process-inlet', medium: 'gas', side: 'front', height: height * 0.08, offset: 0.2 },
    { id: 'flue_gas_out', role: 'process-outlet', medium: 'gas', side: 'top', height: height * 0.98, offset: 0 },
  ]
}

export const firedHeaterRecipe: SemanticRecipeDefinition = {
  id: FIRED_HEATER_RECIPE_ID,
  label: 'Fired heater',
  family: 'fired_heater',
  acceptsProfiles: [
    'fired_heater',
    'heater',
    'refinery.crude_fired_heater',
    'refinery.delayed_coker_unit',
    'refinery.sulfur_recovery_unit',
  ],
  paramSchema: {
    fields: ['length', 'width', 'height', 'depth', 'burnerCount', 'chamberColor', 'stackColor'],
  },
  defaultEnvelope: { length: 4.5, width: 3.2, height: 7.8 },
  editableParams: FIRED_HEATER_EDITABLE_PARAMS,
  editablePartRoles: FIRED_HEATER_EDITABLE_PART_ROLES,
  corePartRoles: FIRED_HEATER_CORE_PART_ROLES,
  compose: ({ params, envelope, medium }) => {
    const length = envelope?.length ?? 4.5
    const width = envelope?.width ?? 3.2
    const height = envelope?.height ?? 7.8
    return {
      parts: buildFiredHeaterProfileParts({ length, width, height, params }),
      ports: buildFiredHeaterPorts({ height, medium }),
      envelope: { length, width, height, tolerance: envelope?.tolerance },
      editableParams: FIRED_HEATER_EDITABLE_PARAMS,
      editablePartRoles: [...FIRED_HEATER_EDITABLE_PART_ROLES],
      corePartRoles: [...FIRED_HEATER_CORE_PART_ROLES],
      primarySemanticRole: 'heater_radiant_box',
    }
  },
}

// ─── 2. Shell-and-Tube Heat Exchanger (换热器) ──────────────────────────────

export const SHELL_TUBE_EXCHANGER_RECIPE_ID = 'factory:shell-tube-exchanger'

export const SHELL_TUBE_EXCHANGER_EDITABLE_PART_ROLES = [
  'exchanger_shell',
  'tube_bundle',
  'channel_head',
  'saddle_support',
] as const

export const SHELL_TUBE_EXCHANGER_CORE_PART_ROLES = ['exchanger_shell'] as const

export const SHELL_TUBE_EXCHANGER_EDITABLE_PARAMS: readonly SemanticRecipeEditableParam[] = [
  colorParam('shellColor', 'Shell color', 'exchanger_shell', '#cbd5e1'),
]

export function buildShellTubeExchangerProfileParts(input: {
  length: number
  width: number
  height: number
  params?: Record<string, EquipmentParamValue>
}): FactorySemanticRecipePart[] {
  const shellColor = stringParam(input.params, 'shellColor', '#cbd5e1')
  const shellRadius = Math.max(0.2, numberParam(input.params, 'shellRadius', input.width * 0.4))
  const shellLength = input.length * 0.78
  const shellY = Math.max(shellRadius * 1.6, input.height * 0.52)

  return [
    cylinderPart({
      id: 'shell',
      role: 'exchanger_shell',
      kind: 'heat_exchanger',
      axis: 'x',
      x: 0,
      y: shellY,
      z: 0,
      length: shellLength,
      radius: shellRadius,
      color: shellColor,
      roughness: 0.42,
      metalness: 0.48,
    }),
    cylinderPart({
      id: 'channel_head',
      role: 'channel_head',
      kind: 'heat_exchanger',
      axis: 'x',
      x: -shellLength / 2 - shellRadius * 0.55,
      y: shellY,
      z: 0,
      length: shellRadius * 1.1,
      radius: shellRadius * 1.04,
      color: '#b6bfcc',
      roughness: 0.44,
      metalness: 0.46,
    }),
    cylinderPart({
      id: 'rear_head',
      role: 'tube_bundle',
      kind: 'heat_exchanger',
      axis: 'x',
      x: shellLength / 2 + shellRadius * 0.45,
      y: shellY,
      z: 0,
      length: shellRadius * 0.9,
      radius: shellRadius * 0.98,
      color: '#b6bfcc',
      roughness: 0.44,
      metalness: 0.46,
    }),
    boxPart({
      id: 'saddle_front',
      role: 'saddle_support',
      x: -shellLength * 0.28,
      y: shellY - shellRadius - input.height * 0.1,
      z: 0,
      length: shellRadius * 1.4,
      width: shellRadius * 1.7,
      height: Math.max(0.18, input.height * 0.2),
      color: '#6b7280',
      roughness: 0.6,
      metalness: 0.3,
    }),
    boxPart({
      id: 'saddle_rear',
      role: 'saddle_support',
      x: shellLength * 0.28,
      y: shellY - shellRadius - input.height * 0.1,
      z: 0,
      length: shellRadius * 1.4,
      width: shellRadius * 1.7,
      height: Math.max(0.18, input.height * 0.2),
      color: '#6b7280',
      roughness: 0.6,
      metalness: 0.3,
    }),
    { id: 'hot_in', kind: 'inlet_port', semanticRole: 'hot_in', side: 'top' },
    { id: 'hot_out', kind: 'outlet_port', semanticRole: 'hot_out', side: 'bottom' },
    { id: 'cold_in', kind: 'inlet_port', semanticRole: 'cold_in', side: 'left' },
    { id: 'cold_out', kind: 'outlet_port', semanticRole: 'cold_out', side: 'right' },
  ]
}

export function buildShellTubeExchangerPorts(
  input: { height?: number; medium?: string } = {},
): SemanticRecipePort[] {
  const height = input.height ?? 2
  const medium = input.medium ?? 'material'
  return [
    { id: 'hot_in', role: 'process-inlet', medium, side: 'top', height: height * 0.9, offset: -0.25 },
    { id: 'hot_out', role: 'process-outlet', medium, side: 'bottom', height: height * 0.1, offset: 0.25 },
    { id: 'cold_in', role: 'process-inlet', medium, side: 'left', height: height * 0.5, offset: 0 },
    { id: 'cold_out', role: 'process-outlet', medium, side: 'right', height: height * 0.5, offset: 0 },
  ]
}

export const shellTubeExchangerRecipe: SemanticRecipeDefinition = {
  id: SHELL_TUBE_EXCHANGER_RECIPE_ID,
  label: 'Shell-and-tube heat exchanger',
  family: 'heat_exchanger',
  acceptsProfiles: [
    'heat_exchanger',
    'exchanger',
    'refinery.feed_preheat_exchanger',
    'thermal_power.surface_condenser',
  ],
  paramSchema: {
    fields: ['length', 'width', 'height', 'shellRadius', 'tubePasses', 'shellColor'],
  },
  defaultEnvelope: { length: 5.5, width: 1.6, height: 2 },
  editableParams: SHELL_TUBE_EXCHANGER_EDITABLE_PARAMS,
  editablePartRoles: SHELL_TUBE_EXCHANGER_EDITABLE_PART_ROLES,
  corePartRoles: SHELL_TUBE_EXCHANGER_CORE_PART_ROLES,
  compose: ({ params, envelope, medium }) => {
    const length = envelope?.length ?? 5.5
    const width = envelope?.width ?? 1.6
    const height = envelope?.height ?? 2
    return {
      parts: buildShellTubeExchangerProfileParts({ length, width, height, params }),
      ports: buildShellTubeExchangerPorts({ height, medium }),
      envelope: { length, width, height, tolerance: envelope?.tolerance },
      editableParams: SHELL_TUBE_EXCHANGER_EDITABLE_PARAMS,
      editablePartRoles: [...SHELL_TUBE_EXCHANGER_EDITABLE_PART_ROLES],
      corePartRoles: [...SHELL_TUBE_EXCHANGER_CORE_PART_ROLES],
      primarySemanticRole: 'exchanger_shell',
    }
  },
}

// ─── 3. Utility Boiler (锅炉) ────────────────────────────────────────────────

export const UTILITY_BOILER_RECIPE_ID = 'factory:utility-boiler'

export const UTILITY_BOILER_EDITABLE_PART_ROLES = [
  'boiler_body',
  'steam_drum',
  'mud_drum',
  'boiler_stack',
] as const

export const UTILITY_BOILER_CORE_PART_ROLES = ['boiler_body', 'steam_drum'] as const

export const UTILITY_BOILER_EDITABLE_PARAMS: readonly SemanticRecipeEditableParam[] = [
  colorParam('bodyColor', 'Body color', 'boiler_body', '#a1a1aa'),
  colorParam('stackColor', 'Stack color', 'boiler_stack', '#cbd5e1'),
]

export function buildUtilityBoilerProfileParts(input: {
  length: number
  width: number
  height: number
  params?: Record<string, EquipmentParamValue>
}): FactorySemanticRecipePart[] {
  const bodyColor = stringParam(input.params, 'bodyColor', '#a1a1aa')
  const stackColor = stringParam(input.params, 'stackColor', '#cbd5e1')
  const drumLength = Math.max(1.4, numberParam(input.params, 'drumLength', input.length * 0.75))
  const drumRadius = Math.max(0.2, numberParam(input.params, 'drumRadius', input.width * 0.14))
  const stackHeight = Math.max(1.4, numberParam(input.params, 'stackHeight', input.height * 0.5))
  const bodyHeight = input.height * 0.58

  return [
    boxPart({
      id: 'body',
      role: 'boiler_body',
      kind: 'fired_heater',
      x: 0,
      y: bodyHeight / 2,
      z: 0,
      length: input.length,
      width: input.width,
      height: bodyHeight,
      color: bodyColor,
      roughness: 0.58,
      metalness: 0.28,
    }),
    cylinderPart({
      id: 'steam_drum',
      role: 'steam_drum',
      axis: 'x',
      x: 0,
      y: bodyHeight + drumRadius * 1.4,
      z: -input.width * 0.14,
      length: drumLength,
      radius: drumRadius,
      color: '#d4d4d8',
      roughness: 0.44,
      metalness: 0.4,
    }),
    cylinderPart({
      id: 'mud_drum',
      role: 'mud_drum',
      axis: 'x',
      x: 0,
      y: drumRadius * 1.2,
      z: input.width * 0.18,
      length: drumLength * 0.86,
      radius: drumRadius * 0.82,
      color: '#c4c4cc',
      roughness: 0.46,
      metalness: 0.38,
    }),
    cylinderPart({
      id: 'stack',
      role: 'boiler_stack',
      kind: 'chimney_stack',
      x: input.length * 0.3,
      y: bodyHeight + stackHeight / 2,
      z: input.width * 0.28,
      length: stackHeight,
      radius: Math.max(0.16, input.width * 0.06),
      color: stackColor,
      roughness: 0.52,
      metalness: 0.22,
    }),
    { id: 'feedwater_in', kind: 'inlet_port', semanticRole: 'feedwater_in', side: 'left' },
    { id: 'steam_out', kind: 'outlet_port', semanticRole: 'steam_out', side: 'top' },
    { id: 'fuel_gas_in', kind: 'inlet_port', semanticRole: 'fuel_gas_in', side: 'front' },
    { id: 'flue_gas_out', kind: 'outlet_port', semanticRole: 'flue_gas_out', side: 'back' },
  ]
}

export function buildUtilityBoilerPorts(
  input: { height?: number } = {},
): SemanticRecipePort[] {
  const height = input.height ?? 7.2
  return [
    { id: 'feedwater_in', role: 'process-inlet', medium: 'water', side: 'left', height: height * 0.42, offset: 0 },
    { id: 'steam_out', role: 'process-outlet', medium: 'steam', side: 'top', height: height * 0.88, offset: 0 },
    { id: 'fuel_gas_in', role: 'process-inlet', medium: 'gas', side: 'front', height: height * 0.12, offset: 0.25 },
    { id: 'flue_gas_out', role: 'process-outlet', medium: 'gas', side: 'back', height: height * 0.6, offset: 0 },
  ]
}

export const utilityBoilerRecipe: SemanticRecipeDefinition = {
  id: UTILITY_BOILER_RECIPE_ID,
  label: 'Utility boiler',
  family: 'utility_boiler',
  acceptsProfiles: ['utility_boiler', 'boiler', 'refinery.utility_boiler', 'thermal_power.boiler_island'],
  paramSchema: {
    fields: [
      'length',
      'width',
      'height',
      'depth',
      'drumLength',
      'drumRadius',
      'stackHeight',
      'bodyColor',
      'stackColor',
    ],
  },
  defaultEnvelope: { length: 5.6, width: 3.6, height: 7.2 },
  editableParams: UTILITY_BOILER_EDITABLE_PARAMS,
  editablePartRoles: UTILITY_BOILER_EDITABLE_PART_ROLES,
  corePartRoles: UTILITY_BOILER_CORE_PART_ROLES,
  compose: ({ params, envelope }) => {
    const length = envelope?.length ?? 5.6
    const width = envelope?.width ?? 3.6
    const height = envelope?.height ?? 7.2
    return {
      parts: buildUtilityBoilerProfileParts({ length, width, height, params }),
      ports: buildUtilityBoilerPorts({ height }),
      envelope: { length, width, height, tolerance: envelope?.tolerance },
      editableParams: UTILITY_BOILER_EDITABLE_PARAMS,
      editablePartRoles: [...UTILITY_BOILER_EDITABLE_PART_ROLES],
      corePartRoles: [...UTILITY_BOILER_CORE_PART_ROLES],
      primarySemanticRole: 'boiler_body',
    }
  },
}

// ─── 4. Flare Stack (火炬) ───────────────────────────────────────────────────

export const FLARE_STACK_RECIPE_ID = 'factory:flare-stack'

export const FLARE_STACK_EDITABLE_PART_ROLES = [
  'flare_stack',
  'chimney_base',
  'chimney_top_rim',
  'chimney_warning_red_band',
] as const

export const FLARE_STACK_CORE_PART_ROLES = ['flare_stack'] as const

export const FLARE_STACK_EDITABLE_PARAMS: readonly SemanticRecipeEditableParam[] = [
  colorParam('stackColor', 'Stack color', 'flare_stack', '#d6d3d1'),
  colorParam('warningBandColor', 'Warning band color', 'chimney_warning_red_band', '#dc2626'),
]

export function buildFlareStackProfileParts(input: {
  length: number
  width: number
  height: number
  params?: Record<string, EquipmentParamValue>
}): FactorySemanticRecipePart[] {
  const stackColor = stringParam(input.params, 'stackColor', '#d6d3d1')
  const warningColor = stringParam(input.params, 'warningBandColor', '#dc2626')
  const baseRadius = Math.max(0.2, numberParam(input.params, 'baseRadius', input.width * 0.16))
  const topRadius = Math.max(0.1, numberParam(input.params, 'topRadius', baseRadius * 0.5))
  const stripeHeight = Math.max(0.8, numberParam(input.params, 'stripeHeight', input.height * 0.5))
  const stackHeight = input.height * 0.94

  return [
    cylinderPart({
      id: 'stack',
      role: 'flare_stack',
      kind: 'chimney_stack',
      x: 0,
      y: stackHeight / 2,
      z: 0,
      length: stackHeight,
      radius: (baseRadius + topRadius) / 2,
      color: stackColor,
      roughness: 0.5,
      metalness: 0.3,
    }),
    cylinderPart({
      id: 'base',
      role: 'chimney_base',
      kind: 'chimney_stack',
      x: 0,
      y: input.height * 0.04,
      z: 0,
      length: Math.max(0.3, input.height * 0.08),
      radius: baseRadius * 1.4,
      color: '#a8a29e',
      roughness: 0.56,
      metalness: 0.26,
    }),
    cylinderPart({
      id: 'warning_band',
      role: 'chimney_warning_red_band',
      kind: 'chimney_stack',
      x: 0,
      y: stackHeight - stripeHeight / 2,
      z: 0,
      length: stripeHeight,
      radius: topRadius * 1.02,
      color: warningColor,
      roughness: 0.48,
      metalness: 0.2,
    }),
    cylinderPart({
      id: 'top_rim',
      role: 'chimney_top_rim',
      kind: 'chimney_stack',
      x: 0,
      y: stackHeight + topRadius * 0.3,
      z: 0,
      length: topRadius * 0.6,
      radius: topRadius * 1.15,
      color: '#78716c',
      roughness: 0.44,
      metalness: 0.4,
    }),
    { id: 'relief_gas_inlet', kind: 'inlet_port', semanticRole: 'relief_gas_inlet', side: 'bottom' },
    { id: 'exhaust_outlet', kind: 'outlet_port', semanticRole: 'exhaust_outlet', side: 'top' },
  ]
}

export function buildFlareStackPorts(input: { height?: number } = {}): SemanticRecipePort[] {
  const height = input.height ?? 18
  return [
    { id: 'relief_gas_in', role: 'process-inlet', medium: 'gas', side: 'bottom', height: height * 0.04, offset: 0 },
    { id: 'exhaust_out', role: 'process-outlet', medium: 'gas', side: 'top', height: height * 0.98, offset: 0 },
  ]
}

export const flareStackRecipe: SemanticRecipeDefinition = {
  id: FLARE_STACK_RECIPE_ID,
  label: 'Flare stack',
  family: 'flare',
  acceptsProfiles: ['flare', 'flare_stack', 'refinery.safety_flare'],
  paramSchema: {
    fields: [
      'length',
      'width',
      'height',
      'baseRadius',
      'topRadius',
      'stripeCount',
      'stripeHeight',
      'stackColor',
      'warningBandColor',
    ],
  },
  defaultEnvelope: { length: 3.2, width: 3.2, height: 19.2 },
  editableParams: FLARE_STACK_EDITABLE_PARAMS,
  editablePartRoles: FLARE_STACK_EDITABLE_PART_ROLES,
  corePartRoles: FLARE_STACK_CORE_PART_ROLES,
  compose: ({ params, envelope }) => {
    const length = envelope?.length ?? 3.2
    const width = envelope?.width ?? 3.2
    const height = envelope?.height ?? 19.2
    return {
      parts: buildFlareStackProfileParts({ length, width, height, params }),
      ports: buildFlareStackPorts({ height }),
      envelope: { length, width, height, tolerance: envelope?.tolerance },
      editableParams: FLARE_STACK_EDITABLE_PARAMS,
      editablePartRoles: [...FLARE_STACK_EDITABLE_PART_ROLES],
      corePartRoles: [...FLARE_STACK_CORE_PART_ROLES],
      primarySemanticRole: 'flare_stack',
    }
  },
}

// ─── 5. Horizontal Vessel (卧式罐) ───────────────────────────────────────────

export const HORIZONTAL_VESSEL_RECIPE_ID = 'factory:horizontal-vessel'

export const HORIZONTAL_VESSEL_EDITABLE_PART_ROLES = [
  'vessel_shell',
  'saddle_support',
  'inlet_nozzle',
  'outlet_nozzle',
] as const

export const HORIZONTAL_VESSEL_CORE_PART_ROLES = ['vessel_shell'] as const

export const HORIZONTAL_VESSEL_EDITABLE_PARAMS: readonly SemanticRecipeEditableParam[] = [
  colorParam('shellColor', 'Shell color', 'vessel_shell', '#dbe3ee'),
]

export function buildHorizontalVesselProfileParts(input: {
  length: number
  width: number
  height: number
  params?: Record<string, EquipmentParamValue>
}): FactorySemanticRecipePart[] {
  const shellColor = stringParam(input.params, 'shellColor', '#dbe3ee')
  const radius = Math.max(0.24, Math.min(input.width, input.height) * 0.4)
  const shellY = radius * 1.5

  return [
    cylinderPart({
      id: 'shell',
      role: 'vessel_shell',
      axis: 'x',
      x: 0,
      y: shellY,
      z: 0,
      length: input.length * 0.88,
      radius,
      color: shellColor,
      roughness: 0.46,
      metalness: 0.35,
    }),
    boxPart({
      id: 'saddle_a',
      role: 'saddle_support',
      x: -input.length * 0.26,
      y: shellY - radius - input.height * 0.08,
      z: 0,
      length: radius * 1.3,
      width: radius * 1.6,
      height: Math.max(0.16, input.height * 0.16),
      color: '#6b7280',
      roughness: 0.6,
      metalness: 0.3,
    }),
    boxPart({
      id: 'saddle_b',
      role: 'saddle_support',
      x: input.length * 0.26,
      y: shellY - radius - input.height * 0.08,
      z: 0,
      length: radius * 1.3,
      width: radius * 1.6,
      height: Math.max(0.16, input.height * 0.16),
      color: '#6b7280',
      roughness: 0.6,
      metalness: 0.3,
    }),
    {
      id: 'inlet_nozzle',
      kind: 'inlet_port',
      semanticRole: 'inlet_nozzle',
      position: vec3(-input.length * 0.2, shellY + radius * 0.9, 0),
      axis: 'y',
      radius: Math.max(0.06, radius * 0.18),
    },
    {
      id: 'outlet_nozzle',
      kind: 'outlet_port',
      semanticRole: 'outlet_nozzle',
      position: vec3(input.length * 0.2, shellY - radius * 0.9, 0),
      axis: 'y',
      radius: Math.max(0.06, radius * 0.18),
    },
  ]
}

export function buildHorizontalVesselPorts(
  input: { height?: number; medium?: string } = {},
): SemanticRecipePort[] {
  const height = input.height ?? 2.4
  const medium = input.medium ?? 'material'
  return [
    { id: 'inlet', role: 'process-inlet', medium, side: 'top', height: height * 0.85, offset: -0.2 },
    { id: 'outlet', role: 'process-outlet', medium, side: 'bottom', height: height * 0.15, offset: 0.2 },
  ]
}

export const horizontalVesselRecipe: SemanticRecipeDefinition = {
  id: HORIZONTAL_VESSEL_RECIPE_ID,
  label: 'Horizontal vessel',
  family: 'horizontal_vessel',
  acceptsProfiles: ['horizontal_vessel', 'vessel', 'separator', 'refinery.overhead_separator'],
  paramSchema: {
    fields: ['length', 'width', 'height', 'shellColor'],
  },
  defaultEnvelope: { length: 4, width: 1.8, height: 2.4 },
  editableParams: HORIZONTAL_VESSEL_EDITABLE_PARAMS,
  editablePartRoles: HORIZONTAL_VESSEL_EDITABLE_PART_ROLES,
  corePartRoles: HORIZONTAL_VESSEL_CORE_PART_ROLES,
  compose: ({ params, envelope, medium }) => {
    const length = envelope?.length ?? 4
    const width = envelope?.width ?? 1.8
    const height = envelope?.height ?? 2.4
    return {
      parts: buildHorizontalVesselProfileParts({ length, width, height, params }),
      ports: buildHorizontalVesselPorts({ height, medium }),
      envelope: { length, width, height, tolerance: envelope?.tolerance },
      editableParams: HORIZONTAL_VESSEL_EDITABLE_PARAMS,
      editablePartRoles: [...HORIZONTAL_VESSEL_EDITABLE_PART_ROLES],
      corePartRoles: [...HORIZONTAL_VESSEL_CORE_PART_ROLES],
      primarySemanticRole: 'vessel_shell',
    }
  },
}

// ─── 6. Control Room (控制室) ────────────────────────────────────────────────

export const CONTROL_ROOM_RECIPE_ID = 'factory:control-room'

export const CONTROL_ROOM_EDITABLE_PART_ROLES = [
  'control_room_shell',
  'entry_door',
  'control_room_window',
  'operator_console',
] as const

export const CONTROL_ROOM_CORE_PART_ROLES = ['control_room_shell'] as const

export const CONTROL_ROOM_EDITABLE_PARAMS: readonly SemanticRecipeEditableParam[] = [
  colorParam('wallColor', 'Wall color', 'control_room_shell', '#e8e1cf'),
  colorParam('windowColor', 'Window color', 'control_room_window', '#93c5fd'),
]

export function buildControlRoomProfileParts(input: {
  length: number
  width: number
  height: number
  params?: Record<string, EquipmentParamValue>
}): FactorySemanticRecipePart[] {
  const wallColor = stringParam(input.params, 'wallColor', '#e8e1cf')
  const windowColor = stringParam(input.params, 'windowColor', '#93c5fd')
  const wallHeight = input.height * 0.92

  return [
    boxPart({
      id: 'shell',
      role: 'control_room_shell',
      x: 0,
      y: wallHeight / 2,
      z: 0,
      length: input.length,
      width: input.width,
      height: wallHeight,
      color: wallColor,
      roughness: 0.72,
      metalness: 0.06,
    }),
    boxPart({
      id: 'roof',
      role: 'control_room_shell',
      x: 0,
      y: wallHeight + input.height * 0.04,
      z: 0,
      length: input.length * 1.04,
      width: input.width * 1.04,
      height: input.height * 0.08,
      color: '#d6d0c0',
      roughness: 0.76,
      metalness: 0.04,
    }),
    boxPart({
      id: 'window_strip',
      role: 'control_room_window',
      x: 0,
      y: wallHeight * 0.62,
      z: input.width * 0.51,
      length: input.length * 0.78,
      width: 0.06,
      height: wallHeight * 0.28,
      color: windowColor,
      roughness: 0.2,
      metalness: 0.4,
    }),
    boxPart({
      id: 'entry_door',
      role: 'entry_door',
      x: input.length * 0.38,
      y: wallHeight * 0.36,
      z: input.width * 0.51,
      length: input.length * 0.14,
      width: 0.08,
      height: wallHeight * 0.72,
      color: '#78716c',
      roughness: 0.5,
      metalness: 0.3,
    }),
    boxPart({
      id: 'operator_console',
      role: 'operator_console',
      x: 0,
      y: wallHeight * 0.18,
      z: 0,
      length: input.length * 0.5,
      width: input.width * 0.2,
      height: wallHeight * 0.12,
      color: '#4b5563',
      roughness: 0.44,
      metalness: 0.4,
    }),
    { id: 'power_in', kind: 'inlet_port', semanticRole: 'power_in', side: 'back' },
    { id: 'data_port', kind: 'outlet_port', semanticRole: 'data', side: 'back' },
  ]
}

export function buildControlRoomPorts(): SemanticRecipePort[] {
  return [
    { id: 'power_in', role: 'utility-inlet', medium: 'power', side: 'back', height: 0.4, offset: -0.3 },
    { id: 'data', role: 'utility-inlet', medium: 'data', side: 'back', height: 0.4, offset: 0.3 },
  ]
}

export const controlRoomRecipe: SemanticRecipeDefinition = {
  id: CONTROL_ROOM_RECIPE_ID,
  label: 'Control room',
  family: 'control_room',
  acceptsProfiles: ['control_room', 'building', 'refinery.control_room'],
  paramSchema: {
    fields: ['length', 'width', 'height', 'wallColor', 'windowColor'],
  },
  defaultEnvelope: { length: 5, width: 4, height: 3 },
  editableParams: CONTROL_ROOM_EDITABLE_PARAMS,
  editablePartRoles: CONTROL_ROOM_EDITABLE_PART_ROLES,
  corePartRoles: CONTROL_ROOM_CORE_PART_ROLES,
  compose: ({ params, envelope }) => {
    const length = envelope?.length ?? 5
    const width = envelope?.width ?? 4
    const height = envelope?.height ?? 3
    return {
      parts: buildControlRoomProfileParts({ length, width, height, params }),
      ports: buildControlRoomPorts(),
      envelope: { length, width, height, tolerance: envelope?.tolerance },
      editableParams: CONTROL_ROOM_EDITABLE_PARAMS,
      editablePartRoles: [...CONTROL_ROOM_EDITABLE_PART_ROLES],
      corePartRoles: [...CONTROL_ROOM_CORE_PART_ROLES],
      primarySemanticRole: 'control_room_shell',
    }
  },
}
