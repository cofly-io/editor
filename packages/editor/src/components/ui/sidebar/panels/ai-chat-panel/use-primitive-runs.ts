import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { type AnyNode, useScene } from '@pascal-app/core'
import { t } from '../../../../../i18n'
import type { GeneratedGeometryArtifact } from '../../../../../lib/ai-generated-geometry'
import {
  ARTICRAFT_PROGRESS_LINE_LIMIT,
  findPendingPrimitiveRunMessageIndex,
  formatArticraftProgressMessage,
  isRecord,
  safeParseJson,
} from './chat-utils'
import {
  buildDeviceProgressSummary,
  buildGeneratorDslResultSummary,
  buildPrimitiveResourceSelectionSummary,
  buildPrimitiveResultSummary,
  formatPrimitiveRunMessage,
  formatVisibleGeometryResults,
} from './run-summaries'
import type { ChatMessage } from './types'

function debugString(value: unknown, maxLength = 360) {
  if (typeof value === 'string') return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
  try {
    const text = JSON.stringify(value)
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  } catch {
    return String(value)
  }
}

function diagnosticCodesFromDslDowngrade(dslDowngrade: unknown) {
  if (!isRecord(dslDowngrade) || !Array.isArray(dslDowngrade.diagnosticCodes)) return []
  return dslDowngrade.diagnosticCodes.map((code) => String(code)).filter(Boolean)
}

export function usePrimitiveRuns({
  closeRunEventSource,
  hasRunEventSource,
  latestGeometryArtifactRef,
  markRunCancelledFromServer,
  setLoading,
  setMessages,
  trackRunEventSource,
}: {
  closeRunEventSource: (runId: string) => void
  hasRunEventSource: (runId: string) => boolean
  latestGeometryArtifactRef: { current: GeneratedGeometryArtifact | null }
  markRunCancelledFromServer: (runId: string, content?: string) => void
  setLoading: Dispatch<SetStateAction<boolean>>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  trackRunEventSource: (runId: string, source: EventSource) => void
}) {
  const primitiveRunAnalysisRef = useRef<Map<string, string>>(new Map())
  const primitiveRunDebugRef = useRef<Map<string, string[]>>(new Map())

  const completePrimitiveRun = useCallback(
    (runId: string, resultData: unknown) => {
      const data = isRecord(resultData) ? resultData : {}
      const runDebugLines = primitiveRunDebugRef.current.get(runId) ?? []
      const completionDebugDetails = [`runId=${runId}`, '', ...runDebugLines]
        .filter(Boolean)
        .join('\n')

      // generator_dsl route: the run result carries a patch plan instead of
      // a GeneratedGeometryArtifact. Apply it to the scene atomically
      // (all-or-nothing per plan §3.5) before rendering the chat summary.
      // Recipe runs never set generatedAssembly, so this is a no-op for them.
      let dslApply: { applied: boolean; applyError?: string; patchCount: number } | undefined
      if (isRecord(data.generatedAssembly) && Array.isArray(data.generatedAssembly.patches)) {
        const patches = data.generatedAssembly.patches as Array<{
          op: 'create'
          node: AnyNode
          parentId?: string
        }>
        const createOps = patches
          .filter((p) => p && p.op === 'create' && isRecord(p.node))
          .map((p) => ({ node: p.node, ...(p.parentId ? { parentId: p.parentId } : {}) }))
        dslApply = { applied: false, patchCount: createOps.length }
        if (createOps.length > 0) {
          try {
            useScene.getState().createNodes(createOps as never)
            dslApply = { applied: true, patchCount: createOps.length }
          } catch (applyError) {
            dslApply = {
              applied: false,
              patchCount: createOps.length,
              applyError: applyError instanceof Error ? applyError.message : String(applyError),
            }
            console.error('[generator_dsl] failed to apply scene patches', applyError)
          }
        }
      }

      const artifact = isRecord(data.artifact)
        ? (data.artifact as unknown as GeneratedGeometryArtifact)
        : undefined
      const results = Array.isArray(data.results)
        ? data.results.map((item) => String(item)).filter(Boolean)
        : []
      const lastContent = typeof data.lastContent === 'string' ? data.lastContent : ''
      const needsResourceSelection = data.needsResourceSelection === true
      const analysis =
        typeof data.analysis === 'string' ? data.analysis : primitiveRunAnalysisRef.current.get(runId)

      // generator_dsl summary: part count comes from shapeCount (the DSL
      // payload sets it to ir.parts.length); spatial score from metrics.
      const dslSpatialScore = isRecord(data.metrics) && isRecord(data.metrics.primitiveRoute)
        ? (data.metrics.primitiveRoute as { dslSpatialScore?: unknown }).dslSpatialScore
        : undefined
      const primitiveRoute = isRecord(data.metrics) && isRecord(data.metrics.primitiveRoute)
        ? data.metrics.primitiveRoute
        : undefined
      const dslDowngrade = data.dslDowngrade ?? (isRecord(primitiveRoute) ? primitiveRoute.dslDowngrade : undefined)
      const dslDowngradeMessage =
        isRecord(dslDowngrade) && typeof dslDowngrade.message === 'string'
          ? dslDowngrade.message
          : undefined
      const dslDowngradeReason =
        isRecord(dslDowngrade) && typeof dslDowngrade.reason === 'string'
          ? dslDowngrade.reason
          : undefined
      const dslDiagnosticCodes = diagnosticCodesFromDslDowngrade(dslDowngrade)
      const repairCallCount =
        isRecord(primitiveRoute) && typeof primitiveRoute.repairCallCount === 'number'
          ? primitiveRoute.repairCallCount
          : undefined
      const dslFailureSummary =
        dslDowngradeMessage || dslDowngradeReason || dslDiagnosticCodes.length
          ? {
              title: '设备几何需要检查',
              icon: 'mdi:shape-plus',
              status: 'failed' as const,
              description:
                dslDowngradeMessage ??
                'Generator DSL did not produce an assembly that can be applied to the canvas.',
              steps: [
                { label: '理解设备需求', status: 'done' as const },
                { label: 'DSL 路由声明', status: 'done' as const },
                { label: 'DSL 源码生成', status: 'done' as const },
                {
                  label: dslDowngradeReason === 'compile_diagnostics' ? 'Sandbox 编译 / IR' : 'Sandbox 编译 / IR',
                  status: dslDowngradeReason === 'compile_diagnostics' ? ('failed' as const) : ('done' as const),
                },
                {
                  label: dslDowngradeReason === 'spatial_gate_failed' ? '空间质量门失败' : '空间质量门',
                  status: dslDowngradeReason === 'spatial_gate_failed' ? ('failed' as const) : ('pending' as const),
                },
                { label: '应用到画布', status: 'pending' as const },
              ],
              metrics: [
                { label: '路线', value: 'generator_dsl' },
                { label: '诊断码', value: dslDiagnosticCodes.length ? dslDiagnosticCodes.join(', ') : 'none' },
                ...(repairCallCount != null ? [{ label: 'repair', value: `${repairCallCount}` }] : []),
              ],
              details: [
                `runId=${runId}`,
                dslDowngradeReason ? `reason=${dslDowngradeReason}` : undefined,
                dslDiagnosticCodes.length ? `codes=${dslDiagnosticCodes.join(', ')}` : undefined,
                '',
                ...runDebugLines,
              ].filter(Boolean).join('\n'),
            }
          : undefined
      const dslPartCount = typeof data.shapeCount === 'number' ? data.shapeCount : 0
      const dslSummary = dslApply
        ? {
            ...buildGeneratorDslResultSummary({
              partCount: dslPartCount,
              patchCount: dslApply.patchCount,
              ...(typeof dslSpatialScore === 'number' ? { spatialScore: dslSpatialScore } : {}),
              applied: dslApply.applied,
              ...(dslApply.applyError ? { applyError: dslApply.applyError } : {}),
            }),
            ...(completionDebugDetails ? { details: completionDebugDetails } : {}),
          }
        : undefined

      setMessages((prev) => {
        const updated = [...prev]
        const runMessageIndex = updated.findIndex((message) => message.generationRun?.id === runId)
        const generate =
          results.length > 0
            ? formatVisibleGeometryResults(results)
            : lastContent || '(no output)'
        const content = formatPrimitiveRunMessage(analysis, generate)
        const fallbackSummary = needsResourceSelection
          ? buildPrimitiveResourceSelectionSummary(data.resourceSelection)
          : buildPrimitiveResultSummary(artifact)
        const summary = dslSummary
          ? dslSummary
          : dslFailureSummary
            ? dslFailureSummary
            : {
                ...fallbackSummary,
                ...(completionDebugDetails ? { details: completionDebugDetails } : {}),
              }
        const resultMessage: ChatMessage = {
          role: 'assistant',
          content,
          generationRun: { id: runId, mode: 'primitive', status: 'succeeded' },
          factoryRunSummary: summary,
          ...(artifact ? { geometryArtifact: artifact } : {}),
        }
        if (runMessageIndex >= 0) {
          updated[runMessageIndex] = resultMessage
        } else {
          updated.push(resultMessage)
        }
        if (artifact) {
          latestGeometryArtifactRef.current = artifact
          const revisionOf = artifact.revisionOf
          if (revisionOf) {
            for (let i = 0; i < updated.length; i += 1) {
              const message = updated[i]
              if (message?.geometryArtifact?.id === revisionOf) {
                updated[i] = {
                  ...message,
                  geometryArtifact: { ...message.geometryArtifact, supersededBy: artifact.id },
                }
              }
            }
          }
        }
        primitiveRunAnalysisRef.current.delete(runId)
        primitiveRunDebugRef.current.delete(runId)
        return updated
      })
    },
    [latestGeometryArtifactRef, setMessages],
  )

  const subscribePrimitiveRun = useCallback(
    (run: { id: string; prompt: string; status?: string }) => {
      if (hasRunEventSource(run.id)) {
        return
      }
      setLoading(true)

      const progressLines: string[] = []
      primitiveRunDebugRef.current.set(run.id, [])
      setMessages((prev) => {
        if (prev.some((message) => message.generationRun?.id === run.id)) return prev
        const pendingIndex = findPendingPrimitiveRunMessageIndex(prev)
        if (pendingIndex >= 0) {
          const next = [...prev]
          next[pendingIndex] = {
            ...next[pendingIndex]!,
            factoryRunSummary: buildDeviceProgressSummary({
              mode: 'primitive',
              message: 'Restoring primitive geometry run progress.',
            }),
            generationRun: {
              id: run.id,
              mode: 'primitive',
              status: run.status === 'queued' ? 'queued' : 'running',
            },
          }
          return next
        }
        return [
          ...prev,
          {
            role: 'assistant',
            content: '**Generate:**\n_Restoring background geometry generation progress..._',
            factoryRunSummary: buildDeviceProgressSummary({
              mode: 'primitive',
              message: 'Restoring primitive geometry run progress.',
            }),
            generationRun: {
              id: run.id,
              mode: 'primitive',
              status: run.status === 'queued' ? 'queued' : 'running',
            },
          },
        ]
      })

      const source = new EventSource(`/api/ai-harness/runs/${encodeURIComponent(run.id)}/events`)
      trackRunEventSource(run.id, source)

      source.addEventListener('progress', (event) => {
        const parsed = JSON.parse(event.data) as { message?: string; data?: unknown }
        const message = String(parsed.message ?? '').trim()
        if (message) {
          const debugLines = primitiveRunDebugRef.current.get(run.id)
          debugLines?.push(`[progress] ${message}`)
          progressLines.push(message)
          if (progressLines.length > ARTICRAFT_PROGRESS_LINE_LIMIT) {
            progressLines.splice(0, progressLines.length - ARTICRAFT_PROGRESS_LINE_LIMIT)
          }
        }
        setMessages((prev) =>
          prev.map((messageItem) =>
            messageItem.generationRun?.id === run.id
              ? {
                  ...messageItem,
                  content: formatPrimitiveRunMessage(
                    primitiveRunAnalysisRef.current.get(run.id),
                    formatArticraftProgressMessage('', progressLines).trim(),
                  ),
                  factoryRunSummary: buildDeviceProgressSummary({
                    mode: 'primitive',
                    message: message || 'Generating equipment geometry.',
                    detailLines: progressLines,
                    analysis: primitiveRunAnalysisRef.current.get(run.id),
                  }),
                  generationRun: { id: run.id, mode: 'primitive', status: 'running' },
                }
              : messageItem,
          ),
        )
      })

      source.addEventListener('message', (event) => {
        const parsed = safeParseJson(event.data)
        if (!isRecord(parsed)) return
        const stage = isRecord(parsed.data) && typeof parsed.data.stage === 'string'
          ? parsed.data.stage
          : 'message'
        const eventMessage = typeof parsed.message === 'string' ? parsed.message : ''
        const debugLines = primitiveRunDebugRef.current.get(run.id)
        debugLines?.push(`[${stage}] ${debugString(eventMessage || parsed.data)}`)
        if (!isRecord(parsed.data) || parsed.data.stage !== 'analysis') return
        const analysis = typeof parsed.message === 'string' ? parsed.message : ''
        primitiveRunAnalysisRef.current.set(run.id, analysis)
        setMessages((prev) =>
          prev.map((messageItem) =>
            messageItem.generationRun?.id === run.id
              ? {
                  ...messageItem,
                  content: formatPrimitiveRunMessage(analysis, '_Generating..._'),
                  factoryRunSummary: buildDeviceProgressSummary({
                    mode: 'primitive',
                    message: 'Requirement analysis is complete. Generating equipment geometry.',
                    detailLines: progressLines,
                    analysis,
                  }),
                  generationRun: { id: run.id, mode: 'primitive', status: 'running' },
                }
              : messageItem,
          ),
        )
      })

      source.addEventListener('tool-result', (event) => {
        const parsed = safeParseJson(event.data)
        if (!isRecord(parsed)) return
        const message = typeof parsed.message === 'string' ? parsed.message : ''
        if (!message) return
        const debugLines = primitiveRunDebugRef.current.get(run.id)
        debugLines?.push(`[tool-result] ${debugString(message)}`)
        setMessages((prev) =>
          prev.map((messageItem) =>
            messageItem.generationRun?.id === run.id
              ? {
                  ...messageItem,
                  content: formatPrimitiveRunMessage(
                    primitiveRunAnalysisRef.current.get(run.id),
                    message,
                  ),
                  factoryRunSummary: buildDeviceProgressSummary({
                    mode: 'primitive',
                    message: 'Geometry tool returned a result. Preparing equipment asset.',
                    detailLines: [message],
                    analysis: primitiveRunAnalysisRef.current.get(run.id),
                  }),
                  generationRun: { id: run.id, mode: 'primitive', status: 'running' },
                }
              : messageItem,
          ),
        )
      })

      source.addEventListener('result', (event) => {
        const parsed = JSON.parse(event.data) as { data?: unknown }
        const debugLines = primitiveRunDebugRef.current.get(run.id)
        debugLines?.push(`[result] ${debugString(parsed.data)}`)
        closeRunEventSource(run.id)
        completePrimitiveRun(run.id, parsed.data)
      })

      source.addEventListener('error', (event) => {
        const parsed = event instanceof MessageEvent ? safeParseJson(event.data) : null
        if (parsed && isRecord(parsed) && typeof parsed.message === 'string') {
          closeRunEventSource(run.id)
          setMessages((prev) =>
            prev.map((messageItem) =>
              messageItem.generationRun?.id === run.id
                ? {
                    role: 'assistant',
                    content: t('aiChat.error', {
                      fallback: '\u51fa\u9519\u4e86\uff1a{message}',
                      params: { message: String(parsed.message) },
                    }),
                    generationRun: { id: run.id, mode: 'primitive', status: 'failed' },
                  }
                : messageItem,
            ),
          )
          return
        }
        void fetch(`/api/ai-harness/runs/${encodeURIComponent(run.id)}`, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => {
            const currentRun = isRecord(data) && isRecord(data.run) ? data.run : null
            const status =
              currentRun && typeof currentRun.status === 'string' ? currentRun.status : undefined
            if (status === 'succeeded' && currentRun) {
              closeRunEventSource(run.id)
              completePrimitiveRun(run.id, currentRun.result)
              return
            }
            if (status !== 'failed' && status !== 'cancelled') return
            closeRunEventSource(run.id)
            const message =
              currentRun && typeof currentRun.error === 'string'
                ? currentRun.error
                : status === 'cancelled'
                  ? 'Generation cancelled.'
                  : '\u751f\u6210\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5'
            setMessages((prev) =>
              prev.map((messageItem) =>
                messageItem.generationRun?.id === run.id
                  ? {
                      role: 'assistant',
                      content:
                        status === 'cancelled'
                          ? message
                          : t('aiChat.error', {
                              fallback: '\u51fa\u9519\u4e86\uff1a{message}',
                              params: { message },
                            }),
                      generationRun: {
                        id: run.id,
                        mode: 'primitive',
                        status: status as 'failed' | 'cancelled',
                      },
                    }
                  : messageItem,
              ),
            )
          })
          .catch(() => {})
      })

      source.addEventListener('status', (event) => {
        const parsed = event instanceof MessageEvent ? safeParseJson(event.data) : null
        const status =
          isRecord(parsed) && isRecord(parsed.data) && typeof parsed.data.status === 'string'
            ? parsed.data.status
            : undefined
        if (status === 'cancelled') {
          markRunCancelledFromServer(run.id)
        }
      })
    },
    [
      closeRunEventSource,
      completePrimitiveRun,
      hasRunEventSource,
      markRunCancelledFromServer,
      setLoading,
      setMessages,
      trackRunEventSource,
    ],
  )

  return { completePrimitiveRun, subscribePrimitiveRun }
}
