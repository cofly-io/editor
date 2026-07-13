import type {
  EquipmentParamValue,
  SemanticRecipeDefinition,
  SemanticRecipeEditableParam,
  SemanticRecipePartGroup,
  SemanticRecipePort,
} from '@pascal-app/core'
import { type FactorySemanticRecipePart, numberParam, stringParam } from './common'

export const STORAGE_TANK_RECIPE_ID = 'factory:storage-tank'

type TankMaterialState = 'liquid' | 'granular' | 'powder' | 'gas' | 'none'
type TankAccessStairType = 'none' | 'vertical-ladder' | 'helical' | 'platform-stair'

export const STORAGE_TANK_EDITABLE_PART_ROLES = [
  'vessel_shell',
  'vessel_roof',
  'vessel_head',
  'tank_shell',
  'tank_roof',
  'tank_bottom',
  'liquid_volume',
  'liquid_surface',
  'solid_volume',
  'solid_surface',
  'gas_volume',
  'inlet_port',
  'outlet_port',
  'top_nozzle',
  'manway_flange',
  'access_ladder',
  'top_rim',
  'bottom_rim',
  'foundation_ring',
  'sight_glass',
  'support_leg',
  'saddle_support',
] as const

export const STORAGE_TANK_CORE_PART_ROLES = ['vessel_shell', 'inlet_port', 'outlet_port'] as const

export const STORAGE_TANK_PART_GROUPS: readonly SemanticRecipePartGroup[] = [
  {
    id: 'shell',
    label: 'Tank shell',
    roles: [
      'vessel_shell',
      'vessel_roof',
      'vessel_head',
      'tank_bottom',
      'top_rim',
      'bottom_rim',
      'foundation_ring',
      'sight_glass',
    ],
    sourcePartKinds: ['storage_tank_shell', 'cylindrical_tank'],
    editable: ['color', 'opacity', 'scale'],
  },
  {
    id: 'liquid',
    label: 'Liquid volume',
    roles: ['liquid_volume', 'solid_volume', 'gas_volume'],
    sourcePartKinds: ['liquid_volume'],
    editable: ['level', 'color', 'opacity'],
  },
  {
    id: 'material_surface',
    label: 'Material surface',
    roles: ['liquid_surface', 'solid_surface'],
    sourcePartKinds: ['circular_base'],
    editable: ['level', 'color', 'opacity'],
  },
  {
    id: 'access_stair',
    label: 'Access stair',
    roles: [
      'access_ladder',
      'helical_ladder_tread',
      'helical_ladder_guard_rail',
      'helical_ladder_mid_rail',
      'helical_ladder_stringer',
      'helical_ladder_landing',
      'helical_ladder_post',
      'platform_ladder',
    ],
    sourcePartKinds: ['helical_ladder', 'platform_ladder'],
    sourcePartIds: ['access_ladder'],
    editable: ['delete', 'visible', 'color', 'opacity'],
    deleteParamPatch: { hasAccessStair: false },
  },
  {
    id: 'ports',
    label: 'Ports',
    roles: ['inlet_port', 'outlet_port', 'top_nozzle', 'manway_flange', 'instrument_port'],
    sourcePartKinds: ['flanged_nozzle', 'instrument_port', 'pipe_port'],
    editable: ['color', 'opacity', 'scale'],
  },
  {
    id: 'supports',
    label: 'Supports',
    roles: ['support_leg', 'saddle_support'],
    editable: ['visible', 'color', 'opacity'],
  },
] as const

export const STORAGE_TANK_EDITABLE_PARAMS: readonly SemanticRecipeEditableParam[] = [
  {
    key: 'liquidLevel',
    label: '\u6db2\u4f4d',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.01,
    precision: 2,
    defaultValue: 0.55,
    effects: [
      { kind: 'set-param' },
      {
        kind: 'set-part-dynamic-level',
        partRole: 'liquid_volume',
        geometryRef: 'dynamicLevelGeometry',
        minSize: 0.02,
      },
    ],
  },
  {
    key: 'shellOpacity',
    label: '\u7f50\u4f53\u900f\u660e\u5ea6',
    kind: 'number',
    min: 0.12,
    max: 1,
    step: 0.01,
    precision: 2,
    defaultValue: 0.34,
    effects: [
      { kind: 'set-param' },
      {
        kind: 'set-part-material',
        partRole: 'vessel_shell',
        property: 'opacity',
        transparentWhenBelowOne: true,
      },
    ],
  },
  {
    key: 'liquidOpacity',
    label: '\u6db2\u4f53\u900f\u660e\u5ea6',
    kind: 'number',
    min: 0.08,
    max: 0.92,
    step: 0.01,
    precision: 2,
    defaultValue: 0.58,
    effects: [
      { kind: 'set-param' },
      {
        kind: 'set-part-material',
        partRole: 'liquid_volume',
        property: 'opacity',
        transparentWhenBelowOne: true,
      },
    ],
  },
  {
    key: 'liquidColor',
    label: '\u6db2\u4f53\u989c\u8272',
    kind: 'color',
    defaultValue: '#38bdf8',
    effects: [
      { kind: 'set-param' },
      { kind: 'set-part-material', partRole: 'liquid_volume', property: 'color' },
    ],
  },
] as const

function enumParam<T extends string>(
  params: Record<string, EquipmentParamValue> | undefined,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = params?.[key]
  return typeof value === 'string' && values.includes(value as T) ? (value as T) : fallback
}

function booleanParam(
  params: Record<string, EquipmentParamValue> | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const value = params?.[key]
  return typeof value === 'boolean' ? value : fallback
}

function tankMaterialState(
  params: Record<string, EquipmentParamValue> | undefined,
): TankMaterialState {
  const explicit = enumParam<TankMaterialState>(
    params,
    'materialState',
    ['liquid', 'granular', 'powder', 'gas', 'none'],
    'liquid',
  )
  if (params?.materialState) return explicit
  const medium = enumParam(
    params,
    'storedMedium',
    ['liquid', 'solid', 'powder', 'gas', 'empty'],
    'liquid',
  )
  if (medium === 'solid') return 'granular'
  if (medium === 'powder') return 'powder'
  if (medium === 'gas') return 'gas'
  if (medium === 'empty') return 'none'
  return 'liquid'
}

function tankLevel(params: Record<string, EquipmentParamValue> | undefined): number {
  return Math.max(
    0,
    Math.min(1, numberParam(params, 'level', numberParam(params, 'liquidLevel', 0.55))),
  )
}

function tankAccessStairType(
  params: Record<string, EquipmentParamValue> | undefined,
  orientation: 'vertical' | 'horizontal',
): TankAccessStairType {
  if (!booleanParam(params, 'includeAccessStair', true)) return 'none'
  return enumParam<TankAccessStairType>(
    params,
    'accessStairType',
    ['none', 'vertical-ladder', 'helical', 'platform-stair'],
    orientation === 'vertical' ? 'helical' : 'platform-stair',
  )
}

function editableParamsForMaterialState(
  materialState: TankMaterialState,
): readonly SemanticRecipeEditableParam[] {
  if (materialState === 'none') {
    return STORAGE_TANK_EDITABLE_PARAMS.filter((param) => param.key === 'shellOpacity')
  }
  const fillRole =
    materialState === 'granular' || materialState === 'powder'
      ? 'solid_volume'
      : materialState === 'gas'
        ? 'gas_volume'
        : 'liquid_volume'
  return STORAGE_TANK_EDITABLE_PARAMS.map((param) => ({
    ...param,
    effects: param.effects?.map((effect) => {
      if (
        (effect.kind === 'set-part-material' || effect.kind === 'set-part-dynamic-level') &&
        effect.partRole === 'liquid_volume'
      ) {
        return { ...effect, partRole: fillRole }
      }
      return effect
    }),
  }))
}

export function buildStorageTankProfileParts(input: {
  length: number
  width: number
  height: number
  orientation?: 'vertical' | 'horizontal'
  params?: Record<string, EquipmentParamValue>
  primaryColor?: string
  metalColor?: string
}): FactorySemanticRecipePart[] {
  const orientation =
    input.orientation ??
    (input.height >= Math.max(input.length, input.width) ? 'vertical' : 'horizontal')
  const radius =
    orientation === 'vertical'
      ? Math.max(0.18, Math.min(input.length, input.width) / 2)
      : Math.max(0.18, Math.min(input.width, input.height) / 2)
  const vesselLength = orientation === 'vertical' ? input.height : input.length
  const primaryColor =
    input.primaryColor ??
    stringParam(input.params, 'shellColor', orientation === 'vertical' ? '#cbd5e1' : '#94a3b8')
  const metalColor = input.metalColor ?? '#cbd5e1'
  const shellOpacity = Math.max(0.12, Math.min(1, numberParam(input.params, 'shellOpacity', 0.34)))
  const materialState = tankMaterialState(input.params)
  const level = tankLevel(input.params)
  const fillHeight = Math.max(0.02, vesselLength * level)
  const horizontalFillRadius = Math.max(0.02, radius * 0.9 * level)
  const horizontalLiquidBaseY = radius * 0.28
  const horizontalLiquidCenterY = horizontalLiquidBaseY + horizontalFillRadius
  const horizontalSurfaceY = horizontalLiquidBaseY + radius * 1.8 * level
  const contentColor = stringParam(
    input.params,
    'contentColor',
    stringParam(input.params, 'liquidColor', materialState === 'liquid' ? '#38bdf8' : '#c2a66b'),
  )
  const contentOpacity = Math.max(
    0.08,
    Math.min(
      0.92,
      numberParam(input.params, 'contentOpacity', numberParam(input.params, 'liquidOpacity', 0.58)),
    ),
  )
  const accessStairType = tankAccessStairType(input.params, orientation)
  const materialParts: FactorySemanticRecipePart[] =
    materialState === 'liquid'
      ? [
          {
            id: 'liquid',
            kind: 'liquid_volume',
            semanticRole: 'liquid_volume',
            axis: orientation === 'vertical' ? 'y' : 'x',
            position:
              orientation === 'vertical'
                ? [0, fillHeight / 2 + radius * 0.28, 0]
                : [0, horizontalLiquidCenterY, 0],
            height: orientation === 'vertical' ? fillHeight : vesselLength * 0.96,
            radius: orientation === 'vertical' ? radius * 0.9 : horizontalFillRadius,
            color: contentColor,
            opacity: contentOpacity,
            materialState,
            level,
          },
          {
            id: 'liquid_surface',
            kind: 'circular_base',
            semanticRole: 'liquid_surface',
            sourcePartKind: 'circular_base',
            position:
              orientation === 'vertical'
                ? [0, fillHeight + radius * 0.28 + 0.006, 0]
                : [0, horizontalSurfaceY + 0.006, 0],
            radius: orientation === 'vertical' ? radius * 0.88 : Math.max(0.04, radius * 0.86),
            height: 0.012,
            color: contentColor,
            opacity: Math.min(0.85, contentOpacity + 0.16),
            material: {
              properties: {
                color: contentColor,
                roughness: 0.18,
                metalness: 0,
                opacity: Math.min(0.85, contentOpacity + 0.16),
                transparent: true,
              },
            },
            materialState,
            level,
            surfaceMode: stringParam(input.params, 'surfaceMode', 'wave'),
            surfaceMotion: stringParam(input.params, 'surfaceMotion', 'subtle'),
            runtimeEffect: 'tank-liquid-wave',
            renderContract: {
              targetRole: 'liquid_surface',
              geometry: 'disc-surface',
              material: 'animated-liquid-surface',
              shaderHint: 'subtle-wave',
            },
          },
        ]
      : materialState === 'granular' || materialState === 'powder'
        ? [
            {
              id: 'solid',
              kind: 'liquid_volume',
              semanticRole: 'solid_volume',
              axis: orientation === 'vertical' ? 'y' : 'x',
              position:
                orientation === 'vertical'
                  ? [0, fillHeight / 2 + radius * 0.28, 0]
                  : [0, horizontalLiquidCenterY, 0],
              height: orientation === 'vertical' ? fillHeight : vesselLength * 0.96,
              radius: orientation === 'vertical' ? radius * 0.9 : horizontalFillRadius,
              color: contentColor,
              opacity: contentOpacity,
              materialState,
              level,
            },
            {
              id: 'solid_surface',
              kind: 'circular_base',
              semanticRole: 'solid_surface',
              sourcePartKind: 'circular_base',
              position:
                orientation === 'vertical'
                  ? [0, fillHeight + radius * 0.28 + 0.006, 0]
                  : [0, horizontalSurfaceY + 0.006, 0],
              radius: orientation === 'vertical' ? radius * 0.88 : Math.max(0.04, radius * 0.86),
              height: 0.012,
              color: contentColor,
              opacity: contentOpacity,
              materialState,
              level,
              surfaceMode: stringParam(input.params, 'surfaceMode', 'flat'),
              surfaceMotion: 'none',
              runtimeEffect: 'tank-solid-level',
            },
          ]
        : materialState === 'gas'
          ? [
              {
                id: 'gas_volume',
                kind: 'liquid_volume',
                semanticRole: 'gas_volume',
                axis: orientation === 'vertical' ? 'y' : 'x',
                position:
                  orientation === 'vertical'
                    ? [0, vesselLength / 2 + radius * 0.28, 0]
                    : [0, radius * 1.18, 0],
                height: vesselLength,
                radius: radius * 0.88,
                color: contentColor,
                opacity: Math.min(0.16, contentOpacity),
                materialState,
              },
            ]
          : []
  const accessParts: FactorySemanticRecipePart[] =
    accessStairType === 'none'
      ? []
      : [
          {
            id: 'access_ladder',
            kind: accessStairType === 'helical' ? 'helical_ladder' : 'platform_ladder',
            semanticRole: 'access_ladder',
            sourcePartKind: accessStairType === 'helical' ? 'helical_ladder' : 'platform_ladder',
            position:
              orientation === 'vertical'
                ? [0, radius * 0.28 + vesselLength * 0.5, 0]
                : [0, Math.max(0.65, input.height * 0.62), radius * 1.08],
            length: Math.max(0.6, radius * 0.72),
            width: Math.max(0.34, radius * 0.38),
            height: Math.max(0.9, input.height * 0.76),
            innerRadius: radius * 1.04,
            outerRadius: radius * 1.26,
            sweepAngle: Math.PI * 2.25,
            startAngle: -Math.PI * 0.2,
            stepCount: accessStairType === 'vertical-ladder' ? 10 : 18,
            rungCount: accessStairType === 'vertical-ladder' ? 10 : undefined,
            ringCount: 16,
            railingHeight: 0.34,
            wireRadius: Math.max(0.012, radius * 0.018),
            metalColor,
            accessStairType,
          },
        ]
  return [
    {
      id: 'shell',
      kind: orientation === 'vertical' ? 'storage_tank_shell' : 'cylindrical_tank',
      semanticRole: 'vessel_shell',
      semanticRoleAliases: ['tank_shell', 'tank_roof', 'tank_bottom'],
      sourcePartKind: orientation === 'vertical' ? 'storage_tank_shell' : 'cylindrical_tank',
      axis: orientation === 'vertical' ? 'y' : 'x',
      position:
        orientation === 'vertical'
          ? [0, vesselLength / 2 + radius * 0.28, 0]
          : [0, radius * 1.18, 0],
      length: vesselLength,
      height: vesselLength,
      radius,
      primaryColor,
      metalColor,
      material: {
        properties: {
          color: primaryColor,
          roughness: 0.48,
          metalness: 0.42,
          opacity: shellOpacity,
          transparent: shellOpacity < 1,
        },
      },
      renderContract: {
        targetRole: 'tank_shell',
        geometry:
          orientation === 'vertical' ? 'vertical-cylinder-shell' : 'horizontal-vessel-shell',
        material: 'painted-metal',
      },
    },
    ...materialParts,
    {
      id: 'feed_inlet',
      kind: 'flanged_nozzle',
      semanticRole: 'inlet_port',
      side: 'left',
      radius: Math.max(0.04, radius * 0.08),
      length: Math.max(0.16, radius * 0.18),
      metalColor,
    },
    {
      id: 'product_outlet',
      kind: 'flanged_nozzle',
      semanticRole: 'outlet_port',
      side: 'right',
      radius: Math.max(0.04, radius * 0.075),
      length: Math.max(0.16, radius * 0.18),
      metalColor,
    },
    ...accessParts,
    {
      id: 'level_glass',
      kind: 'sight_glass',
      semanticRole: 'sight_glass',
      side: 'front',
      length: Math.max(0.18, radius * 0.16),
      height: Math.max(0.55, input.height * 0.46),
      opacity: 0.42,
      color: '#60a5fa',
      metalColor,
    },
    {
      id: 'instrument',
      kind: 'instrument_port',
      semanticRole: 'instrument_port',
      side: 'top',
      radius: Math.max(0.035, radius * 0.055),
      metalColor,
    },
  ]
}

export function buildStorageTankPorts(
  input: { height?: number; medium?: string } = {},
): SemanticRecipePort[] {
  const height = input.height ?? 2.4
  const medium = input.medium ?? 'material'
  return [
    { id: 'inlet', role: 'process-inlet', medium, side: 'left', height: height * 0.58, offset: 0 },
    {
      id: 'outlet',
      role: 'process-outlet',
      medium,
      side: 'right',
      height: height * 0.38,
      offset: 0,
    },
  ]
}

export const storageTankRecipe: SemanticRecipeDefinition = {
  id: STORAGE_TANK_RECIPE_ID,
  label: 'Storage tank',
  family: 'tank',
  acceptsProfiles: [
    'tank',
    'storage_tank',
    'vertical_tank',
    'horizontal_tank',
    'generic.vertical_tank',
    'generic.horizontal_tank',
    'refinery.crude_storage_tank',
    'refinery.product_storage_tank',
    'refinery.intermediate_storage_tank',
  ],
  paramSchema: {
    fields: [
      'length',
      'width',
      'height',
      'diameter',
      'orientation',
      'tankOrientation',
      'capacity',
      'storedMedium',
      'materialState',
      'level',
      'surfaceMode',
      'surfaceMotion',
      'contentColor',
      'contentOpacity',
      'liquidLevel',
      'liquidColor',
      'liquidOpacity',
      'includeAccessStair',
      'accessStairType',
      'shellOpacity',
      'inletDiameter',
      'outletDiameter',
      'shellColor',
    ],
  },
  defaultEnvelope: { length: 3, width: 3, height: 4 },
  partGroups: STORAGE_TANK_PART_GROUPS,
  editableParams: STORAGE_TANK_EDITABLE_PARAMS,
  editablePartRoles: STORAGE_TANK_EDITABLE_PART_ROLES,
  corePartRoles: STORAGE_TANK_CORE_PART_ROLES,
  compose: ({ params, envelope, medium }) => {
    const length = envelope?.length ?? 3
    const width = envelope?.width ?? 3
    const height = envelope?.height ?? 4
    const orientation =
      params?.orientation === 'horizontal' || params?.tankOrientation === 'horizontal'
        ? 'horizontal'
        : params?.orientation === 'vertical' || params?.tankOrientation === 'vertical'
          ? 'vertical'
          : undefined
    const materialState = tankMaterialState(params)
    const parts = buildStorageTankProfileParts({ length, width, height, orientation, params })
    const partGroups = parts.some((part) => part.semanticRole === 'access_ladder')
      ? STORAGE_TANK_PART_GROUPS
      : STORAGE_TANK_PART_GROUPS.filter((group) => group.id !== 'access_stair')
    return {
      parts,
      ports: buildStorageTankPorts({ height, medium }),
      envelope: { length, width, height, tolerance: envelope?.tolerance },
      partGroups,
      editableParams: editableParamsForMaterialState(materialState),
      editablePartRoles: STORAGE_TANK_EDITABLE_PART_ROLES,
      corePartRoles: STORAGE_TANK_CORE_PART_ROLES,
      primarySemanticRole: 'vessel_shell',
    }
  },
}
