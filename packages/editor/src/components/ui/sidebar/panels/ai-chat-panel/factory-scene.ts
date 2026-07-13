import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  pauseSpaceDetection,
  resumeSpaceDetection,
  type LevelNode,
  useScene,
} from '@pascal-app/core'
import useViewer from '@pascal-app/viewer/store'
import { buildFactoryScenePatchOperations } from '../../../../../lib/factory-scene-patch-apply'
import { validateFactoryScenePatches } from '../../../../../lib/factory-scene-patch-safety'
import { computeSceneBoundsXZ } from '../../../../../lib/scene-bounds'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function buildFactorySelectionSnapshot() {
  const scene = useScene.getState()
  const selectedIds = useViewer.getState().selection.selectedIds.map(String).filter(Boolean)
  if (!selectedIds.length) return undefined

  const nodes: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  const collect = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const node = scene.nodes[id as AnyNodeId]
    if (!node) return
    const record = node as unknown as Record<string, unknown>
    nodes.push({
      id: node.id,
      type: node.type,
      name: typeof node.name === 'string' ? node.name : undefined,
      parentId: typeof node.parentId === 'string' ? node.parentId : undefined,
      children: Array.isArray(record.children) ? record.children.map(String) : undefined,
      color: typeof record.color === 'string' ? record.color : undefined,
      kind: typeof record.kind === 'string' ? record.kind : undefined,
      shellColor: typeof record.shellColor === 'string' ? record.shellColor : undefined,
      length: typeof record.length === 'number' ? record.length : undefined,
      width: typeof record.width === 'number' ? record.width : undefined,
      height: typeof record.height === 'number' ? record.height : undefined,
      depth: typeof record.depth === 'number' ? record.depth : undefined,
      thickness: typeof record.thickness === 'number' ? record.thickness : undefined,
      radius: typeof record.radius === 'number' ? record.radius : undefined,
      majorRadius: typeof record.majorRadius === 'number' ? record.majorRadius : undefined,
      tubeRadius: typeof record.tubeRadius === 'number' ? record.tubeRadius : undefined,
      position: Array.isArray(record.position) ? record.position : undefined,
      rotation: Array.isArray(record.rotation) ? record.rotation : undefined,
      scale: Array.isArray(record.scale) ? record.scale : undefined,
      material: isRecord(record.material) ? record.material : undefined,
      materialPreset: typeof record.materialPreset === 'string' ? record.materialPreset : undefined,
      metadata: isRecord(record.metadata) ? record.metadata : undefined,
    })
    if (node.type === 'assembly' && Array.isArray(record.children)) {
      for (const childId of record.children) {
        if (typeof childId === 'string') collect(childId)
      }
    }
  }

  for (const id of selectedIds) collect(id)
  return nodes.length ? { selectedIds, nodes } : undefined
}

function finiteSitePoint(value: unknown): [number, number] | null {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    return [value[0], value[1]]
  }
  return null
}

function boundsFromSitePoints(points: unknown[]) {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  let hasPoint = false
  for (const point of points) {
    const parsed = finiteSitePoint(point)
    if (!parsed) continue
    minX = Math.min(minX, parsed[0])
    maxX = Math.max(maxX, parsed[0])
    minZ = Math.min(minZ, parsed[1])
    maxZ = Math.max(maxZ, parsed[1])
    hasPoint = true
  }
  if (!hasPoint) return null
  return {
    min: [minX, minZ],
    max: [maxX, maxZ],
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2],
    size: [maxX - minX, maxZ - minZ],
  }
}

function isDefaultSitePoints(points: unknown[]) {
  const expected = [
    [-15, -15],
    [15, -15],
    [15, 15],
    [-15, 15],
  ]
  return (
    points.length === expected.length &&
    points.every((point, index) => {
      const parsed = finiteSitePoint(point)
      const expectedPoint = expected[index]
      return Boolean(
        parsed && expectedPoint && parsed[0] === expectedPoint[0] && parsed[1] === expectedPoint[1],
      )
    })
  )
}

function buildFactorySiteContext(nodes: Record<AnyNodeId, AnyNode>) {
  const site = Object.values(nodes).find((node) => node?.type === 'site')
  const polygon = (site as unknown as { polygon?: { points?: unknown } } | undefined)?.polygon
  const points = Array.isArray(polygon?.points) ? polygon.points : null
  if (!site || !points) return null
  const bounds = boundsFromSitePoints(points)
  if (!bounds) return null
  return {
    id: site.id,
    bounds,
    isDefault: isDefaultSitePoints(points),
  }
}

function hasFactorySceneContent(nodes: Record<AnyNodeId, AnyNode>) {
  return Object.values(nodes).some((node) => {
    if (!node) return false
    return node.type !== 'site' && node.type !== 'building' && node.type !== 'level'
  })
}

export function buildFactorySceneContext() {
  const scene = useScene.getState()
  const bounds = computeSceneBoundsXZ(scene.nodes as Parameters<typeof computeSceneBoundsXZ>[0])
  const site = buildFactorySiteContext(scene.nodes)
  if (!bounds && !site) return undefined
  return {
    ...(bounds ? { bounds } : {}),
    ...(site ? { site } : {}),
    hasSceneContent: hasFactorySceneContent(scene.nodes),
    nodeCount: Object.keys(scene.nodes).length,
  }
}

function resolveBuildingIdForLevel(
  nodes: Record<AnyNodeId, AnyNode>,
  levelId: string | null | undefined,
  preferredBuildingId?: string | null,
) {
  if (
    preferredBuildingId &&
    nodes[preferredBuildingId as AnyNodeId]?.type === 'building'
  ) {
    return preferredBuildingId
  }
  if (!levelId) return null

  const level = nodes[levelId as AnyNodeId]
  const parentId = typeof level?.parentId === 'string' ? level.parentId : null
  if (parentId && nodes[parentId as AnyNodeId]?.type === 'building') {
    return parentId
  }

  const owner = Object.values(nodes).find(
    (node): node is BuildingNode =>
      node?.type === 'building' &&
      Array.isArray(node.children) &&
      node.children.includes(levelId as LevelNode['id']),
  )
  return owner?.id ?? null
}

export function buildFactoryPlacementContextSnapshot() {
  const scene = useScene.getState()
  const selection = useViewer.getState().selection
  let parentId = selection.levelId
  let buildingId = resolveBuildingIdForLevel(scene.nodes, parentId, selection.buildingId)

  if (!parentId) {
    const fallbackBuilding =
      (buildingId ? scene.nodes[buildingId as AnyNodeId] : undefined) ??
      Object.values(scene.nodes).find((node): node is BuildingNode => node?.type === 'building')
    if (fallbackBuilding?.type === 'building') {
      buildingId = fallbackBuilding.id
      const fallbackLevelId = fallbackBuilding.children.find(
        (childId): childId is LevelNode['id'] =>
          scene.nodes[childId as AnyNodeId]?.type === 'level',
      )
      parentId = fallbackLevelId ?? null
    }
  }

  return {
    ...(parentId ? { parentId } : {}),
    ...(buildingId ? { buildingId } : {}),
  }
}

export function applyFactoryRunPatchesToCanvas(data: unknown): string[] {
  const result = isRecord(data) ? data : {}
  if (result.applied === true) return []
  const qualityReport = isRecord(result.qualityReport) ? result.qualityReport : undefined
  if (qualityReport?.passed === false) {
    console.warn('[factory-agent] Refused factory patches that failed quality gate', qualityReport)
    return []
  }
  const patches = Array.isArray(result.patches) ? result.patches : []
  if (patches.length === 0) return []

  const scene = useScene.getState()
  const selectedLevelId = useViewer.getState().selection.levelId
  const safety = validateFactoryScenePatches(patches, {
    allowProcessLineCatalogItems: true,
    existingNodeIds: Object.keys(scene.nodes),
    fallbackParentId: selectedLevelId,
  })
  if (!safety.safe) {
    console.warn('[factory-agent] Refused unsafe scene patches', safety.issues)
    return []
  }

  const { createOps, createdIds, deleteIds, updateOps, updatedIds } =
    buildFactoryScenePatchOperations(patches, {
      existingNodeIds: Object.keys(scene.nodes),
      fallbackParentId: selectedLevelId,
    })
  const createdLevelNodes = createOps
    .map(({ node }) => node)
    .filter((node): node is LevelNode => node.type === 'level')
    .sort((a, b) => a.level - b.level)

  pauseSpaceDetection()
  try {
    if (createOps.length > 0) {
      scene.createNodes(createOps)
    }
    if (updateOps.length > 0) {
      scene.updateNodes(updateOps)
    }
    if (deleteIds.length > 0) {
      scene.deleteNodes(deleteIds)
    }
  } finally {
    resumeSpaceDetection()
  }

  if (createdLevelNodes.length > 0) {
    const topLevel = createdLevelNodes[createdLevelNodes.length - 1]!
    const nodes = useScene.getState().nodes
    const buildingId = resolveBuildingIdForLevel(
      nodes,
      topLevel.id,
      typeof topLevel.parentId === 'string' ? topLevel.parentId : null,
    )
    const viewer = useViewer.getState()
    viewer.setLevelMode('stacked')
    viewer.setSelection({
      ...(buildingId ? { buildingId: buildingId as BuildingNode['id'] } : {}),
      levelId: topLevel.id,
    })
  } else if (createdIds.length > 0) {
    useViewer.getState().setSelection({ selectedIds: [createdIds[0]!] })
  } else if (deleteIds.length > 0) {
    const deleted = new Set(deleteIds.map(String))
    const remainingSelectedIds = useViewer
      .getState()
      .selection.selectedIds.map(String)
      .filter((id) => !deleted.has(id))
    useViewer.getState().setSelection({ selectedIds: remainingSelectedIds as AnyNodeId[] })
  }
  return [...createdIds, ...updatedIds, ...deleteIds.map(String)]
}
