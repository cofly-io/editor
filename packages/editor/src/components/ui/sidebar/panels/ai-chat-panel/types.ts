import type { AssetInput } from '@pascal-app/core'
import type { ArticraftJoint, ArticraftLink, ArticraftModelData } from '@pascal-app/articraft-bridge/types'
import type { GeometryToolExecutionResult } from '../../../../../lib/ai-geometry-tool-executor'
import type { GeometryContextDecision } from '../../../../../lib/ai-chat-harness'
import type { GeneratedGeometryArtifact } from '../../../../../lib/ai-generated-geometry'
import type { GeometryAgentRunResponse } from '../../../../../lib/geometry-agent-client-types'

export type FactoryRunSummary = {
  title: string
  icon?: string
  status: 'running' | 'succeeded' | 'failed' | 'cancelled' | 'needs_input'
  description: string
  steps: Array<{ label: string; status: 'done' | 'running' | 'pending' | 'failed' }>
  metrics: Array<{ label: string; value: string }>
  resourceOptions?: Array<{
    id: string
    label: string
    description: string
    recommended?: boolean
    prompt: string
    actionHref?: string
    actionLabel?: string
  }>
  details?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  image?: ChatImageAttachment
  generationRun?: {
    id: string
    mode: 'articraft' | 'image-to-3d' | 'primitive' | 'factory' | 'geometry-agent'
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  }
  geometryAgentSession?: GeometryAgentRunResponse
  articraftResult?: ArticraftResult
  imageTo3dResult?: ImageTo3DResult
  factoryRunSummary?: FactoryRunSummary
  factoryRunDraft?: unknown
  geometryArtifact?: GeneratedGeometryArtifact
  modelArtifact?: GeneratedModelArtifact
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
  isToolResult?: boolean
  toolCallId?: string
}

export type GeneratedModelArtifact = {
  id: string
  title: string
  sourceTool: 'image-to-3d' | 'articraft'
  provider: string
  asset: AssetInput
  userPrompt: string
  createdAt: string
  placedAt?: string
  savedAt?: string
}

export type ChatImageAttachment = {
  name: string
  type: string
  size: number
  dataUrl: string
}

export type ProfilePackSummary = {
  id: string
  name: string
  industry: string
  version: string
  profileCount: number
  factoryArchitectureCount?: number
  processTemplateCount?: number
  enabled: boolean
  path: string
}

export type ProfilePackDebugSummary = {
  id: string
  name: string
  source: string
  sourcePack?: { id?: string; version?: string }
  family: string
  layoutFamily?: string
  primarySemanticRole: string
  partCount: number
  overrides?: unknown[]
}

export type ProfilePackApiSummary = {
  enabledCount?: number
  profileCount?: number
  loadedProfileCount?: number
  conflictCount?: number
  cloudIndustryPackCount?: number
  cloudComponentPackCount?: number
  cloudInstalledIndustryPackCount?: number
}

export type ApiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type ApiMessage = {
  role: string
  content: string | ApiContentPart[]
  tool_call_id?: string
  tool_calls?: unknown
}

export type AiGenerationMode = 'primitive' | 'articraft' | 'image-to-3d'
export type AiConversationPurpose = 'factory' | 'asset'

export interface ArticraftResult {
  prompt: string
  status: 'ready' | 'imported'
  recordId: string
  recordPath: string
  name: string
  partCount: number
  jointCount: number
  assetId?: string
  asset?: AssetInput & { id: string; source: 'mine' }
  savedAt?: string
  previewError?: string
  links: ArticraftLink[]
  joints: ArticraftJoint[]
  data: ArticraftModelData
}

export interface ImageTo3DResult {
  prompt: string
  asset: AssetInput & { id: string; source: 'mine' }
  saved: boolean
}

export type AiChatPanelStateSnapshot = {
  sceneId?: string
  conversationId: string
  messages: ChatMessage[]
  input: string
  generationMode: AiGenerationMode
  conversationPurpose?: AiConversationPurpose
  inputExpanded: boolean
  imageAttachment?: ChatImageAttachment
}

export type AiConversationSummary = {
  id: string
  title: string
  messageCount: number
  activeRunCount: number
  conversationPurpose?: AiConversationPurpose
  updatedAt: string
}

export type FactoryE2eBridge = {
  sceneNodes: () => Record<string, unknown>
  applyFactoryRun: (data: unknown) => string[]
  cameraView: (view: 'isometric' | 'top' | 'side') => void
  clearSelection: () => void
  liveDataValue: (path: string) => unknown
  nodeTransform: (nodeId: string) => {
    position: [number, number, number]
    rotation: [number, number, number]
    scale: [number, number, number]
    visible: boolean
  } | null
  selectNode: (nodeId: string) => void
  setSelectMode: () => void
  setPreviewMode: (enabled: boolean) => void
  selectedIds: () => string[]
  viewerFlags: () => { cameraDragging: boolean; inputDragging: boolean; spacePanning: boolean }
}

declare global {
  interface Window {
    __pascalFactoryE2e?: FactoryE2eBridge
  }
}
