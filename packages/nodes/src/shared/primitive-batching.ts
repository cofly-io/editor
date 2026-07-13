import type { BoxNode, CylinderNode, TorusNode } from '@pascal-app/core'
import { industrialRenderContractFromMetadata } from './industrial-render-contract-rendering'
import {
  primitiveBatchDisabled,
  primitiveContractFromMetadata,
  primitivePatternInstances,
} from './primitive-contract-rendering'

type PrimitiveMaterialNode = Pick<
  BoxNode | CylinderNode | TorusNode,
  'material' | 'materialPreset' | 'metadata'
>

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function primitiveMaterialBatchKey(node: PrimitiveMaterialNode): string {
  const renderContract = industrialRenderContractFromMetadata(node.metadata)
  return [
    `preset:${node.materialPreset ?? ''}`,
    `material:${stableStringify(node.material ?? null)}`,
    `industrial:${stableStringify(renderContract ?? null)}`,
  ].join('|')
}

export function canBatchPrimitiveBase(
  node: PrimitiveMaterialNode & { visible?: boolean },
): boolean {
  return (
    node.visible !== false &&
    !primitiveBatchDisabled(node.metadata) &&
    primitivePatternInstances(node.metadata).length === 0
  )
}

export function canBatchBoxBase(node: BoxNode): boolean {
  if (!canBatchPrimitiveBase(node)) return false
  if ((node.cornerRadius ?? 0) > 0) return false
  return (primitiveContractFromMetadata(node.metadata)?.cutouts?.length ?? 0) === 0
}

export function canBatchCylinderBase(node: CylinderNode): boolean {
  return canBatchPrimitiveBase(node)
}

export function canBatchTorusBase(node: TorusNode): boolean {
  return canBatchPrimitiveBase(node)
}
