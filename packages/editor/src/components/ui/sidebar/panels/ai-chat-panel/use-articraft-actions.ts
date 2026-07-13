import { type AnyNode, type AnyNodeId, ItemNode, useScene } from '@pascal-app/core'
import { createModelNodes } from '@pascal-app/articraft-bridge/scene-converter'
import useViewer from '@pascal-app/viewer/store'
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { t } from '../../../../../i18n'
import {
  applyArticraftJointValue,
  parseArticraftPose,
  type ArticraftJointMetadata,
} from '../../../../../lib/articraft-joints'
import { getArticraftMetadata, toSceneJointMetadata } from './articraft-utils'
import { isRecord } from './chat-utils'
import type { ArticraftResult, ChatMessage } from './types'

export function useArticraftActions({
  articraftViewerUrl,
  exportArticraftAsset,
  setMessages,
}: {
  articraftViewerUrl: string
  exportArticraftAsset: (
    result: ArticraftResult,
    saveToLibrary: boolean,
  ) => Promise<{ asset: NonNullable<ArticraftResult['asset']>; savedAt?: string }>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}) {
  const [articraftViewerModal, setArticraftViewerModal] = useState<{
    url: string
    title: string
  } | null>(null)

  const importArticraftResult = useCallback((result: ArticraftResult): number => {
    const levelId = useViewer.getState().selection.levelId
    const scene = useScene.getState()
    const hasArticraftJoints = (result.jointCount ?? 0) > 0 || result.joints.length > 0

    if (result.asset && !hasArticraftJoints) {
      const item = ItemNode.parse({
        name: result.name,
        asset: result.asset,
        position: [0, 0, 0],
        metadata: {
          articraft: {
            ...getArticraftMetadata(result, result.name),
            modelData: result.data,
            joints: result.joints,
            prompt: result.prompt,
          },
        },
      })
      scene.createNode(item, levelId ?? undefined)
      useViewer.getState().setSelection({ selectedIds: [item.id] })
      return 1
    }

    const created = createModelNodes(
      result.data,
      (node, parentId) => {
        scene.createNode(node, parentId)
        return node.id as AnyNodeId
      },
      {
        articulationMode: result.jointCount > 0,
        parentId: levelId ?? undefined,
      },
    )

    const metadataUpdates = created.nodeIds.flatMap((id) => {
      const node = useScene.getState().nodes[id as AnyNodeId]
      if (!node) return []

      const existingMetadata = isRecord(node.metadata) ? node.metadata : {}
      const jointMetadata = created.jointMetadata[id]
      const articraftMetadata = jointMetadata
        ? {
            recordId: result.recordId,
            recordPath: result.recordPath,
            jointName: jointMetadata.jointName,
            parentLink: jointMetadata.parentLink,
            childLink: jointMetadata.childLink,
          }
        : {
            ...getArticraftMetadata(result, node.name ?? id),
            ...(created.rootNodeIds.includes(id)
              ? { modelData: result.data, joints: result.joints, prompt: result.prompt }
              : {}),
          }

      return [
        {
          id: id as AnyNodeId,
          data: {
            metadata: {
              ...existingMetadata,
              articraft: articraftMetadata,
              ...(jointMetadata ? { articraftJoint: toSceneJointMetadata(jointMetadata) } : {}),
            },
          } as unknown as Partial<AnyNode>,
        },
      ]
    })

    if (metadataUpdates.length > 0) {
      useScene.getState().updateNodes(metadataUpdates)
    }

    const selectedRootId = created.rootNodeIds[0] ?? created.nodeIds[0]
    if (selectedRootId) {
      useViewer.getState().setSelection({ selectedIds: [selectedRootId] })
    }

    return created.nodeIds.length
  }, [])

  const getArticraftViewerUrl = useCallback(
    (recordId: string, tab = 'inspect') => {
      const base = articraftViewerUrl.replace(/\/$/, '')
      return `${base}/viewer?record=${encodeURIComponent(recordId)}&tab=${encodeURIComponent(tab)}`
    },
    [articraftViewerUrl],
  )

  const canReachArticraftViewer = useCallback(async (url: string) => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 1500)
    try {
      await fetch(url, {
        cache: 'no-store',
        mode: 'no-cors',
        signal: controller.signal,
      })
      return true
    } catch {
      return false
    } finally {
      window.clearTimeout(timeout)
    }
  }, [])

  const openArticraftViewer = useCallback(
    async (recordId: string, tab?: string) => {
      const resolvedTab = tab ?? 'inspect'
      const url = getArticraftViewerUrl(recordId, resolvedTab)
      if (!(await canReachArticraftViewer(url))) {
        const base = articraftViewerUrl.replace(/\/$/, '')
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Articraft Viewer did not respond at ${base}/viewer. Start \`bun dev:articraft\` from the repository root, or start the viewer separately and try again.`,
          },
        ])
        return
      }
      setArticraftViewerModal({
        url,
        title: resolvedTab === 'code' ? 'Articraft Code' : 'Articraft Viewer',
      })
    },
    [articraftViewerUrl, canReachArticraftViewer, getArticraftViewerUrl, setMessages],
  )

  const closeArticraftViewerModal = useCallback(() => {
    setArticraftViewerModal(null)
  }, [])

  useEffect(() => {
    if (!articraftViewerModal) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeArticraftViewerModal()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [articraftViewerModal, closeArticraftViewerModal])

  const markArticraftImported = useCallback(
    (recordId: string) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.articraftResult?.recordId === recordId
            ? { ...message, articraftResult: { ...message.articraftResult, status: 'imported' } }
            : message,
        ),
      )
    },
    [setMessages],
  )

  const handleImportArticraftResult = useCallback(
    (result: ArticraftResult) => {
      const count = importArticraftResult(result)
      markArticraftImported(result.recordId)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: t('aiChat.articraftImported', {
            fallback: 'Imported {count} Articraft assets.',
            params: { count },
          }),
        },
      ])
    },
    [importArticraftResult, markArticraftImported, setMessages],
  )

  const updateArticraftResult = useCallback(
    (recordId: string, updater: (result: ArticraftResult) => ArticraftResult) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.articraftResult?.recordId === recordId
            ? { ...message, articraftResult: updater(message.articraftResult) }
            : message,
        ),
      )
    },
    [setMessages],
  )

  const handleSaveArticraftAsset = useCallback(
    async (result: ArticraftResult) => {
      try {
        const { asset, savedAt } = await exportArticraftAsset(result, true)
        updateArticraftResult(result.recordId, (current) => ({
          ...current,
          asset,
          assetId: asset.id,
          savedAt,
          previewError: undefined,
        }))
        window.dispatchEvent(new Event('articraft:assets-updated'))
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: asset.id ? `Saved to library: ${asset.id}` : 'Saved to library.',
          },
        ])
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setMessages((prev) => [...prev, { role: 'assistant', content: `Save failed: ${message}` }])
      }
    },
    [exportArticraftAsset, setMessages, updateArticraftResult],
  )

  const handleApplyArticraftPose = useCallback(
    async (result: ArticraftResult) => {
      let pose = parseArticraftPose(window.location.href, result.recordId)
      if (pose.size === 0 && navigator.clipboard?.readText) {
        try {
          pose = parseArticraftPose(await navigator.clipboard.readText(), result.recordId)
        } catch {
          pose = new Map()
        }
      }
      if (pose.size === 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'No Articraft pose data found. Open the Articraft Viewer and try again.',
          },
        ])
        return
      }

      const scene = useScene.getState()
      const updates = Object.values(scene.nodes).flatMap((node) => {
        const metadata = isRecord(node.metadata) ? node.metadata : {}
        const articraft = isRecord(metadata.articraft) ? metadata.articraft : {}
        const joint = isRecord(metadata.articraftJoint) ? metadata.articraftJoint : null
        const jointName = typeof joint?.jointName === 'string' ? joint.jointName : null
        if (
          articraft.recordId !== result.recordId ||
          !jointName ||
          !pose.has(jointName) ||
          !joint
        ) {
          return []
        }
        return [
          {
            id: node.id as AnyNodeId,
            data: applyArticraftJointValue(
              node,
              joint as ArticraftJointMetadata,
              pose.get(jointName)!,
            ),
          },
        ]
      })

      if (updates.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'No matching Articraft joint metadata was found on the canvas.',
          },
        ])
        return
      }

      useScene.getState().updateNodes(updates)
      useViewer.getState().setSelection({ selectedIds: [updates[0]!.id] })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Applied Articraft pose to ${updates.length} nodes.` },
      ])
    },
    [setMessages],
  )

  return {
    articraftViewerModal,
    closeArticraftViewerModal,
    handleApplyArticraftPose,
    handleImportArticraftResult,
    handleSaveArticraftAsset,
    openArticraftViewer,
  }
}
