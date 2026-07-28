import { describe, expect, it } from 'bun:test'
import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import { generatedAssemblyRoutingMetadata } from './generated-assembly-routing'

function ir(parts: AssemblyIR['parts'], ports: NonNullable<AssemblyIR['ports']> = []): AssemblyIR {
  return {
    schemaVersion: 1,
    generator: { sourceHash: 's', paramsHash: 'p', apiVersion: '1' },
    parts,
    ports,
    constraints: [],
  }
}
function part(
  id: string,
  position: [number, number, number],
  rotation: [number, number, number, number] = [0, 0, 0, 1],
): AssemblyIR['parts'][number] {
  return {
    id,
    transform: { space: 'world', position, rotation, scale: [1, 1, 1] },
    geometry: {
      kind: 'primitive-recipe',
      recipeId: 'primitive.box',
      params: { length: 4, width: 2, height: 2 },
    },
    material: {},
    fingerprint: id,
  }
}

describe('generatedAssemblyRoutingMetadata', () => {
  it('projects a right-side port and obstacle through Y rotation', () => {
    const result = generatedAssemblyRoutingMetadata({
      ir: ir(
        [part('tank', [10, 0, 20], [0, Math.SQRT1_2, 0, Math.SQRT1_2])],
        [{ id: 'tank.out', partId: 'tank', medium: 'water', side: 'right', height: 1 }],
      ),
      stationId: 's1',
      profileId: 'tank',
    })
    expect(result.portOverrides[0]?.point[0]).toBeCloseTo(10)
    expect(result.portOverrides[0]?.point[1]).toBeCloseTo(22)
    expect(result.routeObstacle.box).toEqual({ minX: 9, maxX: 11, minZ: 18, maxZ: 22 })
  })
  it('returns a safe zero obstacle for an empty assembly', () => {
    expect(
      generatedAssemblyRoutingMetadata({ ir: ir([]), stationId: 's1', profileId: 'x' })
        .routeObstacle.box,
    ).toEqual({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 })
  })
})
