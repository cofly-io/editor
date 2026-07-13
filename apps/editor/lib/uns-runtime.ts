'use client'

import type { LiveDataPath, LiveDataValue } from '@pascal-app/core'

export type UnsField = {
  name?: unknown
  type?: unknown
  displayName?: unknown
  systemField?: unknown
}
export type UnsNode = {
  type?: unknown
  name?: unknown
  alias?: unknown
  displayName?: unknown
  children?: unknown
  fields?: unknown
  dataType?: unknown
  writeData?: unknown
}
export type UnsPoint = { id: string; path: string; dataType: string; writable: boolean }
export type SavedUnsCatalog = { sourceName: string; importedAt: string; raw: unknown }
export type SimulationKind = 'state' | 'random' | 'fixed'
export type SimulationRule = {
  pointId: string
  kind: SimulationKind
  min: number
  max: number
  fixedValue: number
  falseValue: number
  trueValue: number
  switchEverySeconds: number
}
export type UnsRuntimeState = { simulating: boolean }

export const UNS_RUNTIME_EVENT = 'pascal:uns-runtime-changed'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function boolFlag(value: unknown): boolean {
  return value === true || value === 'TRUE'
}

export function readUnsRoots(raw: unknown): UnsNode[] {
  if (isRecord(raw) && Array.isArray(raw.UNS)) return raw.UNS.filter(isRecord) as UnsNode[]
  if (Array.isArray(raw)) return raw.filter(isRecord) as UnsNode[]
  return []
}

export function fieldLabel(field: UnsField): string | undefined {
  return stringValue(field.displayName) ?? stringValue(field.name)
}

export function nodeLabel(node: UnsNode) {
  return (
    stringValue(node.displayName) ?? stringValue(node.name) ?? stringValue(node.alias) ?? 'Unnamed'
  )
}

export function pointId(node: UnsNode, fieldName: string) {
  return `${stringValue(node.alias) ?? nodeLabel(node)}.${fieldName}`
}

export function defaultRule(point: UnsPoint): SimulationRule {
  return {
    pointId: point.id,
    kind: 'random',
    min: 0,
    max: 100,
    fixedValue: 0,
    falseValue: 0,
    trueValue: 1,
    switchEverySeconds: 5,
  }
}

export function flattenUnsPoints(raw: unknown): UnsPoint[] {
  const points: UnsPoint[] = []

  const walk = (node: UnsNode, path: string[]) => {
    const type = stringValue(node.type)
    const label = nodeLabel(node)
    const nextPath = type === 'folder' ? [...path, label] : path

    if (type === 'file') {
      const fields = Array.isArray(node.fields) ? (node.fields.filter(isRecord) as UnsField[]) : []
      const basePath = [...path, label]
      for (const field of fields.filter((item) => item.systemField !== true && fieldLabel(item))) {
        const fieldName = fieldLabel(field)
        if (!fieldName) continue
        points.push({
          id: pointId(node, fieldName),
          path: [...basePath, fieldName].join('/'),
          dataType: stringValue(field.type) ?? stringValue(node.dataType) ?? 'UNKNOWN',
          writable: boolFlag(node.writeData),
        })
      }
    }

    const children = Array.isArray(node.children)
      ? (node.children.filter(isRecord) as UnsNode[])
      : []
    for (const child of children) walk(child, nextPath)
  }

  for (const root of readUnsRoots(raw)) walk(root, [])
  return points
}

export function unsCatalogStorageKey(sceneId: string) {
  return `pascal:uns-catalog:${sceneId}`
}

export function legacyUnsCatalogStorageKey(sceneId: string) {
  return `pascal:data-catalog:${sceneId}`
}

export function unsRulesStorageKey(sceneId: string) {
  return `pascal:uns-rules:${sceneId}`
}

export function unsRuntimeStateStorageKey(sceneId: string) {
  return `pascal:uns-runtime:${sceneId}`
}

export function readStoredUnsCatalog(sceneId: string): SavedUnsCatalog | null {
  try {
    const stored =
      window.localStorage.getItem(unsCatalogStorageKey(sceneId)) ??
      window.localStorage.getItem(legacyUnsCatalogStorageKey(sceneId))
    return stored ? (JSON.parse(stored) as SavedUnsCatalog) : null
  } catch {
    return null
  }
}

export function readStoredRules(sceneId: string): Record<string, SimulationRule> {
  try {
    const stored = window.localStorage.getItem(unsRulesStorageKey(sceneId))
    if (!stored) return {}
    const parsed = JSON.parse(stored)
    return isRecord(parsed) ? (parsed as Record<string, SimulationRule>) : {}
  } catch {
    return {}
  }
}

export function readStoredRuntimeState(sceneId: string): UnsRuntimeState {
  try {
    const stored = window.localStorage.getItem(unsRuntimeStateStorageKey(sceneId))
    const parsed = stored ? JSON.parse(stored) : null
    return isRecord(parsed) ? { simulating: parsed.simulating === true } : { simulating: false }
  } catch {
    return { simulating: false }
  }
}

export function writeStoredUnsCatalog(sceneId: string, catalog: SavedUnsCatalog) {
  window.localStorage.setItem(unsCatalogStorageKey(sceneId), JSON.stringify(catalog))
  emitUnsRuntimeChanged()
}

export function writeStoredRules(sceneId: string, rules: Record<string, SimulationRule>) {
  window.localStorage.setItem(unsRulesStorageKey(sceneId), JSON.stringify(rules))
  emitUnsRuntimeChanged()
}

export function writeStoredRuntimeState(sceneId: string, state: UnsRuntimeState) {
  window.localStorage.setItem(unsRuntimeStateStorageKey(sceneId), JSON.stringify(state))
  emitUnsRuntimeChanged()
}

export function emitUnsRuntimeChanged() {
  window.dispatchEvent(new CustomEvent(UNS_RUNTIME_EVENT))
}

function pointSeed(pointIdValue: string) {
  let hash = 0
  for (let index = 0; index < pointIdValue.length; index += 1) {
    hash = (hash * 31 + pointIdValue.charCodeAt(index)) % 9973
  }
  return hash
}

export function sampleUnsValue(rule: SimulationRule, tick: number) {
  if (rule.kind === 'fixed') return rule.fixedValue
  if (rule.kind === 'state') {
    const phase = Math.floor(tick / Math.max(1, rule.switchEverySeconds))
    return phase % 2 === 0 ? rule.falseValue : rule.trueValue
  }
  const seed = Math.sin((tick + pointSeed(rule.pointId)) * 12.9898 + rule.max) * 43758.5453
  const fraction = seed - Math.floor(seed)
  return Number((rule.min + fraction * (rule.max - rule.min)).toFixed(2))
}

export function liveDataValueType(dataType: string): LiveDataPath['valueType'] {
  const normalized = dataType.toLowerCase()
  if (normalized === 'boolean') return 'boolean'
  if (['string', 'varchar', 'text', 'blob', 'datetime'].includes(normalized)) return 'string'
  return 'number'
}

export function buildUnsLiveDataValues(
  points: UnsPoint[],
  rules: Record<string, SimulationRule>,
  tick: number,
) {
  const values: Record<string, LiveDataValue> = {}
  for (const point of points) {
    const rule = rules[point.id]
    if (rule) values[point.id] = sampleUnsValue(rule, tick)
  }
  return values
}
