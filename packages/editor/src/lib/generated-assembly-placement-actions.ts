import type { AnyNode, AnyNodeId } from '@pascal-app/core'
import { markGeneratedPlacementDraft } from './ai-generated-geometry-nodes'
import type { GeometryAgentRunResponse } from './geometry-agent-client-types'

type GeneratedAssembly = NonNullable<GeometryAgentRunResponse['generatedAssembly']>

export type GeneratedAssemblyCreateOp = {
  node: AnyNode
  parentId?: AnyNodeId
}

export function prepareGeneratedAssemblyCanvasPlacement(
  assembly: GeneratedAssembly,
  levelId: AnyNodeId,
  options: { startPlacement?: boolean } = {},
) {
  const rootId = assembly.rootNode.id
  const createOps = assembly.patches
    .filter((patch) => patch.op === 'create')
    .map((patch): GeneratedAssemblyCreateOp => {
      const isRoot = patch.node.id === rootId
      const node =
        isRoot && options.startPlacement ? markGeneratedPlacementDraft(patch.node) : patch.node
      return {
        node,
        ...(isRoot ? { parentId: levelId } : patch.parentId ? { parentId: patch.parentId } : {}),
      }
    })

  const placedRoot = createOps.find((op) => op.node.id === rootId)?.node ?? assembly.rootNode
  return {
    createOps,
    nodeIds: createOps.map((op) => op.node.id),
    placedRoot,
    rootId,
  }
}
