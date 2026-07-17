'use client'

import { type ActionMenuPlacementRule, nodeRegistry } from '@pascal-app/core'
import * as THREE from 'three'

type ActionMenuPlacementNode = { type: string; widgetType?: string }
type ActionMenuTargetNode = ActionMenuPlacementNode & {
  children?: readonly string[]
  metadata?: unknown
}
type ActionMenuTargetChild = { metadata?: unknown }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const RULE_BY_NODE_TYPE = new Map<string, ActionMenuPlacementRule>([
  ['data-widget', 'html-compact'],
  ['data-chart', 'html-panel'],
  ['data-table', 'html-panel'],
  ['slab', 'flat-structure'],
  ['ceiling', 'flat-structure'],
])

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function primarySemanticRole(node: ActionMenuTargetNode) {
  const metadata = recordValue(node.metadata)
  const equipmentAssembly = recordValue(metadata?.equipmentAssembly)
  const sourceArgs = recordValue(metadata?.sourceArgs)
  const explicit =
    equipmentAssembly?.primarySemanticRole ?? sourceArgs?.primarySemanticRole ?? metadata?.primarySemanticRole
  if (typeof explicit === 'string' && explicit.length > 0) return explicit

  const requiredRoles = sourceArgs?.requiredRoles
  return Array.isArray(requiredRoles) && requiredRoles.length === 1 && typeof requiredRoles[0] === 'string'
    ? requiredRoles[0]
    : undefined
}

export function getActionMenuTargetId(
  node: ActionMenuTargetNode,
  nodes: Readonly<Record<string, ActionMenuTargetChild | undefined>>,
) {
  if (node.type !== 'assembly') return undefined
  const role = primarySemanticRole(node)
  if (!role) return undefined
  return node.children?.find((childId) => recordValue(nodes[childId]?.metadata)?.semanticRole === role)
}

function getPlacementRule(
  node: ActionMenuPlacementNode,
  size: THREE.Vector3,
): ActionMenuPlacementRule {
  if (node.type === 'data-widget' && (node.widgetType === 'card' || node.widgetType === 'chart')) {
    return 'html-panel'
  }

  const explicitRule =
    nodeRegistry.get(node.type)?.actionMenu?.placement ?? RULE_BY_NODE_TYPE.get(node.type)
  if (explicitRule) return explicitRule
  return size.y > 4 ? 'bbox-tall' : 'bbox'
}

function getAnchorGap(rule: ActionMenuPlacementRule, size: THREE.Vector3) {
  switch (rule) {
    case 'html-compact':
      return 0.24
    case 'html-panel':
      return 0.5
    case 'bbox-tall':
      return 0.24
    case 'flat-structure':
      return 0.5
    case 'linear':
      return 0.22
    case 'bbox':
      return clamp(size.y * 0.08, 0.18, 0.32)
  }
}

export function getActionMenuAnchor(
  node: ActionMenuPlacementNode,
  box: THREE.Box3,
  target: THREE.Vector3,
  sizeTarget = new THREE.Vector3(),
) {
  const size = box.getSize(sizeTarget)
  const center = box.getCenter(target)
  const rule = getPlacementRule(node, size)
  const yBase = rule === 'html-compact' ? center.y : box.max.y

  return target.set(center.x, yBase + getAnchorGap(rule, size), center.z)
}
