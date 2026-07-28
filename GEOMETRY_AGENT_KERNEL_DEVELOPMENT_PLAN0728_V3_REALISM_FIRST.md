# Geometry Agent Kernel Development Plan 0728 V3 — Realism First

## 1. Position

V2 fixed the engineering direction: reuse the existing DSL compiler, sandbox, AssemblyIR validation, and generated assembly rerun diff. That is necessary, but not sufficient.

V3 changes the top priority:

```text
Customer-deliverable industrial realism
  > agent architecture elegance
  > pipeline reuse
  > implementation minimalism
```

If a pipeline compiles but produces toy-like boxes, it is not successful. The Geometry Agent must produce equipment that looks recognizably industrial, supports local natural-language edits, and preserves source-based continuity.

## 2. Core Judgment

V2 answers:

```text
How do we generate and edit geometry source cleanly?
```

V3 answers:

```text
How do we make the generated equipment look like real equipment?
```

The decisive layer is not the agent loop itself. The decisive layer is the quality of the Equipment SDK functions plus the realism gates around their use.

## 3. Non-negotiable Product Bar

A generated factory device is not acceptable merely because it compiles.

It must:

- be recognizable as the requested equipment type;
- avoid anonymous box piles;
- include industrial details such as frames, guards, flanges, doors, bolts, ribs, nameplates, ports, cable trays, or handrails where relevant;
- use realistic proportions derived from referenced parts;
- use material presets that create believable metal, rubber, plastic, glass/polycarbonate, and safety-painted surfaces;
- support local natural-language edits without destroying unrelated parts;
- show what changed in human-readable terms after each edit.

## 4. Architecture Stays V2

Keep the V2 engineering base:

- register equipment functions through the existing DSL `DslApiBuilders`;
- compile through existing lexer/parser/evaluator;
- output existing AssemblyIR;
- validate through existing generated assembly validation;
- execute through existing sandbox runner/worker;
- apply edits through existing `planGeneratedAssemblyRerun`;
- keep source workspace and memory.

Do not create a parallel compiler or sandbox.

## 5. What V3 Adds

V3 adds five missing quality layers:

1. Equipment SDK mesh quality standard.
2. Equipment material preset system.
3. Proportion and target-reference system.
4. Structured change feedback.
5. Reference-input placeholders in memory.

These are required for realism. They are not optional polish.

## 6. Equipment SDK Implementation Quality Standard

V2 said each SDK function could be around 20 lines. That is too low for customer-deliverable industrial geometry.

V3 requirement:

```text
Each public equipment SDK function may be 50–150 lines if needed.
Prefer fewer high-quality semantic functions over many thin box wrappers.
```

The SDK function is responsible for visual and structural quality. The LLM should not manually guess low-level PBR values, bevels, segment counts, frame thicknesses, or clearances.

Every equipment SDK function must define:

- stable child part IDs;
- semantic roles;
- source part kind;
- realistic default dimensions;
- parameter clamps;
- material presets;
- edge softness / bevel defaults;
- segment defaults for round parts;
- target-relative sizing where applicable;
- small industrial details where cheap and meaningful.

### Required primitive quality defaults

Use available primitive quality controls:

| Parameter | Usage |
|---|---|
| `cornerRadius` | soften sheet metal, covers, doors, cabinets, frames |
| `cornerSegments` | make rounded boxes visibly smooth |
| `radialSegments` | make cylinders, rollers, flanges, ports, bolts round |
| `capSegments` | make capsules/rounded guards smoother |
| `bevelSize` / `bevelThickness` | soften extruded profiles |
| `bevelSegments` | avoid hard extrude edges |
| `roughness` / `metalness` / `opacity` | believable industrial materials |

Hard rule:

```text
No public equipment SDK function may emit only raw unrounded boxes unless the real component is truly a sharp block.
```

## 7. Equipment Material Preset System

Add material presets to the equipment SDK. The LLM should select named material intent; SDK maps it to visual properties.

Required v1 presets:

```ts
export const EQUIPMENT_MATERIALS = {
  painted_steel: {
    color: "#64748b",
    roughness: 0.5,
    metalness: 0.65,
  },
  stainless_steel: {
    color: "#c0c5c9",
    roughness: 0.28,
    metalness: 0.9,
  },
  cast_iron: {
    color: "#4a4a4a",
    roughness: 0.78,
    metalness: 0.55,
  },
  transparent_polycarbonate: {
    color: "#d4f0ff",
    roughness: 0.08,
    metalness: 0,
    opacity: 0.35,
    transparent: true,
  },
  wire_mesh: {
    color: "#8899aa",
    roughness: 0.58,
    metalness: 0.7,
  },
  rubber_belt: {
    color: "#2d2d2d",
    roughness: 0.95,
    metalness: 0,
  },
  aluminum_frame: {
    color: "#d0d5d8",
    roughness: 0.22,
    metalness: 0.82,
  },
  yellow_safety: {
    color: "#facc15",
    roughness: 0.42,
    metalness: 0.2,
  },
  dark_fastener: {
    color: "#111827",
    roughness: 0.55,
    metalness: 0.8,
  },
  control_panel_glass: {
    color: "#0f172a",
    roughness: 0.16,
    metalness: 0,
    opacity: 0.72,
    transparent: true,
  },
} as const
```

SDK functions accept:

```ts
material?: keyof typeof EQUIPMENT_MATERIALS
color?: string
```

If both are present, `color` overrides the base tint while preserving roughness/metalness/opacity.

## 8. Target-reference and Proportion System

Industrial realism depends on proportions. The LLM should not invent every number.

Equipment functions must support target references:

```ts
guardCover({
  id: "top_guard_cover",
  side: "top",
  target: "belt",
  clearance: 0.08,
  length: 3.5,
  material: "transparent_polycarbonate",
})
```

The SDK derives missing dimensions from the target:

```text
guardCover.width  = target.width + clearance * 2
guardCover.height = target.height + verticalClearance
guardCover.y/z    = derived from target bounds and side
```

Required relationship support:

- `target`: stable part ID or semantic role.
- `side`: `top | left | right | front | back`.
- `clearance`: safe gap around target.
- `align`: optional alignment mode.
- parameter clamps to keep dimensions sane.

### Required v1 proportion defaults

For conveyors:

- `guardCover.width = belt.width + 0.1m to 0.2m`.
- `motor.diameter ≈ belt.width * 0.4 to 0.6`.
- `inspectionDoor.height ≈ frame.height * 0.45 to 0.7`.
- `roller.radius ≈ belt.width * 0.035 to 0.07`.
- `frame.railThickness ≈ width * 0.025 to 0.05`.

For platforms/handrails:

- `handrail.height ≈ 1.05m to 1.15m`.
- `ladder.width ≈ 0.4m to 0.6m`.
- platform thickness and support legs are derived from platform span.

The LLM may specify intent; SDK computes safe defaults.

## 9. Equipment Function Quality Requirements

### `guardCover`

Must not be three raw panels.

Required geometry:

- top panel with `cornerRadius`;
- side/front/back panels when enclosed;
- visible frame rails;
- small mounting feet/brackets;
- transparent or wire-mesh material support;
- target-relative width/position;
- stable IDs for panels, frame rails, and brackets.

Recommended shape count: 8–16.

### `inspectionDoor`

Required geometry:

- rounded door panel;
- inset seam/gap;
- handle;
- hinge barrels or hinge strip;
- optional latch;
- side-relative placement.

Recommended shape count per door: 4–8.

### `motor`

Required geometry:

- cylindrical/ribbed motor body;
- end caps;
- shaft/coupling stub;
- mounting feet;
- terminal box;
- radialSegments >= 32.

Recommended shape count: 8–18.

### `rollerArray`

Required geometry:

- repeated cylinders with radialSegments >= 24;
- axle hints or end caps;
- optional support brackets;
- count derived from length if omitted.

### `belt`

Required geometry:

- dark rubber material;
- belt surface with slight thickness;
- optional return-belt shadow;
- rounded front/rear pulley hints when feasible.

### `boxFrame`

Required geometry:

- rails and legs, not one solid box;
- rounded or beveled rail members;
- cross braces when span is long;
- safety/yellow accent option.

### `flangePort`

Required geometry:

- protruding pipe cylinder;
- flange ring;
- bolt pattern;
- outward direction based on `side`;
- radialSegments >= 32.

### `pipeRun`

Required geometry:

- cylinders or sweeps;
- elbows when direction changes;
- flanges at ends if requested;
- support brackets for long runs.

### `platform`, `ladder`, `handrail`

Required geometry:

- grating/platform panel;
- support legs/brackets;
- ladder rails + rungs;
- handrail top rail + posts;
- standard human-scale dimensions.

## 10. Structured Change Feedback

Every edit run must return a structured human-readable diff summary.

Example:

```text
已修改：
- guardCover top_guard_cover width: 0.95m → 1.08m（belt 宽度 + 两侧 0.08m 余量）
- guardCover top_guard_cover height: 0.48m → 0.55m

保持不变：
- belt: 未修改
- frame: 未修改
- drive_motor: 未修改

增量更新：
- updated: top_guard_cover panels/frame/brackets
- unchanged: belt/frame/motor/rollers
```

This is the v1 feedback loop before visual AI review exists. It helps users say exactly what is still wrong.

## 11. Memory Schema Additions

Extend `memory.json` to support future reference-based realism.

```json
{
  "referenceImageAssetId": null,
  "referenceImageNotes": [],
  "targetDimensions": {
    "length": null,
    "width": null,
    "height": null,
    "unit": "m"
  },
  "realismPreferences": {
    "detailLevel": "industrial_delivery",
    "avoidToyLikeGeometry": true,
    "preferRoundedSheetMetal": true,
    "preferVisibleFasteners": true
  }
}
```

Even before image-to-geometry is implemented, the session must remember explicit dimensions and reference placeholders.

## 12. Realism Gate

V3 introduces a realism gate separate from structural validation.

V1 realism gate is static and rule-based. No vision model required.

Checks:

- major equipment SDK functions are used instead of anonymous raw boxes;
- key industrial parts have semantic roles;
- material presets are used;
- round parts have sufficient segments;
- sheet metal parts have corner/bevel settings;
- long equipment has frames/supports;
- conveyor has belt + rollers + frame;
- guarded conveyor has guard cover with rails/brackets, not a single box;
- motor has cylindrical body and mounting details.

Severity:

- `error`: obviously broken or toy-like for required scenario.
- `warning`: realism improvement recommended.
- `info`: optional polish.

The first vertical slice may hard-fail only the guarded conveyor scenario. Broader hard-fail rules can come later.

## 13. Agent Prompt Changes

The prompt must stop saying "each function is a simple primitive combination."

It should say:

```text
Use equipment SDK functions as high-quality industrial components.
Do not manually approximate equipment with anonymous boxes when an SDK function exists.
For local edits, patch the existing source and preserve stable IDs.
When a target reference is available, prefer target-relative sizing over hand-written numeric guesses.
Use named equipment materials instead of raw PBR values.
```

For "罩子大一点":

```text
Find guardCover(...). Increase clearance, width, or height.
Do not move belt, frame, rollers, or motor unless required.
Explain changed parameters after rerun.
```

## 14. First Vertical Slice Done Definition

Prompt:

```text
生成一个带透明防护罩的皮带输送机，右侧有电机
```

Must produce:

- `equipment`
- `boxFrame`
- `belt`
- `rollerArray`
- `guardCover`
- `motor`
- `nameplate` or simple safety/detail label

Minimum realism:

- conveyor is recognizable as conveyor;
- belt is dark rubber;
- rollers are round and repeated;
- frame is rails/legs, not one box;
- transparent cover has panels + frame rails + brackets;
- motor is cylindrical with feet and terminal box;
- important parts have stable IDs and semantic roles.

Edit:

```text
罩子大一点
```

Must:

- patch `guardCover`;
- preserve unrelated IDs;
- use `planGeneratedAssemblyRerun`;
- report changed dimensions;
- not regenerate the entire device.

Edit:

```text
右侧加两个检修门
```

Must:

- add `inspectionDoor`;
- doors have panel, handle, hinge/seam;
- preserve existing parts.

## 15. Development Phases

### Phase 1 — Material + quality primitives

Deliver:

- equipment material presets;
- helper functions for rounded box/panel defaults;
- helper for radial segment defaults;
- helper for stable child IDs;
- helper for semantic role/source part kind stamping.

Done:

- SDK functions can reuse quality defaults instead of hand-writing them.

### Phase 2 — High-quality guarded conveyor SDK slice

Deliver:

- `equipment`
- `boxFrame`
- `belt`
- `rollerArray`
- `guardCover`
- `motor`
- `inspectionDoor`
- `nameplate`

Done:

- Unit tests assert shape roles, material presets, corner/radial segment defaults, and realistic child part counts.

### Phase 3 — Register into existing DSL builders

Deliver:

- equipment functions available in `DslApiBuilders`;
- API card generated from SDK metadata;
- sandbox worker can compile equipment DSL.

Done:

- A source using `guardCover`, `belt`, `rollerArray`, `motor` compiles through existing DSL pipeline.

### Phase 4 — Source workspace + agent edit

Deliver:

- persistent source workspace;
- create source prompt;
- edit source prompt;
- patch locality checks.

Done:

- "罩子大一点" only changes cover-related source.

### Phase 5 — Incremental rerun + structured diff feedback

Deliver:

- edit rerun uses `planGeneratedAssemblyRerun`;
- changed/unchanged summary;
- debug details persist.

Done:

- user sees changed dimensions and unchanged parts after edit.

### Phase 6 — Realism gate v1

Deliver:

- static realism checks for guarded conveyor;
- warnings/errors included in repair loop;
- no vision model required.

Done:

- raw-box guarded conveyor fails realism gate;
- high-quality SDK conveyor passes.

### Phase 7 — Optional broader SDK fill-out

Add:

- `sheetCover`
- `flangePort`
- `pipeRun`
- `gearbox`
- `bearingBlock`
- `platform`
- `ladder`
- `handrail`
- `controlCabinet`

Only add these after the first conveyor slice proves visual quality.

## 16. Customer-facing Acceptance

The first milestone is accepted only if a non-developer user can look at the result and recognize:

```text
这是一个带透明防护罩、右侧有电机的皮带输送机。
```

It is not accepted if it looks like:

- a few boxes;
- a generic table;
- a toy conveyor;
- a box with a cylinder attached;
- a compiled but visually unconvincing placeholder.

## 17. Final Principle

Do not optimize for the smallest SDK implementation.

Optimize for:

```text
recognizable industrial geometry
  + stable editable source
  + local natural-language modification
  + repeatable compile/rerun
```

If realism requires 100 lines inside `guardCover`, write the 100 lines.

