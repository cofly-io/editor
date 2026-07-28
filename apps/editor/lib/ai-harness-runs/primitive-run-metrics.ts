export type PrimitiveRouteMetrics = {
  route: 'profile' | 'deterministic' | 'stage2_fallback' | 'generator_dsl'
  stage1HasBlueprint: boolean
  selectedProfile?: string
  profileSource?: string
  profilePackId?: string
  layoutTemplate?: string
  overrodeBuiltin?: boolean
  profileOverrides?: unknown[]
  profileQualityScore?: number
  deterministicIntent: boolean
  deterministicAttempted: boolean
  deterministicSucceeded: boolean
  stage2Called: boolean
  fallbackReason?:
    | 'no_blueprint'
    | 'no_deterministic_intent'
    | 'planner_issues'
    | 'direct_execution_no_artifact'
    | 'profile_no_artifact'
  family?: string
  component?: string
  deterministicTool?: string
  plannerIssues?: string[]
  stage3QualityScore?: number
  stage3Passed?: boolean
  stage3Issues?: string[]
  stage3Warnings?: string[]
  stage3RepairApplied?: boolean
  stage2ToolCallCount: number
  repairCallCount: number

  // -------------------------------------------------------------------
  // Stage 6 — generation-mode routing & generator_dsl telemetry
  // -------------------------------------------------------------------

  /** Resolved generation mode (recipe / generator_dsl / ai_3d). */
  generationMode?: 'recipe' | 'generator_dsl' | 'ai_3d'
  /** Machine-readable route decision reasons (first is decisive). */
  generationRouteReasons?: string[]
  /** Feature-flag state at decision time. */
  generatorDslFlag?: {
    enabled: boolean
    killSwitch: boolean
    rolloutPercent: number
    bucket: number
    disabledReason?: string
  }
  /** Prompt / API / DSL versions in effect (see generation-versions.ts). */
  promptVersion?: string
  dslApiVersion?: string
  /** DSL run outcome (only when generationMode === 'generator_dsl'). */
  dslFirstAttemptSucceeded?: boolean
  dslAttemptCount?: number
  dslIrHash?: string
  dslSourceHash?: string
  dslPartCount?: number
  dslSpatialScore?: number
  dslSpatialIssues?: string[]
  dslSandboxMs?: number
  /** Explicit downgrade record when the DSL route could not deliver. */
  dslDowngrade?: {
    reason: string
    message: string
    attempts: number
    diagnosticCodes: string[]
  }
}
