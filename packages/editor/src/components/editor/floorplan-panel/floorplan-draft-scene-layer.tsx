import { FloorplanDraftLayer } from '../../editor-2d/renderers/floorplan-draft-layer'
import { FLOORPLAN_WALL_STROKE_WIDTH } from './constants'
import type { FloorplanDraftAnchorPoint } from './floorplan-draft-anchors'
import type { FloorplanPalette } from './types'

type SvgDraftLine = {
  x1: number
  y1: number
  x2: number
  y2: number
}

type FloorplanDraftSceneLayerProps = {
  draftAnchorPoints: FloorplanDraftAnchorPoint[]
  draftPolygonPoints: string | null
  fenceDraftSegment: SvgDraftLine | null
  isCeilingBuildActive: boolean
  isSlabBuildActive: boolean
  palette: FloorplanPalette
  polygonDraftClosingSegment: SvgDraftLine | null
  polygonDraftPolygonPoints: string | null
  polygonDraftPolylinePoints: string | null
  unitsPerPixel: number
}

export function FloorplanDraftSceneLayer({
  draftAnchorPoints,
  draftPolygonPoints,
  fenceDraftSegment,
  isCeilingBuildActive,
  isSlabBuildActive,
  palette,
  polygonDraftClosingSegment,
  polygonDraftPolygonPoints,
  polygonDraftPolylinePoints,
  unitsPerPixel,
}: FloorplanDraftSceneLayerProps) {
  const usesWallStroke = isSlabBuildActive || isCeilingBuildActive

  return (
    <FloorplanDraftLayer
      anchorFill={palette.anchor}
      draftAnchorPoints={draftAnchorPoints}
      draftFill={palette.draftFill}
      draftPolygonPoints={draftPolygonPoints}
      draftStroke={palette.draftStroke}
      linearDraftSegment={fenceDraftSegment}
      polygonDraftClosingSegment={polygonDraftClosingSegment}
      polygonDraftPolygonPoints={polygonDraftPolygonPoints}
      polygonDraftPolylinePoints={polygonDraftPolylinePoints}
      polygonDraftStroke={usesWallStroke ? palette.wallStroke : undefined}
      polygonDraftStrokeWidth={usesWallStroke ? FLOORPLAN_WALL_STROKE_WIDTH : undefined}
      unitsPerPixel={unitsPerPixel}
    />
  )
}
