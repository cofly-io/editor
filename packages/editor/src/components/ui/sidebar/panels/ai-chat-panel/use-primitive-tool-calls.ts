import { useCallback, type Dispatch, type SetStateAction } from 'react'
import {
  executeGeometryToolCall,
  type GeometryToolExecutionResult,
} from '../../../../../lib/ai-geometry-tool-executor'
import { buildPrimitiveRepairStopMessage } from '../../../../../lib/ai-chat-harness'
import {
  replaceGeneratedGeometryArtifactOnCanvas,
  type GeneratedGeometryArtifact,
} from '../../../../../lib/ai-generated-geometry'
import { t } from '../../../../../i18n'
import {
  parseToolArguments,
  throwIfAborted,
} from './chat-utils'
import {
  compactGeometryRepairMemory,
  formatVisibleGeometryResults,
  GEOMETRY_REPAIR_COMPRESSION_INTERVAL,
  GEOMETRY_REPAIR_STAGNATION_LIMIT,
  geometryRepairIssues,
  geometryRepairSignature,
} from './run-summaries'
import type { ApiMessage, ChatMessage } from './types'
import type { ComposeTool } from './geometry-tools'

type ChatApiCaller = (
  apiMessages: ApiMessage[],
  tools?: ComposeTool[],
  signal?: AbortSignal,
) => Promise<{
  role: string
  content?: string
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
}>

export function usePrimitiveToolCalls({
  callApi,
  latestGeometryArtifactRef,
  setMessages,
}: {
  callApi: ChatApiCaller
  latestGeometryArtifactRef: { current: GeneratedGeometryArtifact | null }
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}) {
  const executeToolCall = useCallback((
    name: string,
    args: Record<string, unknown>,
    context: {
      prompt: string
      revisionOf?: string
      revisionVersion?: number
      replaceNodeIds?: string[]
      revisionTarget?: GeneratedGeometryArtifact | null
    },
  ): GeometryToolExecutionResult => executeGeometryToolCall(name, args, context, {
    messages: {
      unknownTool: (toolName) => t('aiChat.unknownTool', { fallback: 'Unknown tool: {name}', params: { name: toolName } }),
      noShapes: t('aiChat.noShapes', 'No geometry could be created.'),
    },
  }), [])

  const processToolCalls = useCallback(
    async (
      response: {
        role: string
        content?: string
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
      },
      apiMessages: ApiMessage[],
      tools: ComposeTool[],
      label: string,
      context: { prompt: string; revisionTarget?: GeneratedGeometryArtifact | null },
      signal?: AbortSignal,
    ): Promise<{ results: string[]; lastContent: string; artifact?: GeneratedGeometryArtifact }> => {
      const allResults: string[] = []
      let createdArtifact: GeneratedGeometryArtifact | undefined
      let currentResponse = response
      let lastContent = response.content ?? ''
      let repairAttempt = 0
      let stagnantAttempts = 0
      let bestIssueCount = Number.POSITIVE_INFINITY
      let lastFailureSignature = ''
      const repairMemory: string[] = []
      const seedApiMessages = apiMessages.slice()

      while (currentResponse.tool_calls?.length) {
        throwIfAborted(signal)
        repairAttempt += 1
        const toolResultApiMsgs: ApiMessage[] = []
        const geometryToolCalls = currentResponse.tool_calls.filter((tc) =>
          tc.function.name === 'compose_primitive' ||
          tc.function.name === 'compose_recipe' ||
          tc.function.name === 'compose_assembly' ||
          tc.function.name === 'compose_parts' ||
          tc.function.name === 'compose_robot_arm' ||
          tc.function.name === 'revise_geometry'
        )

        if (geometryToolCalls.length > 1) {
          for (const tc of currentResponse.tool_calls) {
            const result = [
              'Invalid generation plan. Nothing was created.',
              'Call exactly ONE geometry tool for the complete object.',
              'Do not split one object across compose_assembly + compose_recipe + compose_parts + compose_primitive, because attachTo indexes are local to a single tool call.',
            ].join('\n')
            toolResultApiMsgs.push({ role: 'tool', tool_call_id: tc.id, content: result })
            allResults.push(result)
          }
        } else {
          for (const tc of currentResponse.tool_calls) {
            throwIfAborted(signal)
            let toolArgs: Record<string, unknown>
            try {
              toolArgs = parseToolArguments(tc.function.arguments)
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              const result = [
                'Invalid tool arguments JSON. Nothing was created.',
                `Tool "${tc.function.name}" arguments could not be parsed: ${message}`,
                'Call exactly one geometry tool again with strict JSON arguments only.',
                'Do not include comments, formulas, markdown, trailing commas, or text outside JSON.',
                'Precompute all polygon/profile coordinates as numeric literals before calling the tool.',
              ].join('\n')
              toolResultApiMsgs.push({ role: 'tool', tool_call_id: tc.id, content: result })
              allResults.push(result)
              continue
            }
            const isRevisionTool = tc.function.name === 'revise_geometry'
            const result = executeToolCall(tc.function.name, toolArgs, {
              prompt: context.prompt,
              revisionOf: isRevisionTool ? context.revisionTarget?.id : undefined,
              revisionVersion: isRevisionTool ? context.revisionTarget?.version : undefined,
              replaceNodeIds: isRevisionTool ? context.revisionTarget?.placedNodeIds : undefined,
              revisionTarget: context.revisionTarget,
            })
            toolResultApiMsgs.push({ role: 'tool', tool_call_id: tc.id, content: result.content })
            allResults.push(result.content)
            if (result.artifact) {
              createdArtifact = result.artifact
              if (
                context.revisionTarget?.placedNodeIds?.length &&
                result.artifact.replaceNodeIds?.length &&
                !result.artifact.replacedAt
              ) {
                const replacement = replaceGeneratedGeometryArtifactOnCanvas(result.artifact)
                if (replacement.nodeIds.length > 0) {
                  const replacedAt = new Date().toISOString()
                  createdArtifact = {
                    ...result.artifact,
                    placedAt: replacedAt,
                    placedNodeIds: replacement.nodeIds,
                    replacedAt,
                  }
                  allResults[allResults.length - 1] = `${result.content}\nAuto-replaced previous canvas version.`
                }
              }
            }
          }
        }

        setMessages((prev) => {
          const updated = [...prev]
          const content = `**${label}:**\n${formatVisibleGeometryResults(allResults)}`
          if (createdArtifact) {
            updated[updated.length - 1] = { role: 'assistant', content, geometryArtifact: createdArtifact }
            if (context.revisionTarget) {
              for (let i = 0; i < updated.length - 1; i += 1) {
                const message = updated[i]
                if (message?.geometryArtifact?.id === context.revisionTarget.id) {
                  updated[i] = {
                    ...message,
                    geometryArtifact: { ...message.geometryArtifact, supersededBy: createdArtifact.id },
                  }
                }
              }
            }
            latestGeometryArtifactRef.current = createdArtifact
          } else {
            updated[updated.length - 1] = { role: 'assistant', content }
          }
          return updated
        })

        apiMessages.push({
          role: 'assistant',
          content: currentResponse.content ?? '',
          tool_calls: currentResponse.tool_calls.map((tc) => ({
            type: 'function' as const,
            id: tc.id,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        } as Record<string, unknown> as never)
        apiMessages.push(...toolResultApiMsgs)

        if (
          toolResultApiMsgs.some(
            (msg) => typeof msg.content === 'string' && msg.content.startsWith('Created '),
          )
        ) {
          break
        }

        const roundFailureContent = toolResultApiMsgs
          .map((msg) => (typeof msg.content === 'string' ? msg.content : ''))
          .filter(Boolean)
          .join('\n')
        const currentIssueCount = Math.max(1, geometryRepairIssues(roundFailureContent).length)
        const currentSignature = geometryRepairSignature(roundFailureContent)
        if (currentIssueCount < bestIssueCount) {
          bestIssueCount = currentIssueCount
          stagnantAttempts = 0
        } else if (currentSignature === lastFailureSignature || currentIssueCount >= bestIssueCount) {
          stagnantAttempts += 1
        } else {
          stagnantAttempts = Math.max(0, stagnantAttempts - 1)
        }
        lastFailureSignature = currentSignature
        repairMemory.push(compactGeometryRepairMemory(repairAttempt, roundFailureContent))

        if (stagnantAttempts >= GEOMETRY_REPAIR_STAGNATION_LIMIT) {
          allResults.push(
            buildPrimitiveRepairStopMessage({
              failureContent: roundFailureContent,
              stagnantLimit: GEOMETRY_REPAIR_STAGNATION_LIMIT,
              compressedMemoryKept: true,
            }),
          )
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = {
              role: 'assistant',
              content: `**${label}:**\n${formatVisibleGeometryResults(allResults)}`,
            }
            return updated
          })
          break
        }

        if (repairAttempt % GEOMETRY_REPAIR_COMPRESSION_INTERVAL === 0) {
          apiMessages.splice(
            0,
            apiMessages.length,
            ...seedApiMessages,
            {
              role: 'user',
              content: [
                'Compressed geometry repair memory from prior invalid tool calls:',
                ...repairMemory.slice(-GEOMETRY_REPAIR_COMPRESSION_INTERVAL),
                '',
                'Use this memory to produce one complete replacement geometry tool call.',
                'Do not repeat a missing semantic role; add the required part, switch to compose_assembly for open-ended complete objects, or switch to the supported compose_parts blueprint for explicit reusable parts.',
              ].join('\n'),
            },
          )
        }

        currentResponse = await callApi(apiMessages, tools, signal)
        if (currentResponse.content) lastContent = currentResponse.content
      }

      return { results: allResults, lastContent, artifact: createdArtifact }
    },
    [callApi, executeToolCall, latestGeometryArtifactRef, setMessages],
  )

  return { processToolCalls }
}
