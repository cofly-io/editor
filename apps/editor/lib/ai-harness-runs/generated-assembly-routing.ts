import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import type { ProcessRoutePortEndpoint } from './process-line-routing'
import type { FactoryRouteObstacleMetadata, ProcessConnectionMedium } from './process-line-types'

const ROUTABLE_MEDIA = new Set<ProcessConnectionMedium>([
  'water',
  'hydrogen',
  'oxygen',
  'power',
  'cooling',
  'material',
  'gas',
  'molten_metal',
])

function halfExtents(part: AssemblyIR['parts'][number]): [number, number, number] {
  if (part.geometry.kind === 'mesh-blob') {
    const { min, max } = part.geometry.bounds
    return [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2]
  }
  const params = part.geometry.params
  const number = (key: string, fallback: number) =>
    typeof params[key] === 'number' && Number.isFinite(params[key])
      ? (params[key] as number)
      : fallback
  return [
    number('length', number('radius', 0.5) * 2) / 2,
    number('height', 1) / 2,
    number('width', number('radius', 0.5) * 2) / 2,
  ]
}

export function generatedAssemblyRoutingMetadata(input: {
  ir: AssemblyIR
  stationId: string
  profileId: string
}): { portOverrides: ProcessRoutePortEndpoint[]; routeObstacle: FactoryRouteObstacleMetadata } {
  const parts = new Map(input.ir.parts.map((part) => [part.id, part]))
  if (input.ir.parts.length === 0) {
    return {
      portOverrides: [],
      routeObstacle: {
        stationId: input.stationId,
        source: 'factory-node',
        box: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
      },
    }
  }
  const yawOf = (part: AssemblyIR['parts'][number]) => {
    const [x, y, z, w] = part.transform.rotation
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z))
  }
  const rotateXZ = (point: [number, number], yaw: number): [number, number] => [
    point[0] * Math.cos(yaw) - point[1] * Math.sin(yaw),
    point[0] * Math.sin(yaw) + point[1] * Math.cos(yaw),
  ]
  const worldTransform = (partId: string): { position: [number, number, number]; yaw: number } => {
    const part = parts.get(partId)
    if (!part) return { position: [0, 0, 0], yaw: 0 }
    const yaw = yawOf(part)
    if (part.transform.space !== 'local' || !part.parentId)
      return { position: part.transform.position, yaw }
    const parent = worldTransform(part.parentId)
    const [x, z] = rotateXZ([part.transform.position[0], part.transform.position[2]], parent.yaw)
    return {
      position: [
        parent.position[0] + x,
        parent.position[1] + part.transform.position[1],
        parent.position[2] + z,
      ],
      yaw: parent.yaw + yaw,
    }
  }
  const corners = input.ir.parts.flatMap((part) => {
    const { position, yaw } = worldTransform(part.id)
    const [x, y, z] = halfExtents(part)
    const localCorners: Array<[number, number]> = [
      [-x, -z],
      [-x, z],
      [x, -z],
      [x, z],
    ]
    return localCorners.map(([localX, localZ]) => {
      const [worldX, worldZ] = rotateXZ([localX, localZ], yaw)
      return [position[0] + worldX, position[1] - y, position[2] + worldZ, position[1] + y] as const
    })
  })
  const min: [number, number, number] = [
    Math.min(...corners.map((point) => point[0])),
    Math.min(...corners.map((point) => point[1])),
    Math.min(...corners.map((point) => point[2])),
  ]
  const max: [number, number, number] = [
    Math.max(...corners.map((point) => point[0])),
    Math.max(...corners.map((point) => point[3])),
    Math.max(...corners.map((point) => point[2])),
  ]
  const portOverrides = (input.ir.ports ?? []).flatMap((port) => {
    if (!ROUTABLE_MEDIA.has(port.medium as ProcessConnectionMedium) || port.side === 'bottom')
      return []
    const part = parts.get(port.partId)
    if (!part) return []
    const { position: center, yaw } = worldTransform(part.id)
    const [x, , z] = halfExtents(part)
    const offset = port.offset ?? 0
    const localPoint: [number, number] =
      port.side === 'left'
        ? [-x, offset]
        : port.side === 'right'
          ? [x, offset]
          : port.side === 'front'
            ? [offset, z]
            : port.side === 'back'
              ? [offset, -z]
              : [offset, 0]
    const [worldX, worldZ] = rotateXZ(localPoint, yaw)
    const point: [number, number] = [center[0] + worldX, center[2] + worldZ]
    return [
      {
        stationId: input.stationId,
        portId: port.id,
        medium: port.medium as ProcessConnectionMedium,
        point,
        height: port.height,
        side: port.side,
        profileId: input.profileId,
        source: 'node' as const,
      },
    ]
  })
  return {
    portOverrides,
    routeObstacle: {
      stationId: input.stationId,
      source: 'factory-node',
      minHeight: min[1],
      maxHeight: max[1],
      box: { minX: min[0], maxX: max[0], minZ: min[2], maxZ: max[2] },
    },
  }
}
