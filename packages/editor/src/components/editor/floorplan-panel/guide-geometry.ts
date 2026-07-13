import type { GuideNode } from '@pascal-app/core'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import {
  FLOORPLAN_GUIDE_BASE_WIDTH,
  FLOORPLAN_GUIDE_MIN_SCALE,
  FLOORPLAN_GUIDE_ROTATION_FINE_SNAP_DEGREES,
  FLOORPLAN_GUIDE_ROTATION_SNAP_DEGREES,
} from './constants'
import {
  addVectorToSvgPoint,
  midpointBetweenSvgPoints,
  normalizeAngle,
  rotateVector,
  subtractSvgPoints,
  toPlanPointFromSvgPoint,
  toSvgPlanPoint,
  toSvgX,
  toSvgY,
} from './coordinate-geometry'
import type { GuideCorner, GuideInteractionState, GuideTransformDraft, SvgPoint } from './types'
import { guideCornerSigns } from './types'

export function getGuideWidth(scale: number) {
  return FLOORPLAN_GUIDE_BASE_WIDTH * scale
}

export function getGuideHeight(width: number, aspectRatio: number) {
  return width / aspectRatio
}

export function getGuideCenterSvgPoint(guide: GuideNode): SvgPoint {
  return {
    x: toSvgX(guide.position[0]),
    y: toSvgY(guide.position[2]),
  }
}

export function getGuideCornerLocalOffset(
  width: number,
  height: number,
  corner: GuideCorner,
): WallPlanPoint {
  const signs = guideCornerSigns[corner]
  return [(width / 2) * signs.x, (height / 2) * signs.y]
}

export function getGuideCornerSvgPoint(
  centerSvg: SvgPoint,
  width: number,
  height: number,
  rotationSvg: number,
  corner: GuideCorner,
): SvgPoint {
  return addVectorToSvgPoint(
    centerSvg,
    rotateVector(getGuideCornerLocalOffset(width, height, corner), rotationSvg),
  )
}

export function snapAngleToIncrement(angle: number, incrementDegrees: number) {
  const incrementRadians = (incrementDegrees * Math.PI) / 180
  return Math.round(angle / incrementRadians) * incrementRadians
}

export function toPositiveAngleDegrees(angle: number) {
  const angleDegrees = (angle * 180) / Math.PI
  return ((angleDegrees % 180) + 180) % 180
}

export function getResizeCursorForAngle(angle: number) {
  const normalizedDegrees = toPositiveAngleDegrees(angle)

  if (normalizedDegrees < 22.5 || normalizedDegrees >= 157.5) {
    return 'ew-resize'
  }

  if (normalizedDegrees < 67.5) {
    return 'nwse-resize'
  }

  if (normalizedDegrees < 112.5) {
    return 'ns-resize'
  }

  return 'nesw-resize'
}

export function getGuideResizeCursor(corner: GuideCorner, rotationSvg: number) {
  const signs = guideCornerSigns[corner]
  return getResizeCursorForAngle(Math.atan2(signs.y, signs.x) + rotationSvg)
}

export function buildCursorUrl(
  svgMarkup: string,
  hotspotX: number,
  hotspotY: number,
  fallback: string,
) {
  return `url("data:image/svg+xml,${encodeURIComponent(svgMarkup)}") ${hotspotX} ${hotspotY}, ${fallback}`
}

export function getGuideRotateCursor(isDarkMode: boolean) {
  const strokeColor = isDarkMode ? '#ffffff' : '#09090b'
  const outlineColor = isDarkMode ? '#0a0e1b' : '#ffffff'
  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M7 15.75a6 6 0 1 0 1.9-8.28" stroke="${outlineColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 5.5v4.5h4.5" stroke="${outlineColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 15.75a6 6 0 1 0 1.9-8.28" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 5.5v4.5h4.5" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `.trim()

  return buildCursorUrl(svgMarkup, 12, 12, 'pointer')
}

export function getGuideSvgRotation(rotationY: number) {
  return normalizeAngle(-rotationY)
}

export function getGuideSceneRotationFromSvgRotation(rotationSvg: number) {
  return normalizeAngle(-rotationSvg)
}

export function buildGuideTranslateDraft(
  interaction: GuideInteractionState,
  pointerSvg: SvgPoint,
): GuideTransformDraft {
  const centerSvg = addVectorToSvgPoint(pointerSvg, [
    -interaction.pointerOffsetSvg[0],
    -interaction.pointerOffsetSvg[1],
  ])

  return {
    guideId: interaction.guideId,
    position: toPlanPointFromSvgPoint(centerSvg),
    scale: interaction.scale,
    rotation: getGuideSceneRotationFromSvgRotation(interaction.rotationSvg),
  }
}

export function areGuideTransformDraftsEqual(
  previousDraft: GuideTransformDraft | null,
  nextDraft: GuideTransformDraft | null,
  epsilon = 1e-6,
) {
  if (previousDraft === nextDraft) {
    return true
  }

  if (!(previousDraft && nextDraft)) {
    return false
  }

  return (
    previousDraft.guideId === nextDraft.guideId &&
    Math.abs(previousDraft.position[0] - nextDraft.position[0]) <= epsilon &&
    Math.abs(previousDraft.position[1] - nextDraft.position[1]) <= epsilon &&
    Math.abs(previousDraft.scale - nextDraft.scale) <= epsilon &&
    Math.abs(previousDraft.rotation - nextDraft.rotation) <= epsilon
  )
}

export function doesGuideMatchDraft(guide: GuideNode, draft: GuideTransformDraft, epsilon = 1e-6) {
  return (
    Math.abs(guide.position[0] - draft.position[0]) <= epsilon &&
    Math.abs(guide.position[2] - draft.position[1]) <= epsilon &&
    Math.abs(guide.scale - draft.scale) <= epsilon &&
    Math.abs(normalizeAngle(guide.rotation[1] - draft.rotation)) <= epsilon
  )
}

export function transformGuideReferencePoint(
  point: WallPlanPoint,
  guide: GuideNode,
  draft: GuideTransformDraft,
): WallPlanPoint {
  const oldCenterSvg = getGuideCenterSvgPoint(guide)
  const newCenterSvg: SvgPoint = {
    x: toSvgX(draft.position[0]),
    y: toSvgY(draft.position[1]),
  }
  const oldRotationSvg = getGuideSvgRotation(guide.rotation[1])
  const newRotationSvg = getGuideSvgRotation(draft.rotation)
  const oldScale = guide.scale > 0 ? guide.scale : 1
  const newScale = draft.scale > 0 ? draft.scale : oldScale
  const pointSvg = toSvgPlanPoint(point)
  const localUnrotated = rotateVector(subtractSvgPoints(pointSvg, oldCenterSvg), -oldRotationSvg)
  const localScaled: WallPlanPoint = [
    (localUnrotated[0] / oldScale) * newScale,
    (localUnrotated[1] / oldScale) * newScale,
  ]
  const nextSvg = addVectorToSvgPoint(newCenterSvg, rotateVector(localScaled, newRotationSvg))

  return toPlanPointFromSvgPoint(nextSvg)
}

export function transformGuideScaleReference(
  guide: GuideNode,
  draft: GuideTransformDraft,
): GuideNode['scaleReference'] {
  const reference = guide.scaleReference
  if (!reference) {
    return reference
  }

  const start = transformGuideReferencePoint(reference.start, guide, draft)
  const end = transformGuideReferencePoint(reference.end, guide, draft)
  const measuredLengthUnits = Math.hypot(end[0] - start[0], end[1] - start[1])

  return {
    ...reference,
    start,
    end,
    measuredLengthUnits,
    metersPerUnit:
      measuredLengthUnits > 0
        ? reference.realLengthMeters / measuredLengthUnits
        : reference.metersPerUnit,
  }
}

export function buildGuideResizeDraft(
  interaction: GuideInteractionState,
  pointerSvg: SvgPoint,
): GuideTransformDraft {
  const signs = guideCornerSigns[interaction.corner]
  const minWidth = FLOORPLAN_GUIDE_BASE_WIDTH * FLOORPLAN_GUIDE_MIN_SCALE
  const diagonal = [signs.x * interaction.aspectRatio, signs.y] as WallPlanPoint
  const oppositeCornerSvg = interaction.oppositeCornerSvg ?? interaction.centerSvg
  const relativePointer = rotateVector(
    subtractSvgPoints(pointerSvg, oppositeCornerSvg),
    -interaction.rotationSvg,
  )
  const projectedHeight =
    (relativePointer[0] * diagonal[0] + relativePointer[1] * diagonal[1]) /
    (interaction.aspectRatio ** 2 + 1)
  const width = Math.max(minWidth, projectedHeight * interaction.aspectRatio)
  const height = getGuideHeight(width, interaction.aspectRatio)
  const draggedCornerSvg = addVectorToSvgPoint(
    oppositeCornerSvg,
    rotateVector([signs.x * width, signs.y * height], interaction.rotationSvg),
  )
  const centerSvg = midpointBetweenSvgPoints(oppositeCornerSvg, draggedCornerSvg)

  return {
    guideId: interaction.guideId,
    position: toPlanPointFromSvgPoint(centerSvg),
    scale: width / FLOORPLAN_GUIDE_BASE_WIDTH,
    rotation: getGuideSceneRotationFromSvgRotation(interaction.rotationSvg),
  }
}

export function buildGuideRotationDraft(
  interaction: GuideInteractionState,
  pointerSvg: SvgPoint,
  useFineIncrement: boolean,
): GuideTransformDraft {
  const pointerVector = subtractSvgPoints(pointerSvg, interaction.centerSvg)

  if (pointerVector[0] ** 2 + pointerVector[1] ** 2 <= 1e-6) {
    return {
      guideId: interaction.guideId,
      position: toPlanPointFromSvgPoint(interaction.centerSvg),
      scale: interaction.scale,
      rotation: getGuideSceneRotationFromSvgRotation(interaction.rotationSvg),
    }
  }

  const rawRotationSvg =
    Math.atan2(pointerVector[1], pointerVector[0]) - interaction.cornerBaseAngle
  const snappedRotationSvg = snapAngleToIncrement(
    rawRotationSvg,
    useFineIncrement
      ? FLOORPLAN_GUIDE_ROTATION_FINE_SNAP_DEGREES
      : FLOORPLAN_GUIDE_ROTATION_SNAP_DEGREES,
  )

  return {
    guideId: interaction.guideId,
    position: toPlanPointFromSvgPoint(interaction.centerSvg),
    scale: interaction.scale,
    rotation: getGuideSceneRotationFromSvgRotation(snappedRotationSvg),
  }
}
