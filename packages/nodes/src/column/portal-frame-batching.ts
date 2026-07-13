import type { AnyNodeId, ColumnNode } from '@pascal-app/core'

const PORTAL_FRAME_BATCH_MARKER = 'process-line-support'

export type PortalFrameBatch = {
  key: string
  nodes: ColumnNode[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPortalFrameBatchCandidate(node: ColumnNode): boolean {
  return (
    node.supportStyle === 'portal-frame' &&
    node.bracePlateEnabled === false &&
    isRecord(node.metadata) &&
    node.metadata.portalFrameBatch === PORTAL_FRAME_BATCH_MARKER
  )
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function materialKey(node: ColumnNode): string {
  return `preset:${node.materialPreset ?? ''}|material:${stableStringify(node.material ?? null)}`
}

export function buildPortalFrameBatches(
  nodes: Record<AnyNodeId, unknown>,
  excludedIds: ReadonlySet<string>,
): PortalFrameBatch[] {
  const groups = new Map<string, PortalFrameBatch>()

  for (const value of Object.values(nodes)) {
    if (!value || typeof value !== 'object' || (value as { type?: unknown }).type !== 'column') {
      continue
    }
    const node = value as ColumnNode
    if (node.visible === false || excludedIds.has(node.id) || !isPortalFrameBatchCandidate(node)) {
      continue
    }

    const key = materialKey(node)
    const batch = groups.get(key)
    if (batch) batch.nodes.push(node)
    else groups.set(key, { key, nodes: [node] })
  }

  return Array.from(groups.values())
}
