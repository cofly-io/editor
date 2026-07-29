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
export const DSL_AUTHOR_PROMPT_VERSION = '1.3.0'

const DSL_EQUIPMENT_API_SUMMARY = `
  centrifugalFan({ id, diameter?, width?, includeMotor?, includeGuard?, includeBase?, material?, color? }) — centrifugal fan with volute casing, inlet ring/nozzle, outlet duct, impeller cues, bearing pedestal, motor, coupling guard and base
  blowerPackage({ id, length?, width?, fanDiameter?, includeSilencer?, includeFilter?, includeCabinet?, material?, color? }) — skid-mounted blower/fan package with centrifugal fan, motor, coupling guard, silencer/filter, discharge duct, flanges and local cabinet
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
  heatExchanger({ id, length?, diameter?, tubeCount?, includeSaddles?, includePorts?, material?, color? }) — shell-and-tube heat exchanger with shell, tube sheets, channel heads, tube bundle, saddles and flanged ports
  agitatorTank({ id, diameter?, height?, includeLadder?, includePorts?, includeManway?, bladeCount?, material?, color? }) — reactor/stirred tank with vessel shell, heads, top motor, gearbox, visible agitator shaft/impeller cues, ports, manway, legs and nameplate
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

const REALISM_CHECKLIST = `
===== REALISM CHECKLIST (your output must pass these checks) =====
General:
- Prefer semantic equipment constructors; they create named parts, material presets, rounded details, and stable IDs.
- Equipment semantic constructors are top-level assembly statements, not geometry builders. Write nameplate({ id: 'robot_arm.nameplate', target: 'robot_arm.base', side: 'front' }); directly. Never write part('robot_arm.nameplate', nameplate(...)).
- Avoid obviously distorted proportions: motors, doors, covers, ports, and guards must be scaled relative to the equipment they attach to.
- Surface-mounted details must sit OUTSIDE the target part, never at its center. Nameplates, labels, handles, buttons, inspection doors, hinges, flanges, pipe ports, brackets, feet, motors, gearboxes, bearing blocks, coupling guards, and guards need a small outward offset/clearance along the chosen side normal.
- When adding details by hand with part(...), compute positions from the host surface: use host half-size + detail half-thickness + 0.01m clearance on the outward axis. If you cannot calculate that safely, use nameplate(), inspectionDoor(), flangePort(), guardCover(), sheetCover(), motor(), gearbox(), platform(), ladder(), or handrail() with target/side.
- Repeated scene structures such as bridge arches, balusters, railing posts,
  fence pickets, flowers, trees, windows, bolts, and decorative ornaments must
  use the loop index in their .atWorld/.atLocal position. Adjacent repeated
  parts may touch or have clearance, but they must not share one center point
  or occupy the same span. For bridges specifically: X is the bridge length,
  Z is the bridge width, Y is up; compute each arch center as
  x = -totalLength / 2 + spanSpacing * (i + 0.5), and use distinct ids such
  as 'bridge.arch.' + i.

Conveyors:
- Use belt(), rollerArray(), boxFrame(), motor(), guardCover()/inspectionDoor()/nameplate() when requested.
- Include at least 4 rollers, visible supports, and a rubber_belt/high-roughness belt.
- Drive motors need mounting feet, terminal box, and cylinder radialSegments >= 32; do not make the motor wider than the belt.

Pump skids:
- Use skidBase(), pumpCasing(), motor(), flangePort(), pipeRun(), sheetCover()/nameplate().
- Include distinct suction/discharge nozzles, at least 2 flange ports, paired skid rails, and cross members.

Fan/blower packages:
- Use centrifugalFan() or blowerPackage().
- Include volute casing, inlet ring/nozzle, outlet duct, repeated impeller blade cues, bearing block, motor, guard, base, flanges, and nameplate.

Vessels, dust collectors, heat exchangers, and reactors:
- Use verticalVessel(), dustCollector(), heatExchanger(), or agitatorTank() instead of raw cylinder/box piles.
- Include required industrial details: heads/ports/access/nameplate for vessels, hopper/ducts/pulse valves for dust collectors, tube sheets/bundle/saddles for heat exchangers, and motor/gearbox/shaft/impeller cues for reactors.
`.trim()

const DSL_RULES = `
===== AUTHORING RULES =====
1. Output ONLY DSL source text. No markdown fences, no commentary.
2. Use ONLY the whitelisted API above. Forbidden: Math (use math.*),
   Date, console, fetch, require, eval, arrow functions, template
   literals, ternary ?:, == / != (use === / !==), spread ...
   Array mutation is also forbidden: do NOT use .push(), .pop(),
   .splice(), .map(), .forEach(), or assignments like arr[i] = value.
   Arrays must be created as complete literals. For extrude/lathe/sweep
   profiles, write a static literal such as [[x1,y1],[x2,y2],...] with
   6-16 points; do not build the profile by mutating an array in a loop.
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
   Any part that declares hinge({ part: ... }) must have a visible non-zero
   world rotation in the default pose. Use non-zero default joint angles
   such as 25/-35/20 degrees for robot shoulder/elbow/wrist joints, and use
   the same angle in rotateAround(...) and hinge().restAngle. If a part should
   remain perfectly straight/static, do not declare a hinge for it.
   Repeated joint accessories (motors, end caps, bolts, covers, gripper
   pieces) must be positioned from their own joint pivot or parent part. Do
   not reuse one base/world position for shoulder, elbow, and wrist details.
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
    Centrifugal fans, blowers, induced-draft fans and air movers should use
    centrifugalFan() or blowerPackage().
    Tall tanks and pressure/process vessels should use verticalVessel().
    Reactors, reaction kettles and stirred tanks should use agitatorTank().
    Baghouse filters and dust collectors should use dustCollector().
    Shell-and-tube heat exchangers should use heatExchanger().
    Serviceable equipment should use platform(), ladder(), and handrail()
    for access details. Only add raw part(..., box/cylinder/...) for missing
    details that the semantic constructor does not cover.
12. Equipment semantic constructors return complete part sets. Call belt(),
    rollerArray(), boxFrame(), guardCover(), motor(), gearbox(),
    bearingBlock(), platform(), ladder(), handrail(), inspectionDoor(),
    nameplate(), sheetCover(), flangePort(), pipeRun(), controlCabinet(),
    skidBase(), pumpCasing(), centrifugalFan(), blowerPackage(),
    verticalVessel(), dustCollector(), heatExchanger(), and agitatorTank()
    as top-level statements. NEVER wrap them in part(...). Correct:
    nameplate({ id: 'robot_arm.nameplate', target: 'robot_arm.base',
    side: 'front' }); Incorrect: part('robot_arm.nameplate',
    nameplate({ ... })).
13. Do not bury accessories inside larger bodies. A surface accessory whose
    id or role is a nameplate, label, warning plate, handle, knob, button,
    inspection door, hinge, flange, port, pipe neck, bracket, foot, motor,
    gearbox, bearing block, coupling guard, ladder, platform, guard, or cover
    must be placed on the exterior face of its
    host with a visible outward clearance (typically 0.01m to 0.03m). If a
    previous attempt reports gate_part_overlap, move the smaller/accessory
    part outward along the nearest side normal; do not delete the detail.
14. Repeated structural spans must be spatially indexed. If part ids differ
    only by a numeric suffix (for example bridge.arch.0 and bridge.arch.1,
    rail.post.0 and rail.post.1, flower.0 and flower.1), their positions must
    differ along the repetition axis by at least their own width/depth plus
    intended clearance. Never instantiate repeated arches/posts/ornaments at
    a constant .atWorld([0, ...]) coordinate inside a loop.
`.trim()

const DSL_DEFINITION_PATTERNS = `
===== DSL DEFINITION PATTERNS (adapt these before writing source) =====
Pattern A: repeated linear parts along one axis.
Use for rollers, railing posts, windows, bridge spans, flowers, fence pickets, bolts in a row.
const count = 6
const totalLength = 6
const spacing = totalLength / count
for (let i = 0; i < count; i++) {
  const x = -totalLength / 2 + spacing * (i + 0.5)
  part('pattern.item.' + i,
    box({ length: spacing * 0.5, width: 0.12, height: 0.4, material: 'metal' })
  ).atWorld([x, 0.2, 0]).withRole('repeated_structural_member')
}

Pattern B: surface-mounted accessory on a host face.
Use for nameplates, labels, handles, inspection doors, buttons, ports, covers, brackets.
const hostLength = 2
const hostHeight = 1
const hostWidth = 0.6
part('panel.host',
  box({ length: hostLength, width: hostWidth, height: hostHeight, material: 'metal' })
).atWorld([0, hostHeight / 2, 0]).withRole('host_body')
part('panel.handle',
  cylinder({ radius: 0.025, height: 0.28, material: 'metal' })
).atWorld([0.45, hostHeight * 0.55, -hostWidth / 2 - 0.025])
  .rotate({ axis: 'x', degrees: 90 })
  .withRole('surface_handle')

Pattern C: cylindrical body with ports and access details.
Use for tanks, vessels, hoppers, reactors, columns, pressure shells.
verticalVessel({ id: 'vessel', diameter: 1.2, height: 3.2, includeLadder: true, includeManway: true, includePorts: true, material: 'painted_steel' });
flangePort({ id: 'vessel.feed', target: 'vessel.shell', side: 'front', nominalDiameter: 0.18, length: 0.28 });
nameplate({ id: 'vessel.nameplate', target: 'vessel.shell', side: 'front', width: 0.22, height: 0.08, text: 'VESSEL' });

Pattern D: hinged door with child handle.
Use for doors, lids, covers, cabinet panels, inspection flaps.
part('cabinet.body',
  box({ length: 1.2, width: 0.5, height: 1.6, material: 'metal' })
).atWorld([0, 0.8, 0]).withRole('cabinet_body')
part('cabinet.door',
  box({ length: 0.58, width: 0.04, height: 1.2, material: 'metal' })
).atWorld([-0.18, 0.85, -0.27])
  .rotateAround([-0.6, 0.85, -0.27], { axis: 'y', degrees: -18 })
  .withRole('hinged_door')
part('cabinet.door.handle',
  cylinder({ radius: 0.025, height: 0.24, material: 'metal' })
).childOf('cabinet.door').atLocal([0.2, 0, -0.04]).rotate({ axis: 'x', degrees: 90 }).withRole('door_handle')
hinge({ part: 'cabinet.door', anchor: 'cabinet.body', axis: [0, 1, 0], pivot: [-0.6, 0.85, -0.27], restAngle: -18 * math.DEG_TO_RAD, limits: [-100 * math.DEG_TO_RAD, 5 * math.DEG_TO_RAD] });

Pattern E: radial bolt circle.
Use for flanges, covers, bearing plates, wheels, turntables, cannon breech rings.
const boltCount = 8
const boltCircleRadius = 0.42
for (let i = 0; i < boltCount; i++) {
  const a = math.TAU * i / boltCount
  part('flange.bolt.' + i,
    cylinder({ radius: 0.025, height: 0.05, material: 'metal' })
  ).atWorld([math.cos(a) * boltCircleRadius, 0.04, math.sin(a) * boltCircleRadius])
    .withRole('bolt_head')
}

Pattern F: arched bridge or repeated spans.
Use extrude for a shaped arch plate. Use a distinct X center for every span.
const bridgeLength = 8
const archCount = 4
const spanSpacing = bridgeLength / archCount
const archProfile = [[-0.8,0],[-0.7,0.45],[-0.45,0.75],[0,0.9],[0.45,0.75],[0.7,0.45],[0.8,0],[0.55,0],[0.4,0.38],[0,0.52],[-0.4,0.38],[-0.55,0]]
for (let i = 0; i < archCount; i++) {
  const x = -bridgeLength / 2 + spanSpacing * (i + 0.5)
  part('bridge.arch.' + i,
    extrude({ profile: archProfile, depth: 0.35, material: 'metal', color: '#9b9488' })
  ).atWorld([x, 0.3, 0]).rotate({ axis: 'y', degrees: 90 }).withRole('bridge_arch_span')
}

Pattern G: skid-mounted equipment package.
Use for pumps, fans, compressors, blowers, process skids, compact machines.
skidBase({ id: 'package.skid', length: 2.6, width: 1.0, height: 0.18, material: 'painted_steel' });
motor({ id: 'package.motor', target: 'package.skid.rail.left', side: 'top', position: 'rear', diameter: 0.32, length: 0.72, material: 'painted_steel' });
pumpCasing({ id: 'package.pump', target: 'package.skid.rail.left', diameter: 0.45, width: 0.32, material: 'cast_iron' });
flangePort({ id: 'package.inlet', target: 'package.pump.casing', side: 'front', nominalDiameter: 0.18 });
flangePort({ id: 'package.outlet', target: 'package.pump.casing', side: 'right', nominalDiameter: 0.16 });

Pattern H: articulated chain.
Use for robot arms, excavator booms, folding cranes, cannons with elevating barrels.
const shoulder = [0, 0.45, 0]
const elbow = [0.5, 1.05, 0]
part('arm.base', cylinder({ radius: 0.28, height: 0.35, material: 'metal' })).atWorld([0, 0.175, 0]).withRole('rotary_base')
part('arm.upper',
  cylinder({ radius: 0.08, height: 0.85, material: 'metal' })
).atWorld([0.25, 0.75, 0]).rotate({ axis: 'z', degrees: 55 }).withRole('upper_link')
part('arm.forearm',
  cylinder({ radius: 0.065, height: 0.75, material: 'metal' })
).atWorld([0.75, 1.15, 0]).rotateAround(elbow, { axis: 'z', degrees: -35 }).withRole('forearm_link')
hinge({ part: 'arm.forearm', anchor: 'arm.upper', axis: [0, 0, 1], pivot: elbow, restAngle: -35 * math.DEG_TO_RAD, limits: [-110 * math.DEG_TO_RAD, 45 * math.DEG_TO_RAD] });
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
    REALISM_CHECKLIST,
    '',
    DSL_RULES,
    '',
    DSL_DEFINITION_PATTERNS,
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
      /^\s*(const|function|part\(|equipment\(|belt\(|rollerArray\(|boxFrame\(|guardCover\(|motor\(|gearbox\(|bearingBlock\(|platform\(|ladder\(|handrail\(|inspectionDoor\(|nameplate\(|sheetCover\(|flangePort\(|pipeRun\(|controlCabinet\(|skidBase\(|pumpCasing\(|centrifugalFan\(|blowerPackage\(|verticalVessel\(|dustCollector\(|heatExchanger\(|agitatorTank\(|for\s*\(|if\s*\(|hinge\(|grid\(|connect\(|let\b)/.test(
        l,
      ),
    )
    if (start === -1) return null
    text = lines.slice(start).join('\n').trim()
  }
  // Sanity: must reference at least one whitelisted global.
  if (
    !/\b(part|params|box|cylinder|sphere|cone|frustum|torus|lathe|extrude|sweep|equipment|belt|rollerArray|boxFrame|guardCover|motor|gearbox|bearingBlock|platform|ladder|handrail|inspectionDoor|nameplate|sheetCover|flangePort|pipeRun|controlCabinet|skidBase|pumpCasing|centrifugalFan|blowerPackage|verticalVessel|dustCollector|heatExchanger|agitatorTank)\s*\(/.test(
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
    const syntaxHints = dslSyntaxRepairHints(diagnostics)
    if (syntaxHints.length > 0) {
      lines.push('', 'DSL syntax repair hints:')
      for (const hint of syntaxHints.slice(0, 8)) lines.push(`- ${hint}`)
    }
  }
  const gateIssues = result.attempts.flatMap((a) => a.spatial?.issues ?? [])
  if (gateIssues.length > 0) {
    lines.push('', 'Spatial quality gate issues:')
    for (const issue of gateIssues.slice(0, 10)) lines.push(`- ${issue}`)
    const hints = spatialRepairHints(gateIssues)
    if (hints.length > 0) {
      lines.push('', 'Spatial repair hints:')
      for (const hint of hints.slice(0, 10)) lines.push(`- ${hint}`)
    }
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

function dslSyntaxRepairHints(
  diagnostics: ReadonlyArray<{ code: string; message: string }>,
): string[] {
  const hints: string[] = []
  for (const diagnostic of diagnostics) {
    const message = diagnostic.message.toLowerCase()
    if (
      diagnostic.code === 'dsl_unsupported_member' &&
      /push|pop|splice|map|foreach/.test(message)
    ) {
      hints.push(
        'The DSL is not JavaScript: array mutation methods are forbidden. Replace profile-building loops with a complete static array literal, e.g. profile: [[-1,0],[...],[1,0]].',
      )
    }
    if (diagnostic.code === 'dsl_parse_error' && /expected ';', got =/.test(message)) {
      hints.push(
        'Assignments such as arr[i] = value are not supported. Do not initialize arrays and fill them later; construct the full array literal in one expression.',
      )
    }
    if (diagnostic.code === 'dsl_unsupported_syntax' && /ternary/.test(message)) {
      hints.push(
        'Ternary ?: is forbidden. Use an if/else statement and assign values through let variables.',
      )
    }
  }
  return [...new Set(hints)]
}

function spatialRepairHints(issues: readonly string[]): string[] {
  const hints: string[] = []
  for (const issue of issues) {
    const duplicate =
      /gate_duplicate_position:\s*(\d+)\s+identical parts share one world position:\s*([^[]+)/i.exec(
        issue,
      )
    if (duplicate) {
      const [, countText, idsText] = duplicate
      const ids = (idsText ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
      hints.push(
        `Separate the ${countText ?? 'multiple'} identical parts that share one world position: ${ids.slice(0, 5).join(', ')}. Each repeated detail must derive its position from its own parent/joint pivot or loop index; do not reuse one constant atWorld(...) coordinate for multiple parts with the same geometry.`,
      )
      if (ids.some((id) => /(robot|shoulder|elbow|wrist|gripper|motor|end_cap)/i.test(id))) {
        hints.push(
          `For robot arms, compute shoulder/elbow/wrist motors and end caps from shoulderPivot/elbowPivot/wristPivot respectively, or childOf() them to the matching joint part with distinct atLocal offsets. The front/end cap of each joint motor must move with that joint and cannot all sit at the base/default origin.`,
        )
      }
      continue
    }

    const hingeZero =
      /gate_hinge_zero_angle:\s*part\s*"([^"]+)"\s*declares a hinge on\s*"([^"]+)"/i.exec(issue)
    if (hingeZero) {
      const [, partId, anchorId] = hingeZero
      hints.push(
        `Give hinged part "${partId}" a visible non-zero default world rotation relative to "${anchorId}". If it is a robot joint, set the controlling param default away from 0 (for example shoulder 25°, elbow -35°, wrist 20°), call rotateAround(pivot, { axis, degrees: P.jointAngleDeg }) on "${partId}", and set hinge().restAngle to the same non-zero angle in radians. If "${partId}" should stay straight/static, remove its hinge() declaration.`,
      )
      continue
    }

    const overlap =
      /gate_part_overlap:\s*parts\s*"([^"]+)"\s*and\s*"([^"]+)"\s*overlap\s*(\d+)%/i.exec(issue)
    if (!overlap) continue
    const [, first, second, percentText] = overlap
    const percent = Number(percentText)
    const firstId = first ?? ''
    const secondId = second ?? ''
    const accessory = chooseLikelyAccessory(firstId, secondId)
    const host = accessory === first ? second : first
    if (accessory && host && Number.isFinite(percent) && percent >= 80) {
      const specialized = specializedAttachmentHint(accessory, host)
      if (specialized) hints.push(specialized)
      hints.push(
        `Move "${accessory}" to the OUTSIDE surface of "${host}" with 0.01m-0.03m clearance along the chosen side normal. It is likely embedded inside the host; keep the detail but change its position/side/atLocal offset.`,
      )
    } else if (first && second && Number.isFinite(percent) && percent >= 80) {
      const repeatedSiblingHint = repeatedSiblingOverlapHint(first, second)
      if (repeatedSiblingHint) hints.push(repeatedSiblingHint)
      hints.push(
        `Separate "${first}" and "${second}" so neither part contains the other. If one is an attachment, place it on the exterior face with a small outward clearance.`,
      )
    }
  }
  return [...new Set(hints)]
}

function repeatedSiblingOverlapHint(first: string, second: string): string | null {
  const firstTokens = numericSiblingTokens(first)
  const secondTokens = numericSiblingTokens(second)
  if (!firstTokens || !secondTokens) return null
  if (firstTokens.base !== secondTokens.base || firstTokens.index === secondTokens.index)
    return null
  if (/bridge\.arch|arch|span|bay/i.test(firstTokens.base)) {
    return `Bridge/span repair: "${first}" and "${second}" are repeated sibling spans but occupy the same volume. In the loop, compute each arch center from the loop index along X, e.g. spanSpacing = totalLength / archCount; x = -totalLength / 2 + spanSpacing * (i + 0.5); then place each arch with .atWorld([x, archY, 0]). Do not reuse a constant arch position for every i.`
  }
  if (/post|baluster|picket|column|ornament|flower|tree|window|bolt|arch/i.test(firstTokens.base)) {
    return `Repeated-detail repair: "${first}" and "${second}" differ only by index but overlap. Use the loop index to compute a distinct center position along the repeated axis; do not reuse one constant .atWorld/.atLocal coordinate for all siblings.`
  }
  return null
}

function numericSiblingTokens(id: string): { base: string; index: string } | null {
  const match = /^(.*?)(?:\.|_|-)(\d+)(?:$|[._-].*)/.exec(id)
  if (!match) return null
  const base = match[1]
  const index = match[2]
  return base && index ? { base, index } : null
}

function specializedAttachmentHint(accessory: string, host: string): string | null {
  const accessoryText = accessory.toLowerCase()
  const hostText = host.toLowerCase()
  if (/(bolt|fastener|screw|washer|螺栓|螺钉|垫片)/i.test(accessoryText)) {
    if (/(base|plate|skid|foot|底座|基座|底板)/i.test(hostText)) {
      return `For base fasteners like "${accessory}", place bolt HEADS on the +Y/top face of "${host}": y = hostCenterY + hostHeight/2 + boltHeadHeight/2 + 0.01. Keep x/z inside the base footprint and away from central columns, shoulders, arms, or housings.`
    }
    return `For fasteners like "${accessory}", model only the visible head on the exterior face of "${host}" unless an exposed shank is requested; do not center the whole bolt inside the host volume.`
  }
  if (
    /(gearbox|gear_box|motor|bearing|coupling|drive|transmission|reducer|servo|减速|齿轮箱|电机|轴承|联轴器|驱动)/i.test(
      accessoryText,
    )
  ) {
    return `For drivetrain attachments like "${accessory}", mount the housing beside or above "${host}" with a visible bracket/clearance; do not place the drivetrain center inside the host body.`
  }
  return null
}

function chooseLikelyAccessory(first: string, second: string): string | null {
  const firstScore = accessoryScore(first)
  const secondScore = accessoryScore(second)
  if (firstScore === 0 && secondScore === 0) return null
  return firstScore >= secondScore ? first : second
}

function accessoryScore(id: string): number {
  const text = id.toLowerCase()
  let score = 0
  if (/(nameplate|label|warning|tag|铭牌|标签|警示)/i.test(text)) score += 6
  if (
    /(handle|knob|button|switch|door|hinge|manway|inspection|把手|按钮|门|铰链|检修)/i.test(text)
  ) {
    score += 5
  }
  if (
    /(gearbox|gear_box|motor|bearing|coupling|drive|transmission|reducer|servo|减速|齿轮箱|电机|轴承|联轴器|驱动)/i.test(
      text,
    )
  ) {
    score += 4
  }
  if (/(flange|port|nozzle|pipe|neck|valve|法兰|接口|管口|喷嘴|阀)/i.test(text)) score += 4
  if (
    /(bracket|mount|foot|feet|bolt|fastener|ladder|platform|rail|支架|地脚|螺栓|爬梯|平台)/i.test(
      text,
    )
  ) {
    score += 3
  }
  if (/(cover|guard|panel|罩|护罩|面板)/i.test(text)) score += 2
  if (
    /(body|base|frame|shell|casing|cabinet|arm|link|tank|vessel|housing|主体|底座|框架|壳体|罐|臂)/i.test(
      text,
    )
  ) {
    score -= 2
  }
  return Math.max(0, score)
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
