/**
 * LLM DSL source generation + repair loop — stage 6, work item 5.
 *
 * The generator_dsl route needs DSL source text. This module owns:
 *  1. The system prompt for DSL authoring (API card summary + few-shot
 *     fixture + authoring rules), versioned via DSL_API_VERSION.
 *  2. Source extraction from the model reply (strip markdown fences,
 *     reject replies that contain no DSL).
 *  3. The repair loop: compile diagnostics + spatial gate issues are
 *     formatted back into the conversation so the model can fix its
 *     source; bounded attempts with stagnation detection (same
 *     diagnostic code set twice → stop).
 *
 * The loop delegates compilation to an injected compile function (in
 * production: runDslSandbox via executeGeneratorDslRun; in tests: a
 * direct compileDsl wrapper), so it is fully testable without a worker
 * process or an LLM.
 */

import { DSL_API_VERSION } from '@pascal-app/core/lib/generated-geometry-dsl-contract'
import { LAPTOP_DSL_SOURCE } from './fixtures/laptop.dsl'
import type { DslRunResult } from './generator-dsl-run'

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/** Prompt version for the DSL author prompt (dashboard joins). */
export const DSL_AUTHOR_PROMPT_VERSION = '1.2.0'

const DSL_EQUIPMENT_API_SUMMARY = `
  belt({ id, length?, width?, thickness?, material?, color? }) — conveyor belt surface + pulley hints
  rollerArray({ id, length?, width?, count?, radius?, material?, color? }) — repeated cross rollers
  boxFrame({ id, length?, width?, height?, railThickness?, legCount?, material? }) — rails, legs and cross ties
  guardCover({ id, target?, side?, length?, width?, height?, clearance?, material?, color? }) — transparent/wire safety cover with frame and mounts
  motor({ id, target?, side?, position?, diameter?, length?, material?, color? }) — ribbed industrial drive motor, end caps, terminal box and feet
  gearbox({ id, target?, side?, position?, length?, width?, height?, material?, color? }) — cast gearbox housing with shafts, feet, cover bolts and nameplate
  bearingBlock({ id, target?, side?, position?, width?, height?, depth?, material?, color? }) — pillow bearing block with bearing ring, shaft hint and mounting bolts
  platform({ id, target?, side?, length?, width?, height?, thickness?, legCount?, material?, color? }) — service platform with grating, edge beams and support legs
  ladder({ id, target?, side?, height?, width?, rungCount?, material?, color? }) — access ladder with side rails and repeated rungs
  handrail({ id, target?, side?, length?, width?, height?, postCount?, material?, color? }) — handrail with top rail, mid rail and posts
  inspectionDoor({ id, target?, side?, count?, width?, height?, material?, color? }) — door panels, handles and hinge strips
  nameplate({ id, target?, side?, width?, height?, text? }) — small equipment nameplate
  sheetCover({ id, target?, side?, length?, width?, height?, thickness?, clearance?, material?, color? }) — rounded sheet-metal cover with stiffeners
  flangePort({ id, target?, side?, nominalDiameter?, length?, material?, color? }) — short nozzle neck + flange ring for process connections
  pipeRun({ id, from?, to?, radius?, includeFlanges?, material?, color? }) — swept pipe segment with optional end flanges
  controlCabinet({ id, target?, side?, width?, height?, depth?, material?, color? }) — rounded electrical/control cabinet with door seam, glass, handle and nameplate
  skidBase({ id, length?, width?, height?, railThickness?, material?, color? }) — steel skid frame with rails and cross members
  pumpCasing({ id, target?, diameter?, width?, material?, color? }) — centrifugal pump casing with volute body and suction/discharge nozzles
  verticalVessel({ id, diameter?, height?, includeLadder?, includeManway?, includePorts?, material?, color? }) — vertical tank/vessel with heads, seam rings, ports, manway, support skirt and ladder
  dustCollector({ id, width?, depth?, height?, bagCount?, includeLadder?, material?, color? }) — baghouse dust collector with filter body, hopper, ducts, support legs, pulse valves and access
`.trimEnd()

const DSL_API_SUMMARY = `
===== DSL API (version ${DSL_API_VERSION}) =====
Geometry constructors (each returns a GeometryBuilder):
  box({ length, width, height, material?, color?, roughness?, metalness? })      — meters; centered at origin
  cylinder({ radius, height, material?, color?, roughness?, metalness? })
  sphere({ radius, material?, color?, roughness?, metalness? })
  cone({ radius, height, material?, color?, roughness?, metalness? })
  frustum({ radiusTop, radiusBottom, height, material?, color?, roughness?, metalness? })
  torus({ majorRadius, tubeRadius, material?, color?, roughness?, metalness? })
  lathe({ profile: [[x,y],...], material?, color?, roughness?, metalness? })     — revolve profile around Y
  extrude({ profile: [[x,y],...], depth, material?, color?, roughness?, metalness? })
  sweep({ path: [[x,y,z],...], radius, material?, color?, roughness?, metalness? })
  material: 'metal' | 'plastic' | 'glass'   — shading preset (optional)
  color: CSS hex string, e.g. '#cc0000'     — surface tint (optional, composes with material)
  roughness / metalness: 0..1 PBR scalars (optional, override the preset base)

Industrial equipment semantic constructors (preferred for factory equipment):
${DSL_EQUIPMENT_API_SUMMARY}
  material presets for these constructors:
    painted_steel, stainless_steel, cast_iron, transparent_polycarbonate,
    wire_mesh, rubber_belt, aluminum_frame, yellow_safety, dark_fastener,
    control_panel_glass.
  These functions create multiple named parts with semantic roles and realism
  parameters. Use them before hand-building anonymous primitive piles.

Assembly:
  part(id, geometry)                  — id is a stable dotted path, e.g. 'keyboard.key.r0.c3'
    .atWorld([x, y, z])               — world-space position (meters)
    .atLocal([x, y, z])               — parent-local position (requires .childOf first)
    .rotateAround([px, py, pz], { axis: 'x'|'y'|'z', degrees } | { axis, radians })
                                      — pivot rotation, WORLD space only:
                                        requires .atWorld, NO .childOf/.atLocal
    .rotate({ axis: 'x'|'y'|'z', degrees } | { axis, radians })
                                      — spin the part about its OWN center;
                                        works in both atWorld and atLocal parts.
                                        Use this to lay a cylinder/box flat or
                                        turn a part to face a direction.
    .childOf('parent.part.id')        — MUST come before .atLocal
    .withRole('semantic_role')
    .port(name, { medium, side, height, offset?, direction?, nominalDiameter?, role? })
  hinge({ part, anchor, axis, pivot, restAngle, limits? })
  grid({ partIds, rows, columns, layers?, spacing, origin })
  connect(id, { from, to, medium, kind? })

Params (REQUIRED when the object has user-tunable dimensions):
  const P = params({
    keycapWidth: { type: 'number', unit: 'm', range: [0.014, 0.025], default: 0.018,
                   semanticRole: 'keyboard.key.width', affects: 'keyboard.key.*', label: '键帽宽度' },
  })

Math namespace: math.sin cos tan asin acos atan atan2 sqrt pow abs min max
  floor ceil round hypot clamp lerp; constants math.PI TAU HALF_PI DEG_TO_RAD RAD_TO_DEG

Statements: const declarations, function name(args) { ... return x },
  if/else, for (let i = 0; i < n; i++), for (const item of array), return.
Numbers, strings, arrays, objects, + - * / %, comparisons, && || !, parens.
`.trim()

const DSL_RULES = `
===== AUTHORING RULES =====
1. Output ONLY DSL source text. No markdown fences, no commentary.
2. Use ONLY the whitelisted API above. Forbidden: Math (use math.*),
   Date, console, fetch, require, eval, arrow functions, template
   literals, ternary ?:, == / != (use === / !==), spread ...
3. Every part id MUST be deterministic: dotted path with explicit loop
   indices, e.g. 'keyboard.key.r' + r + '.c' + c. Never random.
4. Declare a params block for every user-tunable dimension, with
   unit/range/default/semanticRole/affects/label filled in.
5. Repeated parts (keyboards, grilles, bolt circles) MUST be generated
   by loops, never written out by hand.
6. Articulated parts (lids, doors, arms) MUST use .rotateAround(pivot,
   {axis, degrees}) with a pivot ON the anchor part, plus a hinge()
   declaration — a flat, unrotated lid is a defect. rotateAround is
   WORLD-space only: the part must use .atWorld and must NOT use
   .childOf/.atLocal. For parts attached with .childOf/.atLocal
   (handles, knobs, decorative cylinders), reorient them with
   .rotate({axis, degrees}) instead — e.g. to lay a vertical cylinder
   handle flat against a door: .childOf(door).atLocal([...])
   .rotate({axis: 'x', degrees: 90}).
7. Child parts that move with a parent (screen in a lid, handle on a
   door) use .childOf(parentId).atLocal([...]). Once a part is a child,
   never call .atWorld or .rotateAround on it — use .rotate to reorient.
8. Keep the part count under 256 and loops under 10000 iterations.
9. Honor every appearance request in the user's prompt. When the user
   asks for a color ("red", "红色", "matte black"), set color on the
   relevant parts with a CSS hex value ('#cc0000' for red). Combine it
   with a material preset when a finish is implied ('metal', 'glass');
   use roughness/metalness to refine (e.g. matte → high roughness).
10. Choose the geometry kind that best matches each part's real shape.
    Do NOT default every part to box — use cylinder for shafts, ports,
    hinges and buttons; sphere/hemisphere for rounded caps; lathe for
    turned profiles; extrude for shaped plates; torus for rings. A flat
    all-box model of a non-box object is a quality defect.
11. For industrial/factory equipment, prefer semantic constructors over
    raw primitives when they match the requested device. For example, a
    guarded conveyor should start with belt(), rollerArray(), boxFrame(),
    guardCover(), motor(), gearbox(), bearingBlock(), inspectionDoor(), and
    nameplate(). Process or factory devices should use sheetCover(),
    flangePort(), pipeRun(), and controlCabinet() for covers, nozzles,
    piping and controls. Pump skids should use skidBase(), pumpCasing(),
    motor(), gearbox(), flangePort(), pipeRun(), sheetCover(), and nameplate().
    Tall tanks and pressure/process vessels should use verticalVessel().
    Baghouse filters and dust collectors should use dustCollector().
    Serviceable equipment should use platform(), ladder(), and handrail()
    for access details. Only add raw part(..., box/cylinder/...) for missing
    details that the semantic constructor does not cover.
`.trim()

/**
 * System prompt for DSL authoring. The laptop fixture is the canonical
 * few-shot: it exercises params, functions, nested loops, rotateAround,
 * childOf/atLocal, and a hinge constraint in one example.
 */
export function buildDslAuthorSystemPrompt(): string {
  return [
    'You write Generator DSL source that compiles to a 3D assembly.',
    '',
    DSL_API_SUMMARY,
    '',
    DSL_RULES,
    '',
    '===== REFERENCE EXAMPLE (laptop) =====',
    LAPTOP_DSL_SOURCE.trim(),
    '',
    `DSL API version: ${DSL_API_VERSION}. Prompt version: ${DSL_AUTHOR_PROMPT_VERSION}.`,
  ].join('\n')
}

export function buildDslAuthorUserPrompt(userPrompt: string): string {
  return [
    'Write Generator DSL source for this request:',
    '',
    userPrompt,
    '',
    'Remember: output ONLY the DSL source. Declare a params block. Use loops for repeated parts.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Source extraction
// ---------------------------------------------------------------------------

/**
 * Extract DSL source from a model reply: strip markdown fences and any
 * prose around the code. Returns null when the reply contains nothing
 * that looks like DSL.
 */
export function extractDslSource(reply: string): string | null {
  let text = reply.trim()
  // Strip a single markdown fence block if present.
  const fence = /```(?:typescript|ts|javascript|js|dsl)?\s*\n([\s\S]*?)```/i.exec(text)
  if (fence?.[1]) {
    text = fence[1].trim()
  } else {
    // No fence: drop leading prose lines until the first DSL-looking line.
    const lines = text.split('\n')
    const start = lines.findIndex((l) =>
      /^\s*(const|function|part\(|equipment\(|belt\(|rollerArray\(|boxFrame\(|guardCover\(|motor\(|gearbox\(|bearingBlock\(|platform\(|ladder\(|handrail\(|inspectionDoor\(|nameplate\(|sheetCover\(|flangePort\(|pipeRun\(|controlCabinet\(|skidBase\(|pumpCasing\(|verticalVessel\(|dustCollector\(|for\s*\(|if\s*\(|hinge\(|grid\(|connect\(|let\b)/.test(
        l,
      ),
    )
    if (start === -1) return null
    text = lines.slice(start).join('\n').trim()
  }
  // Sanity: must reference at least one whitelisted global.
  if (
    !/\b(part|params|box|cylinder|sphere|cone|frustum|torus|lathe|extrude|sweep|equipment|belt|rollerArray|boxFrame|guardCover|motor|gearbox|bearingBlock|platform|ladder|handrail|inspectionDoor|nameplate|sheetCover|flangePort|pipeRun|controlCabinet|skidBase|pumpCasing|verticalVessel|dustCollector)\s*\(/.test(
      text,
    )
  ) {
    return null
  }
  return text
}

// ---------------------------------------------------------------------------
// Repair feedback
// ---------------------------------------------------------------------------

/** Format compile/gate diagnostics into a repair message for the model. */
export function buildDslRepairMessage(result: Extract<DslRunResult, { kind: 'failed' }>): string {
  const lines: string[] = [
    'The DSL source did not produce a valid assembly. Fix the source and output the COMPLETE corrected source (no commentary).',
    '',
    `Failure: ${result.downgrade.message}`,
    '',
  ]
  const diagnostics = result.attempts.flatMap((a) => a.diagnostics)
  if (diagnostics.length > 0) {
    lines.push('Diagnostics:')
    for (const d of diagnostics.slice(0, 20)) {
      const loc = d.span ? ` (line ${d.span.line})` : ''
      lines.push(`- [${d.code}]${loc} ${d.message}${d.hint ? ` Hint: ${d.hint}` : ''}`)
    }
  }
  const gateIssues = result.attempts.flatMap((a) => a.spatial?.issues ?? [])
  if (gateIssues.length > 0) {
    lines.push('', 'Spatial quality gate issues:')
    for (const issue of gateIssues.slice(0, 10)) lines.push(`- ${issue}`)
  }
  const realismIssues = result.attempts.flatMap((a) => a.realism?.issues ?? [])
  const realismWarnings = result.attempts.flatMap((a) => a.realism?.warnings ?? [])
  if (realismIssues.length > 0 || realismWarnings.length > 0) {
    lines.push('', 'Industrial realism gate feedback:')
    for (const issue of realismIssues.slice(0, 10)) lines.push(`- ERROR: ${issue}`)
    for (const warning of realismWarnings.slice(0, 8)) lines.push(`- WARNING: ${warning}`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

export type DslLlmMessage = { role: string; content: string }

export type DslSourceLoopResult =
  | { kind: 'ok'; source: string; attempts: number; finalRun: DslRunResult }
  | {
      kind: 'failed'
      source: string | null
      attempts: number
      finalRun: DslRunResult | null
      stagnated: boolean
    }

export type RunDslSourceLoopInput = {
  userPrompt: string
  /** LLM call: messages → assistant reply text. */
  callLlm: (messages: DslLlmMessage[]) => Promise<string>
  /** One compile+gate attempt for a candidate source. */
  runAttempt: (source: string) => Promise<DslRunResult>
  /** Max total LLM calls (1 initial + repairs). Default 3. */
  maxAttempts?: number
  /** Optional initial source (skips the first LLM call). */
  initialSource?: string
}

/**
 * Drive the LLM source-generation + repair loop.
 *
 * Stagnation rule (mirrors the sandbox runner's): if two consecutive
 * compile attempts fail with the same diagnostic code set, the model is
 * going in circles — stop early.
 */
export async function runDslSourceLoop(input: RunDslSourceLoopInput): Promise<DslSourceLoopResult> {
  const maxAttempts = input.maxAttempts ?? 3
  const messages: DslLlmMessage[] = [
    { role: 'system', content: buildDslAuthorSystemPrompt() },
    { role: 'user', content: buildDslAuthorUserPrompt(input.userPrompt) },
  ]

  let source: string | null = input.initialSource ?? null
  let attempts = 0
  let lastCodeSet: string | undefined
  let finalRun: DslRunResult | null = null

  while (attempts < maxAttempts) {
    if (source === null) {
      const reply = await input.callLlm(messages)
      messages.push({ role: 'assistant', content: reply })
      source = extractDslSource(reply)
      if (source === null) {
        messages.push({
          role: 'user',
          content:
            'Your reply contained no DSL source. Output ONLY the DSL source text, nothing else.',
        })
        attempts += 1
        continue
      }
    }

    attempts += 1
    const run = await input.runAttempt(source)
    finalRun = run
    if (run.kind === 'ok') {
      return { kind: 'ok', source, attempts, finalRun: run }
    }

    // Stagnation: same failure signature twice → stop.
    const gateIssues = run.attempts.flatMap((a) => a.spatial?.issues ?? [])
    const diagnostics = run.attempts.flatMap((a) =>
      a.diagnostics.map((d) => `${d.code}:${d.message}:${d.span?.line ?? ''}`),
    )
    const failureSignature = [
      run.downgrade.reason,
      run.downgrade.diagnosticCodes.join(','),
      run.downgrade.message,
      ...gateIssues,
      ...diagnostics,
    ].join('|')
    if (lastCodeSet === failureSignature) {
      return { kind: 'failed', source, attempts, finalRun: run, stagnated: true }
    }
    lastCodeSet = failureSignature

    if (attempts >= maxAttempts) break
    messages.push({ role: 'user', content: buildDslRepairMessage(run) })
    source = null // next iteration calls the LLM for the fix
  }

  return { kind: 'failed', source, attempts, finalRun, stagnated: false }
}
