'use client'

import type { AnyNode, Point2D, RoofNode, RoofSegmentNode } from '@pascal-app/core'
import { memo, useMemo } from 'react'
import { FloorplanGeometryRenderer } from '../../../editor-2d/renderers/floorplan-geometry-renderer'
import { clamp } from '../geometry'
import { buildReferenceFloorGeometries } from '../reference-floor-geometry'
import type { FloorplanLineSegment } from '../types'

export function worldToBuildingLocalPlanPoint(
  worldPosition: [number, number, number],
  buildingOrigin: [number, number, number],
  buildingRotationY: number,
): Point2D {
  const dx = worldPosition[0] - buildingOrigin[0]
  const dz = worldPosition[2] - buildingOrigin[2]
  const cos = Math.cos(buildingRotationY)
  const sin = Math.sin(buildingRotationY)

  return {
    x: dx * cos + dz * sin,
    y: -dx * sin + dz * cos,
  }
}

export function getRoofSegmentCenter(
  roof: RoofNode,
  segment: RoofSegmentNode,
  worldPositionOverride?: Point2D,
): Point2D {
  if (worldPositionOverride) {
    return worldPositionOverride
  }

  const cos = Math.cos(roof.rotation)
  const sin = Math.sin(roof.rotation)
  const localX = segment.position[0]
  const localZ = segment.position[2]

  return {
    x: roof.position[0] + localX * cos - localZ * sin,
    y: roof.position[2] + localX * sin + localZ * cos,
  }
}

export function getRoofSegmentPolygon(
  roof: RoofNode,
  segment: RoofSegmentNode,
  options?: {
    localRotation?: number
    worldPositionOverride?: Point2D
  },
): Point2D[] {
  const center = getRoofSegmentCenter(roof, segment, options?.worldPositionOverride)
  const rotation = roof.rotation + (options?.localRotation ?? segment.rotation)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const halfWidth = segment.width / 2
  const halfDepth = segment.depth / 2

  const corners: Array<[number, number]> = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ]

  return corners.map(([x, y]) => ({
    x: center.x + x * cos - y * sin,
    y: center.y + x * sin + y * cos,
  }))
}

export function getRoofSegmentRidgeLine(
  roof: RoofNode,
  segment: RoofSegmentNode,
  options?: {
    localRotation?: number
    worldPositionOverride?: Point2D
  },
): FloorplanLineSegment | null {
  if (segment.roofType === 'flat') {
    return null
  }

  const center = getRoofSegmentCenter(roof, segment, options?.worldPositionOverride)
  const rotation = roof.rotation + (options?.localRotation ?? segment.rotation)
  const ridgeAxis =
    segment.roofType === 'gable' || segment.roofType === 'gambrel'
      ? 'x'
      : segment.roofType === 'dutch'
        ? segment.width >= segment.depth
          ? 'x'
          : 'z'
        : 'z'
  const axisAngle = ridgeAxis === 'x' ? rotation : rotation + Math.PI / 2
  const halfSpan = ridgeAxis === 'x' ? segment.width / 2 : segment.depth / 2

  return {
    start: {
      x: center.x - halfSpan * Math.cos(axisAngle),
      y: center.y - halfSpan * Math.sin(axisAngle),
    },
    end: {
      x: center.x + halfSpan * Math.cos(axisAngle),
      y: center.y + halfSpan * Math.sin(axisAngle),
    },
  }
}

export const FloorplanReferenceFloorLayer = memo(function FloorplanReferenceFloorLayer({
  nodes,
  opacity,
}: {
  nodes: readonly AnyNode[]
  opacity: number
}) {
  const geometries = useMemo(() => buildReferenceFloorGeometries(nodes), [nodes])
  if (geometries.length === 0) {
    return null
  }

  return (
    <g opacity={clamp(opacity, 0.1, 0.8)} pointerEvents="none">
      {geometries.map(({ geometry, id }) => (
        <FloorplanGeometryRenderer geometry={geometry} key={id} />
      ))}
    </g>
  )
})
