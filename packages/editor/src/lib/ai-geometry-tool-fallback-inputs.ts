import type { AssemblyComposeInput } from '@pascal-app/core/lib/assembly-compose'
import {
  inferDeviceProfileDefinition,
  type DeviceProfileDefinition,
} from '@pascal-app/core/lib/device-profile-registry'
import { inferFamilyDefinition } from '@pascal-app/core/lib/family-registry'
import type { PrimitiveGeometryBrief } from '@pascal-app/core/lib/primitive-compose'
import type { ComposeRecipeInput } from '@pascal-app/core/lib/primitive-recipes'
import { isOpenAssemblyCapabilityRequest } from './ai-chat-harness/capability-planner'

export type FallbackInputOptions = {
  isVehicleComponentIntent?: (args: Record<string, unknown>, prompt: string) => boolean
  inferDeviceProfile?: (args: Record<string, unknown>) => DeviceProfileDefinition | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function textOf(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase()
  if (Array.isArray(value)) return value.map(textOf).join(' ')
  if (typeof value === 'object' && value !== null) return Object.values(value).map(textOf).join(' ')
  return ''
}

function readFallbackGeometryBrief(
  args: Record<string, unknown>,
): PrimitiveGeometryBrief | undefined {
  return isRecord(args.geometryBrief) ? (args.geometryBrief as PrimitiveGeometryBrief) : undefined
}

export function recipeFallbackInput(
  args: Record<string, unknown>,
  prompt: string,
): ComposeRecipeInput {
  const candidateRecipe = args.recipeId ?? args.recipe ?? args.id ?? args.objectType ?? undefined
  const params = isRecord(args.params) ? args.params : {}
  const fallbackText = [prompt, args.geometryBrief, args.name, args.partName, args.category]
    .map(textOf)
    .join(' ')
  const rawDimensions = isRecord(args.dimensions)
    ? { ...args.dimensions, units: args.dimensions.units ?? args.units }
    : args.dimensions
  const dimensions = normalizeRecipeFallbackDimensions(rawDimensions, fallbackText)
  return {
    ...(candidateRecipe ? { recipeId: String(candidateRecipe) } : {}),
    name: fallbackText,
    geometryBrief: readFallbackGeometryBrief(args),
    params: {
      ...params,
      ...dimensions,
    },
  }
}

export function openAssemblyFallbackInput(
  args: Record<string, unknown>,
  prompt: string,
  options: FallbackInputOptions = {},
): AssemblyComposeInput {
  const fallback = recipeFallbackInput(args, prompt)
  const params = isRecord(fallback.params) ? fallback.params : {}
  const family = inferOpenAssemblyFamily(args, prompt, options)
  return {
    ...(withoutExternalRecipeBrief(args) as AssemblyComposeInput),
    ...params,
    ...(family ? { family } : {}),
    name: fallback.name,
    prompt,
  }
}

const REGISTRY_OPEN_ASSEMBLY_FAMILIES = new Set([
  'vehicle',
  'fan',
  'pump',
  'conveyor',
  'machine_tool',
  'outdoor_ac',
  'tank',
  'distillation_tower',
  'reactor',
  'compressor',
  'grate_cooler',
  'electrical',
  'robot_arm',
])

function inferOpenAssemblyFamily(
  args: Record<string, unknown>,
  prompt: string,
  options: FallbackInputOptions,
): string | undefined {
  const profile = (options.inferDeviceProfile ?? inferDeviceProfileDefinition)({ ...args, prompt })
  if (profile && REGISTRY_OPEN_ASSEMBLY_FAMILIES.has(profile.family)) return profile.family
  const candidate = args.family ?? args.recipeId ?? args.recipe ?? args.id ?? args.objectType
  const family = inferFamilyDefinition({
    ...args,
    family: args.family,
    object: candidate,
    name: candidate,
    prompt,
  })?.id
  if (!family || !REGISTRY_OPEN_ASSEMBLY_FAMILIES.has(family)) return undefined
  if (family === 'vehicle' && options.isVehicleComponentIntent?.(args, prompt)) return undefined
  return family
}

export function isOpenAssemblyRequest(
  args: Record<string, unknown>,
  prompt: string,
  options: FallbackInputOptions = {},
): boolean {
  return (
    isOpenAssemblyCapabilityRequest(args, prompt) ||
    inferOpenAssemblyFamily(args, prompt, options) != null
  )
}

function numberFromRecord(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function dimensionUnitScale(unit: unknown): number {
  if (typeof unit !== 'string') return 1
  const normalized = unit.trim().toLowerCase()
  if (normalized === 'mm' || normalized === '毫米' || normalized.startsWith('millimeter')) {
    return 0.001
  }
  if (normalized === 'cm' || normalized === '厘米' || normalized.startsWith('centimeter')) {
    return 0.01
  }
  if (normalized === 'm' || normalized === '米' || normalized.startsWith('meter')) return 1
  return 1
}

function scaledDimension(value: number | undefined, scale: number): number | undefined {
  return value == null ? undefined : Number((value * scale).toFixed(4))
}

function normalizeRecipeFallbackDimensions(
  rawDimensions: unknown,
  fallbackText: string,
): Record<string, number> {
  const textDimensions = parseFallbackTextDimensions(fallbackText)
  const dimensions = isRecord(rawDimensions) ? rawDimensions : {}
  const scale = dimensionUnitScale(dimensions.units)
  const length =
    scaledDimension(numberFromRecord(dimensions, 'length'), scale) ?? textDimensions.length
  const width =
    scaledDimension(numberFromRecord(dimensions, 'width'), scale) ?? textDimensions.width
  const depth =
    scaledDimension(numberFromRecord(dimensions, 'depth'), scale) ?? textDimensions.depth
  const height =
    scaledDimension(numberFromRecord(dimensions, 'height'), scale) ?? textDimensions.height

  if (/(air.?condition|outdoor.?ac|condenser|空调|外机)/i.test(fallbackText)) {
    const thickness = scaledDimension(numberFromRecord(dimensions, 'thickness'), scale)
    return {
      ...((length ?? width) ? { length: length ?? width } : {}),
      ...((depth ?? thickness) ? { width: depth ?? thickness } : {}),
      ...(height ? { height } : {}),
    }
  }

  return {
    ...(length ? { length } : {}),
    ...(width ? { width } : {}),
    ...(depth ? { depth } : {}),
    ...(height ? { height } : {}),
  }
}

function parseFallbackTextDimensions(text: string): Record<string, number> {
  const dimensions: Record<string, number> = {}
  const patterns: Array<[string, RegExp]> = [
    ['length', /(?:length|long|长度|长)\s*[:=：]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|毫米|厘米|米)?/i],
    ['width', /(?:width|wide|宽度|宽)\s*[:=：]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|毫米|厘米|米)?/i],
    ['depth', /(?:depth|deep|深度|深)\s*[:=：]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|毫米|厘米|米)?/i],
    ['height', /(?:height|tall|高度|高)\s*[:=：]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|毫米|厘米|米)?/i],
  ]

  for (const [key, pattern] of patterns) {
    const match = text.match(pattern)
    if (!match?.[1]) continue
    dimensions[key] = Number((Number(match[1]) * dimensionUnitScale(match[2])).toFixed(4))
  }

  return dimensions
}

export function withoutExternalRecipeBrief(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const { geometryBrief: _ignoredGeometryBrief, metadata, ...rest } = args
  if (!isRecord(metadata)) return rest
  const { geometryBrief: _ignoredMetadataBrief, ...metadataRest } = metadata
  return Object.keys(metadataRest).length > 0 ? { ...rest, metadata: metadataRest } : rest
}

function normalizedRecipeId(value: unknown): string {
  return typeof value === 'string'
    ? value
        .trim()
        .replace(/[\s_-]+/g, '.')
        .toLowerCase()
    : ''
}

function isMixerImpellerRecipe(args: Record<string, unknown>): boolean {
  const recipeId = normalizedRecipeId(args.recipeId ?? args.recipe ?? args.id)
  if (recipeId === 'mixer.impeller') return true
  return /mixer|agitator|impeller|mud|slurry|泥浆|搅拌|桨叶|叶轮/.test(
    textOf([args.name, args.partName, args.title]),
  )
}

function wantsHorizontalMixerBlades(prompt: string): boolean {
  const text = textOf(prompt)
  const chineseCues = [
    '同一水平',
    '同一高度',
    '同一平面',
    '水平桨叶',
    '水平叶片',
    '不要倾斜',
    '不倾斜',
    '无倾角',
  ]
  return (
    chineseCues.some((cue) => text.includes(cue)) ||
    /same\s+(horizontal\s+)?level|same\s+height|same\s+plane|horizontal\s+blades?|flat\s+blades?|no\s+pitch|zero\s+pitch/.test(
      text,
    )
  )
}

export function applyPromptSemanticsToRecipeInput(
  args: Record<string, unknown>,
  prompt: string,
): Record<string, unknown> {
  const params = isRecord(args.params) ? args.params : {}
  let nextArgs = args
  let nextParams = params
  const promptSemantics = readPromptRecipeSemantics(args, prompt)

  for (const [key, value] of Object.entries(promptSemantics)) {
    if (key === 'primaryColor' && hasRecipeColorValue(args, params)) continue
    if (hasRecipeValue(args, params, key)) continue
    if (nextArgs === args) nextArgs = { ...args }
    if (nextParams === params) nextParams = { ...params }
    nextArgs[key] = value
    nextParams[key] = value
  }

  if (nextParams !== params) nextArgs.params = nextParams
  if (!isMixerImpellerRecipe(nextArgs) || !wantsHorizontalMixerBlades(prompt)) return nextArgs
  return {
    ...nextArgs,
    bladeTilt: 0,
    bladePitch: 0,
    params: {
      ...nextParams,
      bladeTilt: nextParams.bladeTilt ?? 0,
      bladePitch: nextParams.bladePitch ?? 0,
    },
  }
}

function hasRecipeValue(
  args: Record<string, unknown>,
  params: Record<string, unknown>,
  key: string,
): boolean {
  return args[key] != null || params[key] != null
}

function hasRecipeColorValue(
  args: Record<string, unknown>,
  params: Record<string, unknown>,
): boolean {
  return hasRecipeValue(args, params, 'primaryColor') || hasRecipeValue(args, params, 'color')
}

function readPromptRecipeSemantics(
  args: Record<string, unknown>,
  prompt: string,
): Record<string, string | number> {
  const semantics: Record<string, string | number> = {}
  const color = parsePromptColor(prompt)
  if (color) semantics.primaryColor = color

  const dimensions = parsePromptDimensions(prompt, isVehicleRecipeRequest(args, prompt))
  return { ...semantics, ...dimensions }
}

const PROMPT_COLOR_HEX: Array<[RegExp, string]> = [
  [/(绿色|green)/i, '#22c55e'],
  [/(红色|\bred\b)/i, '#ef4444'],
  [/(蓝色|blue)/i, '#2563eb'],
  [/(黄色|yellow)/i, '#facc15'],
  [/(黑色|black)/i, '#111827'],
  [/(白色|white)/i, '#f8fafc'],
  [/(灰色|grey|gray)/i, '#64748b'],
  [/(紫色|purple)/i, '#8b5cf6'],
  [/(橙色|orange)/i, '#f97316'],
  [/(粉色|pink)/i, '#ec4899'],
]

function parsePromptColor(prompt: string): string | undefined {
  return PROMPT_COLOR_HEX.find(([pattern]) => pattern.test(prompt))?.[1]
}

function isVehicleRecipeRequest(args: Record<string, unknown>, prompt: string): boolean {
  const recipeId = normalizedRecipeId(args.recipeId ?? args.recipe ?? args.id ?? args.objectType)
  return (
    recipeId.startsWith('vehicle.') ||
    /(?:car|sedan|suv|truck|vehicle|汽车|小汽车|轿车|货车)/i.test(prompt)
  )
}

function parsePromptDimensions(
  prompt: string,
  allowGenericLength: boolean,
): Record<string, number> {
  const dimensions: Record<string, number> = {}
  const dimensionPatterns: Array<[string, RegExp]> = [
    [
      'length',
      /(?:长度|车长|长|length|long)\s*(?:大约|约|是|为|:|：|=)?\s*([0-9]+(?:\.[0-9]+)?|[一二两三四五六七八九十]+)\s*(mm|毫米|cm|厘米|m|米)?/i,
    ],
    [
      'width',
      /(?:宽度|宽|width|wide)\s*(?:大约|约|是|为|:|：|=)?\s*([0-9]+(?:\.[0-9]+)?|[一二两三四五六七八九十]+)\s*(mm|毫米|cm|厘米|m|米)?/i,
    ],
    [
      'height',
      /(?:高度|高|height|tall)\s*(?:大约|约|是|为|:|：|=)?\s*([0-9]+(?:\.[0-9]+)?|[一二两三四五六七八九十]+)\s*(mm|毫米|cm|厘米|m|米)?/i,
    ],
    [
      'depth',
      /(?:深度|深|depth|deep)\s*(?:大约|约|是|为|:|：|=)?\s*([0-9]+(?:\.[0-9]+)?|[一二两三四五六七八九十]+)\s*(mm|毫米|cm|厘米|m|米)?/i,
    ],
  ]

  for (const [key, pattern] of dimensionPatterns) {
    const dimension = parsePromptDimensionMatch(prompt.match(pattern))
    if (dimension != null) dimensions[key] = dimension
  }

  if (allowGenericLength && dimensions.length == null) {
    const dimension = parsePromptDimensionMatch(
      prompt.match(/([0-9]+(?:\.[0-9]+)?|[一二两三四五六七八九十]+)\s*(mm|毫米|cm|厘米|m|米)?/i),
    )
    if (dimension != null) dimensions.length = dimension
  }

  return dimensions
}

function parsePromptDimensionMatch(match: RegExpMatchArray | null): number | undefined {
  if (!match?.[1]) return undefined
  const value = parsePromptNumber(match[1])
  if (value == null) return undefined
  return Number((value * dimensionUnitScale(match[2])).toFixed(4))
}

function parsePromptNumber(value: string): number | undefined {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  const normalized = value.replaceAll('两', '二')
  const digitMap: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  if (normalized === '十') return 10
  if (normalized.includes('十')) {
    const [tensRaw, onesRaw] = normalized.split('十')
    const tens = tensRaw ? digitMap[tensRaw] : 1
    const ones = onesRaw ? digitMap[onesRaw] : 0
    return tens != null && ones != null ? tens * 10 + ones : undefined
  }
  return digitMap[normalized]
}
