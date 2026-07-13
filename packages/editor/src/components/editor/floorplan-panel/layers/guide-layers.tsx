'use client'
import { Icon } from '@iconify/react'
import type { GuideNode } from '@pascal-app/core'
import { Command } from 'lucide-react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { memo } from 'react'
import { cn } from '../../../../lib/utils'
import type { GuideUiState } from '../../../../store/use-editor'
import type { WallPlanPoint } from '../../../tools/wall/wall-drafting'
import {
  FLOORPLAN_GUIDE_HANDLE_HIT_RADIUS,
  FLOORPLAN_GUIDE_HANDLE_SIZE,
  FLOORPLAN_GUIDE_SELECTION_STROKE_WIDTH,
} from '../constants'
import {
  clamp,
  formatMeasurement,
  getGuideCornerLocalOffset,
  getGuideHeight,
  getGuideResizeCursor,
  getGuideRotateCursor,
  getGuideSvgRotation,
  getGuideWidth,
  toSvgX,
  toSvgY,
} from '../geometry'
import type {
  FloorplanPalette,
  GuideCorner,
  GuideHandleHintAnchor,
  GuideInteractionMode,
  ReferenceScaleDraft,
} from '../types'
import { GUIDE_CORNERS } from '../types'
import type { GuideImageDimensions } from './asset-hooks'
import { useGuideImageDimensions, useResolvedAssetUrl } from './asset-hooks'

export function FloorplanGuideImage({
  guide,
  isInteractive,
  isSelected,
  activeInteractionMode,
  onGuideSelect,
  onGuideTranslateStart,
}: {
  guide: GuideNode
  isInteractive: boolean
  isSelected: boolean
  activeInteractionMode: GuideInteractionMode | null
  onGuideSelect: (guideId: GuideNode['id']) => void
  onGuideTranslateStart: (guide: GuideNode, event: ReactPointerEvent<SVGRectElement>) => void
}) {
  const resolvedUrl = useResolvedAssetUrl(guide.url)
  const dimensions = useGuideImageDimensions(resolvedUrl)

  if (!(guide.opacity > 0 && guide.scale > 0 && resolvedUrl && dimensions)) {
    return null
  }

  const aspectRatio = dimensions.width / dimensions.height
  const planWidth = getGuideWidth(guide.scale)
  const planHeight = getGuideHeight(planWidth, aspectRatio)
  const centerX = toSvgX(guide.position[0])
  const centerY = toSvgY(guide.position[2])
  const rotationDeg = (getGuideSvgRotation(guide.rotation[1]) * 180) / Math.PI

  return (
    <g
      opacity={clamp(guide.opacity / 100, 0, 1)}
      transform={`translate(${centerX} ${centerY}) rotate(${rotationDeg})`}
    >
      {isInteractive ? (
        <rect
          fill="transparent"
          height={planHeight}
          onClick={(event) => {
            event.stopPropagation()
            onGuideSelect(guide.id)
          }}
          onPointerDown={(event) => {
            if (event.button === 0) {
              event.stopPropagation()
              if (isSelected) {
                onGuideTranslateStart(guide, event)
              }
            }
          }}
          pointerEvents="all"
          style={{
            cursor:
              isSelected && activeInteractionMode === 'translate'
                ? 'grabbing'
                : isSelected
                  ? 'grab'
                  : 'pointer',
          }}
          width={planWidth}
          x={-planWidth / 2}
          y={-planHeight / 2}
        />
      ) : null}
      <image
        height={planHeight}
        href={resolvedUrl}
        pointerEvents="none"
        preserveAspectRatio="none"
        width={planWidth}
        x={-planWidth / 2}
        y={-planHeight / 2}
      />
    </g>
  )
}

export const FloorplanGuideLayer = memo(function FloorplanGuideLayer({
  guideUi,
  guides,
  isInteractive,
  selectedGuideId,
  activeGuideInteractionGuideId,
  activeGuideInteractionMode,
  onGuideSelect,
  onGuideTranslateStart,
}: {
  guideUi: Record<string, GuideUiState>
  guides: GuideNode[]
  isInteractive: boolean
  selectedGuideId: GuideNode['id'] | null
  activeGuideInteractionGuideId: GuideNode['id'] | null
  activeGuideInteractionMode: GuideInteractionMode | null
  onGuideSelect: (guideId: GuideNode['id']) => void
  onGuideTranslateStart: (guide: GuideNode, event: ReactPointerEvent<SVGRectElement>) => void
}) {
  if (!guides.length) {
    return null
  }

  const orderedGuides =
    selectedGuideId && guides.some((guide) => guide.id === selectedGuideId)
      ? [
          ...guides.filter((guide) => guide.id !== selectedGuideId),
          guides.find((guide) => guide.id === selectedGuideId)!,
        ]
      : guides

  return (
    <>
      {orderedGuides.map((guide) => (
        <FloorplanGuideImage
          activeInteractionMode={
            activeGuideInteractionGuideId === guide.id ? activeGuideInteractionMode : null
          }
          guide={guide}
          isInteractive={isInteractive && guideUi[guide.id]?.locked !== true}
          isSelected={selectedGuideId === guide.id}
          key={guide.id}
          onGuideSelect={onGuideSelect}
          onGuideTranslateStart={onGuideTranslateStart}
        />
      ))}
    </>
  )
})

export function FloorplanReferenceScaleLine({
  end,
  isDraft = false,
  label,
  palette,
  start,
  unitsPerPixel,
}: {
  end: WallPlanPoint
  isDraft?: boolean
  label: string
  palette: FloorplanPalette
  start: WallPlanPoint
  unitsPerPixel: number
}) {
  const x1 = toSvgX(start[0])
  const y1 = toSvgY(start[1])
  const x2 = toSvgX(end[0])
  const y2 = toSvgY(end[1])
  const labelX = (x1 + x2) / 2
  const labelY = (y1 + y2) / 2
  const markerRadius = Math.max(unitsPerPixel * 5, 0.04)
  const labelPaddingX = Math.max(unitsPerPixel * 8, 0.08)
  const labelWidth = Math.max(
    label.length * unitsPerPixel * 7.2 + labelPaddingX * 2,
    unitsPerPixel * 54,
  )

  return (
    <g className={isDraft ? 'reference-scale-draft' : 'reference-scale'} pointerEvents="none">
      <line
        stroke={palette.cursor}
        strokeDasharray="8 6"
        strokeLinecap="round"
        strokeOpacity={isDraft ? 0.95 : 0.9}
        strokeWidth={2.25}
        vectorEffect="non-scaling-stroke"
        x1={x1}
        x2={x2}
        y1={y1}
        y2={y2}
      />
      <circle
        cx={x1}
        cy={y1}
        fill={palette.surface}
        r={markerRadius}
        stroke={palette.cursor}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={x2}
        cy={y2}
        fill={palette.surface}
        r={markerRadius}
        stroke={palette.cursor}
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
      />
      <g transform={`translate(${labelX} ${labelY - unitsPerPixel * 14})`}>
        <rect
          fill={palette.surface}
          height={unitsPerPixel * 20}
          opacity={0.94}
          rx={unitsPerPixel * 4}
          stroke={palette.cursor}
          strokeOpacity={0.55}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          width={labelWidth}
          x={-labelWidth / 2}
          y={-unitsPerPixel * 10}
        />
        <text
          dominantBaseline="middle"
          fill={palette.measurementStroke}
          fontSize={Math.max(unitsPerPixel * 11, 0.08)}
          fontWeight={700}
          pointerEvents="none"
          textAnchor="middle"
        >
          {label}
        </text>
      </g>
    </g>
  )
}

export function FloorplanReferenceScaleLayer({
  draft,
  guideUi,
  guides,
  palette,
  unit,
  unitsPerPixel,
}: {
  draft: ReferenceScaleDraft | null
  guideUi: Record<string, GuideUiState>
  guides: GuideNode[]
  palette: FloorplanPalette
  unit: 'metric' | 'imperial'
  unitsPerPixel: number
}) {
  const visibleReferences = guides
    .filter((guide) => guideUi[guide.id]?.scaleReferenceVisible !== false)
    .map((guide) => guide.scaleReference)
    .filter((reference): reference is NonNullable<GuideNode['scaleReference']> =>
      Boolean(reference),
    )

  return (
    <>
      {visibleReferences.map((reference, index) => (
        <FloorplanReferenceScaleLine
          end={reference.end}
          key={`${reference.label}-${index}-${reference.start.join(',')}-${reference.end.join(',')}`}
          label={reference.label}
          palette={palette}
          start={reference.start}
          unitsPerPixel={unitsPerPixel}
        />
      ))}
      {draft?.start && draft.cursor && (
        <FloorplanReferenceScaleLine
          end={draft.cursor}
          isDraft
          label={`Ref ${formatMeasurement(
            Math.hypot(draft.cursor[0] - draft.start[0], draft.cursor[1] - draft.start[1]),
            unit,
          )}`}
          palette={palette}
          start={draft.start}
          unitsPerPixel={unitsPerPixel}
        />
      )}
    </>
  )
}

export function FloorplanGuideSelectionOverlay({
  guide,
  isDarkMode,
  rotationModifierPressed,
  showHandles,
  onCornerHoverChange,
  onCornerPointerDown,
}: {
  guide: GuideNode | null
  isDarkMode: boolean
  rotationModifierPressed: boolean
  showHandles: boolean
  onCornerHoverChange: (corner: GuideCorner | null) => void
  onCornerPointerDown: (
    guide: GuideNode,
    dimensions: GuideImageDimensions,
    corner: GuideCorner,
    event: ReactPointerEvent<SVGCircleElement>,
  ) => void
}) {
  const resolvedUrl = useResolvedAssetUrl(guide?.url ?? '')
  const dimensions = useGuideImageDimensions(resolvedUrl)

  if (!(guide && guide.opacity > 0 && guide.scale > 0 && resolvedUrl && dimensions)) {
    return null
  }

  const aspectRatio = dimensions.width / dimensions.height
  const planWidth = getGuideWidth(guide.scale)
  const planHeight = getGuideHeight(planWidth, aspectRatio)
  const centerX = toSvgX(guide.position[0])
  const centerY = toSvgY(guide.position[2])
  const rotationDeg = (getGuideSvgRotation(guide.rotation[1]) * 180) / Math.PI
  const selectionStroke = isDarkMode ? '#ffffff' : '#09090b'
  const handleFill = isDarkMode ? '#ffffff' : '#09090b'
  const handleStroke = isDarkMode ? '#0a0e1b' : '#ffffff'

  return (
    <g transform={`translate(${centerX} ${centerY}) rotate(${rotationDeg})`}>
      <rect
        fill="none"
        height={planHeight}
        pointerEvents="none"
        stroke={selectionStroke}
        strokeDasharray="none"
        strokeLinejoin="round"
        strokeWidth={FLOORPLAN_GUIDE_SELECTION_STROKE_WIDTH}
        vectorEffect="non-scaling-stroke"
        width={planWidth}
        x={-planWidth / 2}
        y={-planHeight / 2}
      />

      {showHandles
        ? GUIDE_CORNERS.map((corner) => {
            const [x, y] = getGuideCornerLocalOffset(planWidth, planHeight, corner)

            return (
              <g key={corner}>
                <rect
                  fill={handleFill}
                  height={FLOORPLAN_GUIDE_HANDLE_SIZE}
                  pointerEvents="none"
                  rx={FLOORPLAN_GUIDE_HANDLE_SIZE * 0.22}
                  ry={FLOORPLAN_GUIDE_HANDLE_SIZE * 0.22}
                  stroke={handleStroke}
                  strokeWidth="0.04"
                  vectorEffect="non-scaling-stroke"
                  width={FLOORPLAN_GUIDE_HANDLE_SIZE}
                  x={x - FLOORPLAN_GUIDE_HANDLE_SIZE / 2}
                  y={y - FLOORPLAN_GUIDE_HANDLE_SIZE / 2}
                />
                <circle
                  cx={x}
                  cy={y}
                  fill="transparent"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onPointerDown={(event) => onCornerPointerDown(guide, dimensions, corner, event)}
                  onPointerEnter={() => onCornerHoverChange(corner)}
                  onPointerLeave={() => onCornerHoverChange(null)}
                  pointerEvents="all"
                  r={FLOORPLAN_GUIDE_HANDLE_HIT_RADIUS}
                  stroke="transparent"
                  strokeWidth={FLOORPLAN_GUIDE_HANDLE_HIT_RADIUS * 2}
                  style={{
                    cursor: rotationModifierPressed
                      ? getGuideRotateCursor(isDarkMode)
                      : getGuideResizeCursor(corner, getGuideSvgRotation(guide.rotation[1])),
                  }}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })
        : null}
    </g>
  )
}

export function FloorplanGuideHandleHint({
  anchor,
  isDarkMode,
  isMacPlatform,
  rotationModifierPressed,
}: {
  anchor: GuideHandleHintAnchor | null
  isDarkMode: boolean
  isMacPlatform: boolean
  rotationModifierPressed: boolean
}) {
  if (!anchor) {
    return null
  }

  const primaryToneClass = isDarkMode
    ? 'text-white drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.5)]'
    : 'text-[#09090b] drop-shadow-[0_1px_1.5px_rgba(255,255,255,0.8)]'

  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute z-20 select-none', primaryToneClass)}
      style={{
        left: anchor.x,
        top: anchor.y,
        transform: `translate(calc(-50% + ${anchor.directionX * 12}px), calc(-50% + ${anchor.directionY * 12}px))`,
      }}
    >
      <div className="flex flex-col gap-0.5">
        <div
          className={cn(
            'flex items-center gap-1.5 transition-opacity duration-150',
            rotationModifierPressed ? 'opacity-40' : 'opacity-100',
          )}
        >
          <span className="font-medium text-[11px] lowercase leading-none">resize</span>
          <Icon
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0"
            color="currentColor"
            icon="ph:mouse-left-click-fill"
          />
        </div>

        <div
          className={cn(
            'flex items-center gap-1.5 transition-opacity duration-150',
            rotationModifierPressed ? 'opacity-100' : 'opacity-40',
          )}
        >
          <span className="font-medium text-[11px] lowercase leading-none">rotate</span>
          {isMacPlatform ? (
            <Command aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          ) : (
            <span className="font-mono text-[10px] uppercase leading-none">ctrl</span>
          )}
          <Icon
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0"
            color="currentColor"
            icon="ph:mouse-left-click-fill"
          />
        </div>
      </div>
    </div>
  )
}
