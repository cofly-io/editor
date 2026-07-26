import { describe, expect, test } from 'bun:test'
import { buildPipeFittingGeometry } from './geometry'
import { PipeFittingNode } from './schema'

function triangleCount(root: ReturnType<typeof buildPipeFittingGeometry>) {
  let total = 0
  root.traverse((child) => {
    const mesh = child as { isMesh?: boolean; geometry?: { index?: { count?: number } } }
    if (mesh.isMesh) total += (mesh.geometry?.index?.count ?? 0) / 3
  })
  return total
}

describe('pipe fitting geometry', () => {
  test('keeps the common insulated elbow within its small-detail triangle budget', () => {
    const elbow = PipeFittingNode.parse({
      fittingKind: 'elbow',
      insulated: true,
    })

    expect(triangleCount(buildPipeFittingGeometry(elbow))).toBeLessThanOrEqual(1_100)
  })
})
