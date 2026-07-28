/**
 * Laptop fixture — the canonical DSL example for stage 3.
 *
 * This is the first standard few-shot fixture per the plan §阶段 3 工作项 6.
 * It demonstrates:
 *   - params block with semanticRole / affects / unit / range / label
 *   - const declarations with derived values
 *   - user-defined function (makeKey)
 *   - nested C-style for loops (5 rows × 12 columns = 60 keys)
 *   - partId templating with loop variables: keyboard.key.r{row}.c{col}
 *   - chained part builder API: atWorld / withRole / childOf / atLocal
 *   - hinge rotation via rotateAround(pivot, {axis, degrees})
 *   - hinge constraint declaration
 *
 * Stage 3 acceptance criteria covered:
 *   - 60 unique key partIds and positions
 *   - lid rotation is non-identity quaternion about the hinge pivot
 *   - screen is a local-space child of lid
 *   - params keycapWidth / columns / deckLength are individually addressable
 */

export const LAPTOP_DSL_SOURCE = `const P = params({
  keycapWidth: {
    type: 'number',
    unit: 'm',
    range: [0.014, 0.025],
    default: 0.018,
    semanticRole: 'keyboard.key.width',
    affects: 'keyboard.key.*',
    label: '键帽宽度',
  },
  columns: {
    type: 'integer',
    range: [10, 15],
    default: 12,
    semanticRole: 'keyboard.layout.columns',
    affects: 'keyboard.key.*',
    label: '键盘列数',
  },
  rows: {
    type: 'integer',
    range: [4, 6],
    default: 5,
    semanticRole: 'keyboard.layout.rows',
    affects: 'keyboard.key.*',
    label: '键盘行数',
  },
  deckLength: {
    type: 'number',
    unit: 'm',
    range: [0.30, 0.42],
    default: 0.35,
    semanticRole: 'laptop.deck.length',
    affects: 'laptop.base',
    label: '底座长度',
  },
  deckDepth: {
    type: 'number',
    unit: 'm',
    range: [0.20, 0.30],
    default: 0.24,
    semanticRole: 'laptop.deck.depth',
    affects: 'laptop.base',
    label: '底座深度',
  },
  lidAngleDeg: {
    type: 'number',
    unit: 'deg',
    range: [0, 135],
    default: 110,
    semanticRole: 'laptop.lid.angle',
    affects: 'laptop.lid',
    label: '屏幕开合角',
  },
});

const deckThickness = 0.02;
const keyGap = 0.004;
const keyPitch = P.keycapWidth + keyGap;
const lidHeight = P.deckDepth;
const lidThickness = 0.008;
const hingePivotY = deckThickness;
const hingePivotZ = -(P.deckDepth / 2);

part('laptop.base',
  box({ length: P.deckLength, width: P.deckDepth, height: deckThickness, material: 'metal' })
).atWorld([0, deckThickness / 2, 0]).withRole('laptop_base');

function makeKey(row, col) {
  const x = (col - (P.columns - 1) / 2) * keyPitch;
  const z = -(P.deckDepth / 2) + 0.04 + row * keyPitch + keyPitch / 2;
  const y = deckThickness + 0.004;
  part(
    'keyboard.key.r' + row + '.c' + col,
    box({ length: P.keycapWidth, width: P.keycapWidth, height: 0.008, material: 'plastic' })
  ).atWorld([x, y, z]).withRole('keyboard_key');
}

for (let r = 0; r < P.rows; r++) {
  for (let c = 0; c < P.columns; c++) {
    makeKey(r, c);
  }
}

part('laptop.trackpad',
  box({ length: 0.10, width: 0.08, height: 0.004, material: 'plastic' })
).atWorld([0, deckThickness + 0.002, P.deckDepth / 2 - 0.06]).withRole('laptop_trackpad');

part('laptop.lid',
  box({ length: P.deckLength, width: lidThickness, height: lidHeight, material: 'metal' })
)
  .atWorld([0, hingePivotY + lidHeight / 2, hingePivotZ])
  .rotateAround([0, hingePivotY, hingePivotZ], { axis: 'x', degrees: 90 - P.lidAngleDeg })
  .withRole('laptop_lid');

part('laptop.screen',
  box({
    length: P.deckLength - 0.016,
    width: 0.002,
    height: lidHeight - 0.016,
    material: 'glass',
  })
)
  .childOf('laptop.lid')
  .atLocal([0, 0, lidThickness / 2 + 0.001])
  .withRole('laptop_screen');

hinge({
  part: 'laptop.lid',
  anchor: 'laptop.base',
  axis: [1, 0, 0],
  pivot: [0, hingePivotY, hingePivotZ],
  restAngle: P.lidAngleDeg * math.DEG_TO_RAD,
  limits: [0, 135 * math.DEG_TO_RAD],
});
`

// ---------------------------------------------------------------------------
// Expected geometry (hand-computed "gold standard" for evaluator tests)
// ---------------------------------------------------------------------------

export const LAPTOP_DEFAULT_PARAMS = {
  keycapWidth: 0.018,
  columns: 12,
  rows: 5,
  deckLength: 0.35,
  deckDepth: 0.24,
  lidAngleDeg: 110,
} as const

export const LAPTOP_DERIVED = {
  deckThickness: 0.02,
  keyGap: 0.004,
  keyPitch: LAPTOP_DEFAULT_PARAMS.keycapWidth + 0.004, // 0.022
  lidHeight: LAPTOP_DEFAULT_PARAMS.deckDepth, // 0.24
  lidThickness: 0.008,
  hingePivotY: 0.02,
  hingePivotZ: -(LAPTOP_DEFAULT_PARAMS.deckDepth / 2), // -0.12
} as const

/** Expected world position of key at (row, col) under default params. */
export function expectedKeyPosition(row: number, col: number): [number, number, number] {
  const { columns } = LAPTOP_DEFAULT_PARAMS
  const { keyPitch, deckThickness } = LAPTOP_DERIVED
  const deckDepth = LAPTOP_DEFAULT_PARAMS.deckDepth
  const x = (col - (columns - 1) / 2) * keyPitch
  const z = -(deckDepth / 2) + 0.04 + row * keyPitch + keyPitch / 2
  const y = deckThickness + 0.004
  return [x, y, z]
}

/**
 * Expected lid world position + rotation.
 *
 * Initial position (before rotateAround): [0, hingePivotY + lidHeight/2, hingePivotZ]
 *   = [0, 0.02 + 0.12, -0.12] = [0, 0.14, -0.12]
 *
 * Rotation: rotateAround(pivot=[0, 0.02, -0.12], {axis:'x', degrees: 110 - 90 = 20})
 *
 * Offset from pivot to position: [0, 0.12, 0]
 * Rotated by 20° about X:
 *   x' = 0
 *   y' = 0.12 * cos(20°) - 0 * sin(20°) = 0.12 * 0.9396926 ≈ 0.11276
 *   z' = 0.12 * sin(20°) + 0 * cos(20°) = 0.12 * 0.34202  ≈ 0.04104
 *
 * New world position = pivot + rotated = [0, 0.02 + 0.11276, -0.12 + 0.04104]
 *                                       ≈ [0, 0.13276, -0.07896]
 *
 * Quaternion: axis=x, angle=20°
 *   half = 10°
 *   sin(10°) ≈ 0.17365, cos(10°) ≈ 0.98481
 *   q = [0.17365, 0, 0, 0.98481]
 */
export const EXPECTED_LID = {
  position: [0, 0.13276, -0.16104] as const,
  rotation: [-0.17365, 0, 0, 0.98481] as const,
  tolerance: 1e-4,
} as const

/** Total expected part count: 1 base + 60 keys + 1 trackpad + 1 lid + 1 screen. */
export const EXPECTED_PART_COUNT = 1 + 60 + 1 + 1 + 1
