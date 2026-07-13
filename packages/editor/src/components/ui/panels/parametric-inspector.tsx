'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type EquipmentParamValue,
  getMaterialPresetByRef,
  type IconRef,
  type ItemNode,
  nodeRegistry,
  sceneRegistry,
  type ParamField,
  type SemanticRecipeEditableParam,
  type SemanticRecipeEditableParamEffect,
  useLiveTransforms,
  useScene,
  type ZoneNode,
} from '@pascal-app/core'
import { createModelNodes } from '@pascal-app/articraft-bridge/scene-converter'
import type { ArticraftModelData } from '@pascal-app/articraft-bridge/types'
import useViewer from '@pascal-app/viewer/store'
import { Icon } from '@iconify/react'
import { ExternalLink, Move, Pause, Play, RotateCcw, Save, Trash2 } from 'lucide-react'
import { type ComponentType, lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  applyArticraftJointValue,
  buildArticraftJointPatch,
  formatJointUnit,
  getArticraftJointMetadata,
  getNodeMetadata,
  jointRange,
  parseArticraftPose,
  type ArticraftJointMetadata,
} from '../../../lib/articraft-joints'
import { isPlanDragMovableNode } from '../../../lib/plan-drag'
import { buildSemanticEquipmentEditableParamUpdates } from '../../../lib/semantic-equipment-editing'
import { sfxEmitter } from '../../../lib/sfx-bus'
import useEditor from '../../../store/use-editor'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { MaterialSwatchField } from '../controls/material-swatch-field'
import { NodeMaterialSection } from '../controls/node-material-section'
import { PanelSection } from '../controls/panel-section'
import { SegmentedControl } from '../controls/segmented-control'
import { SliderControl } from '../controls/slider-control'
import { ToggleControl } from '../controls/toggle-control'
import { PanelWrapper } from './panel-wrapper'

const zh = (...codes: number[]) => String.fromCodePoint(...codes)

/**
 * Auto-derived right-panel inspector for any registry-backed node.
 *
 * Reads `definition.parametrics` from the registry and renders one
 * `<PanelSection>` per group, one control per field. Field kinds supported:
 * - `number` → SliderControl with min/max/step/unit from the descriptor
 * - `enum`   → dark-themed `<select>`
 * - `color`  → native color picker + hex input
 * - `vec3`   → three SliderControls for X / Y / Z
 *
 * Generic Actions section appends Move / Delete based on `capabilities`.
 *
 * Phase 4 will expand this with per-field `customEditor` support and a
 * `parametrics.customPanel?` escape hatch for kinds whose parametric editor
 * can't be auto-generated (topology editors etc.).
 */
export function ParametricInspector() {
  const selectedId = useViewer(
    (s) => (s.selection.selectedIds[0] ?? s.selection.zoneId) as AnyNodeId | undefined,
  )
  const setSelection = useViewer((s) => s.setSelection)
  // Subscribe only to the *type* — a string primitive that doesn't change
  // when slider values change. Without this, every updateNode tick during
  // a drag re-renders the entire panel + every field + every SliderControl.
  // Per-field subscriptions live on FieldRenderer below.
  const nodeType = useScene((s) => (selectedId ? (s.nodes[selectedId]?.type ?? null) : null))
  const semanticEquipmentAssemblyId = useScene((s) => {
    if (!selectedId) return null
    const node = s.nodes[selectedId]
    if (!node) return null
    if (readSemanticEquipmentAssembly(node)) return selectedId
    const parentId = node.parentId as AnyNodeId | null | undefined
    if (parentId && readSemanticEquipmentAssembly(s.nodes[parentId])) return parentId
    if (parentId && s.nodes[parentId]?.type === 'assembly') return parentId
    return node.type === 'assembly' ? selectedId : null
  })
  const isAssemblyChild = useScene((s) => {
    if (!selectedId) return false
    const node = s.nodes[selectedId]
    const parentId = node?.parentId as AnyNodeId | undefined
    return !!(parentId && s.nodes[parentId]?.type === 'assembly' && hasTransformFields(node))
  })

  const def = nodeType ? nodeRegistry.get(nodeType) : undefined
  const parametrics = def?.parametrics
  const node = selectedId ? (useScene.getState().nodes[selectedId] ?? null) : null

  const handleUpdate = useCallback(
    (patch: Partial<AnyNode>) => {
      if (!selectedId) return
      useScene.getState().updateNode(selectedId, patch)
    },
    [selectedId],
  )

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [], zoneId: null })
  }, [setSelection])

  const handleMove = useCallback(() => {
    if (!selectedId) return
    const node = useScene.getState().nodes[selectedId]
    if (!node) return
    sfxEmitter.emit('sfx:item-pick')
    useEditor.getState().setMovingNode(node as any)
    setSelection({ selectedIds: [], zoneId: null })
  }, [selectedId, setSelection])

  const handleDelete = useCallback(() => {
    if (!selectedId) return
    sfxEmitter.emit('sfx:structure-delete')
    useScene.getState().deleteNode(selectedId)
    setSelection({ selectedIds: [], zoneId: null })
  }, [selectedId, setSelection])

  if (!selectedId) return null
  if (!def && semanticEquipmentAssemblyId) {
    const assembly = useScene.getState().nodes[semanticEquipmentAssemblyId]
    return (
      <PanelWrapper
        icon={null}
        onClose={handleClose}
        showDynamicTab={false}
        title={assembly?.name ?? node?.name ?? 'Equipment'}
        width={320}
      >
        <SemanticEquipmentAssemblySection nodeId={semanticEquipmentAssemblyId} />
      </PanelWrapper>
    )
  }
  if (!def) return null

  // `parametrics.customPanel` escape hatch — kind owns its panel
  // entirely (loaded lazily so the bundle isn't eager). Used by kinds
  // whose editor has non-parametric concerns (slab holes list, ceiling
  // height presets, etc.) until per-field `customEditor` + missing
  // field kinds (list/action/computed) graduate the auto-derived
  // panel to cover them.
  if (parametrics?.customPanel) {
    const CustomPanel = resolveCustomPanel(parametrics.customPanel)
    return (
      <Suspense fallback={null}>
        <CustomPanel />
      </Suspense>
    )
  }

  const presentation = def.presentation
  const title = translateNodeLabel(presentation?.label ?? nodeType ?? '')
  const iconNode = renderIcon(presentation?.icon)
  const canMove = !!def.capabilities.movable && !(node && isPlanDragMovableNode(node))
  const canDelete = def.capabilities.deletable !== false

  return (
    <PanelWrapper
      icon={iconNode}
      onClose={handleClose}
      showDynamicTab={nodeType !== 'zone'}
      title={title}
      width={320}
    >
      {parametrics?.groups.map((group, gi) => (
        <PanelSection key={`group-${gi}`} title={translatePanelGroupLabel(group.label)}>
          {group.fields.map((field, fi) => (
            <FieldRenderer
              key={`field-${gi}-${fi}-${String(field.key)}`}
              field={field as ParamField<AnyNode>}
              nodeId={selectedId}
              onUpdate={handleUpdate}
            />
          ))}
        </PanelSection>
      ))}
      {nodeType === 'zone' && <ZonePropertiesSection nodeId={selectedId} />}
      {isAssemblyChild && (
        <AssemblyPartTransformSection nodeId={selectedId} onUpdate={handleUpdate} />
      )}
      {semanticEquipmentAssemblyId && (
        <SemanticEquipmentAssemblySection nodeId={semanticEquipmentAssemblyId} />
      )}
      <NodeMaterialSection nodeId={selectedId} />
      <ArticraftModelSection nodeId={selectedId} />
      <ArticraftJointSection nodeId={selectedId} />
      {(canMove || canDelete) && (
        <PanelSection title="操作">
          <ActionGroup>
            {canMove && (
              <ActionButton icon={<Move className="h-4 w-4" />} label="移动" onClick={handleMove} />
            )}
            {canDelete && (
              <ActionButton
                className="border-red-500/40 text-red-200 hover:bg-red-500/15"
                icon={<Trash2 className="h-4 w-4" />}
                label="删除"
                onClick={handleDelete}
              />
            )}
          </ActionGroup>
        </PanelSection>
      )}
    </PanelWrapper>
  )
}

type SemanticEquipmentAssembly = {
  kind?: string
  recipeId?: string
  profileId?: string
  equipmentFamily?: string
  params?: Record<string, EquipmentParamValue>
  editableParams?: readonly SemanticRecipeEditableParam[]
}

type DynamicLevelGeometry = {
  kind?: string
  height?: number
  length?: number
  diameter?: number
  position?: [number, number, number]
}

const STORAGE_TANK_FALLBACK_EDITABLE_PARAMS: readonly SemanticRecipeEditableParam[] = [
  {
    key: 'liquidLevel',
    label: zh(0x6db2, 0x4f4d),
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.01,
    precision: 2,
    effects: [
      { kind: 'set-param' },
      { kind: 'set-part-dynamic-level', partRole: 'liquid_volume', geometryRef: 'dynamicLevelGeometry' },
    ],
  },
  {
    key: 'shellOpacity',
    label: zh(0x7f50, 0x4f53, 0x900f, 0x660e, 0x5ea6),
    kind: 'number',
    min: 0.12,
    max: 1,
    step: 0.01,
    precision: 2,
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
    label: zh(0x6db2, 0x4f53, 0x900f, 0x660e, 0x5ea6),
    kind: 'number',
    min: 0.08,
    max: 0.92,
    step: 0.01,
    precision: 2,
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
    label: zh(0x6db2, 0x4f53, 0x989c, 0x8272),
    kind: 'color',
    defaultValue: '#38bdf8',
    effects: [
      { kind: 'set-param' },
      { kind: 'set-part-material', partRole: 'liquid_volume', property: 'color' },
    ],
  },
]

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function paramEffects(param: SemanticRecipeEditableParam): readonly SemanticRecipeEditableParamEffect[] {
  return param.effects?.length ? param.effects : [{ kind: 'set-param' as const }]
}

function effectParamKey(param: SemanticRecipeEditableParam, effect: SemanticRecipeEditableParamEffect) {
  return effect.kind === 'set-param' && effect.param ? effect.param : param.key
}

function readSemanticEquipmentAssembly(node: AnyNode | undefined): SemanticEquipmentAssembly | null {
  const metadata = getRecord(node?.metadata)
  const equipmentAssembly = getRecord(metadata?.equipmentAssembly)
  if (equipmentAssembly?.kind === 'semantic-assembly') {
    return equipmentAssembly as SemanticEquipmentAssembly
  }
  if (metadata?.resolver === 'semantic-assembly' && typeof metadata.recipeId === 'string') {
    return {
      kind: 'semantic-assembly',
      recipeId: metadata.recipeId,
      profileId:
        typeof metadata.equipmentProfileId === 'string'
          ? metadata.equipmentProfileId
          : undefined,
      equipmentFamily:
        typeof metadata.semanticType === 'string' ? metadata.semanticType : undefined,
    }
  }
  return null
}

function readRecipeParams(node: AnyNode | undefined, equipment: SemanticEquipmentAssembly) {
  const metadata = getRecord(node?.metadata)
  const sourceArgs = getRecord(metadata?.sourceArgs)
  const sourceParams = getRecord(sourceArgs?.recipeParams)
  return {
    ...(sourceParams ?? {}),
    ...(equipment.params ?? {}),
  }
}

function editableParamsFor(
  equipment: SemanticEquipmentAssembly,
  dynamicLevelGeometry: DynamicLevelGeometry | null,
  liquid: AnyNode | null,
  shell: AnyNode | null,
) {
  if (equipment.editableParams?.length) return equipment.editableParams
  if (equipment.recipeId === 'factory:storage-tank' && dynamicLevelGeometry && liquid && shell) {
    return STORAGE_TANK_FALLBACK_EDITABLE_PARAMS
  }
  return []
}

function readDynamicLevelGeometry(node: AnyNode | undefined): DynamicLevelGeometry | null {
  const metadata = getRecord(node?.metadata)
  const geometry = getRecord(metadata?.dynamicLevelGeometry)
  if (!geometry) return null
  return geometry as DynamicLevelGeometry
}

function findSemanticChild(
  nodes: Record<string, AnyNode>,
  assemblyId: AnyNodeId,
  role: string,
): AnyNode | null {
  const assembly = nodes[assemblyId]
  const explicitChildren =
    assembly && 'children' in assembly && Array.isArray((assembly as { children?: unknown }).children)
      ? ((assembly as { children?: unknown[] }).children ?? []).map(String)
      : []
  const parentedChildren = Object.values(nodes)
    .filter((node) => node.parentId === assemblyId)
    .map((node) => String(node.id))
  const childIds = new Set<string>([...explicitChildren, ...parentedChildren])
  for (const childId of childIds) {
    const child = nodes[childId]
    if (!child) continue
    const metadata = getRecord(child?.metadata)
    if (metadata?.semanticRole === role) return child
  }
  return null
}

function childMaterialColor(node: AnyNode | null, fallback: string) {
  const material = getRecord((node as { material?: unknown } | null)?.material)
  const properties = getRecord(material?.properties)
  return typeof properties?.color === 'string' ? properties.color : fallback
}

function childMaterialOpacity(node: AnyNode | null, fallback: number) {
  const material = getRecord((node as { material?: unknown } | null)?.material)
  const properties = getRecord(material?.properties)
  return typeof properties?.opacity === 'number' ? properties.opacity : fallback
}

export function SemanticEquipmentAssemblySection({ nodeId }: { nodeId: AnyNodeId }) {
  const assembly = useScene((s) => s.nodes[nodeId])
  const liquid = useScene((s) => findSemanticChild(s.nodes, nodeId, 'liquid_volume'))
  const shell = useScene((s) => findSemanticChild(s.nodes, nodeId, 'vessel_shell'))
  const dynamicLevelGeometry = useMemo(() => readDynamicLevelGeometry(assembly), [assembly])
  const equipment = useMemo(
    () =>
      readSemanticEquipmentAssembly(assembly) ??
      (dynamicLevelGeometry && liquid && shell
        ? {
            kind: 'semantic-assembly',
            recipeId: 'factory:storage-tank',
            equipmentFamily: 'tank',
          }
        : null),
    [assembly, dynamicLevelGeometry, liquid, shell],
  )
  const editableParams = equipment
    ? editableParamsFor(equipment, dynamicLevelGeometry, liquid, shell)
    : []
  const snapshot =
    equipment && assembly && editableParams.length
      ? {
          assembly,
          equipment,
          editableParams,
        }
      : null
  if (!snapshot) return null

  const params = readRecipeParams(snapshot.assembly, snapshot.equipment)

  const updateEditableParam = (param: SemanticRecipeEditableParam, rawValue: unknown) => {
    const scene = useScene.getState()
    const updates = buildSemanticEquipmentEditableParamUpdates({
      nodes: scene.nodes,
      assemblyId: nodeId,
      param,
      value: rawValue,
    })
    updates.forEach((update) => scene.updateNode(update.id, update.data))
  }

  const valueForParam = (param: SemanticRecipeEditableParam) => {
    if (params[param.key] !== undefined) return params[param.key]
    for (const effect of paramEffects(param)) {
      const key = effectParamKey(param, effect)
      if (effect.kind === 'set-param' && params[key] !== undefined) return params[key]
      if (effect.kind === 'set-part-material') {
        const child = findSemanticChild(useScene.getState().nodes, nodeId, effect.partRole)
        if (effect.property === 'color') return childMaterialColor(child, String(param.defaultValue ?? '#38bdf8'))
        if (effect.property === 'opacity') return childMaterialOpacity(child, numberValue(param.defaultValue, 1))
        const material = getRecord((child as { material?: unknown } | null)?.material)
        const properties = getRecord(material?.properties)
        if (properties?.[effect.property] !== undefined) return properties[effect.property]
      }
      if (effect.kind === 'set-part-dynamic-level') {
        const dynamicLevelGeometry = readDynamicLevelGeometry(assembly)
        const child = findSemanticChild(useScene.getState().nodes, nodeId, effect.partRole)
        const span =
          dynamicLevelGeometry?.kind === 'horizontal'
            ? dynamicLevelGeometry.length
            : dynamicLevelGeometry?.height
        const height = (child as { height?: unknown } | null)?.height
        if (span && span > 0 && typeof height === 'number') return clamp01(height / span)
      }
    }
    return param.defaultValue
  }

  const renderEditableParam = (param: SemanticRecipeEditableParam) => {
    const label = param.label ?? param.key
    const rawValue = valueForParam(param)
    if (param.kind === 'number') {
      const min = param.min ?? 0
      const max = param.max ?? 1
      const value = clampRange(numberValue(rawValue, numberValue(param.defaultValue, min)), min, max)
      return (
        <SliderControl
          key={param.key}
          label={label}
          max={max}
          min={min}
          onChange={(next) => updateEditableParam(param, clampRange(next, min, max))}
          precision={param.precision ?? 2}
          step={param.step ?? 0.01}
          unit={param.unit ?? ''}
          value={value}
        />
      )
    }
    if (param.kind === 'color') {
      const value = typeof rawValue === 'string' ? rawValue : String(param.defaultValue ?? '#38bdf8')
      return (
        <div className='px-2 pt-1' key={param.key}>
          <MaterialSwatchField
            label={label}
            value={{
              preset: 'custom',
              properties: {
                color: value,
                roughness: 0.24,
                metalness: 0.04,
                opacity: 1,
                transparent: false,
                side: 'front',
              },
            }}
            onChange={(material) => {
              const color = material.properties?.color
              if (color) updateEditableParam(param, color)
            }}
            onSelectMaterialPreset={(materialPreset) => {
              const color = getMaterialPresetByRef(materialPreset)?.mapProperties.color
              if (color) updateEditableParam(param, color)
            }}
          />
        </div>
      )
    }
    if (param.kind === 'boolean') {
      return (
        <ToggleControl
          checked={rawValue === true}
          key={param.key}
          label={label}
          onChange={(checked) => updateEditableParam(param, checked)}
        />
      )
    }
    if (param.kind === 'enum' && param.options?.length) {
      const options = param.options.map((option: string) => ({ label: option, value: option }))
      const fallback = param.options[0] ?? ''
      const value =
        typeof rawValue === 'string' && param.options.includes(rawValue)
          ? rawValue
          : fallback
      return (
        <div className='space-y-1 px-2' key={param.key}>
          <div className='text-[11px] font-medium text-muted-foreground'>{label}</div>
          <SegmentedControl
            onChange={(next) => updateEditableParam(param, next)}
            options={options}
            value={value}
          />
        </div>
      )
    }
    return null
  }

  return (
    <PanelSection title={zh(0x8bbe, 0x5907, 0x53c2, 0x6570)}>
      <div className='space-y-1 pt-1'>
        {snapshot.editableParams.map((param) => renderEditableParam(param))}
      </div>
    </PanelSection>
  )
}
type TransformableNode = AnyNode & {
  position: [number, number, number]
  rotation: [number, number, number]
}

type TransformAxis = 0 | 1 | 2

const TRANSFORM_ROTATION_NUDGE = Math.PI / 4
const TRANSFORM_RAD_TO_DEG = 180 / Math.PI
const TRANSFORM_DEG_TO_RAD = Math.PI / 180

function hasTransformFields(node: AnyNode | undefined): node is TransformableNode {
  return !!(
    node &&
    Array.isArray((node as { position?: unknown }).position) &&
    (node as { position: unknown[] }).position.length >= 3 &&
    Array.isArray((node as { rotation?: unknown }).rotation) &&
    (node as { rotation: unknown[] }).rotation.length >= 3
  )
}

function roundTransformValue(value: number, precision = 4) {
  const scale = 10 ** precision
  return Math.round(value * scale) / scale
}

function transformAxisLabel(axis: TransformAxis) {
  return axis === 0 ? 'X' : axis === 1 ? 'Y' : 'Z'
}

function syncTransformObject(nodeId: AnyNodeId, rotation: [number, number, number]) {
  useLiveTransforms.getState().clear(nodeId)
  sceneRegistry.nodes.get(nodeId)?.rotation.set(rotation[0], rotation[1], rotation[2])
}

function AssemblyPartTransformSection({
  nodeId,
  onUpdate,
}: {
  nodeId: AnyNodeId
  onUpdate: (patch: Partial<AnyNode>) => void
}) {
  const node = useScene((s) => s.nodes[nodeId])
  if (!hasTransformFields(node)) return null

  const updateRotation = (axis: TransformAxis, value: number) => {
    const rotation = [...node.rotation] as [number, number, number]
    rotation[axis] = roundTransformValue(value)
    syncTransformObject(nodeId, rotation)
    onUpdate({ rotation } as Partial<AnyNode>)
  }

  const nudgeRotation = (axis: TransformAxis, delta: number) => {
    sfxEmitter.emit('sfx:item-rotate')
    updateRotation(axis, node.rotation[axis] + delta)
  }

  return (
    <PanelSection title="整体变形">
      <div className="space-y-2 pt-1">
        {([0, 1, 2] as const).map((axis) => (
          <div className="flex items-center gap-1.5" key={axis}>
            <ActionButton
              label="-45°"
              onClick={() => nudgeRotation(axis, -TRANSFORM_ROTATION_NUDGE)}
            />
            <SliderControl
              label={`${transformAxisLabel(axis)} 旋转`}
              max={180}
              min={-180}
              onChange={(degrees) => updateRotation(axis, degrees * TRANSFORM_DEG_TO_RAD)}
              precision={0}
              step={1}
              unit="°"
              value={Math.round(node.rotation[axis] * TRANSFORM_RAD_TO_DEG)}
            />
            <ActionButton
              label="+45°"
              onClick={() => nudgeRotation(axis, TRANSFORM_ROTATION_NUDGE)}
            />
          </div>
        ))}
      </div>
    </PanelSection>
  )
}

function polygonArea(polygon: Array<[number, number]>): number {
  if (polygon.length < 3) return 0
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i]!
    const [x2, z2] = polygon[(i + 1) % polygon.length]!
    area += x1 * z2 - x2 * z1
  }
  return Math.abs(area) / 2
}

function ZonePropertiesSection({ nodeId }: { nodeId: AnyNodeId }) {
  const zone = useScene((s) => s.nodes[nodeId] as ZoneNode | undefined)

  const updateZone = useCallback(
    (patch: Partial<ZoneNode>) => {
      useScene.getState().updateNode(nodeId, patch as Partial<AnyNode>)
    },
    [nodeId],
  )

  if (!zone || zone.type !== 'zone') return null

  return (
    <PanelSection title="区域">
      <div className="space-y-3 px-3 py-2 text-xs">
        <label className="grid gap-1.5">
          <span className="text-muted-foreground">名称</span>
          <input
            className="h-8 rounded-md border border-border/50 bg-[#2C2C2E] px-2 text-foreground outline-none focus:ring-1 focus:ring-foreground/30"
            onChange={(event) => updateZone({ name: event.target.value })}
            type="text"
            value={zone.name ?? ''}
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">面积</span>
          <span className="font-mono text-foreground">{polygonArea(zone.polygon).toFixed(1)} m²</span>
        </div>
        <label className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">颜色</span>
          <div className="flex items-center gap-2">
            <input
              className="h-7 w-9 cursor-pointer rounded border border-border/50 bg-transparent"
              onChange={(event) => updateZone({ color: event.target.value })}
              type="color"
              value={zone.color}
            />
            <input
              className="w-20 rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1 text-foreground text-xs outline-none focus:ring-1 focus:ring-foreground/30"
              onChange={(event) => updateZone({ color: event.target.value })}
              type="text"
              value={zone.color}
            />
          </div>
        </label>
      </div>
    </PanelSection>
  )
}

type ArticraftModelMetadata = {
  recordId: string
  recordPath?: string
  prompt?: string
  joints?: unknown[]
  modelData?: ArticraftModelData
  viewerParams?: unknown
  viewerEffects?: unknown
}

type BridgeJointMetadata = ReturnType<typeof createModelNodes>['jointMetadata'][string]

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isArticraftModelData(value: unknown): value is ArticraftModelData {
  const record = getRecord(value)
  return !!(
    record &&
    typeof record.recordId === 'string' &&
    typeof record.name === 'string' &&
    Array.isArray(record.links) &&
    Array.isArray(record.joints) &&
    Array.isArray(record.meshes)
  )
}

function canConvertArticraftModel(modelData: ArticraftModelData): boolean {
  if (modelData.joints.length === 0 || modelData.links.length === 0) return false
  return modelData.links.every((link) =>
    link.visuals.some((visual) => {
      if (visual.geometry.type !== 'mesh') return true
      const params = visual.geometry.params
      return (
        params.sx !== undefined ||
        params.size !== undefined ||
        params.length !== undefined ||
        params.radius !== undefined
      )
    }),
  )
}

function readArticraftModelMetadata(node: AnyNode | undefined): ArticraftModelMetadata | null {
  if (!node) return null
  const metadata = getNodeMetadata(node)
  const nodeArticraft = getRecord(metadata.articraft)
  const asset =
    node.type === 'item'
      ? ((node as ItemNode).asset as ItemNode['asset'] & { articraft?: unknown })
      : null
  const assetArticraft = getRecord(asset?.articraft)
  const source = nodeArticraft ?? assetArticraft
  const recordId = typeof source?.recordId === 'string' ? source.recordId : ''
  if (!recordId) return null

  const modelData =
    isArticraftModelData(source?.modelData)
      ? source.modelData
      : isArticraftModelData(assetArticraft?.modelData)
        ? assetArticraft.modelData
        : undefined

  return {
    recordId,
    recordPath: typeof source?.recordPath === 'string' ? source.recordPath : undefined,
    prompt: typeof source?.prompt === 'string' ? source.prompt : undefined,
    joints: Array.isArray(source?.joints) ? source.joints : undefined,
    modelData,
    viewerParams: source?.viewerParams,
    viewerEffects: source?.viewerEffects,
  }
}

function getArticraftViewerUrl(recordId: string, tab = 'inspect'): string {
  const base = (process.env.NEXT_PUBLIC_ARTICRAFT_VIEWER_URL ?? 'http://127.0.0.1:8765').replace(
    /\/$/,
    '',
  )
  return `${base}/viewer?record=${encodeURIComponent(recordId)}&tab=${encodeURIComponent(tab)}`
}

function toSceneJointMetadata(jointMetadata: BridgeJointMetadata): ArticraftJointMetadata {
  return {
    jointName: jointMetadata.jointName,
    jointType: jointMetadata.jointType,
    parentLink: jointMetadata.parentLink,
    childLink: jointMetadata.childLink,
    axis: jointMetadata.axis,
    origin: jointMetadata.origin,
    ...(jointMetadata.limits ? { limits: jointMetadata.limits } : {}),
    ...(jointMetadata.mimic ? { mimic: jointMetadata.mimic } : {}),
    currentValue: jointMetadata.currentValue,
  }
}

function applyArticraftPoseToScene(recordId: string, rawValue: string | null): number {
  const pose = parseArticraftPose(rawValue, recordId)
  if (pose.size === 0) return 0

  const scene = useScene.getState()
  const updates = Object.values(scene.nodes).flatMap((node) => {
    const metadata = getNodeMetadata(node)
    const articraft = getRecord(metadata.articraft)
    const joint = getArticraftJointMetadata(node)
    if (!joint || articraft?.recordId !== recordId) return []
    const value = pose.get(joint.jointName)
    if (value == null) return []
    return [{ id: node.id as AnyNodeId, data: applyArticraftJointValue(node, joint, value) }]
  })

  if (updates.length > 0) {
    scene.updateNodes(updates)
    useViewer.getState().setSelection({ selectedIds: [updates[0]!.id] })
  }
  return updates.length
}

function rawPoseFromViewerMessage(data: unknown, recordId: string): string | null {
  const message = getRecord(data)
  if (!message) return null
  const type = typeof message.type === 'string' ? message.type : ''
  const messageRecordId = typeof message.recordId === 'string' ? message.recordId : recordId
  const hasPosePayload = message.pose != null || message.values != null || message.joints != null
  const isArticraftPose =
    type === 'articraft:pose' ||
    type === 'articraft-viewer:pose' ||
    type === 'articraft.pose' ||
    hasPosePayload
  if (!isArticraftPose || messageRecordId !== recordId) return null
  if (typeof message.url === 'string') return message.url
  return JSON.stringify({
    recordId,
    pose: message.pose ?? message.values ?? message.joints,
  })
}

function viewerSettingsFromMessage(data: unknown, recordId: string): Record<string, unknown> | null {
  const message = getRecord(data)
  if (!message) return null
  const messageRecordId = typeof message.recordId === 'string' ? message.recordId : recordId
  if (messageRecordId !== recordId) return null
  const viewerParams = message.params ?? message.parameters ?? message.settings
  const viewerEffects = message.effects ?? message.materials ?? message.rendering
  if (viewerParams == null && viewerEffects == null) return null
  return {
    ...(viewerParams != null ? { viewerParams } : {}),
    ...(viewerEffects != null ? { viewerEffects } : {}),
    viewerSyncedAt: new Date().toISOString(),
  }
}

function syncArticraftViewerSettings(recordId: string, settings: Record<string, unknown>): number {
  const scene = useScene.getState()
  const updates = Object.values(scene.nodes).flatMap((node) => {
    const metadata = getNodeMetadata(node)
    const articraft = getRecord(metadata.articraft)
    if (articraft?.recordId !== recordId) return []
    return [{
      id: node.id as AnyNodeId,
      data: ({
        metadata: {
          ...metadata,
          articraft: {
            ...articraft,
            ...settings,
          },
        },
      } as unknown) as Partial<AnyNode>,
    }]
  })
  if (updates.length > 0) {
    scene.updateNodes(updates)
  }
  return updates.length
}

function inferArticraftLinkName(nodeName: string | undefined, fallback: string): string {
  return (nodeName ?? fallback).replace(/_v\d+$/, '')
}

function ArticraftModelSection({ nodeId }: { nodeId: AnyNodeId }) {
  const node = useScene((s) => s.nodes[nodeId])
  const metadata = useMemo(() => readArticraftModelMetadata(node), [node])
  const [status, setStatus] = useState<string | null>(null)

  const openViewer = useCallback(() => {
    if (!metadata) return
    window.open(getArticraftViewerUrl(metadata.recordId), '_blank', 'noopener,noreferrer')
  }, [metadata])

  const applyPoseFromClipboard = useCallback(async () => {
    if (!metadata) return
    const clipboardText = await navigator.clipboard?.readText?.().catch(() => '')
    const source = clipboardText || window.location.href
    const applied = applyArticraftPoseToScene(metadata.recordId, source)
    setStatus(applied > 0 ? `Applied pose to ${applied} joint${applied === 1 ? '' : 's'}.` : 'No matching pose values found.')
  }, [metadata])

  const convertToArticulated = useCallback(() => {
    if (!node || node.type !== 'item' || !metadata?.modelData) return
    const scene = useScene.getState()
    const selectedParentId = (node.parentId as AnyNodeId | null) ?? undefined
    const created = createModelNodes(
      metadata.modelData,
      (nextNode, parentId) => {
        scene.createNode(nextNode, parentId)
        return nextNode.id as AnyNodeId
      },
      {
        articulationMode: metadata.modelData.joints.length > 0,
        parentId: selectedParentId,
        rootPosition: node.position,
      },
    )

    const metadataUpdates = created.nodeIds.flatMap((id) => {
      const createdNode = useScene.getState().nodes[id as AnyNodeId]
      if (!createdNode) return []
      const existingMetadata = getNodeMetadata(createdNode)
      const linkName = inferArticraftLinkName(createdNode.name, id)
      const jointMetadata = created.jointMetadata[id]
      const articraftMetadata = {
        recordId: metadata.recordId,
        recordPath: metadata.recordPath,
        prompt: metadata.prompt,
        joints: metadata.joints,
        jointName: jointMetadata?.jointName ?? null,
        parentLink: jointMetadata?.parentLink ?? null,
        childLink: jointMetadata?.childLink ?? linkName,
        ...(created.rootNodeIds.includes(id) ? { modelData: metadata.modelData } : {}),
      }
      return [{
        id: id as AnyNodeId,
        data: ({
          metadata: {
            ...existingMetadata,
            articraft: articraftMetadata,
            ...(jointMetadata ? { articraftJoint: toSceneJointMetadata(jointMetadata) } : {}),
          },
        } as unknown) as Partial<AnyNode>,
      }]
    })

    if (metadataUpdates.length > 0) {
      useScene.getState().updateNodes(metadataUpdates)
    }

    useScene.getState().deleteNode(node.id as AnyNodeId)

    const selectedRootId = created.rootNodeIds[0] ?? created.nodeIds[0]
    if (selectedRootId) {
      useViewer.getState().setSelection({ selectedIds: [selectedRootId as AnyNodeId] })
    }
    setStatus(`Converted to ${created.nodeIds.length} articulated node${created.nodeIds.length === 1 ? '' : 's'}.`)
  }, [metadata, node])

  useEffect(() => {
    if (!metadata) return
    const handler = (event: MessageEvent) => {
      const rawValue = rawPoseFromViewerMessage(event.data, metadata.recordId)
      const settings = viewerSettingsFromMessage(event.data, metadata.recordId)
      const applied = rawValue ? applyArticraftPoseToScene(metadata.recordId, rawValue) : 0
      const synced = settings ? syncArticraftViewerSettings(metadata.recordId, settings) : 0
      if (!rawValue && !settings) return
      if (applied > 0 && synced > 0) {
        setStatus(`Synced ${applied} joint${applied === 1 ? '' : 's'} and Viewer settings.`)
      } else if (applied > 0) {
        setStatus(`Synced ${applied} joint${applied === 1 ? '' : 's'} from Viewer.`)
      } else if (synced > 0) {
        setStatus('Synced Viewer settings.')
      } else {
        setStatus('Viewer message had no matching scene nodes.')
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [metadata])

  if (!metadata) return null

  const canConvert = node?.type === 'item' && !!metadata.modelData && canConvertArticraftModel(metadata.modelData)
  const jointCount = metadata.modelData?.joints.length ?? metadata.joints?.length ?? 0

  return (
    <PanelSection title="Articraft 模型">
      <div className="space-y-2 px-3 py-1 text-xs">
        <div className="truncate font-mono text-[10px] text-muted-foreground">
          record {metadata.recordId}
        </div>
        {metadata.recordPath ? (
          <div className="truncate font-mono text-[10px] text-muted-foreground" title={metadata.recordPath}>
            path {metadata.recordPath}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span>关节</span>
          <span className="font-mono text-foreground">{jointCount}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span>画布模型</span>
          <span className="font-mono text-foreground">
            {canConvert ? 'split-link ready' : 'single GLB item'}
          </span>
        </div>
        {metadata.viewerParams != null || metadata.viewerEffects != null ? (
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span>查看器设置</span>
            <span className="font-mono text-foreground">
              {metadata.viewerParams != null ? 'params' : ''}
              {metadata.viewerParams != null && metadata.viewerEffects != null ? ' / ' : ''}
              {metadata.viewerEffects != null ? 'effects' : ''}
            </span>
          </div>
        ) : null}
        {metadata.prompt ? (
          <div className="line-clamp-3 text-muted-foreground" title={metadata.prompt}>
            {metadata.prompt}
          </div>
        ) : null}
        {status ? <div className="text-[11px] text-[#a684ff]">{status}</div> : null}
      </div>
      <ActionGroup>
        <ActionButton
          icon={<ExternalLink className="h-4 w-4" />}
          label="打开查看器"
          onClick={openViewer}
        />
        <ActionButton
          icon={<Save className="h-4 w-4" />}
          label="应用查看器姿态"
          onClick={applyPoseFromClipboard}
        />
        {canConvert ? (
          <ActionButton
            icon={<Icon className="h-4 w-4" icon="mdi:robot-industrial" />}
            label="转为可动模型"
            onClick={convertToArticulated}
          />
        ) : null}
      </ActionGroup>
    </PanelSection>
  )
}

function ArticraftJointSection({ nodeId }: { nodeId: AnyNodeId }) {
  const joint = useScene((s) => getArticraftJointMetadata(s.nodes[nodeId]))
  const recordId = useScene((s) => {
    const metadata = s.nodes[nodeId]?.metadata
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
    const articraft = (metadata as Record<string, unknown>).articraft
    if (!articraft || typeof articraft !== 'object' || Array.isArray(articraft)) return null
    const value = (articraft as Record<string, unknown>).recordId
    return typeof value === 'string' ? value : null
  })
  const [previewing, setPreviewing] = useState(false)
  const [min, max] = useMemo(() => (joint ? jointRange(joint) : [0, 0] as [number, number]), [joint])

  const updateJoint = useCallback(
    (patch: Partial<ArticraftJointMetadata>) => {
      const node = useScene.getState().nodes[nodeId]
      if (!node) return
      const current = getArticraftJointMetadata(node)
      if (!current) return
      useScene.getState().updateNode(nodeId, buildArticraftJointPatch(node, current, patch))
    },
    [nodeId],
  )

  useEffect(() => {
    if (!previewing || !joint) return
    const startedAt = performance.now()
    const interval = window.setInterval(() => {
      const span = max - min
      const midpoint = min + span / 2
      const value = midpoint + Math.sin((performance.now() - startedAt) / 700) * (span / 2)
      updateJoint({ currentValue: Math.round(value * 1000) / 1000 })
    }, 80)
    return () => window.clearInterval(interval)
  }, [joint, max, min, previewing, updateJoint])

  useEffect(() => {
    if (!joint) setPreviewing(false)
  }, [joint])

  if (!joint) return null

  const value = typeof joint.currentValue === 'number' ? joint.currentValue : 0
  const isMovable = joint.jointType !== 'fixed'
  const openViewer = () => {
    if (!recordId) return
    const base = (process.env.NEXT_PUBLIC_ARTICRAFT_VIEWER_URL ?? 'http://127.0.0.1:8765').replace(
      /\/$/,
      '',
    )
    window.open(
      `${base}/viewer?record=${encodeURIComponent(recordId)}&tab=inspect`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  return (
    <PanelSection title="Articraft 关节">
      <div className="space-y-2 px-3 py-1 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-muted-foreground" title={joint.jointName}>
            {joint.jointName}
          </span>
          <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {joint.jointType ?? 'joint'}
          </span>
        </div>
        {joint.parentLink || joint.childLink ? (
          <div className="grid gap-1 font-mono text-[10px] text-muted-foreground">
            {joint.parentLink ? <div>parent {joint.parentLink}</div> : null}
            {joint.childLink ? <div>child {joint.childLink}</div> : null}
          </div>
        ) : null}
        {joint.axis ? (
          <div className="font-mono text-[10px] text-muted-foreground">
            axis [{joint.axis.map((item) => Number(item).toFixed(2)).join(', ')}]
          </div>
        ) : null}
        {joint.limits ? (
          <div className="font-mono text-[10px] text-muted-foreground">
            limits [{min.toFixed(3)}, {max.toFixed(3)}]
            {typeof joint.limits.velocity === 'number' ? ` · v ${joint.limits.velocity}` : ''}
            {typeof joint.limits.effort === 'number' ? ` · effort ${joint.limits.effort}` : ''}
          </div>
        ) : null}
        {recordId ? (
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            record {recordId}
          </div>
        ) : null}
      </div>
      {isMovable ? (
        <SliderControl
          label="当前值"
          max={max}
          min={min}
          onChange={(next) => updateJoint({ currentValue: next })}
          precision={3}
          step={0.01}
          unit={formatJointUnit(joint)}
          value={value}
        />
      ) : null}
      <ActionGroup>
        {recordId && (
          <ActionButton
            icon={<ExternalLink className="h-4 w-4" />}
            label="打开查看器"
            onClick={openViewer}
          />
        )}
        <ActionButton
          icon={<RotateCcw className="h-4 w-4" />}
          label="重置关节"
          onClick={() => updateJoint({ currentValue: 0 })}
        />
        <ActionButton
          icon={<Save className="h-4 w-4" />}
          label="保存姿态"
          onClick={() => updateJoint({ savedValue: value })}
        />
        <ActionButton
          icon={previewing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          label={previewing ? '停止预览' : '自动预览'}
          onClick={() => setPreviewing((next) => !next)}
        />
      </ActionGroup>
    </PanelSection>
  )
}

function renderIcon(ref: IconRef | undefined): React.ReactNode | undefined {
  if (!ref) return undefined
  if (ref.kind === 'url') {
    // Plain <img> here so the inspector doesn't pull in next/image's
    // server-only requirements (the file is `'use client'`). Same
    // 16x16 box the legacy panels use.
    return <img alt="" className="h-4 w-4 shrink-0 object-contain" src={ref.src} />
  }
  if (ref.kind === 'iconify') {
    return <Icon height={16} icon={ref.name} width={16} />
  }
  if (ref.kind === 'svg') {
    return (
      <svg height={16} viewBox={ref.viewBox} width={16}>
        <path d={ref.path} fill="currentColor" />
      </svg>
    )
  }
  // `component`: lazy-loaded custom icon component. Suspense-safe.
  const LazyIcon = lazy(ref.module)
  return (
    <Suspense fallback={null}>
      <LazyIcon />
    </Suspense>
  )
}

// Cache lazy custom panel components by their loader so React.lazy isn't
// re-invoked across renders.
const customPanelCache = new WeakMap<() => Promise<unknown>, ComponentType>()

function resolveCustomPanel(loader: () => Promise<{ default: ComponentType<any> }>): ComponentType {
  const cached = customPanelCache.get(loader)
  if (cached) return cached
  const Comp = lazy(loader)
  customPanelCache.set(loader, Comp as ComponentType)
  return Comp as ComponentType
}

// ─── Per-field renderers ─────────────────────────────────────────────

interface FieldRendererProps {
  field: ParamField<AnyNode>
  nodeId: AnyNodeId
  onUpdate: (patch: Partial<AnyNode>) => void
}

function FieldRenderer({ field, nodeId, onUpdate }: FieldRendererProps) {
  const key = String(field.key)
  // Subscribe only to this field's value. Zustand compares with ===, so when
  // another field on the same node changes (which produces a new node object
  // reference), this primitive value stays equal and the field doesn't
  // re-render. Vec3 arrays get a new reference only when the array itself
  // changes — same outcome.
  const value = useScene((s) => {
    const n = s.nodes[nodeId]
    return n ? (n as Record<string, unknown>)[key] : undefined
  })
  // visibleIf may consult other fields on the node — subscribe to its boolean
  // result so we re-evaluate when relevant.
  const visible = useScene((s) => {
    const visibleIf = (field as { visibleIf?: (n: AnyNode) => boolean }).visibleIf
    if (!visibleIf) return true
    const n = s.nodes[nodeId]
    return n ? visibleIf(n as AnyNode) : false
  })
  if (!visible) return null

  switch (field.kind) {
    case 'number': {
      const num = typeof value === 'number' ? value : 0
      const step = field.step ?? 0.01
      const precision = precisionForStep(step)
      return (
        <SliderControl
          label={prettifyKey(key)}
          max={field.max}
          min={field.min}
          onChange={(next) => onUpdate({ [key]: next } as Partial<AnyNode>)}
          precision={precision}
          step={step}
          unit={field.unit ?? ''}
          value={num}
        />
      )
    }

    case 'boolean': {
      const checked = value === true
      return (
        <ToggleControl
          checked={checked}
          label={prettifyKey(key)}
          onChange={(next) => onUpdate({ [key]: next } as Partial<AnyNode>)}
        />
      )
    }

    case 'enum': {
      const str = typeof value === 'string' ? value : (field.options[0] ?? '')
      if (field.display === 'segmented') {
        return (
          <SegmentedControl
            onChange={(next) => onUpdate({ [key]: next } as Partial<AnyNode>)}
            options={field.options.map((opt) => ({ label: prettifyEnumValue(opt), value: opt }))}
            value={str}
          />
        )
      }
      return (
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-foreground/80 text-xs">{prettifyKey(key)}</span>
          <select
            className="rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-foreground/30"
            onChange={(e) => onUpdate({ [key]: e.target.value } as Partial<AnyNode>)}
            value={str}
          >
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {prettifyEnumValue(opt)}
              </option>
            ))}
          </select>
        </div>
      )
    }

    case 'color': {
      const str = typeof value === 'string' ? value : '#888888'
      return (
        <div className="px-3 py-2">
          <MaterialSwatchField
            label={prettifyKey(key)}
            value={{
              preset: 'custom',
              properties: {
                color: str,
                roughness: 0.5,
                metalness: 0,
                opacity: 1,
                transparent: false,
                side: 'front',
              },
            }}
            onChange={(material) => {
              const color = material.properties?.color
              if (color) onUpdate({ [key]: color } as Partial<AnyNode>)
            }}
            onSelectMaterialPreset={(materialPreset) => {
              const color = getMaterialPresetByRef(materialPreset)?.mapProperties.color
              if (color) onUpdate({ [key]: color } as Partial<AnyNode>)
            }}
          />
        </div>
      )
    }

    case 'vec3': {
      const v = Array.isArray(value) && value.length >= 3
        ? (value as [number, number, number])
        : [0, 0, 0]
      const axes: Array<{ label: string; index: 0 | 1 | 2 }> = [
        { label: 'X', index: 0 },
        { label: 'Y', index: 1 },
        { label: 'Z', index: 2 },
      ]
      return (
        <>
          {axes.map(({ label, index }) => {
            // v is a [number, number, number] tuple; the explicit local
            // resolves TS's noUncheckedIndexedAccess concern that v[index]
            // could be undefined.
            const axisValue = v[index] ?? 0
            return (
              <SliderControl
                key={`${key}-${label}`}
                label={label}
                max={axisValue + 5}
                min={axisValue - 5}
                onChange={(next) => {
                  const updated = [...v] as [number, number, number]
                  updated[index] = next
                  onUpdate({ [key]: updated } as Partial<AnyNode>)
                }}
                precision={2}
                step={0.05}
                unit="m"
                value={Math.round(axisValue * 100) / 100}
              />
            )
          })}
        </>
      )
    }

    case 'custom':
      // The field owns its rendering and update logic — used for
      // derived values (length from start/end), dynamic-bounded
      // sliders (curve sagitta), composed editors.
      return <CustomFieldRenderer Comp={field.component} nodeId={nodeId} onUpdate={onUpdate} />

    default:
      // material / ref / unrecognized kinds — not implemented in v1.
      return null
  }
}

function CustomFieldRenderer({
  Comp,
  nodeId,
  onUpdate,
}: {
  Comp: ComponentType<{ node: AnyNode; onUpdate: (patch: Partial<AnyNode>) => void }>
  nodeId: AnyNodeId
  onUpdate: (patch: Partial<AnyNode>) => void
}) {
  // Subscribe to the full node — the custom editor may read any
  // field. Tools that don't want this churn should write narrower
  // selectors inside Comp itself.
  const node = useScene((s) => s.nodes[nodeId])
  if (!node) return null
  return <Comp node={node} onUpdate={onUpdate} />
}

// ─── helpers ─────────────────────────────────────────────────────────

function precisionForStep(step: number): number {
  if (step <= 0) return 0
  return Math.max(0, Math.ceil(-Math.log10(step)))
}



const NODE_LABELS: Record<string, string> = {
  'Cable Tray': zh(0x6865, 0x67b6),
  'Pipe fitting': zh(0x7ba1, 0x4ef6),
  'Steel Beam': zh(0x94a2, 0x6881),
  Tank: zh(0x50a8, 0x7f50),
  'Data Widget': zh(0x5355, 0x6807, 0x7b7e),
  Shelf: zh(0x8d27, 0x67b6),
  'cable-tray': zh(0x6865, 0x67b6),
  'pipe-fitting': zh(0x7ba1, 0x4ef6),
  'steel-beam': zh(0x94a2, 0x6881),
  tank: zh(0x50a8, 0x7f50),
  'data-widget': zh(0x5355, 0x6807, 0x7b7e),
  shelf: zh(0x8d27, 0x67b6),
  'steel-frame': zh(0x94a2, 0x67b6),
}

const PANEL_GROUP_LABELS: Record<string, string> = {
  Dimensions: zh(0x5c3a, 0x5bf8),
  Rungs: zh(0x6a2a, 0x6863),
  Appearance: zh(0x5916, 0x89c2),
  Fitting: zh(0x7ba1, 0x4ef6),
  Process: zh(0x5de5, 0x827a),
  Profile: zh(0x578b, 0x6750),
  Tank: zh(0x50a8, 0x7f50),
  Widget: zh(0x7ec4, 0x4ef6),
  Style: zh(0x7c7b, 0x578b),
  Position: zh(0x4f4d, 0x7f6e),
  Actions: zh(0x64cd, 0x4f5c),
  Topology: zh(0x7ed3, 0x6784),
  Frame: zh(0x6846, 0x67b6),
}

const FIELD_LABELS: Record<string, string> = {
  width: zh(0x5bbd, 0x5ea6),
  depth: zh(0x6df1, 0x5ea6),
  sideHeight: zh(0x4fa7, 0x8fb9, 0x9ad8, 0x5ea6),
  thickness: zh(0x539a, 0x5ea6),
  rows: zh(0x5c42, 0x6570),
  columns: zh(0x5217, 0x6570),
  withSides: zh(0x4fa7, 0x677f),
  withBack: zh(0x80cc, 0x677f),
  withBottom: zh(0x5e95, 0x677f),
  bracketStyle: zh(0x652f, 0x67b6, 0x6837, 0x5f0f),
  style: zh(0x7c7b, 0x578b),
  elevation: zh(0x6807, 0x9ad8),
  curveOffset: zh(0x66f2, 0x7ebf, 0x504f, 0x79fb),
  showRungs: zh(0x663e, 0x793a, 0x6a2a, 0x6863),
  rungSpacing: zh(0x6a2a, 0x6863, 0x95f4, 0x8ddd),
  color: zh(0x989c, 0x8272),
  fittingKind: zh(0x7ba1, 0x4ef6, 0x7c7b, 0x578b),
  angleDegrees: zh(0x89d2, 0x5ea6),
  diameter: zh(0x76f4, 0x5f84),
  bendRadiusMultiplier: zh(0x5f2f, 0x66f2, 0x534a, 0x5f84, 0x500d, 0x6570),
  branchLength: zh(0x652f, 0x7ba1, 0x957f, 0x5ea6),
  length: zh(0x957f, 0x5ea6),
  flangeOuterDiameter: zh(0x6cd5, 0x5170, 0x5916, 0x5f84),
  flangeThickness: zh(0x6cd5, 0x5170, 0x539a, 0x5ea6),
  boltCount: zh(0x87ba, 0x6813, 0x6570, 0x91cf),
  boltDiameter: zh(0x87ba, 0x6813, 0x76f4, 0x5f84),
  valveStyle: zh(0x9600, 0x95e8, 0x6837, 0x5f0f),
  medium: zh(0x4ecb, 0x8d28),
  pressureKpa: zh(0x538b, 0x529b, 0x20, 0x6b, 0x50, 0x61),
  temperatureC: zh(0x6e29, 0x5ea6, 0x20, 0xb0, 0x43),
  insulated: zh(0x4fdd, 0x6e29),
  insulationThickness: zh(0x4fdd, 0x6e29, 0x539a, 0x5ea6),
  profile: zh(0x578b, 0x6750),
  height: zh(0x9ad8, 0x5ea6),
  webThickness: zh(0x8179, 0x677f, 0x539a, 0x5ea6),
  kind: zh(0x7c7b, 0x578b),
  liquidLevel: zh(0x6db2, 0x4f4d),
  shellColor: zh(0x7f50, 0x4f53, 0x989c, 0x8272),
  liquidColor: zh(0x6db2, 0x4f53, 0x989c, 0x8272),
  shellOpacity: zh(0x7f50, 0x4f53, 0x900f, 0x660e, 0x5ea6),
  braceStyle: zh(0x8f85, 0x52a9, 0x67b6),
  deckColor: zh(0x5e73, 0x53f0, 0x989c, 0x8272),
}

const ENUM_LABELS: Record<string, string> = {
  'pipe-rack': zh(0x7ba1, 0x5eca, 0x67b6),
  'equipment-platform': zh(0x8bbe, 0x5907, 0x5e73, 0x53f0),
  'portal-frame': zh(0x95e8, 0x5f0f, 0x94a2, 0x67b6),
  'tower-frame': zh(0x5854, 0x5f0f, 0x94a2, 0x67b6),
  'single-diagonal': zh(0x5355, 0x659c, 0x6491),
  knee: zh(0x89d2, 0x6491),
  none: zh(0x65e0, 0x8f85, 0x52a9, 0x67b6),
  elbow: zh(0x5f2f, 0x5934),
  tee: zh(0x4e09, 0x901a),
  cross: zh(0x56db, 0x901a),
  flange: zh(0x6cd5, 0x5170),
  valve: zh(0x9600, 0x95e8),
  placeholder: zh(0x5360, 0x4f4d),
  gate: zh(0x95f8, 0x9600),
  ball: zh(0x7403, 0x9600),
  butterfly: zh(0x8776, 0x9600),
  steam: zh(0x84b8, 0x6c7d),
  condensate: zh(0x51b7, 0x51dd, 0x6c34),
  water: zh(0x6c34),
  'i-beam': zh(0x5de5, 0x5b57, 0x94a2),
  box: zh(0x7bb1, 0x578b),
  channel: zh(0x69fd, 0x94a2),
  concave: zh(0x51f9, 0x578b),
  vertical: zh(0x7acb, 0x5f0f),
  horizontal: zh(0x5367, 0x5f0f),
  spherical: zh(0x7403, 0x5f62),
  production: zh(0x751f, 0x4ea7),
  warehouse: zh(0x4ed3, 0x50a8),
  logistics: zh(0x7269, 0x6d41),
  equipment: zh(0x8bbe, 0x5907),
  safety: zh(0x5b89, 0x5168),
  restricted: zh(0x53d7, 0x9650),
  normal: zh(0x6b63, 0x5e38),
  caution: zh(0x8b66, 0x793a),
  danger: zh(0x5371, 0x9669),
  'wall-shelf': zh(0x58c1, 0x6302, 0x67b6),
  bookshelf: zh(0x4e66, 0x67b6),
  'open-rack': zh(0x4ed3, 0x50a8, 0x8d27, 0x67b6),
  cubby: zh(0x683c, 0x5b50, 0x67b6),
  minimal: zh(0x7b80, 0x6d01),
  industrial: zh(0x5de5, 0x4e1a),
  hidden: zh(0x9690, 0x85cf),
}

function translateNodeLabel(label: string): string {
  return NODE_LABELS[label] ?? label
}

function translatePanelGroupLabel(label: string): string {
  return PANEL_GROUP_LABELS[label] ?? label
}

function prettifyKey(key: string): string {
  const mapped = FIELD_LABELS[key]
  if (mapped) return mapped
  const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function prettifyEnumValue(value: string): string {
  const mapped = ENUM_LABELS[value]
  if (mapped) return mapped
  return value
    .split(/[-_\s]/)
    .map((word, i) =>
      i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase(),
    )
    .join(' ')
}
