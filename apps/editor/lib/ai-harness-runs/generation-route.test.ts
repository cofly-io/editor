import { describe, expect, it } from 'bun:test'
import {
  evaluateGeneratorDslFlag,
  type GenerationRouteSignals,
  NO_SIGNALS,
  resolveGenerationMode,
} from './generation-route'
import { signalsFromBlueprint } from './generator-dsl-route-binding'

function signals(partial: Partial<GenerationRouteSignals>): GenerationRouteSignals {
  return { ...NO_SIGNALS, ...partial }
}

describe('evaluateGeneratorDslFlag', () => {
  it('defaults to off when no env and no params', () => {
    const flag = evaluateGeneratorDslFlag({ env: {} })
    expect(flag.enabled).toBe(false)
    expect(flag.disabledReason).toBe('below_rollout')
    expect(flag.rolloutPercent).toBe(0)
  })

  it('params.generatorDsl === true bypasses rollout', () => {
    const flag = evaluateGeneratorDslFlag({ params: { generatorDsl: true }, env: {} })
    expect(flag.enabled).toBe(true)
    expect(flag.rolloutPercent).toBe(100)
  })

  it('params.generatorDsl === false is explicitly off, beats everything', () => {
    const flag = evaluateGeneratorDslFlag({
      params: { generatorDsl: false },
      env: { GENERATOR_DSL_ROLLOUT: '100' },
    })
    expect(flag.enabled).toBe(false)
    expect(flag.disabledReason).toBe('explicitly_off')
  })

  it('kill switch: env GENERATOR_DSL_DISABLED=1', () => {
    const flag = evaluateGeneratorDslFlag({
      params: { generatorDsl: true },
      env: { GENERATOR_DSL_DISABLED: '1', GENERATOR_DSL_ROLLOUT: '100' },
    })
    // params explicit-off is checked first; kill switch comes before explicit-on
    expect(flag.enabled).toBe(false)
    expect(flag.killSwitch).toBe(true)
    expect(flag.disabledReason).toBe('kill_switch')
  })

  it('kill switch: params.generatorDslKill', () => {
    const flag = evaluateGeneratorDslFlag({ params: { generatorDslKill: true }, env: {} })
    expect(flag.enabled).toBe(false)
    expect(flag.disabledReason).toBe('kill_switch')
  })

  it('rollout is deterministic per stable key', () => {
    const env = { GENERATOR_DSL_ROLLOUT: '50' }
    const a1 = evaluateGeneratorDslFlag({ stableKey: 'conv-a', env })
    const a2 = evaluateGeneratorDslFlag({ stableKey: 'conv-a', env })
    expect(a1.enabled).toBe(a2.enabled)
    expect(a1.bucket).toBe(a2.bucket)
    expect(a1.bucket).toBeGreaterThanOrEqual(0)
    expect(a1.bucket).toBeLessThan(100)
  })

  it('rollout 100 enables everyone, rollout 0 disables everyone', () => {
    for (const key of ['x', 'y', 'z', 'conv-1', 'conv-2']) {
      expect(
        evaluateGeneratorDslFlag({ stableKey: key, env: { GENERATOR_DSL_ROLLOUT: '100' } }).enabled,
      ).toBe(true)
      expect(
        evaluateGeneratorDslFlag({ stableKey: key, env: { GENERATOR_DSL_ROLLOUT: '0' } }).enabled,
      ).toBe(false)
    }
  })

  it('malformed rollout value falls back to off', () => {
    const flag = evaluateGeneratorDslFlag({ env: { GENERATOR_DSL_ROLLOUT: 'not-a-number' } })
    expect(flag.enabled).toBe(false)
  })
})

describe('resolveGenerationMode', () => {
  it('verified recipe with in-range params wins over weak DSL signals', () => {
    const d = resolveGenerationMode(
      signals({
        recipeAvailable: true,
        recipeParamsInRange: true,
        needsHierarchy: true, // even with DSL signals present
      }),
      { params: { generatorDsl: true }, env: {} },
    )
    expect(d.mode).toBe('recipe')
    expect(d.reasons[0]).toBe('verified_recipe_in_range')
  })

  it('verified recipe with in-range params wins over strong DSL signals when flag is on', () => {
    const d = resolveGenerationMode(
      signals({
        recipeAvailable: true,
        recipeParamsInRange: true,
        needsHierarchy: true,
        needsHinge: true,
        needsComputedLayout: true,
      }),
      { params: { generatorDsl: true }, env: {} },
    )
    expect(d.mode).toBe('recipe')
    expect(d.reasons).toEqual(['verified_recipe_in_range'])
  })

  it('Chinese double-door refrigerator prompts produce strong DSL signals and route to generator_dsl', () => {
    const routeSignals = signalsFromBlueprint(null, '生成一个绿色的双开门冰箱', {
      recipeAvailable: false,
      recipeParamsInRange: false,
    })
    expect(routeSignals.needsHierarchy).toBe(true)
    expect(routeSignals.needsHinge).toBe(true)
    expect(routeSignals.needsComputedLayout).toBe(true)

    const d = resolveGenerationMode(routeSignals, { params: { generatorDsl: true }, env: {} })
    expect(d.mode).toBe('generator_dsl')
    expect(d.reasons).toContain('needs_hinge')
  })

  it('LLM-declared generator_dsl after Stage1 wins over a broad profile match', () => {
    const routeSignals = signalsFromBlueprint(
      {
        route: 'compose_parts',
        generationMode: 'generator_dsl',
        category: 'refrigerator',
        constraints: { primaryColor: 'green' },
        parts: [
          { id: 'body', kind: 'generic_body', semanticRole: 'cabinet_body' },
          {
            id: 'leftDoor',
            kind: 'generic_panel',
            semanticRole: 'left_hinged_door',
            connectTo: 'body',
          },
          {
            id: 'rightDoor',
            kind: 'generic_panel',
            semanticRole: 'right_hinged_door',
            connectTo: 'body',
          },
        ],
        requiredRoles: ['cabinet_body', 'left_hinged_door', 'right_hinged_door'],
      },
      '\u751f\u6210\u4e00\u4e2a\u7eff\u8272\u7684\u53cc\u5f00\u95e8\u51b0\u7bb1',
      { recipeAvailable: true, recipeParamsInRange: true },
    )

    const d = resolveGenerationMode(routeSignals, { params: { generatorDsl: true }, env: {} })
    expect(d.mode).toBe('generator_dsl')
    expect(d.reasons).toEqual(['llm_declared:generator_dsl'])
  })

  it('verified recipe/profile still wins over heuristic DSL signals', () => {
    const d = resolveGenerationMode(
      signals({
        recipeAvailable: true,
        recipeParamsInRange: true,
        needsHierarchy: true,
        needsHinge: true,
        needsComputedLayout: true,
      }),
      { params: { generatorDsl: true }, env: {} },
    )
    expect(d.mode).toBe('recipe')
    expect(d.reasons).toEqual(['verified_recipe_in_range'])
  })

  it('supported bicycle compose_parts family stays on the legacy recipe pipeline even if LLM declares DSL', () => {
    const routeSignals = signalsFromBlueprint(
      {
        route: 'compose_parts',
        generationMode: 'generator_dsl',
        category: 'vehicle / bicycle',
        constraints: { primaryColor: '#cc0000' },
        parts: [
          { id: 'rear_wheel', kind: 'wheel_set', semanticRole: 'bicycle_tire', count: 1 },
          { id: 'front_wheel', kind: 'wheel_set', semanticRole: 'bicycle_tire', count: 1 },
          { id: 'frame', kind: 'tube_frame', semanticRole: 'bicycle_frame' },
          { id: 'fork', kind: 'fork', semanticRole: 'bicycle_fork' },
          { id: 'chain', kind: 'chain_loop', semanticRole: 'chain_loop' },
        ],
        requiredRoles: [
          'bicycle_tire',
          'bicycle_frame',
          'bicycle_fork',
          'handlebar',
          'saddle',
          'chain_loop',
        ],
      },
      '\u751f\u6210\u4e00\u4e2a\u7ea2\u8272\u7684\u81ea\u884c\u8f66',
      { recipeAvailable: false, recipeParamsInRange: false },
    )

    expect(routeSignals.legacyPartsAvailable).toBe(true)
    const d = resolveGenerationMode(routeSignals, { params: { generatorDsl: true }, env: {} })
    expect(d.mode).toBe('recipe')
    expect(d.reasons).toEqual(['supported_legacy_parts_family'])
  })

  it('supported vehicle assembly family stays on the legacy recipe pipeline even if LLM declares DSL', () => {
    const routeSignals = signalsFromBlueprint(
      {
        route: 'compose_assembly',
        generationMode: 'generator_dsl',
        category: 'vehicle / small car',
        constraints: { primaryColor: '#cc0000', style: 'small car' },
        parts: [
          { id: 'body', kind: 'body_shell', semanticRole: 'vehicle_body' },
          { id: 'wheels', kind: 'wheel_set', semanticRole: 'vehicle_tire', count: 4 },
          { id: 'windows', kind: 'window_strip', semanticRole: 'vehicle_window' },
        ],
        requiredRoles: ['vehicle_body', 'vehicle_tire', 'vehicle_window', 'headlight'],
      },
      '\u751f\u6210\u4e00\u4e2a\u7ea2\u8272\u5c0f\u6c7d\u8f66',
      { recipeAvailable: false, recipeParamsInRange: false },
    )

    expect(routeSignals.legacyPartsAvailable).toBe(true)
    const d = resolveGenerationMode(routeSignals, { params: { generatorDsl: true }, env: {} })
    expect(d.mode).toBe('recipe')
    expect(d.reasons).toEqual(['supported_legacy_parts_family'])
  })

  it('explicit compose_recipe blueprints stay on the legacy recipe pipeline even if LLM declares DSL', () => {
    const routeSignals = signalsFromBlueprint(
      {
        route: 'compose_recipe',
        generationMode: 'generator_dsl',
        category: 'basic primitive sphere recipe',
        constraints: { primaryColor: '#cc0000' },
        parts: [],
        requiredRoles: ['sphere_body'],
      },
      '\u751f\u6210\u4e00\u4e2a\u7ea2\u8272\u7403',
      { recipeAvailable: false, recipeParamsInRange: false },
    )

    expect(routeSignals.legacyPartsAvailable).toBe(true)
    const d = resolveGenerationMode(routeSignals, { params: { generatorDsl: true }, env: {} })
    expect(d.mode).toBe('recipe')
    expect(d.reasons).toEqual(['supported_legacy_parts_family'])
  })

  it('laptop-like request (hierarchy + hinge + computed layout) routes to generator_dsl when flag on', () => {
    const d = resolveGenerationMode(
      signals({ needsHierarchy: true, needsHinge: true, needsComputedLayout: true }),
      { params: { generatorDsl: true }, env: {} },
    )
    expect(d.mode).toBe('generator_dsl')
    expect(d.reasons).toEqual(['needs_hierarchy', 'needs_hinge', 'needs_computed_layout'])
  })

  it('DSL signals with flag off → recorded legacy fallback, never silent', () => {
    const d = resolveGenerationMode(signals({ needsHinge: true }), { env: {} })
    expect(d.mode).toBe('recipe')
    expect(d.reasons).toContain('needs_hinge')
    expect(d.reasons.some((r) => r.startsWith('dsl_disabled:'))).toBe(true)
  })

  it('appearance-first without editability → ai_3d', () => {
    const d = resolveGenerationMode(signals({ appearancePrimary: true }), { env: {} })
    expect(d.mode).toBe('ai_3d')
    expect(d.reasons).toEqual(['appearance_primary'])
  })

  it('appearance-first but requires editability → not ai_3d', () => {
    const d = resolveGenerationMode(
      signals({ appearancePrimary: true, requiresEditability: true }),
      { env: {} },
    )
    expect(d.mode).toBe('recipe')
  })

  it('no signals at all → default legacy route', () => {
    const d = resolveGenerationMode(signals({}), { env: {} })
    expect(d.mode).toBe('recipe')
    expect(d.reasons).toEqual(['default_legacy_route'])
  })

  it('non-equipment scene prompts route to generator_dsl instead of legacy compose_parts fallback', () => {
    const routeSignals = signalsFromBlueprint(
      {
        route: 'compose_parts',
        generationMode: 'recipe',
        category: 'landscape lawn',
        constraints: { primaryColor: '#22c55e' },
        parts: [
          { id: 'grass_patch', kind: 'grass-patch', semanticRole: 'uneven_grass' },
          { id: 'flowers', kind: 'small-flower-cluster', semanticRole: 'wildflowers' },
        ],
        requiredRoles: ['uneven_grass', 'wildflowers'],
      },
      '生成一个草坪，草高低不平，点缀一些小花',
      { recipeAvailable: false, recipeParamsInRange: false },
    )

    expect(routeSignals.nonEquipmentScene).toBe(true)
    expect(routeSignals.unsupportedPartKinds).toEqual(['grass-patch', 'small-flower-cluster'])
    const d = resolveGenerationMode(routeSignals, { env: {} })
    expect(d.mode).toBe('generator_dsl')
    expect(d.reasons).toContain('non_equipment_scene')
    expect(d.reasons).toContain('unsupported_compose_parts:grass-patch|small-flower-cluster')
    expect(d.reasons).toContain('dsl_required_for_capability_gap')
  })

  it('unsupported compose_parts kinds route to generator_dsl even when Stage1 declared recipe', () => {
    const routeSignals = signalsFromBlueprint(
      {
        route: 'compose_parts',
        generationMode: 'recipe',
        category: 'custom object',
        constraints: {},
        parts: [{ id: 'made_up', kind: 'custom-door-hinge', semanticRole: 'complex_hinge' }],
        requiredRoles: ['complex_hinge'],
      },
      '生成一个带复杂门铰链的设备',
      { recipeAvailable: false, recipeParamsInRange: false },
    )

    expect(routeSignals.unsupportedPartKinds).toEqual(['custom-door-hinge'])
    const d = resolveGenerationMode(routeSignals, { env: {} })
    expect(d.mode).toBe('generator_dsl')
    expect(d.reasons).toContain('unsupported_compose_parts:custom-door-hinge')
  })

  it('recipe available but params out of range does not short-circuit DSL', () => {
    const d = resolveGenerationMode(
      signals({ recipeAvailable: true, recipeParamsInRange: false, needsGrid: true }),
      { params: { generatorDsl: true }, env: {} },
    )
    expect(d.mode).toBe('generator_dsl')
  })
})
