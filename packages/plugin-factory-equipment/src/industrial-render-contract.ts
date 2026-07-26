import type {
  IndustrialRenderContract,
  IndustrialRenderKernel,
  SemanticRecipePart,
} from '@pascal-app/core/registry'
import { RenderContractRulesLoader, type IndustrialRenderRule } from './render-contract-rules-loader'

export type IndustrialRenderContractSummary = {
  partCount: number
  kernels: Record<IndustrialRenderKernel, number>
  runtimeEffects: string[]
  instancingHints: string[]
}

export type { IndustrialRenderRule }

const INDUSTRIAL_RENDER_RULES: readonly IndustrialRenderRule[] = [
  {
    id: 'liquid-surface',
    priority: 100,
    roles: ['liquid_surface'],
    kernel: 'liquid-surface',
    material: 'translucent-liquid',
    runtimeEffects: ['tank-liquid-wave'],
  },
  {
    id: 'solid-surface',
    priority: 98,
    roles: ['solid_surface'],
    kernel: 'solid-surface',
    material: 'granular-solid',
  },
  {
    id: 'liquid-volume',
    priority: 96,
    roles: ['liquid_volume'],
    kernel: 'translucent-fill-volume',
    material: 'translucent-liquid',
  },
  {
    id: 'solid-volume',
    priority: 94,
    roles: ['solid_volume'],
    kernel: 'translucent-fill-volume',
    material: 'granular-solid',
  },
  {
    id: 'gas-volume',
    priority: 92,
    roles: ['gas_volume'],
    kernel: 'gas-volume',
    material: 'low-opacity-gas',
  },
  {
    id: 'distillation-column-shell',
    priority: 90,
    roles: ['vacuum_column_shell', 'distillation_column_shell', 'column_shell'],
    kernel: 'distillation-column-shell',
    material: 'painted-metal',
  },
  {
    id: 'storage-tank-shell',
    priority: 88,
    roles: ['tank_shell'],
    sourcePartKinds: ['storage_tank_shell'],
    tokenPatterns: [/storage_tank_shell/],
    kernel: 'painted-cylindrical-shell',
    material: 'painted-metal',
  },
  {
    id: 'horizontal-vessel-shell',
    priority: 86,
    roles: ['knockout_drum', 'steam_drum', 'mud_drum'],
    sourcePartKinds: ['cylindrical_tank'],
    tokenPatterns: [/cylindrical_tank/],
    kernel: 'horizontal-vessel-shell',
    material: 'painted-metal',
  },
  {
    id: 'generic-vessel-shell',
    priority: 82,
    roles: ['vessel_shell'],
    kernel: 'painted-cylindrical-shell',
    material: 'painted-metal',
  },
  {
    id: 'pipe-run',
    priority: 76,
    roles: ['main_pipe_header', 'parallel_pipe_run'],
    sourcePartKinds: ['pipe_run', 'pipe_manifold'],
    tokenPatterns: [/pipe_run|pipe_manifold|header/],
    kernel: 'process-pipe-run',
    material: 'brushed-metal',
    instancingHint: 'pipe-bundles',
  },
  {
    id: 'flanged-connection',
    priority: 72,
    roles: [
      'inlet_port',
      'outlet_port',
      'flange',
      'inlet_flange',
      'outlet_flange',
      'satellite_column_nozzle',
    ],
    sourcePartKinds: ['flange_ring', 'flanged_nozzle', 'inlet_port', 'outlet_port'],
    tokenPatterns: [/flange|nozzle|inlet|outlet/],
    kernel: 'flanged-connection',
    material: 'brushed-metal',
    instancingHint: 'bolts',
  },
  {
    id: 'access-stair-or-ladder',
    priority: 70,
    roles: ['access_ladder', 'access_stair', 'external_spiral_ladder', 'vertical_access_ladder'],
    sourcePartKinds: ['helical_ladder', 'platform_ladder'],
    tokenPatterns: [/helical_ladder|platform_ladder|spiral_ladder/],
    kernel: 'access-stair-or-ladder',
    material: 'galvanized-steel',
    instancingHint: 'steps-rungs-rails',
  },
  {
    id: 'satellite-column-shell',
    priority: 69,
    roles: ['satellite_column'],
    sourcePartKinds: ['cylindrical_tank'],
    tokenPatterns: [/satellite_column/],
    kernel: 'distillation-column-shell',
    material: 'painted-metal',
  },
  {
    id: 'service-platform',
    priority: 68,
    roles: [
      'service_platform',
      'lower_service_platform',
      'middle_service_platform',
      'upper_service_platform',
      'top_service_platform',
    ],
    sourcePartKinds: ['service_platform', 'platform_with_ladder'],
    tokenPatterns: [/platform|railing/],
    kernel: 'service-platform',
    material: 'galvanized-steel',
  },
  {
    id: 'support-frame',
    priority: 66,
    roles: ['support_frame', 'pipe_rack_support_frame'],
    sourcePartKinds: ['structural_tower_frame'],
    tokenPatterns: [/support_frame|structural_tower_frame|pipe_rack_support_frame/],
    kernel: 'support-frame',
    material: 'galvanized-steel',
    instancingHint: 'frame-members',
  },
  {
    id: 'volute-pump-casing',
    priority: 64,
    roles: ['volute_casing'],
    sourcePartKinds: ['volute_casing'],
    kernel: 'volute-pump-casing',
    material: 'painted-metal',
  },
  {
    id: 'ribbed-motor',
    priority: 62,
    roles: ['drive_motor'],
    sourcePartKinds: ['ribbed_motor_body'],
    tokenPatterns: [/ribbed_motor|drive_motor/],
    kernel: 'ribbed-motor',
    material: 'dark-machinery',
  },
  {
    id: 'skid-mounted-pump',
    priority: 60,
    roles: ['support_base'],
    sourcePartKinds: ['skid_base'],
    tokenPatterns: [/skid_base|support_base/],
    kernel: 'skid-mounted-pump',
    material: 'galvanized-steel',
  },
  {
    id: 'shell-and-tube-exchanger',
    priority: 58,
    roles: ['heat_exchanger_shell'],
    sourcePartKinds: ['heat_exchanger'],
    tokenPatterns: [/heat_exchanger/],
    kernel: 'shell-and-tube-exchanger',
    material: 'brushed-metal',
  },
  {
    id: 'fired-heater-body',
    priority: 56,
    roles: ['fired_heater', 'vacuum_heater', 'boiler_body'],
    tokenPatterns: [/heater|boiler_body/],
    kernel: 'fired-heater-body',
    material: 'hot-refractory',
  },
  {
    id: 'lattice-or-stack-emission',
    priority: 54,
    roles: ['flare_stack', 'boiler_stack', 'flue_gas_stack'],
    sourcePartKinds: ['chimney_stack'],
    tokenPatterns: [/flare_stack|boiler_stack|chimney_stack|stack/],
    kernel: 'lattice-or-stack-emission',
    material: 'painted-metal',
  },
]

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function tokens(part: SemanticRecipePart): string[] {
  const record = part as Record<string, unknown>
  return [
    text(part.semanticRole),
    text(record.sourcePartKind),
    text(part.kind),
    ...(Array.isArray(record.semanticRoleAliases) ? record.semanticRoleAliases.map(text) : []),
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase())
}

function tokenSet(part: SemanticRecipePart): Set<string> {
  return new Set(tokens(part))
}

function ruleMatches(rule: IndustrialRenderRule, part: SemanticRecipePart): boolean {
  const values = tokenSet(part)
  const exact = [...(rule.roles ?? []), ...(rule.sourcePartKinds ?? [])].some((value) =>
    values.has(value),
  )
  if (exact) return true
  return Boolean(
    rule.tokenPatterns?.some((pattern) => tokens(part).some((token) => pattern.test(token))),
  )
}

export function resolveIndustrialRenderContract(
  part: SemanticRecipePart,
  customRules?: IndustrialRenderRule[],
): IndustrialRenderContract {
  const rules = customRules ?? INDUSTRIAL_RENDER_RULES
  const rule = [...rules]
    .sort((left, right) => right.priority - left.priority)
    .find((candidate) => ruleMatches(candidate, part))
  if (rule) {
    const {
      id: _id,
      priority: _priority,
      roles: _roles,
      sourcePartKinds: _kinds,
      tokenPatterns: _patterns,
      ...contract
    } = rule
    return contract
  }
  return { kernel: 'generic-industrial-part', material: 'painted-metal' }
}

/**
 * Resolve render contract using rules loaded from an industry pack.
 * Falls back to hardcoded base rules if no custom rules are loaded.
 */
export async function resolveIndustrialRenderContractWithPack(
  part: SemanticRecipePart,
  packRoot: string,
): Promise<IndustrialRenderContract> {
  const loader = new RenderContractRulesLoader()
  await loader.loadFromIndustryPack(packRoot)
  const mergedRules = loader.mergeWithBaseRules([...INDUSTRIAL_RENDER_RULES])
  return resolveIndustrialRenderContract(part, mergedRules)
}

export function attachIndustrialRenderContracts<T extends SemanticRecipePart>(
  parts: readonly T[],
  customRules?: IndustrialRenderRule[],
): Array<T & { renderContract: IndustrialRenderContract }> {
  return parts.map((part) => ({
    ...part,
    renderContract: resolveIndustrialRenderContract(part, customRules),
  }))
}

export function summarizeIndustrialRenderContracts(
  parts: readonly SemanticRecipePart[],
  customRules?: IndustrialRenderRule[],
): IndustrialRenderContractSummary {
  const kernels = {} as Record<IndustrialRenderKernel, number>
  const runtimeEffects = new Set<string>()
  const instancingHints = new Set<string>()
  for (const part of parts) {
    const contract = resolveIndustrialRenderContract(part, customRules)
    kernels[contract.kernel] = (kernels[contract.kernel] ?? 0) + 1
    for (const effect of contract.runtimeEffects ?? []) runtimeEffects.add(effect)
    if (contract.instancingHint) instancingHints.add(contract.instancingHint)
  }
  return {
    partCount: parts.length,
    kernels,
    runtimeEffects: [...runtimeEffects].sort(),
    instancingHints: [...instancingHints].sort(),
  }
}

type ContractTarget = {
  semanticRole?: string
  sourcePartKind?: string
  sourcePartId?: string
  renderContract?: unknown
}

export function applyIndustrialRenderContractsToShapes<T extends ContractTarget>(
  shapes: readonly T[],
  parts: readonly SemanticRecipePart[],
  customRules?: IndustrialRenderRule[],
): T[] {
  const byId = new Map<string, IndustrialRenderContract>()
  const byKind = new Map<string, IndustrialRenderContract>()
  const byRole = new Map<string, IndustrialRenderContract>()
  for (const part of parts) {
    const record = part as Record<string, unknown>
    const contract = resolveIndustrialRenderContract(part, customRules)
    if (typeof part.id === 'string') byId.set(part.id, contract)
    if (typeof record.sourcePartKind === 'string') byKind.set(record.sourcePartKind, contract)
    if (typeof part.kind === 'string') byKind.set(part.kind, contract)
    if (typeof part.semanticRole === 'string') byRole.set(part.semanticRole, contract)
  }
  return shapes.map((shape) => ({
    ...shape,
    renderContract:
      shape.renderContract ??
      (shape.sourcePartId ? byId.get(shape.sourcePartId) : undefined) ??
      (shape.sourcePartKind ? byKind.get(shape.sourcePartKind) : undefined) ??
      (shape.semanticRole ? byRole.get(shape.semanticRole) : undefined),
  }))
}
