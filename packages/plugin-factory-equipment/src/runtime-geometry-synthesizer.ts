/**
 * Runtime Geometry Synthesizer
 *
 * Bridges the gap between metadata-only profile recipes and real geometry.
 * Given a profile's family + qualityRequiredRoles + params + envelope, it
 * synthesizes geometry-ready parts whose `kind` matches core's PartComposeKind
 * / part-registry definitions (cylindrical_tank, chimney_stack, heat_exchanger,
 * pipe_run, generic_body, service_platform, ...) so the editor's part composer
 * can turn them into primitives (and ultimately three.js meshes) without any
 * handwritten per-equipment recipe.
 *
 * Strategy:
 *  - A role→archetype table maps common semantic roles to a primitive archetype
 *    (vertical-cylinder, horizontal-cylinder, box, frustum, pipe, platform, port).
 *  - A family fallback picks a sensible archetype for the primary shell when
 *    the role itself is not in the table.
 *  - Dimensions are derived from the envelope and the profile's numeric params
 *    (radius, height, drumRadius, baseRadius, ...), with proportional fallbacks.
 */

import type { EquipmentParamValue, SemanticRecipePart } from '@pascal-app/core'
import type { Profile } from './profile-types'

type Vec3 = [number, number, number]

export type GeometryEnvelope = {
  length: number
  width: number
  height: number
}

type Archetype =
  | 'vertical-cylinder'
  | 'horizontal-cylinder'
  | 'box'
  | 'frustum'
  | 'sphere'
  | 'pipe'
  | 'platform'
  | 'port-inlet'
  | 'port-outlet'

type RoleSpec = {
  archetype: Archetype
  /** part-registry / PartComposeKind kind */
  kind: string
  /** fraction of envelope used when no explicit param dimension exists */
  sizeHint?: { length?: number; width?: number; height?: number; radius?: number }
  /** default metalness/roughness */
  material?: { roughness?: number; metalness?: number }
}

// ─── Role → Archetype table ──────────────────────────────────────────────────
// Keys are matched against the semantic role (lowercased). First match wins.

const ROLE_RULES: Array<{ pattern: RegExp; spec: RoleSpec }> = [
  // Cylindrical shells / vessels / columns
  { pattern: /column_shell|distillation_column_shell|vacuum_column_shell/, spec: { archetype: 'vertical-cylinder', kind: 'cylindrical_tank' } },
  { pattern: /tank_shell|storage_tank_shell/, spec: { archetype: 'vertical-cylinder', kind: 'storage_tank_shell' } },
  { pattern: /vessel_shell|exchanger_shell|heat_exchanger_shell/, spec: { archetype: 'horizontal-cylinder', kind: 'heat_exchanger' } },
  { pattern: /knockout_drum|steam_drum|mud_drum|separator|satellite_column/, spec: { archetype: 'horizontal-cylinder', kind: 'cylindrical_tank' } },
  { pattern: /side_stripper_column|stripper_column/, spec: { archetype: 'vertical-cylinder', kind: 'cylindrical_tank', sizeHint: { radius: 0.45 } } },
  { pattern: /vessel_head|dished_head|ellipsoidal_head/, spec: { archetype: 'sphere', kind: 'hemisphere', sizeHint: { radius: 1.0, height: 0.25 }, material: { roughness: 0.42, metalness: 0.5 } } },
  { pattern: /reactor(_shell)?|catalyst_regenerator|hydrotreater/, spec: { archetype: 'vertical-cylinder', kind: 'cylindrical_tank' } },
  { pattern: /filter_vessel|clarifier/, spec: { archetype: 'vertical-cylinder', kind: 'filter_vessel' } },
  // Column internals (highly repeated → prime instancing candidates)
  { pattern: /tray_band|packing_band/, spec: { archetype: 'vertical-cylinder', kind: 'cylindrical_tank', sizeHint: { radius: 0.92, height: 0.04 }, material: { roughness: 0.4, metalness: 0.5 } } },
  { pattern: /side_draw_nozzle/, spec: { archetype: 'pipe', kind: 'flanged_nozzle', sizeHint: { radius: 0.08, height: 0.3 }, material: { roughness: 0.4, metalness: 0.55 } } },
  // Fired equipment (box bodies)
  { pattern: /heater_radiant_box|fired_heater|boiler_body|convection_bank/, spec: { archetype: 'box', kind: 'generic_body', material: { roughness: 0.6, metalness: 0.26 } } },
  { pattern: /vacuum_heater/, spec: { archetype: 'box', kind: 'generic_body', sizeHint: { height: 0.8 }, material: { roughness: 0.6, metalness: 0.26 } } },
  // Heat exchanger variants (named roles that must not fall to generic)
  { pattern: /preheat_exchanger|condenser_exchanger/, spec: { archetype: 'horizontal-cylinder', kind: 'heat_exchanger' } },
  { pattern: /burner/, spec: { archetype: 'pipe', kind: 'flanged_nozzle', sizeHint: { radius: 0.05, height: 0.06 }, material: { roughness: 0.44, metalness: 0.6 } } },
  // Stacks / chimneys / flares (tapered)
  { pattern: /flare_stack|boiler_stack|flue_gas_stack|tail_gas_stack|heater_stack_stub|chimney/, spec: { archetype: 'frustum', kind: 'chimney_stack', material: { roughness: 0.52, metalness: 0.22 } } },
  { pattern: /warning_red_band|stripe/, spec: { archetype: 'frustum', kind: 'chimney_stack', sizeHint: { radius: 0.5, height: 0.5 }, material: { roughness: 0.48, metalness: 0.2 } } },
  { pattern: /flare_flame|flare_glow/, spec: { archetype: 'sphere', kind: 'sphere', sizeHint: { radius: 0.24, height: 0.08 }, material: { roughness: 0.16, metalness: 0 } } },
  { pattern: /flare_smoke_plume/, spec: { archetype: 'sphere', kind: 'sphere', sizeHint: { radius: 0.36, height: 0.12 }, material: { roughness: 0.9, metalness: 0 } } },
  { pattern: /street_light|warning_beacon/, spec: { archetype: 'sphere', kind: 'sphere', sizeHint: { radius: 0.06, height: 0.04 }, material: { roughness: 0.12, metalness: 0 } } },
  // Pipes / headers / manifolds
  { pattern: /pipe|header|manifold|riser|nozzle/, spec: { archetype: 'pipe', kind: 'pipe_run', sizeHint: { radius: 0.06 }, material: { roughness: 0.36, metalness: 0.5 } } },
  // Tube bundle
  { pattern: /tube_bundle|channel_head/, spec: { archetype: 'horizontal-cylinder', kind: 'heat_exchanger', sizeHint: { radius: 0.8, length: 0.9 } } },
  // Platforms / ladders / frames
  { pattern: /platform/, spec: { archetype: 'platform', kind: 'service_platform' } },
  { pattern: /ladder|stair/, spec: { archetype: 'platform', kind: 'platform_ladder', sizeHint: { width: 0.2 } } },
  { pattern: /support_frame|pipe_rack|saddle_support|support_base|skid_base/, spec: { archetype: 'box', kind: 'generic_body', sizeHint: { height: 0.12 }, material: { roughness: 0.6, metalness: 0.3 } } },
  // Pumps / motors
  { pattern: /volute_casing/, spec: { archetype: 'box', kind: 'volute_casing' } },
  { pattern: /pump_casing/, spec: { archetype: 'box', kind: 'volute_casing', sizeHint: { height: 0.5 }, material: { roughness: 0.5, metalness: 0.5 } } },
  { pattern: /drive_motor|motor/, spec: { archetype: 'horizontal-cylinder', kind: 'ribbed_motor_body', sizeHint: { radius: 0.5, length: 0.6 }, material: { roughness: 0.44, metalness: 0.5 } } },
  // Cyclone
  { pattern: /cyclone/, spec: { archetype: 'frustum', kind: 'cylindrical_tank', sizeHint: { radius: 0.4, height: 0.18 } } },
  // Liquid / solid / gas volumes
  { pattern: /liquid_surface|liquid_volume|liquid_pool/, spec: { archetype: 'vertical-cylinder', kind: 'liquid_volume', sizeHint: { radius: 0.94, height: 0.5 }, material: { roughness: 0.05, metalness: 0.68 } } },
  { pattern: /solid_volume|reactor_bed|catalyst_bed/, spec: { archetype: 'vertical-cylinder', kind: 'cylindrical_tank', sizeHint: { radius: 0.9, height: 0.4 }, material: { roughness: 0.8, metalness: 0.05 } } },
  // Control room / building parts
  { pattern: /control_room_shell|building|enclosure/, spec: { archetype: 'box', kind: 'generic_body', material: { roughness: 0.72, metalness: 0.06 } } },
  { pattern: /window/, spec: { archetype: 'box', kind: 'generic_body', sizeHint: { height: 0.28, width: 0.05 }, material: { roughness: 0.2, metalness: 0.4 } } },
  { pattern: /door/, spec: { archetype: 'box', kind: 'generic_body', sizeHint: { height: 0.72, length: 0.14, width: 0.06 }, material: { roughness: 0.5, metalness: 0.3 } } },
  { pattern: /console/, spec: { archetype: 'box', kind: 'generic_body', sizeHint: { height: 0.12, length: 0.5, width: 0.2 }, material: { roughness: 0.44, metalness: 0.4 } } },
  // Flanges / ports
  { pattern: /inlet|feed_in|feedwater/, spec: { archetype: 'port-inlet', kind: 'inlet_port', sizeHint: { radius: 0.06 } } },
  { pattern: /outlet|product_out|steam_out|exhaust/, spec: { archetype: 'port-outlet', kind: 'outlet_port', sizeHint: { radius: 0.06 } } },
  { pattern: /flange/, spec: { archetype: 'pipe', kind: 'flange_ring', sizeHint: { radius: 0.08, height: 0.04 }, material: { roughness: 0.4, metalness: 0.55 } } },
]

// Family fallback for the primary shell when its role is not in the table.
const FAMILY_SHELL: Record<string, RoleSpec> = {
  storage_tank: { archetype: 'vertical-cylinder', kind: 'storage_tank_shell' },
  tank: { archetype: 'vertical-cylinder', kind: 'storage_tank_shell' },
  horizontal_vessel: { archetype: 'horizontal-cylinder', kind: 'cylindrical_tank' },
  distillation: { archetype: 'vertical-cylinder', kind: 'cylindrical_tank' },
  reactor: { archetype: 'vertical-cylinder', kind: 'cylindrical_tank' },
  heat_exchanger: { archetype: 'horizontal-cylinder', kind: 'heat_exchanger' },
  fired_heater: { archetype: 'box', kind: 'generic_body' },
  utility_boiler: { archetype: 'box', kind: 'generic_body' },
  coking_unit: { archetype: 'box', kind: 'generic_body' },
  sulfur_recovery: { archetype: 'horizontal-cylinder', kind: 'cylindrical_tank' },
  flare: { archetype: 'frustum', kind: 'chimney_stack' },
  pump: { archetype: 'box', kind: 'volute_casing' },
  pipe_rack: { archetype: 'box', kind: 'pipe_rack' },
  control_room: { archetype: 'box', kind: 'generic_body' },
}

// ─── Param helpers ───────────────────────────────────────────────────────────

function num(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function str(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

const COLOR_KEYS = ['shellColor', 'columnColor', 'chamberColor', 'bodyColor', 'wallColor', 'stackColor', 'color']

function pickColor(params: Record<string, unknown>, fallback: string): string {
  for (const key of COLOR_KEYS) {
    const value = str(params, key)
    if (value && /^#[0-9a-f]{6}$/i.test(value)) return value
  }
  return fallback
}

// ─── Dimension derivation ────────────────────────────────────────────────────

function deriveDimensions(
  spec: RoleSpec,
  role: string,
  profile: Profile,
  params: Record<string, unknown>,
  envelope: GeometryEnvelope,
  isPrimary: boolean,
): { length: number; width: number; height: number; radius: number; axis: 'x' | 'y' | 'z' } {
  const hint = spec.sizeHint ?? {}
  const roleLower = role.toLowerCase()

  // Radius: prefer explicit params (radius / shellRadius / drumRadius / baseRadius ...)
  const explicitRadius =
    num(params, 'radius') ??
    num(params, 'shellRadius') ??
    (roleLower.includes('drum') ? num(params, 'drumRadius') : undefined) ??
    (spec.archetype === 'frustum' ? num(params, 'baseRadius') : undefined)
  const radius =
    explicitRadius ??
    (hint.radius !== undefined
      ? Math.min(envelope.length, envelope.width) * hint.radius * (isPrimary ? 1 : 0.5)
      : Math.min(envelope.length, envelope.width) * (isPrimary ? 0.42 : 0.2))

  // Height: explicit params first (height / stackHeight ...)
  const explicitHeight =
    (spec.archetype === 'frustum' ? num(params, 'stackHeight') ?? num(params, 'height') : undefined) ??
    (isPrimary ? num(params, 'height') : undefined)
  const height =
    explicitHeight ??
    (hint.height !== undefined ? envelope.height * hint.height : envelope.height * (isPrimary ? 0.92 : 0.3))

  // Length: explicit params (length / drumLength ...)
  const explicitLength =
    num(params, 'length') ??
    (roleLower.includes('drum') ? num(params, 'drumLength') : undefined)
  const length =
    explicitLength ??
    (hint.length !== undefined ? envelope.length * hint.length : envelope.length * (isPrimary ? 0.88 : 0.4))

  const width = hint.width !== undefined ? envelope.width * hint.width : envelope.width * (isPrimary ? 0.9 : 0.5)

  const axis: 'x' | 'y' | 'z' =
    spec.archetype === 'horizontal-cylinder' ? 'x' : spec.archetype === 'pipe' ? 'y' : 'y'

  return { length, width, height, radius, axis }
}

function derivePosition(
  spec: RoleSpec,
  dims: { length: number; width: number; height: number; radius: number },
  envelope: GeometryEnvelope,
  isPrimary: boolean,
  index: number,
  total: number,
): Vec3 {
  if (isPrimary) {
    if (spec.archetype === 'vertical-cylinder' || spec.archetype === 'frustum') {
      return [0, dims.height / 2, 0]
    }
    if (spec.archetype === 'horizontal-cylinder') {
      return [0, dims.radius * 1.5, 0]
    }
    return [0, dims.height / 2, 0]
  }
  // Secondary parts: fan out around the shell along X
  const span = envelope.length * 0.6
  const fraction = total <= 1 ? 0 : index / (total - 1) - 0.5
  const x = fraction * span
  if (spec.archetype === 'frustum') return [x, envelope.height * 0.7 + dims.height / 2, envelope.width * 0.2]
  if (spec.archetype === 'platform') return [x, envelope.height * 0.5, envelope.width * 0.3]
  if (spec.archetype === 'horizontal-cylinder') return [x, dims.radius * 1.5, envelope.width * 0.2]
  if (spec.archetype === 'pipe') return [x, envelope.height * 0.5, envelope.width * 0.32]
  return [x, dims.height / 2, envelope.width * 0.2]
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type SynthesizedPart = SemanticRecipePart & {
  length?: number
  width?: number
  height?: number
  radius?: number
  radiusTop?: number
  radiusBottom?: number
  axis?: 'x' | 'y' | 'z'
  position: Vec3
  primaryColor: string
}

/**
 * Synthesize geometry-ready parts for a profile. The primary role becomes the
 * envelope-filling shell; every other qualityRequiredRole becomes a real
 * primitive part positioned relative to it.
 */
export function synthesizeGeometryParts(
  profile: Profile,
  params: Record<string, unknown>,
  envelope: GeometryEnvelope,
): SynthesizedPart[] {
  if (isSiteVisualContextProfile(profile)) {
    return buildSiteVisualContextParts(profile, params, envelope)
  }

  const roles = profile.qualityRequiredRoles ?? []
  const primaryRole = profile.primarySemanticRole
  const parts: SynthesizedPart[] = []

  const orderedRoles = [primaryRole, ...roles.filter((r) => r !== primaryRole)]
  const secondary = orderedRoles.slice(1)

  orderedRoles.forEach((role, roleIndex) => {
    const isPrimary = role === primaryRole
    const roleLower = role.toLowerCase()
    const rule = ROLE_RULES.find((candidate) => candidate.pattern.test(roleLower))
    const spec: RoleSpec =
      rule?.spec ??
      (isPrimary ? FAMILY_SHELL[profile.family] : undefined) ?? {
        archetype: 'box',
        kind: 'generic_body',
      }

    const dims = deriveDimensions(spec, role, profile, params, envelope, isPrimary)
    let position = derivePosition(spec, dims, envelope, isPrimary, roleIndex - 1, secondary.length)
    if (roleLower === 'flare_flame') position = [0, envelope.height + 0.75, 0]
    else if (roleLower === 'flare_glow') position = [0, envelope.height + 0.55, 0]
    else if (roleLower === 'flare_smoke_plume') position = [0.18, envelope.height + 1.8, -0.12]
    else if (roleLower === 'warning_beacon') position = [0, envelope.height + 0.22, 0]
    else if (roleLower === 'street_light') position = [0, envelope.height * 0.7, 0]
    const color = isPrimary
      ? pickColor(params, '#d1d5db')
      : pickColor(params, spec.material?.metalness && spec.material.metalness > 0.4 ? '#94a3b8' : '#cbd5e1')

    if (roleLower === 'street_light') {
      const count = Math.max(2, Math.min(48, Math.round(num(params, 'streetLightCount') ?? 10)))
      for (let lightIndex = 0; lightIndex < count; lightIndex += 1) {
        const x = -envelope.length / 2 + 8 + lightIndex * Math.max(4, (envelope.length - 16) / Math.max(1, count - 1))
        const z = lightIndex % 2 === 0 ? -envelope.width * 0.12 : envelope.width * 0.38
        parts.push({
          id: `street_light_${lightIndex + 1}`,
          kind: spec.kind,
          semanticRole: role,
          sourcePartKind: role,
          position: [x, envelope.height * 0.7, z],
          length: dims.length,
          width: dims.width,
          height: dims.height,
          radius: dims.radius,
          axis: dims.axis,
          primaryColor: '#fff7cc',
          material: {
            properties: {
              color: '#fff7cc',
              roughness: spec.material?.roughness ?? 0.12,
              metalness: spec.material?.metalness ?? 0,
            },
          },
          params: {
            role,
            profileId: profile.id,
            synthesized: true,
          },
        })
      }
      return
    }

    const part: SynthesizedPart = {
      id: isPrimary ? 'shell' : `part_${roleIndex - 1}`,
      kind: spec.kind,
      semanticRole: role,
      sourcePartKind: isPrimary ? profile.family : role,
      position,
      length: dims.length,
      width: dims.width,
      height: dims.height,
      radius: dims.radius,
      axis: dims.axis,
      primaryColor: color,
      material: {
        properties: {
          color,
          roughness: spec.material?.roughness ?? 0.48,
          metalness: spec.material?.metalness ?? 0.35,
        },
      },
      params: {
        role,
        profileId: profile.id,
        synthesized: true,
      },
    }

    // Tapered shapes (flare / chimney) get distinct top/bottom radii
    if (spec.archetype === 'frustum') {
      const topRadius =
        num(params, 'topRadius') ?? dims.radius * (num(params, 'baseRadius') ? 0.5 : 0.6)
      part.radiusBottom = dims.radius
      part.radiusTop = topRadius
    }

    parts.push(part)
  })

  return parts
}

function isSiteVisualContextProfile(profile: Profile) {
  return (
    profile.id.endsWith('.site_visual_layout') ||
    profile.family === 'site_visual_context' ||
    profile.generatorRef?.generator === 'refinery.visual-layout'
  )
}

function bool(params: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = params[key]
  return typeof value === 'boolean' ? value : fallback
}

function sitePart(input: {
  id: string
  kind?: string
  semanticRole: string
  position: Vec3
  length: number
  width: number
  height: number
  color: string
  roughness?: number
  metalness?: number
  params?: Record<string, unknown>
}): SynthesizedPart {
  return {
    id: input.id,
    kind: input.kind ?? 'generic_body',
    semanticRole: input.semanticRole,
    sourcePartKind: input.semanticRole,
    position: input.position,
    length: input.length,
    width: input.width,
    height: input.height,
    radius: Math.min(input.length, input.width) / 2,
    axis: 'y',
    primaryColor: input.color,
    material: {
      properties: {
        color: input.color,
        roughness: input.roughness ?? 0.82,
        metalness: input.metalness ?? 0.04,
      },
    },
    params: {
      role: input.semanticRole,
      synthesized: true,
      ...(input.params ?? {}),
    },
  }
}

function buildSiteVisualContextParts(
  profile: Profile,
  params: Record<string, unknown>,
  envelope: GeometryEnvelope,
): SynthesizedPart[] {
  const length = Math.max(40, num(params, 'length') ?? envelope.length)
  const width = Math.max(30, num(params, 'width') ?? envelope.width)
  const parts: SynthesizedPart[] = []

  parts.push(
    sitePart({
      id: 'site_ground',
      semanticRole: 'site_ground',
      position: [0, -0.03, 0],
      length: length + 30,
      width: width + 24,
      height: 0.06,
      color: '#a9a49a',
      roughness: 0.94,
      params: { profileId: profile.id },
    }),
  )

  const pads: Array<[string, number, number, number, number, string]> = [
    ['crude_tank_farm_pad', -72, 36, 36, 32, '#a89f8d'],
    ['primary_process_pad', -24, 18, 52, 42, '#b8bcc4'],
    ['secondary_process_pad', 58, 16, 52, 48, '#b4b8c0'],
    ['utility_control_pad', -68, -54, 36, 24, '#c7c7cf'],
    ['product_tank_pad', -8, -52, 36, 24, '#aba191'],
    ['flare_pad', 88, -48, 18, 18, '#9a938a'],
    ['wastewater_pad', 88, -68, 18, 12, '#91a2ad'],
  ]
  for (const [id, x, z, padLength, padWidth, color] of pads) {
    parts.push(
      sitePart({
        id,
        semanticRole: 'process_area_pad',
        position: [x, 0.02, z],
        length: padLength,
        width: padWidth,
        height: 0.08,
        color,
        roughness: 0.9,
      }),
    )
  }

  if (bool(params, 'includeRoads', true)) {
    const roads: Array<[string, number, number, number, number]> = [
      ['main_east_west_road', 0, -4, length * 0.94, 4.4],
      ['north_service_road', 0, 56, length * 0.88, 3.4],
      ['south_service_road', 0, -64, length * 0.88, 3.4],
      ['west_cross_road', -58, 0, 3.4, width * 0.92],
      ['center_cross_road', 0, 0, 3.2, width * 0.82],
      ['east_cross_road', 58, 0, 3.4, width * 0.92],
      ['front_gate_drive', 34, -76, 5.2, 24],
    ]
    for (const [id, x, z, roadLength, roadWidth] of roads) {
      parts.push(
        sitePart({
          id,
          semanticRole: 'road_network',
          position: [x, 0.08, z],
          length: roadLength,
          width: roadWidth,
          height: 0.1,
          color: '#3f3f46',
          roughness: 0.88,
        }),
      )
    }
  }

  if (bool(params, 'includeGrass', true)) {
    const lawns: Array<[string, number, number, number, number]> = [
      ['northwest_green_buffer', -28, 58, 42, 11],
      ['northeast_green_buffer', 76, 56, 34, 12],
      ['southwest_green_buffer', -48, -70, 38, 10],
      ['central_green_strip', 24, 6, 24, 8],
      ['east_gate_lawn', 76, -70, 34, 10],
      ['control_room_lawn', -84, -36, 18, 18],
    ]
    for (const [id, x, z, lawnLength, lawnWidth] of lawns) {
      parts.push(
        sitePart({
          id,
          semanticRole: 'green_buffer_lawn',
          position: [x, 0.04, z],
          length: lawnLength,
          width: lawnWidth,
          height: 0.08,
          color: '#4f8f46',
          roughness: 0.96,
        }),
      )
    }
  }

  for (const [prefix, cx, cz, dikeLength, dikeWidth] of [
    ['crude', -72, 36, 42, 36],
    ['product', -8, -52, 42, 28],
  ] as Array<[string, number, number, number, number]>) {
    const walls: Array<[string, number, number, number, number]> = [
      [`${prefix}_tank_dike_north`, cx, cz + dikeWidth / 2, dikeLength, 0.36],
      [`${prefix}_tank_dike_south`, cx, cz - dikeWidth / 2, dikeLength, 0.36],
      [`${prefix}_tank_dike_west`, cx - dikeLength / 2, cz, 0.36, dikeWidth],
      [`${prefix}_tank_dike_east`, cx + dikeLength / 2, cz, 0.36, dikeWidth],
    ]
    for (const [id, x, z, wallLength, wallWidth] of walls) {
      parts.push(
        sitePart({
          id,
          semanticRole: 'tank_farm_containment',
          position: [x, 0.45, z],
          length: wallLength,
          width: wallWidth,
          height: 0.9,
          color: '#8f928c',
          roughness: 0.86,
        }),
      )
    }
  }

  parts.push(
    sitePart({
      id: 'main_pipe_rack_spine',
      semanticRole: 'main_pipe_rack_spine',
      position: [0, 4.2, -8],
      length: length * 0.78,
      width: 4.8,
      height: 8.4,
      color: '#475569',
      roughness: 0.55,
      metalness: 0.28,
    }),
  )

  if (bool(params, 'includeFence', true)) {
    const fences: Array<[string, number, number, number, number]> = [
      ['perimeter_fence_north', 0, width / 2 + 5, length + 10, 0.22],
      ['perimeter_fence_south', 0, -width / 2 - 5, length + 10, 0.22],
      ['perimeter_fence_west', -length / 2 - 5, 0, 0.22, width + 10],
      ['perimeter_fence_east', length / 2 + 5, 0, 0.22, width + 10],
    ]
    for (const [id, x, z, fenceLength, fenceWidth] of fences) {
      parts.push(
        sitePart({
          id,
          semanticRole: 'perimeter_fence',
          position: [x, 1.15, z],
          length: fenceLength,
          width: fenceWidth,
          height: 2.3,
          color: '#c7c3b8',
          roughness: 0.72,
          metalness: 0.18,
        }),
      )
    }
  }

  if (bool(params, 'includeLighting', true)) {
    const lightCount = Math.max(2, Math.min(48, Math.round(num(params, 'streetLightCount') ?? 18)))
    for (let index = 0; index < lightCount; index += 1) {
      const spacing = Math.max(6, (length - 24) / Math.max(1, lightCount - 1))
      const x = -length / 2 + 12 + index * spacing
      const z = index % 3 === 0 ? -67 : index % 3 === 1 ? -8.2 : 58
      parts.push(
        sitePart({
          id: `street_light_${index + 1}`,
          kind: 'generic_body',
          semanticRole: 'street_light',
          position: [x, 3.2, z],
          length: 0.22,
          width: 0.22,
          height: 6.4,
          color: '#64748b',
          roughness: 0.44,
          metalness: 0.42,
        }),
      )
    }
  }

  if (bool(params, 'includeFireSafety', true)) {
    const hydrants: Array<[number, number]> = [
      [-88, 20],
      [-88, 56],
      [-40, 32],
      [-6, 34],
      [36, 32],
      [76, 30],
      [88, -38],
      [54, -60],
      [-42, -62],
      [-82, -44],
    ]
    hydrants.forEach(([x, z], index) => {
      parts.push(
        sitePart({
          id: `fire_hydrant_${index + 1}`,
          kind: 'generic_body',
          semanticRole: 'fire_hydrant',
          position: [x, 0.42, z],
          length: 0.36,
          width: 0.36,
          height: 0.84,
          color: '#dc2626',
          roughness: 0.38,
          metalness: 0.28,
        }),
      )
    })
  }

  return parts
}

/**
 * Whether a synthesized part set carries real geometry (vs metadata-only).
 * Useful for tests and for consumers deciding between primitive composition
 * and node-system delegation.
 */
export function hasGeometryDimensions(part: SemanticRecipePart): boolean {
  const record = part as Record<string, unknown>
  return (
    typeof record.radius === 'number' ||
    typeof record.length === 'number' ||
    typeof record.height === 'number'
  )
}
