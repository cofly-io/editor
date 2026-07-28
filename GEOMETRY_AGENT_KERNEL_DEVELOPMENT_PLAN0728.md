# Geometry Agent Kernel Development Plan 0728

## 1. Vision

Build a thin, domain-specific Geometry Agent Kernel: a "Codex for geometry" that maintains editable geometry source code, patches it through natural language, compiles it, validates it, and reruns it into a 3D preview.

This plan intentionally does not preserve compatibility with earlier generator DSL routing assumptions. The goal is a clean, modern architecture for long-horizon text-to-geometry work, with a future-ready entry point for image-to-geometry.

The first product surface is text-to-geometry for factory equipment. Image-to-geometry is not implemented in this phase, but the architecture must leave a clear input adapter seam for a future multimodal model.

## 2. Product Outcome

For an end user, generation should feel less like "draw a random 3D object once" and more like "maintain an editable equipment model through conversation."

Example flow:

```text
User: 生成一个带防护罩的皮带输送机
Agent: creates equipment.ts, compiles, validates, previews

User: 罩子大一点
Agent: patches guardCover({ width, height }), reruns, previews

User: 右侧加两个检修门
Agent: adds inspectionDoor({ side: "right", count: 2 }), reruns, previews
```

The model should not regenerate the whole object on every edit. It should patch the existing source.

## 3. Non-goals

- Do not build a general personal assistant runtime.
- Do not embed QwenPaw, ZeroClaw, PicoClaw, or another Claw project as a hard dependency.
- Do not expose arbitrary Python, Node, filesystem, network, or shell execution to generated geometry code.
- Do not add hundreds of object-specific recipes.
- Do not make the first version image-to-geometry.
- Do not keep legacy compatibility shims for old DSL routing if they make the new kernel muddy.

## 4. Architecture Overview

```text
Text prompt
  ↓
Geometry Agent Session
  ↓
Equipment Source Workspace
  ↓
Restricted equipment.ts / geometry DSL source
  ↓
Compile to Geometry IR
  ↓
Spatial + semantic validation
  ↓
Artifact generation
  ↓
3D preview
  ↓
User edit instruction
  ↓
Agent source patch → compile → validate → preview
```

Future image path:

```text
Image prompt
  ↓
Vision model extracts GeometrySpec
  ↓
same Geometry Agent Session
```

## 5. Core Design Principles

1. Source is the memory

   Every generated equipment has a persistent source file. Conversation edits patch that source rather than inventing a new geometry response.

2. Agent is thin

   The kernel manages state, tools, validation, and patch loops. It does not become a general autonomous OS.

3. Equipment SDK is semantic but small

   Provide around 15 industrial equipment helper functions. They are composable primitives, not full equipment recipes.

4. Compile output is structured

   Source compiles into Pascal geometry IR / generated artifact data, not arbitrary Three.js objects.

5. Validation is first-class

   Every run must produce diagnostics: compile result, semantic roles, spatial issues, preview/artifact status.

6. Text first, multimodal seam ready

   The initial adapter accepts text. The next adapter can accept image-derived specs without rewriting the kernel.

## 6. Proposed File Layout

```text
apps/editor/lib/geometry-agent/
  agent-session.ts
  agent-types.ts
  agent-store.ts
  agent-runner.ts
  agent-prompts.ts
  source-workspace.ts
  source-patcher.ts
  source-compiler.ts
  validation-runner.ts
  preview-runner.ts
  model-provider.ts
  input-adapters/
    text-input-adapter.ts
    image-input-adapter.stub.ts

packages/core/src/lib/equipment-sdk/
  index.ts
  equipment-ir.ts
  equipment-functions.ts
  equipment-api-card.ts
  equipment-validation.ts

packages/editor/src/lib/geometry-agent/
  client-types.ts
  run-summary.ts

apps/editor/app/api/geometry-agent/runs/
  route.ts
```

This layout separates:

- `packages/core`: pure equipment SDK, IR, and validation.
- `apps/editor`: agent orchestration, persistence, API routes.
- `packages/editor`: UI-facing types and summaries.

## 7. Equipment Source Workspace

Each agent-created asset gets an isolated workspace:

```text
apps/editor/.generated/geometry-agent/runs/<runId>/
  manifest.json
  source.equipment.ts
  artifact.json
  preview.png
  events.jsonl
  memory.json
  diagnostics.json
```

### manifest.json

```json
{
  "runId": "geo_agent_xxx",
  "version": 1,
  "sourceFile": "source.equipment.ts",
  "artifactFile": "artifact.json",
  "status": "succeeded",
  "inputMode": "text",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### memory.json

Stores compact durable context:

```json
{
  "userGoal": "带防护罩的皮带输送机",
  "equipmentFamily": "conveyor",
  "namedParts": {
    "guardCover": "top transparent guard cover",
    "driveMotor": "right rear motor"
  },
  "userPreferences": {
    "safetyColor": "#facc15",
    "industrialStyle": "realistic editable factory equipment"
  },
  "recentDecisions": [
    "Guard cover is modeled as a raised transparent sheet cover above belt."
  ]
}
```

## 8. Source Format

Use a restricted TypeScript-like equipment source file. The model writes source that calls only approved equipment SDK functions.

Example:

```ts
const model = equipment("belt_conveyor", {
  length: 6,
  width: 0.8,
  height: 1.1,
  primaryColor: "#64748b",
})

model.add(belt({ id: "belt", length: 6, width: 0.72 }))
model.add(rollerArray({ id: "rollers", count: 12, length: 6, width: 0.78 }))
model.add(boxFrame({ id: "frame", length: 6, width: 0.9, height: 0.8 }))
model.add(guardCover({
  id: "top_guard_cover",
  side: "top",
  length: 3.4,
  width: 0.95,
  height: 0.48,
  material: "transparent_polycarbonate",
}))
model.add(motor({ id: "drive_motor", side: "right", position: "rear" }))
model.add(inspectionDoor({ id: "right_doors", side: "right", count: 2 }))

export default model
```

Generated code must be deterministic, readable, patchable, and small.

## 9. Minimal Equipment SDK Functions

Implement about 15 semantic functions. Each should be around 20 lines of primitive composition where possible. These are not full equipment recipes; they are reusable industrial geometry vocabulary.

Required v1 functions:

1. `equipment(type, params)`
2. `boxFrame(params)`
3. `sheetCover(params)`
4. `guardCover(params)`
5. `inspectionDoor(params)`
6. `flangePort(params)`
7. `pipeRun(params)`
8. `motor(params)`
9. `gearbox(params)`
10. `bearingBlock(params)`
11. `belt(params)`
12. `rollerArray(params)`
13. `platform(params)`
14. `ladder(params)`
15. `handrail(params)`
16. `controlCabinet(params)`
17. `nameplate(params)`

The target is "around 15"; 17 are listed because `controlCabinet` and `nameplate` are cheap and very useful for industrial realism.

### Function requirements

Each function must:

- Emit primitive shapes with stable IDs.
- Set semantic roles.
- Set source part kind.
- Use meters.
- Avoid hidden random values.
- Expose only meaningful parameters.
- Include default proportions.
- Return structured IR, not viewer objects.

Example role output:

```ts
guardCover({
  id: "top_guard_cover",
  semanticRole: "safety_guard_cover",
  sourcePartKind: "guardCover",
})
```

## 10. API Card

The agent prompt must include a compact API card generated from the SDK.

Example:

```text
guardCover({
  id: string,
  side: "top" | "left" | "right" | "front" | "back",
  length?: number,
  width?: number,
  height?: number,
  clearance?: number,
  material?: "painted_steel" | "transparent_polycarbonate" | "wire_mesh"
})
Use for protective machine covers. Prefer this over raw boxes for guards.
```

The API card must be source-controlled and test-covered so prompt/schema drift is visible.

## 11. Agent Skill Prompt

The Geometry Agent prompt should make the model act like a code-editing agent for geometry source.

Core instructions:

- Create or patch `source.equipment.ts`.
- Never regenerate the whole source for a local edit unless the user asks for a redesign.
- Prefer semantic equipment SDK functions over raw primitives.
- Preserve stable IDs.
- Preserve user-approved parts.
- Explain changed parameters after a successful patch.
- If the instruction is local, patch only the relevant function call.
- If compile or validation fails, repair the source.
- Keep geometry realistic for factory equipment.

Example edit:

```text
User says: "罩子大一点"
Patch guardCover width/height/clearance. Do not move the motor, belt, frame, or doors.
```

## 12. Agent Kernel State Machine

```text
idle
  ↓
understanding
  ↓
planning_source
  ↓
writing_source
  ↓
compiling
  ↓
validating
  ↓
rendering_preview
  ↓
succeeded
```

Repair path:

```text
compiling/validating/rendering_preview
  ↓
diagnosing
  ↓
patching_source
  ↓
compiling
```

Terminal states:

- `succeeded`
- `failed_compile`
- `failed_validation`
- `failed_model_output`
- `cancelled`

## 13. Agent Tools

The model should interact through a small tool surface:

```ts
readSource(runId)
writeInitialSource(runId, source)
patchSource(runId, patch)
compileSource(runId)
validateArtifact(runId)
renderPreview(runId)
summarizeRun(runId)
```

Initial implementation can execute these internally rather than exposing them as external MCP tools.

## 14. Compile Strategy

Preferred v1 approach:

- Parse restricted equipment source.
- Accept only imports from the approved SDK or no imports at all.
- Evaluate source in a sandboxed interpreter / compiler path.
- Convert equipment SDK calls into generated geometry IR.

Do not execute arbitrary TypeScript with unrestricted Node APIs.

If using a TS-like syntax is too expensive for v1, implement a stricter JSON-AST form first:

```json
{
  "equipment": { "type": "belt_conveyor", "params": { "length": 6 } },
  "parts": [
    { "fn": "belt", "id": "belt", "params": { "length": 6, "width": 0.72 } },
    { "fn": "guardCover", "id": "top_guard_cover", "params": { "side": "top" } }
  ]
}
```

But the persisted source should still be user-readable and patchable. If JSON-AST is used internally, generate a readable `source.equipment.ts` view.

## 15. Validation

Validation must be specific to factory equipment, not just generic collision checks.

V1 validation:

- All shapes have stable IDs.
- Important parts have semantic roles.
- No unsupported SDK calls.
- No duplicate IDs.
- No NaN or infinite dimensions.
- Dimensions are in sane industrial ranges.
- Main body/frame exists.
- Safety covers are above or around the target, not buried inside it.
- Inspection doors are on visible side surfaces.
- Flange ports protrude outward.
- Platforms and ladders touch or align with equipment.
- Handrails are above platforms.
- Artifact part count is under budget.

Diagnostics must be repairable:

```json
{
  "code": "guard_cover_too_small",
  "message": "guardCover top_guard_cover does not cover belt width.",
  "suggestedPatch": {
    "targetId": "top_guard_cover",
    "params": { "width": 1.05 }
  }
}
```

## 16. Preview Loop

V1 must rerun the existing artifact/scene preview path. A screenshot is optional in the first milestone but the API should reserve fields for it:

```json
{
  "preview": {
    "artifactId": "ai_geometry_xxx",
    "screenshotPath": null,
    "cameraPreset": "isometric"
  }
}
```

V2 adds visual QA from screenshots.

## 17. Text-to-Geometry Input Adapter

Text adapter responsibilities:

- Convert user prompt into initial `GeometryAgentIntent`.
- Decide create vs edit.
- If edit, bind instruction to existing run/session.
- Build model prompt with API card, current source, memory, diagnostics.
- Request source creation or patch.

V1 only supports text.

## 18. Image-to-Geometry Future Adapter

Create a stub interface only:

```ts
type GeometryAgentInput =
  | { mode: "text"; prompt: string }
  | { mode: "image"; prompt?: string; imageAssetId: string }
```

The image adapter should later produce the same `GeometryAgentIntent` as text:

```ts
type GeometryAgentIntent = {
  action: "create" | "edit"
  equipmentType?: string
  requestedParts: string[]
  constraints: Record<string, unknown>
}
```

Do not implement vision model calls in v1.

## 19. API Route

Add:

```text
POST /api/geometry-agent/runs
GET  /api/geometry-agent/runs/:runId
POST /api/geometry-agent/runs/:runId/messages
```

V1 may use existing run-store patterns, but the model should be clean:

```ts
type GeometryAgentRun = {
  id: string
  status: GeometryAgentStatus
  inputMode: "text" | "image"
  sourcePath: string
  artifactId?: string
  diagnostics: GeometryAgentDiagnostic[]
  events: GeometryAgentEvent[]
}
```

## 20. UI Surface

Initial UI can be minimal:

- User prompt input.
- Run card.
- Status steps.
- Generated artifact preview.
- Source debug panel.
- Diagnostics panel.
- Follow-up edit input.

Important UX rule:

After completion, source and diagnostics remain visible. Do not hide debug details after a run succeeds.

## 21. Development Phases

### Phase 1 — Kernel Skeleton

Deliver:

- `GeometryAgentRun` types.
- Run workspace creation.
- Event log.
- Source file persistence.
- Text create endpoint stub.
- No real LLM required; accept injected source in tests.

Completion definition:

- Can create a run workspace.
- Can persist `source.equipment.ts`.
- Can write/read events.
- Tests cover run lifecycle.

### Phase 2 — Equipment SDK v1

Deliver:

- Core equipment IR.
- 15-ish semantic SDK functions.
- API card generator.
- Unit tests for every function.

Completion definition:

- Each SDK function emits stable IDs and semantic roles.
- API card includes every public function.
- No viewer/editor imports in core.

### Phase 3 — Source Compiler

Deliver:

- Restricted source compiler.
- Unsupported API diagnostics.
- Duplicate ID diagnostics.
- Compile to generated geometry artifact.

Completion definition:

- A conveyor source compiles into an artifact.
- Invalid source gives repairable diagnostics.
- No arbitrary Node/Python execution.

### Phase 4 — Text Agent Create Loop

Deliver:

- Agent prompt.
- Text prompt to initial source.
- Compile and validation loop.
- Bounded repair attempts.

Completion definition:

- "生成一个带防护罩的皮带输送机" creates source and artifact.
- Run events show understand/write/compile/validate/preview.
- Failure includes diagnostics and source.

### Phase 5 — Natural Language Patch Loop

Deliver:

- Follow-up message endpoint.
- Source patching prompt.
- Patch-locality checks.
- Recompile/rerun.

Completion definition:

- "罩子大一点" changes only `guardCover` parameters.
- "右侧加两个检修门" adds `inspectionDoor` without regenerating unrelated parts.
- Diff summary is shown.

### Phase 6 — Factory Equipment Validation

Deliver:

- Guard cover coverage checks.
- Door placement checks.
- Port protrusion checks.
- Platform/ladder/handrail checks.
- Dimension sanity checks.

Completion definition:

- Bad cover/door/port examples fail with actionable diagnostics.
- Repair loop can fix at least three validation failures.

### Phase 7 — UI Integration

Deliver:

- Basic geometry-agent panel or reuse AI chat panel with new mode.
- Source/debug details remain after completion.
- Follow-up edits attach to existing run.

Completion definition:

- User can create equipment, inspect source, submit edit, and see rerun artifact.

### Phase 8 — Image Adapter Stub

Deliver:

- Input type support for image mode.
- Stub route returns "not implemented" diagnostic.
- No real vision calls.

Completion definition:

- Architecture accepts image mode without changing run/session model.
- Text mode remains unaffected.

## 22. Acceptance Scenarios

### Scenario A — Create conveyor with guard cover

Prompt:

```text
生成一个带透明防护罩的皮带输送机，右侧有电机
```

Expected:

- Source includes `equipment`, `belt`, `rollerArray`, `boxFrame`, `guardCover`, `motor`.
- Artifact has belt, rollers, frame, cover, motor.
- Cover is above belt and wider than belt.
- Motor is on right side.

### Scenario B — Local edit

Prompt:

```text
罩子大一点
```

Expected:

- Only `guardCover` params change.
- Existing belt/frame/motor IDs preserved.
- Artifact reruns successfully.

### Scenario C — Add inspection doors

Prompt:

```text
右侧加两个检修门
```

Expected:

- Source adds or updates `inspectionDoor({ side: "right", count: 2 })`.
- Doors have stable IDs.
- Doors are visible and not buried inside the equipment.

### Scenario D — Add ports

Prompt:

```text
左侧加一个法兰接口，朝外
```

Expected:

- Source adds `flangePort({ side: "left" })`.
- Port protrudes outward.
- Validation passes.

### Scenario E — Repair failed source

Injected bad source:

```ts
model.add(guardCover({ id: "cover", width: 0.2 }))
```

Expected:

- Validation detects cover too small.
- Agent repair expands cover width.
- Rerun succeeds.

## 23. Quality Bar

Generated factory equipment should:

- Use recognizable industrial components.
- Preserve editable semantic roles.
- Be stable under follow-up edits.
- Avoid anonymous all-box geometry.
- Maintain believable proportions.
- Explain what changed after each edit.
- Leave source and diagnostics visible after completion.

## 24. Technical Risks

1. Source compiler complexity

   Mitigation: start with a narrow syntax or JSON-AST and keep source generation constrained.

2. Model rewrites too much on edit

   Mitigation: patch-locality checks, stable IDs, diff budget, prompt rules.

3. SDK becomes another recipe swamp

   Mitigation: keep functions generic industrial components, not full equipment classes.

4. Validation becomes too brittle

   Mitigation: diagnostics should be advisory + repairable; only hard-fail structural defects.

5. UI confusion with existing primitive runs

   Mitigation: give Geometry Agent its own run mode and source panel.

## 25. Open Decisions

- Source syntax: restricted TS-like source vs JSON-AST with TS view.
- Whether to reuse existing primitive run-store or build a clean geometry-agent store.
- Whether preview screenshot is required in v1 or deferred to v2.
- Whether agent patches are text diffs or full-source rewrites with diff validation.
- Which model is the default for source patching before Kimi K3 integration.

## 26. Recommended First Implementation Slice

Start with a single happy path:

```text
Text prompt:
生成一个带透明防护罩的皮带输送机，右侧有电机

Generated source:
equipment + belt + rollerArray + boxFrame + guardCover + motor

Edit prompt:
罩子大一点
```

Do not build all 17 SDK functions before the first vertical slice. Implement only:

- `equipment`
- `boxFrame`
- `belt`
- `rollerArray`
- `guardCover`
- `motor`
- `inspectionDoor`
- `nameplate`

Once the source-edit-compile-preview loop works, fill out the rest of the SDK.

## 27. Done Definition for the Whole Plan

The plan is complete when:

- A text prompt creates a persisted geometry source workspace.
- The source compiles into editable generated geometry.
- The user can issue at least three natural-language follow-up edits.
- Edits patch existing source rather than regenerating unrelated geometry.
- Validation diagnostics are shown and retained after completion.
- At least one failed validation is automatically repaired by patching source.
- The UI can show final artifact, source, diagnostics, and event history.
- The architecture contains an image input adapter seam without implementing image generation.

