# Geometry Agent Kernel Development Plan 0728 V2

## 1. Purpose

Build a thin Geometry Agent Kernel on top of the existing generated-geometry DSL pipeline.

V2 corrects the implementation strategy from the first plan: do not build a parallel compiler, sandbox, validator, rerun engine, or run pipeline. Reuse the existing modules and add only the missing layer:

- persistent source workspace;
- equipment semantic SDK functions;
- agent session orchestration for create/edit;
- prompt/API-card integration;
- incremental rerun after source edits.

The product goal remains the same: make factory equipment generation feel like a geometry-focused Codex, where source code is the durable memory and natural language patches the source.

## 2. Core Decision

Use the existing DSL compiler and runtime.

Current pipeline:

```text
DSL source
  ↓
generated-geometry-dsl-lexer.ts
  ↓
generated-geometry-dsl-parser.ts
  ↓
generated-geometry-dsl-evaluator.ts
  ↓
DslApiBuilders
  ↓
AssemblyIR
  ↓
generated-assembly-validation.ts
  ↓
generated-geometry-sandbox-runner.ts / worker
  ↓
generated artifact / placement / rerun
```

New V2 pipeline:

```text
equipment source
  ↓
same DSL compiler
  ↓
DslApiBuilders + equipment semantic functions
  ↓
same AssemblyIR
  ↓
same validation + sandbox
  ↓
same placement / rerun diff
```

No new lexer, parser, evaluator, generic validator, or sandbox worker.

## 3. Product Behavior

Create:

```text
User: 生成一个带透明防护罩的皮带输送机，右侧有电机
Agent:
  - creates source.equipment.dsl
  - compiles through existing DSL compiler
  - validates through existing IR validation
  - places generated artifact
  - stores source as memory
```

Edit:

```text
User: 罩子大一点
Agent:
  - reads existing source.equipment.dsl
  - patches guardCover(...) params
  - recompiles
  - uses generated-assembly-rerun diff path
  - preserves stable part IDs and scene continuity
```

The agent must not regenerate unrelated geometry for local edits.

## 4. What Stays From V1

Keep:

- Source-as-memory.
- Small equipment semantic SDK instead of many equipment recipes.
- `memory.json` for durable context.
- API card + agent prompt.
- Text-to-geometry first.
- Image-to-geometry adapter seam for later.
- Natural language patch loop.
- Debug/source/diagnostics remain visible after completion.

Change:

- Do not create a parallel compiler.
- Do not create a parallel validation pipeline.
- Do not create a new rerun/placement mechanism.
- Do not promise hard semantic validation in v1.

## 5. Minimal File Layout

Only add what is truly missing.

```text
packages/core/src/lib/equipment-sdk/
  equipment-functions.ts
  equipment-api-card.ts
  equipment-functions.test.ts

apps/editor/lib/geometry-agent/
  agent-session.ts
  source-workspace.ts
  geometry-agent-types.ts
  agent-session.test.ts
  source-workspace.test.ts
```

Extend existing files:

```text
apps/editor/lib/ai-harness-runs/generator-dsl-llm-loop.ts
apps/editor/lib/ai-harness-runs/generator-dsl-run.ts
apps/editor/lib/ai-harness-runs/generated-geometry-sandbox-runner.ts
apps/editor/lib/ai-harness-runs/generated-geometry-sandbox-worker.ts
packages/core/src/lib/generated-geometry-dsl-contract.ts
packages/core/src/lib/generated-assembly-validation.ts
packages/editor/src/lib/generated-assembly-rerun.ts
```

Expected extension level:

- `generator-dsl-llm-loop.ts`: add workspace/source-origin prompt path.
- `generator-dsl-run.ts`: add source workspace mode.
- sandbox runner/worker: ideally no behavior change; only import/register equipment builders if needed.
- DSL contract/API card: append equipment SDK API section.
- assembly validation: no v1 hard semantic validation; at most advisory warnings later.
- generated assembly rerun: explicitly use after edit.

## 6. Source Workspace

Each geometry-agent session stores durable source and lightweight memory.

```text
apps/editor/.generated/geometry-agent/sessions/<sessionId>/
  manifest.json
  source.equipment.dsl
  memory.json
  events.jsonl
  last-run.json
  diagnostics.json
```

### manifest.json

```json
{
  "sessionId": "geo_agent_xxx",
  "sourcePath": "source.equipment.dsl",
  "currentArtifactId": "ai_geometry_xxx",
  "status": "succeeded",
  "inputMode": "text",
  "sourceOrigin": "workspace",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### memory.json

```json
{
  "userGoal": "带透明防护罩的皮带输送机",
  "equipmentType": "belt_conveyor",
  "namedParts": {
    "top_guard_cover": "透明顶部防护罩",
    "drive_motor": "右侧后部电机"
  },
  "recentDecisions": [
    "防护罩覆盖皮带上方，不包住电机。",
    "右侧电机保持在尾部，不随罩子尺寸编辑移动。"
  ],
  "userPreferences": {
    "industrialStyle": "editable realistic factory equipment"
  }
}
```

## 7. Equipment DSL API

Do not invent a new language. Register equipment semantic functions in the existing `DslApiBuilders` mechanism.

Existing DSL source should continue to work:

```ts
const P = params(...)
part("body", box(...)).atWorld(...)
```

Equipment DSL adds semantic builder functions:

```ts
const P = params({
  length: { type: "number", unit: "m", range: [1, 20], default: 6 },
  coverHeight: { type: "number", unit: "m", range: [0.2, 2], default: 0.55 },
})

equipment("belt_conveyor", { id: "conveyor", length: P.length, width: 0.8 })
boxFrame({ id: "frame", length: P.length, width: 0.9, height: 0.8 })
belt({ id: "belt", length: P.length, width: 0.72 })
rollerArray({ id: "rollers", count: 12, length: P.length, width: 0.78 })
guardCover({
  id: "top_guard_cover",
  side: "top",
  target: "belt",
  length: 3.5,
  width: 0.95,
  height: P.coverHeight,
  material: "transparent_polycarbonate",
})
motor({ id: "drive_motor", side: "right", position: "rear" })
nameplate({ id: "nameplate", text: "BC-01" })
```

Important: these functions compile to the same AssemblyIR part/geometry records as ordinary DSL builders.

## 8. Equipment SDK Functions

Implement a small vocabulary of industrial components.

V1 vertical slice:

1. `equipment`
2. `boxFrame`
3. `belt`
4. `rollerArray`
5. `guardCover`
6. `motor`
7. `inspectionDoor`
8. `nameplate`

V1.5 fill-out:

9. `sheetCover`
10. `flangePort`
11. `pipeRun`
12. `gearbox`
13. `bearingBlock`
14. `platform`
15. `ladder`
16. `handrail`
17. `controlCabinet`

Each function should:

- be pure core logic;
- emit deterministic part IDs;
- emit semantic roles;
- use existing primitive builders internally;
- stay generic to factory equipment;
- avoid becoming a full device recipe;
- have unit tests.

Example:

```ts
guardCover({
  id: "top_guard_cover",
  side: "top",
  target: "belt",
  width: 1.0,
  height: 0.55,
})
```

Expected emitted roles:

- `safety_guard_cover`
- `cover_panel`
- optional `cover_frame`

## 9. API Card Integration

Add an equipment section to the existing generated-geometry DSL API card.

Do not create a separate prompt-only schema that drifts from implementation.

`equipment-api-card.ts` should be generated from the SDK function metadata:

```ts
type EquipmentFunctionCard = {
  name: string
  signature: string
  description: string
  requiredRoles: string[]
  examples: string[]
}
```

The agent prompt consumes this card:

```text
Use equipment SDK functions for factory equipment.
Prefer guardCover(...) over raw boxes for protective covers.
Prefer inspectionDoor(...) over raw panels for service doors.
Preserve stable IDs on edits.
```

## 10. Agent Session

Add a thin session manager, not a general agent runtime.

Responsibilities:

- create workspace;
- persist source;
- persist memory;
- append events;
- call LLM create/patch prompt;
- call existing DSL run pipeline;
- call rerun diff on edit;
- summarize result.

Proposed type:

```ts
type GeometryAgentSession = {
  id: string
  status: "idle" | "running" | "succeeded" | "failed" | "cancelled"
  sourcePath: string
  currentArtifactId?: string
  inputMode: "text" | "image"
  sourceOrigin: "llm" | "workspace"
  createdAt: string
  updatedAt: string
}
```

## 11. Reuse Existing LLM Loop

Extend `generator-dsl-llm-loop.ts` rather than writing a new source loop.

Add:

```ts
type DslSourceOrigin = "llm" | "workspace"
```

Create mode:

```text
sourceOrigin = "llm"
LLM writes new source using equipment API card.
```

Edit mode:

```text
sourceOrigin = "workspace"
LLM receives current source + edit instruction.
LLM outputs a patched complete source or structured patch.
```

V1 can accept full-source rewrite if a diff-locality check passes.

Later versions can require structured patches.

## 12. Patch Locality

For local edit instructions, protect against destructive full regeneration.

Examples:

- "罩子大一点" may change `guardCover` dimensions.
- It must not rewrite `belt`, `frame`, `motor`, or unrelated IDs.
- "右侧加两个检修门" may add `inspectionDoor`.
- It must preserve existing part IDs.

V1 patch-locality checks:

- stable ID set before/after;
- changed lines count below threshold for local edits;
- unchanged major functions for unrelated parts;
- current artifact ID preserved through rerun diff.

If locality check fails, ask the LLM for a smaller patch using diagnostics.

## 13. Compile and Validate

Compile through existing sandbox path.

Reuse:

- `generated-geometry-sandbox-runner.ts`
- `generated-geometry-sandbox-worker.ts`
- `generated-assembly-validation.ts`
- current IR validation gates
- current budget / timeout / diagnostic machinery

V1 validation scope:

- existing compiler diagnostics;
- existing AssemblyIR validation;
- duplicate ID detection if not already covered;
- unsupported equipment function detection;
- basic parameter range checks inside equipment functions.

Do not hard-fail advanced semantic spatial rules in v1.

## 14. Semantic Validation Policy

The first plan over-promised semantic validation. V2 narrows it.

V1:

- structural only;
- hard-fail compile/IR/sandbox defects;
- equipment function range checks;
- no inverse-geometry suggested patches except simple range clamps.

V2:

- advisory warnings for equipment semantics:
  - guard cover narrower than target;
  - inspection door appears buried;
  - flange port does not protrude;
  - handrail not above platform.

V3:

- repair suggestions for selected rules.

Do not block the v1 kernel on difficult spatial semantics.

## 15. Rerun Diff

Edits must use existing incremental rerun.

After patched source compiles to new IR:

```text
old AssemblyIR + new AssemblyIR
  ↓
planGeneratedAssemblyRerun
  ↓
incremental create/update/delete
  ↓
preserve scene node IDs where part IDs are stable
```

This is mandatory for follow-up edits. Do not rebuild the entire assembly when part IDs are stable.

Completion requirement:

- "罩子大一点" preserves selection/reference stability for unchanged belt/frame/motor parts.

## 16. API Surface

Prefer integrating with existing AI harness run store if it avoids duplication, but keep geometry-agent concepts explicit.

Minimal endpoints:

```text
POST /api/geometry-agent/sessions
GET  /api/geometry-agent/sessions/:sessionId
POST /api/geometry-agent/sessions/:sessionId/messages
```

Create body:

```json
{
  "mode": "text",
  "prompt": "生成一个带透明防护罩的皮带输送机，右侧有电机"
}
```

Edit body:

```json
{
  "prompt": "罩子大一点"
}
```

V1 may implement these as thin wrappers over existing run APIs if that keeps the code smaller.

## 17. UI Requirements

Minimal UI:

- create prompt;
- follow-up edit input;
- status timeline;
- artifact preview;
- source debug panel;
- diagnostics/event panel.

Important:

- Do not hide source/debug details after success.
- Show diff summary after edits.
- Show whether rerun was incremental.

## 18. Image-to-Geometry Seam

Only add types and adapter stub.

```ts
type GeometryAgentInput =
  | { mode: "text"; prompt: string }
  | { mode: "image"; prompt?: string; imageAssetId: string }
```

Image adapter later produces the same create/edit intent used by text:

```ts
type GeometryAgentIntent = {
  action: "create" | "edit"
  equipmentType?: string
  requestedParts: string[]
  constraints: Record<string, unknown>
}
```

No Kimi K3 integration in v1. The provider boundary should make Kimi K3 easy to add later.

## 19. Development Phases

### Phase 1 — Equipment SDK registration

Deliver:

- `packages/core/src/lib/equipment-sdk/equipment-functions.ts`
- `equipment-api-card.ts`
- SDK metadata
- registration into existing `DslApiBuilders`
- tests for v1 functions

Done:

- A DSL source using `guardCover`, `belt`, `rollerArray`, `motor` compiles through the existing compiler.
- The output is AssemblyIR.
- No new lexer/parser/evaluator.

### Phase 2 — Source workspace

Deliver:

- `source-workspace.ts`
- session directory creation
- read/write source
- manifest/memory/events persistence

Done:

- Can create a session workspace.
- Can persist and reload `source.equipment.dsl`.
- Events are append-only JSONL.

### Phase 3 — Agent create + edit loop

Deliver:

- `agent-session.ts`
- create prompt using equipment API card
- edit prompt using current source + memory
- sourceOrigin support in existing DSL loop/run path

Done:

- Create prompt produces equipment source.
- Edit prompt patches existing source.
- Compile failures go through existing repair loop.

### Phase 4 — Incremental rerun integration

Deliver:

- edit flow calls `planGeneratedAssemblyRerun`
- unchanged part IDs preserve existing scene nodes
- run summary reports created/updated/deleted counts

Done:

- "罩子大一点" updates guard cover without rebuilding belt/frame/motor.
- Diff summary is visible.

### Phase 5 — UI/debug integration

Deliver:

- minimal geometry-agent panel or route in existing chat panel
- source display
- diagnostics display
- follow-up edit input

Done:

- User can create equipment, inspect source, edit source through natural language, and see rerun result.
- Debug details remain after completion.

### Phase 6 — Advisory semantic validation

Deliver:

- non-blocking warnings for selected equipment rules
- no v1 hard-fail for complex semantic geometry

Done:

- guard cover too small emits warning.
- flange buried emits warning.
- warnings are included in repair prompt only when useful.

## 20. Acceptance Scenarios

### A. Create guarded conveyor

Prompt:

```text
生成一个带透明防护罩的皮带输送机，右侧有电机
```

Expected:

- Source uses `equipment`, `boxFrame`, `belt`, `rollerArray`, `guardCover`, `motor`.
- Existing DSL compiler succeeds.
- Existing IR validation succeeds.
- Artifact appears in scene.

### B. Local cover edit

Prompt:

```text
罩子大一点
```

Expected:

- Source patch changes `guardCover` params.
- Other stable IDs preserved.
- Rerun diff updates cover nodes only.

### C. Add inspection doors

Prompt:

```text
右侧加两个检修门
```

Expected:

- Source adds `inspectionDoor({ side: "right", count: 2 })`.
- Existing IDs preserved.
- Artifact reruns incrementally.

### D. Bad source repair

Injected source:

```ts
guardCover({ id: "cover", side: "top", width: -1 })
```

Expected:

- Existing compiler/evaluator or equipment function validation emits diagnostic.
- Repair loop asks LLM to fix source.
- Corrected source compiles.

## 21. Whole-plan Done Definition

The V2 plan is complete when:

- Equipment semantic functions are registered into the existing DSL API builder path.
- Text create can generate persistent equipment source.
- Text edit can patch persistent equipment source.
- Source compiles through the existing DSL compiler/sandbox.
- IR validates through existing generated assembly validation.
- Edit reruns use existing generated assembly diff instead of rebuilding the whole scene.
- Source, memory, diagnostics, and event history persist after success.
- At least three natural-language edits work on one session:
  - enlarge guard cover;
  - add inspection doors;
  - move/add motor or flange port.
- Image input seam exists but does not call a vision model.

## 22. Recommended First Slice

Implement only this vertical slice:

```text
create:
生成一个带透明防护罩的皮带输送机，右侧有电机

edit 1:
罩子大一点

edit 2:
右侧加两个检修门
```

Required SDK functions for the slice:

- `equipment`
- `boxFrame`
- `belt`
- `rollerArray`
- `guardCover`
- `motor`
- `inspectionDoor`
- `nameplate`

Required reuse:

- existing DSL compiler;
- existing sandbox runner;
- existing IR validation;
- existing generated assembly rerun diff.

This slice proves the core thesis without overbuilding a new agent platform.

