'use client'

import { type AnyNodeDefinition, registerNode, sceneRegistry, useScene } from '@pascal-app/core'
import { builtinPlugin } from '@pascal-app/nodes'
import { factoryEquipmentPlugin } from '@pascal-app/plugin-factory-equipment'
import { Viewer } from '@pascal-app/viewer'
import { getSceneTheme, SCENE_THEMES } from '@pascal-app/viewer/scene-themes'
import useViewer from '@pascal-app/viewer/store'
import { OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type ReactNode, useEffect, useState } from 'react'

type SceneGraph = { nodes: Record<string, unknown>; rootNodeIds: string[] }

for (const plugin of [builtinPlugin, factoryEquipmentPlugin]) {
  for (const definition of plugin.nodes ?? []) registerNode(definition as AnyNodeDefinition)
}

function RuntimeZonePresentation({ enabled }: { enabled: boolean }) {
  useFrame(() => {
    for (const id of sceneRegistry.byType.zone ?? []) {
      const zone = sceneRegistry.nodes.get(id)
      if (!zone) continue

      zone.visible = enabled
      const label = document.getElementById(`${id}-label`)
      if (label) label.style.opacity = enabled ? '1' : '0'

      zone.traverse(
        (child: {
          isMesh?: boolean
          material?: { userData?: { uOpacity?: { value?: number } } }
          visible: boolean
        }) => {
          if (!('isMesh' in child) || !child.isMesh) return
          child.visible = enabled
          const opacity = child.material?.userData?.uOpacity
          if (opacity) opacity.value = enabled ? 1 : 0
        },
      )
    }
  })

  return null
}

function DisplaySettings({
  showGrid,
  showZones,
  onShowGridChange,
  onShowZonesChange,
}: {
  showGrid: boolean
  showZones: boolean
  onShowGridChange: (value: boolean) => void
  onShowZonesChange: (value: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const shadows = useViewer((state) => state.shadows)
  const setShadows = useViewer((state) => state.setShadows)
  const shading = useViewer((state) => state.shading)
  const setShading = useViewer((state) => state.setShading)
  const edges = useViewer((state) => state.edges)
  const setEdges = useViewer((state) => state.setEdges)
  const sceneTheme = useViewer((state) => state.sceneTheme)
  const setSceneTheme = useViewer((state) => state.setSceneTheme)

  return (
    <div style={{ position: 'fixed', right: 16, top: 16, zIndex: 10 }}>
      <button
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={buttonStyle}
        type="button"
      >
        显示
      </button>
      {open ? (
        <div style={panelStyle}>
          <Toggle checked={showGrid} label="网格" onChange={onShowGridChange} />
          <Toggle checked={showZones} label="区域" onChange={onShowZonesChange} />
          <Toggle checked={shadows} label="阴影" onChange={setShadows} />
          <Setting label="渲染">
            <select
              onChange={(event) => setShading(event.target.value as typeof shading)}
              value={shading}
            >
              <option value="rendered">Rendered</option>
              <option value="solid">Solid</option>
            </select>
          </Setting>
          <Setting label="边线">
            <select
              onChange={(event) => setEdges(event.target.value as typeof edges)}
              value={edges}
            >
              <option value="off">关闭</option>
              <option value="soft">柔和</option>
              <option value="strong">清晰</option>
            </select>
          </Setting>
          <Setting label="主题">
            <select onChange={(event) => setSceneTheme(event.target.value)} value={sceneTheme}>
              {SCENE_THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </Setting>
        </div>
      ) : null}
    </div>
  )
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (value: boolean) => void
}) {
  return (
    <label style={rowStyle}>
      <span>{label}</span>
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  )
}

function Setting({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label style={rowStyle}>
      <span>{label}</span>
      {children}
    </label>
  )
}

const buttonStyle = {
  background: 'rgba(20, 20, 20, 0.88)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: 8,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  padding: '8px 12px',
}

const panelStyle = {
  background: 'rgba(20, 20, 20, 0.94)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: 8,
  color: '#fff',
  display: 'grid',
  gap: 10,
  marginTop: 8,
  minWidth: 180,
  padding: 12,
}

const rowStyle = {
  alignItems: 'center',
  display: 'flex',
  fontSize: 13,
  justifyContent: 'space-between',
  gap: 16,
}

export default function RuntimePage() {
  const [error, setError] = useState<string | null>(null)
  const [showGrid, setShowGrid] = useState(false)
  const [showZones, setShowZones] = useState(false)
  const setShowGridPreference = useViewer((state) => state.setShowGrid)
  const theme = useViewer((state) => getSceneTheme(state.sceneTheme))

  useEffect(() => {
    setShowGridPreference(false)
  }, [setShowGridPreference])

  useEffect(() => {
    fetch('runtime-bundle/scene.json')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Scene load failed (${response.status})`)
        return response.json() as Promise<SceneGraph>
      })
      .then((scene) =>
        useScene.getState().setScene(scene.nodes as never, scene.rootNodeIds as never),
      )
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Scene load failed'),
      )
  }, [])

  if (error) return <main style={{ padding: 24 }}>{error}</main>
  return (
    <main style={{ height: '100vh', width: '100vw' }}>
      <DisplaySettings
        onShowGridChange={setShowGrid}
        onShowZonesChange={setShowZones}
        showGrid={showGrid}
        showZones={showZones}
      />
      <Viewer
        activeFrameLoop
        defaultRender={{ colorPreset: 'clay', shading: 'rendered', textures: true }}
        renderContext="presentation"
        selectionManager="default"
      >
        <OrbitControls
          enableDamping
          makeDefault
          maxDistance={400}
          minDistance={2}
          mouseButtons={{ LEFT: 2, MIDDLE: 1, RIGHT: 0 }}
          target={[0, 0, 0]}
        />
        <gridHelper
          args={[100, 100, theme.appearance === 'dark' ? '#777788' : '#999999', theme.ground]}
          position={[0, 0.01, 0]}
          visible={showGrid}
        />
        <RuntimeZonePresentation enabled={showZones} />
      </Viewer>
    </main>
  )
}
