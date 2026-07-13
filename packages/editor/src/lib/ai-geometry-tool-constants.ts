import type {
  PrimitiveMaterialInput,
  PrimitiveShapeInput,
} from '@pascal-app/core/lib/primitive-compose'

export const MAX_GENERATED_GEOMETRY_SHAPES = 80

export const GEOMETRY_TOOL_NAMES = new Set([
  'compose_primitive',
  'compose_parts',
  'compose_recipe',
  'compose_assembly',
  'revise_geometry',
  'compose_robot_arm',
])

export const MATERIAL_PRESETS = new Set([
  'white',
  'brick',
  'concrete',
  'wood',
  'glass',
  'metal',
  'plaster',
  'tile',
  'marble',
  'custom',
])

export const PRIMITIVE_ANCHORS = new Set([
  'top',
  'bottom',
  'center',
  'front',
  'back',
  'left',
  'right',
  'start',
  'end',
])

export const PRIMITIVE_SHAPE_KINDS = new Set([
  'box',
  'cylinder',
  'hollow-cylinder',
  'cone',
  'frustum',
  'sphere',
  'hemisphere',
  'torus',
  'wedge',
  'trapezoid-prism',
  'lathe',
  'capsule',
  'half-cylinder',
  'rounded-panel',
  'conformal-strip',
  'extrude',
  'sweep',
])

export type RawGeometryToolShape = Omit<PrimitiveShapeInput, 'kind' | 'material'> & {
  kind?: string
  shape?: string
  type?: string
  params?: Record<string, unknown>
  size?: number[]
  diameter?: number
  color?: number[]
  material?: PrimitiveMaterialInput | Record<string, unknown> | string
  materialColor?: string
}
