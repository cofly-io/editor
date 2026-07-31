/**
 * Industrial detail helpers — add weld seams, bolt patterns, rust stains,
 * and other surface-detail parts to equipment specs.
 *
 * Each function returns an EquipmentPartSpec[] that can be spread into
 * any equipment builder's output array. Designed to be called from SD K
 * functions so every device gets the same industrial surface language
 * without repeating the logic.
 */
import type { EquipmentMaterialPreset, EquipmentPartSpec, Vec3 } from './equipment-functions'

const spec = (
  id: string,
  kind: EquipmentPartSpec['kind'],
  semanticRole: string,
  position: Vec3,
  params: Record<string, unknown>,
  material: EquipmentMaterialPreset = 'dark_fastener',
  rotation?: { axis: 'x' | 'y' | 'z'; degrees: number },
): EquipmentPartSpec => ({
  id,
  kind,
  semanticRole,
  position,
  material,
  params,
  ...(rotation ? { rotation } : {}),
})

// ---------------------------------------------------------------------------
// Weld / seam details
// ---------------------------------------------------------------------------

/**
 * Add horizontal seam rings around a cylindrical body.
 * Simulates the circumferential weld joints between shell courses.
 *
 * @param baseId   — prefix for generated part IDs (e.g. 'vessel')
 * @param position — center of the cylinder body
 * @param diameter — body outer diameter (meters)
 * @param height   — body height (meters)
 * @param count    — number of evenly-spaced seams (default: floor(height / 4) + 1)
 */
export function addHorizontalSeams(
  baseId: string,
  position: Vec3,
  diameter: number,
  height: number,
  count?: number,
): EquipmentPartSpec[] {
  const seamCount = count ?? Math.max(1, Math.floor(height / 2.5))
  const spacing = seamCount <= 1 ? 0 : height / (seamCount + 1)
  const radius = diameter / 2 + 0.02
  const parts: EquipmentPartSpec[] = []
  for (let i = 1; i <= seamCount; i++) {
    const y = position[1] - height / 2 + spacing * i
    parts.push(
      spec(
        `${baseId}.seam.${i}`,
        'torus',
        'weld_seam',
        [position[0], y, position[2]],
        {
          majorRadius: radius,
          tubeRadius: Math.min(0.015, diameter * 0.012),
          radialSegments: 6,
          tubularSegments: Math.max(32, Math.floor(diameter * 20)),
        },
        'dark_fastener' as EquipmentMaterialPreset,
        { axis: 'x', degrees: 90 },
      ),
    )
  }
  return parts
}

// ---------------------------------------------------------------------------
// Rust / surface imperfection details
// ---------------------------------------------------------------------------

/**
 * Add random surface rust/weathering stains to a cylindrical body.
 * These are small plane decals offset just above the surface.
 *
 * @param baseId   — prefix for generated part IDs
 * @param position — center of the body
 * @param radius   — body outer radius (meters)
 * @param height   — body height (meters)
 * @param count    — number of stains (default: 2-5 random)
 * @param bodyY0   — bottom Y of the visible body (default: position[1] - height/2)
 * @param bodyH    — visible body height (default: height)
 */
export function addRustStains(
  baseId: string,
  position: Vec3,
  radius: number,
  height: number,
  count?: number,
  bodyY0?: number,
  bodyH?: number,
): EquipmentPartSpec[] {
  const stainCount = count ?? 2 + Math.floor(Math.random() * 3)
  const y0 = bodyY0 ?? position[1] - height / 2
  const h = bodyH ?? height
  const parts: EquipmentPartSpec[] = []
  for (let i = 0; i < stainCount; i++) {
    const angle = Math.random() * Math.PI * 2
    const y = y0 + Math.random() * h * 0.6
    const stainW = radius * (0.15 + Math.random() * 0.35)
    const stainH = 1.5 + Math.random() * 3
    parts.push(
      spec(
        `${baseId}.stain.${i}`,
        'box',
        'surface_stain',
        [
          position[0] + Math.cos(angle) * (radius + 0.015),
          y,
          position[2] + Math.sin(angle) * (radius + 0.015),
        ],
        {
          length: stainW,
          width: stainH,
          height: 0.006,
          cornerRadius: 0.002,
          cornerSegments: 3,
        },
        'cast_iron' as EquipmentMaterialPreset,
      ),
    )
  }
  return parts
}

// ---------------------------------------------------------------------------
// Bolt circle details
// ---------------------------------------------------------------------------

/**
 * Add a circular bolt pattern to a flange face or mounting plate.
 *
 * @param baseId         — prefix for generated part IDs
 * @param position       — center of the bolt circle
 * @param boltCount      — number of bolts (default: 8)
 * @param pitchDiameter  — bolt circle diameter (meters)
 * @param boltDiameter   — individual bolt head diameter (default: proportionally derived)
 * @param boltLength     — bolt head protrusion length (default: 0.04m)
 * @param material       — bolt material (default: dark_fastener)
 */
export function addBoltCircle(
  baseId: string,
  position: Vec3,
  boltCount: number,
  pitchDiameter: number,
  boltDiameter?: number,
  boltLength?: number,
  material?: EquipmentMaterialPreset,
): EquipmentPartSpec[] {
  const count = Math.max(4, boltCount)
  const pRadius = pitchDiameter / 2
  const bDiameter = boltDiameter ?? Math.max(0.016, pitchDiameter * 0.08)
  const bLength = boltLength ?? 0.04
  const parts: EquipmentPartSpec[] = []
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count
    parts.push(
      spec(
        `${baseId}.bolt.${i}`,
        'cylinder',
        'bolt_head',
        [
          position[0] + Math.cos(angle) * pRadius,
          position[1],
          position[2] + Math.sin(angle) * pRadius,
        ],
        {
          radius: bDiameter / 2,
          height: bLength,
          radialSegments: 20,
        },
        material ?? 'dark_fastener',
        { axis: 'z', degrees: 90 },
      ),
    )
  }
  return parts
}

// ---------------------------------------------------------------------------
// Flange face bolt pattern (convenience wrapper)
// ---------------------------------------------------------------------------

/**
 * Add bolts to both faces of a flange pair.
 *
 * @param baseId        — prefix
 * @param position      — center of the flange joint
 * @param flangeDiameter — nominal flange outer diameter
 * @param boltCount      — bolts per face (default: proportionally derived)
 */
export function addFlangeBolts(
  baseId: string,
  position: Vec3,
  flangeDiameter: number,
  boltCount?: number,
): EquipmentPartSpec[] {
  const count = boltCount ?? Math.max(6, Math.round(flangeDiameter * 18))
  const pitchDiameter = flangeDiameter * 0.78
  return addBoltCircle(
    baseId,
    position,
    count,
    pitchDiameter,
    flangeDiameter * 0.04,
    0.025,
    'stainless_steel',
  )
}

// ---------------------------------------------------------------------------
// Saddle support details
// ---------------------------------------------------------------------------

/**
 * Add visible mounting bolt details to saddle supports.
 * Places bolt heads at the base plate of each saddle.
 *
 * @param baseId     — prefix
 * @param position   — center of the saddle base plate
 * @param saddleWidth — saddle base width (meters)
 * @param saddleLength — saddle base length (meters)
 */
export function addSaddleBolts(
  baseId: string,
  position: Vec3,
  saddleWidth: number,
  saddleLength: number,
): EquipmentPartSpec[] {
  const parts: EquipmentPartSpec[] = []
  const boltRadius = saddleWidth * 0.025
  for (const dx of [-saddleLength * 0.35, saddleLength * 0.35]) {
    for (const dz of [-saddleWidth * 0.35, saddleWidth * 0.35]) {
      parts.push(
        spec(
          `${baseId}.saddle_bolt`,
          'cylinder',
          'bolt_head',
          [position[0] + dx, position[1] - 0.005, position[2] + dz],
          { radius: boltRadius, height: 0.025, radialSegments: 20 },
          'dark_fastener',
          { axis: 'y', degrees: 0 },
        ),
      )
    }
  }
  return parts
}

// ---------------------------------------------------------------------------
// Coupling / joint ring
// ---------------------------------------------------------------------------

/**
 * Add a visible coupling ring at a shaft or pipe joint.
 * A short torus or cylinder with a contrasting color that marks a
 * mechanical connection point.
 *
 * @param baseId    — prefix
 * @param position  — center of the joint
 * @param diameter  — shaft/pipe outer diameter
 * @param axis      — orientation axis
 */
export function addCouplingRing(
  baseId: string,
  position: Vec3,
  diameter: number,
  axis: 'x' | 'y' | 'z' = 'x',
): EquipmentPartSpec {
  const ringDiameter = diameter * 1.12
  return spec(
    `${baseId}.coupling_ring`,
    'cylinder',
    'coupling_joint',
    position,
    {
      radius: ringDiameter / 2,
      height: diameter * 0.18,
      radialSegments: 32,
    },
    'cast_iron',
    { axis, degrees: 90 },
  )
}
