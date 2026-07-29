import { Icon } from '@iconify/react'
import type { GeneratedGeometryArtifact } from '../../../../../lib/ai-generated-geometry'
import { t } from '../../../../../i18n'
import { cn } from '../../../../../lib/utils'
import {
  articraftResultToModelArtifact,
  FactoryRunSummaryCard,
  GeneratedAssemblyCard,
  GeneratedGeometryCard,
  GeneratedModelCard,
  GeneratedModelPreview,
} from './artifact-cards'
import type { GeometryAgentRunResponse } from '../../../../../lib/geometry-agent-client-types'
import type {
  ArticraftResult,
  ChatImageAttachment,
  ChatMessage,
  GeneratedModelArtifact,
  ImageTo3DResult,
} from './types'

export function ChatMessageList({
  disabled,
  handleApplyArticraftPose,
  handleImportArticraftResult,
  handlePlaceGeneratedAssembly,
  handlePlaceGeometryArtifact,
  handlePlaceModelArtifact,
  handleReplaceGeometryArtifact,
  handleSaveArticraftAsset,
  handleSaveGeneratedAssembly,
  handleSaveGeometryArtifact,
  handleSaveModelArtifact,
  handleSelectImageTo3DAsset,
  latestVisibleGeometryArtifactId,
  messages,
  onApplyFactoryRun,
  openArticraftViewer,
  sendArticraftMessage,
  sendImageTo3DMessage,
  sendMessage,
}: {
  disabled: boolean
  handleApplyArticraftPose: (result: ArticraftResult) => void
  handleImportArticraftResult: (result: ArticraftResult) => void
  handlePlaceGeneratedAssembly: (response: GeometryAgentRunResponse) => void
  handlePlaceGeometryArtifact: (artifact: GeneratedGeometryArtifact) => void
  handlePlaceModelArtifact: (artifact: GeneratedModelArtifact) => void
  handleReplaceGeometryArtifact: (artifact: GeneratedGeometryArtifact) => void
  handleSaveArticraftAsset: (result: ArticraftResult) => void
  handleSaveGeneratedAssembly: (response: GeometryAgentRunResponse) => void
  handleSaveGeometryArtifact: (artifact: GeneratedGeometryArtifact) => void
  handleSaveModelArtifact: (artifact: GeneratedModelArtifact) => void
  handleSelectImageTo3DAsset: (asset: ImageTo3DResult['asset']) => void
  latestVisibleGeometryArtifactId?: string
  messages: ChatMessage[]
  onApplyFactoryRun: (runId: string, data: unknown) => void
  openArticraftViewer: (recordId: string, tab?: string) => Promise<void>
  sendArticraftMessage: (text: string, image?: ChatImageAttachment) => Promise<void>
  sendImageTo3DMessage: (text: string, image?: ChatImageAttachment) => Promise<void>
  sendMessage: (overrideText?: string) => Promise<void>
}) {
  return (
    <>
      {messages.map((msg, i) => (
        <div
          className={cn(
            'rounded-lg px-2.5 py-1.5 text-xs leading-relaxed',
            msg.role === 'user'
              ? 'bg-accent/60 text-foreground'
              : msg.isToolResult
                ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : 'bg-transparent text-muted-foreground',
          )}
          key={`${msg.role}-${i}`}
        >
          {msg.role === 'user' ? (
            <div className="space-y-1.5">
              {msg.image ? (
                <img
                  alt={msg.image.name}
                  className="max-h-32 rounded-md border border-border/50 object-contain"
                  src={msg.image.dataUrl}
                />
              ) : null}
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          ) : msg.factoryRunSummary &&
            !msg.geometryAgentSession?.generatedAssembly &&
            !msg.modelArtifact &&
            !msg.geometryArtifact &&
            !msg.imageTo3dResult &&
            !msg.articraftResult ? (
            <FactoryRunSummaryCard
              disabled={disabled}
              onApply={
                msg.factoryRunDraft &&
                msg.generationRun &&
                msg.factoryRunSummary.status === 'succeeded'
                  ? () => onApplyFactoryRun(msg.generationRun!.id, msg.factoryRunDraft)
                  : undefined
              }
              onResourceOptionSelect={(option) => {
                void sendMessage(option.prompt)
              }}
              summary={msg.factoryRunSummary}
            />
          ) : msg.geometryAgentSession?.generatedAssembly ? (
            <div className="space-y-2">
              {msg.factoryRunSummary ? <FactoryRunSummaryCard summary={msg.factoryRunSummary} /> : null}
              <GeneratedAssemblyCard
                disabled={disabled}
                onPlace={handlePlaceGeneratedAssembly}
                onSave={handleSaveGeneratedAssembly}
                response={msg.geometryAgentSession}
                status={msg.geometryAgentAssemblyStatus}
              />
            </div>
          ) : msg.modelArtifact ? (
            <div className="space-y-2">
              {msg.factoryRunSummary ? <FactoryRunSummaryCard summary={msg.factoryRunSummary} /> : null}
              <GeneratedModelCard
                artifact={msg.modelArtifact}
                disabled={disabled}
                onPlace={handlePlaceModelArtifact}
                onSave={handleSaveModelArtifact}
              />
            </div>
          ) : msg.geometryArtifact ? (
            <div className="space-y-2">
              {msg.factoryRunSummary ? <FactoryRunSummaryCard summary={msg.factoryRunSummary} /> : null}
              <GeneratedGeometryCard
                artifact={msg.geometryArtifact}
                disabled={disabled}
                interactivePreview={msg.geometryArtifact.id === latestVisibleGeometryArtifactId}
                onPlace={handlePlaceGeometryArtifact}
                onReplace={handleReplaceGeometryArtifact}
                onSave={handleSaveGeometryArtifact}
              />
            </div>
          ) : msg.toolCalls ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="size-3.5 shrink-0" icon="mdi:tools" />
              <span>
                {t('aiChat.calling', 'Calling tools...')}{' '}
                {msg.toolCalls.map((tc) => tc.name).join(', ')}
              </span>
            </div>
          ) : msg.imageTo3dResult ? (
            <div className="space-y-2">
              {msg.factoryRunSummary ? <FactoryRunSummaryCard summary={msg.factoryRunSummary} /> : null}
              <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-2 text-foreground">
                <div className="flex items-start gap-2">
                  <img
                    alt={msg.imageTo3dResult.asset.name ?? msg.imageTo3dResult.asset.id}
                    className="size-14 shrink-0 rounded-md border border-border/50 object-cover"
                    src={msg.imageTo3dResult.asset.thumbnail}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {msg.imageTo3dResult.asset.name ?? msg.imageTo3dResult.asset.id}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {msg.imageTo3dResult.asset.id}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {msg.imageTo3dResult.saved ? 'Saved to library' : 'Not saved'} {'\u00b7'}{' '}
                      {msg.imageTo3dResult.asset.category ?? 'equipment'}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-violet-400/40 bg-violet-400/10 px-1.5 py-0.5 text-[10px] text-violet-300">
                    Image to 3D
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-[#a684ff]/50 hover:text-[#a684ff] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => handleSelectImageTo3DAsset(msg.imageTo3dResult!.asset)}
                    type="button"
                  >
                    <Icon className="size-3.5" icon="mdi:package-variant-closed" />
                    Use in catalog
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-[#a684ff]/50 hover:text-[#a684ff] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => sendImageTo3DMessage(msg.imageTo3dResult!.prompt, msg.image)}
                    type="button"
                  >
                    <Icon className="size-3.5" icon="mdi:refresh" />
                    Regenerate
                  </button>
                </div>
              </div>
            </div>
          ) : msg.articraftResult ? (
            <div className="space-y-2">
              {msg.factoryRunSummary ? <FactoryRunSummaryCard summary={msg.factoryRunSummary} /> : null}
              <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-2 text-foreground">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{msg.articraftResult.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      Record: {msg.articraftResult.recordId || '-'}
                    </div>
                    {msg.articraftResult.recordPath ? (
                      <div
                        className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground"
                        title={msg.articraftResult.recordPath}
                      >
                        Path: {msg.articraftResult.recordPath}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]',
                      msg.articraftResult.status === 'imported'
                        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                        : 'border-sky-400/40 bg-sky-400/10 text-sky-300',
                    )}
                  >
                    {msg.articraftResult.status === 'imported' ? 'Imported' : 'Ready'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[11px]">
                  <div className="rounded border border-border/50 bg-accent/20 px-2 py-1">
                    <div className="text-muted-foreground">Parts</div>
                    <div className="font-medium">{msg.articraftResult.partCount}</div>
                  </div>
                  <div className="rounded border border-border/50 bg-accent/20 px-2 py-1">
                    <div className="text-muted-foreground">Joints</div>
                    <div className="font-medium">{msg.articraftResult.jointCount}</div>
                  </div>
                  <div className="rounded border border-border/50 bg-accent/20 px-2 py-1">
                    <div className="text-muted-foreground">Status</div>
                    <div className="font-medium">
                      {msg.articraftResult.status === 'imported' ? 'Imported' : 'Ready'}
                    </div>
                  </div>
                </div>
                {(() => {
                  const artifact = articraftResultToModelArtifact(msg.articraftResult!)
                  if (artifact) return <GeneratedModelPreview artifact={artifact} />
                  if (msg.articraftResult!.previewError) {
                    return (
                      <div className="rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-200">
                        Preview failed: {msg.articraftResult!.previewError}
                      </div>
                    )
                  }
                  return (
                    <div className="rounded border border-border/50 bg-accent/20 px-2 py-3 text-center text-[11px] text-muted-foreground">
                      Preparing the 3D preview, or save to the library to generate a GLB.
                    </div>
                  )
                })()}
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const isPlaced = msg.articraftResult!.status === 'imported'
                    const canPlaceArticraft = Boolean(msg.articraftResult!.data)
                    return (
                      <button
                        className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-emerald-400/50 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={disabled || !canPlaceArticraft}
                        onClick={() => handleImportArticraftResult(msg.articraftResult!)}
                        type="button"
                      >
                        <Icon className="size-3.5" icon="mdi:import" />
                        {isPlaced ? 'Place again' : 'Place on canvas'}
                      </button>
                    )
                  })()}
                  <button
                    className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-[#a684ff]/50 hover:text-[#a684ff] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!msg.articraftResult.recordId}
                    onClick={() => void openArticraftViewer(msg.articraftResult!.recordId)}
                    type="button"
                  >
                    <Icon className="size-3.5" icon="mdi:open-in-new" />
                    Open Articraft Viewer
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-[#a684ff]/50 hover:text-[#a684ff] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!msg.articraftResult.recordId}
                    onClick={() => void openArticraftViewer(msg.articraftResult!.recordId, 'code')}
                    title={msg.articraftResult.recordPath || undefined}
                    type="button"
                  >
                    <Icon className="size-3.5" icon="mdi:file-document-outline" />
                    View source record
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-amber-400/50 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!msg.articraftResult.recordId || !!msg.articraftResult.savedAt}
                    onClick={() => handleSaveArticraftAsset(msg.articraftResult!)}
                    type="button"
                  >
                    <Icon className="size-3.5" icon="mdi:archive-plus-outline" />
                    {msg.articraftResult.savedAt ? 'Saved to library' : 'Save to library'}
                  </button>
                  {msg.articraftResult.asset ? (
                    <button
                      className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-[#a684ff]/50 hover:text-[#a684ff] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => handleSelectImageTo3DAsset(msg.articraftResult!.asset!)}
                      type="button"
                    >
                      <Icon className="size-3.5" icon="mdi:package-variant-closed" />
                      Select generated asset
                    </button>
                  ) : null}
                  <button
                    className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-cyan-400/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!msg.articraftResult.recordId}
                    onClick={() => handleApplyArticraftPose(msg.articraftResult!)}
                    type="button"
                  >
                    <Icon className="size-3.5" icon="mdi:axis-arrow" />
                    Apply pose
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-[#a684ff]/50 hover:text-[#a684ff] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => sendArticraftMessage(msg.articraftResult!.prompt)}
                    type="button"
                  >
                    <Icon className="size-3.5" icon="mdi:refresh" />
                    Regenerate
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{msg.content}</div>
          )}
        </div>
      ))}
    </>
  )
}
