import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import type { AnyNode, GeneratedAssemblyNode } from '@pascal-app/core/schema'
import type { GeneratedGeometryCreatePatch } from '../../../../packages/editor/src/lib/ai-generated-geometry-nodes'
import { generatedAssemblyRoutingMetadata } from './generated-assembly-routing'
import type { DslRunResult } from './generator-dsl-run'
import type { ProcessRouteObstacle, ProcessRoutePortEndpoint } from './process-line-routing'

export type FactoryStationGenerationResult =
  | {
      kind: 'primitive'
      patches: GeneratedGeometryCreatePatch[]
      portOverrides: ProcessRoutePortEndpoint[]
      routeObstacle?: ProcessRouteObstacle
    }
  | {
      kind: 'generator_dsl'
      patches: GeneratedGeometryCreatePatch[]
      rootNode: GeneratedAssemblyNode
      ir: AssemblyIR
      irHash: string
      portOverrides: ProcessRoutePortEndpoint[]
      routeObstacle: ProcessRouteObstacle
    }
  | { kind: 'failed'; diagnostics: Array<{ code: string; message: string }> }

type GeneratorDslStationGenerationResult = Extract<
  FactoryStationGenerationResult,
  { kind: 'generator_dsl' }
>

export function stationGenerationPatches(
  result: FactoryStationGenerationResult,
): GeneratedGeometryCreatePatch[] {
  return result.kind === 'failed' ? [] : result.patches
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function withGeneratorDslFactoryMetadata(input: {
  result: Extract<DslRunResult, { kind: 'ok' }>
  stationId: string
  stationRole: string
  profileId: string
  portOverrides: ProcessRoutePortEndpoint[]
  routeObstacle: ProcessRouteObstacle
}) {
  const rootNode: GeneratedAssemblyNode = {
    ...input.result.rootNode,
    metadata: {
      ...metadataRecord(input.result.rootNode.metadata),
      stationId: input.stationId,
      stationRole: input.stationRole,
      equipmentRole: input.stationRole,
      resolver: 'generator-dsl',
      factoryGeneratorDsl: {
        irHash: input.result.irHash,
        profileId: input.profileId,
        partCount: input.result.ir.parts.length,
      },
      factoryNodePorts: input.portOverrides,
      factoryRouteObstacle: input.routeObstacle,
    },
  }
  const patches = input.result.patches.map((patch) =>
    patch.node.id === input.result.rootNode.id ? { ...patch, node: rootNode as AnyNode } : patch,
  ) as GeneratedGeometryCreatePatch[]
  return { patches, rootNode }
}

/** Convert a successful DSL run into the same station result consumed by factory routing. */
export function factoryDslStationResult(input: {
  result: Extract<DslRunResult, { kind: 'ok' }>
  stationId: string
  stationRole: string
  profileId: string
}): GeneratorDslStationGenerationResult {
  const routing = generatedAssemblyRoutingMetadata({
    ir: input.result.ir,
    stationId: input.stationId,
    profileId: input.profileId,
  })
  const station = withGeneratorDslFactoryMetadata({
    result: input.result,
    stationId: input.stationId,
    stationRole: input.stationRole,
    profileId: input.profileId,
    portOverrides: routing.portOverrides,
    routeObstacle: routing.routeObstacle,
  })
  return {
    kind: 'generator_dsl',
    patches: station.patches,
    rootNode: station.rootNode,
    ir: input.result.ir,
    irHash: input.result.irHash,
    portOverrides: routing.portOverrides,
    routeObstacle: routing.routeObstacle,
  }
}
