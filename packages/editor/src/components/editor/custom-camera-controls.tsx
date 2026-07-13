'use client'

import {
  type CameraControlEvent,
  type CameraControlFitSceneEvent,
  emitter,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { GRID_LAYER, ZONE_LAYER } from '@pascal-app/viewer/layers'
import useViewer from '@pascal-app/viewer/store'
import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box3,
  type Camera,
  type OrthographicCamera,
  type PerspectiveCamera,
  Spherical,
  Vector3,
} from 'three'
import { getCameraZoomLimits } from '../../lib/camera-zoom-limits'
import { EDITOR_LAYER } from '../../lib/constants'
import { computeSceneBoundsXZ, pickSceneCameraFocusBounds } from '../../lib/scene-bounds'
import useEditor from '../../store/use-editor'

const currentTarget = new Vector3()
const tempBox = new Box3()
const tempCenter = new Vector3()
const tempDelta = new Vector3()
const tempPosition = new Vector3()
const tempSize = new Vector3()
const tempTarget = new Vector3()
const syncSpherical = new Spherical()
const syncTarget = new Vector3()
const DEFAULT_MAX_POLAR_ANGLE = Math.PI / 2 - 0.1
const DEBUG_MAX_POLAR_ANGLE = Math.PI - 0.05
const DEFAULT_DOLLY_SPEED = 1
const DEFAULT_TRUCK_SPEED = 2
const PREVIEW_DOLLY_SPEED = 1.4
const PREVIEW_TRUCK_SPEED = 6
const NAVIGATION_SYNC_POSITION_EPSILON = 0.001
const NAVIGATION_SYNC_AZIMUTH_EPSILON = 0.0005
const NAVIGATION_SYNC_VIEW_WIDTH_EPSILON = 0.001

type NavigationCameraPoseSnapshot = {
  target: [number, number, number]
  azimuth: number
  viewWidth: number
}

type PendingNavigationCameraPoseSnapshot = NavigationCameraPoseSnapshot & {
  publishOnComplete: boolean
}

type CameraViewportSize = {
  width: number
  height: number
}

function readSceneCameraZoomLimits() {
  const nodes = useScene.getState().nodes
  const focus = pickSceneCameraFocusBounds(nodes)
  return getCameraZoomLimits(focus?.bounds ?? computeSceneBoundsXZ(nodes))
}

function useSceneCameraZoomLimits() {
  const [limits, setLimits] = useState(readSceneCameraZoomLimits)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = useScene.subscribe((state, previous) => {
      if (state.nodes === previous.nodes) return
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        timeout = null
        setLimits(readSceneCameraZoomLimits())
      }, 120)
    })
    return () => {
      unsubscribe()
      if (timeout) clearTimeout(timeout)
    }
  }, [])

  return limits
}

type CameraViewWidthUpdate =
  | { type: 'distance'; distance: number; viewWidth: number }
  | { type: 'zoom'; viewWidth: number; zoom: number }
  | { type: 'none'; viewWidth: number }

function isPerspectiveCamera(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true
}

function isOrthographicCamera(camera: Camera): camera is OrthographicCamera {
  return (camera as OrthographicCamera).isOrthographicCamera === true
}

function getCameraViewAspect(size: CameraViewportSize) {
  return Math.max(size.width, 1) / Math.max(size.height, 1)
}

function getCameraViewWidth(camera: Camera, distance: number, size: CameraViewportSize) {
  if (isPerspectiveCamera(camera)) {
    const fovRadians = (camera.getEffectiveFOV() * Math.PI) / 180
    return Math.max(0.001, 2 * distance * Math.tan(fovRadians / 2) * getCameraViewAspect(size))
  }

  if (isOrthographicCamera(camera)) {
    return Math.max(0.001, (camera.right - camera.left) / camera.zoom)
  }

  return Math.max(0.001, distance)
}

function getAngleDeltaRadians(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b))
}

function nearestEquivalentRadians(angle: number, reference: number) {
  return reference + getAngleDeltaRadians(angle, reference)
}

function clampFinite(value: number, min: number, max: number) {
  const resolvedMin = Number.isFinite(min) ? min : Number.NEGATIVE_INFINITY
  const resolvedMax = Number.isFinite(max) ? max : Number.POSITIVE_INFINITY
  return Math.min(Math.max(value, resolvedMin), resolvedMax)
}

function clampCameraControlDistance(control: CameraControlsImpl, distance: number) {
  const bounds = control as { minDistance?: number; maxDistance?: number }
  return clampFinite(
    distance,
    bounds.minDistance ?? Number.NEGATIVE_INFINITY,
    bounds.maxDistance ?? Number.POSITIVE_INFINITY,
  )
}

function clampCameraControlZoom(control: CameraControlsImpl, zoom: number) {
  const bounds = control as { minZoom?: number; maxZoom?: number }
  return clampFinite(
    zoom,
    bounds.minZoom ?? Number.NEGATIVE_INFINITY,
    bounds.maxZoom ?? Number.POSITIVE_INFINITY,
  )
}

function getCameraDistanceForViewWidth(
  camera: Camera,
  viewWidth: number,
  size: CameraViewportSize,
) {
  if (!isPerspectiveCamera(camera)) {
    return null
  }

  const fovRadians = (camera.getEffectiveFOV() * Math.PI) / 180
  const denominator = 2 * Math.tan(fovRadians / 2) * getCameraViewAspect(size)

  return denominator > 0 ? Math.max(0.001, viewWidth / denominator) : null
}

function getCameraZoomForViewWidth(camera: Camera, viewWidth: number) {
  if (!isOrthographicCamera(camera)) {
    return null
  }

  return viewWidth > 0 ? Math.max(0.001, (camera.right - camera.left) / viewWidth) : null
}

function resolveCameraViewWidthUpdate(
  control: CameraControlsImpl,
  camera: Camera,
  viewWidth: number,
  size: CameraViewportSize,
): CameraViewWidthUpdate {
  const nextDistance = getCameraDistanceForViewWidth(camera, viewWidth, size)
  if (nextDistance !== null) {
    const appliedDistance = clampCameraControlDistance(control, nextDistance)
    return {
      type: 'distance',
      distance: appliedDistance,
      viewWidth: getCameraViewWidth(camera, appliedDistance, size),
    }
  }

  const nextZoom = getCameraZoomForViewWidth(camera, viewWidth)
  if (nextZoom !== null) {
    const appliedZoom = clampCameraControlZoom(control, nextZoom)
    if (isOrthographicCamera(camera)) {
      return {
        type: 'zoom',
        zoom: appliedZoom,
        viewWidth: Math.max(0.001, (camera.right - camera.left) / Math.max(appliedZoom, 0.001)),
      }
    }
  }

  return { type: 'none', viewWidth }
}

function applyCameraViewWidth(control: CameraControlsImpl, update: CameraViewWidthUpdate) {
  if (update.type === 'distance') {
    control.dollyTo(update.distance, true)
    return
  }

  if (update.type === 'zoom') {
    control.zoomTo(update.zoom, true)
  }
}

function isCameraAtNavigationPose(
  pose: NavigationCameraPoseSnapshot,
  target: Vector3,
  azimuth: number,
  viewWidth: number,
) {
  return (
    Math.abs(pose.target[0] - target.x) < NAVIGATION_SYNC_POSITION_EPSILON &&
    Math.abs(pose.target[1] - target.y) < NAVIGATION_SYNC_POSITION_EPSILON &&
    Math.abs(pose.target[2] - target.z) < NAVIGATION_SYNC_POSITION_EPSILON &&
    Math.abs(getAngleDeltaRadians(pose.azimuth, azimuth)) < NAVIGATION_SYNC_AZIMUTH_EPSILON &&
    Math.abs(pose.viewWidth - viewWidth) < NAVIGATION_SYNC_VIEW_WIDTH_EPSILON
  )
}

export const CustomCameraControls = () => {
  const controls = useRef<CameraControlsImpl>(null!)
  const isPreviewMode = useEditor((s) => s.isPreviewMode)
  const isFirstPersonMode = useEditor((s) => s.isFirstPersonMode)
  const allowUndergroundCamera = useEditor((s) => s.allowUndergroundCamera)
  const selection = useViewer((s) => s.selection)
  const currentLevelId = selection.levelId
  const firstLoad = useRef(true)
  const maxPolarAngle =
    !isPreviewMode && allowUndergroundCamera ? DEBUG_MAX_POLAR_ANGLE : DEFAULT_MAX_POLAR_ANGLE
  const dollySpeed = isPreviewMode ? PREVIEW_DOLLY_SPEED : DEFAULT_DOLLY_SPEED
  const dollyToCursor = isPreviewMode
  const truckSpeed = isPreviewMode ? PREVIEW_TRUCK_SPEED : DEFAULT_TRUCK_SPEED

  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const raycaster = useThree((state) => state.raycaster)
  const viewportSize = useThree((state) => state.size)
  const ignoreLeftSelectControlStartRef = useRef(false)
  const lastApplied2dNavigationRevision = useRef(0)
  const lastPublishedNavigationSync = useRef<NavigationCameraPoseSnapshot | null>(null)
  const pendingFloorplanNavigationPose = useRef<PendingNavigationCameraPoseSnapshot | null>(null)
  const cameraZoomLimits = useSceneCameraZoomLimits()
  const clearPendingFloorplanNavigationPose = useCallback(() => {
    pendingFloorplanNavigationPose.current = null
  }, [])

  useEffect(() => {
    camera.layers.enable(EDITOR_LAYER)
    camera.layers.enable(GRID_LAYER)
    raycaster.layers.enable(EDITOR_LAYER)
    raycaster.layers.enable(ZONE_LAYER)
  }, [camera, raycaster])

  useEffect(() => {
    if (isPreviewMode) return // Preview mode uses auto-navigate instead
    let targetY = 0
    if (currentLevelId) {
      const levelMesh = sceneRegistry.nodes.get(currentLevelId)
      if (levelMesh) {
        targetY = levelMesh.position.y
      }
    }
    if (!controls.current) return
    if (firstLoad.current) {
      firstLoad.current = false
      clearPendingFloorplanNavigationPose()
      controls.current.setLookAt(20, 20, 20, 0, 0, 0, true)
    }
    controls.current.getTarget(currentTarget)
    clearPendingFloorplanNavigationPose()
    controls.current.moveTo(currentTarget.x, targetY, currentTarget.z, true)
  }, [clearPendingFloorplanNavigationPose, currentLevelId, isPreviewMode])

  useEffect(() => {
    if (!controls.current) return

    controls.current.maxPolarAngle = maxPolarAngle
    controls.current.minPolarAngle = 0
    controls.current.maxDistance = cameraZoomLimits.maxDistance
    controls.current.minDistance = cameraZoomLimits.minDistance
    controls.current.maxZoom = cameraZoomLimits.maxZoom
    controls.current.minZoom = cameraZoomLimits.minZoom
    controls.current.dollySpeed = dollySpeed
    controls.current.dollyToCursor = dollyToCursor
    controls.current.truckSpeed = truckSpeed

    if (controls.current.polarAngle > maxPolarAngle) {
      controls.current.rotateTo(controls.current.azimuthAngle, maxPolarAngle, true)
    }
  }, [cameraZoomLimits, dollySpeed, dollyToCursor, maxPolarAngle, truckSpeed])

  const focusNode = useCallback(
    (nodeId: string) => {
      if (isPreviewMode || !controls.current) return

      const object3D = sceneRegistry.nodes.get(nodeId)
      if (!object3D) return

      tempBox.setFromObject(object3D)
      if (tempBox.isEmpty()) return

      tempBox.getCenter(tempCenter)
      controls.current.getPosition(tempPosition)
      controls.current.getTarget(tempTarget)
      tempDelta.copy(tempCenter).sub(tempTarget)

      clearPendingFloorplanNavigationPose()
      controls.current.setLookAt(
        tempPosition.x + tempDelta.x,
        tempPosition.y + tempDelta.y,
        tempPosition.z + tempDelta.z,
        tempCenter.x,
        tempCenter.y,
        tempCenter.z,
        true,
      )
    },
    [clearPendingFloorplanNavigationPose, isPreviewMode],
  )

  useEffect(() => {
    if (isFirstPersonMode) return

    return useEditor.subscribe((state) => {
      const pose = state.navigationSyncPose
      if (pose?.source !== '2d' || pose.revision === lastApplied2dNavigationRevision.current) {
        return
      }

      const control = controls.current
      if (!control) {
        return
      }

      lastApplied2dNavigationRevision.current = pose.revision
      const targetAzimuth = nearestEquivalentRadians(pose.azimuth, control.azimuthAngle)
      const viewWidthUpdate = resolveCameraViewWidthUpdate(
        control,
        camera,
        pose.viewWidth,
        viewportSize,
      )

      pendingFloorplanNavigationPose.current = {
        target: [...pose.target],
        azimuth: targetAzimuth,
        viewWidth: viewWidthUpdate.viewWidth,
        publishOnComplete:
          Math.abs(viewWidthUpdate.viewWidth - pose.viewWidth) >=
          NAVIGATION_SYNC_VIEW_WIDTH_EPSILON,
      }

      control.moveTo(pose.target[0], pose.target[1], pose.target[2], true)
      control.rotateTo(targetAzimuth, control.polarAngle, true)
      applyCameraViewWidth(control, viewWidthUpdate)
    })
  }, [camera, isFirstPersonMode, viewportSize])

  useFrame(() => {
    const control = controls.current
    if (!control || isPreviewMode || isFirstPersonMode) {
      return
    }

    control.getTarget(syncTarget)
    control.getPosition(tempPosition)
    syncSpherical.setFromVector3(tempPosition.sub(syncTarget))
    const viewWidth = getCameraViewWidth(camera, syncSpherical.radius, viewportSize)
    const pendingFloorplanPose = pendingFloorplanNavigationPose.current

    if (
      pendingFloorplanPose &&
      isCameraAtNavigationPose(pendingFloorplanPose, syncTarget, syncSpherical.theta, viewWidth)
    ) {
      lastPublishedNavigationSync.current = pendingFloorplanPose
      pendingFloorplanNavigationPose.current = null
      if (pendingFloorplanPose.publishOnComplete) {
        useEditor.getState().publishNavigationSyncPose({
          source: '3d',
          target: [
            pendingFloorplanPose.target[0],
            pendingFloorplanPose.target[1],
            pendingFloorplanPose.target[2],
          ],
          azimuth: pendingFloorplanPose.azimuth,
          viewWidth: pendingFloorplanPose.viewWidth,
        })
      }
      return
    }

    if (pendingFloorplanPose) {
      return
    }

    const previous = lastPublishedNavigationSync.current
    if (
      previous &&
      Math.abs(previous.target[0] - syncTarget.x) < NAVIGATION_SYNC_POSITION_EPSILON &&
      Math.abs(previous.target[1] - syncTarget.y) < NAVIGATION_SYNC_POSITION_EPSILON &&
      Math.abs(previous.target[2] - syncTarget.z) < NAVIGATION_SYNC_POSITION_EPSILON &&
      Math.abs(getAngleDeltaRadians(previous.azimuth, syncSpherical.theta)) <
        NAVIGATION_SYNC_AZIMUTH_EPSILON &&
      Math.abs(previous.viewWidth - viewWidth) < NAVIGATION_SYNC_VIEW_WIDTH_EPSILON
    ) {
      return
    }

    lastPublishedNavigationSync.current = {
      target: [syncTarget.x, syncTarget.y, syncTarget.z],
      azimuth: syncSpherical.theta,
      viewWidth,
    }
    useEditor.getState().publishNavigationSyncPose({
      source: '3d',
      target: [syncTarget.x, syncTarget.y, syncTarget.z],
      azimuth: syncSpherical.theta,
      viewWidth,
    })
  })

  // Configure mouse buttons based on control mode and camera mode
  const cameraMode = useViewer((state) => state.cameraMode)
  const mouseButtons = useMemo(() => {
    // Use ZOOM for orthographic camera, DOLLY for perspective camera
    const wheelAction =
      cameraMode === 'orthographic'
        ? CameraControlsImpl.ACTION.ZOOM
        : CameraControlsImpl.ACTION.DOLLY

    return {
      left: isPreviewMode ? CameraControlsImpl.ACTION.SCREEN_PAN : CameraControlsImpl.ACTION.NONE,
      middle: CameraControlsImpl.ACTION.SCREEN_PAN,
      right: CameraControlsImpl.ACTION.ROTATE,
      wheel: wheelAction,
    }
  }, [cameraMode, isPreviewMode])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isPreviewMode || useViewer.getState().spacePanning) return
      ignoreLeftSelectControlStartRef.current = true
      window.addEventListener(
        'pointerup',
        () => {
          ignoreLeftSelectControlStartRef.current = false
        },
        { once: true },
      )
    }

    gl.domElement.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => {
      gl.domElement.removeEventListener('pointerdown', onPointerDown, { capture: true })
      ignoreLeftSelectControlStartRef.current = false
    }
  }, [gl.domElement, isPreviewMode])

  // Touch gestures (mobile / trackpad).
  // - One finger drag    → rotate by default (much easier on a phone), but
  //                        falls back to NONE while the user is actively
  //                        placing/moving something OR in box-select mode,
  //                        so the editor's pointer handlers (place tool,
  //                        drag-to-move endpoint, marquee selection drag)
  //                        keep priority over the camera.
  //                        In preview mode it's TOUCH_TRUCK (pan), matching
  //                        preview's left = SCREEN_PAN.
  // - Two finger pinch   → zoom + pan together (TOUCH_DOLLY_TRUCK for
  //                        perspective, TOUCH_ZOOM_TRUCK for orthographic).
  // - Three finger drag  → rotate, so the camera is always orbitable even
  //                        when one-finger is suppressed by an active
  //                        editor action.
  const tool = useEditor((s) => s.tool)
  const mode = useEditor((s) => s.mode)
  const selectionTool = useEditor((s) => s.floorplanSelectionTool)
  const movingNode = useEditor((s) => s.movingNode)
  const movingWallEndpoint = useEditor((s) => s.movingWallEndpoint)
  const movingFenceEndpoint = useEditor((s) => s.movingFenceEndpoint)
  const movingPipeEndpoint = useEditor((s) => s.movingPipeEndpoint)
  const movingCableTrayEndpoint = useEditor((s) => s.movingCableTrayEndpoint)
  const movingConveyorBeltEndpoint = useEditor((s) => s.movingConveyorBeltEndpoint)
  const movingRoadEndpoint = useEditor((s) => s.movingRoadEndpoint)
  const movingSteelBeamEndpoint = useEditor((s) => s.movingSteelBeamEndpoint)
  const isBoxSelectActive = mode === 'select' && selectionTool === 'marquee'
  const isInteracting = Boolean(
    tool ||
      movingNode ||
      movingWallEndpoint ||
      movingFenceEndpoint ||
      movingPipeEndpoint ||
      movingCableTrayEndpoint ||
      movingConveyorBeltEndpoint ||
      movingRoadEndpoint ||
      movingSteelBeamEndpoint ||
      isBoxSelectActive,
  )
  const touches = useMemo(() => {
    const twoFingerAction =
      cameraMode === 'orthographic'
        ? CameraControlsImpl.ACTION.TOUCH_ZOOM_TRUCK
        : CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK

    const oneFingerAction = isPreviewMode
      ? CameraControlsImpl.ACTION.TOUCH_TRUCK
      : isInteracting
        ? CameraControlsImpl.ACTION.NONE
        : CameraControlsImpl.ACTION.TOUCH_ROTATE

    return {
      one: oneFingerAction,
      two: twoFingerAction,
      three: CameraControlsImpl.ACTION.TOUCH_ROTATE,
    }
  }, [cameraMode, isPreviewMode, isInteracting])

  useEffect(() => {
    const keyState = {
      shiftRight: false,
      shiftLeft: false,
      controlRight: false,
      controlLeft: false,
      space: false,
    }

    const setSpacePanning = (panning: boolean) => {
      keyState.space = panning
      useViewer.getState().setSpacePanning(panning)
      document.body.style.cursor = panning ? 'grab' : ''
    }

    const updateConfig = () => {
      if (!controls.current) return

      const shift = keyState.shiftRight || keyState.shiftLeft
      const control = keyState.controlRight || keyState.controlLeft
      const space = keyState.space

      const wheelAction =
        cameraMode === 'orthographic'
          ? CameraControlsImpl.ACTION.ZOOM
          : CameraControlsImpl.ACTION.DOLLY
      controls.current.mouseButtons.wheel = wheelAction
      controls.current.mouseButtons.middle = CameraControlsImpl.ACTION.SCREEN_PAN
      controls.current.mouseButtons.right = CameraControlsImpl.ACTION.ROTATE
      if (isPreviewMode) {
        // In preview mode, left-click is always pan (viewer-style)
        controls.current.mouseButtons.left = CameraControlsImpl.ACTION.SCREEN_PAN
      } else if (space) {
        controls.current.mouseButtons.left = CameraControlsImpl.ACTION.SCREEN_PAN
      } else {
        controls.current.mouseButtons.left = CameraControlsImpl.ACTION.NONE
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpacePanning(true)
      }
      if (event.code === 'ShiftRight') {
        keyState.shiftRight = true
      }
      if (event.code === 'ShiftLeft') {
        keyState.shiftLeft = true
      }
      if (event.code === 'ControlRight') {
        keyState.controlRight = true
      }
      if (event.code === 'ControlLeft') {
        keyState.controlLeft = true
      }
      updateConfig()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpacePanning(false)
      }
      if (event.code === 'ShiftRight') {
        keyState.shiftRight = false
      }
      if (event.code === 'ShiftLeft') {
        keyState.shiftLeft = false
      }
      if (event.code === 'ControlRight') {
        keyState.controlRight = false
      }
      if (event.code === 'ControlLeft') {
        keyState.controlLeft = false
      }
      updateConfig()
    }

    const onBlur = () => {
      setSpacePanning(false)
      updateConfig()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    updateConfig()

    return () => {
      setSpacePanning(false)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [cameraMode, isPreviewMode])

  // Preview mode: auto-navigate camera to selected node (viewer behavior)
  const previewTargetNodeId = isPreviewMode
    ? (selection.zoneId ?? selection.levelId ?? selection.buildingId)
    : null

  useEffect(() => {
    if (!(isPreviewMode && controls.current)) return

    const nodes = useScene.getState().nodes
    let node = previewTargetNodeId ? nodes[previewTargetNodeId] : null

    if (!previewTargetNodeId) {
      const site = Object.values(nodes).find((n) => n.type === 'site')
      node = site || null
    }
    if (!node) return

    // Check if node has a saved camera
    if (node.camera) {
      const { position, target } = node.camera
      if (
        position &&
        target &&
        position.length >= 3 &&
        target.length >= 3 &&
        position.every((v) => v !== null && v !== undefined) &&
        target.every((v) => v !== null && v !== undefined)
      ) {
        requestAnimationFrame(() => {
          if (!controls.current) return
          clearPendingFloorplanNavigationPose()
          controls.current.setLookAt(
            position[0],
            position[1],
            position[2],
            target[0],
            target[1],
            target[2],
            true,
          )
        })
      }
      return
    }

    if (!previewTargetNodeId) return

    // Calculate camera position from bounding box
    const object3D = sceneRegistry.nodes.get(previewTargetNodeId)
    if (!object3D) return

    tempBox.setFromObject(object3D)
    tempBox.getCenter(tempCenter)
    tempBox.getSize(tempSize)

    const maxDim = Math.max(tempSize.x, tempSize.y, tempSize.z)
    const distance = Math.max(maxDim * 2, 15)

    clearPendingFloorplanNavigationPose()
    controls.current.setLookAt(
      tempCenter.x + distance * 0.7,
      tempCenter.y + distance * 0.5,
      tempCenter.z + distance * 0.7,
      tempCenter.x,
      tempCenter.y,
      tempCenter.z,
      true,
    )
  }, [clearPendingFloorplanNavigationPose, isPreviewMode, previewTargetNodeId])

  useEffect(() => {
    const handleNodeCapture = ({ nodeId }: CameraControlEvent) => {
      if (!controls.current) return

      const position = new Vector3()
      const target = new Vector3()
      controls.current.getPosition(position)
      controls.current.getTarget(target)

      const state = useScene.getState()

      state.updateNode(nodeId, {
        camera: {
          position: [position.x, position.y, position.z],
          target: [target.x, target.y, target.z],
          mode: useViewer.getState().cameraMode,
        },
      })
    }
    const handleNodeView = ({ nodeId }: CameraControlEvent) => {
      if (!controls.current) return

      const node = useScene.getState().nodes[nodeId]
      if (!node?.camera) return
      const { position, target } = node.camera

      clearPendingFloorplanNavigationPose()
      controls.current.setLookAt(
        position[0],
        position[1],
        position[2],
        target[0],
        target[1],
        target[2],
        true,
      )
    }

    const handleTopView = () => {
      if (!controls.current) return

      const currentPolarAngle = controls.current.polarAngle

      // Toggle: if already near top view (< 0.1 radians ≈ 5.7°), go back to 45°
      // Otherwise, go to top view (0°)
      const targetAngle = currentPolarAngle < 0.1 ? Math.PI / 4 : 0

      clearPendingFloorplanNavigationPose()
      controls.current.rotatePolarTo(targetAngle, true)
    }

    const handleOrbitCW = () => {
      if (!controls.current) return

      const currentAzimuth = controls.current.azimuthAngle
      const currentPolar = controls.current.polarAngle
      // Round to nearest 90° increment, then rotate 90° clockwise
      const rounded = Math.round(currentAzimuth / (Math.PI / 2)) * (Math.PI / 2)
      const target = rounded - Math.PI / 2

      clearPendingFloorplanNavigationPose()
      controls.current.rotateTo(target, currentPolar, true)
    }

    const handleOrbitCCW = () => {
      if (!controls.current) return

      const currentAzimuth = controls.current.azimuthAngle
      const currentPolar = controls.current.polarAngle
      // Round to nearest 90° increment, then rotate 90° counter-clockwise
      const rounded = Math.round(currentAzimuth / (Math.PI / 2)) * (Math.PI / 2)
      const target = rounded + Math.PI / 2

      clearPendingFloorplanNavigationPose()
      controls.current.rotateTo(target, currentPolar, true)
    }

    const handleNodeFocus = ({ nodeId }: CameraControlEvent) => {
      focusNode(nodeId)
    }

    const handleFitScene = ({ bounds, reason }: CameraControlFitSceneEvent) => {
      if (!controls.current || isPreviewMode) return
      if (!bounds) {
        // Restore default framing pose when no bounds were computed.
        clearPendingFloorplanNavigationPose()
        controls.current.setLookAt(20, 20, 20, 0, 0, 0, true)
        return
      }
      const [cx, cz] = bounds.center
      const [w, d] = bounds.size
      // Use the longer horizontal extent to size the orbit radius so the whole
      // footprint sits in view regardless of aspect ratio.
      const maxExtent = Math.max(w, d)
      const isFactoryFocus = reason === 'factory-key-process'
      const distance = Math.max(maxExtent * (isFactoryFocus ? 1.05 : 1.4), 15)
      const height = Math.max(maxExtent * (isFactoryFocus ? 0.55 : 0.8), 10)
      clearPendingFloorplanNavigationPose()
      controls.current.setLookAt(cx + distance * 0.7, height, cz + distance * 0.7, cx, 0, cz, true)
    }

    emitter.on('camera-controls:capture', handleNodeCapture)
    emitter.on('camera-controls:focus', handleNodeFocus)
    emitter.on('camera-controls:view', handleNodeView)
    emitter.on('camera-controls:top-view', handleTopView)
    emitter.on('camera-controls:orbit-cw', handleOrbitCW)
    emitter.on('camera-controls:orbit-ccw', handleOrbitCCW)
    emitter.on('camera-controls:fit-scene', handleFitScene)

    const initialFitFrame = requestAnimationFrame(() => {
      const nodes = useScene.getState().nodes as Parameters<typeof pickSceneCameraFocusBounds>[0]
      const focus = pickSceneCameraFocusBounds(nodes)
      const bounds = focus?.bounds ?? computeSceneBoundsXZ(nodes)
      if (bounds) handleFitScene({ bounds, reason: focus?.reason ?? 'scene-bounds' })
    })

    return () => {
      cancelAnimationFrame(initialFitFrame)
      emitter.off('camera-controls:capture', handleNodeCapture)
      emitter.off('camera-controls:focus', handleNodeFocus)
      emitter.off('camera-controls:view', handleNodeView)
      emitter.off('camera-controls:top-view', handleTopView)
      emitter.off('camera-controls:orbit-cw', handleOrbitCW)
      emitter.off('camera-controls:orbit-ccw', handleOrbitCCW)
      emitter.off('camera-controls:fit-scene', handleFitScene)
    }
  }, [clearPendingFloorplanNavigationPose, focusNode, isPreviewMode])

  const onTransitionStart = useCallback(() => {
    if (ignoreLeftSelectControlStartRef.current) return
    useViewer.getState().setCameraDragging(true)
  }, [])

  const onRest = useCallback(() => {
    useViewer.getState().setCameraDragging(false)
  }, [])

  if (isFirstPersonMode) {
    return null
  }

  return (
    <CameraControls
      makeDefault
      dollySpeed={dollySpeed}
      dollyToCursor={dollyToCursor}
      maxDistance={cameraZoomLimits.maxDistance}
      maxZoom={cameraZoomLimits.maxZoom}
      maxPolarAngle={maxPolarAngle}
      minDistance={cameraZoomLimits.minDistance}
      minZoom={cameraZoomLimits.minZoom}
      minPolarAngle={0}
      mouseButtons={mouseButtons}
      onControlEnd={onRest}
      onControlStart={onTransitionStart}
      onEnd={onRest}
      onRest={onRest}
      onSleep={onRest}
      onStart={onTransitionStart}
      onTransitionStart={onTransitionStart}
      ref={controls}
      restThreshold={0.01}
      touches={touches}
      truckSpeed={truckSpeed}
    />
  )
}
