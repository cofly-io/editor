# Component Pack and Industry Pack Scaffold Development Spec

## 1. Goal

This document defines the **asset workspace and scaffolding system** for component packs and industry packs.

Current scope:

- Create component pack scaffolds.
- Create generator scaffolds.
- Create industry pack scaffolds.
- Validate component pack manifests, generator manifests, and industry pack manifests.
- Build component and industry packs into zip artifacts.
- Publish built artifacts into a local `cloud` folder that simulates the future cloud marketplace.

Out of scope for this scaffold project:

- 3D editor canvas integration
- Inspector UI
- Runtime parameter editing in the main editor
- Custom attachment UI
- Data binding preview/runtime
- Pipeline geometry rendering in the editor
- Marketplace UI
- Screenshot automation inside the editor

Those items belong to the main editor product integration phase after the scaffold and pack contracts are stable.

The long-term product should support high-quality 3D factory generation without putting every industrial generator into the main editor codebase.

The target model is:

- Component packs provide reusable semantic assembly generators.
- Industry packs describe factory knowledge, equipment profiles, layout, connections, and default parameters.
- The editor installs packs, validates dependencies, runs generators, creates semantic assemblies, and lets users edit or bind data.

For end users, the eventual experience should stay simple:

1. Install an industry pack, such as a refinery basic pack.
2. The system automatically installs required component packs.
3. Type a prompt such as "generate a refinery".
4. The editor creates a semantic, editable 3D factory.

## 2. Recommended Workspace

During early development, keep component packs and industry packs in one workspace for easier iteration.

```text
factory-assets-workspace/
  packages/
    component-pack-sdk/
    industry-pack-sdk/

  component-packs/
    industrial-equipment-core/
      component-pack.json
      generators/
        tank.vertical/
        tower.distillation/
        vessel.horizontal/
        pump.centrifugal/
        pipe-rack.standard/
        platform-ladder/

  industry-packs/
    industry.refinery.basic/
      industry-pack.json
      profiles/
      layouts/
      connections/
      quality-rules/
      previews/

  tools/
    create-component-pack/
    create-generator/
    create-industry-pack/
    validate-component-pack/
    validate-industry-pack/
    build-pack/

  cloud/
    registry.json
    component-packs/
    industry-packs/
```

After the interfaces become stable, the assets can be split into separate repositories:

```text
pascalorg/editor
pascalorg/factory-component-packs
pascalorg/factory-industry-packs
```

## 3. Responsibilities

### Component Pack

A component pack answers:

> What equipment or reusable components can I generate?

Examples:

- `tank.vertical`
- `tower.distillation`
- `vessel.horizontal`
- `pump.centrifugal`
- `pipe-rack.standard`
- `platform.helical-ladder`

It owns:

- Generator manifests
- Parameter schemas
- Ports
- Editable semantic parts
- Data binding capabilities
- Semantic assembly output
- Preview scenes
- Generator tests

It does not own industry-specific factory layout.

### Industry Pack

An industry pack answers:

> What does this industry need, which generator should each device use, and how should the factory be laid out?

Example refinery bindings:

```text
refinery.crude_storage_tank -> industrial-equipment-core/tank.vertical
refinery.atmospheric_distillation_unit -> industrial-equipment-core/tower.distillation
refinery.vacuum_distillation_unit -> industrial-equipment-core/tower.distillation
refinery.product_pump -> industrial-equipment-core/pump.centrifugal
```

It owns:

- Industry profiles
- Generator references
- Default parameters
- Layouts
- Connections
- Quality rules
- Preview scenes

It should not duplicate complex geometry or generator logic.

### Editor

The editor will eventually own:

- Pack installation
- Dependency resolution
- Pack validation
- Generator execution
- Semantic assembly creation
- Inspector UI
- User-authored custom attachments
- Data binding and preview runtime

The scaffold project does not implement these editor features. It only produces the packages and metadata that the editor will consume later.

The editor should not accumulate hundreds of industry-specific generators in the main codebase.

## 4. Component Pack Format

### component-pack.json

```json
{
  "schemaVersion": "1.0",
  "id": "industrial-equipment-core",
  "name": "Industrial Equipment Core",
  "version": "0.1.0",
  "description": "Core reusable industrial equipment generators.",
  "publisher": "pascalorg",
  "generators": [
    {
      "id": "tank.vertical",
      "label": "Vertical Storage Tank",
      "entry": "generators/tank.vertical/generator.ts",
      "manifest": "generators/tank.vertical/generator.json"
    },
    {
      "id": "tower.distillation",
      "label": "Distillation Tower",
      "entry": "generators/tower.distillation/generator.ts",
      "manifest": "generators/tower.distillation/generator.json"
    }
  ]
}
```

### Generator Folder

```text
generators/
  tower.distillation/
    generator.json
    generator.ts
    preview.scene.json
    README.md
    tests/
      generator.test.ts
```

### generator.json

```json
{
  "schemaVersion": "1.0",
  "id": "tower.distillation",
  "label": "Distillation Tower",
  "family": "tower",
  "description": "Parametric refinery distillation tower generator.",
  "params": {
    "columnHeight": {
      "type": "number",
      "label": "Column Height",
      "default": 13.2,
      "min": 4,
      "max": 40,
      "unit": "m"
    },
    "columnRadius": {
      "type": "number",
      "label": "Column Radius",
      "default": 0.8,
      "min": 0.3,
      "max": 4,
      "unit": "m"
    },
    "platformCount": {
      "type": "number",
      "label": "Platform Count",
      "default": 4,
      "min": 0,
      "max": 12
    },
    "sideDrawCount": {
      "type": "number",
      "label": "Side Draw Count",
      "default": 4,
      "min": 0,
      "max": 12
    },
    "columnColor": {
      "type": "color",
      "label": "Column Color",
      "default": "#d1d5db"
    },
    "columnOpacity": {
      "type": "number",
      "label": "Column Opacity",
      "default": 1,
      "min": 0.18,
      "max": 1
    }
  },
  "ports": [
    {
      "id": "feed_inlet",
      "role": "process-inlet",
      "label": "Feed Inlet"
    },
    {
      "id": "overhead_product_outlet",
      "role": "process-outlet",
      "label": "Overhead Product Outlet"
    },
    {
      "id": "bottoms_outlet",
      "role": "process-outlet",
      "label": "Bottoms Outlet"
    }
  ],
  "editableParts": [
    "distillation_column_shell",
    "tray_band",
    "lower_service_platform",
    "middle_service_platform",
    "upper_service_platform",
    "top_service_platform",
    "external_spiral_ladder",
    "side_draw_nozzle"
  ],
  "dataBindings": [
    {
      "id": "temperature",
      "label": "Temperature",
      "type": "number",
      "effects": ["color", "label", "alarm"]
    },
    {
      "id": "pressure",
      "label": "Pressure",
      "type": "number",
      "effects": ["label", "alarm"]
    }
  ],
  "output": {
    "type": "semantic-assembly"
  }
}
```

### Generator TypeScript Interface

```ts
export interface ComponentGeneratorInput {
  id: string
  name?: string
  params: Record<string, unknown>
  placement?: {
    x?: number
    y?: number
    z?: number
    rotationY?: number
  }
}

export interface ComponentGeneratorOutput {
  assembly: {
    type: 'semantic-assembly'
    primarySemanticRole: string
    parts: SemanticPart[]
    ports: SemanticPort[]
    editableParts: string[]
    editableParams: EditableParam[]
    dataBindings?: DataBindingDefinition[]
  }
}

export interface SemanticPart {
  id: string
  kind: string
  semanticRole: string
  name?: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  params?: Record<string, unknown>
  material?: {
    color?: string
    opacity?: number
    metalness?: number
    roughness?: number
  }
}

export interface SemanticPort {
  id: string
  role: 'process-inlet' | 'process-outlet' | 'utility-inlet' | 'utility-outlet' | 'data'
  side?: 'left' | 'right' | 'front' | 'back' | 'top' | 'bottom'
  position?: [number, number, number]
  medium?: string
}
```

## 5. Industry Pack Format

### industry-pack.json

```json
{
  "schemaVersion": "1.0",
  "id": "industry.refinery.basic",
  "name": "Refinery Basic Pack",
  "version": "0.1.0",
  "industry": "refinery",
  "description": "Basic refinery generation pack.",
  "dependsOnComponentPacks": [
    {
      "id": "industrial-equipment-core",
      "version": "^0.1.0"
    }
  ],
  "profiles": ["profiles/generated.json"],
  "layouts": ["layouts/refinery-layout.json"],
  "connections": ["connections/generated.json"],
  "qualityRules": ["quality-rules/generated.json"],
  "previews": ["previews/refinery-basic.scene.json"]
}
```

### profiles/generated.json

```json
[
  {
    "id": "refinery.atmospheric_distillation_unit",
    "name": "Atmospheric Distillation Unit",
    "family": "distillation_column",
    "generatorRef": {
      "componentPack": "industrial-equipment-core",
      "generator": "tower.distillation"
    },
    "defaultDimensions": {
      "length": 10.5,
      "width": 6,
      "height": 13.5
    },
    "params": {
      "columnHeight": 13.2,
      "columnRadius": 0.78,
      "platformCount": 4,
      "sideDrawCount": 4,
      "columnColor": "#d1d5db"
    },
    "ports": {
      "feed": "feed_inlet",
      "overhead": "overhead_product_outlet",
      "bottoms": "bottoms_outlet"
    },
    "primarySemanticRole": "distillation_column_shell",
    "qualityRequiredRoles": [
      "distillation_column_shell",
      "external_spiral_ladder",
      "tray_band",
      "side_draw_nozzle"
    ]
  }
]
```

### layouts/refinery-layout.json

```json
{
  "schemaVersion": "1.0",
  "id": "refinery.basic.layout",
  "stations": [
    {
      "id": "crude_storage_tank",
      "profileId": "refinery.crude_storage_tank",
      "position": [-12, 0, 0],
      "rotationY": 0
    },
    {
      "id": "atmospheric_distillation_unit",
      "profileId": "refinery.atmospheric_distillation_unit",
      "position": [0, 0, 0],
      "rotationY": 0
    },
    {
      "id": "vacuum_distillation_unit",
      "profileId": "refinery.vacuum_distillation_unit",
      "position": [8, 0, 2],
      "rotationY": 0
    }
  ]
}
```

### connections/generated.json

```json
{
  "schemaVersion": "1.0",
  "connections": [
    {
      "from": {
        "stationId": "crude_storage_tank",
        "port": "outlet"
      },
      "to": {
        "stationId": "atmospheric_distillation_unit",
        "port": "feed"
      },
      "medium": "crude_oil"
    },
    {
      "from": {
        "stationId": "atmospheric_distillation_unit",
        "port": "bottoms"
      },
      "to": {
        "stationId": "vacuum_distillation_unit",
        "port": "feed"
      },
      "medium": "atmospheric_residue"
    }
  ]
}
```

## 6. Cloud Simulation

The local `cloud` folder should simulate the future remote asset marketplace.

```text
cloud/
  registry.json
  component-packs/
    industrial-equipment-core-0.1.0.zip
  industry-packs/
    industry.refinery.basic-0.1.0.zip
```

### registry.json

```json
{
  "componentPacks": [
    {
      "id": "industrial-equipment-core",
      "version": "0.1.0",
      "url": "component-packs/industrial-equipment-core-0.1.0.zip"
    }
  ],
  "industryPacks": [
    {
      "id": "industry.refinery.basic",
      "version": "0.1.0",
      "url": "industry-packs/industry.refinery.basic-0.1.0.zip",
      "dependsOnComponentPacks": [
        {
          "id": "industrial-equipment-core",
          "version": "^0.1.0"
        }
      ]
    }
  ]
}
```

## 7. Pack Install Contract

The scaffold project should only produce metadata that makes this future installation flow possible.

Future editor installation flow:

1. Read the industry pack manifest.
2. Check `dependsOnComponentPacks`.
3. If a dependency is missing, auto-install or prompt to install it.
4. Download or copy the component pack from cloud.
5. Validate the component pack manifest.
6. Download or copy the industry pack from cloud.
7. Validate that every `generatorRef` can be resolved.
8. Mark the industry pack as installed.

The scaffold project does not implement the editor installer UI. It only builds valid pack artifacts and registry metadata.

## 8. Generation Contract

Prompt:

```text
Generate a refinery.
```

Future editor generation flow:

```text
prompt
  -> industry intent: refinery
  -> installed industry pack: industry.refinery.basic
  -> load layout, profiles, connections
  -> for each station, resolve profile
  -> profile resolves generatorRef
  -> component generator creates semantic assembly
  -> editor creates canvas nodes
  -> editor creates connections and pipes
  -> result is applied to canvas
```

The scaffold project only ensures that profiles contain enough information for this flow:

- `generatorRef`
- default params
- default dimensions
- ports
- quality required roles

It does not implement prompt recognition, canvas patches, or editor rendering.

## 9. Future Inspector Contract

The Inspector should hide low-level implementation details from final users.

Recommended panels:

```text
Device
  Name
  Type
  Position
  Rotation
  Dimensions

Parameters
  Generated from generator.params
  Examples:
    Tank: height, diameter, liquid level, opacity
    Distillation tower: column height, radius, platform count, side draw count

Parts
  Generated from editableParts
  Supports color, opacity, visibility, and lock state

Data
  Data point binding
  Data-driven effects
  Examples: liquid level, color, alarm, pipe flow
```

Future editor rules:

- Generic properties only handle universal transform and visibility.
- Equipment-specific settings come from the generator manifest.
- Data binding is configured in design mode and visualized in preview mode.
- Avoid separate Process/Data/Equipment views unless they provide direct editing value.

This is not part of the scaffold implementation.

## 10. Future Custom Attachments

Users must be able to add geometry to a semantic assembly without breaking equipment identity.

Flow:

```text
select equipment
  -> add part
  -> choose primitive, model, or AI-generated geometry
  -> attach as custom semantic part
```

Metadata:

```json
{
  "semanticRole": "custom_attachment",
  "attachedToAssembly": "equipment_id",
  "userCreated": true,
  "editable": true
}
```

This avoids requiring users to explode an assembly and lose equipment metadata.

This is not part of the scaffold implementation.

## 11. Validation Rules

### Component Pack Validation

Required checks:

- `component-pack.json` is valid.
- Generator ids are unique.
- Every generator manifest exists.
- Parameter schemas are valid.
- Ports are valid.
- `editableParts` is defined.
- Generator output is `semantic-assembly`.
- Every generated part has a `semanticRole`.
- Preview scene can be generated.
- Generator tests pass.

### Industry Pack Validation

Required checks:

- `industry-pack.json` is valid.
- Required component packs exist.
- Every `generatorRef` resolves to an installed generator.
- Profile params match the generator schema.
- Profile port mapping is complete.
- Every layout station has a profile.
- Every connection references existing stations and ports.
- `qualityRequiredRoles` are generated by the referenced generator.
- Demo generation can be applied to the canvas.

## 12. Scaffold Commands

### Create Component Pack

```bash
create-component-pack industrial-equipment-core
```

Creates:

```text
component-packs/industrial-equipment-core/
  component-pack.json
  generators/
  tests/
```

### Create Generator

```bash
create-generator tower.distillation
```

Creates:

```text
generators/tower.distillation/
  generator.json
  generator.ts
  preview.scene.json
  tests/generator.test.ts
```

### Create Industry Pack

```bash
create-industry-pack industry.refinery.basic
```

Creates:

```text
industry-packs/industry.refinery.basic/
  industry-pack.json
  profiles/generated.json
  layouts/generated.json
  connections/generated.json
  quality-rules/generated.json
  previews/generated.scene.json
```

### Build Packs

```bash
build-component-pack industrial-equipment-core
build-industry-pack industry.refinery.basic
```

Outputs:

```text
cloud/component-packs/industrial-equipment-core-0.1.0.zip
cloud/industry-packs/industry.refinery.basic-0.1.0.zip
```

## 13. Scaffold Development Phases

### Phase 1: Pack Protocols

Deliver:

- Component pack manifest schema
- Generator manifest schema
- Industry pack manifest schema
- Profile `generatorRef` format

Validation:

- Schema unit tests
- Fixture manifests pass validation

### Phase 2: Component Pack Loader

Deliver:

- Load component packs from folder or zip in the scaffold workspace
- Register generator manifests
- Query installed generators

Core APIs:

```ts
getInstalledComponentPacks()
getGenerator(componentPackId, generatorId)
listGenerators()
validateComponentPack()
```

Validation:

- Load `industrial-equipment-core`
- Query `tower.distillation`
- Missing generator gives a clear error

### Phase 3: Industry Pack Loader

Deliver:

- Load industry packs from the scaffold workspace
- Validate component dependencies
- Parse profiles, layouts, and connections

Core APIs:

```ts
getInstalledIndustryPacks()
loadIndustryPack(id)
validateIndustryPack()
resolveProfileGenerator(profileId)
```

Validation:

- Installing refinery pack discovers `industrial-equipment-core`
- Profiles resolve to correct generators

### Phase 4: Generator Contract Validation

Deliver:

- Validate that an industry profile can resolve a component generator.
- Validate that profile params match the generator manifest schema.
- Validate that required roles and ports are declared.
- Optionally run a generator in Node/Bun to produce a semantic assembly JSON preview.

Validation:

- `refinery.atmospheric_distillation_unit` resolves `industrial-equipment-core/tower.distillation`
- `refinery.crude_storage_tank` resolves `industrial-equipment-core/tank.vertical`
- Profile params pass schema validation
- Preview JSON contains parts, ports, editable parts, and primary semantic role

### Phase 5: Scaffolds

Deliver:

- Component pack scaffold
- Generator scaffold
- Industry pack scaffold

Validation:

- Empty component pack validates
- Empty industry pack validates
- Example generator creates preview output

### Phase 6: Cloud Install Simulation

Deliver:

- Cloud registry
- Zip build output
- Local copy/unpack simulation
- Dependency metadata validation

Validation:

- Registry lists component and industry packs
- Industry pack references existing component pack artifacts
- Missing dependency fails validation with a clear message

### Phase 7: Refinery Pack Scaffold Pilot

Deliver:

- `industrial-equipment-core` component pack scaffold
- `industry.refinery.basic` industry pack scaffold
- First generator manifests:
  - `tank.vertical`
  - `tower.distillation`
  - `pump.centrifugal`
  - `pipe-rack.standard`
- First refinery profiles referencing those generators

Validation:

- Component pack validates
- Industry pack validates
- Refinery profiles resolve all generator refs
- Build outputs zip artifacts into `cloud`

### Phase 8: Handoff to Editor Integration

Deliver:

- A generated handoff report for the editor repo.
- Registry summary.
- Pack dependency graph.
- Generator capability summary.
- Known editor integration requirements.

Validation:

- Report identifies which editor APIs are needed.
- Report clearly separates scaffold-complete work from editor integration work.

## 14. Product Success Criteria

Final user experience:

1. Open the industry pack marketplace.
2. Install "Refinery Basic Pack".
3. Required component packs install automatically.
4. Type "generate a refinery".
5. Get a complete 3D refinery.
6. Select equipment and edit equipment parameters.
7. Add custom parts without losing equipment identity.
8. Bind real-time data.
9. Preview liquid level, colors, flow, and alarms.

Developer experience:

1. Create a component pack using scaffold.
2. Develop high-quality generators.
3. Create an industry pack using scaffold.
4. Reference existing generators.
5. Validate the pack.
6. Build and upload to cloud.
7. Users install on demand.

## 15. Recommended First Milestone

Start with one workspace and one refinery pilot.

First component pack:

```text
component-packs/industrial-equipment-core
```

First industry pack:

```text
industry-packs/industry.refinery.basic
```

First generators:

```text
tank.vertical
tower.distillation
pump.centrifugal
pipe-rack.standard
```

First validation target:

```text
Install refinery pack
  -> auto-install industrial equipment core
  -> generate refinery from one prompt
  -> apply to canvas
  -> edit tank and tower parameters
  -> preserve semantic assembly identity
```
