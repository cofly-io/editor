import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import { toSvgX, toSvgY } from './coordinate-geometry'
import type { ReferenceScaleDraft } from './types'

export type FloorplanDraftAnchorPoint = {
  x: number
  y: number
  isPrimary: boolean
}

export function buildFloorplanDraftAnchorPoints({
  activePolygonDraftPoints,
  referenceScaleDraft,
}: {
  activePolygonDraftPoints: WallPlanPoint[]
  referenceScaleDraft: ReferenceScaleDraft | null
}): FloorplanDraftAnchorPoint[] {
  const anchors: FloorplanDraftAnchorPoint[] = []

  if (referenceScaleDraft?.start) {
    anchors.push({
      x: toSvgX(referenceScaleDraft.start[0]),
      y: toSvgY(referenceScaleDraft.start[1]),
      isPrimary: true,
    })
  }

  anchors.push(
    ...activePolygonDraftPoints.map((point, index) => ({
      x: toSvgX(point[0]),
      y: toSvgY(point[1]),
      isPrimary: index === 0,
    })),
  )

  return anchors
}
