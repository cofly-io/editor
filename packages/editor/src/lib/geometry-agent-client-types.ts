import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import type { DSLDiagnostic } from '@pascal-app/core/lib/generated-geometry-dsl-contract'
import type { GeneratedAssemblyNode, GeneratedMeshNode } from '@pascal-app/core/schema'
import type { GeneratedAssemblyPlacementOptions } from './generated-geometry-placement'

export type GeometryAgentSessionStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type GeometryAgentInputMode = 'text' | 'image'

export type GeometryAgentSourceOrigin = 'llm' | 'workspace'

export type GeometryAgentCreateRequest = {
  sessionId?: string
  mode?: GeometryAgentInputMode
  prompt?: string
  imageAssetId?: string
  initialSource?: string
  equipmentType?: string
  maxAttempts?: number
}

export type GeometryAgentRerunContext = {
  existingRoot: GeneratedAssemblyNode
  existingParts: readonly GeneratedMeshNode[]
  previousIr?: AssemblyIR
  placement?: Omit<GeneratedAssemblyPlacementOptions, 'generator'>
  detectedAt?: string
}

export type GeometryAgentMessageRequest = {
  prompt?: string
  instruction?: string
  maxAttempts?: number
  rerun?: GeometryAgentRerunContext
}

export type GeometryAgentManifestSnapshot = {
  sessionId: string
  sourcePath: 'source.equipment.dsl'
  currentArtifactId?: string
  status: GeometryAgentSessionStatus
  inputMode: GeometryAgentInputMode
  sourceOrigin: GeometryAgentSourceOrigin
  createdAt: string
  updatedAt: string
}

export type GeometryAgentMemorySnapshot = {
  userGoal: string
  equipmentType?: string
  namedParts: Record<string, string>
  recentDecisions: string[]
  userPreferences: {
    industrialStyle: string
  }
  referenceImageAssetId: string | null
  referenceImageNotes: string[]
  targetDimensions: {
    length: number | null
    width: number | null
    height: number | null
    unit: 'm'
  }
  realismPreferences: {
    detailLevel: 'industrial_delivery'
    avoidToyLikeGeometry: true
    preferRoundedSheetMetal: true
    preferVisibleFasteners: true
  }
}

export type GeometryAgentDiagnosticsSnapshot = {
  diagnostics: DSLDiagnostic[]
  realismIssues: string[]
  realismWarnings: string[]
  spatialIssues: string[]
  spatialWarnings: string[]
}

export type GeometryAgentChangeFeedbackSnapshot = {
  changed: Array<{
    id: string
    functionName: string
    changedParams: Array<{ name: string; before: string; after: string }>
  }>
  added: Array<{ id: string; functionName: string }>
  removed: Array<{ id: string; functionName: string }>
  unchangedImportantIds: string[]
  text: string
}

export type GeometryAgentLastRunSnapshot = {
  kind: 'ok' | 'failed'
  sourceOrigin: GeometryAgentSourceOrigin
  irHash?: string
  artifactId?: string
  partCount: number
  changed?: {
    created: number
    updated: number
    deleted: number
    unchanged: number
    changedPartIds?: string[]
    addedPartIds?: string[]
    removedPartIds?: string[]
    orphanedOverridePartIds?: string[]
  }
  changeFeedback?: GeometryAgentChangeFeedbackSnapshot
  summary: string
  at: string
}

export type GeometryAgentEventSnapshot = {
  id: string
  sessionId: string
  type:
    | 'session.created'
    | 'source.saved'
    | 'source.patched'
    | 'run.started'
    | 'run.succeeded'
    | 'run.failed'
    | 'memory.updated'
  at: string
  payload?: Record<string, unknown>
}

export type GeometryAgentSnapshot = {
  sessionId: string
  manifest: GeometryAgentManifestSnapshot
  memory: GeometryAgentMemorySnapshot
  source: string
  diagnostics: GeometryAgentDiagnosticsSnapshot
  lastRun: GeometryAgentLastRunSnapshot | null
  events: GeometryAgentEventSnapshot[]
}

export type GeometryAgentRerunSummarySnapshot = {
  created: number
  updated: number
  deleted: number
  unchanged: number
  changedPartIds: string[]
  addedPartIds: string[]
  removedPartIds: string[]
  unchangedPartIds: string[]
  orphanedOverridePartIds: string[]
  text: string
}

export type GeometryAgentRunResponse = GeometryAgentSnapshot & {
  result: {
    kind: 'ok' | 'failed'
    attempts: number
    sourceAvailable: boolean
  }
  rerunSummary?: GeometryAgentRerunSummarySnapshot
}
