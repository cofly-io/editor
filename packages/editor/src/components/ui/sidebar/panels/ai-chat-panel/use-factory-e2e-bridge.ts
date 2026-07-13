import {
  type AnyNodeId,
  emitter,
  sceneRegistry,
  useLiveData,
  useScene,
} from '@pascal-app/core'
import useViewer from '@pascal-app/viewer/store'
import { useEffect } from 'react'
import { computeSceneBoundsXZ, pickSceneCameraFocusBounds } from '../../../../../lib/scene-bounds'
import useEditor from '../../../../../store/use-editor'
import { applyFactoryRunPatchesToCanvas } from './factory-scene'

export function useFactoryE2eBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const queryEnabled = new URLSearchParams(window.location.search).get('factoryE2e') === '1'
    if (process.env.NEXT_PUBLIC_FACTORY_E2E_SMOKE !== '1' && !queryEnabled) return

    window.__pascalFactoryE2e = {
      sceneNodes: () => useScene.getState().nodes as unknown as Record<string, unknown>,
      applyFactoryRun: (data: unknown) => applyFactoryRunPatchesToCanvas(data),
      cameraView: (view) => {
        if (view === 'isometric') {
          const nodes = useScene.getState()
            .nodes as Parameters<typeof pickSceneCameraFocusBounds>[0]
          const focus = pickSceneCameraFocusBounds(nodes)
          const bounds = focus?.bounds ?? computeSceneBoundsXZ(nodes)
          emitter.emit(
            'camera-controls:fit-scene',
            bounds ? { bounds, reason: focus?.reason ?? 'scene-bounds' } : {},
          )
          return
        }
        if (view === 'top') {
          emitter.emit('camera-controls:top-view')
          return
        }
        emitter.emit('camera-controls:top-view')
        window.setTimeout(() => emitter.emit('camera-controls:orbit-cw'), 0)
      },
      selectNode: (nodeId: string) => {
        if (!nodeId) return
        useViewer.getState().setSelection({ selectedIds: [nodeId as AnyNodeId] })
      },
      clearSelection: () => {
        useViewer.getState().setSelection({ selectedIds: [] })
        useEditor.getState().setEditingAssemblyId(null)
        useEditor.getState().setSelectedMaterialTarget(null)
      },
      setPreviewMode: (enabled: boolean) => {
        useEditor.getState().setPreviewMode(enabled)
      },
      liveDataValue: (path: string) => useLiveData.getState().values[path],
      nodeTransform: (nodeId: string) => {
        const object = sceneRegistry.nodes.get(nodeId as AnyNodeId)
        if (!object) return null
        return {
          position: [object.position.x, object.position.y, object.position.z],
          rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
          scale: [object.scale.x, object.scale.y, object.scale.z],
          visible: object.visible,
        }
      },
      setSelectMode: () => {
        useEditor.setState({
          phase: 'structure',
          structureLayer: 'elements',
          mode: 'select',
          tool: null,
          catalogCategory: null,
          editingAssemblyId: null,
        })
        useEditor.getState().setFloorplanSelectionTool('click')
      },
      selectedIds: () => useViewer.getState().selection.selectedIds.map(String),
      viewerFlags: () => {
        const viewer = useViewer.getState()
        return {
          cameraDragging: viewer.cameraDragging,
          inputDragging: viewer.inputDragging,
          spacePanning: viewer.spacePanning,
        }
      },
    }

    return () => {
      delete window.__pascalFactoryE2e
    }
  }, [])
}
