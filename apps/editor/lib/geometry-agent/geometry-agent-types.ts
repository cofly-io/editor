import type { DSLDiagnostic } from '@pascal-app/core/lib/generated-geometry-dsl-contract'

export type GeometryAgentSessionStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type GeometryAgentInput =
  | { mode: 'text'; prompt: string }
  | { mode: 'image'; prompt?: string; imageAssetId: string }

export type GeometryAgentSourceOrigin = 'llm' | 'workspace'

export type GeometryAgentManifest = {
  sessionId: string
  sourcePath: 'source.equipment.dsl'
  currentArtifactId?: string
  status: GeometryAgentSessionStatus
  inputMode: GeometryAgentInput['mode']
  sourceOrigin: GeometryAgentSourceOrigin
  createdAt: string
  updatedAt: string
}

export type GeometryAgentMemory = {
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

export type GeometryAgentEvent = {
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

export type GeometryAgentDiagnostics = {
  diagnostics: DSLDiagnostic[]
  realismIssues: string[]
  realismWarnings: string[]
  spatialIssues: string[]
  spatialWarnings: string[]
}

export type GeometryAgentLastRun = {
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
  changeFeedback?: {
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
  summary: string
  at: string
}

export type GeometryAgentWorkspace = {
  sessionId: string
  dir: string
  manifestPath: string
  sourcePath: string
  memoryPath: string
  eventsPath: string
  lastRunPath: string
  diagnosticsPath: string
}
