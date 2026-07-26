/**
 * Connection Router
 *
 * Turns a LoadedIndustryPack's connections into routed pipe geometry:
 *  - Resolve each endpoint (stationId + port alias) to a world position using
 *    the station's composed ports (side/height/offset) and world transform.
 *  - Route an elbow path: out of the source port, up/down to the connection's
 *    render elevation, across, then down/up into the target port.
 *  - Emit pipe_run parts per segment, carrying medium + render color/diameter.
 *
 * This is the "auto-route connections" half of the data-link closure.
 */

import type { SemanticRecipePart, SemanticRecipePortSide } from '@pascal-app/core'
import type {
  Connection,
  LoadedIndustryPack,
  Profile,
} from './industry-pack-loader'
import type { GeneratedScene, PlacedStation } from './scene-generator'

// ─── Public Types ────────────────────────────────────────────────────────────

export type RoutedSegment = SemanticRecipePart & {
  connectionIndex: number
  medium: string
  segmentKind: 'riser' | 'run' | 'drop'
}

export type RoutedConnection = {
  index: number
  from: { stationId: string; port: string; worldPosition: [number, number, number] }
  to: { stationId: string; port: string; worldPosition: [number, number, number] }
  medium: string
  color: string
  elevation: number
  diameter: number
  segments: RoutedSegment[]
  length: number
}

export type UnroutedConnection = {
  index: number
  from: Connection['from']
  to: Connection['to']
  reason: 'station-not-placed' | 'port-not-found'
}

export type RoutingResult = {
  routed: RoutedConnection[]
  unrouted: UnroutedConnection[]
  summary: {
    totalConnections: number
    routedConnections: number
    totalSegments: number
    totalPipeLength: number
  }
}

export type ConnectionRouterOptions = {
  /** Default pipe elevation when connection.render.elevation is absent */
  defaultElevation?: number
  /** Default pipe diameter (m) */
  defaultDiameter?: number
  /** Default pipe color by medium when render.color is absent */
  mediumColors?: Record<string, string>
  /** Fallback color */
  defaultColor?: string
}

const DEFAULT_MEDIUM_COLORS: Record<string, string> = {
  crude_oil: '#78716c',
  diesel: '#d6d3d1',
  gasoline: '#fbbf24',
  steam: '#e2e8f0',
  water: '#38bdf8',
  hydrogen: '#a5f3fc',
  gas: '#fca5a5',
  fuel_gas: '#f87171',
  acid_gas: '#fbbf24',
  raw_water: '#60a5fa',
  treated_water: '#34d399',
  sludge: '#78716c',
}

// ─── Port world position ─────────────────────────────────────────────────────

const SIDE_VECTORS: Record<SemanticRecipePortSide, [number, number, number]> = {
  left: [-1, 0, 0],
  right: [1, 0, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
}

function resolvePortWorldPosition(
  station: PlacedStation,
  portAlias: string,
): [number, number, number] | null {
  // Match by port id, or by semanticRole-like alias
  const port = station.ports.find(
    (candidate) => candidate.id === portAlias || candidate.role === portAlias,
  )
  const env = station.envelope ?? { length: 4, width: 4, height: 4 }

  if (!port) {
    // Alias not found in composed ports — fall back to station center at mid height
    return null
  }

  const sideVector = SIDE_VECTORS[port.side] ?? [0, 0, 0]
  const offset = port.offset ?? 0
  // Local port anchor: on the envelope face given by side, at port.height, shifted along the face by offset
  const local: [number, number, number] = [
    sideVector[0] * (env.length / 2) + (port.side === 'front' || port.side === 'back' ? offset : 0),
    port.height,
    sideVector[2] * (env.width / 2) + (port.side === 'left' || port.side === 'right' ? offset : 0),
  ]

  const cos = Math.cos(station.rotationY)
  const sin = Math.sin(station.rotationY)
  const rotated: [number, number, number] = [
    local[0] * cos + local[2] * sin,
    local[1],
    -local[0] * sin + local[2] * cos,
  ]
  return [
    rotated[0] + station.position[0],
    rotated[1] + station.position[1],
    rotated[2] + station.position[2],
  ]
}

// ─── Router ──────────────────────────────────────────────────────────────────

export class ConnectionRouter {
  private readonly defaultElevation: number
  private readonly defaultDiameter: number
  private readonly mediumColors: Record<string, string>
  private readonly defaultColor: string

  constructor(options: ConnectionRouterOptions = {}) {
    this.defaultElevation = options.defaultElevation ?? 3.5
    this.defaultDiameter = options.defaultDiameter ?? 0.15
    this.mediumColors = { ...DEFAULT_MEDIUM_COLORS, ...(options.mediumColors ?? {}) }
    this.defaultColor = options.defaultColor ?? '#94a3b8'
  }

  /**
   * Route all connections of a pack against a generated scene.
   */
  routeConnections(pack: LoadedIndustryPack, scene: GeneratedScene): RoutingResult {
    const stationById = new Map<string, PlacedStation>(
      scene.stations.map((s) => [s.stationId, s]),
    )
    // Profile port aliases: profile.ports maps logical name → semantic alias.
    // A connection endpoint's "port" may be either the logical name or the alias.
    const profileById = new Map<string, Profile>(pack.profiles.map((p) => [p.id, p]))

    const routed: RoutedConnection[] = []
    const unrouted: UnroutedConnection[] = []

    const connections = pack.connections.flatMap((doc) => doc.connections)

    for (const [index, connection] of connections.entries()) {
      const fromStation = stationById.get(connection.from.stationId)
      const toStation = stationById.get(connection.to.stationId)
      if (!fromStation || !toStation) {
        unrouted.push({
          index,
          from: connection.from,
          to: connection.to,
          reason: 'station-not-placed',
        })
        continue
      }

      const fromAlias = this.resolvePortAlias(
        profileById.get(fromStation.profileId),
        connection.from.port,
      )
      const toAlias = this.resolvePortAlias(
        profileById.get(toStation.profileId),
        connection.to.port,
      )

      const fromPos = resolvePortWorldPosition(fromStation, fromAlias)
      const toPos = resolvePortWorldPosition(toStation, toAlias)
      if (!fromPos || !toPos) {
        unrouted.push({ index, from: connection.from, to: connection.to, reason: 'port-not-found' })
        continue
      }

      const elevation = connection.render?.elevation ?? this.defaultElevation
      const diameter = connection.render?.diameter ?? this.defaultDiameter
      const color =
        connection.render?.color ?? this.mediumColors[connection.medium] ?? this.defaultColor

      const segments = this.buildElbowPath(fromPos, toPos, elevation, {
        connectionIndex: index,
        medium: connection.medium,
        color,
        diameter,
      })
      const length = segments.reduce(
        (sum, segment) => sum + ((segment as { length?: number }).length ?? 0),
        0,
      )

      routed.push({
        index,
        from: { stationId: fromStation.stationId, port: fromAlias, worldPosition: fromPos },
        to: { stationId: toStation.stationId, port: toAlias, worldPosition: toPos },
        medium: connection.medium,
        color,
        elevation,
        diameter,
        segments,
        length: Math.round(length * 100) / 100,
      })
    }

    return {
      routed,
      unrouted,
      summary: {
        totalConnections: connections.length,
        routedConnections: routed.length,
        totalSegments: routed.reduce((sum, r) => sum + r.segments.length, 0),
        totalPipeLength:
          Math.round(routed.reduce((sum, r) => sum + r.length, 0) * 100) / 100,
      },
    }
  }

  /**
   * A connection endpoint's port may reference the profile's logical port name
   * (key of profile.ports) or the semantic alias (value). Normalize to alias,
   * which is what composed ports carry as semanticRole/id.
   */
  private resolvePortAlias(profile: Profile | undefined, portRef: string): string {
    if (!profile) return portRef
    const ports = profile.ports ?? {}
    if (portRef in ports) return ports[portRef]
    return portRef
  }

  /**
   * Build an elbow path: riser up from source → horizontal run at elevation →
   * drop down into target. Emits 1-3 segments depending on geometry.
   */
  private buildElbowPath(
    from: [number, number, number],
    to: [number, number, number],
    elevation: number,
    meta: { connectionIndex: number; medium: string; color: string; diameter: number },
  ): RoutedSegment[] {
    const segments: RoutedSegment[] = []
    const minSegment = 0.05
    let segmentIndex = 0

    const pushSegment = (
      start: [number, number, number],
      end: [number, number, number],
      kind: RoutedSegment['segmentKind'],
    ) => {
      const dx = end[0] - start[0]
      const dy = end[1] - start[1]
      const dz = end[2] - start[2]
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (length < minSegment) return
      const axis: 'x' | 'y' | 'z' =
        Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) >= Math.abs(dz)
          ? 'y'
          : Math.abs(dx) >= Math.abs(dz)
            ? 'x'
            : 'z'
      segments.push({
        id: `conn_${meta.connectionIndex}_seg_${segmentIndex++}`,
        kind: 'pipe_run',
        semanticRole: 'connection_pipe',
        axis,
        position: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2],
        length,
        radius: meta.diameter / 2,
        primaryColor: meta.color,
        material: {
          properties: { color: meta.color, roughness: 0.36, metalness: 0.5 },
        },
        connectionIndex: meta.connectionIndex,
        medium: meta.medium,
        segmentKind: kind,
      })
    }

    const fromTop: [number, number, number] = [from[0], elevation, from[2]]
    const toTop: [number, number, number] = [to[0], elevation, to[2]]

    pushSegment(from, fromTop, 'riser')
    // Horizontal run: route via an L (x first, then z) to avoid diagonal pipes
    const corner: [number, number, number] = [toTop[0], elevation, fromTop[2]]
    pushSegment(fromTop, corner, 'run')
    pushSegment(corner, toTop, 'run')
    pushSegment(toTop, to, 'drop')

    return segments
  }
}

/**
 * Convenience: route all connections of a pack against a generated scene.
 */
export function routeConnections(
  pack: LoadedIndustryPack,
  scene: GeneratedScene,
  options: ConnectionRouterOptions = {},
): RoutingResult {
  return new ConnectionRouter(options).routeConnections(pack, scene)
}
