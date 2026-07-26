import {
  getWallCurveLength,
  isPipeNearlyVertical,
  type PipeNode,
  samplePipeCenterline3D,
} from '@pascal-app/core'

export type PipeHangerInstance = {
  nodeId: string
  position: readonly [number, number, number]
}

export type PipeHangerBatch = {
  key: string
  radius: number
  thickness: number
  opacity: number
  instances: PipeHangerInstance[]
}

export function getPipeHangerBatchKey(node: PipeNode): string {
  const radius = node.diameter / 2
  const thickness = Math.max(radius * 0.06, 0.008)
  return [radius, thickness, node.opacity].join('|')
}

export function getPipeHangerInstances(node: PipeNode): PipeHangerInstance[] {
  if (!node.visible || !node.showHangers || node.hangerSpacing <= 0 || isPipeNearlyVertical(node)) {
    return []
  }

  const length = getWallCurveLength(node)
  const hangerCount = Math.max(1, Math.floor(length / node.hangerSpacing))
  const points = samplePipeCenterline3D(node, 1)
  if (points.length < 2) return []

  const instances: PipeHangerInstance[] = []
  for (let index = 0; index <= hangerCount; index += 1) {
    const t = index / hangerCount
    const point = points[Math.min(points.length - 1, Math.round(t * (points.length - 1)))]!
    instances.push({ nodeId: node.id, position: [point.x, point.y, point.z] })
  }
  return instances
}

export function buildPipeHangerBatches(nodes: Record<string, unknown>): PipeHangerBatch[] {
  const batches = new Map<string, PipeHangerBatch>()

  for (const value of Object.values(nodes)) {
    if (!value || typeof value !== 'object' || (value as { type?: unknown }).type !== 'pipe')
      continue
    const node = value as PipeNode
    const instances = getPipeHangerInstances(node)
    if (instances.length === 0) continue

    const key = getPipeHangerBatchKey(node)
    const existing = batches.get(key)
    if (existing) {
      existing.instances.push(...instances)
      continue
    }

    const radius = node.diameter / 2
    batches.set(key, {
      key,
      radius,
      thickness: Math.max(radius * 0.06, 0.008),
      opacity: node.opacity,
      instances,
    })
  }

  return [...batches.values()]
}
