import { ItemNode, useScene } from '@pascal-app/core'
import useViewer from '@pascal-app/viewer/store'
import { useCallback, type Dispatch, type SetStateAction } from 'react'
import {
  createGeneratedAssemblyComponentPack,
  saveGeneratedAssemblyComponentPack,
} from '../../../../../lib/generated-assembly-component-pack'
import {
  placeGeneratedGeometryArtifact,
  replaceGeneratedGeometryArtifactOnCanvas,
  saveGeneratedGeometryArtifactToLocalLibrary,
  type GeneratedGeometryArtifact,
} from '../../../../../lib/ai-generated-geometry'
import type { GeometryAgentRunResponse } from '../../../../../lib/geometry-agent-client-types'
import useEditor from '../../../../../store/use-editor'
import { isRecord } from './chat-utils'
import type { ChatMessage, GeneratedModelArtifact } from './types'

export function useGeneratedArtifactActions({
  latestGeometryArtifactRef,
  setMessages,
}: {
  latestGeometryArtifactRef: { current: GeneratedGeometryArtifact | null }
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}) {
  const updateGeometryArtifact = useCallback((
    artifactId: string,
    updater: (artifact: GeneratedGeometryArtifact) => GeneratedGeometryArtifact,
  ) => {
    setMessages((prev) => prev.map((message) => {
      if (!message.geometryArtifact || message.geometryArtifact.id !== artifactId) return message
      const nextArtifact = updater(message.geometryArtifact)
      if (latestGeometryArtifactRef.current?.id === artifactId) latestGeometryArtifactRef.current = nextArtifact
      return { ...message, geometryArtifact: nextArtifact }
    }))
  }, [latestGeometryArtifactRef, setMessages])

  const updateModelArtifact = useCallback((
    artifactId: string,
    updater: (artifact: GeneratedModelArtifact) => GeneratedModelArtifact,
  ) => {
    setMessages((prev) => prev.map((message) => {
      if (!message.modelArtifact || message.modelArtifact.id !== artifactId) return message
      return { ...message, modelArtifact: updater(message.modelArtifact) }
    }))
  }, [setMessages])

  const updateGeometryAgentAssemblyStatus = useCallback((
    sessionId: string,
    updater: (status: NonNullable<ChatMessage['geometryAgentAssemblyStatus']>) => NonNullable<
      ChatMessage['geometryAgentAssemblyStatus']
    >,
  ) => {
    setMessages((prev) => prev.map((message) => {
      if (message.geometryAgentSession?.sessionId !== sessionId) return message
      return {
        ...message,
        geometryAgentAssemblyStatus: updater(message.geometryAgentAssemblyStatus ?? {}),
      }
    }))
  }, [setMessages])

  const handlePlaceGeneratedAssembly = useCallback((response: GeometryAgentRunResponse) => {
    const patches = response.generatedAssembly?.patches ?? []
    const createOps = patches
      .filter((patch) => patch.op === 'create')
      .map((patch) => ({
        node: patch.node,
        ...(patch.parentId ? { parentId: patch.parentId } : {}),
      }))
    if (createOps.length === 0) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'No generated assembly nodes were available to place.' },
      ])
      return
    }
    try {
      useScene.getState().createNodes(createOps as never)
      updateGeometryAgentAssemblyStatus(response.sessionId, (current) => ({
        ...current,
        placedAt: new Date().toISOString(),
        placedNodeIds: createOps.map((op) => op.node.id),
      }))
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Could not place generated assembly: ${error instanceof Error ? error.message : String(error)}`,
        },
      ])
    }
  }, [setMessages, updateGeometryAgentAssemblyStatus])

  const handleSaveGeneratedAssembly = useCallback(async (response: GeometryAgentRunResponse) => {
    const assembly = response.generatedAssembly
    if (!assembly) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'No generated assembly was available to save.' },
      ])
      return
    }
    try {
      const pack = createGeneratedAssemblyComponentPack({
        id: `geometry-agent-${response.sessionId}`,
        name: assembly.rootNode.name ?? response.memory.userGoal ?? 'Geometry Agent assembly',
        root: assembly.rootNode,
        ir: assembly.ir,
      })
      const assetUrl = await saveGeneratedAssemblyComponentPack(pack)
      updateGeometryAgentAssemblyStatus(response.sessionId, (current) => ({
        ...current,
        savedAt: new Date().toISOString(),
        saveAssetUrl: assetUrl,
      }))
      window.dispatchEvent(new Event('generated-assets:updated'))
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Save to library failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ])
    }
  }, [setMessages, updateGeometryAgentAssemblyStatus])

  const handlePlaceGeometryArtifact = useCallback((artifact: GeneratedGeometryArtifact) => {
    const result = placeGeneratedGeometryArtifact(artifact, { startPlacement: true })
    if (result.nodeIds.length === 0) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'No valid geometry nodes were created.' },
      ])
      return
    }
    updateGeometryArtifact(artifact.id, (current) => ({
      ...current,
      placedAt: new Date().toISOString(),
      placedNodeIds: result.nodeIds,
    }))
  }, [setMessages, updateGeometryArtifact])

  const handleReplaceGeometryArtifact = useCallback((artifact: GeneratedGeometryArtifact) => {
    const result = replaceGeneratedGeometryArtifactOnCanvas(artifact)
    if (result.nodeIds.length === 0) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Could not replace the previous canvas version.' },
      ])
      return
    }
    const replacedAt = new Date().toISOString()
    updateGeometryArtifact(artifact.id, (current) => ({
      ...current,
      placedAt: replacedAt,
      placedNodeIds: result.nodeIds,
      replacedAt,
    }))
  }, [setMessages, updateGeometryArtifact])

  const handleSaveGeometryArtifact = useCallback((artifact: GeneratedGeometryArtifact) => {
    try {
      const savedAt = saveGeneratedGeometryArtifactToLocalLibrary(artifact)
      updateGeometryArtifact(artifact.id, (current) => ({ ...current, savedAt }))
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `保存到素材库失败：${error instanceof Error ? error.message : String(error)}`,
        },
      ])
    }
  }, [setMessages, updateGeometryArtifact])

  const handlePlaceModelArtifact = useCallback((artifact: GeneratedModelArtifact) => {
    const editor = useEditor.getState()
    editor.enterFurnishBuildMode({ openItemsPanel: false })
    editor.setMode('select')

    const levelId = useViewer.getState().selection.levelId
    if (!levelId) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '\u65e0\u6cd5\u653e\u7f6e\u6a21\u578b\uff1a\u5f53\u524d\u573a\u666f\u6ca1\u6709\u53ef\u7528\u697c\u5c42\u3002' },
      ])
      return
    }

    const assetTags = artifact.asset.tags ?? []
    const hasExplicitOffset = Array.isArray(artifact.asset.offset)
    const fallbackY = !hasExplicitOffset && assetTags.includes('image-to-3d')
      ? (artifact.asset.dimensions?.[1] ?? 1) / 2
      : 0

    const node = ItemNode.parse({
      name: artifact.asset.name,
      asset: artifact.asset,
      position: [0, fallbackY, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      parentId: levelId,
      metadata: {
        generatedBy: 'ai-chat',
        sourceTool: artifact.sourceTool,
        artifactId: artifact.id,
        provider: artifact.provider,
      },
    })

    useScene.getState().createNode(node, levelId)
    useViewer.getState().setSelection({ selectedIds: [node.id] })
    updateModelArtifact(artifact.id, (current) => ({
      ...current,
      placedAt: new Date().toISOString(),
    }))
  }, [setMessages, updateModelArtifact])

  const handleSaveModelArtifact = useCallback(async (artifact: GeneratedModelArtifact) => {
    try {
      const res = await fetch('/api/image-to-3d/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: artifact.asset }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(isRecord(data) && typeof data.error === 'string' ? data.error : res.statusText)
      }
      const savedAt = isRecord(data) && typeof data.savedAt === 'string'
        ? data.savedAt
        : new Date().toISOString()
      updateModelArtifact(artifact.id, (current) => ({ ...current, savedAt }))
      window.dispatchEvent(new Event('generated-assets:updated'))
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `\u4fdd\u5b58\u5230\u8d44\u6599\u5e93\u5931\u8d25\uff1a${error instanceof Error ? error.message : String(error)}`,
        },
      ])
    }
  }, [setMessages, updateModelArtifact])

  return {
    handlePlaceGeneratedAssembly,
    handlePlaceGeometryArtifact,
    handlePlaceModelArtifact,
    handleReplaceGeometryArtifact,
    handleSaveGeneratedAssembly,
    handleSaveGeometryArtifact,
    handleSaveModelArtifact,
  }
}
