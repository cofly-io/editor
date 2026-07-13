import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import {
  FLOORPLAN_CURSOR_MARKER_CORE_RADIUS_PX,
  FLOORPLAN_CURSOR_MARKER_GLOW_RADIUS_PX,
  FLOORPLAN_DRAFT_ANCHOR_RADIUS_PX,
} from './constants'
import { toSvgX, toSvgY } from './coordinate-geometry'

type FloorplanCursorMarkersProps = {
  activeDraftAnchorPoint: WallPlanPoint | null
  anchorColor: string
  cursorColor: string
  cursorPoint: WallPlanPoint | null
  unitsPerPixel: number
}

export function FloorplanCursorMarkers({
  activeDraftAnchorPoint,
  anchorColor,
  cursorColor,
  cursorPoint,
  unitsPerPixel,
}: FloorplanCursorMarkersProps) {
  return (
    <>
      {cursorPoint && (
        <g>
          <circle
            cx={toSvgX(cursorPoint[0])}
            cy={toSvgY(cursorPoint[1])}
            fill={cursorColor}
            fillOpacity={0.25}
            r={FLOORPLAN_CURSOR_MARKER_GLOW_RADIUS_PX * unitsPerPixel}
          />
          <circle
            cx={toSvgX(cursorPoint[0])}
            cy={toSvgY(cursorPoint[1])}
            fill={cursorColor}
            fillOpacity={0.9}
            r={FLOORPLAN_CURSOR_MARKER_CORE_RADIUS_PX * unitsPerPixel}
          />
        </g>
      )}

      {activeDraftAnchorPoint && (
        <circle
          cx={toSvgX(activeDraftAnchorPoint[0])}
          cy={toSvgY(activeDraftAnchorPoint[1])}
          fill={anchorColor}
          fillOpacity={0.95}
          r={FLOORPLAN_DRAFT_ANCHOR_RADIUS_PX * unitsPerPixel}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </>
  )
}
