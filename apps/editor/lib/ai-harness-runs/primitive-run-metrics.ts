export type PrimitiveRouteMetrics = {
  route: 'profile' | 'deterministic' | 'stage2_fallback'
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
}
