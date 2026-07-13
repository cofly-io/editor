'use client'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { memo } from 'react'
import type { WallPlanPoint } from '../../../tools/wall/wall-drafting'
import {
  EDITOR_CURSOR,
  FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH,
  FLOORPLAN_ENDPOINT_HOVER_GLOW_STROKE_WIDTH,
  FLOORPLAN_ENDPOINT_HOVER_RING_STROKE_WIDTH,
  FLOORPLAN_HOVER_TRANSITION,
  FLOORPLAN_POLYGON_EDGE_HIT_STROKE_WIDTH_PX,
  FLOORPLAN_POLYGON_EDGE_HOVER_GLOW_STROKE_WIDTH_PX,
  FLOORPLAN_POLYGON_EDGE_VISIBLE_STROKE_WIDTH_PX,
  FLOORPLAN_POLYGON_MIDPOINT_DOT_RADIUS_PX,
  FLOORPLAN_POLYGON_MIDPOINT_HOVER_RADIUS_PX,
  FLOORPLAN_POLYGON_MIDPOINT_RADIUS_PX,
  FLOORPLAN_POLYGON_VERTEX_ACTIVE_DOT_RADIUS_PX,
  FLOORPLAN_POLYGON_VERTEX_ACTIVE_RADIUS_PX,
  FLOORPLAN_POLYGON_VERTEX_DOT_RADIUS_PX,
  FLOORPLAN_POLYGON_VERTEX_HIT_RADIUS_PX,
  FLOORPLAN_POLYGON_VERTEX_RADIUS_PX,
} from '../constants'
import { toSvgPlanPoint } from '../geometry'
import type { FloorplanPalette } from '../types'

export const FloorplanPolygonHandleLayer = memo(function FloorplanPolygonHandleLayer({
  edgeHandles = [],
  hoveredHandleId,
  midpointStyle = 'default',
  midpointHandles,
  onEdgePointerDown,
  onHandleHoverChange,
  onMidpointPointerDown,
  onVertexDoubleClick,
  onVertexPointerDown,
  palette,
  unitsPerPixel,
  vertexHandles,
}: {
  edgeHandles?: Array<{
    nodeId: string
    edgeIndex: number
    start: WallPlanPoint
    end: WallPlanPoint
    isActive?: boolean
  }>
  vertexHandles: Array<{
    nodeId: string
    vertexIndex: number
    point: WallPlanPoint
    isActive: boolean
  }>
  midpointStyle?: 'default' | 'add'
  midpointHandles: Array<{
    nodeId: string
    edgeIndex: number
    point: WallPlanPoint
  }>
  hoveredHandleId: string | null
  onHandleHoverChange: (handleId: string | null) => void
  onVertexPointerDown: (
    nodeId: string,
    vertexIndex: number,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  onVertexDoubleClick: (
    nodeId: string,
    vertexIndex: number,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  onMidpointPointerDown: (
    nodeId: string,
    edgeIndex: number,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
  onEdgePointerDown?: (
    nodeId: string,
    edgeIndex: number,
    event: ReactPointerEvent<SVGLineElement>,
  ) => void
  palette: FloorplanPalette
  unitsPerPixel: number
}) {
  return (
    <>
      {edgeHandles.map(({ nodeId, edgeIndex, start, end, isActive }) => {
        const handleId = `${nodeId}:edge:${edgeIndex}`
        const isHovered = hoveredHandleId === handleId
        const startSvg = toSvgPlanPoint(start)
        const endSvg = toSvgPlanPoint(end)
        const visibleStroke = isActive ? palette.endpointHandleActiveStroke : palette.selectedStroke

        return (
          <g
            key={handleId}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onPointerEnter={() => onHandleHoverChange(handleId)}
            onPointerLeave={() => onHandleHoverChange(null)}
          >
            <line
              pointerEvents="none"
              stroke={visibleStroke}
              strokeLinecap="round"
              strokeOpacity={0.18}
              strokeWidth={FLOORPLAN_POLYGON_EDGE_HOVER_GLOW_STROKE_WIDTH_PX}
              style={{
                opacity: isHovered || isActive ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
              x1={startSvg.x}
              x2={endSvg.x}
              y1={startSvg.y}
              y2={endSvg.y}
            />
            <line
              pointerEvents="none"
              stroke={visibleStroke}
              strokeLinecap="round"
              strokeOpacity={isActive ? 0.95 : 0.82}
              strokeWidth={FLOORPLAN_POLYGON_EDGE_VISIBLE_STROKE_WIDTH_PX}
              style={{
                opacity: isHovered || isActive ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
              x1={startSvg.x}
              x2={endSvg.x}
              y1={startSvg.y}
              y2={endSvg.y}
            />
            <line
              onPointerDown={
                onEdgePointerDown
                  ? (event) => onEdgePointerDown(nodeId, edgeIndex, event)
                  : undefined
              }
              pointerEvents="stroke"
              stroke="transparent"
              strokeLinecap="round"
              strokeWidth={FLOORPLAN_POLYGON_EDGE_HIT_STROKE_WIDTH_PX}
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
              x1={startSvg.x}
              x2={endSvg.x}
              y1={startSvg.y}
              y2={endSvg.y}
            />
          </g>
        )
      })}

      {vertexHandles.map(({ nodeId, vertexIndex, point, isActive }) => {
        const handleId = `${nodeId}:vertex:${vertexIndex}`
        const isHovered = hoveredHandleId === handleId
        const stroke = isActive ? palette.endpointHandleActiveStroke : palette.endpointHandleStroke
        const outerRadius =
          (isActive
            ? FLOORPLAN_POLYGON_VERTEX_ACTIVE_RADIUS_PX
            : FLOORPLAN_POLYGON_VERTEX_RADIUS_PX) * unitsPerPixel
        const dotRadius =
          (isActive
            ? FLOORPLAN_POLYGON_VERTEX_ACTIVE_DOT_RADIUS_PX
            : FLOORPLAN_POLYGON_VERTEX_DOT_RADIUS_PX) * unitsPerPixel
        const hitRadius = FLOORPLAN_POLYGON_VERTEX_HIT_RADIUS_PX * unitsPerPixel
        const svgPoint = toSvgPlanPoint(point)

        return (
          <g
            key={handleId}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onPointerEnter={() => onHandleHoverChange(handleId)}
            onPointerLeave={() => onHandleHoverChange(null)}
          >
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="none"
              pointerEvents="none"
              r={outerRadius}
              stroke={stroke}
              strokeOpacity={0.18}
              strokeWidth={FLOORPLAN_ENDPOINT_HOVER_GLOW_STROKE_WIDTH}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={isActive ? palette.endpointHandleActiveFill : palette.endpointHandleFill}
              fillOpacity={0.96}
              pointerEvents="none"
              r={outerRadius}
              stroke={stroke}
              strokeWidth="0.045"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={stroke}
              pointerEvents="none"
              r={dotRadius}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="transparent"
              onDoubleClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onVertexDoubleClick(nodeId, vertexIndex, event as any)
              }}
              onPointerDown={(event) => {
                onVertexPointerDown(nodeId, vertexIndex, event)
              }}
              pointerEvents="all"
              r={Math.max(outerRadius, hitRadius)}
              stroke="transparent"
              strokeWidth={FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH}
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}

      {midpointHandles.map(({ nodeId, edgeIndex, point }) => {
        const handleId = `${nodeId}:midpoint:${edgeIndex}`
        const isHovered = hoveredHandleId === handleId
        const isAddHandle = midpointStyle === 'add'
        const stroke = isAddHandle
          ? '#111827'
          : isHovered
            ? palette.endpointHandleHoverStroke
            : palette.endpointHandleStroke
        const radius =
          (isAddHandle
            ? isHovered
              ? FLOORPLAN_POLYGON_VERTEX_ACTIVE_RADIUS_PX
              : FLOORPLAN_POLYGON_VERTEX_RADIUS_PX
            : isHovered
              ? FLOORPLAN_POLYGON_MIDPOINT_HOVER_RADIUS_PX
              : FLOORPLAN_POLYGON_MIDPOINT_RADIUS_PX) * unitsPerPixel
        const dotRadius = isAddHandle ? 0 : FLOORPLAN_POLYGON_MIDPOINT_DOT_RADIUS_PX * unitsPerPixel
        const plusHalfLength = 3 * unitsPerPixel
        const svgPoint = toSvgPlanPoint(point)

        return (
          <g
            key={handleId}
            onClick={(event) => {
              event.stopPropagation()
            }}
            onPointerEnter={() => onHandleHoverChange(handleId)}
            onPointerLeave={() => onHandleHoverChange(null)}
          >
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="none"
              pointerEvents="none"
              r={radius + 2 * unitsPerPixel}
              stroke={stroke}
              strokeOpacity={0.16}
              strokeWidth={FLOORPLAN_ENDPOINT_HOVER_RING_STROKE_WIDTH}
              style={{
                opacity: isHovered ? 1 : 0,
                transition: FLOORPLAN_HOVER_TRANSITION,
              }}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill={isAddHandle ? '#ffffff' : palette.surface}
              fillOpacity={isAddHandle ? 1 : 0.94}
              pointerEvents="none"
              r={radius}
              stroke={stroke}
              strokeOpacity={0.9}
              strokeWidth={isAddHandle ? '1.4' : '0.035'}
              vectorEffect="non-scaling-stroke"
            />
            {isAddHandle ? (
              <>
                <line
                  pointerEvents="none"
                  stroke="#111827"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                  x1={svgPoint.x - plusHalfLength}
                  x2={svgPoint.x + plusHalfLength}
                  y1={svgPoint.y}
                  y2={svgPoint.y}
                />
                <line
                  pointerEvents="none"
                  stroke="#111827"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                  x1={svgPoint.x}
                  x2={svgPoint.x}
                  y1={svgPoint.y - plusHalfLength}
                  y2={svgPoint.y + plusHalfLength}
                />
              </>
            ) : (
              <circle
                cx={svgPoint.x}
                cy={svgPoint.y}
                fill={stroke}
                fillOpacity={0.82}
                pointerEvents="none"
                r={dotRadius}
                vectorEffect="non-scaling-stroke"
              />
            )}
            <circle
              cx={svgPoint.x}
              cy={svgPoint.y}
              fill="transparent"
              onPointerDown={(event) => onMidpointPointerDown(nodeId, edgeIndex, event)}
              pointerEvents="all"
              r={radius}
              stroke="transparent"
              strokeWidth={FLOORPLAN_ENDPOINT_HIT_STROKE_WIDTH}
              style={{ cursor: EDITOR_CURSOR }}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </>
  )
})
