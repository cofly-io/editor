import type { GeneratedGeometryArtifact } from '../../../../packages/editor/src/lib/ai-generated-geometry-core'
import {
  executeGeometryToolCall,
  type GeometryToolExecutionResult,
} from '../../../../packages/editor/src/lib/ai-geometry-tool-executor'
import type { loadDeviceProfiles } from '../device-profiles'
import {
  extractFirstBalancedJsonObject,
  normalizeToolArgumentsSource,
} from './primitive-run-context'

export type ToolCall = {
  id: string
  function: { name: string; arguments: string }
}

export type ComposeTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

type PartBlueprintItem = {
  id: string
  kind: string
  semanticRole?: string
  count?: number
  alignAbove?: string
  alignBeside?: string
  side?: 'left' | 'right' | 'front' | 'back'
  centeredOn?: string
  connectTo?: string
  connectPoint?: string
  around?: string
  aroundCount?: number
  array?: { count: number; axis: 'x' | 'y' | 'z'; spacing: number }
  warningStripes?: boolean
  stripeCount?: number
  dimensions?: Record<string, unknown>
}

export type PartBlueprint = {
  route:
    | 'compose_parts'
    | 'compose_assembly'
    | 'compose_recipe'
    | 'compose_primitive'
    | 'revise_geometry'
  category?: string
  constraints?: Record<string, unknown>
  parts?: PartBlueprintItem[]
  requiredRoles?: string[]
  deviceProfileDraft?: Record<string, unknown>
}

export const GEOMETRY_TOOL_NAMES = new Set([
  'compose_recipe',
  'compose_assembly',
  'compose_parts',
  'compose_robot_arm',
  'compose_primitive',
  'revise_geometry',
])

export const PRIMITIVE_TOOLS: ComposeTool[] = [
  tool(
    'compose_recipe',
    'Create one editable object from a deterministic instruction sheet. Recipes stay small and reference generic parts with semantic roles; use only for closed-form professional standard parts such as gear.spur, sprocket.chain, pipe.flange, pipe.elbow90, fastener.hexBolt, bearing.pillowBlock, coupling.flexible, plate.perforated, valve.gate/ball, robotArm.threeAxis, mixer.impeller, motor.servo, process.vesselShell, structure.platformLadder, and enclosure.roundedBox. Do not use this for open-ended complete equipment such as vehicles, outdoor AC units, machine tools, industrial robot arms, pumps, conveyors, fans, tanks, towers, reactors, compressors, grate coolers, aircraft, or broad industrial archetypes.',
  ),
  tool(
    'compose_assembly',
    'Create one editable object through the constraint-first automatic instruction-sheet generator. Prefer this only for supported open-ended families: vehicles, outdoor AC units, machine tools (lathe/milling/grinder/planer/drill/CNC), industrial robot arms, pumps, belt conveyors, fans, tanks, distillation/chemical towers or columns, reactors, compressors, grate coolers, electrical cabinets, and factory equipment. Plain chimneys/smokestacks are not assembly towers; use compose_parts with chimney_stack. If the requested family is unsupported, do not retry assembly; switch to compose_parts and choose generic building blocks. Pass family/object/style plus hard constraints such as length, width/diameter, height, primaryColor.',
  ),
  tool(
    'compose_parts',
    'Create one editable object from the reusable building-block library. Prefer this when explicitly selecting parts or when compose_assembly does not support the requested family. Use generic kernels such as chimney_stack, aircraft_fuselage, wheel/wheel_set, window_panel/window_strip, body_shell, tube_frame, fork, light_pair, bar_pair, streamlined_body, lofted_panel, airfoil_blade, pyramid, pipe/flange/bolt parts, and assign semanticRole for context-specific meaning. generic_body is a rectangular box/enclosure, not an arbitrary round body; for bottles, flasks, thermoses, cups, cans, jars, tubes, handles, or any cylindrical/oval main body, use compose_primitive with cylinder, hollow-cylinder, capsule, torus, sphere/ellipsoid, lathe, or sweep shapes instead. For complete fans, prefer fan_blade with count:3-6 so each blade is independently editable; radial_blades is kept only as a compatibility composite. For a complete bicycle, use exactly wheel_set semanticRole:"bicycle_tire" count:2 + tube_frame semanticRole:"bicycle_frame" + fork semanticRole:"bicycle_fork" + handlebar + saddle + chain_loop; do not invent bicycle_crank/chainring/pedals part kinds. For complete aircraft/airplanes/airliners, use parts:[{kind:"aircraft_fuselage", id:"aircraft_fuselage"}] with top-level length/primaryColor and let defaults add wings, engines, T-tail, windows, and landing gear; do not hand-place generic airfoil_blade/streamlined_body/wheel_set parts for complete aircraft. For industrial chimneys/smokestacks, use parts:[{kind:"chimney_stack", semanticRole:"chimney_body", height, radius, warningStripes:true}] and do not use vertical_pole/circular_base/cylinder. Use pyramid for square/rectangular pyramids, Egyptian-style pyramids, pointed rooftops, and cone-like shapes with a square base; set truncated:true or topScale to make a flat-top truncated pyramid. Prefer relationship fields over raw coordinates: alignAbove, alignBeside with side, centeredOn, connectTo with connectPoint/childPoint, around with aroundCount/aroundRadius, and array:{count,axis,spacing} for repeated linear parts.',
  ),
  tool(
    'compose_robot_arm',
    'Create an editable industrial robot arm draft for robot arm requests not covered by robotArm.threeAxis.',
  ),
  tool(
    'compose_primitive',
    'Create one editable primitive object from custom primitive shapes. Use only when templates, recipes, and reusable parts do not cover the requested structure. Pass shapes:[{kind:"torus"|"cylinder"|"box"|"capsule"|...}] and semanticRole on critical shapes; do not use primitives:[...] or kind:"primitive". For car steering wheel / 姹借溅鏂瑰悜鐩?use torus wheel_rim, cylinder center_hub, and 3 spoke shapes.',
  ),
  tool(
    'revise_geometry',
    'Patch the previous generated geometry artifact for follow-up user feedback. For color edits, use operations:[{op:"setMaterial", selector:{semanticRole:"belt_surface"}, color:"#f5c842"}]. For semantic size edits, use operations:[{op:"scaleSemantic", selector:{semanticRole:"fan_blade"}, dimension:"primary", factor:1.25}] or select a semanticGroup/sourcePartKind. It preserves existing shapes unless operations remove/replace them; do not use replace for recoloring.',
    {
      type: 'object',
      additionalProperties: true,
      properties: {
        targetArtifactId: { type: 'string' },
        feedback: { type: 'string' },
        intent: { type: 'string' },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              op: {
                type: 'string',
                enum: [
                  'add',
                  'remove',
                  'replace',
                  'transform',
                  'resize',
                  'scaleSemantic',
                  'materialFrom',
                  'setMaterial',
                  'align',
                ],
              },
              selector: {
                type: 'object',
                properties: {
                  index: { type: 'number' },
                  semanticRole: { type: 'string' },
                  semanticGroup: { type: 'string' },
                  sourcePartKind: { type: 'string' },
                  sourcePartId: { type: 'string' },
                  kind: { type: 'string' },
                  nameIncludes: { type: 'string' },
                },
              },
              dimension: {
                type: 'string',
                enum: [
                  'primary',
                  'uniform',
                  'length',
                  'width',
                  'height',
                  'depth',
                  'thickness',
                  'radius',
                  'diameter',
                  'majorRadius',
                  'tubeRadius',
                  'axisLength',
                  'profileX',
                  'profileY',
                ],
              },
              factor: { type: 'number' },
              color: { type: 'string' },
              materialPreset: { type: 'string' },
              material: { type: 'object' },
            },
            required: ['op'],
          },
        },
      },
      required: ['feedback', 'intent', 'operations'],
    },
  ),
]

function tool(
  name: string,
  description: string,
  parameters?: Record<string, unknown>,
): ComposeTool {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: parameters ?? {
        type: 'object',
        additionalProperties: true,
        properties: {},
      },
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  const source = normalizeToolArgumentsSource(raw || '{}') || '{}'
  try {
    const parsed = JSON.parse(source)
    if (isRecord(parsed)) return parsed
    throw new Error('Tool arguments must be a JSON object.')
  } catch (strictError) {
    const firstObject = extractFirstBalancedJsonObject(source)
    if (!firstObject || firstObject === source) throw strictError
    const parsed = JSON.parse(firstObject)
    if (isRecord(parsed)) return parsed
    throw strictError
  }
}

export function executePrimitiveGeometryTool(
  name: string,
  args: Record<string, unknown>,
  prompt: string,
  revisionTarget: GeneratedGeometryArtifact | null,
  blueprint: PartBlueprint | null,
  deviceProfiles?: Awaited<ReturnType<typeof loadDeviceProfiles>>,
): GeometryToolExecutionResult {
  const isRevisionTool = name === 'revise_geometry'
  if (blueprint?.deviceProfileDraft && args.deviceProfileDraft == null) {
    args.deviceProfileDraft = blueprint.deviceProfileDraft
  }
  return executeGeometryToolCall(
    name,
    args,
    {
      prompt,
      revisionOf: isRevisionTool ? revisionTarget?.id : undefined,
      revisionVersion: isRevisionTool ? revisionTarget?.version : undefined,
      replaceNodeIds: isRevisionTool ? revisionTarget?.placedNodeIds : undefined,
      revisionTarget,
      blueprintRequiredRoles: blueprint?.requiredRoles,
      blueprintCategory: blueprint?.category,
      deviceProfiles: deviceProfiles?.profiles,
    },
    {
      messages: {
        unknownTool: (toolName) => `Unknown tool: ${toolName}`,
        noShapes: 'No geometry could be created.',
      },
    },
  )
}

export function chooseGeometryToolCall(toolCalls: ToolCall[]) {
  return toolCalls.find((call) => GEOMETRY_TOOL_NAMES.has(call.function.name))
}

export function summarizeToolCalls(toolCalls: ToolCall[]) {
  return toolCalls
    .map((call) =>
      [
        `tool=${call.function.name}`,
        `args=${call.function.arguments.replace(/\s+/g, ' ').trim().slice(0, 1200)}`,
      ].join('\n'),
    )
    .join('\n\n')
}
