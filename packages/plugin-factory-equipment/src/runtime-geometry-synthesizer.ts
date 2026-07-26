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
import type { Profile } from './industry-pack-loader'

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
    const position = derivePosition(spec, dims, envelope, isPrimary, roleIndex - 1, secondary.length)
    const color = isPrimary
      ? pickColor(params, '#d1d5db')
      : pickColor(params, spec.material?.metalness && spec.material.metalness > 0.4 ? '#94a3b8' : '#cbd5e1')

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
