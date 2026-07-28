import { type AnyNode, useScene } from '@pascal-app/core'
import type { GeneratedAssemblyNode, GeneratedMeshNode } from '@pascal-app/core/schema'
import type { Dispatch, SetStateAction } from 'react'
import {
  createGeometryAgentSessionClient,
  geometryAgentDebugDetails,
  sendGeometryAgentMessageClient,
} from '../../../../../lib/geometry-agent-client'
import type { GeometryAgentRunResponse } from '../../../../../lib/geometry-agent-client-types'
import { commitGeneratedAssemblyRerun } from '../../../../../lib/generated-assembly-rerun'
import { t } from '../../../../../i18n'
import { isAbortError } from './chat-utils'
import { buildGeometryAgentResultSummary } from './run-summaries'
import type { ChatImageAttachment, ChatMessage } from './types'

function latestGeometryAgentResponse(messages: readonly ChatMessage[]): GeometryAgentRunResponse | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const response = messages[index]?.geometryAgentSession
    if (response?.sessionId) return response
  }
  return null
}

export function shouldUseGeometryAgentForPrimitivePrompt(input: {
  text: string
  messages: readonly ChatMessage[]
}): boolean {
  if (latestGeometryAgentResponse(input.messages)) return true
  const text = input.text.trim().toLowerCase()
  if (!text) return false
  return (
    /\b(conveyor|belt\s*conveyor|pump|motor|tank|cabinet|guard|cover|flange|pipe|valve|hopper|filter|platform|ladder|handrail|machine|equipment)\b/i.test(
      text,
    ) ||
    /(?:输送机|皮带|泵|水泵|电机|电动机|储罐|罐体|控制柜|电柜|防护罩|护罩|罩子|检修门|法兰|管道|阀门|料斗|过滤器|平台|梯子|扶手|设备|机器)/.test(
      text,
    )
  )
}

function applyGeneratedAssembly(response: GeometryAgentRunResponse): {
  applied: boolean
  patchCount: number
  applyError?: string
} {
  const patches = response.generatedAssembly?.patches ?? []
  const createOps = patches
    .filter((patch) => patch.op === 'create')
    .map((patch) => ({ node: patch.node as AnyNode, ...(patch.parentId ? { parentId: patch.parentId } : {}) }))
  if (createOps.length === 0) return { applied: false, patchCount: 0 }
  try {
    useScene.getState().createNodes(createOps as never)
    return { applied: true, patchCount: createOps.length }
  } catch (error) {
    return {
      applied: false,
      patchCount: createOps.length,
      applyError: error instanceof Error ? error.message : String(error),
    }
  }
}

function generatedAssemblyPartNodesFromRoot(
  root: GeneratedAssemblyNode,
  nodes: Record<string, AnyNode>,
): GeneratedMeshNode[] {
  const partNodes: GeneratedMeshNode[] = []
  const visited = new Set<string>()
  const queue = [...(root.children ?? [])]

  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (!nodeId || visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodes[nodeId]
    if (!node) continue
    if (node.type === 'generated-mesh') partNodes.push(node as GeneratedMeshNode)
    if ('children' in node && Array.isArray(node.children)) queue.push(...node.children)
  }

  return partNodes
}

function buildRerunContextFromScene(response: GeometryAgentRunResponse) {
  const rootId = response.generatedAssembly?.rootNode.id
  const previousIr = response.generatedAssembly?.ir
  if (!rootId || !previousIr) return null
  const scene = useScene.getState()
  const root = scene.nodes[rootId]
  if (!root || root.type !== 'generated-assembly') return null
  const existingParts = generatedAssemblyPartNodesFromRoot(root as GeneratedAssemblyNode, scene.nodes)
  return {
    existingRoot: root as GeneratedAssemblyNode,
    existingParts,
    previousIr,
    detectedAt: new Date().toISOString(),
  }
}

function applyRerunPlan(response: GeometryAgentRunResponse): {
  applied: boolean
  patchCount: number
  applyError?: string
} {
  const rootId = response.rerunPlan?.updates[0]?.id
  if (!rootId || !response.rerunPlan) return { applied: false, patchCount: 0 }
  const root = useScene.getState().nodes[rootId]
  if (!root || root.type !== 'generated-assembly') {
    return { applied: false, patchCount: 0, applyError: 'Generated assembly root is missing.' }
  }
  const result = commitGeneratedAssemblyRerun(
    useScene,
    rootId,
    (root as GeneratedAssemblyNode).revision ?? 0,
    response.rerunPlan,
  )
  if (result.kind !== 'committed') {
    return {
      applied: false,
      patchCount: 0,
      applyError:
        result.kind === 'conflict'
          ? `Assembly changed while rerun was pending (${result.expectedRevision} → ${result.actualRevision}).`
          : 'Generated assembly root is missing.',
    }
  }
  return {
    applied: true,
    patchCount:
      response.rerunPlan.updates.length +
      response.rerunPlan.creates.length +
      response.rerunPlan.deletes.length,
  }
}

export function useGeometryAgentChat({
  activeAbortControllerRef,
  input,
  loading,
  markGenerationStopped,
  messages,
  setImageAttachment,
  setInput,
  setLoading,
  setMessages,
}: {
  activeAbortControllerRef: { current: AbortController | null }
  input: string
  loading: boolean
  markGenerationStopped: (content?: string) => void
  messages: ChatMessage[]
  setImageAttachment: Dispatch<SetStateAction<ChatImageAttachment | undefined>>
  setInput: Dispatch<SetStateAction<string>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}) {
  const sendGeometryAgentMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return

    const controller = new AbortController()
    activeAbortControllerRef.current = controller
    setInput('')
    setImageAttachment(undefined)
    setLoading(true)

    const previousResponse = latestGeometryAgentResponse(messages)
    const existingSessionId = previousResponse?.sessionId ?? null
    const runId = existingSessionId ?? `geo_agent_pending_${Date.now()}`
    const userMsg: ChatMessage = { role: 'user', content: text }
    const pendingMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      generationRun: { id: runId, mode: 'geometry-agent', status: 'running' },
      factoryRunSummary: buildGeometryAgentResultSummary({
        prompt: text,
        status: 'running',
        isEdit: Boolean(existingSessionId),
      }),
    }
    setMessages((prev) => [...prev, userMsg, pendingMsg])

    try {
      const response = existingSessionId
        ? await sendGeometryAgentMessageClient(
            existingSessionId,
            {
              instruction: text,
              ...(previousResponse
                ? { rerun: buildRerunContextFromScene(previousResponse) ?? undefined }
                : {}),
            },
            { signal: controller.signal },
          )
        : await createGeometryAgentSessionClient(
            { mode: 'text', prompt: text },
            { signal: controller.signal },
          )

      const applyResult = existingSessionId ? applyRerunPlan(response) : applyGeneratedAssembly(response)
      const summary = buildGeometryAgentResultSummary({
        prompt: text,
        status:
          response.result.kind === 'ok' && (applyResult.applied || existingSessionId)
            ? 'succeeded'
            : 'failed',
        response,
        isEdit: Boolean(existingSessionId),
        applied: applyResult.applied,
        patchCount: applyResult.patchCount,
        applyError: applyResult.applyError,
      })

      setMessages((prev) =>
        prev.map((message) =>
          message.generationRun?.id === runId
            ? {
                role: 'assistant',
                content:
                  response.lastRun?.changeFeedback?.text ??
                  response.lastRun?.summary ??
                  'Geometry agent run completed.',
                generationRun: {
                  id: response.sessionId,
                  mode: 'geometry-agent',
                  status: summary.status === 'succeeded' ? 'succeeded' : 'failed',
                },
                factoryRunSummary: summary,
                geometryAgentSession: response,
              }
            : message,
        ),
      )
    } catch (error) {
      if (isAbortError(error)) {
        markGenerationStopped()
        return
      }
      const message = String((error as { message?: unknown } | null)?.message ?? error)
      setMessages((prev) =>
        prev.map((item) =>
          item.generationRun?.id === runId
            ? {
                role: 'assistant',
                content: t('aiChat.error', {
                  fallback: '出错了：{message}',
                  params: { message },
                }),
                generationRun: { id: runId, mode: 'geometry-agent', status: 'failed' },
                factoryRunSummary: buildGeometryAgentResultSummary({
                  prompt: text,
                  status: 'failed',
                  isEdit: Boolean(existingSessionId),
                  debugDetails: `runId=${runId}\n${message}`,
                }),
              }
            : item,
        ),
      )
    } finally {
      if (activeAbortControllerRef.current === controller) activeAbortControllerRef.current = null
      setLoading(false)
    }
  }

  return { sendGeometryAgentMessage }
}

export function geometryAgentSessionDebugDetails(message: ChatMessage): string | undefined {
  return message.geometryAgentSession
    ? geometryAgentDebugDetails(message.geometryAgentSession)
    : message.factoryRunSummary?.details
}
