import type { PartComposePartInput } from '@pascal-app/core/lib/part-compose'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRequiredRoleToken(role: string) {
  return role
    .trim()
    .toLowerCase()
    .replace(/[:=]\s*\d+$/, '')
    .replace(/[\s-]+/g, '_')
}

function registrySemanticCategory(family: string): string {
  if (family === 'vehicle') return 'vehicle'
  if (family === 'aircraft') return 'aircraft'
  if (family === 'bicycle') return 'bicycle'
  if (family === 'fan') return 'fan'
  if (family === 'robot_arm') return 'robot_arm'
  if (family === 'generic') return 'generic_object'
  return 'process_equipment'
}

export function dedupeProfileLayoutParts(
  parts: readonly PartComposePartInput[],
): PartComposePartInput[] {
  const seenIds = new Set<string>()
  const seenAnonymousKindRoles = new Set<string>()
  const seenKindRoles = new Set<string>()
  const output: PartComposePartInput[] = []

  for (const part of parts) {
    const kind = String(part.kind ?? part.partType ?? part.type ?? '').trim()
    if (!kind) continue
    const semanticRole = String(part.semanticRole ?? '').trim()
    const explicitId = String(part.id ?? '').trim()
    const idKey = explicitId.toLowerCase()
    const kindRoleKey = `${kind.toLowerCase()}::${semanticRole.toLowerCase()}`
    if (idKey && seenIds.has(idKey)) continue
    if (!idKey && seenKindRoles.has(kindRoleKey)) continue
    if (idKey && seenAnonymousKindRoles.has(kindRoleKey)) continue
    if (idKey) seenIds.add(idKey)
    else seenAnonymousKindRoles.add(kindRoleKey)
    seenKindRoles.add(kindRoleKey)
    output.push(part)
  }

  return output
}

export function preserveExplicitPartPositions(
  layoutParts: readonly PartComposePartInput[],
  sourceParts: unknown,
): PartComposePartInput[] {
  if (!Array.isArray(sourceParts)) return [...layoutParts]
  const positionsById = new Map<string, [number, number, number]>()
  for (const part of sourceParts) {
    if (!isRecord(part) || typeof part.id !== 'string') continue
    const position = vec3Value(part.position)
    if (position) positionsById.set(part.id, position)
  }
  if (positionsById.size === 0) return [...layoutParts]
  return layoutParts.map((part) => {
    const id = typeof part.id === 'string' ? part.id : undefined
    const position = id ? positionsById.get(id) : undefined
    if (!position) return part
    const { connectTo: _connectTo, anchor: _anchor, childAnchor: _childAnchor, ...rest } = part
    return { ...rest, position }
  })
}

export function hasExplicitPartPosition(args: Record<string, unknown>): boolean {
  return (
    Array.isArray(args.parts) &&
    args.parts.some((part) => isRecord(part) && vec3Value(part.position) != null)
  )
}

export function canonicalizeRegistryLayoutPartRoles(
  family: string,
  parts: readonly PartComposePartInput[],
): PartComposePartInput[] {
  let changed = false
  const category = registrySemanticCategory(family)
  const partByReference = new Map<string, PartComposePartInput>()
  for (const part of parts) {
    const references = [
      part.id,
      part.sourcePartId,
      part.name,
      part.partName,
      part.kind,
      part.semanticRole,
    ]
    for (const reference of references) {
      if (typeof reference === 'string' && reference.trim()) {
        partByReference.set(reference.trim().toLowerCase(), part)
      }
    }
  }
  let flangeIndex = 0
  const output = parts.map((part) => {
    const kind = normalizeRequiredRoleToken(String(part.kind ?? part.partType ?? part.type ?? ''))
    const semanticRole = normalizeRequiredRoleToken(String(part.semanticRole ?? ''))
    const canonicalRole =
      category === 'process_equipment' && kind === 'cylindrical_tank'
        ? 'vessel_shell'
        : kind === 'platform_ladder'
          ? 'access_platform'
          : undefined
    let next = part
    if (canonicalRole && semanticRole !== canonicalRole) {
      changed = true
      next = { ...next, semanticRole: canonicalRole }
    }
    if (kind === 'flange_ring') {
      const attachedFlange = normalizeRegistryFlangeConnectorPlacement(
        next,
        parts,
        partByReference,
        flangeIndex,
      )
      flangeIndex += 1
      if (attachedFlange !== next) {
        changed = true
        next = attachedFlange
      }
    }
    return next
  })
  return changed ? output : [...parts]
}

function normalizeRegistryFlangeConnectorPlacement(
  part: PartComposePartInput,
  parts: readonly PartComposePartInput[],
  partByReference: ReadonlyMap<string, PartComposePartInput>,
  flangeIndex: number,
): PartComposePartInput {
  const semanticRole = normalizeRequiredRoleToken(String(part.semanticRole ?? ''))
  if (
    semanticRole === 'tray_band' ||
    semanticRole === 'vessel_seam' ||
    semanticRole === 'riding_ring' ||
    semanticRole === 'support_ring' ||
    semanticRole === 'girth_gear'
  ) {
    return part
  }
  const text = [
    part.id,
    part.sourcePartId,
    part.name,
    part.partName,
    part.semanticRole,
    part.connectTo,
    part.connectPoint,
  ]
    .filter(
      (value): value is string | number => typeof value === 'string' || typeof value === 'number',
    )
    .join(' ')
    .toLowerCase()
  const explicitTarget =
    typeof part.connectTo === 'string'
      ? partByReference.get(part.connectTo.toLowerCase())
      : undefined
  const targetKind = explicitTarget ? registryPartKind(explicitTarget) : ''
  const connectorPortKinds = new Set([
    'inlet_port',
    'outlet_port',
    'pipe_port',
    'flanged_nozzle',
    'sanitary_nozzle',
    'instrument_port',
  ])
  const inferredTargetKind = connectorPortKinds.has(targetKind)
    ? targetKind
    : /outlet|discharge/.test(text)
      ? 'outlet_port'
      : /inlet|suction/.test(text)
        ? 'inlet_port'
        : flangeIndex === 0
          ? 'inlet_port'
          : flangeIndex === 1
            ? 'outlet_port'
            : undefined
  if (!inferredTargetKind) return part
  const target =
    targetKind === inferredTargetKind
      ? explicitTarget
      : parts.find((candidate) => registryPartKind(candidate) === inferredTargetKind)
  if (!target) return part
  const targetReference =
    typeof target.id === 'string' && target.id.trim()
      ? target.id.trim()
      : typeof target.sourcePartId === 'string' && target.sourcePartId.trim()
        ? target.sourcePartId.trim()
        : inferredTargetKind
  const targetAxis =
    target.axis === 'x' || target.axis === 'y' || target.axis === 'z' ? target.axis : undefined
  const {
    position: _position,
    side: _side,
    ...rest
  } = part as PartComposePartInput & {
    position?: unknown
    side?: unknown
  }
  return {
    ...rest,
    connectTo: targetReference,
    connectPoint: 'open',
    childPoint: part.childPoint ?? 'back',
    axis: targetAxis ?? (inferredTargetKind === 'outlet_port' ? 'x' : 'z'),
  }
}

function registryPartKind(part: PartComposePartInput): string {
  return normalizeRequiredRoleToken(
    String(part.kind ?? part.partType ?? part.type ?? part.semanticRole ?? ''),
  )
}

function stringRecordValue(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value).flatMap(([key, raw]) =>
    typeof raw === 'string' && raw.trim() ? [[key, raw.trim()] as const] : [],
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function objectRecordValue(value: unknown): Record<string, Record<string, unknown>> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value).flatMap(([key, raw]) =>
    isRecord(raw) ? [[key, raw] as const] : [],
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function vec3Value(value: unknown): [number, number, number] | undefined {
  return Array.isArray(value) &&
    value.length >= 3 &&
    value.slice(0, 3).every((item) => typeof item === 'number' && Number.isFinite(item))
    ? ([value[0], value[1], value[2]] as [number, number, number])
    : undefined
}

function positiveNumberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function calculatedPresetParameters(
  parameters: unknown,
  dimensions: Record<string, unknown>,
): Record<string, unknown> {
  if (!isRecord(parameters)) return {}
  const output: Record<string, unknown> = {}
  for (const [targetKey, rule] of Object.entries(parameters)) {
    if (!isRecord(rule)) continue
    const sourceKey = typeof rule.from === 'string' ? rule.from : undefined
    const sourceValue = sourceKey ? positiveNumberValue(dimensions[sourceKey]) : undefined
    if (sourceValue == null) continue
    const scale = typeof rule.scale === 'number' && Number.isFinite(rule.scale) ? rule.scale : 1
    const offset = typeof rule.offset === 'number' && Number.isFinite(rule.offset) ? rule.offset : 0
    const min = typeof rule.min === 'number' && Number.isFinite(rule.min) ? rule.min : undefined
    const max = typeof rule.max === 'number' && Number.isFinite(rule.max) ? rule.max : undefined
    output[targetKey] = Math.max(
      min ?? Number.NEGATIVE_INFINITY,
      Math.min(max ?? Number.POSITIVE_INFINITY, sourceValue * scale + offset),
    )
  }
  return output
}

function firstDefinedPartValue(part: PartComposePartInput, key: string): unknown {
  return (part as Record<string, unknown>)[key]
}

function mergePartDefaults(
  part: PartComposePartInput,
  defaults: Record<string, unknown>,
): PartComposePartInput {
  const next = { ...part } as Record<string, unknown>
  for (const [key, value] of Object.entries(defaults)) {
    if (next[key] == null) next[key] = value
  }
  return next as PartComposePartInput
}

function placementForPart(
  layoutTemplate: Record<string, unknown> | undefined,
  part: PartComposePartInput,
): Record<string, unknown> | undefined {
  const placements = Array.isArray(layoutTemplate?.placements) ? layoutTemplate.placements : []
  const role = String(part.semanticRole ?? '').toLowerCase()
  const kind = String(part.kind ?? part.partType ?? part.type ?? '').toLowerCase()
  return placements.filter(isRecord).find((placement) => {
    const placementRole = String(placement.role ?? placement.semanticRole ?? '').toLowerCase()
    const placementKind = String(placement.kind ?? '').toLowerCase()
    return (
      (placementRole.length > 0 && placementRole === role) ||
      (placementKind.length > 0 && placementKind === kind)
    )
  })
}

export function applyResourcePackPartKnowledge(
  sourceArgs: Record<string, unknown>,
  parts: readonly PartComposePartInput[],
): PartComposePartInput[] {
  const layoutHints = isRecord(sourceArgs.layoutHints) ? sourceArgs.layoutHints : undefined
  const layoutTemplate = isRecord(layoutHints?.layoutTemplate)
    ? (layoutHints.layoutTemplate as Record<string, unknown>)
    : undefined
  const partPresetRefs = stringRecordValue(sourceArgs.partPresets)
  const partPresetDefinitions = objectRecordValue(sourceArgs.resolvedPartPresets)
  if (!layoutTemplate && !partPresetRefs && !partPresetDefinitions) return [...parts]

  const dimensions = {
    length: sourceArgs.length,
    width: sourceArgs.width,
    height: sourceArgs.height,
    diameter: sourceArgs.diameter,
    radius: sourceArgs.radius,
  }

  return parts.map((part) => {
    const role = String(part.semanticRole ?? '').trim()
    const kind = String(part.kind ?? part.partType ?? part.type ?? '').trim()
    const presetId =
      (typeof part.preset === 'string' && part.preset.trim() ? part.preset.trim() : undefined) ??
      partPresetRefs?.[role] ??
      partPresetRefs?.[kind]
    const preset = presetId ? partPresetDefinitions?.[presetId] : undefined
    const defaults = isRecord(preset?.defaults) ? preset.defaults : undefined
    const computed = calculatedPresetParameters(preset?.parameters, dimensions)
    const placement = placementForPart(layoutTemplate, part)
    const placementDimensions = isRecord(placement?.dimensions) ? placement.dimensions : undefined
    const placementParams = isRecord(placement?.params) ? placement.params : undefined
    let next = mergePartDefaults(part, {
      ...(defaults ?? {}),
      ...computed,
      ...(placementDimensions ?? {}),
      ...(placementParams ?? {}),
    })
    const position = vec3Value(placement?.position)
    if (position && firstDefinedPartValue(next, 'position') == null) next = { ...next, position }
    const rotation = vec3Value(placement?.rotation)
    if (rotation && firstDefinedPartValue(next, 'rotation') == null) next = { ...next, rotation }
    if (typeof placement?.anchor === 'string' && firstDefinedPartValue(next, 'anchor') == null) {
      next = { ...next, anchor: placement.anchor }
    }
    return next
  })
}
