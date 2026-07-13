import type {
  CeilingNode,
  ColumnNode,
  DoorNode,
  ElevatorNode,
  FenceNode,
  GuideNode,
  ItemNode,
  LevelNode,
  Point2D,
  RoofNode,
  RoofSegmentNode,
  SiteNode,
  SlabNode,
  SpawnNode,
  StairNode,
  StairSegmentNode,
  WallNode,
  WindowNode,
  ZoneNode as ZoneNodeType,
} from '@pascal-app/core'
import type { WallPlanPoint } from '../../tools/wall/wall-drafting'

export type FloorplanViewport = {
  centerX: number
  centerY: number
  width: number
}

export function floorplanViewportEquals(a: FloorplanViewport | null, b: FloorplanViewport | null) {
  if (a === b) return true
  if (!(a && b)) return false
  return a.centerX === b.centerX && a.centerY === b.centerY && a.width === b.width
}

export type SvgPoint = {
  x: number
  y: number
}

export type PanState = {
  pointerId: number
  clientX: number
  clientY: number
}

export type GestureLikeEvent = Event & {
  clientX?: number
  clientY?: number
  scale?: number
}

export type PanelRect = {
  x: number
  y: number
  width: number
  height: number
}

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export type PanelInteractionState = {
  pointerId: number
  startClientX: number
  startClientY: number
  initialRect: PanelRect
  type: 'drag' | 'resize'
  direction?: ResizeDirection
}

export type ViewportBounds = {
  width: number
  height: number
}

export type OpeningNode = WindowNode | DoorNode

export type WallEndpoint = 'start' | 'end'

export type FloorplanCursorIndicator =
  | {
      kind: 'asset'
      iconSrc: string
    }
  | {
      kind: 'icon'
      icon: string
    }

export type PersistedPanelLayout = {
  rect: PanelRect
  viewport: ViewportBounds
}

export type FloorplanSelectionBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type FloorplanMarqueeState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startPlanPoint: WallPlanPoint
  currentPlanPoint: WallPlanPoint
}

export type LinkedWallSnapshot = {
  id: WallNode['id']
  start: WallPlanPoint
  end: WallPlanPoint
}

export type WallEndpointDragState = {
  pointerId: number
  wallId: WallNode['id']
  endpoint: WallEndpoint
  fixedPoint: WallPlanPoint
  currentPoint: WallPlanPoint
  originalStart: WallPlanPoint
  originalEnd: WallPlanPoint
  linkedWalls: LinkedWallSnapshot[]
}

export type WallCurveDragState = {
  pointerId: number
  wallId: WallNode['id']
  currentCurveOffset: number
}

export type PendingFenceDragState = {
  pointerId: number
  fenceId: FenceNode['id']
  startClientX: number
  startClientY: number
}

export type ElevatorResizeHandle =
  | 'width-negative'
  | 'width-positive'
  | 'depth-negative'
  | 'depth-positive'

export type ElevatorResizeDragState = {
  center: Point2D
  elevatorId: ElevatorNode['id']
  handle: ElevatorResizeHandle
  pointerId: number
  rotation: number
  shaftWallThickness: number
}

export const GUIDE_CORNERS = ['nw', 'ne', 'se', 'sw'] as const

export type GuideCorner = (typeof GUIDE_CORNERS)[number]

export type GuideInteractionMode = 'resize' | 'rotate' | 'translate'

export type GuideTransformDraft = {
  guideId: GuideNode['id']
  position: WallPlanPoint
  scale: number
  rotation: number
}

export type ReferenceScaleUnit = 'meters' | 'centimeters' | 'feet' | 'inches'

export type ReferenceScaleDraft = {
  guideId: GuideNode['id']
  start: WallPlanPoint | null
  cursor: WallPlanPoint | null
}

export type PendingReferenceScale = {
  guideId: GuideNode['id']
  start: WallPlanPoint
  end: WallPlanPoint
  measuredLengthUnits: number
}

export type GuideHandleHintAnchor = {
  x: number
  y: number
  directionX: number
  directionY: number
}

export type GuideInteractionState = {
  pointerId: number
  guideId: GuideNode['id']
  corner: GuideCorner
  mode: GuideInteractionMode
  aspectRatio: number
  centerSvg: SvgPoint
  oppositeCornerSvg: SvgPoint | null
  pointerOffsetSvg: WallPlanPoint
  rotationSvg: number
  cornerBaseAngle: number
  scale: number
}

export type WallEndpointDraft = {
  wallId: WallNode['id']
  endpoint: WallEndpoint
  start: WallPlanPoint
  end: WallPlanPoint
  linkedWalls: LinkedWallSnapshot[]
}

export type WallCurveDraft = {
  wallId: WallNode['id']
  curveOffset: number
}

export type SiteBoundaryDraft = {
  siteId: SiteNode['id']
  polygon: WallPlanPoint[]
}

export type SiteVertexDragState = {
  pointerId: number
  siteId: SiteNode['id']
  vertexIndex: number
}

export type WallPolygonEntry = {
  wall: WallNode
  polygon: Point2D[]
  points: string
}

export type FloorplanFenceEntry = {
  fence: FenceNode
  centerline: Point2D[]
  markerFrames: Array<{
    angleDeg: number
    point: Point2D
  }>
  path: string
}

export type OpeningPolygonEntry = {
  opening: OpeningNode
  polygon: Point2D[]
  points: string
}

export type SlabPolygonEntry = {
  slab: SlabNode
  polygon: Point2D[]
  holes: Point2D[][]
  visualPolygon: Point2D[]
  visualHoles: Point2D[][]
  path: string
}

export type CeilingPolygonEntry = {
  ceiling: CeilingNode
  polygon: Point2D[]
  holes: Point2D[][]
  path: string
}

export type SitePolygonEntry = {
  site: SiteNode
  polygon: Point2D[]
  points: string
}

export type ZonePolygonEntry = {
  zone: ZoneNodeType
  polygon: Point2D[]
  points: string
}

export type FloorplanLineSegment = {
  start: Point2D
  end: Point2D
}

export type FloorplanPolygonEntry = {
  points: string
  polygon: Point2D[]
}

export type FloorplanItemEntry = {
  dimensionPolygon: Point2D[]
  item: ItemNode
  points: string
  polygon: Point2D[]
  usesRealMesh: boolean
  // Scene-space center (x, y = plan coords) and rotation in radians, plus the
  // footprint dimensions. Used to place the optional floor-plan image overlay
  // in the correct position, orientation, and size.
  center: Point2D
  rotation: number
  width: number
  depth: number
}

export type FloorplanSpawnEntry = {
  spawn: SpawnNode
  position: Point2D
  rotation: number
}

export type FloorplanColumnEntry = {
  column: ColumnNode
  points: string
  polygon: Point2D[]
}

export type FloorplanElevatorServedLevel = {
  id: LevelNode['id']
  isCurrent: boolean
  isDisabled: boolean
  isQueued: boolean
  isServiceOnly: boolean
  isTarget: boolean
  label: string
}

export type FloorplanElevatorEntry = {
  cabCenterLocalY: number
  cabDepth: number
  cabWidth: number
  center: Point2D
  doorStyle: ElevatorNode['doorStyle']
  doorWidth: number
  elevator: ElevatorNode
  frontEdge: FloorplanLineSegment
  frontNormal: Point2D
  isCarOnLevel: boolean
  isQueuedLevel: boolean
  isTargetLevel: boolean
  outerHalfDepth: number
  outerHalfWidth: number
  points: string
  polygon: Point2D[]
  rotation: number
  servedLevels: FloorplanElevatorServedLevel[]
  shaftDepth: number
  shaftWallThickness: number
  shaftWidth: number
}

export type ReferenceFloorData = {
  ceilingPolygons: CeilingPolygonEntry[]
  columnEntries: ReferenceFloorColumnEntry[]
  fenceEntries: FloorplanFenceEntry[]
  itemEntries: FloorplanItemEntry[]
  openingPolygons: OpeningPolygonEntry[]
  slabPolygons: SlabPolygonEntry[]
  wallPolygons: WallPolygonEntry[]
}

export type ReferenceFloorColumnEntry = {
  column: ColumnNode
  points: string
  polygon: Point2D[]
}

export type FloorplanStairSegmentEntry = {
  centerLine: FloorplanLineSegment | null
  innerPoints: string
  innerPolygon: Point2D[]
  segment: StairSegmentNode
  points: string
  polygon: Point2D[]
  treadBars: FloorplanPolygonEntry[]
  treadThickness: number
}

export type FloorplanStairArrowEntry = {
  head: Point2D[]
  polyline: Point2D[]
}

export type FloorplanStairEntry = {
  arrow: FloorplanStairArrowEntry | null
  hitPolygons: Point2D[][]
  stair: StairNode
  segments: FloorplanStairSegmentEntry[]
}

export type FloorplanRoofSegmentEntry = {
  segment: RoofSegmentNode
  polygon: Point2D[]
  points: string
  ridgeLine: FloorplanLineSegment | null
}

export type FloorplanRoofEntry = {
  roof: RoofNode
  center: Point2D
  segments: FloorplanRoofSegmentEntry[]
}

export type FloorplanPalette = {
  surface: string
  minorGrid: string
  majorGrid: string
  minorGridOpacity: number
  majorGridOpacity: number
  slabFill: string
  slabStroke: string
  selectedSlabFill: string
  selectedSlabStroke: string
  ceilingFill: string
  ceilingStroke: string
  selectedCeilingFill: string
  selectedCeilingStroke: string
  wallFill: string
  wallStroke: string
  wallInnerStroke: string
  wallShadow: string
  wallHoverStroke: string
  deleteFill: string
  deleteStroke: string
  deleteWallFill: string
  deleteWallHoverStroke: string
  selectedFill: string
  selectedStroke: string
  draftFill: string
  draftStroke: string
  cursor: string
  editCursor: string
  anchor: string
  openingFill: string
  openingStroke: string
  measurementStroke: string
  roofFill: string
  roofActiveFill: string
  roofSelectedFill: string
  roofStroke: string
  roofActiveStroke: string
  roofSelectedStroke: string
  roofRidgeStroke: string
  roofSelectedRidgeStroke: string
  stairFill: string
  stairSelectedFill: string
  stairStroke: string
  stairAccent: string
  stairTread: string
  stairSelectedTread: string
  endpointHandleFill: string
  endpointHandleStroke: string
  endpointHandleHoverStroke: string
  endpointHandleActiveFill: string
  endpointHandleActiveStroke: string
  curveHandleFill: string
  curveHandleStroke: string
  curveHandleHoverStroke: string
}

export const resizeCursorByDirection: Record<ResizeDirection, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
}

export const resizeHandleConfigurations: Array<{
  direction: ResizeDirection
  className: string
}> = [
  {
    direction: 'n',
    className: 'absolute top-0 left-4 right-4 z-20 h-2 cursor-ns-resize',
  },
  {
    direction: 's',
    className: 'absolute right-4 bottom-0 left-4 z-20 h-2 cursor-ns-resize',
  },
  {
    direction: 'e',
    className: 'absolute top-4 right-0 bottom-4 z-20 w-2 cursor-ew-resize',
  },
  {
    direction: 'w',
    className: 'absolute top-4 bottom-4 left-0 z-20 w-2 cursor-ew-resize',
  },
  {
    direction: 'ne',
    className: 'absolute top-0 right-0 z-20 h-4 w-4 cursor-nesw-resize',
  },
  {
    direction: 'nw',
    className: 'absolute top-0 left-0 z-20 h-4 w-4 cursor-nwse-resize',
  },
  {
    direction: 'se',
    className: 'absolute right-0 bottom-0 z-20 h-4 w-4 cursor-nwse-resize',
  },
  {
    direction: 'sw',
    className: 'absolute bottom-0 left-0 z-20 h-4 w-4 cursor-nesw-resize',
  },
]

export const guideCornerSigns: Record<GuideCorner, { x: -1 | 1; y: -1 | 1 }> = {
  nw: { x: -1, y: -1 },
  ne: { x: 1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
}

export const oppositeGuideCorner: Record<GuideCorner, GuideCorner> = {
  nw: 'se',
  ne: 'sw',
  se: 'nw',
  sw: 'ne',
}
