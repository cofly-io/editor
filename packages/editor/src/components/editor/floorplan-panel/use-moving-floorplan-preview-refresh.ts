import type { AnyNode, AnyNodeId } from '@pascal-app/core'
import { getLinkedNodeIds, useLiveTransforms, useScene } from '@pascal-app/core'
import { useEffect } from 'react'

export function useMovingFloorplanPreviewRefresh({
  movingNode,
  onRefresh,
}: {
  movingNode: AnyNode | null
  onRefresh: () => void
}) {
  useEffect(() => {
    if (!movingNode) {
      return
    }

    const nodes = useScene.getState().nodes
    const watchedIds = new Set<AnyNodeId>([movingNode.id, ...getLinkedNodeIds(movingNode, nodes)])

    onRefresh()
    return useLiveTransforms.subscribe((state, previousState) => {
      for (const nodeId of watchedIds) {
        if (state.transforms.get(nodeId) !== previousState.transforms.get(nodeId)) {
          onRefresh()
          return
        }
      }
    })
  }, [movingNode, onRefresh])
}
