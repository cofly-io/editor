import { type AnyNode, type AnyNodeId, useScene } from '@pascal-app/core'
import useViewer from '@pascal-app/viewer/store'
import { useMemo } from 'react'

export function useFactorySelectionLabel() {
  const selectedCanvasIds = useViewer((state) => state.selection.selectedIds)
  const sceneNodes = useScene((state) => state.nodes)

  return useMemo(() => {
    const selectedNodes = selectedCanvasIds
      .map((id) => sceneNodes[id as AnyNodeId])
      .filter((node): node is AnyNode => Boolean(node))
    if (!selectedNodes.length) return 'none'

    const nodeLabel = (node: AnyNode) =>
      typeof node.name === 'string' && node.name.trim() ? node.name.trim() : node.type
    const containingAssembly = (node: AnyNode): AnyNode | undefined => {
      let parentId = (node as { parentId?: unknown }).parentId
      const visited = new Set<string>()
      while (typeof parentId === 'string' && !visited.has(parentId)) {
        visited.add(parentId)
        const parent = sceneNodes[parentId as AnyNodeId]
        if (!parent) return undefined
        if (parent.type === 'assembly') return parent
        parentId = (parent as { parentId?: unknown }).parentId
      }
      return undefined
    }

    const firstAssembly = containingAssembly(selectedNodes[0]!)
    if (
      firstAssembly &&
      selectedNodes.every((node) => containingAssembly(node)?.id === firstAssembly.id)
    ) {
      const partLabels = selectedNodes.slice(0, 4).map(nodeLabel)
      const extra =
        selectedNodes.length > partLabels.length
          ? ` +${selectedNodes.length - partLabels.length}`
          : ''
      if (selectedNodes.length === 1) return `${nodeLabel(firstAssembly)} > ${partLabels[0]}`
      return `${nodeLabel(firstAssembly)} > ${selectedNodes.length} parts: ${partLabels.join(', ')}${extra}`
    }

    const labels = selectedNodes.slice(0, 3).map((node) => `${nodeLabel(node)} (${node.type})`)
    const extra = selectedNodes.length > labels.length ? ` +${selectedNodes.length - labels.length}` : ''
    return labels.join(', ') + extra
  }, [sceneNodes, selectedCanvasIds])
}
