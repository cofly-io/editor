/**
 * Generation-mode routing — stage 6, work items 1/2/6.
 *
 * Decides which generation route serves a request:
 *   'recipe'        — verified profile/recipe with in-range params
 *   'generator_dsl' — hierarchy / hinge / grid / surface / computed layout
 *   'ai_3d'         — appearance-first, low editability requirement
 *
 * Also owns the generator_dsl feature flag (rollout percentage + kill
 * switch), following the repo's existing convention: env var default
 * overridden by run params (see primitive-generation-service.ts:125).
 *
 * Everything here is pure and injectable so routing decisions are
 * deterministic under test and auditable in run events.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GenerationMode = 'recipe' | 'generator_dsl' | 'ai_3d'

export type GenerationRouteSignals = {
  /** A verified profile/recipe matches the request. */
  recipeAvailable: boolean
  /** That recipe's parameters are within the validated range. */
  recipeParamsInRange: boolean
  /** Request needs part hierarchy (childOf/atLocal). */
  needsHierarchy: boolean
  /** Request needs hinge / articulation. */
  needsHinge: boolean
  /** Request needs grid / loop-generated repeated parts. */
  needsGrid: boolean
  /** Request needs curved surfaces (lathe/extrude/sweep profiles). */
  needsSurface: boolean
  /** Request needs computed layout (positions derived from params). */
  needsComputedLayout: boolean
  /** Appearance / texture is the primary goal. */
  appearancePrimary: boolean
  /** User explicitly wants an editable structure (params/overrides). */
  requiresEditability: boolean
  /**
   * A built-in legacy compose_parts / compose_assembly family already
   * covers the request. In the primitive runner this still resolves to
   * mode="recipe" because "recipe" is the legacy non-DSL pipeline family;
   * Stage2 then executes the blueprint route such as compose_parts.
   */
  legacyPartsAvailable?: boolean
  /**
   * Explicit pipeline declared by the stage-1 analyst LLM (stage-6 LLM
   * routing). When present, this overrides the heuristic keyword signals —
   * the model judged the structure directly instead of us guessing from
   * the prompt text. DSL remains flag-gated.
   */
  llmExplicitMode?: GenerationMode
}

export const NO_SIGNALS: GenerationRouteSignals = {
  recipeAvailable: false,
  recipeParamsInRange: false,
  needsHierarchy: false,
  needsHinge: false,
  needsGrid: false,
  needsSurface: false,
  needsComputedLayout: false,
  appearancePrimary: false,
  requiresEditability: false,
}

export type GenerationRouteDecision = {
  mode: GenerationMode
  /** Machine-readable reason codes, first one is the deciding factor. */
  reasons: string[]
  /** The signals that informed the decision (echoed for run events). */
  signals: GenerationRouteSignals
  /** Feature-flag evaluation for generator_dsl. */
  flag: GeneratorDslFlagState
}

export type GeneratorDslFlagState = {
  /** Whether generator_dsl may serve this request. */
  enabled: boolean
  /** Kill switch engaged (env GENERATOR_DSL_DISABLED=1 or params kill). */
  killSwitch: boolean
  /** Effective rollout percentage 0..100. */
  rolloutPercent: number
  /** Deterministic bucket 0..99 for the request's stable key. */
  bucket: number
  /** Why disabled, when disabled. */
  disabledReason?: 'kill_switch' | 'below_rollout' | 'explicitly_off'
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

export type GeneratorDslFlagInput = {
  /** Run params (run.params in the DB record). */
  params?: Record<string, unknown>
  /** Stable key for rollout bucketing — conversationId or runId. */
  stableKey?: string
  /** Injectable env for tests (default process.env). */
  env?: Record<string, string | undefined>
}

/**
 * Evaluate the generator_dsl feature flag.
 *
 * Resolution order (first match wins):
 *  1. params.generatorDsl === false  → off ('explicitly_off')
 *  2. params.generatorDslKill === true or env GENERATOR_DSL_DISABLED=1
 *     → kill switch
 *  3. params.generatorDsl === true   → on (bypasses rollout)
 *  4. env GENERATOR_DSL_ROLLOUT=0..100 → deterministic bucket compare
 *     (default 0 = off)
 */
export function evaluateGeneratorDslFlag(input: GeneratorDslFlagInput = {}): GeneratorDslFlagState {
  const env = input.env ?? (typeof process !== 'undefined' ? process.env : {})
  const params = input.params ?? {}
  const bucket = stableBucket(input.stableKey ?? '')

  const base: GeneratorDslFlagState = {
    enabled: false,
    killSwitch: false,
    rolloutPercent: 0,
    bucket,
  }

  if (params.generatorDsl === false) {
    return { ...base, disabledReason: 'explicitly_off' }
  }
  if (params.generatorDslKill === true || env.GENERATOR_DSL_DISABLED === '1') {
    return { ...base, killSwitch: true, disabledReason: 'kill_switch' }
  }
  if (params.generatorDsl === true) {
    return { ...base, enabled: true, rolloutPercent: 100 }
  }

  const rawRollout = env.GENERATOR_DSL_ROLLOUT
  const rollout = rawRollout === undefined ? 0 : Number.parseInt(rawRollout, 10)
  const rolloutPercent = Number.isFinite(rollout) ? Math.max(0, Math.min(100, rollout)) : 0
  if (rolloutPercent <= 0) {
    return { ...base, rolloutPercent, disabledReason: 'below_rollout' }
  }
  if (bucket < rolloutPercent) {
    return { ...base, enabled: true, rolloutPercent }
  }
  return { ...base, rolloutPercent, disabledReason: 'below_rollout' }
}

/**
 * Deterministic bucket 0..99 for a stable key. FNV-1a — same algorithm
 * as the builders' stableHash so bucketing is consistent across hosts.
 */
function stableBucket(key: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % 100
}

// ---------------------------------------------------------------------------
// Routing decision
// ---------------------------------------------------------------------------

/**
 * Resolve the generation mode from signals. Decision order:
 *  1. verified industry-pack recipe + in-range params → recipe (always wins —
 *     a pack-covered standard device uses its engineer-tuned template, even
 *     if the LLM declared generator_dsl)
 *  2. LLM-declared pipeline (stage-1 generationMode) → that pipeline, DSL
 *     still flag-gated with an explicit recorded downgrade when disabled
 *  3. strong structural DSL signal (hinge/surface, or hierarchy+layout/grid)
 *     → generator_dsl, flag-gated as above
 *  4. weak structural DSL signal → generator_dsl, flag-gated as above
 *  5. appearance-first without editability requirement → ai_3d
 *  6. default → recipe (legacy primitive path is the 'recipe' family)
 *
 * NOTE: The implementation below is authoritative: fixed legacy families
 * are first, stage-1 LLM explicit mode is second, and verified profiles
 * only beat heuristic DSL signals.
 */
export function resolveGenerationMode(
  signals: GenerationRouteSignals,
  flagInput: GeneratorDslFlagInput = {},
): GenerationRouteDecision {
  const flag = evaluateGeneratorDslFlag(flagInput)

  if (signals.legacyPartsAvailable) {
    return {
      mode: 'recipe',
      reasons: ['supported_legacy_parts_family'],
      signals,
      flag,
    }
  }

  // Stage-1 explicit mode is authoritative after fixed legacy routes.
  // It beats broad profile matches and keyword heuristics. DSL stays
  // flag-gated; when disabled, record an explicit downgrade instead of
  // silently rerouting.
  if (signals.llmExplicitMode === 'generator_dsl') {
    if (flag.enabled) {
      return { mode: 'generator_dsl', reasons: ['llm_declared:generator_dsl'], signals, flag }
    }
    return {
      mode: 'recipe',
      reasons: ['llm_declared:generator_dsl', `dsl_disabled:${flag.disabledReason ?? 'unknown'}`],
      signals,
      flag,
    }
  }
  if (signals.llmExplicitMode === 'ai_3d') {
    return { mode: 'ai_3d', reasons: ['llm_declared:ai_3d'], signals, flag }
  }
  if (signals.llmExplicitMode === 'recipe') {
    return { mode: 'recipe', reasons: ['llm_declared:recipe'], signals, flag }
  }

  if (signals.recipeAvailable && signals.recipeParamsInRange) {
    return {
      mode: 'recipe',
      reasons: ['verified_recipe_in_range'],
      signals,
      flag,
    }
  }

  const dslSignals: string[] = []
  if (signals.needsHierarchy) dslSignals.push('needs_hierarchy')
  if (signals.needsHinge) dslSignals.push('needs_hinge')
  if (signals.needsGrid) dslSignals.push('needs_grid')
  if (signals.needsSurface) dslSignals.push('needs_surface')
  if (signals.needsComputedLayout) dslSignals.push('needs_computed_layout')

  const strongStructuralDslSignal =
    signals.needsHinge ||
    signals.needsSurface ||
    (signals.needsHierarchy && signals.needsComputedLayout) ||
    (signals.needsHierarchy && signals.needsGrid)

  if (dslSignals.length > 0 && strongStructuralDslSignal) {
    if (flag.enabled) {
      return { mode: 'generator_dsl', reasons: dslSignals, signals, flag }
    }
    return {
      mode: 'recipe',
      reasons: [...dslSignals, `dsl_disabled:${flag.disabledReason ?? 'unknown'}`],
      signals,
      flag,
    }
  }

  if (dslSignals.length > 0) {
    if (flag.enabled) {
      return { mode: 'generator_dsl', reasons: dslSignals, signals, flag }
    }
    // Explicit, recorded fallback — never silent (plan work item 6).
    return {
      mode: 'recipe',
      reasons: [...dslSignals, `dsl_disabled:${flag.disabledReason ?? 'unknown'}`],
      signals,
      flag,
    }
  }

  if (signals.appearancePrimary && !signals.requiresEditability) {
    return { mode: 'ai_3d', reasons: ['appearance_primary'], signals, flag }
  }

  return { mode: 'recipe', reasons: ['default_legacy_route'], signals, flag }
}
