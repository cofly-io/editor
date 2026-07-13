'use client'

import {
  type DynamicBinding,
  type DynamicType,
  getRecommendedDynamicTypeForNode,
  readDynamicMetadata,
  useScene,
  writeDynamicMetadataPatch,
} from '@pascal-app/core'
import type { AnyNode, AnyNodeId } from '@pascal-app/core/schema'
import useViewer from '@pascal-app/viewer/store'
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Database,
  FileJson,
  Folder,
  Link2,
  Pause,
  Play,
  SlidersHorizontal,
  Upload,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  readStoredRules,
  readStoredRuntimeState,
  writeStoredRules,
  writeStoredRuntimeState,
  writeStoredUnsCatalog,
} from '@/lib/uns-runtime'
import { cn } from '@/lib/utils'

type UnsField = { name?: unknown; type?: unknown; displayName?: unknown; systemField?: unknown }
type UnsNode = {
  type?: unknown
  name?: unknown
  alias?: unknown
  displayName?: unknown
  children?: unknown
  fields?: unknown
  dataType?: unknown
  writeData?: unknown
}
type UnsPoint = { id: string; path: string; dataType: string; writable: boolean }
type SavedUnsCatalog = { sourceName: string; importedAt: string; raw: unknown }
type SimulationKind = 'state' | 'random' | 'fixed'
type SimulationRule = {
  pointId: string
  kind: SimulationKind
  min: number
  max: number
  fixedValue: number
  falseValue: number
  trueValue: number
  switchEverySeconds: number
}
type UnsBindingPoint = { id: string; label: string; path: string; dataType: string }

const DEFAULT_DATA_CHART_KEYS = ['machine.temperature', 'fan.speed', 'alarm.count']
const DEFAULT_DATA_TABLE_KEYS = ['machine.temperature', 'fan.speed', 'alarm.count']

const SIMULATION_KIND_LABELS: Record<SimulationKind, string> = {
  state: '状态',
  random: '随机',
  fixed: '固定',
}

const DATA_TYPE_BADGES: Record<string, string> = {
  integer: 'I',
  long: 'L',
  float: 'F',
  double: 'D',
  decimal: 'DE',
  number: 'N',
  boolean: 'B',
  datetime: 'DT',
  string: 'S',
  blob: 'BL',
  varchar: 'V',
  int: 'I',
  int32: 'I',
}
const OPEN_DYNAMIC_INSPECTOR_EVENT = 'pascal:open-dynamic-inspector'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function boolFlag(value: unknown): boolean {
  return value === true || value === 'TRUE'
}

function readUnsRoots(raw: unknown): UnsNode[] {
  if (isRecord(raw) && Array.isArray(raw.UNS)) return raw.UNS.filter(isRecord) as UnsNode[]
  if (Array.isArray(raw)) return raw.filter(isRecord) as UnsNode[]
  return []
}

function fieldLabel(field: UnsField): string | undefined {
  return stringValue(field.displayName) ?? stringValue(field.name)
}

function nodeLabel(node: UnsNode) {
  return (
    stringValue(node.displayName) ?? stringValue(node.name) ?? stringValue(node.alias) ?? '未命名'
  )
}

function pointId(node: UnsNode, fieldName: string) {
  return `${stringValue(node.alias) ?? nodeLabel(node)}.${fieldName}`
}

function defaultRule(point: UnsPoint): SimulationRule {
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

function flattenUnsPoints(raw: unknown): UnsPoint[] {
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

function storageKey(sceneId: string) {
  return `pascal:uns-catalog:${sceneId}`
}

function legacyStorageKey(sceneId: string) {
  return `pascal:data-catalog:${sceneId}`
}

function sampleValue(rule: SimulationRule, tick: number) {
  if (rule.kind === 'fixed') return rule.fixedValue
  if (rule.kind === 'state') {
    const phase = Math.floor(tick / Math.max(1, rule.switchEverySeconds))
    return phase % 2 === 0 ? rule.falseValue : rule.trueValue
  }
  const seed = Math.sin((tick + pointSeed(rule.pointId)) * 12.9898 + rule.max) * 43758.5453
  const fraction = seed - Math.floor(seed)
  return Number((rule.min + fraction * (rule.max - rule.min)).toFixed(2))
}

function pointSeed(pointId: string) {
  let hash = 0
  for (let index = 0; index < pointId.length; index += 1) {
    hash = (hash * 31 + pointId.charCodeAt(index)) % 9973
  }
  return hash
}

function dataTypeBadge(type: string | undefined) {
  const normalized = type?.toLowerCase() ?? 'unknown'
  const badge = DATA_TYPE_BADGES[normalized] ?? '?'
  return (
    <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded border border-border/50 bg-background/45 px-0.5 font-semibold text-[9px] text-cyan-200">
      {badge}
    </span>
  )
}

function dynamicBindingId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `uns_dyn_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function createUnsDynamicBinding(type: DynamicType, point: UnsBindingPoint): DynamicBinding {
  const base: DynamicBinding = {
    id: dynamicBindingId(),
    type,
    path: point.id,
    source: 'uns',
    sourceLabel: point.path,
    pending: true,
  }
  if (type === 'visible' || type === 'blink') {
    return { ...base, condition: 'truthy', color: type === 'visible' ? undefined : '#35c8ff' }
  }
  if (type === 'color') {
    return { ...base, colorMode: 'condition', condition: 'truthy', color: '#ff3b30' }
  }
  if (type === 'rotate' || type === 'speed') {
    return { ...base, axis: 'y', inputRange: [0, 100], speedRange: [0, 6] }
  }
  if (type === 'running') return { ...base, axis: 'y', speedRange: [0, 6] }
  if (type === 'openClose') {
    return { ...base, axis: 'y', inputRange: [0, 1], outputRange: [0, Math.PI / 2] }
  }
  if (type === 'move') {
    return {
      ...base,
      axis: 'y',
      inputRange: [0, 100],
      outputRange: [0, 1],
      motionMode: 'follow',
      moveStyle: 'translate',
    }
  }
  if (type === 'scale')
    return { ...base, condition: 'truthy', outputRange: [1, 1.2], scaleEffect: 'fixed' }
  if (type === 'fill' || type === 'level')
    return { ...base, inputRange: [0, 100], outputRange: [0, 1] }
  if (type === 'flow') {
    return {
      ...base,
      inputRange: [0, 100],
      speedRange: [0, 1.2],
      color: '#35c8ff',
      arrowColor: '#7dd3fc',
      arrowScale: 0.72,
      direction: 'forward',
      flowMedium: 'liquid',
    }
  }
  if (type === 'brightness') return { ...base, inputRange: [0, 100], color: '#35c8ff' }
  if (type === 'conveyorFlow') {
    return {
      ...base,
      direction: 'x',
      inputRange: [0, 2],
      distance: 6,
      spacing: 1.2,
      cadenceSeconds: 1.5,
      maxItems: 6,
      endpointBehavior: 'loop',
      speedRange: [0, 2],
      loop: true,
    }
  }
  return base
}

function sameKeys(current: readonly string[], defaults: readonly string[]) {
  return (
    current.length === defaults.length && current.every((key, index) => key === defaults[index])
  )
}

function createDataDisplayBindingPatch(
  node: AnyNode,
  point: UnsBindingPoint,
): Partial<AnyNode> | null {
  if (node.type === 'data-widget') {
    return {
      dataKey: point.id,
      title: node.title === 'Live Data' ? point.label : node.title,
    } as Partial<AnyNode>
  }

  if (node.type === 'data-chart') {
    const currentKeys = Array.isArray(node.dataKeys) ? node.dataKeys : []
    const nextKeys =
      currentKeys.length === 0 || sameKeys(currentKeys, DEFAULT_DATA_CHART_KEYS)
        ? [point.id]
        : currentKeys.includes(point.id)
          ? currentKeys
          : [...currentKeys, point.id].slice(0, 8)

    return {
      dataKeys: nextKeys,
      title: node.title === 'Trend' ? point.label : node.title,
    } as Partial<AnyNode>
  }

  if (node.type === 'data-table') {
    const currentRows = Array.isArray(node.rows) ? node.rows : []
    const currentKeys = currentRows.map((row) => row.dataKey)
    const nextRows =
      currentRows.length === 0 || sameKeys(currentKeys, DEFAULT_DATA_TABLE_KEYS)
        ? [{ label: point.label, dataKey: point.id }]
        : currentKeys.includes(point.id)
          ? currentRows
          : [...currentRows, { label: point.label, dataKey: point.id }].slice(0, 8)

    return {
      rows: nextRows,
      title: node.title === 'Live Data' ? 'UNS' : node.title,
    } as Partial<AnyNode>
  }

  return null
}

function TreeNode({
  node,
  depth = 0,
  path = [],
  rules,
  simulating,
  tick,
  editingPointId,
  canBind,
  onEdit,
  onBind,
  onRuleChange,
}: {
  node: UnsNode
  depth?: number
  path?: string[]
  rules: Record<string, SimulationRule>
  simulating: boolean
  tick: number
  editingPointId: string | null
  canBind: boolean
  onEdit: (pointId: string | null) => void
  onBind: (point: UnsBindingPoint) => void
  onRuleChange: (pointId: string, patch: Partial<SimulationRule>) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const type = stringValue(node.type)
  const label = nodeLabel(node)
  const children = Array.isArray(node.children) ? (node.children.filter(isRecord) as UnsNode[]) : []
  const fields = Array.isArray(node.fields) ? (node.fields.filter(isRecord) as UnsField[]) : []
  const valueFields = fields.filter((field) => field.systemField !== true && fieldLabel(field))
  const hasNestedRows = children.length > 0 || valueFields.length > 0
  const nextPath = type === 'folder' ? [...path, label] : path

  return (
    <div
      aria-expanded={hasNestedRows ? expanded : undefined}
      className="min-w-0"
      role="treeitem"
      tabIndex={-1}
    >
      <button
        className={cn(
          'flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[12px] text-foreground transition-colors',
          hasNestedRows && 'hover:bg-violet-950/35',
        )}
        onClick={hasNestedRows ? () => setExpanded((value) => !value) : undefined}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        type="button"
      >
        {hasNestedRows ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-violet-300/80" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-violet-300/80" />
          )
        ) : (
          <span className="h-3 w-3 shrink-0" />
        )}
        {type === 'file' ? (
          <FileJson className="h-3.5 w-3.5 shrink-0 text-sky-300" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-300" />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {type === 'file' && valueFields.length > 0 ? (
          <span className="shrink-0 rounded bg-violet-950/60 px-1.5 py-0.5 text-[10px] text-violet-100/75">
            {valueFields.length}
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="min-w-0" role="group">
          {valueFields.map((field) => {
            const fieldName = fieldLabel(field)
            if (!fieldName) return null
            const id = pointId(node, fieldName)
            const rule = rules[id]
            const editing = editingPointId === id
            const dataType = stringValue(field.type) ?? 'UNKNOWN'
            const unsPoint = {
              id,
              label: fieldName,
              path: [...path, label, fieldName].join('/'),
              dataType,
            }
            return (
              <div className="min-w-0" key={id}>
                <div
                  className="flex min-h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-violet-950/25"
                  style={{ paddingLeft: `${42 + depth * 14}px` }}
                >
                  <span className="shrink-0" title={dataType}>
                    {dataTypeBadge(dataType)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{fieldName}</span>
                  {rule ? (
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px]',
                        simulating
                          ? 'bg-emerald-950/60 text-emerald-100/80'
                          : 'bg-background/50 text-muted-foreground',
                      )}
                    >
                      {sampleValue(rule, tick)}
                    </span>
                  ) : null}
                  {rule ? (
                    <button
                      aria-label={editing ? '收起设置' : '设置模拟'}
                      className={cn(
                        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        editing
                          ? 'border-violet-600/60 bg-violet-900/70 text-violet-100'
                          : 'border-violet-700/35 bg-violet-950/35 text-violet-100/75 hover:bg-violet-900/55',
                      )}
                      onClick={() => onEdit(editing ? null : id)}
                      title={editing ? '收起设置' : '设置模拟'}
                      type="button"
                    >
                      <SlidersHorizontal className="h-3 w-3" />
                    </button>
                  ) : null}
                  <button
                    aria-label="绑定"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/60 bg-transparent text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:bg-muted/20 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                    disabled={!canBind}
                    onClick={() => onBind(unsPoint)}
                    title={canBind ? '绑定到当前对象' : '请先选中一个 3D 对象'}
                    type="button"
                  >
                    <Link2 className="h-3 w-3" />
                  </button>
                </div>
                {editing && rule ? (
                  <div
                    className="max-w-full min-w-0"
                    style={{ paddingLeft: `${42 + depth * 14}px` }}
                  >
                    <SimulationEditor pointId={id} rule={rule} onRuleChange={onRuleChange} />
                  </div>
                ) : null}
              </div>
            )
          })}
          {children.map((child, index) => (
            <TreeNode
              canBind={canBind}
              editingPointId={editingPointId}
              key={`${stringValue(child.alias) ?? stringValue(child.name) ?? index}`}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
              onBind={onBind}
              onRuleChange={onRuleChange}
              path={nextPath}
              rules={rules}
              simulating={simulating}
              tick={tick}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function DataPanel({ sceneId }: { sceneId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedId = useViewer((state) =>
    state.selection.selectedIds.length === 1 ? state.selection.selectedIds[0] : null,
  )
  const selectedNode = useScene((state) =>
    selectedId ? (state.nodes[selectedId as AnyNodeId] as AnyNode | undefined) : undefined,
  )
  const updateNode = useScene((state) => state.updateNode)
  const [catalog, setCatalog] = useState<SavedUnsCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [jsonText, setJsonText] = useState('')
  const [showPasteJson, setShowPasteJson] = useState(false)
  const [rules, setRules] = useState<Record<string, SimulationRule>>({})
  const [editingPointId, setEditingPointId] = useState<string | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    try {
      const stored =
        window.localStorage.getItem(storageKey(sceneId)) ??
        window.localStorage.getItem(legacyStorageKey(sceneId))
      if (stored) setCatalog(JSON.parse(stored) as SavedUnsCatalog)
      setSimulating(readStoredRuntimeState(sceneId).simulating)
    } catch {
      setCatalog(null)
    }
  }, [sceneId])

  const roots = useMemo(() => readUnsRoots(catalog?.raw), [catalog])
  const points = useMemo(() => flattenUnsPoints(catalog?.raw), [catalog])

  useEffect(() => {
    setRules((current) => {
      const stored = readStoredRules(sceneId)
      const next: Record<string, SimulationRule> = {}
      for (const point of points) {
        next[point.id] = current[point.id] ?? stored[point.id] ?? defaultRule(point)
      }
      return next
    })
  }, [points, sceneId])

  useEffect(() => {
    writeStoredRules(sceneId, rules)
  }, [rules, sceneId])

  useEffect(() => {
    writeStoredRuntimeState(sceneId, { simulating })
  }, [sceneId, simulating])

  useEffect(() => {
    if (!simulating) return
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(interval)
  }, [simulating])

  function importRaw(raw: unknown, sourceName: string) {
    if (flattenUnsPoints(raw).length === 0) throw new Error('没有找到可用 UNS 点位')
    const nextCatalog = { sourceName, importedAt: new Date().toISOString(), raw }
    writeStoredUnsCatalog(sceneId, nextCatalog)
    setCatalog(nextCatalog)
    setEditingPointId(null)
    setTick(0)
    setSimulating(false)
  }

  function importPastedJson() {
    setError(null)
    try {
      importRaw(JSON.parse(jsonText), '粘贴 JSON')
      setJsonText('')
      setShowPasteJson(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '粘贴内容不是有效 JSON')
    }
  }

  async function importJsonFile(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      importRaw(JSON.parse(await file.text()) as unknown, file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function updateRule(pointId: string, patch: Partial<SimulationRule>) {
    setRules((current) => ({
      ...current,
      ...(current[pointId] ? { [pointId]: { ...current[pointId], ...patch } } : {}),
    }))
  }

  function bindPointToSelectedNode(point: UnsBindingPoint) {
    setError(null)
    if (!selectedNode) {
      setError('请先选中一个 3D 对象')
      return
    }
    const dataDisplayPatch = createDataDisplayBindingPatch(selectedNode, point)
    if (dataDisplayPatch) {
      updateNode(selectedNode.id as AnyNodeId, dataDisplayPatch)
      return
    }

    const dynamicMetadata = readDynamicMetadata(selectedNode)
    const recommendedType = getRecommendedDynamicTypeForNode(selectedNode)
    const nextBinding = createUnsDynamicBinding(recommendedType, point)
    updateNode(
      selectedNode.id as AnyNodeId,
      writeDynamicMetadataPatch(selectedNode, {
        dynamicBindings: [...(dynamicMetadata.dynamicBindings ?? []), nextBinding],
      }) as Partial<AnyNode>,
    )
    window.dispatchEvent(new CustomEvent(OPEN_DYNAMIC_INSPECTOR_EVENT))
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="shrink-0 border-border/50 border-b px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <div className="flex min-w-0 shrink-0 items-center gap-1.5">
            <TopButton onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3 w-3" />
              JSON文件
            </TopButton>
            <TopButton active={showPasteJson} onClick={() => setShowPasteJson((value) => !value)}>
              <ClipboardPaste className="h-3 w-3" />
              粘贴JSON
            </TopButton>
          </div>
          <input
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => void importJsonFile(event.currentTarget.files?.[0])}
            ref={fileInputRef}
            type="file"
          />
        </div>

        {showPasteJson ? (
          <div className="mt-3 space-y-2">
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-border/70 bg-background/50 px-2.5 py-2 font-mono text-[11px] outline-none placeholder:text-muted-foreground focus:border-ring"
              onChange={(event) => setJsonText(event.target.value)}
              placeholder="粘贴 UNS JSON"
              value={jsonText}
            />
            <button
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 font-medium text-primary-foreground text-xs hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!jsonText.trim()}
              onClick={importPastedJson}
              type="button"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              解析粘贴内容
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs">
          {error}
        </div>
      ) : null}

      {!catalog ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Database className="h-8 w-8 text-muted-foreground" />
          <div>
            <div className="font-medium text-sm">暂无 UNS</div>
            <div className="mt-1 text-muted-foreground text-xs">
              粘贴 JSON 或导入 JSON 文件后显示点位目录
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 px-4 py-3">
            <button
              className={cn(
                'flex w-full min-w-0 items-center justify-between rounded-md border bg-transparent px-3 py-2.5 text-left transition-colors',
                simulating
                  ? 'border-emerald-500/35 bg-emerald-950/45 text-emerald-100 hover:bg-emerald-900/55'
                  : 'border-border/70 text-muted-foreground hover:border-muted-foreground/35 hover:bg-muted/20 hover:text-foreground',
              )}
              onClick={() => setSimulating((value) => !value)}
              type="button"
            >
              <div className="flex min-w-0 items-center gap-1.5 font-semibold text-xs">
                {simulating ? (
                  <Pause className="h-3 w-3 shrink-0" />
                ) : (
                  <Play className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate">{simulating ? '停止' : '模拟'}</span>
              </div>
              <div className="shrink-0 text-[10px] opacity-75">
                {simulating ? `第 ${tick}s` : '未运行'}
              </div>
            </button>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-4">
            <SectionTitle>点位树</SectionTitle>
            <div className="min-w-0 space-y-0.5" role="tree">
              {roots.map((root, index) => (
                <TreeNode
                  canBind={Boolean(selectedNode)}
                  editingPointId={editingPointId}
                  key={`${stringValue(root.alias) ?? stringValue(root.name) ?? index}`}
                  node={root}
                  onEdit={setEditingPointId}
                  onBind={bindPointToSelectedNode}
                  onRuleChange={updateRule}
                  rules={rules}
                  simulating={simulating}
                  tick={tick}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TopButton({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2.5 font-medium text-[11px] transition-colors hover:text-violet-50',
        active
          ? 'border-violet-600/60 bg-violet-900/70 text-violet-100 shadow-[0_0_16px_rgba(76,29,149,0.22)]'
          : 'border-violet-700/35 bg-violet-950/45 text-violet-200/90 hover:border-violet-600/50 hover:bg-violet-900/55',
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function SimulationEditor({
  pointId,
  rule,
  onRuleChange,
}: {
  pointId: string
  rule: SimulationRule
  onRuleChange: (pointId: string, patch: Partial<SimulationRule>) => void
}) {
  return (
    <div className="my-1 grid max-w-full grid-cols-2 gap-2 rounded-md border border-border/40 bg-background/25 p-2">
      <label className="col-span-2 grid min-w-0 gap-1 text-[10px] text-muted-foreground">
        模拟类型
        <select
          className="h-7 min-w-0 rounded border border-border/70 bg-background/60 px-2 text-[11px] text-foreground outline-none"
          onChange={(event) =>
            onRuleChange(pointId, { kind: event.currentTarget.value as SimulationKind })
          }
          value={rule.kind}
        >
          {Object.entries(SIMULATION_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {rule.kind === 'state' ? (
        <>
          <NumberField
            label="0值"
            onChange={(value) => onRuleChange(pointId, { falseValue: value })}
            value={rule.falseValue}
          />
          <NumberField
            label="1值"
            onChange={(value) => onRuleChange(pointId, { trueValue: value })}
            value={rule.trueValue}
          />
          <NumberField
            label="切换秒"
            onChange={(value) => onRuleChange(pointId, { switchEverySeconds: value })}
            value={rule.switchEverySeconds}
          />
        </>
      ) : rule.kind === 'fixed' ? (
        <NumberField
          label="固定值"
          onChange={(value) => onRuleChange(pointId, { fixedValue: value })}
          value={rule.fixedValue}
        />
      ) : (
        <>
          <NumberField
            label="最小值"
            onChange={(value) => onRuleChange(pointId, { min: value })}
            value={rule.min}
          />
          <NumberField
            label="最大值"
            onChange={(value) => onRuleChange(pointId, { max: value })}
            value={rule.max}
          />
        </>
      )}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="grid min-w-0 gap-1 text-[10px] text-muted-foreground">
      {label}
      <input
        className="h-7 min-w-0 rounded border border-border/70 bg-background/60 px-2 text-[11px] text-foreground outline-none"
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        type="number"
        value={value}
      />
    </label>
  )
}

function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-2 px-1 font-medium text-[11px] text-muted-foreground', className)}>
      {children}
    </div>
  )
}
