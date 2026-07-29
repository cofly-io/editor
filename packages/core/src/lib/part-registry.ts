import type { PartComposePartInput } from './part-compose'
import {
  AIRCRAFT_PART_DEFINITIONS,
  COMPRESSOR_PART_DEFINITIONS,
  CONVEYOR_PART_DEFINITIONS,
  DESK_PART_DEFINITIONS,
  ELECTRICAL_PART_DEFINITIONS,
  FAN_PART_DEFINITIONS,
  GENERIC_PART_DEFINITIONS,
  HEAT_EXCHANGER_PART_DEFINITIONS,
  KIOSK_PART_DEFINITIONS,
  MACHINE_TOOL_PART_DEFINITIONS,
  OUTDOOR_AC_PART_DEFINITIONS,
  PIPE_SYSTEM_PART_DEFINITIONS,
  PUMP_PART_DEFINITIONS,
  REACTOR_PART_DEFINITIONS,
  TANK_PART_DEFINITIONS,
  VEHICLE_PART_DEFINITIONS,
} from './part-registry/definitions'

export {
  AIRCRAFT_PART_DEFINITIONS,
  COMPRESSOR_PART_DEFINITIONS,
  CONVEYOR_PART_DEFINITIONS,
  DESK_PART_DEFINITIONS,
  ELECTRICAL_PART_DEFINITIONS,
  FAN_PART_DEFINITIONS,
  GENERIC_PART_DEFINITIONS,
  HEAT_EXCHANGER_PART_DEFINITIONS,
  KIOSK_PART_DEFINITIONS,
  MACHINE_TOOL_PART_DEFINITIONS,
  OUTDOOR_AC_PART_DEFINITIONS,
  PIPE_SYSTEM_PART_DEFINITIONS,
  PUMP_PART_DEFINITIONS,
  REACTOR_PART_DEFINITIONS,
  TANK_PART_DEFINITIONS,
  VEHICLE_PART_DEFINITIONS,
} from './part-registry/definitions'

export type PartParameterType = 'number' | 'integer' | 'string' | 'boolean' | 'color' | 'enum'

export interface PartParameterDefinition {
  type: PartParameterType
  min?: number
  max?: number
  default?: unknown
  values?: readonly unknown[]
  description?: string
}

export interface PartDefinition {
  id: string
  family: string
  kind: string
  semanticRole?: string
  aliases: readonly string[]
  required?: boolean
  params: Record<string, PartParameterDefinition>
  attachTo?: string
  layoutRole?: string
  description: string
}

export type PartEditableParameterRole =
  | 'dimension'
  | 'quantity'
  | 'material'
  | 'shape'
  | 'detail'
  | 'placement'
  | 'metadata'

export interface PartEditableParameter {
  name: string
  type: PartParameterType
  role: PartEditableParameterRole
  min?: number
  max?: number
  default?: unknown
  values?: readonly unknown[]
  description?: string
}

export interface PartCapabilityMetadata {
  id: string
  family: string
  kind: string
  semanticRole?: string
  aliases: readonly string[]
  required: boolean
  attachTo?: string
  layoutRole?: string
  description: string
  editableParameters: readonly PartEditableParameter[]
  editableProperties: readonly string[]
  dimensionProperties: readonly string[]
  quantityProperties: readonly string[]
  materialProperties: readonly string[]
  shapeProperties: readonly string[]
  detailProperties: readonly string[]
  placementProperties: readonly string[]
}

export interface NormalizedPartPlan {
  family: string
  parts: PartComposePartInput[]
  warnings: string[]
}

const partDefinitionsByFamily = new Map<string, readonly PartDefinition[]>([
  ['vehicle', VEHICLE_PART_DEFINITIONS],
  ['desk', DESK_PART_DEFINITIONS],
  ['fan', FAN_PART_DEFINITIONS],
  ['aircraft', AIRCRAFT_PART_DEFINITIONS],
  ['generic', GENERIC_PART_DEFINITIONS],
  ['kiosk', KIOSK_PART_DEFINITIONS],
  ['pump', PUMP_PART_DEFINITIONS],
  ['conveyor', CONVEYOR_PART_DEFINITIONS],
  ['electrical', ELECTRICAL_PART_DEFINITIONS],
  ['pipe_system', PIPE_SYSTEM_PART_DEFINITIONS],
  ['tank', TANK_PART_DEFINITIONS],
  ['reactor', REACTOR_PART_DEFINITIONS],
  ['compressor', COMPRESSOR_PART_DEFINITIONS],
  ['heat_exchanger', HEAT_EXCHANGER_PART_DEFINITIONS],
  ['machine_tool', MACHINE_TOOL_PART_DEFINITIONS],
  ['outdoor_ac', OUTDOOR_AC_PART_DEFINITIONS],
])

const INDUSTRIAL_PART_FAMILIES = new Set([
  'pump',
  'fan',
  'conveyor',
  'electrical',
  'pipe_system',
  'tank',
  'reactor',
  'compressor',
  'heat_exchanger',
  'machine_tool',
])

const partAliasMapByFamily = new Map<string, Map<string, PartDefinition>>()

for (const [family, definitions] of partDefinitionsByFamily) {
  const aliasMap = new Map<string, PartDefinition>()
  const setAlias = (alias: string, definition: PartDefinition) => {
    const key = normalizeKey(alias)
    if (key && !aliasMap.has(key)) aliasMap.set(key, definition)
  }
  for (const definition of definitions) {
    setAlias(definition.kind, definition)
    aliasMap.set(normalizeKey(definition.id), definition)
    if (definition.semanticRole) setAlias(definition.semanticRole, definition)
    for (const alias of definition.aliases) setAlias(alias, definition)
  }
  partAliasMapByFamily.set(family, aliasMap)
}

function normalizeKey(value: unknown): string {
  return typeof value === 'string'
    ? value
        .trim()
        .replace(/[\s_-]+/g, '_')
        .toLowerCase()
    : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function partIdentityCandidates(part: Record<string, unknown>): string[] {
  return Array.from(
    new Set(
      [part.id, part.semanticRole, part.name, part.partName, part.kind, part.partType, part.type]
        .map(normalizeKey)
        .filter(Boolean),
    ),
  )
}

function definitionForPart(
  family: string,
  part: Record<string, unknown>,
): PartDefinition | undefined {
  const aliasMap = partAliasMapByFamily.get(family)
  if (!aliasMap) return undefined
  const identities = partIdentityCandidates(part)
  for (const identity of identities) {
    if (aliasMap.has(identity)) return aliasMap.get(identity)
  }
  for (const identity of identities) {
    for (const [alias, definition] of aliasMap) {
      if (identity.includes(alias) || alias.includes(identity)) return definition
    }
  }
  return undefined
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

function vec3Value(value: unknown): [number, number, number] | undefined {
  if (
    !Array.isArray(value) ||
    value.length < 3 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number' ||
    typeof value[2] !== 'number' ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1]) ||
    !Number.isFinite(value[2])
  ) {
    return undefined
  }
  return [value[0], value[1], value[2]]
}

function clampParam(
  value: unknown,
  definition: PartParameterDefinition,
  label: string,
  warnings: string[],
) {
  if (definition.type === 'color' || definition.type === 'string' || definition.type === 'enum') {
    const raw = stringValue(value)
    if (!raw) return definition.default
    if (definition.values && !definition.values.includes(raw)) {
      warnings.push(`${label} ignored unsupported value "${raw}".`)
      return definition.default
    }
    return raw
  }
  if (definition.type === 'boolean') {
    return typeof value === 'boolean' ? value : definition.default
  }
  if (definition.values?.length) {
    const numeric = numberValue(value)
    if (numeric == null) return definition.default
    const closest = definition.values
      .filter((candidate): candidate is number => typeof candidate === 'number')
      .reduce((best, candidate) =>
        Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best,
      )
    if (closest !== numeric) warnings.push(`${label} normalized from ${numeric} to ${closest}.`)
    return closest
  }
  const numeric = numberValue(value)
  if (numeric == null) return definition.default
  const min = definition.min ?? Number.NEGATIVE_INFINITY
  const max = definition.max ?? Number.POSITIVE_INFINITY
  const clamped = Math.max(min, Math.min(max, numeric))
  if (clamped !== numeric) warnings.push(`${label} clamped from ${numeric} to ${clamped}.`)
  return definition.type === 'integer' ? Math.round(clamped) : clamped
}

function normalizePartParams(
  definition: PartDefinition,
  raw: Record<string, unknown>,
  warnings: string[],
): Record<string, unknown> {
  const params = isRecord(raw.params) ? raw.params : {}
  const read = (key: string) => raw[key] ?? params[key]
  const normalized: Record<string, unknown> = {}
  for (const [key, paramDefinition] of Object.entries(definition.params)) {
    const value = clampParam(read(key), paramDefinition, `${definition.kind}.${key}`, warnings)
    if (value != null) normalized[key] = value
  }
  if (definition.kind === 'wheel_set') {
    normalized.radius = normalized.radius ?? normalized.wheelRadius
    normalized.width = normalized.width ?? normalized.wheelWidth
  }
  if (definition.kind === 'aircraft_landing_gear') {
    normalized.radius = normalized.radius ?? normalized.wheelRadius
  }
  return normalized
}

function mergeBodyDimensions(
  part: PartComposePartInput,
  input: Record<string, unknown>,
): PartComposePartInput {
  return {
    ...part,
    ...(numberValue(input.length) != null ? { length: numberValue(input.length) } : {}),
    ...(numberValue(input.width, input.depth) != null
      ? { width: numberValue(input.width, input.depth) }
      : {}),
    ...(numberValue(input.height) != null ? { height: numberValue(input.height) } : {}),
    ...(stringValue(input.primaryColor, input.color)
      ? { primaryColor: stringValue(input.primaryColor, input.color) }
      : {}),
  }
}

function mergeDeskTopDimensions(
  part: PartComposePartInput,
  input: Record<string, unknown>,
): PartComposePartInput {
  return {
    ...part,
    ...(numberValue(input.length) != null ? { length: numberValue(input.length) } : {}),
    ...(numberValue(input.width, input.depth) != null
      ? { width: numberValue(input.width, input.depth) }
      : {}),
    ...(stringValue(input.primaryColor, input.color)
      ? { primaryColor: stringValue(input.primaryColor, input.color) }
      : {}),
  }
}

function mergeAircraftFuselageDimensions(
  part: PartComposePartInput,
  input: Record<string, unknown>,
): PartComposePartInput {
  return {
    ...mergeBodyDimensions(part, input),
    ...(stringValue(input.accentColor) ? { accentColor: stringValue(input.accentColor) } : {}),
  }
}

function mergeKioskPartDimensions(
  definition: PartDefinition,
  part: PartComposePartInput,
  raw: Record<string, unknown>,
  input: Record<string, unknown>,
): PartComposePartInput {
  const params = isRecord(raw.params) ? raw.params : {}
  const hasRaw = (key: string) => raw[key] != null || params[key] != null
  const length = numberValue(input.length) ?? 1.8
  const width = numberValue(input.width, input.depth) ?? 1.2
  const height = numberValue(input.height) ?? 2.1
  if (definition.kind === 'kiosk_body') {
    return {
      ...part,
      ...(!hasRaw('length') ? { length } : {}),
      ...(!hasRaw('width') ? { width } : {}),
      ...(!hasRaw('height') ? { height: height * 0.78 } : {}),
      ...(stringValue(input.primaryColor, input.color)
        ? { primaryColor: stringValue(input.primaryColor, input.color) }
        : {}),
    }
  }
  if (definition.kind === 'kiosk_roof') {
    return {
      ...part,
      ...(!hasRaw('length') ? { length: length * 1.16 } : {}),
      ...(!hasRaw('width') ? { width: width * 1.18 } : {}),
      ...(!hasRaw('height') ? { height: height * 0.16 } : {}),
      ...(stringValue(input.secondaryColor) ? { color: stringValue(input.secondaryColor) } : {}),
    }
  }
  if (definition.kind === 'kiosk_opening') {
    return {
      ...part,
      ...(!hasRaw('length') ? { length: length * 0.42 } : {}),
      ...(!hasRaw('height') ? { height: height * 0.34 } : {}),
    }
  }
  if (definition.kind === 'kiosk_counter') {
    return {
      ...part,
      ...(!hasRaw('length') ? { length: length * 0.62 } : {}),
      ...(!hasRaw('width') ? { width: width * 0.2 } : {}),
      ...(!hasRaw('thickness') ? { thickness: height * 0.04 } : {}),
    }
  }
  if (definition.kind === 'kiosk_sign') {
    return {
      ...part,
      ...(!hasRaw('length') ? { length: length * 0.64 } : {}),
      ...(!hasRaw('height') ? { height: height * 0.12 } : {}),
      ...(stringValue(input.accentColor) ? { accentColor: stringValue(input.accentColor) } : {}),
    }
  }
  if (definition.kind === 'kiosk_awning') {
    return {
      ...part,
      ...(!hasRaw('length') ? { length: length * 0.72 } : {}),
      ...(!hasRaw('width') ? { width: width * 0.32 } : {}),
      ...(!hasRaw('thickness') ? { thickness: height * 0.04 } : {}),
    }
  }
  return part
}

function mergeIndustrialPartDimensions(
  family: string,
  definition: PartDefinition,
  part: PartComposePartInput,
  raw: Record<string, unknown>,
  input: Record<string, unknown>,
): PartComposePartInput {
  const params = isRecord(raw.params) ? raw.params : {}
  const hasRaw = (key: string) => raw[key] != null || params[key] != null
  const rawNumber = (...keys: string[]) =>
    numberValue(...keys.map((key) => raw[key] ?? params[key]))
  const inputNumber = (...keys: string[]) => numberValue(...keys.map((key) => input[key]))
  const inputString = (...keys: string[]) => stringValue(...keys.map((key) => input[key]))
  const length =
    numberValue(input.length) ?? (family === 'conveyor' ? 3 : family === 'pipe_system' ? 2 : 1.2)
  const width = numberValue(input.width, input.depth, input.diameter) ?? 0.55
  const height = numberValue(input.height) ?? (family === 'electrical' ? 1.6 : 0.6)
  const color = stringValue(input.primaryColor, input.color)
  const metalColor = stringValue(input.metalColor, input.secondaryColor)

  if (family === 'pump') {
    const motorRadius =
      rawNumber('motorRadius') ??
      inputNumber('motorRadius', 'driveMotorRadius') ??
      Math.max(0.04, Math.min(width, height) * 0.28)
    const portRadius = Math.max(
      0.02,
      inputNumber('portRadius') ??
        (inputNumber('portDiameter') != null ? inputNumber('portDiameter')! / 2 : undefined) ??
        motorRadius * 0.42,
    )
    const inletRadius =
      inputNumber('inletRadius', 'suctionRadius') ??
      (inputNumber('inletDiameter', 'suctionDiameter') != null
        ? inputNumber('inletDiameter', 'suctionDiameter')! / 2
        : undefined)
    const outletRadius =
      inputNumber('outletRadius', 'dischargeRadius') ??
      (inputNumber('outletDiameter', 'dischargeDiameter') != null
        ? inputNumber('outletDiameter', 'dischargeDiameter')! / 2
        : undefined)
    const boltCount = rawNumber('boltCount') ?? inputNumber('boltCount', 'flangeBoltCount')
    if (definition.kind === 'skid_base') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length } : {}),
        ...(!hasRaw('width') ? { width } : {}),
        ...(!hasRaw('height')
          ? { height: inputNumber('baseThickness', 'skidHeight') ?? Math.max(0.03, height * 0.12) }
          : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'ribbed_motor_body') {
      return {
        ...part,
        ...(!hasRaw('length')
          ? { length: rawNumber('motorLength') ?? inputNumber('motorLength') ?? length * 0.38 }
          : {}),
        ...(!hasRaw('radius') ? { radius: motorRadius } : {}),
        ...(!hasRaw('slatCount') && !hasRaw('count')
          ? { slatCount: rawNumber('ribCount', 'finCount') ?? inputNumber('ribCount', 'finCount') }
          : {}),
        ...(color ? { primaryColor: color } : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'volute_casing') {
      return {
        ...part,
        ...(!hasRaw('radius')
          ? {
              radius:
                inputNumber('casingRadius', 'voluteRadius') ??
                Math.max(0.05, Math.min(width, height) * 0.36),
            }
          : {}),
        ...(!hasRaw('depth')
          ? { depth: inputNumber('casingDepth', 'voluteDepth') ?? width * 0.28 }
          : {}),
        ...(color ? { primaryColor: color } : {}),
      }
    }
    if (definition.kind === 'inlet_port' || definition.kind === 'outlet_port') {
      const explicitPortRadius = definition.kind === 'inlet_port' ? inletRadius : outletRadius
      return {
        ...part,
        ...(!hasRaw('radius') ? { radius: explicitPortRadius ?? portRadius } : {}),
        ...(!hasRaw('length')
          ? {
              length:
                inputNumber(
                  definition.kind === 'inlet_port' ? 'inletLength' : 'outletLength',
                  definition.kind === 'inlet_port' ? 'suctionLength' : 'dischargeLength',
                ) ?? Math.max(0.06, width * 0.32),
            }
          : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'flange_ring') {
      return {
        ...part,
        ...(!hasRaw('radius') ? { radius: portRadius * 1.65 } : {}),
        ...(!hasRaw('tubeRadius') ? { tubeRadius: portRadius * 0.22 } : {}),
        ...(!hasRaw('boltCount') && boltCount != null ? { boltCount } : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'impeller_blades') {
      return {
        ...part,
        ...(!hasRaw('radius')
          ? {
              radius:
                inputNumber('impellerRadius') ?? Math.max(0.04, Math.min(width, height) * 0.23),
            }
          : {}),
        ...(!hasRaw('count') && inputNumber('impellerBladeCount') != null
          ? { count: inputNumber('impellerBladeCount') }
          : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
  }

  if (family === 'conveyor') {
    const beltWidth = inputNumber('beltWidth')
    const rollerCount = inputNumber('rollerCount', 'idlerCount')
    const rollerRadius = inputNumber('rollerRadius', 'idlerRadius')
    if (definition.kind === 'conveyor_frame') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length } : {}),
        ...(!hasRaw('width') ? { width } : {}),
        ...(!hasRaw('height') ? { height: inputNumber('frameHeight') ?? height } : {}),
        ...(!hasRaw('legCount') && inputNumber('legCount', 'supportCount') != null
          ? { legCount: inputNumber('legCount', 'supportCount') }
          : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'roller_array') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length: length * 0.94 } : {}),
        ...(!hasRaw('width') ? { width: beltWidth ?? width * 0.9 } : {}),
        ...(!hasRaw('radius')
          ? { radius: rollerRadius ?? Math.max(0.012, Math.min(width, height) * 0.045) }
          : {}),
        ...(!hasRaw('count')
          ? { count: rollerCount ?? Math.max(4, Math.min(32, Math.round(length * 4))) }
          : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'belt_surface') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length: length * 0.98 } : {}),
        ...(!hasRaw('width') ? { width: beltWidth ?? width * 0.9 } : {}),
        ...(!hasRaw('height')
          ? { height: inputNumber('beltThickness') ?? Math.max(0.008, height * 0.035) }
          : {}),
        ...(stringValue(input.darkColor) ? { darkColor: stringValue(input.darkColor) } : {}),
      }
    }
    if (definition.kind === 'ribbed_motor_body') {
      return {
        ...part,
        ...(!hasRaw('length')
          ? {
              length:
                inputNumber('motorLength', 'driveMotorLength') ?? Math.max(0.12, width * 0.34),
            }
          : {}),
        ...(!hasRaw('radius')
          ? {
              radius:
                inputNumber('motorRadius', 'driveMotorRadius') ?? Math.max(0.035, width * 0.09),
            }
          : {}),
        ...(color ? { primaryColor: color } : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
  }

  if (family === 'electrical') {
    const doorCount = inputNumber('doorCount')
    const ventCount = inputNumber('ventCount', 'ventRows', 'slatCount')
    if (definition.kind === 'electrical_cabinet') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length } : {}),
        ...(!hasRaw('width') ? { width } : {}),
        ...(!hasRaw('height') ? { height } : {}),
        ...(!hasRaw('doorCount') && doorCount != null ? { doorCount } : {}),
        ...(!hasRaw('slatCount') && !hasRaw('count') && ventCount != null
          ? { slatCount: ventCount }
          : {}),
        ...(color ? { primaryColor: color } : {}),
      }
    }
    if (definition.kind === 'cable_tray') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length: inputNumber('cableTrayLength') ?? length * 1.25 } : {}),
        ...(!hasRaw('width') ? { width: inputNumber('cableTrayWidth') ?? width * 0.5 } : {}),
        ...(!hasRaw('height')
          ? { height: inputNumber('cableTrayHeight') ?? Math.max(0.03, height * 0.045) }
          : {}),
        ...(!hasRaw('slatCount') && inputNumber('cableTrayRungCount') != null
          ? { slatCount: inputNumber('cableTrayRungCount') }
          : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
  }

  if (family === 'pipe_system') {
    const explicitRadius = numberValue(input.radius, input.pipeRadius)
    const explicitDiameter = numberValue(input.diameter, input.pipeDiameter)
    const pipeRadius =
      explicitRadius ??
      (explicitDiameter != null
        ? explicitDiameter / 2
        : Math.max(0.02, Math.min(width, height) * 0.5))
    if (definition.kind === 'pipe_run') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length } : {}),
        ...(!hasRaw('radius') ? { radius: pipeRadius } : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'pipe_elbow' || definition.kind === 'valve_body') {
      return {
        ...part,
        ...(!hasRaw('radius') ? { radius: pipeRadius } : {}),
        ...(definition.kind === 'pipe_elbow' && !hasRaw('bendRadius') && !hasRaw('length')
          ? { bendRadius: inputNumber('bendRadius', 'elbowRadius') ?? pipeRadius * 4.2 }
          : {}),
        ...(definition.kind === 'valve_body' && !hasRaw('length')
          ? { length: inputNumber('valveLength') ?? Math.max(0.08, pipeRadius * 5) }
          : {}),
        ...(definition.kind === 'valve_body' && !hasRaw('valveStyle') && inputString('valveStyle')
          ? { valveStyle: inputString('valveStyle') }
          : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    const flangeBoltCount = inputNumber('boltCount', 'flangeBoltCount')
    if (definition.kind === 'flange_ring') {
      return {
        ...part,
        ...(!hasRaw('radius') ? { radius: pipeRadius * 1.55 } : {}),
        ...(!hasRaw('tubeRadius') ? { tubeRadius: Math.max(0.004, pipeRadius * 0.22) } : {}),
        ...(!hasRaw('boltCount') && flangeBoltCount != null ? { boltCount: flangeBoltCount } : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
  }

  if (family === 'tank') {
    const tankHeight = inputNumber('tankHeight') ?? height
    const tankRadius =
      inputNumber('tankRadius', 'radius') ??
      (inputNumber('diameter', 'tankDiameter') != null
        ? inputNumber('diameter', 'tankDiameter')! / 2
        : Math.max(0.08, width * 0.5))
    const portRadius =
      inputNumber('portRadius') ??
      (inputNumber('portDiameter') != null ? inputNumber('portDiameter')! / 2 : undefined) ??
      tankRadius * 0.16
    if (definition.kind === 'cylindrical_tank') {
      const horizontal = /horizontal|卧式|卧罐/i.test(textOf(input))
      const shellLength = horizontal ? length : tankHeight
      return {
        ...part,
        ...(!hasRaw('length') ? { length: shellLength } : {}),
        ...(!hasRaw('radius') ? { radius: tankRadius } : {}),
        ...(!hasRaw('axis') ? { axis: horizontal ? 'x' : 'y' } : {}),
        ...(!hasRaw('position')
          ? { position: [0, horizontal ? tankRadius + 0.1 : shellLength / 2, 0] }
          : {}),
        ...(color ? { primaryColor: color } : {}),
      }
    }
    if (definition.kind === 'skid_base') {
      const baseHeight =
        inputNumber('baseHeight', 'supportHeight') ?? Math.max(0.06, tankHeight * 0.06)
      return {
        ...part,
        ...(!hasRaw('length') ? { length: Math.max(length, tankRadius * 2.2) } : {}),
        ...(!hasRaw('width') ? { width: tankRadius * 2.2 } : {}),
        ...(!hasRaw('height') ? { height: baseHeight } : {}),
        ...(!hasRaw('position') ? { position: [0, baseHeight / 2, 0] } : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'inlet_port' || definition.kind === 'outlet_port') {
      const isInlet = definition.kind === 'inlet_port'
      return {
        ...part,
        ...(!hasRaw('radius') ? { radius: portRadius } : {}),
        ...(!hasRaw('length') ? { length: Math.max(0.06, tankRadius * 0.36) } : {}),
        ...(!hasRaw('axis') ? { axis: isInlet ? 'y' : 'x' } : {}),
        ...(!hasRaw('position')
          ? {
              position: isInlet
                ? [0, tankHeight + tankRadius * 0.18, 0]
                : [tankRadius * 1.08, tankHeight * 0.22, 0],
            }
          : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'platform_ladder') {
      return {
        ...part,
        ...(!hasRaw('height') ? { height: tankHeight * 0.82 } : {}),
        ...(!hasRaw('position') ? { position: [tankRadius * 1.28, tankHeight * 0.48, 0] } : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
  }

  if (family === 'reactor') {
    const reactorHeight = inputNumber('vesselHeight', 'tankHeight') ?? height
    const reactorRadius =
      inputNumber('vesselRadius', 'tankRadius', 'radius') ??
      (inputNumber('diameter', 'vesselDiameter') != null
        ? inputNumber('diameter', 'vesselDiameter')! / 2
        : Math.max(0.08, width * 0.5))
    const nozzleRadius =
      inputNumber('nozzleRadius') ??
      (inputNumber('nozzleDiameter') != null ? inputNumber('nozzleDiameter')! / 2 : undefined) ??
      reactorRadius * 0.15
    if (definition.kind === 'agitator_tank') {
      return {
        ...part,
        ...(!hasRaw('height') ? { height: reactorHeight } : {}),
        ...(!hasRaw('radius') ? { radius: reactorRadius } : {}),
        ...(!hasRaw('position') ? { position: [0, reactorHeight / 2, 0] } : {}),
        ...(color ? { primaryColor: color } : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'inlet_port' || definition.kind === 'outlet_port') {
      const isInlet = definition.kind === 'inlet_port'
      return {
        ...part,
        ...(!hasRaw('radius') ? { radius: nozzleRadius } : {}),
        ...(!hasRaw('length') ? { length: Math.max(0.05, reactorRadius * 0.34) } : {}),
        ...(!hasRaw('axis') ? { axis: isInlet ? 'y' : 'x' } : {}),
        ...(!hasRaw('position')
          ? {
              position: isInlet
                ? [-reactorRadius * 0.34, reactorHeight + reactorRadius * 0.16, 0]
                : [reactorRadius * 1.08, reactorHeight * 0.22, 0],
            }
          : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'platform_ladder') {
      return {
        ...part,
        ...(!hasRaw('height') ? { height: reactorHeight * 0.86 } : {}),
        ...(!hasRaw('position')
          ? { position: [reactorRadius * 1.32, reactorHeight * 0.48, 0] }
          : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
  }

  if (family === 'compressor') {
    const motorRadius = inputNumber('motorRadius') ?? Math.max(0.05, Math.min(width, height) * 0.22)
    const casingRadius =
      inputNumber('casingRadius') ?? Math.max(0.08, Math.min(width, height) * 0.25)
    const portRadius =
      inputNumber('portRadius') ??
      (inputNumber('portDiameter') != null ? inputNumber('portDiameter')! / 2 : undefined) ??
      casingRadius * 0.28
    if (definition.kind === 'skid_base') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length } : {}),
        ...(!hasRaw('width') ? { width } : {}),
        ...(!hasRaw('height') ? { height: Math.max(0.06, height * 0.14) } : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'ribbed_motor_body') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length: inputNumber('motorLength') ?? length * 0.34 } : {}),
        ...(!hasRaw('radius') ? { radius: motorRadius } : {}),
        ...(!hasRaw('position') ? { position: [-length * 0.22, height * 0.55, 0] } : {}),
        ...(color ? { primaryColor: color } : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'rounded_machine_body') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length: inputNumber('casingLength') ?? length * 0.34 } : {}),
        ...(!hasRaw('width') ? { width: casingRadius * 1.8 } : {}),
        ...(!hasRaw('height') ? { height: casingRadius * 1.8 } : {}),
        ...(!hasRaw('position') ? { position: [length * 0.24, height * 0.55, 0] } : {}),
        ...(color ? { primaryColor: color } : {}),
      }
    }
    if (definition.kind === 'inlet_port' || definition.kind === 'outlet_port') {
      const isInlet = definition.kind === 'inlet_port'
      return {
        ...part,
        ...(!hasRaw('radius') ? { radius: portRadius } : {}),
        ...(!hasRaw('length') ? { length: Math.max(0.06, width * 0.28) } : {}),
        ...(!hasRaw('axis') ? { axis: 'x' } : {}),
        ...(!hasRaw('position')
          ? { position: [length * (isInlet ? 0.02 : 0.46), height * 0.58, 0] }
          : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
    if (definition.kind === 'control_box') {
      return {
        ...part,
        ...(!hasRaw('position') ? { position: [-length * 0.42, height * 0.36, width * 0.38] } : {}),
      }
    }
  }

  if (family === 'heat_exchanger') {
    const shellRadius =
      inputNumber('shellRadius', 'radius') ??
      (inputNumber('diameter', 'shellDiameter') != null
        ? inputNumber('diameter', 'shellDiameter')! / 2
        : Math.max(0.06, Math.min(width, height) * 0.44))
    if (definition.kind === 'heat_exchanger') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length } : {}),
        ...(!hasRaw('radius') ? { radius: shellRadius } : {}),
        ...(!hasRaw('axis') ? { axis: 'x' } : {}),
        ...(!hasRaw('position') ? { position: [0, shellRadius + 0.12, 0] } : {}),
        ...(color ? { primaryColor: color } : {}),
      }
    }
    if (definition.kind === 'skid_base') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length: length * 0.86 } : {}),
        ...(!hasRaw('width') ? { width: shellRadius * 2.2 } : {}),
        ...(!hasRaw('height') ? { height: Math.max(0.06, shellRadius * 0.38) } : {}),
        ...(metalColor ? { metalColor } : {}),
      }
    }
  }

  if (family === 'machine_tool') {
    if (definition.kind === 'generic_base') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length } : {}),
        ...(!hasRaw('width') ? { width } : {}),
        ...(!hasRaw('thickness') ? { thickness: Math.max(0.08, height * 0.1) } : {}),
      }
    }
    if (definition.kind === 'generic_body') {
      return {
        ...part,
        ...(inputNumber('length') != null ? { length } : !hasRaw('length') ? { length } : {}),
        ...(inputNumber('width', 'depth') != null ? { width } : !hasRaw('width') ? { width } : {}),
        ...(inputNumber('height') != null ? { height } : !hasRaw('height') ? { height } : {}),
        ...(!hasRaw('position') ? { position: [0, height * 0.56, 0] } : {}),
        ...(color ? { primaryColor: color } : {}),
      }
    }
    if (definition.kind === 'generic_panel') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length: length * 0.18 } : {}),
        ...(!hasRaw('height') ? { height: height * 0.24 } : {}),
        ...(!hasRaw('position') ? { position: [-length * 0.12, height * 0.58, width * 0.43] } : {}),
      }
    }
    if (definition.kind === 'control_box') {
      return {
        ...part,
        ...(!hasRaw('length') ? { length: length * 0.12 } : {}),
        ...(!hasRaw('height') ? { height: height * 0.34 } : {}),
        ...(!hasRaw('position') ? { position: [length * 0.38, height * 0.58, width * 0.5] } : {}),
      }
    }
  }

  return part
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textOf).join(' ')
  if (typeof value === 'object' && value !== null) return Object.values(value).map(textOf).join(' ')
  return ''
}

function shouldIncludeDeskDrawers(input: Record<string, unknown>): boolean {
  const text = textOf([
    input.name,
    input.partName,
    input.object,
    input.prompt,
    input.style,
  ]).toLowerCase()
  return /drawer|drawers|cabinet|storage|office|writing/.test(text)
}

type GenericPartPlanCategory = 'equipment' | 'building' | 'furniture' | 'natural' | 'generic'

function genericPartPlanCategory(input: Record<string, unknown>): GenericPartPlanCategory {
  const text = textOf([
    input.name,
    input.partName,
    input.object,
    input.prompt,
    input.style,
    input.category,
    input.geometryBrief,
  ]).toLowerCase()
  if (/coffee|espresso|\u5496\u5561\u673a|machine|equipment|device|appliance|console/.test(text)) {
    return 'equipment'
  }
  if (
    /building|house|tower|pavilion|booth|kiosk|shed|\u5efa\u7b51|\u623f|\u4ead|\u68da/.test(text)
  ) {
    return 'building'
  }
  if (
    /furniture|chair|cabinet|shelf|sofa|bed|\u5bb6\u5177|\u6905|\u67dc|\u67b6|\u6c99\u53d1|\u5e8a/.test(
      text,
    )
  ) {
    return 'furniture'
  }
  if (
    /landscape|garden|terrain|hill|mountain|pond|\u666f\u89c2|\u82b1\u56ed|\u5c71|\u6c60/.test(text)
  ) {
    return 'natural'
  }
  return 'generic'
}

function isCoffeeLikeGeneric(input: Record<string, unknown>): boolean {
  return /coffee|espresso|\u5496\u5561\u673a/i.test(textOf(input))
}

function normalizePartForDefinition(
  family: string,
  definition: PartDefinition,
  raw: Record<string, unknown>,
  input: Record<string, unknown>,
  warnings: string[],
): PartComposePartInput {
  const params = normalizePartParams(definition, raw, warnings)
  const preserveLayoutFields = INDUSTRIAL_PART_FAMILIES.has(family)
  const position = preserveLayoutFields ? vec3Value(raw.position) : undefined
  const rotation = preserveLayoutFields ? vec3Value(raw.rotation) : undefined
  const id = preserveLayoutFields ? stringValue(raw.id) : undefined
  const name = preserveLayoutFields ? stringValue(raw.name, raw.partName) : undefined
  const side = preserveLayoutFields ? stringValue(raw.side) : undefined
  const connectTo = preserveLayoutFields ? stringValue(raw.connectTo) : undefined
  const connectPoint = preserveLayoutFields ? stringValue(raw.connectPoint) : undefined
  const childPoint = preserveLayoutFields ? stringValue(raw.childPoint) : undefined
  const centeredOn = preserveLayoutFields ? stringValue(raw.centeredOn) : undefined
  const alignAbove = preserveLayoutFields ? stringValue(raw.alignAbove) : undefined
  const alignBeside = preserveLayoutFields ? stringValue(raw.alignBeside) : undefined
  const semanticRole = preserveLayoutFields
    ? (stringValue(raw.semanticRole) ?? definition.semanticRole)
    : definition.semanticRole
  let part: PartComposePartInput = {
    kind: definition.kind,
    ...(semanticRole ? { semanticRole } : {}),
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(position ? { position } : {}),
    ...(rotation ? { rotation } : {}),
    ...(side ? { side } : {}),
    ...(connectTo ? { connectTo } : {}),
    ...(connectPoint ? { connectPoint } : {}),
    ...(childPoint ? { childPoint } : {}),
    ...(centeredOn ? { centeredOn } : {}),
    ...(alignAbove ? { alignAbove } : {}),
    ...(alignBeside ? { alignBeside } : {}),
    ...params,
  }

  if (family === 'vehicle' && definition.kind === 'body_shell') {
    part = mergeBodyDimensions(part, input)
  }
  if (family === 'desk' && definition.kind === 'desk_top') {
    part = mergeDeskTopDimensions(part, input)
  }
  if (family === 'desk' && definition.kind === 'leg_set') {
    const topLength = numberValue(input.length)
    const topWidth = numberValue(input.width, input.depth)
    const overallHeight = numberValue(input.height)
    part = {
      ...part,
      ...(topLength != null ? { length: Math.max(0.25, topLength * 0.9) } : {}),
      ...(topWidth != null ? { width: Math.max(0.15, topWidth * 0.82) } : {}),
      ...(overallHeight != null ? { height: Math.max(0.12, overallHeight - 0.055) } : {}),
    }
  }
  if (family === 'aircraft' && definition.kind === 'aircraft_fuselage') {
    part = mergeAircraftFuselageDimensions(part, input)
  }
  if (family === 'generic' && definition.kind === 'generic_body') {
    part = mergeBodyDimensions(part, input)
  }
  if (family === 'generic' && definition.kind === 'generic_base') {
    const topLength = numberValue(input.length)
    const topWidth = numberValue(input.width, input.depth)
    const overallHeight = numberValue(input.height)
    part = {
      ...part,
      ...(topLength != null ? { length: Math.max(0.08, topLength * 1.08) } : {}),
      ...(topWidth != null ? { width: Math.max(0.05, topWidth * 1.08) } : {}),
      ...(overallHeight != null ? { thickness: Math.max(0.01, overallHeight * 0.08) } : {}),
    }
  }
  if (family === 'kiosk') {
    part = mergeKioskPartDimensions(definition, part, raw, input)
  }
  if (INDUSTRIAL_PART_FAMILIES.has(family)) {
    part = mergeIndustrialPartDimensions(family, definition, part, raw, input)
  }
  return part
}

function normalizeFamilyPartPlan(
  family: string,
  definitions: readonly PartDefinition[],
  input: Record<string, unknown>,
): NormalizedPartPlan {
  const warnings: string[] = []
  const rawParts = Array.isArray(input.parts) ? input.parts.filter(isRecord) : []
  const normalizedParts: PartComposePartInput[] = []
  const seen = new Set<string>()
  const seenDefinitionIds = new Set<string>()

  for (const raw of rawParts) {
    const definition = definitionForPart(family, raw)
    if (!definition) {
      warnings.push(
        `Unknown ${family} part "${String(raw.kind ?? raw.name ?? raw.semanticRole ?? 'part')}" ignored.`,
      )
      continue
    }
    const explicitId = stringValue(raw.id)
    const dedupeKey = explicitId ? `${definition.id}:${normalizeKey(explicitId)}` : definition.id
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    seenDefinitionIds.add(definition.id)
    normalizedParts.push(normalizePartForDefinition(family, definition, raw, input, warnings))
  }

  for (const definition of definitions) {
    if (!definition.required || seenDefinitionIds.has(definition.id)) continue
    normalizedParts.push(normalizePartForDefinition(family, definition, {}, input, warnings))
    seen.add(definition.id)
    seenDefinitionIds.add(definition.id)
  }

  if (family === 'vehicle' && !seen.has('seam_ring')) normalizedParts.push({ kind: 'seam_ring' })
  if (family === 'desk' && !seen.has('drawer_stack') && shouldIncludeDeskDrawers(input)) {
    const drawerDefinition = definitions.find((definition) => definition.kind === 'drawer_stack')
    if (drawerDefinition) {
      normalizedParts.push(
        normalizePartForDefinition(family, drawerDefinition, {}, input, warnings),
      )
    }
  }
  if (family === 'kiosk') {
    if (!seen.has('kiosk_sign')) {
      const signDefinition = definitions.find((definition) => definition.kind === 'kiosk_sign')
      if (signDefinition) {
        normalizedParts.push(
          normalizePartForDefinition(family, signDefinition, {}, input, warnings),
        )
      }
    }
    if (!seen.has('kiosk_awning')) {
      const awningDefinition = definitions.find((definition) => definition.kind === 'kiosk_awning')
      if (awningDefinition) {
        normalizedParts.push(
          normalizePartForDefinition(family, awningDefinition, {}, input, warnings),
        )
      }
    }
  }

  const definitionOrder = new Map(definitions.map((definition, index) => [definition.id, index]))
  const orderForPart = (part: PartComposePartInput) => {
    const semanticRole = normalizeKey(part.semanticRole)
    const kind = normalizeKey(part.kind)
    const definition = definitions.find(
      (candidate) =>
        normalizeKey(candidate.kind) === kind &&
        (!semanticRole || normalizeKey(candidate.semanticRole) === semanticRole),
    )
    return definitionOrder.get(definition?.id ?? '') ?? Number.MAX_SAFE_INTEGER
  }
  normalizedParts.sort((left, right) => orderForPart(left) - orderForPart(right))

  return { family, parts: normalizedParts, warnings }
}

export function getPartDefinitions(family?: string): readonly PartDefinition[] {
  if (family == null) return Array.from(partDefinitionsByFamily.values()).flat()
  return partDefinitionsByFamily.get(normalizeKey(family)) ?? []
}

export function registeredPartKinds(): string[] {
  return Array.from(new Set(getPartDefinitions().map((definition) => definition.kind))).sort()
}

export function resolveRegisteredPartKind(kind: unknown): PartDefinition | undefined {
  const normalized = normalizeKey(kind)
  if (!normalized) return undefined
  for (const aliasMap of partAliasMapByFamily.values()) {
    const definition = aliasMap.get(normalized)
    if (definition) return definition
  }
  return undefined
}

export function isRegisteredPartKind(kind: unknown): boolean {
  return resolveRegisteredPartKind(kind) !== undefined
}

const DIMENSION_PARAMETER_NAMES = new Set([
  'length',
  'width',
  'height',
  'depth',
  'thickness',
  'radius',
  'diameter',
  'radiusTop',
  'radiusBottom',
  'majorRadius',
  'tubeRadius',
  'innerRadius',
  'outerRadius',
  'wheelRadius',
  'wheelWidth',
  'motorLength',
  'motorRadius',
  'casingLength',
  'casingRadius',
  'casingDepth',
  'shellDiameter',
  'shellRadius',
  'vesselHeight',
  'tankHeight',
  'portDiameter',
  'nozzleDiameter',
  'pipeDiameter',
  'pipeRadius',
  'bendRadius',
  'supportHeight',
])

const MATERIAL_PARAMETER_PATTERN = /(color|colour|tint|opacity|metalness|roughness|material)/i
const QUANTITY_PARAMETER_PATTERN = /(count|rows|columns|segments|slats|ribs|fins|bolts|doors)/i
const PLACEMENT_PARAMETER_PATTERN = /(offset|spacing|side|axis|angle|rotation|slope|position)/i
const DETAIL_PARAMETER_PATTERN =
  /(detail|stripe|label|nameplate|vent|window|door|ladder|platform|handle)/i
const SHAPE_PARAMETER_PATTERN =
  /(style|variant|round|radius|taper|arc|sweep|curve|blade|tooth|profile|truncated|topScale)/i

function partEditableParameterRole(
  key: string,
  parameter: PartParameterDefinition,
): PartEditableParameterRole {
  if (parameter.type === 'color' || MATERIAL_PARAMETER_PATTERN.test(key)) return 'material'
  if (parameter.type === 'integer' || QUANTITY_PARAMETER_PATTERN.test(key)) return 'quantity'
  if (DIMENSION_PARAMETER_NAMES.has(key)) return 'dimension'
  if (PLACEMENT_PARAMETER_PATTERN.test(key)) return 'placement'
  if (DETAIL_PARAMETER_PATTERN.test(key)) return 'detail'
  if (parameter.type === 'enum' || SHAPE_PARAMETER_PATTERN.test(key)) return 'shape'
  if (parameter.type === 'string' || parameter.type === 'boolean') return 'metadata'
  return 'shape'
}

function editableParameterFromDefinition(
  key: string,
  parameter: PartParameterDefinition,
): PartEditableParameter {
  return {
    name: key,
    type: parameter.type,
    role: partEditableParameterRole(key, parameter),
    ...(parameter.min != null ? { min: parameter.min } : {}),
    ...(parameter.max != null ? { max: parameter.max } : {}),
    ...(parameter.default != null ? { default: parameter.default } : {}),
    ...(parameter.values ? { values: parameter.values } : {}),
    ...(parameter.description ? { description: parameter.description } : {}),
  }
}

function parameterNamesForRole(
  parameters: readonly PartEditableParameter[],
  role: PartEditableParameterRole,
): string[] {
  return parameters
    .filter((parameter) => parameter.role === role)
    .map((parameter) => parameter.name)
}

export function getPartCapabilityMetadata(family?: string): readonly PartCapabilityMetadata[] {
  const definitions = family
    ? getPartDefinitions(family)
    : Array.from(partDefinitionsByFamily.values()).flat()
  return definitions.map((definition) => {
    const editableParameters = Object.entries(definition.params).map(([key, parameter]) =>
      editableParameterFromDefinition(key, parameter),
    )
    return {
      id: definition.id,
      family: definition.family,
      kind: definition.kind,
      ...(definition.semanticRole ? { semanticRole: definition.semanticRole } : {}),
      aliases: definition.aliases,
      required: definition.required === true,
      ...(definition.attachTo ? { attachTo: definition.attachTo } : {}),
      ...(definition.layoutRole ? { layoutRole: definition.layoutRole } : {}),
      description: definition.description,
      editableParameters,
      editableProperties: editableParameters.map((parameter) => parameter.name),
      dimensionProperties: parameterNamesForRole(editableParameters, 'dimension'),
      quantityProperties: parameterNamesForRole(editableParameters, 'quantity'),
      materialProperties: parameterNamesForRole(editableParameters, 'material'),
      shapeProperties: parameterNamesForRole(editableParameters, 'shape'),
      detailProperties: parameterNamesForRole(editableParameters, 'detail'),
      placementProperties: parameterNamesForRole(editableParameters, 'placement'),
    }
  })
}

function summarizeEditableGroups(metadata: PartCapabilityMetadata): string {
  const groups = [
    metadata.dimensionProperties.length
      ? `dimensions=${metadata.dimensionProperties.join('|')}`
      : '',
    metadata.quantityProperties.length ? `quantities=${metadata.quantityProperties.join('|')}` : '',
    metadata.materialProperties.length ? `materials=${metadata.materialProperties.join('|')}` : '',
    metadata.shapeProperties.length ? `shape=${metadata.shapeProperties.join('|')}` : '',
    metadata.detailProperties.length ? `details=${metadata.detailProperties.join('|')}` : '',
    metadata.placementProperties.length
      ? `placement=${metadata.placementProperties.join('|')}`
      : '',
  ].filter(Boolean)
  return groups.length ? ` editable(${groups.join('; ')})` : ''
}

export function partCapabilitySummary(family?: string): string {
  return getPartCapabilityMetadata(family)
    .map((metadata) => {
      const definition = partAliasMapByFamily.get(metadata.family)?.get(normalizeKey(metadata.id))
      const params = Object.entries(definition?.params ?? {})
        .map(([key, param]) => {
          if (param.values?.length) return `${key}=${param.values.join('|')}`
          const range =
            param.min != null || param.max != null ? `[${param.min ?? ''},${param.max ?? ''}]` : ''
          return `${key}:${param.type}${range}`
        })
        .join(', ')
      const role = metadata.semanticRole ? ` role=${metadata.semanticRole}` : ''
      return `${metadata.id}${role}: ${params}${summarizeEditableGroups(metadata)}`
    })
    .join('\n')
}

export function normalizeVehiclePartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('vehicle', VEHICLE_PART_DEFINITIONS, input)
}

export function normalizeDeskPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('desk', DESK_PART_DEFINITIONS, input)
}

export function normalizeFanPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  const plan = normalizeFamilyPartPlan('fan', FAN_PART_DEFINITIONS, input)
  for (const part of plan.parts) {
    if (part.kind !== 'protective_grill') continue
    const detailLevel = `${part.detailLevel ?? part.grillDetailLevel ?? ''}`.toLowerCase()
    if (/low|simple|coarse|light|\u4f4e|\u7b80/i.test(detailLevel)) {
      part.ringCount = 3
      part.spokeCount = 12
    } else if (/high|fine|detailed|dense|\u9ad8|\u7ec6|\u5bc6/i.test(detailLevel)) {
      part.ringCount = 5
      part.spokeCount = 24
    }
  }
  return plan
}

export function normalizeAircraftPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('aircraft', AIRCRAFT_PART_DEFINITIONS, input)
}

export function normalizeGenericPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  const category = genericPartPlanCategory(input)
  const plan = normalizeFamilyPartPlan('generic', GENERIC_PART_DEFINITIONS, input)
  const length = numberValue(input.length) ?? 1
  const width = numberValue(input.width, input.depth) ?? 0.65
  const height = numberValue(input.height) ?? 0.8
  const hasKind = (kind: string, role?: string) =>
    plan.parts.some(
      (part) => part.kind === kind && (role == null || normalizeKey(part.semanticRole) === role),
    )
  const add = (part: PartComposePartInput) => {
    if (!hasKind(String(part.kind), normalizeKey(part.semanticRole))) plan.parts.push(part)
  }

  for (const part of plan.parts) {
    if (part.kind === 'generic_body') {
      if (category === 'building') part.semanticRole = 'building_body'
      else if (category === 'furniture') part.semanticRole = 'furniture_body'
      else if (category === 'natural') part.semanticRole = 'natural_mass'
      else part.semanticRole = 'main_body'
    }
    if (part.kind === 'generic_base') {
      part.semanticRole = category === 'natural' ? 'terrain_base' : 'support_base'
    }
  }

  if (category === 'equipment') {
    add({
      kind: 'generic_control_panel',
      semanticRole: 'control_detail',
      length: length * 0.3,
      height: height * 0.28,
      accentColor: stringValue(input.accentColor) ?? '#38bdf8',
    })
    add({ kind: 'generic_foot_set', semanticRole: 'support_foot' })
    if (isCoffeeLikeGeneric(input)) {
      add({
        kind: 'generic_spout',
        semanticRole: 'spout',
        length: width * 0.22,
        radius: Math.min(length, width) * 0.035,
      })
      add({
        kind: 'generic_base',
        semanticRole: 'cup_platform',
        length: length * 0.44,
        width: width * 0.28,
        thickness: height * 0.055,
        position: [0, height * 0.18, width * 0.56],
      })
    }
  } else if (category === 'building') {
    add({
      kind: 'generic_panel',
      semanticRole: 'roof',
      length: length * 1.08,
      height: height * 0.18,
      color: '#7f1d1d',
      position: [0, height * 0.92, 0],
    })
    add({
      kind: 'generic_opening',
      semanticRole: 'opening',
      length: length * 0.22,
      height: height * 0.34,
    })
  } else if (category === 'furniture') {
    add({ kind: 'generic_foot_set', semanticRole: 'support_leg' })
    add({ kind: 'generic_detail_accent', semanticRole: 'detail_accent' })
  } else if (category === 'natural') {
    add({ kind: 'generic_detail_accent', semanticRole: 'detail_accent', accentColor: '#6b8f47' })
  } else {
    add({ kind: 'generic_detail_accent', semanticRole: 'detail_accent' })
  }

  return plan
}

export function normalizeKioskPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('kiosk', KIOSK_PART_DEFINITIONS, input)
}

export function normalizePumpPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('pump', PUMP_PART_DEFINITIONS, input)
}

export function normalizeConveyorPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('conveyor', CONVEYOR_PART_DEFINITIONS, input)
}

export function normalizeElectricalPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('electrical', ELECTRICAL_PART_DEFINITIONS, input)
}

export function normalizePipeSystemPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('pipe_system', PIPE_SYSTEM_PART_DEFINITIONS, input)
}

export function normalizeTankPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('tank', TANK_PART_DEFINITIONS, input)
}

export function normalizeReactorPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('reactor', REACTOR_PART_DEFINITIONS, input)
}

export function normalizeCompressorPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('compressor', COMPRESSOR_PART_DEFINITIONS, input)
}

export function normalizeHeatExchangerPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('heat_exchanger', HEAT_EXCHANGER_PART_DEFINITIONS, input)
}

export function normalizeMachineToolPartPlan(input: Record<string, unknown>): NormalizedPartPlan {
  return normalizeFamilyPartPlan('machine_tool', MACHINE_TOOL_PART_DEFINITIONS, input)
}

export function normalizePartPlanForFamily(
  family: string,
  input: Record<string, unknown>,
): NormalizedPartPlan | undefined {
  if (family === 'fan') return normalizeFanPartPlan(input)
  const definitions = getPartDefinitions(family)
  if (definitions.length === 0) return undefined
  return normalizeFamilyPartPlan(family, definitions, input)
}
