'use client'
import { memo } from 'react'
import { FLOORPLAN_MAJOR_GRID_STROKE_WIDTH, FLOORPLAN_MINOR_GRID_STROKE_WIDTH } from '../constants'
import type { FloorplanPalette } from '../types'

export const FloorplanGridLayer = memo(function FloorplanGridLayer({
  majorGridPath,
  minorGridPath,
  palette,
  showGrid,
}: {
  majorGridPath: string
  minorGridPath: string
  palette: FloorplanPalette
  showGrid: boolean
}) {
  if (!showGrid) {
    return null
  }

  return (
    <>
      <path
        d={minorGridPath}
        fill="none"
        opacity={palette.majorGridOpacity}
        shapeRendering="crispEdges"
        stroke={palette.majorGrid}
        strokeWidth={FLOORPLAN_MAJOR_GRID_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
      />

      <path
        d={majorGridPath}
        fill="none"
        opacity={palette.minorGridOpacity}
        shapeRendering="crispEdges"
        stroke={palette.minorGrid}
        strokeWidth={FLOORPLAN_MINOR_GRID_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
      />
    </>
  )
})
