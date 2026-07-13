export function sceneHistoryLimitForNodeCount(nodeCount: number): number {
  if (nodeCount >= 1_600) return 10
  if (nodeCount >= 900) return 24
  return 50
}
