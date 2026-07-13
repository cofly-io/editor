import { PRIMITIVE_ANCHORS } from './ai-geometry-tool-constants'

export type PrimitiveAttachmentSide = {
  axis: 0 | 1 | 2
  sign: -1 | 1
  label: string
}

export function isPrimitiveAnchor(value: unknown): value is string {
  return typeof value === 'string' && PRIMITIVE_ANCHORS.has(value)
}

export function getExpectedAttachmentSide(
  anchor: string,
  childAnchor: string,
): PrimitiveAttachmentSide | undefined {
  if (anchor === 'top' && childAnchor === 'bottom')
    return { axis: 1, sign: 1, label: 'above the parent' }
  if (anchor === 'top' && childAnchor === 'center')
    return { axis: 1, sign: 1, label: 'at the parent top' }
  if (anchor === 'bottom' && childAnchor === 'top')
    return { axis: 1, sign: -1, label: 'below the parent' }
  if (anchor === 'bottom' && childAnchor === 'center')
    return { axis: 1, sign: -1, label: 'at the parent bottom' }
  if (anchor === 'right' && childAnchor === 'left')
    return { axis: 0, sign: 1, label: 'right of the parent' }
  if (anchor === 'right' && childAnchor === 'center')
    return { axis: 0, sign: 1, label: 'at the parent right side' }
  if (anchor === 'left' && childAnchor === 'right')
    return { axis: 0, sign: -1, label: 'left of the parent' }
  if (anchor === 'left' && childAnchor === 'center')
    return { axis: 0, sign: -1, label: 'at the parent left side' }
  if (anchor === 'front' && childAnchor === 'back')
    return { axis: 2, sign: 1, label: 'in front of the parent' }
  if (anchor === 'front' && childAnchor === 'center')
    return { axis: 2, sign: 1, label: 'at the parent front side' }
  if (anchor === 'back' && childAnchor === 'front')
    return { axis: 2, sign: -1, label: 'behind the parent' }
  if (anchor === 'back' && childAnchor === 'center')
    return { axis: 2, sign: -1, label: 'at the parent back side' }
  return undefined
}
