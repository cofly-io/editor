/**
 * Runner-side glue for the generator_dsl route — stage 6, work item 1/5.
 *
 * Contains the pieces that need harness context (run params, prompt
 * text, blueprint signals) so primitive-runner.ts stays a one-line
 * dispatch. Everything here is pure given its inputs; the runner
 * supplies run.params / prompt / blueprint and applies the returned
 * patch plan via the scene store.
 */

import {
  type GenerationRouteDecision,
  type GenerationRouteSignals,
  NO_SIGNALS,
  resolveGenerationMode,
} from './generation-route'
import { GENERATION_VERSIONS } from './generation-versions'
import type { PrimitiveRouteMetrics } from './primitive-run-metrics'
import type { PartBlueprint } from './primitive-tool-execution'

// ---------------------------------------------------------------------------
// Signal extraction (stage-1 output + prompt heuristics)
// ---------------------------------------------------------------------------

/**
 * Derive routing signals from the stage-1 blueprint and the raw prompt.
 * Category is only one signal among several (plan work item 1).
 *
 * The blueprint does not yet carry explicit hierarchy/hinge flags, so
 * structural signals come from two places: blueprint shape (arrays with
 * computed spacing, connectTo / centeredOn relations, count loops) and
 * prompt keywords (hinge / 开合 / articulated etc.). This is a heuristic
 * pre-filter — the LLM stage-1 prompt will grow an explicit
 * generationMode field later; the router already handles it via
 * signals.
 */
export function signalsFromBlueprint(
  blueprint: PartBlueprint | null,
  userPrompt: string,
  opts: { recipeAvailable: boolean; recipeParamsInRange: boolean },
): GenerationRouteSignals {
  const text = userPrompt.toLowerCase()
  const parts = blueprint?.parts ?? []
  const blueprintText = [
    blueprint?.route,
    blueprint?.category,
    ...(blueprint?.requiredRoles ?? []),
    ...parts.flatMap((part) => [part.id, part.kind, part.semanticRole]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  // Category priors: multi-part articulated / computed-layout objects
  // that the DSL handles better than a flat primitive list. These are
  // signals, not decisions — the router still weighs the recipe route
  // first and the flag can still gate DSL off.
  const laptopLike = /(笔记本|laptop|电脑|电脑桌|workstation)/.test(text)
  const refrigeratorLike =
    /(refrigerator|fridge|freezer|icebox|冰箱|冷柜|冷藏柜|双开门|雙開門|对开门|對開門|法式门|法式門|french\s*door|side[-\s]?by[-\s]?side)/.test(
      text,
    )

  const needsGrid =
    parts.some((p) => (p.count ?? 0) > 4 || p.array !== undefined) ||
    /(\d+)\s*[×x]\s*(\d+)/.test(text) ||
    laptopLike // keyboard grid
  const needsHinge =
    /(hinge|articulat|开合|翻盖|折叠|lid)/.test(text) ||
    Boolean(blueprint?.constraints && 'hingeAngle' in blueprint.constraints) ||
    laptopLike || // laptop lid
    refrigeratorLike // refrigerator doors
  const needsHierarchy =
    parts.some(
      (p) => p.connectTo !== undefined || p.centeredOn !== undefined || p.alignAbove !== undefined,
    ) ||
    /(screen|lid|cover|attached to|固定在)/.test(text) ||
    laptopLike || // screen-in-lid
    refrigeratorLike // cabinet + doors + handles + shelves
  const needsSurface =
    /(curve|lathe|extrud|sweep|曲面|型材|弧形)/.test(text) ||
    parts.some((p) => p.kind === 'lathe' || p.kind === 'extrude' || p.kind === 'sweep')
  const needsComputedLayout =
    /(keyboard|键盘|grid of|阵列|布局|layout)/.test(text) ||
    (blueprint?.route === 'compose_parts' && parts.length > 8) ||
    laptopLike || // keyboard layout computed from params
    refrigeratorLike // door/shelf/handle placement computed from dimensions
  const appearancePrimary =
    /(photo|realistic|render|texture|材质逼真|好看|appearance)/.test(text) &&
    !needsGrid &&
    !needsHinge &&
    !needsComputedLayout

  // LLM-declared pipeline (stage-6 LLM routing): when the stage-1 analyst
  // wrote a generationMode into the blueprint, surface it as the
  // highest-priority signal. Only the three valid modes pass through;
  // anything else (hallucinated value) is dropped to heuristics.
  const declared = blueprint?.generationMode
  const llmExplicitMode =
    declared === 'generator_dsl' || declared === 'recipe' || declared === 'ai_3d'
      ? declared
      : undefined
  const legacyPartsAvailable =
    blueprint?.route === 'compose_recipe' ||
    ((blueprint?.route === 'compose_parts' || blueprint?.route === 'compose_assembly') &&
      (/\bbicycle\b|\bbike\b|\bcycle\b|bicycle_|wheel_set|tube_frame|chain_loop/.test(
        blueprintText,
      ) ||
        /\bvehicle\b|\bcar\b|\bauto\b|\bsedan\b|\bsuv\b|\btruck\b|\bvan\b|vehicle_|body_shell|vehicle_body/.test(
          blueprintText,
        )))

  return {
    ...NO_SIGNALS,
    recipeAvailable: opts.recipeAvailable,
    recipeParamsInRange: opts.recipeParamsInRange,
    legacyPartsAvailable,
    needsHierarchy,
    needsHinge,
    needsGrid,
    needsSurface,
    needsComputedLayout,
    appearancePrimary,
    requiresEditability: /(param|可调|editable|修改|调整尺寸)/.test(text),
    ...(llmExplicitMode !== undefined ? { llmExplicitMode } : {}),
  }
}

// ---------------------------------------------------------------------------
// Route resolution for one run
// ---------------------------------------------------------------------------

export function resolveRunGenerationMode(input: {
  runParams?: Record<string, unknown>
  stableKey: string
  blueprint: PartBlueprint | null
  userPrompt: string
  recipeAvailable: boolean
  recipeParamsInRange: boolean
}): GenerationRouteDecision {
  const signals = signalsFromBlueprint(input.blueprint, input.userPrompt, {
    recipeAvailable: input.recipeAvailable,
    recipeParamsInRange: input.recipeParamsInRange,
  })
  return resolveGenerationMode(signals, {
    ...(input.runParams !== undefined ? { params: input.runParams } : {}),
    stableKey: input.stableKey,
  })
}

// ---------------------------------------------------------------------------
// Metrics bridging
// ---------------------------------------------------------------------------

/** Stamp a route decision + versions onto a metrics object (mutates). */
export function applyRouteDecisionToMetrics(
  metrics: PrimitiveRouteMetrics,
  decision: GenerationRouteDecision,
): void {
  metrics.generationMode = decision.mode
  metrics.generationRouteReasons = decision.reasons
  metrics.generatorDslFlag = {
    enabled: decision.flag.enabled,
    killSwitch: decision.flag.killSwitch,
    rolloutPercent: decision.flag.rolloutPercent,
    bucket: decision.flag.bucket,
    ...(decision.flag.disabledReason !== undefined
      ? { disabledReason: decision.flag.disabledReason }
      : {}),
  }
  metrics.promptVersion = GENERATION_VERSIONS.promptVersion
  metrics.dslApiVersion = GENERATION_VERSIONS.dslApiVersion
}

/** Event payload for the 'generation-route' stage. */
export function routeDecisionEventData(decision: GenerationRouteDecision): Record<string, unknown> {
  return {
    stage: 'generation-route',
    mode: decision.mode,
    reasons: decision.reasons,
    signals: decision.signals,
    flag: decision.flag,
    versions: GENERATION_VERSIONS,
  }
}
