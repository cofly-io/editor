'use client'

import type {
  AnyNode,
  AnyNodeId,
  BuildingNode,
  CeilingNode,
  ElevatorNode,
  FenceNode,
  GridEvent,
  GuideNode,
  LevelNode,
  SiteNode,
  SpawnNode,
  WallNode,
} from '@pascal-app/core'
import {
  calculateLevelMiters,
  emitter,
  getWallPlanFootprint,
  isRegistryMovable,
  nodeRegistry,
  SlabNode,
  StairNode as StairNodeSchema,
  StairSegmentNode as StairSegmentNodeSchema,
  useInteractive,
  useLiveNodeOverrides,
  useLiveTransforms,
  useScene,
  ZoneNode as ZoneNodeSchema,
} from '@pascal-app/core'
import useViewer from '@pascal-app/viewer/store'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  buildFloorplanStairEntry as buildSharedFloorplanStairEntry,
  collectLevelDescendants,
  getFloorplanWall as getSharedFloorplanWall,
} from '../../../lib/floorplan'
import { guideEmitter } from '../../../lib/guide-events'
import { sfxEmitter } from '../../../lib/sfx-bus'
import type { NavigationSyncPose } from '../../../store/use-editor'
import useEditor from '../../../store/use-editor'
import { FloorplanCursorIndicatorOverlay as Editor2dFloorplanCursorIndicatorOverlay } from '../../editor-2d/floorplan-cursor-indicator-overlay'
import { FloorplanSiteKeyHandler } from '../../editor-2d/floorplan-hotkey-handlers'
import { FloorplanRegistryActionMenu } from '../../editor-2d/floorplan-registry-action-menu'
import type { FloorplanRenderContextValue } from '../../editor-2d/floorplan-render-context'
import { FloorplanMarqueeLayer } from '../../editor-2d/renderers/floorplan-marquee-layer'
import { FloorplanStairLayer } from '../../editor-2d/renderers/floorplan-stair-layer'
import {
  createColumnFromPreset,
  DEFAULT_COLUMN_PRESET_ID,
} from '../../tools/column/column-defaults'
import { snapToHalf } from '../../tools/item/placement-math'
import {
  DEFAULT_STAIR_ATTACHMENT_SIDE,
  DEFAULT_STAIR_FILL_TO_FLOOR,
  DEFAULT_STAIR_HEIGHT,
  DEFAULT_STAIR_LENGTH,
  DEFAULT_STAIR_STEP_COUNT,
  DEFAULT_STAIR_THICKNESS,
  DEFAULT_STAIR_WIDTH,
} from '../../tools/stair/stair-defaults'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'
import {
  createWallOnCurrentLevel,
  isWallLongEnough,
  snapWallDraftPoint,
} from '../../tools/wall/wall-drafting'
import { PALETTE_COLORS } from '../../ui/primitives/color-dot'
import { resolveFloorplanBackgroundSelection } from '../floorplan-background-selection'
import { useFloorplanBackgroundPlacement } from '../use-floorplan-background-placement'
import { useFloorplanHitTesting } from '../use-floorplan-hit-testing'
import { useFloorplanSceneData } from '../use-floorplan-scene-data'
import {
  EDITOR_CURSOR,
  EMPTY_WALL_MITER_DATA,
  FLOORPLAN_CURSOR_BADGE_OFFSET_X,
  FLOORPLAN_CURSOR_BADGE_OFFSET_Y,
  FLOORPLAN_CURSOR_INDICATOR_LINE_HEIGHT,
  FLOORPLAN_DEFAULT_WINDOW_LOCAL_Y,
  FLOORPLAN_GUIDE_HANDLE_HINT_OFFSET,
  FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_X,
  FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_Y,
  FLOORPLAN_GUIDE_MIN_SCALE,
  FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX,
  FLOORPLAN_MARQUEE_GLOW_WIDTH,
  FLOORPLAN_MARQUEE_OUTLINE_WIDTH,
  FLOORPLAN_OPENING_HIT_STROKE_WIDTH,
  FLOORPLAN_POLYGON_VERTEX_HIT_RADIUS_PX,
  FLOORPLAN_VIEW_ROTATION_DEG,
  FLOORPLAN_WALL_HIT_STROKE_WIDTH,
  MAX_VIEWPORT_WIDTH_RATIO,
  MIN_VIEWPORT_WIDTH_RATIO,
  noopFloorplanStairHandler,
} from './constants'
import { FloorplanColumnPreview } from './floorplan-column-preview'
import { FloorplanCompassButton } from './floorplan-compass-button'
import { FloorplanCursorMarkers } from './floorplan-cursor-markers'
import { buildFloorplanDraftAnchorPoints } from './floorplan-draft-anchors'
import { FloorplanDraftSceneLayer } from './floorplan-draft-scene-layer'
import { FloorplanMarqueeInteractionLayer } from './floorplan-marquee-interaction-layer'
import { FloorplanRegistrySceneLayer } from './floorplan-registry-scene-layer'
import { FloorplanSelectionPatterns } from './floorplan-selection-patterns'
import {
  buildDraftWall,
  buildGridPath,
  buildWallWithUpdatedEndpoints,
  clamp,
  convertReferenceLengthToMeters,
  findClosestWallPoint,
  formatNumber,
  formatPolygonPoints,
  formatReferenceScaleLabel,
  getColumnPlanFootprint,
  getElevatorResizeAxis,
  getElevatorResizeSign,
  getFloorplanCurvedStairHitPolygon,
  getFloorplanWall,
  getGuideCenterSvgPoint,
  getGuideCornerLocalOffset,
  getGuideCornerSvgPoint,
  getGuideHeight,
  getGuideResizeCursor,
  getGuideRotateCursor,
  getGuideSvgRotation,
  getGuideWidth,
  getOpeningCenterLine,
  getPlanPointDistance,
  getRotatedViewBoxBounds,
  getSelectionModifierKeys,
  getSnappedFloorplanPoint,
  getVisibleGridSteps,
  getWallEndpointDraftUpdates,
  haveSameIds,
  pointsEqual,
  projectSvgPointToSurface,
  rotatePlanVector,
  rotateSvgPoint,
  roundPlanMeters,
  snapPolygonDraftPoint,
  subtractSvgPoints,
  toFloorplanPolygon,
  toPlanPointFromSvgPoint,
  toPoint2D,
  toSvgPlanPoint,
  toSvgPoint,
  toSvgX,
  toSvgY,
} from './geometry'
import type { GuideImageDimensions } from './layers'
import {
  FloorplanGridLayer,
  FloorplanGuideHandleHint,
  FloorplanGuideLayer,
  FloorplanGuideSelectionOverlay,
  FloorplanPolygonHandleLayer,
  FloorplanReferenceFloorLayer,
  FloorplanReferenceScaleLayer,
  FloorplanSiteLayer,
  useGuideImageDimensions,
  useResolvedAssetUrl,
} from './layers'
import {
  cameraAzimuthFromFloorplanRotation,
  floorplanLocalToWorldPoint,
  floorplanRotationFromCameraAzimuth,
  nearestEquivalentDegrees,
  worldToFloorplanLocalPoint,
} from './navigation'
import { getFloorplanPalette } from './palette'
import {
  getActivePolygonDraftPoints,
  getConfirmedPolygonDraftPoints,
  getPolygonDraftClosingSegment,
  getPolygonDraftPointAction,
  getPolygonDraftPolygonPoints,
  getPolygonDraftPolylinePoints,
} from './polygon-draft'
import { FloorplanReferenceScaleOverlay } from './reference-scale-overlay'
import type {
  CeilingPolygonEntry,
  ElevatorResizeDragState,
  ElevatorResizeHandle,
  FloorplanColumnEntry,
  FloorplanElevatorEntry,
  FloorplanFenceEntry,
  FloorplanItemEntry,
  FloorplanRoofEntry,
  FloorplanSpawnEntry,
  FloorplanStairEntry,
  FloorplanViewport,
  GestureLikeEvent,
  GuideCorner,
  GuideHandleHintAnchor,
  GuideInteractionState,
  GuideTransformDraft,
  OpeningNode,
  OpeningPolygonEntry,
  PanState,
  PendingFenceDragState,
  PendingReferenceScale,
  ReferenceScaleDraft,
  ReferenceScaleUnit,
  SlabPolygonEntry,
  SvgPoint,
  WallPolygonEntry,
  ZonePolygonEntry,
} from './types'
import { floorplanViewportEquals, oppositeGuideCorner } from './types'
import { useFloorplanBuildPointerMove } from './use-floorplan-build-pointer-move'
import { useFloorplanGridEvents } from './use-floorplan-grid-events'
import { useFloorplanMarqueeInteraction } from './use-floorplan-marquee-interaction'
import { useFloorplanPanelFrame } from './use-floorplan-panel-frame'
import { useFloorplanSurfaceSize } from './use-floorplan-surface-size'
import { useGuideTransformInteraction } from './use-guide-transform-interaction'
import { useMovingFloorplanNodeRevision } from './use-moving-floorplan-node-revision'
import { useMovingFloorplanPreviewRefresh } from './use-moving-floorplan-preview-refresh'
import { useOpeningWallHover } from './use-opening-wall-hover'
import { useSiteBoundaryInteraction } from './use-site-boundary-interaction'
import { useWallBuildPointerMove } from './use-wall-build-pointer-move'
import { useWallDragInteraction } from './use-wall-drag-interaction'
import {
  getFittedFloorplanViewport,
  getFloorplanSvgAspectRatio,
  getFloorplanViewBox,
  getFloorplanWorldUnitsPerPixel,
  panFloorplanViewport,
  zoomFloorplanViewportAtPoint,
} from './viewport'

export function FloorplanPanel() {
  const svgRef = useRef<SVGSVGElement>(null)
  const floorplanSceneRef = useRef<SVGGElement>(null)
  const panStateRef = useRef<PanState | null>(null)
  const guideInteractionRef = useRef<GuideInteractionState | null>(null)
  const guideTransformDraftRef = useRef<GuideTransformDraft | null>(null)
  const pendingFenceDragRef = useRef<PendingFenceDragState | null>(null)
  const floorplanUnitsPerPixelRef = useRef(1)
  const gestureScaleRef = useRef(1)
  const hasUserAdjustedViewportRef = useRef(false)
  const previousLevelIdRef = useRef<string | null>(null)
  const latestFittedViewportRef = useRef<FloorplanViewport | null>(null)
  const latestNavigationSyncPoseRef = useRef<NavigationSyncPose | null>(
    useEditor.getState().navigationSyncPose,
  )
  const latestViewportRef = useRef<FloorplanViewport | null>(null)
  const levelId = useViewer((state) => state.selection.levelId)
  const buildingId = useViewer((state) => state.selection.buildingId)
  const selectedZoneId = useViewer((state) => state.selection.zoneId)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const previewSelectedIds = useViewer((state) => state.previewSelectedIds)
  const setSelection = useViewer((state) => state.setSelection)
  const setPreviewSelectedIds = useViewer((state) => state.setPreviewSelectedIds)
  const theme = useViewer((state) => state.theme)
  const unit = useViewer((state) => state.unit)
  const showGrid = useViewer((state) => state.showGrid)
  const showGuides = useViewer((state) => state.showGuides)
  const setShowGuides = useViewer((state) => state.setShowGuides)
  const selectedItem = useEditor((state) => state.selectedItem)

  const setFloorplanHovered = useEditor((state) => state.setFloorplanHovered)
  const selectedReferenceId = useEditor((state) => state.selectedReferenceId)
  const setSelectedReferenceId = useEditor((state) => state.setSelectedReferenceId)
  const setMode = useEditor((state) => state.setMode)
  const movingNode = useEditor((state) => state.movingNode)
  const curvingWall = useEditor((state) => state.curvingWall)
  const curvingFence = useEditor((state) => state.curvingFence)
  const phase = useEditor((state) => state.phase)
  const mode = useEditor((state) => state.mode)
  const setPhase = useEditor((state) => state.setPhase)
  const setMovingFenceEndpoint = useEditor((state) => state.setMovingFenceEndpoint)
  const setMovingNode = useEditor((state) => state.setMovingNode)
  const setCurvingWall = useEditor((state) => state.setCurvingWall)
  const movingFenceEndpoint = useEditor((state) => state.movingFenceEndpoint)
  const structureLayer = useEditor((state) => state.structureLayer)
  const setStructureLayer = useEditor((state) => state.setStructureLayer)
  const setTool = useEditor((state) => state.setTool)
  const tool = useEditor((state) => state.tool)
  const editingHole = useEditor((state) => state.editingHole)
  const setEditingHole = useEditor((state) => state.setEditingHole)
  const deleteNode = useScene((state) => state.deleteNode)
  const updateNode = useScene((state) => state.updateNode)
  const {
    buildingPosition,
    buildingRotationY,
    ceilings,
    currentBuildingId,
    fences,
    floorplanLevels,
    levelDescendantNodes,
    levelGuides,
    levelNode,
    openings,
    roofs,
    site,
    slabs,
    spawns,
    walls,
    zones,
  } = useFloorplanSceneData({ buildingId, levelId })
  const elevators = useScene(
    useShallow((state) => {
      const building = currentBuildingId ? state.nodes[currentBuildingId] : null
      if (!building || building.type !== 'building') {
        return [] as ElevatorNode[]
      }

      return building.children.flatMap((childId) => {
        const node = state.nodes[childId]
        return node?.type === 'elevator' && node.visible !== false ? [node] : []
      })
    }),
  )
  const buildingRotationDeg = (buildingRotationY * 180) / Math.PI
  const [floorplanUserRotationDeg, setFloorplanUserRotationDeg] = useState(0)
  const floorplanSceneRotationDeg =
    FLOORPLAN_VIEW_ROTATION_DEG + floorplanUserRotationDeg - buildingRotationDeg

  const [draftStart, setDraftStart] = useState<WallPlanPoint | null>(null)
  const [draftEnd, setDraftEnd] = useState<WallPlanPoint | null>(null)
  const [fenceDraftStart, setFenceDraftStart] = useState<WallPlanPoint | null>(null)
  const [fenceDraftEnd, setFenceDraftEnd] = useState<WallPlanPoint | null>(null)
  const [roofDraftStart, setRoofDraftStart] = useState<WallPlanPoint | null>(null)
  const [roofDraftEnd, setRoofDraftEnd] = useState<WallPlanPoint | null>(null)
  const [ceilingDraftPoints, setCeilingDraftPoints] = useState<WallPlanPoint[]>([])
  const [slabDraftPoints, setSlabDraftPoints] = useState<WallPlanPoint[]>([])
  const [zoneDraftPoints, setZoneDraftPoints] = useState<WallPlanPoint[]>([])
  const [referenceScaleDraft, setReferenceScaleDraft] = useState<ReferenceScaleDraft | null>(null)
  const [pendingReferenceScale, setPendingReferenceScale] = useState<PendingReferenceScale | null>(
    null,
  )
  const [referenceScaleValue, setReferenceScaleValue] = useState('1')
  const [referenceScaleUnit, setReferenceScaleUnit] = useState<ReferenceScaleUnit>(
    unit === 'imperial' ? 'feet' : 'meters',
  )
  const [cursorPoint, setCursorPoint] = useState<WallPlanPoint | null>(null)
  const [floorplanCursorPosition, setFloorplanCursorPosition] = useState<SvgPoint | null>(null)
  const [hoveredOpeningId, setHoveredOpeningId] = useState<OpeningNode['id'] | null>(null)
  const [hoveredWallId, setHoveredWallId] = useState<WallNode['id'] | null>(null)
  const [hoveredFenceId, setHoveredFenceId] = useState<FenceNode['id'] | null>(null)
  const [hoveredSlabId, setHoveredSlabId] = useState<SlabNode['id'] | null>(null)
  const [hoveredCeilingId, setHoveredCeilingId] = useState<CeilingNode['id'] | null>(null)
  const [hoveredSpawnId, setHoveredSpawnId] = useState<SpawnNode['id'] | null>(null)
  const [hoveredElevatorId, setHoveredElevatorId] = useState<ElevatorNode['id'] | null>(null)
  const [elevatorResizeDragState, setElevatorResizeDragState] =
    useState<ElevatorResizeDragState | null>(null)
  const [hoveredEndpointId, setHoveredEndpointId] = useState<string | null>(null)
  const [hoveredWallCurveHandleId, setHoveredWallCurveHandleId] = useState<string | null>(null)
  const [hoveredSlabHandleId, setHoveredSlabHandleId] = useState<string | null>(null)
  const [hoveredCeilingHandleId, setHoveredCeilingHandleId] = useState<string | null>(null)
  const [hoveredZoneHandleId, setHoveredZoneHandleId] = useState<string | null>(null)
  const [hoveredGuideCorner, setHoveredGuideCorner] = useState<GuideCorner | null>(null)
  const floorplanSelectionTool = useEditor((s) => s.floorplanSelectionTool)
  const setFloorplanSelectionTool = useEditor((s) => s.setFloorplanSelectionTool)
  const showReferenceFloor = useEditor((s) => s.showReferenceFloor)
  const referenceFloorOffset = useEditor((s) => s.referenceFloorOffset)
  const referenceFloorOpacity = useEditor((s) => s.referenceFloorOpacity)
  const guideUi = useEditor((s) => s.guideUi)
  const setGuideLocked = useEditor((s) => s.setGuideLocked)
  const setGuideScaleReferenceVisible = useEditor((s) => s.setGuideScaleReferenceVisible)
  const clearGuideUi = useEditor((s) => s.clearGuideUi)
  const [shiftPressed, setShiftPressed] = useState(false)
  const [rotationModifierPressed, setRotationModifierPressed] = useState(false)
  const {
    bumpMovingFloorplanNodeRevision,
    movingFloorplanNodeRevision,
    scheduleMovingFloorplanNodeRefresh,
  } = useMovingFloorplanNodeRevision()
  useMovingFloorplanPreviewRefresh({
    movingNode,
    onRefresh: scheduleMovingFloorplanNodeRefresh,
  })
  const {
    cancelWallCurveDrag: cancelWallCurveDragState,
    cancelWallEndpointDrag: cancelWallEndpointDragState,
    clearWallCurveDrag: clearWallCurveDragState,
    clearWallEndpointDrag: clearWallEndpointDragState,
    commitWallCurveDrag: commitWallCurveDragState,
    commitWallEndpointDrag: commitWallEndpointDragState,
    hasWallEndpointDrag,
    isWallEndpointDragPointer,
    updateWallCurveDrag,
    updateWallEndpointDrag,
    wallCurveDraft,
    wallCurveDragRef,
    wallEndpointDraft,
    wallEndpointDragRef,
  } = useWallDragInteraction()
  const elevatorIds = useMemo(() => elevators.map((elevator) => elevator.id), [elevators])
  const elevatorRuntimeKey = useInteractive(
    useCallback(
      (state) =>
        elevatorIds
          .map((elevatorId) => {
            const runtime = state.elevators[elevatorId]
            if (!runtime) {
              return `${elevatorId}:`
            }

            return [
              elevatorId,
              runtime.currentLevelId ?? '',
              runtime.targetLevelId ?? '',
              runtime.phase,
              runtime.queue.join(','),
            ].join(':')
          })
          .join('|'),
      [elevatorIds],
    ),
  )
  const elevatorLiveOverrideKey = useLiveNodeOverrides(
    useCallback(
      (state) =>
        elevatorIds
          .map((elevatorId) => {
            const overrides = state.overrides.get(elevatorId)
            if (!overrides) {
              return `${elevatorId}:`
            }

            return [
              elevatorId,
              overrides.width ?? '',
              overrides.depth ?? '',
              overrides.shaftWidth ?? '',
              overrides.shaftDepth ?? '',
              overrides.shaftWallThickness ?? '',
            ].join(':')
          })
          .join('|'),
      [elevatorIds],
    ),
  )
  const [stairBuildPreviewPoint, setStairBuildPreviewPoint] = useState<WallPlanPoint | null>(null)
  const [stairBuildPreviewRotation, setStairBuildPreviewRotation] = useState(0)
  const [columnBuildPreviewPoint, setColumnBuildPreviewPoint] = useState<WallPlanPoint | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [isMacPlatform, setIsMacPlatform] = useState(true)
  const {
    activeResizeDirection,
    containerRef,
    handlePanelDragStart,
    handleResizeStart,
    isDraggingPanel,
    isPanelReady,
    panelRect,
  } = useFloorplanPanelFrame()
  const { surfaceSize, viewportHostRef } = useFloorplanSurfaceSize()
  const [viewport, setViewport] = useState<FloorplanViewport | null>(null)

  useEffect(() => {
    if (structureLayer === 'zones' && floorplanSelectionTool === 'marquee') {
      setFloorplanSelectionTool('click')
    }
  }, [floorplanSelectionTool, setFloorplanSelectionTool, structureLayer])

  useEffect(() => {
    setIsMacPlatform(navigator.platform.toUpperCase().includes('MAC'))
  }, [])

  const sitePolygonEntry = useMemo(() => {
    const polygonPoints = site?.polygon?.points
    if (!(site && polygonPoints)) {
      return null
    }

    const polygon = toFloorplanPolygon(polygonPoints)
    if (polygon.length < 3) {
      return null
    }

    return {
      site,
      polygon,
      points: formatPolygonPoints(polygon),
    }
  }, [site])
  const movingOpeningType =
    movingNode?.type === 'door' || movingNode?.type === 'window' ? movingNode.type : null

  const visibleGuides = useMemo<GuideNode[]>(() => {
    if (!showGuides) {
      return []
    }

    return levelGuides.filter((guide) => guide.visible !== false)
  }, [levelGuides, showGuides])
  const guideById = useMemo(
    () => new Map(levelGuides.map((guide) => [guide.id, guide] as const)),
    [levelGuides],
  )
  const {
    cancelGuideInteraction,
    clearGuideInteraction,
    commitGuideInteraction,
    guideTransformDraft,
    setGuideTransformDraft,
    updateGuideInteractionDraft,
  } = useGuideTransformInteraction({ guideById, guideInteractionRef, guideTransformDraftRef })
  const displayGuides = useMemo<GuideNode[]>(() => {
    if (!guideTransformDraft) {
      return visibleGuides
    }

    return visibleGuides.map((guide) =>
      guide.id === guideTransformDraft.guideId
        ? {
            ...guide,
            position: [
              guideTransformDraft.position[0],
              guide.position[1],
              guideTransformDraft.position[1],
            ] as [number, number, number],
            rotation: [guide.rotation[0], guideTransformDraft.rotation, guide.rotation[2]] as [
              number,
              number,
              number,
            ],
            scale: guideTransformDraft.scale,
          }
        : guide,
    )
  }, [guideTransformDraft, visibleGuides])
  const isGuideTraceVisible = displayGuides.some((guide) => guide.opacity > 0 && guide.scale > 0)
  const selectedGuideId =
    selectedReferenceId && guideById.has(selectedReferenceId as GuideNode['id'])
      ? (selectedReferenceId as GuideNode['id'])
      : null
  const selectedGuide = useMemo(
    () =>
      displayGuides.find((guide) => guide.id === selectedGuideId) ??
      (selectedGuideId ? (guideById.get(selectedGuideId) ?? null) : null),
    [displayGuides, guideById, selectedGuideId],
  )
  const calibratedMeasurementGuide = useMemo(() => {
    if (
      selectedGuide?.scaleReference &&
      selectedGuide.scaleReference.metersPerUnit > 0 &&
      selectedGuide.visible !== false
    ) {
      return selectedGuide
    }

    return (
      visibleGuides.find(
        (guide) => guide.scaleReference && guide.scaleReference.metersPerUnit > 0,
      ) ?? null
    )
  }, [selectedGuide, visibleGuides])
  const calibratedMetersPerUnit = calibratedMeasurementGuide?.scaleReference?.metersPerUnit ?? null
  const selectedGuideResolvedUrl = useResolvedAssetUrl(selectedGuide?.url ?? '')
  const selectedGuideDimensions = useGuideImageDimensions(selectedGuideResolvedUrl)
  const activeGuideInteractionGuideId = guideTransformDraft
    ? (guideInteractionRef.current?.guideId ?? null)
    : null
  const activeGuideInteractionMode = guideTransformDraft
    ? (guideInteractionRef.current?.mode ?? null)
    : null
  const floorplanWalls = useMemo(() => walls.map(getFloorplanWall), [walls])
  const wallMiterData = useMemo(() => calculateLevelMiters(floorplanWalls), [floorplanWalls])
  const wallById = useMemo(() => new Map(walls.map((wall) => [wall.id, wall] as const)), [walls])
  const floorplanWallById = useMemo(
    () => new Map(floorplanWalls.map((wall) => [wall.id, wall] as const)),
    [floorplanWalls],
  )
  const displayWallById = useMemo(() => {
    if (!(wallEndpointDraft || wallCurveDraft)) {
      return wallById
    }

    const nextWallById = new Map(wallById)

    if (wallEndpointDraft) {
      for (const draftUpdate of getWallEndpointDraftUpdates(wallEndpointDraft)) {
        const wall = nextWallById.get(draftUpdate.id)
        if (!wall) {
          continue
        }

        nextWallById.set(
          wall.id,
          buildWallWithUpdatedEndpoints(wall, draftUpdate.start, draftUpdate.end),
        )
      }
    }

    if (wallCurveDraft) {
      const wall = nextWallById.get(wallCurveDraft.wallId)
      if (wall) {
        nextWallById.set(wall.id, { ...wall, curveOffset: wallCurveDraft.curveOffset })
      }
    }

    return nextWallById
  }, [wallById, wallCurveDraft, wallEndpointDraft])
  const displayFloorplanWallById = useMemo(() => {
    if (!(wallEndpointDraft || wallCurveDraft)) {
      return floorplanWallById
    }

    const nextFloorplanWallById = new Map(floorplanWallById)
    let hasPreviewWalls = false

    if (wallEndpointDraft) {
      for (const draftUpdate of getWallEndpointDraftUpdates(wallEndpointDraft)) {
        const previewWall = displayWallById.get(draftUpdate.id)
        if (!previewWall) {
          continue
        }

        nextFloorplanWallById.set(previewWall.id, getFloorplanWall(previewWall))
        hasPreviewWalls = true
      }
    }

    if (wallCurveDraft) {
      const previewWall = displayWallById.get(wallCurveDraft.wallId)
      if (previewWall) {
        nextFloorplanWallById.set(previewWall.id, getFloorplanWall(previewWall))
        hasPreviewWalls = true
      }
    }

    return hasPreviewWalls ? nextFloorplanWallById : floorplanWallById
  }, [displayWallById, floorplanWallById, wallCurveDraft, wallEndpointDraft])
  // Fence is fully registry-driven (`def.floorplan` + `buildFenceFloorplan`).
  // The legacy entry list is permanently empty; kept as a typed stable
  // reference so downstream prop sites stay typed without each having to
  // declare its own `[]`.
  const floorplanFenceEntries = useMemo<FloorplanFenceEntry[]>(() => [], [])
  // Wall is fully registry-driven. Empty stable arrays for the legacy
  // entry lists; consumers' map / iteration paths become no-ops.
  const wallPolygons = useMemo<WallPolygonEntry[]>(() => [], [])
  const displayWallPolygons = useMemo<WallPolygonEntry[]>(() => [], [])

  // Doors + windows fully registry-driven via `def.floorplan`.
  const openingsPolygons = useMemo<OpeningPolygonEntry[]>(() => [], [])
  // Slab + ceiling fully registry-driven via `def.floorplan`. Same
  // empty-stable-array pattern.
  const slabPolygons = useMemo<SlabPolygonEntry[]>(() => [], [])
  const displaySlabPolygons = useMemo<SlabPolygonEntry[]>(() => [], [])
  const ceilingPolygons = useMemo<CeilingPolygonEntry[]>(() => [], [])
  const displayCeilingPolygons = useMemo<CeilingPolygonEntry[]>(() => [], [])
  // Zone fully registry-driven via `def.floorplan`.
  const zonePolygons = useMemo<ZonePolygonEntry[]>(() => [], [])
  const displayZonePolygons = useMemo<ZonePolygonEntry[]>(() => [], [])
  // Column fully registry-driven via `def.floorplan`.
  const floorplanColumnEntries = useMemo<FloorplanColumnEntry[]>(() => [], [])
  const levelDescendantNodeById = useMemo(
    () => new Map(levelDescendantNodes.map((node) => [node.id, node] as const)),
    [levelDescendantNodes],
  )
  // Spawn + item fully registry-driven.
  const floorplanSpawnEntries = useMemo<FloorplanSpawnEntry[]>(() => [], [])
  const floorplanItemEntries = useMemo<FloorplanItemEntry[]>(() => [], [])
  // Elevator fully registry-driven via `def.floorplan`.
  const floorplanElevatorEntries = useMemo<FloorplanElevatorEntry[]>(() => [], [])
  const referenceFloorLevel = useMemo(() => {
    if (!(showReferenceFloor && levelNode)) {
      return null
    }

    const lowerLevels = floorplanLevels
      .filter((floorLevel) => floorLevel.id !== levelNode.id && floorLevel.level < levelNode.level)
      .sort((a, b) => b.level - a.level)

    return lowerLevels[referenceFloorOffset - 1] ?? lowerLevels[0] ?? null
  }, [floorplanLevels, levelNode, referenceFloorOffset, showReferenceFloor])
  const referenceFloorDescendants = useScene(
    useShallow((state) => {
      if (!referenceFloorLevel) {
        return [] as AnyNode[]
      }

      return collectLevelDescendants(
        referenceFloorLevel,
        state.nodes as Record<string, AnyNode>,
      ).filter((node) => node.visible !== false)
    }),
  )
  // Pending-mesh check was a flag the legacy active-level item entries
  // raised when their polygon was the dimension fallback (waiting for
  // the GLB to load to produce a tighter convex hull). Items are now
  // registry-rendered, so the active-level entry list is always empty
  // and this flag is permanently false.
  const hasPendingItemMeshFootprints = false
  // Stair fully registry-driven via `def.floorplan` (the parent walks
  // its `stair-segment` children inside `buildStairFloorplan` to handle
  // the cumulative-transform chain). `FloorplanRegistryLayer` renders
  // the result; this legacy list stays empty.
  const floorplanStairEntries = useMemo<FloorplanStairEntry[]>(() => [], [])
  // Roof / roof-segment fully registry-driven via def.floorplan.
  const floorplanRoofEntries = useMemo<FloorplanRoofEntry[]>(() => [], [])
  // Slab / ceiling / zone are registry-driven; the polygon-handle, hole
  // editor, and boundary-edit affordances live on `def.floorplanAffordances`.
  // These legacy lookups stay as null stubs so the hole-editing fallbacks
  // that still reference them compile cleanly.

  const getSvgPointFromClientPoint = useCallback(
    (clientX: number, clientY: number): SvgPoint | null => {
      const svg = svgRef.current
      const target = floorplanSceneRef.current ?? svg
      const ctm = target?.getScreenCTM()
      if (!(svg && ctm)) {
        return null
      }

      const screenPoint = svg.createSVGPoint()
      screenPoint.x = clientX
      screenPoint.y = clientY
      const transformedPoint = screenPoint.matrixTransform(ctm.inverse())

      return { x: transformedPoint.x, y: transformedPoint.y }
    },
    [],
  )

  const getPlanPointFromClientPoint = useCallback(
    (clientX: number, clientY: number): WallPlanPoint | null => {
      const svgPoint = getSvgPointFromClientPoint(clientX, clientY)
      if (!svgPoint) {
        return null
      }

      if (!floorplanSceneRef.current && buildingRotationY !== 0) {
        const [unrotX, unrotY] = rotatePlanVector(svgPoint.x, svgPoint.y, -buildingRotationY)
        return toPlanPointFromSvgPoint({ x: unrotX, y: unrotY })
      }

      return toPlanPointFromSvgPoint(svgPoint)
    },
    [getSvgPointFromClientPoint, buildingRotationY],
  )

  const isSiteEditActive = phase === 'site'
  const {
    clearSiteBoundaryInteraction,
    displaySitePolygon,
    handleSiteEdgePointerDown,
    handleSiteMidpointPointerDown,
    handleSiteVertexDoubleClick,
    handleSiteVertexPointerDown,
    hoveredSiteHandleId,
    setHoveredSiteHandleId,
    siteEdgeHandles,
    siteMidpointHandles,
    siteVertexDragState,
    siteVertexHandles,
  } = useSiteBoundaryInteraction({
    getFloorplanUnitsPerPixel: () => floorplanUnitsPerPixelRef.current,
    getPlanPointFromClientPoint,
    isSiteEditActive,
    onCursorPointChange: setCursorPoint,
    site,
    sitePolygonEntry,
    updateNode,
    vertexHitRadiusPx: FLOORPLAN_POLYGON_VERTEX_HIT_RADIUS_PX,
  })
  const isWallBuildActive = phase === 'structure' && mode === 'build' && tool === 'wall'
  const isSlabBuildActive = phase === 'structure' && mode === 'build' && tool === 'slab'
  const isCeilingBuildActive = phase === 'structure' && mode === 'build' && tool === 'ceiling'
  const isZoneBuildActive = phase === 'structure' && mode === 'build' && tool === 'zone'
  const isDoorBuildActive = phase === 'structure' && mode === 'build' && tool === 'door'
  const isWindowBuildActive = phase === 'structure' && mode === 'build' && tool === 'window'
  const isPolygonBuildActive = isSlabBuildActive || isZoneBuildActive
  const isPolygonDraftBuildActive = isPolygonBuildActive || isCeilingBuildActive
  const isOpeningBuildActive = isDoorBuildActive || isWindowBuildActive
  const isOpeningMoveActive = movingOpeningType !== null
  const isOpeningPlacementActive = isOpeningBuildActive || isOpeningMoveActive
  const isFenceBuildActive = phase === 'structure' && mode === 'build' && tool === 'fence'
  const isRoofBuildActive = phase === 'structure' && mode === 'build' && tool === 'roof'
  const isStairBuildActive = phase === 'structure' && mode === 'build' && tool === 'stair'
  const isColumnBuildActive = phase === 'structure' && mode === 'build' && tool === 'column'
  const isRegistryMoveActive = movingNode ? isRegistryMovable(movingNode.type) : false
  const isWallCurveActive = curvingWall?.type === 'wall'
  const isFenceCurveActive = curvingFence?.type === 'fence'
  const isFenceEndpointMoveActive = movingFenceEndpoint !== null
  const isItemPlacementPreviewActive =
    (mode === 'build' && tool === 'item') || movingNode?.type === 'item'
  const isFloorItemBuildActive = mode === 'build' && tool === 'item' && !selectedItem?.attachTo
  // Any registry-driven kind whose tool is currently active. Lets the floor
  // plan emit `grid:click` / `grid:move` events to that kind's placement tool
  // (shelf today; future Phase 5 kinds the moment they register a `tool`).
  // Independent of whether the kind has a `def.floorplan` builder 鈥?placement
  // works as long as the kind's tool subscribes to the emitter.
  const isRegistryToolBuildActive = mode === 'build' && tool != null && nodeRegistry.has(tool)
  const isFloorplanGridInteractionActive =
    isFenceBuildActive ||
    isRoofBuildActive ||
    isCeilingBuildActive ||
    isStairBuildActive ||
    isColumnBuildActive ||
    isRegistryMoveActive ||
    isWallCurveActive ||
    isFenceCurveActive ||
    isFenceEndpointMoveActive ||
    isFloorItemBuildActive ||
    isRegistryToolBuildActive
  const floorplanPreviewStairSegment = useMemo(
    () =>
      StairSegmentNodeSchema.parse({
        id: 'sseg_floorplan_preview',
        segmentType: 'stair',
        width: DEFAULT_STAIR_WIDTH,
        length: DEFAULT_STAIR_LENGTH,
        height: DEFAULT_STAIR_HEIGHT,
        stepCount: DEFAULT_STAIR_STEP_COUNT,
        attachmentSide: DEFAULT_STAIR_ATTACHMENT_SIDE,
        fillToFloor: DEFAULT_STAIR_FILL_TO_FLOOR,
        thickness: DEFAULT_STAIR_THICKNESS,
        position: [0, 0, 0],
        metadata: { isTransient: true, isFloorplanPreview: true },
      }),
    [],
  )
  const floorplanPreviewStairEntry = useMemo(() => {
    if (!(isStairBuildActive && stairBuildPreviewPoint)) {
      return null
    }

    const previewStair = StairNodeSchema.parse({
      id: 'stair_floorplan_preview',
      name: 'Staircase preview',
      position: [stairBuildPreviewPoint[0], 0, stairBuildPreviewPoint[1]],
      rotation: stairBuildPreviewRotation,
      children: [floorplanPreviewStairSegment.id],
      metadata: { isTransient: true, isFloorplanPreview: true },
    })

    const entry = buildSharedFloorplanStairEntry(previewStair, [floorplanPreviewStairSegment])
    if (!entry) {
      return null
    }
    const hitPolygons =
      (previewStair.stairType ?? 'straight') === 'straight'
        ? entry.segments.map((segmentEntry) => segmentEntry.polygon)
        : [getFloorplanCurvedStairHitPolygon(previewStair)]

    return {
      ...entry,
      hitPolygons,
      segments: entry.segments.map((segmentEntry) => ({
        ...segmentEntry,
        innerPoints: formatPolygonPoints(segmentEntry.innerPolygon),
        points: formatPolygonPoints(segmentEntry.polygon),
        treadBars: segmentEntry.treadBars.map((polygon) => ({
          points: formatPolygonPoints(polygon),
          polygon,
        })),
      })),
    }
  }, [
    floorplanPreviewStairSegment,
    isStairBuildActive,
    stairBuildPreviewPoint,
    stairBuildPreviewRotation,
  ])
  const renderedFloorplanStairEntries = useMemo(
    () =>
      floorplanPreviewStairEntry
        ? [...floorplanStairEntries, floorplanPreviewStairEntry]
        : floorplanStairEntries,
    [floorplanPreviewStairEntry, floorplanStairEntries],
  )
  const floorplanPreviewColumnEntry = useMemo(() => {
    if (!(isColumnBuildActive && columnBuildPreviewPoint)) {
      return null
    }

    const previewColumn = createColumnFromPreset(DEFAULT_COLUMN_PRESET_ID, [
      columnBuildPreviewPoint[0],
      0,
      columnBuildPreviewPoint[1],
    ])
    const polygon = getColumnPlanFootprint(previewColumn)
    if (polygon.length < 3) {
      return null
    }

    return {
      column: previewColumn,
      points: formatPolygonPoints(polygon),
      polygon,
    }
  }, [columnBuildPreviewPoint, isColumnBuildActive])
  const floorplanOpeningLocalY = useMemo(() => {
    if (movingNode?.type === 'door' || movingNode?.type === 'window') {
      return snapToHalf(movingNode.position[1])
    }

    if (isWindowBuildActive) {
      // Floorplan is top-down, so new windows need an explicit wall-local height.
      return snapToHalf(FLOORPLAN_DEFAULT_WINDOW_LOCAL_Y)
    }

    return 0
  }, [isWindowBuildActive, movingNode])
  const isMarqueeSelectionToolActive =
    mode === 'select' &&
    floorplanSelectionTool === 'marquee' &&
    !movingNode &&
    !movingFenceEndpoint &&
    structureLayer !== 'zones'
  const isDeleteMode = mode === 'delete' && !movingNode
  const canSelectElementFloorplanGeometry =
    mode === 'select' &&
    floorplanSelectionTool === 'click' &&
    !movingNode &&
    !movingFenceEndpoint &&
    structureLayer !== 'zones'
  const canInteractElementFloorplanGeometry = isDeleteMode || canSelectElementFloorplanGeometry
  const canInteractFloorplanSlabs = isDeleteMode || canSelectElementFloorplanGeometry
  const canInteractWithGuides =
    showGuides &&
    canSelectElementFloorplanGeometry &&
    !referenceScaleDraft &&
    !pendingReferenceScale
  const canSelectFloorplanZones =
    mode === 'select' &&
    floorplanSelectionTool === 'click' &&
    !movingNode &&
    !movingFenceEndpoint &&
    structureLayer === 'zones'
  const canInteractFloorplanZones = isDeleteMode || canSelectFloorplanZones
  const isFloorplanStructureContextActive = phase === 'structure' && structureLayer !== 'zones'
  const isFloorplanFurnishContextActive = phase === 'furnish'
  const isFloorplanItemContextActive =
    isFloorplanFurnishContextActive || isFloorplanStructureContextActive
  const canSelectFloorplanStairs =
    (mode === 'select' &&
      floorplanSelectionTool === 'click' &&
      !movingNode &&
      !movingFenceEndpoint &&
      isFloorplanStructureContextActive) ||
    isDeleteMode
  const canSelectFloorplanElevators = canSelectFloorplanStairs
  const canSelectFloorplanSpawns = canSelectFloorplanStairs
  const canSelectFloorplanItems =
    (mode === 'select' &&
      floorplanSelectionTool === 'click' &&
      !movingNode &&
      !movingFenceEndpoint &&
      isFloorplanItemContextActive) ||
    isDeleteMode
  const canFocusFloorplanStairs =
    mode === 'select' &&
    floorplanSelectionTool === 'click' &&
    !movingNode &&
    !movingFenceEndpoint &&
    isFloorplanStructureContextActive
  const canFocusFloorplanSpawns = canFocusFloorplanStairs
  const canFocusFloorplanItems =
    mode === 'select' &&
    floorplanSelectionTool === 'click' &&
    !movingNode &&
    !movingFenceEndpoint &&
    isFloorplanItemContextActive
  const visibleSitePolygon = phase === 'site' ? displaySitePolygon : null
  const visibleZonePolygons = displayZonePolygons
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const highlightedFloorplanIdSet = useMemo(
    () => new Set([...selectedIds, ...previewSelectedIds]),
    [previewSelectedIds, selectedIds],
  )
  const draftPolygon = useMemo(() => {
    if (!(levelId && draftStart && draftEnd && isWallLongEnough(draftStart, draftEnd))) {
      return null
    }

    const draftWall = getSharedFloorplanWall(buildDraftWall(levelId, draftStart, draftEnd))
    // Keep the live draft preview cheap; full level-wide mitering here runs on every mouse move.
    return getWallPlanFootprint(draftWall, EMPTY_WALL_MITER_DATA)
  }, [draftEnd, draftStart, levelId])
  const draftPolygonPoints = useMemo(() => {
    if (isRoofBuildActive && roofDraftStart && roofDraftEnd) {
      const minX = Math.min(roofDraftStart[0], roofDraftEnd[0])
      const maxX = Math.max(roofDraftStart[0], roofDraftEnd[0])
      const minY = Math.min(roofDraftStart[1], roofDraftEnd[1])
      const maxY = Math.max(roofDraftStart[1], roofDraftEnd[1])

      if (Math.abs(maxX - minX) >= 1e-6 || Math.abs(maxY - minY) >= 1e-6) {
        return formatPolygonPoints([
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ])
      }
    }

    return draftPolygon ? formatPolygonPoints(draftPolygon) : null
  }, [draftPolygon, isRoofBuildActive, roofDraftEnd, roofDraftStart])
  const fenceDraftSegment = useMemo(() => {
    if (!(isFenceBuildActive && fenceDraftStart && fenceDraftEnd)) {
      return null
    }

    if (getPlanPointDistance(toPoint2D(fenceDraftStart), toPoint2D(fenceDraftEnd)) < 1e-6) {
      return null
    }

    return {
      x1: toSvgX(fenceDraftStart[0]),
      y1: toSvgY(fenceDraftStart[1]),
      x2: toSvgX(fenceDraftEnd[0]),
      y2: toSvgY(fenceDraftEnd[1]),
    }
  }, [fenceDraftEnd, fenceDraftStart, isFenceBuildActive])
  const activePolygonDraftPoints = useMemo(
    () =>
      getActivePolygonDraftPoints({
        ceilingDraftPoints,
        isCeilingBuildActive,
        isSlabBuildActive,
        isZoneBuildActive,
        slabDraftPoints,
        zoneDraftPoints,
      }),
    [
      ceilingDraftPoints,
      isCeilingBuildActive,
      isSlabBuildActive,
      isZoneBuildActive,
      slabDraftPoints,
      zoneDraftPoints,
    ],
  )
  const polygonDraftPolylinePoints = useMemo(() => {
    return getPolygonDraftPolylinePoints({
      cursorPoint,
      draftPoints: activePolygonDraftPoints,
      isPolygonDraftBuildActive,
    })
  }, [activePolygonDraftPoints, cursorPoint, isPolygonDraftBuildActive])
  const polygonDraftPolygonPoints = useMemo(() => {
    return getPolygonDraftPolygonPoints({
      cursorPoint,
      draftPoints: activePolygonDraftPoints,
      isPolygonDraftBuildActive,
    })
  }, [activePolygonDraftPoints, cursorPoint, isPolygonDraftBuildActive])
  const polygonDraftClosingSegment = useMemo(() => {
    return getPolygonDraftClosingSegment({
      cursorPoint,
      draftPoints: activePolygonDraftPoints,
      isPolygonDraftBuildActive,
    })
  }, [activePolygonDraftPoints, cursorPoint, isPolygonDraftBuildActive])
  const draftAnchorPoints = useMemo(
    () =>
      buildFloorplanDraftAnchorPoints({
        activePolygonDraftPoints,
        referenceScaleDraft,
      }),
    [activePolygonDraftPoints, referenceScaleDraft],
  )

  const svgAspectRatio = getFloorplanSvgAspectRatio(surfaceSize)

  const fittedViewport = useMemo(() => {
    const allPoints = [
      ...(visibleSitePolygon ? visibleSitePolygon.polygon : []),
      ...displayCeilingPolygons.flatMap((entry) => entry.polygon),
      ...displaySlabPolygons.flatMap((entry) => entry.polygon),
      ...floorplanElevatorEntries.flatMap((entry) => entry.polygon),
      ...floorplanFenceEntries.flatMap((entry) => entry.centerline),
      ...floorplanItemEntries.flatMap((entry) => entry.polygon),
      ...floorplanRoofEntries.flatMap((entry) =>
        entry.segments.flatMap((segmentEntry) => segmentEntry.polygon),
      ),
      ...floorplanStairEntries.flatMap((entry) => entry.hitPolygons.flat()),
      ...visibleZonePolygons.flatMap((entry) => entry.polygon),
      ...wallPolygons.flatMap((entry) => entry.polygon),
    ].map(toSvgPoint)

    return getFittedFloorplanViewport(allPoints, svgAspectRatio)
  }, [
    displayCeilingPolygons,
    displaySlabPolygons,
    floorplanElevatorEntries,
    floorplanFenceEntries,
    floorplanItemEntries,
    floorplanRoofEntries,
    floorplanStairEntries,
    svgAspectRatio,
    visibleSitePolygon,
    visibleZonePolygons,
    wallPolygons,
  ])

  useEffect(() => {
    const levelChanged = previousLevelIdRef.current !== (levelId ?? null)

    if (levelChanged) {
      previousLevelIdRef.current = levelId ?? null
      hasUserAdjustedViewportRef.current = false
      setViewport((current) =>
        floorplanViewportEquals(current, fittedViewport) ? current : fittedViewport,
      )
      return
    }

    // While the cursor drives live geometry (items, drafts, moves), `fittedViewport` changes every
    // pointermove. Syncing `viewport` here would call setState in a tight loop (max update depth).
    const transientFloorplanFit =
      cursorPoint != null ||
      movingNode != null ||
      movingFenceEndpoint != null ||
      curvingWall != null ||
      curvingFence != null ||
      siteVertexDragState != null ||
      isPolygonDraftBuildActive

    if (!(hasUserAdjustedViewportRef.current || transientFloorplanFit)) {
      setViewport((current) =>
        floorplanViewportEquals(current, fittedViewport) ? current : fittedViewport,
      )
    }
  }, [
    curvingFence,
    curvingWall,
    cursorPoint,
    fittedViewport,
    isPolygonDraftBuildActive,
    levelId,
    movingFenceEndpoint,
    movingNode,
    siteVertexDragState,
  ])

  const viewBox = useMemo(() => {
    return getFloorplanViewBox(viewport ?? fittedViewport, svgAspectRatio)
  }, [fittedViewport, svgAspectRatio, viewport])
  useEffect(() => {
    latestFittedViewportRef.current = fittedViewport
    latestViewportRef.current = viewport ?? fittedViewport
  }, [fittedViewport, viewport])
  const floorplanWorldUnitsPerPixel = useMemo(() => {
    return getFloorplanWorldUnitsPerPixel(viewBox, surfaceSize)
  }, [surfaceSize, viewBox])
  const floorplanWallHitTolerance = useMemo(
    () => floorplanWorldUnitsPerPixel * (FLOORPLAN_WALL_HIT_STROKE_WIDTH / 2),
    [floorplanWorldUnitsPerPixel],
  )
  const floorplanOpeningHitTolerance = useMemo(
    () => floorplanWorldUnitsPerPixel * (FLOORPLAN_OPENING_HIT_STROKE_WIDTH / 2),
    [floorplanWorldUnitsPerPixel],
  )
  const wallSelectionHatchSpacing = useMemo(
    () => Math.max(floorplanWorldUnitsPerPixel * 12, 0.0001),
    [floorplanWorldUnitsPerPixel],
  )
  const wallSelectionHatchStrokeWidth = useMemo(
    () => Math.max(floorplanWorldUnitsPerPixel * 0.25, 0.0001),
    [floorplanWorldUnitsPerPixel],
  )
  const slabSelectionHatchStrokeWidth = useMemo(
    () => Math.max(floorplanWorldUnitsPerPixel * 0.55, 0.0001),
    [floorplanWorldUnitsPerPixel],
  )
  const floorplanCursorAnchorPosition = useMemo(() => {
    if (
      cursorPoint &&
      surfaceSize.width > 0 &&
      surfaceSize.height > 0 &&
      viewBox.width > 0 &&
      viewBox.height > 0
    ) {
      return projectSvgPointToSurface(
        rotateSvgPoint(toSvgPlanPoint(cursorPoint), floorplanSceneRotationDeg),
        viewBox,
        surfaceSize,
      )
    }

    return floorplanCursorPosition
  }, [
    cursorPoint,
    floorplanCursorPosition,
    floorplanSceneRotationDeg,
    surfaceSize,
    surfaceSize.height,
    surfaceSize.width,
    viewBox,
  ])

  useEffect(() => {
    setHoveredGuideCorner(null)
  }, [])

  useEffect(() => {
    if (!(selectedGuide && showGuides && canInteractWithGuides)) {
      setHoveredGuideCorner(null)
    }
  }, [canInteractWithGuides, selectedGuide, showGuides])

  const guideHandleHintAnchor = useMemo<GuideHandleHintAnchor | null>(() => {
    if (
      !(
        hoveredGuideCorner &&
        selectedGuide &&
        selectedGuideDimensions &&
        surfaceSize.width > 0 &&
        surfaceSize.height > 0 &&
        viewBox.width > 0 &&
        viewBox.height > 0
      )
    ) {
      return null
    }

    const aspectRatio = selectedGuideDimensions.width / selectedGuideDimensions.height
    if (!(aspectRatio > 0)) {
      return null
    }

    const planWidth = getGuideWidth(selectedGuide.scale)
    const planHeight = getGuideHeight(planWidth, aspectRatio)
    const centerSvg = getGuideCenterSvgPoint(selectedGuide)
    const handleSvg = getGuideCornerSvgPoint(
      centerSvg,
      planWidth,
      planHeight,
      -selectedGuide.rotation[1],
      hoveredGuideCorner,
    )

    const centerPosition = projectSvgPointToSurface(
      rotateSvgPoint(centerSvg, floorplanSceneRotationDeg),
      viewBox,
      surfaceSize,
    )
    const handlePosition = projectSvgPointToSurface(
      rotateSvgPoint(handleSvg, floorplanSceneRotationDeg),
      viewBox,
      surfaceSize,
    )

    if (!(centerPosition && handlePosition)) {
      return null
    }

    const centerX = centerPosition.x
    const centerY = centerPosition.y
    const handleX = handlePosition.x
    const handleY = handlePosition.y

    let directionX = handleX - centerX
    let directionY = handleY - centerY
    const directionLength = Math.hypot(directionX, directionY)

    if (directionLength > 0.001) {
      directionX /= directionLength
      directionY /= directionLength
    } else {
      directionX = 1
      directionY = 0
    }

    const minX = Math.min(FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_X, surfaceSize.width / 2)
    const maxX = Math.max(surfaceSize.width - FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_X, minX)
    const minY = Math.min(FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_Y, surfaceSize.height / 2)
    const maxY = Math.max(surfaceSize.height - FLOORPLAN_GUIDE_HANDLE_HINT_PADDING_Y, minY)

    return {
      x: clamp(handleX + directionX * FLOORPLAN_GUIDE_HANDLE_HINT_OFFSET, minX, maxX),
      y: clamp(handleY + directionY * FLOORPLAN_GUIDE_HANDLE_HINT_OFFSET, minY, maxY),
      directionX,
      directionY,
    }
  }, [
    hoveredGuideCorner,
    floorplanSceneRotationDeg,
    selectedGuide,
    selectedGuideDimensions,
    surfaceSize,
    surfaceSize.height,
    surfaceSize.width,
    viewBox,
  ])

  const minViewportWidth = fittedViewport.width * MIN_VIEWPORT_WIDTH_RATIO
  const maxViewportWidth = fittedViewport.width * MAX_VIEWPORT_WIDTH_RATIO

  const palette = getFloorplanPalette(theme)
  const wallSelectionHatchId = useMemo(() => `floorplan-wall-selection-hatch-${theme}`, [theme])
  // Subset of the legacy palette surfaced to registry-driven kinds via
  // <FloorplanRenderProvider>. Mirrors `FloorplanPalette` in `@pascal-app/
  // core` 鈥?keep slot names + meanings in sync.
  const floorplanRegistryPalette = useMemo<FloorplanRenderContextValue['palette']>(
    () => ({
      selectedStroke: palette.selectedStroke,
      selectedFill: palette.selectedFill,
      selectedHatch: palette.selectedStroke,
      wallHoverStroke: palette.wallHoverStroke,
      endpointHandleFill: palette.endpointHandleFill,
      endpointHandleStroke: palette.endpointHandleStroke,
      endpointHandleHoverStroke: palette.endpointHandleHoverStroke,
      endpointHandleActiveFill: palette.endpointHandleActiveFill,
      endpointHandleActiveStroke: palette.endpointHandleActiveStroke,
      curveHandleFill: palette.curveHandleFill,
      curveHandleStroke: palette.curveHandleStroke,
      curveHandleHoverStroke: palette.curveHandleHoverStroke,
      measurementStroke: palette.measurementStroke,
      measurementLabelBackground: theme === 'dark' ? '#0f172a' : '#ffffff',
      measurementLabelText: theme === 'dark' ? '#e2e8f0' : '#171717',
    }),
    [palette, theme],
  )
  const slabSelectionHatchId = useMemo(() => `floorplan-slab-selection-hatch-${theme}`, [theme])
  const gridSteps = useMemo(
    () => getVisibleGridSteps(viewBox.width, surfaceSize.width),
    [surfaceSize.width, viewBox.width],
  )
  const gridBounds = useMemo(
    () => getRotatedViewBoxBounds(viewBox, floorplanSceneRotationDeg),
    [floorplanSceneRotationDeg, viewBox],
  )

  const minorGridPath = useMemo(
    () =>
      buildGridPath(
        gridBounds.minX,
        gridBounds.maxX,
        gridBounds.minY,
        gridBounds.maxY,
        gridSteps.minorStep,
        {
          excludeStep: gridSteps.majorStep,
        },
      ),
    [gridBounds, gridSteps.majorStep, gridSteps.minorStep],
  )
  const majorGridPath = useMemo(
    () =>
      buildGridPath(
        gridBounds.minX,
        gridBounds.maxX,
        gridBounds.minY,
        gridBounds.maxY,
        gridSteps.majorStep,
      ),
    [gridBounds, gridSteps.majorStep],
  )
  const floorplanUnitsPerPixel = viewBox.width / Math.max(surfaceSize.width, 1)
  floorplanUnitsPerPixelRef.current = floorplanUnitsPerPixel

  useEffect(() => {
    setReferenceScaleUnit(unit === 'imperial' ? 'feet' : 'meters')
  }, [unit])

  const startReferenceScaleForGuide = useCallback(
    (guideId: GuideNode['id']) => {
      const guide = guideById.get(guideId)
      if (!guide) {
        return
      }

      setReferenceScaleDraft({
        guideId: guide.id,
        start: null,
        cursor: null,
      })
      setPendingReferenceScale(null)
      setMode('select')
      setFloorplanSelectionTool('click')
      setShowGuides(true)
      setSelection({ selectedIds: [], zoneId: null })
      setSelectedReferenceId(guide.id)
    },
    [
      guideById,
      setFloorplanSelectionTool,
      setMode,
      setSelectedReferenceId,
      setSelection,
      setShowGuides,
    ],
  )

  useEffect(() => {
    const handleSetReferenceScale = (payload: { guideId?: GuideNode['id'] }) => {
      if (payload.guideId) {
        startReferenceScaleForGuide(payload.guideId)
      }
    }

    guideEmitter.on('guide:set-reference-scale', handleSetReferenceScale)
    return () => {
      guideEmitter.off('guide:set-reference-scale', handleSetReferenceScale)
    }
  }, [startReferenceScaleForGuide])

  useEffect(() => {
    const handleCancel = () => {
      setReferenceScaleDraft(null)
      setPendingReferenceScale(null)
    }

    guideEmitter.on('guide:cancel-reference-scale', handleCancel)
    return () => {
      guideEmitter.off('guide:cancel-reference-scale', handleCancel)
    }
  }, [])

  useEffect(() => {
    const handleDeleted = (payload: { guideId?: GuideNode['id'] }) => {
      if (!payload.guideId) {
        return
      }

      setReferenceScaleDraft((current) => (current?.guideId === payload.guideId ? null : current))
      setPendingReferenceScale((current) => (current?.guideId === payload.guideId ? null : current))
      clearGuideUi(payload.guideId)
    }

    guideEmitter.on('guide:deleted', handleDeleted)
    return () => {
      guideEmitter.off('guide:deleted', handleDeleted)
    }
  }, [clearGuideUi])

  const handleReferenceScaleConfirm = useCallback(() => {
    if (!pendingReferenceScale) {
      return
    }

    const guide = guideById.get(pendingReferenceScale.guideId)
    if (!guide) {
      setPendingReferenceScale(null)
      return
    }

    const displayLength = Number(referenceScaleValue)
    if (!(displayLength > 0)) {
      return
    }

    const realLengthMeters = convertReferenceLengthToMeters(displayLength, referenceScaleUnit)
    const requestedScaleFactor = realLengthMeters / pendingReferenceScale.measuredLengthUnits
    const currentGuideScale = guide.scale > 0 ? guide.scale : 1
    const nextGuideScale = Math.max(
      currentGuideScale * requestedScaleFactor,
      FLOORPLAN_GUIDE_MIN_SCALE,
    )
    const appliedScaleFactor = nextGuideScale / currentGuideScale
    const scaledEnd: WallPlanPoint = [
      pendingReferenceScale.start[0] +
        (pendingReferenceScale.end[0] - pendingReferenceScale.start[0]) * appliedScaleFactor,
      pendingReferenceScale.start[1] +
        (pendingReferenceScale.end[1] - pendingReferenceScale.start[1]) * appliedScaleFactor,
    ]
    const scaledMeasuredLengthUnits = Math.hypot(
      scaledEnd[0] - pendingReferenceScale.start[0],
      scaledEnd[1] - pendingReferenceScale.start[1],
    )
    const nextGuidePosition: GuideNode['position'] = [
      pendingReferenceScale.start[0] +
        (guide.position[0] - pendingReferenceScale.start[0]) * appliedScaleFactor,
      guide.position[1],
      pendingReferenceScale.start[1] +
        (guide.position[2] - pendingReferenceScale.start[1]) * appliedScaleFactor,
    ]
    const metersPerUnit =
      scaledMeasuredLengthUnits > 0 ? realLengthMeters / scaledMeasuredLengthUnits : 1

    updateNode(
      pendingReferenceScale.guideId as AnyNodeId,
      {
        position: nextGuidePosition,
        scale: nextGuideScale,
        scaleReference: {
          start: pendingReferenceScale.start,
          end: scaledEnd,
          realLengthMeters,
          measuredLengthUnits: scaledMeasuredLengthUnits,
          metersPerUnit,
          label: formatReferenceScaleLabel(displayLength, referenceScaleUnit),
        },
      } as Partial<GuideNode>,
    )
    setGuideLocked(pendingReferenceScale.guideId, true)
    setGuideScaleReferenceVisible(pendingReferenceScale.guideId, true)
    setSelectedReferenceId(pendingReferenceScale.guideId)
    setPendingReferenceScale(null)
  }, [
    guideById,
    pendingReferenceScale,
    referenceScaleUnit,
    referenceScaleValue,
    setGuideLocked,
    setGuideScaleReferenceVisible,
    setSelectedReferenceId,
    updateNode,
  ])

  const previewElevatorResize = useCallback(
    (dragState: ElevatorResizeDragState, planPoint: WallPlanPoint) => {
      const localDeltaX = planPoint[0] - dragState.center.x
      const localDeltaY = planPoint[1] - dragState.center.y
      const [localX, localY] = rotatePlanVector(localDeltaX, localDeltaY, -dragState.rotation)
      const axis = getElevatorResizeAxis(dragState.handle)
      const sign = getElevatorResizeSign(dragState.handle)
      const localDistance = sign * (axis === 'width' ? localX : localY)
      const nextOuterSize = Math.max(0.1, localDistance) * 2

      if (axis === 'width') {
        const nextShaftWidth = roundPlanMeters(
          Math.max(0.8, nextOuterSize - dragState.shaftWallThickness * 2),
        )
        const nextCabWidth = nextShaftWidth
        useLiveNodeOverrides
          .getState()
          .set(dragState.elevatorId, { shaftWidth: nextShaftWidth, width: nextCabWidth })
        setCursorPoint(planPoint)
        return { shaftWidth: nextShaftWidth, width: nextCabWidth } satisfies Partial<ElevatorNode>
      }

      const nextShaftDepth = roundPlanMeters(
        Math.max(0.8, nextOuterSize - dragState.shaftWallThickness * 2),
      )
      const nextCabDepth = nextShaftDepth
      useLiveNodeOverrides
        .getState()
        .set(dragState.elevatorId, { depth: nextCabDepth, shaftDepth: nextShaftDepth })
      setCursorPoint(planPoint)
      return { depth: nextCabDepth, shaftDepth: nextShaftDepth } satisfies Partial<ElevatorNode>
    },
    [],
  )

  const handleElevatorResizePointerDown = useCallback(
    (
      entry: FloorplanElevatorEntry,
      handle: ElevatorResizeHandle,
      event: ReactPointerEvent<SVGCircleElement>,
    ) => {
      if (event.button !== 0 || mode !== 'select') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      setHoveredElevatorId(null)
      setSelection({ selectedIds: [entry.elevator.id] })

      setElevatorResizeDragState({
        center: entry.center,
        elevatorId: entry.elevator.id,
        handle,
        pointerId: event.pointerId,
        rotation: entry.rotation,
        shaftWallThickness: entry.shaftWallThickness,
      })
    },
    [mode, setSelection],
  )

  const handleElevatorResizePointerMove = useCallback(
    (event: ReactPointerEvent<SVGCircleElement>) => {
      const dragState = elevatorResizeDragState
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      previewElevatorResize(dragState, planPoint)
    },
    [elevatorResizeDragState, getPlanPointFromClientPoint, previewElevatorResize],
  )

  const handleElevatorResizePointerUp = useCallback(
    (event: ReactPointerEvent<SVGCircleElement>) => {
      const dragState = elevatorResizeDragState
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      const updates = planPoint ? previewElevatorResize(dragState, planPoint) : {}

      event.preventDefault()
      event.stopPropagation()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      useLiveNodeOverrides.getState().clear(dragState.elevatorId)
      if (Object.keys(updates).length > 0) {
        updateNode(dragState.elevatorId as AnyNodeId, updates)
      }
      setElevatorResizeDragState(null)
      setCursorPoint(null)
    },
    [elevatorResizeDragState, getPlanPointFromClientPoint, previewElevatorResize, updateNode],
  )

  const publishFloorplanNavigationPose = useCallback(
    (nextViewport: FloorplanViewport, userRotationDeg: number) => {
      if (!(nextViewport.width > 0)) {
        return
      }

      const localCenter = rotateSvgPoint(
        {
          x: nextViewport.centerX,
          y: nextViewport.centerY,
        },
        -(FLOORPLAN_VIEW_ROTATION_DEG + userRotationDeg - buildingRotationDeg),
      )
      const worldCenter = floorplanLocalToWorldPoint(
        localCenter,
        buildingPosition,
        buildingRotationY,
      )
      const targetY = latestNavigationSyncPoseRef.current?.target[1] ?? buildingPosition[1]

      useEditor.getState().publishNavigationSyncPose({
        source: '2d',
        target: [worldCenter.x, targetY, worldCenter.z],
        azimuth: cameraAzimuthFromFloorplanRotation(userRotationDeg),
        viewWidth: nextViewport.width,
      })
    },
    [buildingPosition, buildingRotationDeg, buildingRotationY],
  )

  const updateViewport = useCallback(
    (nextViewport: FloorplanViewport) => {
      hasUserAdjustedViewportRef.current = true
      setViewport(nextViewport)
      publishFloorplanNavigationPose(nextViewport, floorplanUserRotationDeg)
    },
    [floorplanUserRotationDeg, publishFloorplanNavigationPose],
  )

  const syncFloorplanViewportToNavigationPose = useCallback(
    (pose: NavigationSyncPose) => {
      const nextUserRotationDeg = floorplanRotationFromCameraAzimuth(
        pose.azimuth,
        floorplanUserRotationDeg,
      )
      const localCenter = worldToFloorplanLocalPoint(
        pose.target[0],
        pose.target[2],
        buildingPosition,
        buildingRotationY,
      )
      const nextSceneRotationDeg =
        FLOORPLAN_VIEW_ROTATION_DEG + nextUserRotationDeg - buildingRotationDeg
      const centerSvg = rotateSvgPoint(localCenter, nextSceneRotationDeg)
      const nextViewport = {
        centerX: centerSvg.x,
        centerY: centerSvg.y,
        width: pose.viewWidth,
      }

      hasUserAdjustedViewportRef.current = true
      setFloorplanUserRotationDeg(nextUserRotationDeg)
      setViewport((current) =>
        floorplanViewportEquals(current, nextViewport) ? current : nextViewport,
      )
    },
    [buildingPosition, buildingRotationDeg, buildingRotationY, floorplanUserRotationDeg],
  )

  useEffect(() => {
    const pose = useEditor.getState().navigationSyncPose
    if (pose?.source === '3d') {
      latestNavigationSyncPoseRef.current = pose
      syncFloorplanViewportToNavigationPose(pose)
    }
  }, [syncFloorplanViewportToNavigationPose])

  useEffect(() => {
    return useEditor.subscribe((state) => {
      const pose = state.navigationSyncPose
      if (!pose || latestNavigationSyncPoseRef.current?.revision === pose.revision) {
        return
      }

      latestNavigationSyncPoseRef.current = pose
      if (pose.source === '3d') {
        syncFloorplanViewportToNavigationPose(pose)
      }
    })
  }, [syncFloorplanViewportToNavigationPose])

  const alignFloorplanViewToNorth = useCallback(() => {
    const currentViewport = latestViewportRef.current ?? latestFittedViewportRef.current
    if (!currentViewport) {
      return
    }

    const nextUserRotationDeg = nearestEquivalentDegrees(0, floorplanUserRotationDeg)
    const currentSceneRotationDeg =
      FLOORPLAN_VIEW_ROTATION_DEG + floorplanUserRotationDeg - buildingRotationDeg
    const localCenter = rotateSvgPoint(
      {
        x: currentViewport.centerX,
        y: currentViewport.centerY,
      },
      -currentSceneRotationDeg,
    )
    const nextSceneRotationDeg =
      FLOORPLAN_VIEW_ROTATION_DEG + nextUserRotationDeg - buildingRotationDeg
    const nextCenter = rotateSvgPoint(localCenter, nextSceneRotationDeg)
    const nextViewport = {
      ...currentViewport,
      centerX: nextCenter.x,
      centerY: nextCenter.y,
    }

    hasUserAdjustedViewportRef.current = true
    setFloorplanUserRotationDeg(nextUserRotationDeg)
    setViewport(nextViewport)
    publishFloorplanNavigationPose(nextViewport, nextUserRotationDeg)
  }, [buildingRotationDeg, floorplanUserRotationDeg, publishFloorplanNavigationPose])

  useEffect(() => {
    if (!canInteractWithGuides) {
      clearGuideInteraction()
    }
  }, [canInteractWithGuides, clearGuideInteraction])

  const zoomViewportAtClientPoint = useCallback(
    (clientX: number, clientY: number, widthFactor: number) => {
      const svgPoint = getSvgPointFromClientPoint(clientX, clientY)
      if (!svgPoint) {
        return
      }

      const nextViewport = zoomFloorplanViewportAtPoint({
        currentViewport: viewport ?? fittedViewport,
        currentViewBox: viewBox,
        maxViewportWidth,
        minViewportWidth,
        svgAspectRatio,
        svgPoint,
        widthFactor,
      })

      if (nextViewport) {
        updateViewport(nextViewport)
      }
    },
    [
      fittedViewport,
      getSvgPointFromClientPoint,
      maxViewportWidth,
      minViewportWidth,
      svgAspectRatio,
      updateViewport,
      viewBox,
      viewport,
    ],
  )

  const clearWallPlacementDraft = useCallback(() => {
    setDraftStart(null)
    setDraftEnd(null)
  }, [])
  const clearFencePlacementDraft = useCallback(() => {
    setFenceDraftStart(null)
    setFenceDraftEnd(null)
  }, [])
  const clearRoofPlacementDraft = useCallback(() => {
    setRoofDraftStart(null)
    setRoofDraftEnd(null)
  }, [])
  const clearCeilingPlacementDraft = useCallback(() => {
    setCeilingDraftPoints([])
  }, [])
  const clearSlabPlacementDraft = useCallback(() => {
    setSlabDraftPoints([])
  }, [])
  const clearZonePlacementDraft = useCallback(() => {
    setZoneDraftPoints([])
  }, [])

  const clearWallEndpointDrag = useCallback(() => {
    clearWallEndpointDragState()
    setHoveredEndpointId(null)
  }, [clearWallEndpointDragState])
  const clearWallCurveDrag = useCallback(() => {
    clearWallCurveDragState()
    setHoveredWallCurveHandleId(null)
  }, [clearWallCurveDragState])

  const clearDraft = useCallback(() => {
    clearWallPlacementDraft()
    clearFencePlacementDraft()
    clearRoofPlacementDraft()
    clearCeilingPlacementDraft()
    clearSlabPlacementDraft()
    clearZonePlacementDraft()
    clearWallEndpointDrag()
    clearWallCurveDrag()
    clearSiteBoundaryInteraction()
    setCursorPoint(null)
  }, [
    clearFencePlacementDraft,
    clearCeilingPlacementDraft,
    clearRoofPlacementDraft,
    clearWallCurveDrag,
    clearSiteBoundaryInteraction,
    clearSlabPlacementDraft,
    clearWallEndpointDrag,
    clearWallPlacementDraft,
    clearZonePlacementDraft,
  ])

  useEffect(() => {
    if (isWallBuildActive || isFenceBuildActive || isRoofBuildActive || isPolygonDraftBuildActive) {
      return
    }

    clearDraft()
  }, [
    clearDraft,
    isFenceBuildActive,
    isPolygonDraftBuildActive,
    isRoofBuildActive,
    isWallBuildActive,
  ])

  useEffect(() => {
    const handleCancel = () => {
      clearDraft()
    }

    emitter.on('tool:cancel', handleCancel)
    return () => {
      emitter.off('tool:cancel', handleCancel)
    }
  }, [clearDraft])

  const createSlabOnCurrentLevel = useCallback(
    (points: WallPlanPoint[]) => {
      if (!levelId) {
        return null
      }

      const { createNode, nodes } = useScene.getState()
      const slabCount = Object.values(nodes).filter((node) => node.type === 'slab').length
      const slab = SlabNode.parse({
        name: `Slab ${slabCount + 1}`,
        polygon: points.map(([x, z]) => [x, z] as [number, number]),
      })

      createNode(slab, levelId)
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ selectedIds: [slab.id] })
      return slab.id
    },
    [levelId, setSelection],
  )
  const createZoneOnCurrentLevel = useCallback(
    (points: WallPlanPoint[]) => {
      if (!levelId) {
        return null
      }

      const { createNode, nodes } = useScene.getState()
      const zoneCount = Object.values(nodes).filter((node) => node.type === 'zone').length
      const zone = ZoneNodeSchema.parse({
        color: PALETTE_COLORS[zoneCount % PALETTE_COLORS.length],
        name: `Zone ${zoneCount + 1}`,
        polygon: points.map(([x, z]) => [x, z] as [number, number]),
      })

      createNode(zone, levelId)
      sfxEmitter.emit('sfx:structure-build')
      setSelection({ zoneId: zone.id })
      return zone.id
    },
    [levelId, setSelection],
  )

  useEffect(() => {
    if (!isStairBuildActive) {
      setStairBuildPreviewPoint(null)
      setStairBuildPreviewRotation(0)
      return
    }

    const handleGridMove = (event: GridEvent) => {
      setStairBuildPreviewPoint(
        getSnappedFloorplanPoint([event.localPosition[0], event.localPosition[2]]),
      )
    }

    emitter.on('grid:move', handleGridMove)

    return () => {
      emitter.off('grid:move', handleGridMove)
    }
  }, [isStairBuildActive])

  useEffect(() => {
    if (!isColumnBuildActive) {
      setColumnBuildPreviewPoint(null)
      return
    }

    const handleGridMove = (event: GridEvent) => {
      setColumnBuildPreviewPoint(
        getSnappedFloorplanPoint([event.localPosition[0], event.localPosition[2]]),
      )
    }

    emitter.on('grid:move', handleGridMove)

    return () => {
      emitter.off('grid:move', handleGridMove)
    }
  }, [isColumnBuildActive])

  useEffect(() => {
    if (!isItemPlacementPreviewActive) {
      return
    }

    const refreshFloorplanItemPreview = () => {
      scheduleMovingFloorplanNodeRefresh()
    }

    emitter.on('grid:move', refreshFloorplanItemPreview)
    emitter.on('wall:enter', refreshFloorplanItemPreview as any)
    emitter.on('wall:move', refreshFloorplanItemPreview as any)
    emitter.on('wall:leave', refreshFloorplanItemPreview as any)
    emitter.on('ceiling:enter', refreshFloorplanItemPreview as any)
    emitter.on('ceiling:move', refreshFloorplanItemPreview as any)
    emitter.on('ceiling:leave', refreshFloorplanItemPreview as any)
    emitter.on('item:enter', refreshFloorplanItemPreview as any)
    emitter.on('item:move', refreshFloorplanItemPreview as any)
    emitter.on('item:leave', refreshFloorplanItemPreview as any)

    return () => {
      emitter.off('grid:move', refreshFloorplanItemPreview)
      emitter.off('wall:enter', refreshFloorplanItemPreview as any)
      emitter.off('wall:move', refreshFloorplanItemPreview as any)
      emitter.off('wall:leave', refreshFloorplanItemPreview as any)
      emitter.off('ceiling:enter', refreshFloorplanItemPreview as any)
      emitter.off('ceiling:move', refreshFloorplanItemPreview as any)
      emitter.off('ceiling:leave', refreshFloorplanItemPreview as any)
      emitter.off('item:enter', refreshFloorplanItemPreview as any)
      emitter.off('item:move', refreshFloorplanItemPreview as any)
      emitter.off('item:leave', refreshFloorplanItemPreview as any)
    }
  }, [isItemPlacementPreviewActive, scheduleMovingFloorplanNodeRefresh])

  useEffect(() => {
    if (!hasPendingItemMeshFootprints) {
      return
    }

    scheduleMovingFloorplanNodeRefresh()
  }, [scheduleMovingFloorplanNodeRefresh])

  // Subscribe to the live-transforms store so rotation/position changes that
  // *don't* go through pointer events still refresh the floorplan 鈥?e.g. R/T
  // keyboard rotation during placement updates `useLiveTransforms` but emits
  // no grid:move, so without this the floorplan was stale until the user
  // moved the cursor.
  useEffect(() => {
    if (!isItemPlacementPreviewActive) return
    const unsubscribe = useLiveTransforms.subscribe((state, prev) => {
      if (state.transforms !== prev.transforms) {
        scheduleMovingFloorplanNodeRefresh()
      }
    })
    return unsubscribe
  }, [isItemPlacementPreviewActive, scheduleMovingFloorplanNodeRefresh])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable)

      if (isEditableTarget) {
        return
      }

      if (event.key === 'Shift') {
        setShiftPressed(true)
      }

      if (isStairBuildActive && (event.key === 'r' || event.key === 'R')) {
        setStairBuildPreviewRotation((current) => current + Math.PI / 4)
      } else if (isStairBuildActive && (event.key === 't' || event.key === 'T')) {
        setStairBuildPreviewRotation((current) => current - Math.PI / 4)
      }

      if (
        movingNode &&
        isRegistryMovable(movingNode.type) &&
        (event.key === 'r' || event.key === 'R' || event.key === 't' || event.key === 'T')
      ) {
        bumpMovingFloorplanNodeRevision()
      }

      setRotationModifierPressed(
        event.key === 'Meta' || event.key === 'Control' || event.metaKey || event.ctrlKey,
      )
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setShiftPressed(false)
      }

      setRotationModifierPressed(event.metaKey || event.ctrlKey)
    }
    const handleBlur = () => {
      setShiftPressed(false)
      setRotationModifierPressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [bumpMovingFloorplanNodeRevision, isStairBuildActive, movingNode])

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (
        updateGuideInteractionDraft({
          event,
          getSvgPointFromClientPoint,
          shiftPressed,
        })
      ) {
        return
      }

      const pendingFenceDrag = pendingFenceDragRef.current
      if (pendingFenceDrag && event.pointerId === pendingFenceDrag.pointerId) {
        const dragDistance = Math.hypot(
          event.clientX - pendingFenceDrag.startClientX,
          event.clientY - pendingFenceDrag.startClientY,
        )

        if (dragDistance < FLOORPLAN_MARQUEE_DRAG_THRESHOLD_PX) {
          return
        }

        pendingFenceDragRef.current = null

        const fenceNode = useScene.getState().nodes[pendingFenceDrag.fenceId as AnyNodeId]
        if (!(fenceNode && fenceNode.type === 'fence')) {
          return
        }

        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopImmediatePropagation()
          clickEvent.preventDefault()
          window.removeEventListener('click', suppressClick, true)
        }
        window.addEventListener('click', suppressClick, true)
        requestAnimationFrame(() => {
          window.removeEventListener('click', suppressClick, true)
        })

        sfxEmitter.emit('sfx:item-pick')
        setMovingNode(fenceNode)
        setSelection({ selectedIds: [] })
        return
      }

      if (
        updateWallEndpointDrag({
          event,
          getPlanPointFromClientPoint,
          onCursorPointChange: setCursorPoint,
          shiftPressed,
          walls,
        })
      ) {
        return
      }

      if (
        updateWallCurveDrag({
          event,
          getPlanPointFromClientPoint,
          onCursorPointChange: setCursorPoint,
          shiftPressed,
          wallById,
        })
      ) {
        return
      }
    }

    const commitActiveGuideInteraction = (event: PointerEvent) => {
      commitGuideInteraction({
        event,
        getSvgPointFromClientPoint,
        shiftPressed,
        updateGuideNode: updateNode,
      })
    }

    const commitWallEndpointDrag = (event: PointerEvent) => {
      commitWallEndpointDragState({
        event,
        onDone: () => {
          setHoveredEndpointId(null)
          setCursorPoint(null)
        },
        wallById,
      })
    }

    const commitWallCurveDrag = (event: PointerEvent) => {
      commitWallCurveDragState({
        event,
        onDone: () => {
          setHoveredWallCurveHandleId(null)
          setCursorPoint(null)
        },
        updateWallNode: updateNode,
        wallById,
      })
    }

    const cancelWallEndpointDrag = (event: PointerEvent) => {
      cancelWallEndpointDragState(event, () => {
        setHoveredEndpointId(null)
        setCursorPoint(null)
      })
    }

    const cancelWallCurveDrag = (event: PointerEvent) => {
      cancelWallCurveDragState(event, () => {
        setHoveredWallCurveHandleId(null)
        setCursorPoint(null)
      })
    }

    const clearPendingFenceDrag = (event: PointerEvent) => {
      const pendingFenceDrag = pendingFenceDragRef.current
      if (!pendingFenceDrag || event.pointerId !== pendingFenceDrag.pointerId) {
        return
      }

      pendingFenceDragRef.current = null
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', clearPendingFenceDrag)
    window.addEventListener('pointercancel', clearPendingFenceDrag)
    window.addEventListener('pointerup', commitActiveGuideInteraction)
    window.addEventListener('pointercancel', cancelGuideInteraction)
    window.addEventListener('pointerup', commitWallEndpointDrag)
    window.addEventListener('pointercancel', cancelWallEndpointDrag)
    window.addEventListener('pointerup', commitWallCurveDrag)
    window.addEventListener('pointercancel', cancelWallCurveDrag)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', clearPendingFenceDrag)
      window.removeEventListener('pointercancel', clearPendingFenceDrag)
      window.removeEventListener('pointerup', commitActiveGuideInteraction)
      window.removeEventListener('pointercancel', cancelGuideInteraction)
      window.removeEventListener('pointerup', commitWallEndpointDrag)
      window.removeEventListener('pointercancel', cancelWallEndpointDrag)
      window.removeEventListener('pointerup', commitWallCurveDrag)
      window.removeEventListener('pointercancel', cancelWallCurveDrag)
    }
  }, [
    cancelWallCurveDragState,
    cancelGuideInteraction,
    cancelWallEndpointDragState,
    commitGuideInteraction,
    commitWallCurveDragState,
    commitWallEndpointDragState,
    getSvgPointFromClientPoint,
    getPlanPointFromClientPoint,
    setMovingNode,
    setSelection,
    shiftPressed,
    updateNode,
    updateGuideInteractionDraft,
    updateWallCurveDrag,
    updateWallEndpointDrag,
    wallById,
    walls,
  ])

  useEffect(() => {
    pendingFenceDragRef.current = null
    clearWallEndpointDrag()
    clearWallCurveDrag()
  }, [clearWallCurveDrag, clearWallEndpointDrag])

  useEffect(() => {
    return () => {
      setFloorplanHovered(false)
    }
  }, [setFloorplanHovered])

  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 2) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    panStateRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    }
    setIsPanning(true)

    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const endPanning = useCallback((event?: ReactPointerEvent<SVGSVGElement>) => {
    if (event && panStateRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    panStateRef.current = null
    setIsPanning(false)
  }, [])

  const {
    emitFloorplanGridEvent,
    emitFloorplanWallLeave,
    floorplanGridLocalY,
    floorplanGridWorldY,
  } = useFloorplanGridEvents({
    buildingPosition,
    buildingRotationY,
    getSnappedFloorplanPoint,
    levelId,
    movingNode,
  })
  const { clearOpeningWallHover, updateOpeningWallHover } = useOpeningWallHover({
    emitFloorplanWallLeave,
    floorplanOpeningLocalY,
    walls,
  })
  const handleBuildPointerMove = useFloorplanBuildPointerMove({
    activePolygonDraftPoints,
    ceilingDraftPoints,
    emitFloorplanGridEvent,
    fences,
    fenceDraftStart,
    getSnappedFloorplanPoint,
    isCeilingBuildActive,
    isFenceBuildActive,
    isFloorplanGridInteractionActive,
    isPolygonBuildActive,
    isRoofBuildActive,
    isWallBuildActive,
    referenceScaleDraft,
    roofDraftStart,
    setCursorPoint,
    setFenceDraftEnd,
    setReferenceScaleDraft,
    setRoofDraftEnd,
    shiftPressed,
    walls,
  })
  const handleWallBuildPointerMove = useWallBuildPointerMove({
    draftStart,
    emitFloorplanGridEvent,
    isWallBuildActive,
    setCursorPoint,
    setDraftEnd,
    shiftPressed,
    walls,
  })

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (panStateRef.current?.pointerId === event.pointerId) {
        const deltaX = event.clientX - panStateRef.current.clientX
        const deltaY = event.clientY - panStateRef.current.clientY

        updateViewport(
          panFloorplanViewport(viewport ?? fittedViewport, viewBox, surfaceSize, {
            x: deltaX,
            y: deltaY,
          }),
        )

        panStateRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        }
        setCursorPoint(null)
        return
      }

      if (guideInteractionRef.current?.pointerId === event.pointerId) {
        return
      }

      if (elevatorResizeDragState?.pointerId === event.pointerId) {
        return
      }

      if (isWallEndpointDragPointer(event.pointerId)) {
        return
      }

      if (siteVertexDragState?.pointerId === event.pointerId) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      if (handleBuildPointerMove(event, planPoint)) {
        return
      }

      if (isOpeningPlacementActive) {
        updateOpeningWallHover(planPoint)
        return
      }

      if (isMarqueeSelectionToolActive) {
        setCursorPoint((previousPoint) => {
          const snappedPoint = getSnappedFloorplanPoint(planPoint)
          return previousPoint && pointsEqual(previousPoint, snappedPoint)
            ? previousPoint
            : snappedPoint
        })
        return
      }

      if (handleWallBuildPointerMove(event, planPoint)) {
        return
      }

      setCursorPoint(null)
    },
    [
      fittedViewport,
      getPlanPointFromClientPoint,
      handleBuildPointerMove,
      handleWallBuildPointerMove,
      isMarqueeSelectionToolActive,
      isOpeningPlacementActive,
      isWallEndpointDragPointer,
      elevatorResizeDragState,
      siteVertexDragState,
      surfaceSize,
      updateViewport,
      updateOpeningWallHover,
      viewBox,
      viewport,
    ],
  )

  const handleSlabPlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      const action = getPolygonDraftPointAction(slabDraftPoints, point)
      if (action.type === 'ignore') {
        return
      }

      if (action.type === 'complete') {
        createSlabOnCurrentLevel(action.points)
        clearDraft()
        return
      }

      setSlabDraftPoints(action.points)
      setCursorPoint(point)
    },
    [clearDraft, createSlabOnCurrentLevel, slabDraftPoints],
  )
  const handleSlabPlacementConfirm = useCallback(
    (point?: WallPlanPoint) => {
      const nextPoints = getConfirmedPolygonDraftPoints(slabDraftPoints, point)
      if (!nextPoints) {
        return
      }

      createSlabOnCurrentLevel(nextPoints)
      clearDraft()
    },
    [clearDraft, createSlabOnCurrentLevel, slabDraftPoints],
  )
  const handleCeilingPlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      const action = getPolygonDraftPointAction(ceilingDraftPoints, point)
      if (action.type === 'ignore') {
        return
      }

      if (action.type === 'complete') {
        clearCeilingPlacementDraft()
        return
      }

      setCeilingDraftPoints(action.points)
      setCursorPoint(point)
    },
    [ceilingDraftPoints, clearCeilingPlacementDraft],
  )
  const handleCeilingPlacementConfirm = useCallback(
    (point?: WallPlanPoint) => {
      if (!getConfirmedPolygonDraftPoints(ceilingDraftPoints, point)) {
        return
      }

      clearCeilingPlacementDraft()
    },
    [ceilingDraftPoints, clearCeilingPlacementDraft],
  )
  const handleZonePlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      const action = getPolygonDraftPointAction(zoneDraftPoints, point)
      if (action.type === 'ignore') {
        return
      }

      if (action.type === 'complete') {
        createZoneOnCurrentLevel(action.points)
        clearDraft()
        return
      }

      setZoneDraftPoints(action.points)
      setCursorPoint(point)
    },
    [clearDraft, createZoneOnCurrentLevel, zoneDraftPoints],
  )
  const handleZonePlacementConfirm = useCallback(
    (point?: WallPlanPoint) => {
      const nextPoints = getConfirmedPolygonDraftPoints(zoneDraftPoints, point)
      if (!nextPoints) {
        return
      }

      createZoneOnCurrentLevel(nextPoints)
      clearDraft()
    },
    [clearDraft, createZoneOnCurrentLevel, zoneDraftPoints],
  )

  const handleWallPlacementPoint = useCallback(
    (point: WallPlanPoint) => {
      if (!draftStart) {
        setDraftStart(point)
        setDraftEnd(point)
        setCursorPoint(point)
        return
      }

      if (!isWallLongEnough(draftStart, point)) {
        return
      }

      createWallOnCurrentLevel(draftStart, point)
      clearDraft()
    },
    [clearDraft, draftStart],
  )
  const { getFloorplanHitIdAtPoint, getFloorplanSelectionIdsInBounds } = useFloorplanHitTesting({
    ceilingPolygons: displayCeilingPolygons,
    columnPolygons: floorplanColumnEntries,
    displaySlabPolygons,
    displayWallPolygons,
    floorplanElevatorEntries,
    floorplanItemEntries,
    floorplanOpeningHitTolerance,
    floorplanRoofEntries,
    floorplanStairEntries,
    floorplanWallHitTolerance,
    getOpeningCenterLine,
    isFloorplanItemContextActive,
    openingsPolygons,
    phase,
    toPoint2D,
  })
  const { handleBackgroundPlacementClick } = useFloorplanBackgroundPlacement({
    activePolygonDraftPoints,
    ceilingDraftPoints,
    clearFencePlacementDraft,
    clearRoofPlacementDraft,
    emitFloorplanGridEvent,
    fenceDraftStart,
    fences,
    findClosestWallPoint,
    floorplanOpeningLocalY,
    getSnappedFloorplanPoint,
    handleCeilingPlacementPoint,
    handleSlabPlacementPoint,
    handleWallPlacementPoint,
    handleZonePlacementPoint,
    isCeilingBuildActive,
    isFenceBuildActive,
    isFloorplanGridInteractionActive,
    isOpeningPlacementActive,
    isPolygonBuildActive,
    isRoofBuildActive,
    isWallBuildActive,
    isZoneBuildActive,
    roofDraftStart,
    setCursorPoint,
    setFenceDraftEnd,
    setFenceDraftStart,
    setRoofDraftEnd,
    setRoofDraftStart,
    shiftPressed,
    snapPolygonDraftPoint,
    snapWallDraftPoint,
    toPoint2D,
    walls,
  })

  const handleBackgroundClick = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      if (isPolygonBuildActive && event.detail >= 2) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      if (referenceScaleDraft) {
        event.preventDefault()
        event.stopPropagation()

        emitFloorplanGridEvent('click', planPoint, event)

        if (!referenceScaleDraft.start) {
          setReferenceScaleDraft({
            ...referenceScaleDraft,
            start: planPoint,
            cursor: planPoint,
          })
          setCursorPoint(planPoint)
          return
        }

        const measuredLengthUnits = Math.hypot(
          planPoint[0] - referenceScaleDraft.start[0],
          planPoint[1] - referenceScaleDraft.start[1],
        )

        if (measuredLengthUnits < 1e-6) {
          return
        }

        setPendingReferenceScale({
          guideId: referenceScaleDraft.guideId,
          start: referenceScaleDraft.start,
          end: planPoint,
          measuredLengthUnits,
        })
        setReferenceScaleValue(formatNumber(measuredLengthUnits, 2))
        setReferenceScaleUnit(unit === 'imperial' ? 'feet' : 'meters')
        setReferenceScaleDraft(null)
        setCursorPoint(null)
        return
      }

      if (handleBackgroundPlacementClick(planPoint, event, draftStart)) {
        return
      }

      const modifierKeys = getSelectionModifierKeys(event)

      const backgroundSelection = resolveFloorplanBackgroundSelection({
        canSelectElementFloorplanGeometry,
        canSelectFloorplanZones,
        currentSelectedIds: useViewer.getState().selection.selectedIds,
        getFloorplanHitIdAtPoint,
        isWallBuildActive,
        modifierKeys,
        planPoint,
        structureLayer,
        toPoint2D,
        visibleZonePolygons,
      })

      if (backgroundSelection.handled) {
        setSelectedReferenceId(null)

        if (backgroundSelection.kind === 'select-zone') {
          setSelection({ zoneId: backgroundSelection.zoneId })
          return
        }

        if (backgroundSelection.kind === 'select-elements') {
          if (!(levelId && levelNode) || levelNode.type !== 'level') {
            setSelection({ selectedIds: backgroundSelection.selectedIds })
          } else {
            const { selection } = useViewer.getState()
            const nodes = useScene.getState().nodes
            const updates: Parameters<typeof setSelection>[0] = {
              selectedIds: backgroundSelection.selectedIds,
            }

            if (levelId !== selection.levelId) {
              updates.levelId = levelId
            }

            const parentNode = levelNode.parentId ? nodes[levelNode.parentId as AnyNodeId] : null
            if (parentNode?.type === 'building' && parentNode.id !== selection.buildingId) {
              updates.buildingId = parentNode.id
            }

            setSelection(updates)
          }
          return
        }

        if (backgroundSelection.kind === 'clear-zones') {
          setSelection({ zoneId: null })
          // Return to structure select (same as 3D grid click)
          useEditor.getState().setStructureLayer('elements')
          useEditor.getState().setMode('select')
          return
        }

        if (!backgroundSelection.preserveSelection) {
          setSelection({ selectedIds: [] })
        }
        return
      }
    },
    [
      draftStart,
      getPlanPointFromClientPoint,
      handleBackgroundPlacementClick,
      canSelectElementFloorplanGeometry,
      canSelectFloorplanZones,
      isPolygonBuildActive,
      isWallBuildActive,
      levelId,
      levelNode,
      referenceScaleDraft,
      setSelectedReferenceId,
      setSelection,
      structureLayer,
      getFloorplanHitIdAtPoint,
      unit,
      visibleZonePolygons,
      emitFloorplanGridEvent,
    ],
  )
  const handleBackgroundDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      if (!(isPolygonDraftBuildActive && !isRoofBuildActive)) {
        return
      }

      const planPoint = getPlanPointFromClientPoint(event.clientX, event.clientY)
      if (!planPoint) {
        return
      }

      const snappedPoint = snapPolygonDraftPoint({
        point: planPoint,
        start: activePolygonDraftPoints[activePolygonDraftPoints.length - 1],
        angleSnap: activePolygonDraftPoints.length > 0 && !shiftPressed,
      })

      if (isCeilingBuildActive) {
        emitFloorplanGridEvent('double-click', planPoint, event)
        handleCeilingPlacementConfirm(snappedPoint)
        return
      }

      if (isZoneBuildActive) {
        handleZonePlacementConfirm(snappedPoint)
      } else {
        handleSlabPlacementConfirm(snappedPoint)
      }
    },
    [
      activePolygonDraftPoints,
      emitFloorplanGridEvent,
      handleCeilingPlacementConfirm,
      getPlanPointFromClientPoint,
      handleSlabPlacementConfirm,
      handleZonePlacementConfirm,
      isCeilingBuildActive,
      isPolygonDraftBuildActive,
      isRoofBuildActive,
      isZoneBuildActive,
      shiftPressed,
    ],
  )

  const commitFloorplanSelection = useCallback(
    (nextSelectedIds: string[]) => {
      if (!(levelId && levelNode) || levelNode.type !== 'level') {
        setSelectedReferenceId(null)
        setSelection({ selectedIds: nextSelectedIds })
        return
      }

      const { selection } = useViewer.getState()
      const nodes = useScene.getState().nodes
      const updates: Parameters<typeof setSelection>[0] = {
        selectedIds: nextSelectedIds,
      }

      if (levelId !== selection.levelId) {
        updates.levelId = levelId
      }

      const parentNode = levelNode.parentId ? nodes[levelNode.parentId as AnyNodeId] : null
      if (parentNode?.type === 'building' && parentNode.id !== selection.buildingId) {
        updates.buildingId = parentNode.id
      }

      setSelectedReferenceId(null)
      setSelection(updates)
    },
    [levelId, levelNode, setSelectedReferenceId, setSelection],
  )

  const addFloorplanSelection = useCallback(
    (nextSelectedIds: string[], modifierKeys?: { meta: boolean; ctrl: boolean }) => {
      const shouldAppend = Boolean(modifierKeys?.meta || modifierKeys?.ctrl)

      if (shouldAppend) {
        if (nextSelectedIds.length === 0) {
          return
        }

        const currentSelectedIds = useViewer.getState().selection.selectedIds
        commitFloorplanSelection(Array.from(new Set([...currentSelectedIds, ...nextSelectedIds])))
        return
      }

      commitFloorplanSelection(nextSelectedIds)
    },
    [commitFloorplanSelection],
  )

  const toggleFloorplanSelection = useCallback(
    (nodeId: string, modifierKeys?: { meta: boolean; ctrl: boolean }) => {
      const shouldToggle = Boolean(modifierKeys?.meta || modifierKeys?.ctrl)

      if (shouldToggle) {
        const currentSelectedIds = useViewer.getState().selection.selectedIds
        commitFloorplanSelection(
          currentSelectedIds.includes(nodeId)
            ? currentSelectedIds.filter((selectedId) => selectedId !== nodeId)
            : [...currentSelectedIds, nodeId],
        )
        return
      }

      commitFloorplanSelection([nodeId])
    },
    [commitFloorplanSelection],
  )

  const syncPreviewSelectedIds = useCallback(
    (nextSelectedIds: string[]) => {
      const currentPreviewSelectedIds = useViewer.getState().previewSelectedIds
      if (haveSameIds(currentPreviewSelectedIds, nextSelectedIds)) {
        return
      }

      setPreviewSelectedIds(nextSelectedIds)
    },
    [setPreviewSelectedIds],
  )
  const {
    handleMarqueePointerCancel,
    handleMarqueePointerDown,
    handleMarqueePointerMove,
    handleMarqueePointerUp,
    visibleSvgMarqueeBounds,
  } = useFloorplanMarqueeInteraction({
    addFloorplanSelection,
    commitFloorplanSelection,
    getFloorplanHitIdAtPoint,
    getFloorplanSelectionIdsInBounds,
    getPlanPointFromClientPoint,
    getSnappedFloorplanPoint,
    isMarqueeSelectionToolActive,
    mode,
    setCursorPoint,
    setFloorplanCursorPosition,
    svgRef,
    syncPreviewSelectedIds,
    toggleFloorplanSelection,
  })

  const handleGuideSelect = useCallback(
    (guideId: GuideNode['id']) => {
      setSelectedReferenceId(guideId)
      setSelection({ selectedIds: [], zoneId: null })
    },
    [setSelectedReferenceId, setSelection],
  )
  const handleGuideCornerPointerDown = useCallback(
    (
      guide: GuideNode,
      dimensions: GuideImageDimensions,
      corner: GuideCorner,
      event: ReactPointerEvent<SVGCircleElement>,
    ) => {
      if (event.button !== 0 || !canInteractWithGuides || guideUi[guide.id]?.locked === true) {
        return
      }

      const aspectRatio = dimensions.width / dimensions.height
      if (!(aspectRatio > 0)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      setHoveredGuideCorner(null)
      handleGuideSelect(guide.id)

      const centerSvg = getGuideCenterSvgPoint(guide)
      const rotationSvg = getGuideSvgRotation(guide.rotation[1])
      const width = getGuideWidth(guide.scale)
      const height = getGuideHeight(width, aspectRatio)
      const [cornerOffsetX, cornerOffsetY] = getGuideCornerLocalOffset(width, height, corner)
      const shouldRotate = event.ctrlKey || event.metaKey

      guideInteractionRef.current = {
        pointerId: event.pointerId,
        guideId: guide.id,
        corner,
        mode: shouldRotate ? 'rotate' : 'resize',
        aspectRatio,
        centerSvg,
        oppositeCornerSvg: shouldRotate
          ? null
          : getGuideCornerSvgPoint(
              centerSvg,
              width,
              height,
              rotationSvg,
              oppositeGuideCorner[corner],
            ),
        pointerOffsetSvg: [0, 0],
        rotationSvg,
        cornerBaseAngle: Math.atan2(cornerOffsetY, cornerOffsetX),
        scale: guide.scale,
      }

      document.body.style.userSelect = 'none'
      document.body.style.cursor = shouldRotate
        ? getGuideRotateCursor(theme === 'dark')
        : getGuideResizeCursor(corner, rotationSvg)

      const nextDraft: GuideTransformDraft = {
        guideId: guide.id,
        position: [guide.position[0], guide.position[2]],
        scale: guide.scale,
        rotation: guide.rotation[1],
      }

      guideTransformDraftRef.current = nextDraft
      setGuideTransformDraft(nextDraft)
    },
    [canInteractWithGuides, guideUi, handleGuideSelect, setGuideTransformDraft, theme],
  )
  const handleGuideTranslateStart = useCallback(
    (guide: GuideNode, event: ReactPointerEvent<SVGRectElement>) => {
      if (
        event.button !== 0 ||
        !canInteractWithGuides ||
        selectedGuideId !== guide.id ||
        guideUi[guide.id]?.locked === true
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const svgPoint = getSvgPointFromClientPoint(event.clientX, event.clientY)
      if (!svgPoint) {
        return
      }

      const centerSvg = getGuideCenterSvgPoint(guide)

      guideInteractionRef.current = {
        pointerId: event.pointerId,
        guideId: guide.id,
        corner: 'nw',
        mode: 'translate',
        aspectRatio: 1,
        centerSvg,
        oppositeCornerSvg: null,
        pointerOffsetSvg: subtractSvgPoints(svgPoint, centerSvg),
        rotationSvg: getGuideSvgRotation(guide.rotation[1]),
        cornerBaseAngle: 0,
        scale: guide.scale,
      }

      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'

      const nextDraft: GuideTransformDraft = {
        guideId: guide.id,
        position: [guide.position[0], guide.position[2]],
        scale: guide.scale,
        rotation: guide.rotation[1],
      }

      guideTransformDraftRef.current = nextDraft
      setGuideTransformDraft(nextDraft)
    },
    [
      canInteractWithGuides,
      getSvgPointFromClientPoint,
      guideUi,
      selectedGuideId,
      setGuideTransformDraft,
    ],
  )

  const handlePointerLeave = useCallback(() => {
    if (!(panStateRef.current || hasWallEndpointDrag() || siteVertexDragState)) {
      setCursorPoint(null)
    }
    setHoveredSiteHandleId(null)
    clearOpeningWallHover()
  }, [clearOpeningWallHover, hasWallEndpointDrag, siteVertexDragState, setHoveredSiteHandleId])

  // Lightweight flag that mirrors the conditions under which
  // FloorplanCursorIndicatorOverlay renders 鈥?used to gate cursor-position
  // tracking. Derived locally here (rather than duplicating the overlay's full
  // useMemos) so this handler doesn't need to know about catalogCategory.
  const hasFloorplanCursorIndicator =
    Boolean(movingOpeningType) ||
    (mode === 'build' && tool !== null) ||
    (mode === 'select' && floorplanSelectionTool === 'marquee' && structureLayer !== 'zones') ||
    mode === 'delete'

  const handleSvgPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (
        hasFloorplanCursorIndicator &&
        !panStateRef.current &&
        !guideInteractionRef.current &&
        !elevatorResizeDragState &&
        !hasWallEndpointDrag() &&
        !siteVertexDragState
      ) {
        const rect = event.currentTarget.getBoundingClientRect()
        const nextPosition = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }
        setFloorplanCursorPosition((currentPosition) =>
          currentPosition &&
          currentPosition.x === nextPosition.x &&
          currentPosition.y === nextPosition.y
            ? currentPosition
            : nextPosition,
        )
      } else {
        setFloorplanCursorPosition((currentPosition) =>
          currentPosition === null ? currentPosition : null,
        )
      }

      handlePointerMove(event)
    },
    [
      handlePointerMove,
      hasFloorplanCursorIndicator,
      elevatorResizeDragState,
      hasWallEndpointDrag,
      siteVertexDragState,
    ],
  )

  const handleSvgPointerLeave = useCallback(() => {
    setFloorplanCursorPosition(null)
    setHoveredGuideCorner(null)
    handlePointerLeave()
  }, [handlePointerLeave])

  useEffect(() => {
    if (mode !== 'delete') {
      useViewer.getState().setHoveredId(null)
    }
  }, [mode])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }

    const getFallbackClientPoint = () => {
      const rect = svg.getBoundingClientRect()
      return {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }
    }

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const widthFactor = Math.exp(event.deltaY * (event.ctrlKey ? 0.003 : 0.0015))
      zoomViewportAtClientPoint(event.clientX, event.clientY, widthFactor)
    }

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as GestureLikeEvent
      gestureScaleRef.current = gestureEvent.scale ?? 1
      event.preventDefault()
      event.stopPropagation()
    }

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as GestureLikeEvent
      const nextScale = gestureEvent.scale ?? 1
      const previousScale = gestureScaleRef.current || 1
      const widthFactor = previousScale / nextScale
      const fallbackClientPoint = getFallbackClientPoint()

      zoomViewportAtClientPoint(
        gestureEvent.clientX ?? fallbackClientPoint.clientX,
        gestureEvent.clientY ?? fallbackClientPoint.clientY,
        widthFactor,
      )

      gestureScaleRef.current = nextScale
      event.preventDefault()
      event.stopPropagation()
    }

    const handleGestureEnd = (event: Event) => {
      gestureScaleRef.current = 1
      event.preventDefault()
      event.stopPropagation()
    }

    svg.addEventListener('wheel', handleNativeWheel, { passive: false })
    svg.addEventListener('gesturestart', handleGestureStart, {
      passive: false,
    })
    svg.addEventListener('gesturechange', handleGestureChange, {
      passive: false,
    })
    svg.addEventListener('gestureend', handleGestureEnd, { passive: false })

    return () => {
      svg.removeEventListener('wheel', handleNativeWheel)
      svg.removeEventListener('gesturestart', handleGestureStart)
      svg.removeEventListener('gesturechange', handleGestureChange)
      svg.removeEventListener('gestureend', handleGestureEnd)
    }
  }, [zoomViewportAtClientPoint])

  const restoreGroundLevelStructureSelection = useCallback(() => {
    const sceneNodes = useScene.getState().nodes
    const nextBuildingId =
      currentBuildingId ??
      site?.children
        .map((child) => (typeof child === 'string' ? sceneNodes[child as AnyNodeId] : child))
        .find((node): node is BuildingNode => node?.type === 'building')?.id ??
      null

    const nextGroundLevelId =
      nextBuildingId && nextBuildingId === currentBuildingId
        ? (floorplanLevels.find((level) => level.level === 0)?.id ??
          floorplanLevels[0]?.id ??
          (levelNode?.type === 'level' ? levelNode.id : null))
        : (() => {
            if (!nextBuildingId) {
              return null
            }

            const buildingNode = sceneNodes[nextBuildingId]
            if (!buildingNode || buildingNode.type !== 'building') {
              return null
            }

            const buildingLevels = buildingNode.children
              .map((child) => (typeof child === 'string' ? sceneNodes[child as AnyNodeId] : child))
              .filter((node): node is LevelNode => node?.type === 'level')
              .sort((a, b) => a.level - b.level)

            return (
              buildingLevels.find((level) => level.level === 0)?.id ?? buildingLevels[0]?.id ?? null
            )
          })()

    setPhase('structure')
    setStructureLayer('elements')
    setMode('select')

    const nextSelection: Parameters<typeof setSelection>[0] = {
      selectedIds: [],
      zoneId: null,
    }

    if (nextBuildingId) {
      nextSelection.buildingId = nextBuildingId
    }

    if (nextGroundLevelId) {
      nextSelection.levelId = nextGroundLevelId
    }

    setSelection(nextSelection)
  }, [
    currentBuildingId,
    floorplanLevels,
    levelNode,
    setMode,
    setPhase,
    setSelection,
    setStructureLayer,
    site,
  ])
  const activeDraftAnchorPoint =
    referenceScaleDraft?.start ??
    draftStart ??
    fenceDraftStart ??
    roofDraftStart ??
    activePolygonDraftPoints[0] ??
    null
  const floorplanCursorColor =
    mode === 'delete'
      ? palette.deleteStroke
      : wallEndpointDraft
        ? palette.editCursor
        : activeDraftAnchorPoint
          ? palette.draftStroke
          : palette.cursor
  return (
    <div
      className="pointer-events-auto flex h-full w-full flex-col overflow-hidden bg-background/95"
      onPointerEnter={() => setFloorplanHovered(true)}
      onPointerLeave={() => {
        setFloorplanHovered(false)
        setFloorplanCursorPosition(null)
      }}
      ref={containerRef}
    >
      <FloorplanSiteKeyHandler onRestoreGroundLevel={restoreGroundLevelStructureSelection} />
      <div className="relative min-h-0 flex-1" ref={viewportHostRef}>
        <Editor2dFloorplanCursorIndicatorOverlay
          cursorAnchorPosition={floorplanCursorAnchorPosition}
          cursorColor={floorplanCursorColor}
          cursorPosition={floorplanCursorPosition}
          floorplanSelectionTool={floorplanSelectionTool}
          indicatorBadgeOffsetX={FLOORPLAN_CURSOR_BADGE_OFFSET_X}
          indicatorBadgeOffsetY={FLOORPLAN_CURSOR_BADGE_OFFSET_Y}
          indicatorLineHeight={FLOORPLAN_CURSOR_INDICATOR_LINE_HEIGHT}
          isPanning={isPanning}
          movingOpeningType={movingOpeningType}
        />
        {showGuides && canInteractWithGuides && selectedGuide && (
          <FloorplanGuideHandleHint
            anchor={guideHandleHintAnchor}
            isDarkMode={theme === 'dark'}
            isMacPlatform={isMacPlatform}
            rotationModifierPressed={rotationModifierPressed}
          />
        )}
        {/* Floating Move / Duplicate / Delete buttons for registered
            kinds. All kinds are registry-driven now, so this is the
            only action menu the floor plan mounts. */}
        <FloorplanRegistryActionMenu />

        <FloorplanReferenceScaleOverlay
          draft={referenceScaleDraft}
          onCancelPending={() => setPendingReferenceScale(null)}
          onConfirmPending={handleReferenceScaleConfirm}
          onReferenceScaleUnitChange={setReferenceScaleUnit}
          onReferenceScaleValueChange={setReferenceScaleValue}
          pending={pendingReferenceScale}
          referenceScaleUnit={referenceScaleUnit}
          referenceScaleValue={referenceScaleValue}
          unit={unit}
        />
        {levelNode?.type === 'level' && (
          <FloorplanCompassButton
            northRotationDeg={floorplanUserRotationDeg}
            onAlignNorth={alignFloorplanViewToNorth}
          />
        )}

        {!levelNode || levelNode.type !== 'level' ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground text-sm">
            Switch to a building level to view and edit the floorplan.
          </div>
        ) : (
          <svg
            className="h-full w-full touch-none"
            onClick={isMarqueeSelectionToolActive ? undefined : handleBackgroundClick}
            onContextMenu={(event) => event.preventDefault()}
            onDoubleClick={isMarqueeSelectionToolActive ? undefined : handleBackgroundDoubleClick}
            onPointerCancel={endPanning}
            onPointerDown={handlePointerDown}
            onPointerLeave={handleSvgPointerLeave}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={endPanning}
            ref={svgRef}
            style={{ cursor: referenceScaleDraft ? 'crosshair' : EDITOR_CURSOR }}
            viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
          >
            <FloorplanSelectionPatterns
              selectedStroke={palette.selectedStroke}
              slabHatchId={slabSelectionHatchId}
              slabStrokeWidth={slabSelectionHatchStrokeWidth}
              spacing={wallSelectionHatchSpacing}
              wallHatchId={wallSelectionHatchId}
              wallStrokeWidth={wallSelectionHatchStrokeWidth}
            />
            <rect
              fill={palette.surface}
              height={viewBox.height}
              width={viewBox.width}
              x={viewBox.minX}
              y={viewBox.minY}
            />

            <g
              data-floorplan-scene=""
              ref={floorplanSceneRef}
              transform={
                floorplanSceneRotationDeg !== 0 ? `rotate(${floorplanSceneRotationDeg})` : undefined
              }
            >
              <FloorplanGridLayer
                majorGridPath={majorGridPath}
                minorGridPath={minorGridPath}
                palette={palette}
                showGrid={showGrid}
              />

              <FloorplanReferenceFloorLayer
                nodes={referenceFloorDescendants}
                opacity={referenceFloorOpacity}
              />

              <FloorplanGuideLayer
                activeGuideInteractionGuideId={activeGuideInteractionGuideId}
                activeGuideInteractionMode={activeGuideInteractionMode}
                guides={displayGuides}
                guideUi={guideUi}
                isInteractive={canInteractWithGuides}
                onGuideSelect={handleGuideSelect}
                onGuideTranslateStart={handleGuideTranslateStart}
                selectedGuideId={selectedGuideId}
              />

              <FloorplanSiteLayer isEditing={isSiteEditActive} sitePolygon={visibleSitePolygon} />

              {/* Stair is fully registry-driven for committed nodes
                  (`def.floorplan` on the stair kind). This layer only
                  carries the in-flight stair preview, which lives outside
                  the scene graph and so isn't visible to
                  `FloorplanRegistryLayer`. When the preview entry is
                  absent the array is empty and the layer renders nothing.
                  Hover / select / double-click props are noops 鈥?the
                  preview isn't interactive, and committed stairs route
                  through `FloorplanRegistryLayer`. */}
              <FloorplanStairLayer
                canFocusStairs={false}
                canSelectStairs={false}
                cursor={EDITOR_CURSOR}
                highlightedIdSet={highlightedFloorplanIdSet}
                hitStrokeWidth={FLOORPLAN_OPENING_HIT_STROKE_WIDTH}
                hoveredStairId={null}
                isDeleteMode={isDeleteMode}
                onStairDoubleClick={noopFloorplanStairHandler}
                onStairHoverChange={noopFloorplanStairHandler}
                onStairHoverEnter={noopFloorplanStairHandler}
                onStairPointerDown={noopFloorplanStairHandler}
                onStairSelect={noopFloorplanStairHandler}
                palette={palette}
                selectedIdSet={selectedIdSet}
                stairEntries={renderedFloorplanStairEntries}
              />
              <FloorplanColumnPreview
                entry={floorplanPreviewColumnEntry}
                unitsPerPixel={floorplanUnitsPerPixel}
              />

              <FloorplanReferenceScaleLayer
                draft={referenceScaleDraft}
                guides={displayGuides}
                guideUi={guideUi}
                palette={palette}
                unit={unit}
                unitsPerPixel={floorplanUnitsPerPixel}
              />

              <FloorplanPolygonHandleLayer
                edgeHandles={siteEdgeHandles}
                hoveredHandleId={hoveredSiteHandleId}
                midpointStyle="add"
                midpointHandles={siteMidpointHandles}
                onEdgePointerDown={(nodeId, edgeIndex, event) =>
                  handleSiteEdgePointerDown(nodeId as SiteNode['id'], edgeIndex, event)
                }
                onHandleHoverChange={setHoveredSiteHandleId}
                onMidpointPointerDown={(nodeId, edgeIndex, event) =>
                  handleSiteMidpointPointerDown(nodeId as SiteNode['id'], edgeIndex, event)
                }
                onVertexDoubleClick={(nodeId, vertexIndex, event) =>
                  handleSiteVertexDoubleClick(nodeId as SiteNode['id'], vertexIndex, event)
                }
                onVertexPointerDown={(nodeId, vertexIndex, event) =>
                  handleSiteVertexPointerDown(nodeId as SiteNode['id'], vertexIndex, event)
                }
                palette={palette}
                unitsPerPixel={floorplanUnitsPerPixel}
                vertexHandles={siteVertexHandles}
              />

              <FloorplanMarqueeInteractionLayer
                isActive={isMarqueeSelectionToolActive}
                onPointerCancel={handleMarqueePointerCancel}
                onPointerDown={handleMarqueePointerDown}
                onPointerMove={handleMarqueePointerMove}
                onPointerUp={handleMarqueePointerUp}
                viewBox={viewBox}
              />

              <FloorplanRegistrySceneLayer
                hatchPatternId={wallSelectionHatchId}
                palette={floorplanRegistryPalette}
                unitsPerPixel={floorplanUnitsPerPixel}
              />

              <FloorplanMarqueeLayer
                bounds={visibleSvgMarqueeBounds}
                cursorColor={palette.cursor}
                glowWidth={FLOORPLAN_MARQUEE_GLOW_WIDTH}
                outlineWidth={FLOORPLAN_MARQUEE_OUTLINE_WIDTH}
              />

              <FloorplanDraftSceneLayer
                draftAnchorPoints={draftAnchorPoints}
                draftPolygonPoints={draftPolygonPoints}
                fenceDraftSegment={fenceDraftSegment}
                isCeilingBuildActive={isCeilingBuildActive}
                isSlabBuildActive={isSlabBuildActive}
                palette={palette}
                polygonDraftClosingSegment={polygonDraftClosingSegment}
                polygonDraftPolygonPoints={polygonDraftPolygonPoints}
                polygonDraftPolylinePoints={polygonDraftPolylinePoints}
                unitsPerPixel={floorplanUnitsPerPixel}
              />

              {/* Wall / fence endpoint, wall curve, slab / ceiling /
                  zone vertex+midpoint+edge handles are all driven by the
                  registry's `def.floorplanAffordances` and rendered as
                  part of `FloorplanRegistryLayer`. The legacy handle
                  layers that lived here received empty handle arrays
                  post-migration and rendered nothing. */}

              {selectedGuide && showGuides && (
                <FloorplanGuideSelectionOverlay
                  guide={selectedGuide}
                  isDarkMode={theme === 'dark'}
                  onCornerHoverChange={setHoveredGuideCorner}
                  onCornerPointerDown={handleGuideCornerPointerDown}
                  rotationModifierPressed={rotationModifierPressed}
                  showHandles={canInteractWithGuides && guideUi[selectedGuide.id]?.locked !== true}
                />
              )}

              <FloorplanCursorMarkers
                activeDraftAnchorPoint={activeDraftAnchorPoint}
                anchorColor={palette.anchor}
                cursorColor={floorplanCursorColor}
                cursorPoint={cursorPoint}
                unitsPerPixel={floorplanUnitsPerPixel}
              />
            </g>
          </svg>
        )}
      </div>
    </div>
  )
}
