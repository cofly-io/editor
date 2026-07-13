export type SceneComplexityTier = 'normal' | 'constrained' | 'critical'

export type SceneComplexityBudget = {
  nodeCount: number
  importedModelCount: number
  weightedCost: number
  tier: SceneComplexityTier
  maxDpr: number
  disableSsgi: boolean
  disableOutline: boolean
  useImportedModelProxy: boolean
}

type ComplexityNode = {
  type?: string
  asset?: { src?: unknown }
}

const CONSTRAINED_BUDGET = 900
const CRITICAL_BUDGET = 1_600
const IMPORTED_MODEL_WEIGHT = 24
const PROCEDURAL_NODE_WEIGHT = 4
const PROCEDURAL_NODE_TYPES = new Set([
  'building',
  'ceiling',
  'door',
  'roof',
  'roof-segment',
  'slab',
  'stair',
  'stair-segment',
  'wall',
  'window',
])

export const DEFAULT_SCENE_COMPLEXITY: SceneComplexityBudget = {
  nodeCount: 0,
  importedModelCount: 0,
  weightedCost: 0,
  tier: 'normal',
  maxDpr: 1.5,
  disableSsgi: false,
  disableOutline: false,
  useImportedModelProxy: false,
}

function nodeWeight(node: ComplexityNode): number {
  if (node.type === 'item' && node.asset?.src) return IMPORTED_MODEL_WEIGHT
  if (node.type && PROCEDURAL_NODE_TYPES.has(node.type)) return PROCEDURAL_NODE_WEIGHT
  return 1
}

export function assessSceneComplexity(
  nodes: Record<string, ComplexityNode | undefined>,
): SceneComplexityBudget {
  let nodeCount = 0
  let importedModelCount = 0
  let weightedCost = 0

  for (const node of Object.values(nodes)) {
    if (!node) continue
    nodeCount += 1
    if (node.type === 'item' && node.asset?.src) importedModelCount += 1
    weightedCost += nodeWeight(node)
  }

  if (weightedCost >= CRITICAL_BUDGET) {
    return {
      nodeCount,
      importedModelCount,
      weightedCost,
      tier: 'critical',
      maxDpr: 1,
      disableSsgi: true,
      disableOutline: true,
      useImportedModelProxy: true,
    }
  }

  if (weightedCost >= CONSTRAINED_BUDGET) {
    return {
      nodeCount,
      importedModelCount,
      weightedCost,
      tier: 'constrained',
      maxDpr: 1,
      disableSsgi: true,
      disableOutline: false,
      useImportedModelProxy: false,
    }
  }

  return {
    ...DEFAULT_SCENE_COMPLEXITY,
    nodeCount,
    importedModelCount,
    weightedCost,
  }
}

export function sameSceneComplexity(
  left: SceneComplexityBudget,
  right: SceneComplexityBudget,
): boolean {
  return (
    left.nodeCount === right.nodeCount &&
    left.importedModelCount === right.importedModelCount &&
    left.weightedCost === right.weightedCost &&
    left.tier === right.tier
  )
}
