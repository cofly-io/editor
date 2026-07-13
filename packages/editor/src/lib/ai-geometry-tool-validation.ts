import type { GeneratedGeometryShapeSpec as ShapeSpec } from './ai-generated-geometry-core'
import { getExpectedAttachmentSide, isPrimitiveAnchor } from './ai-geometry-tool-anchors'

export function validateGeometryToolShapes(shapes: ShapeSpec[]): string[] {
  const isPositiveNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0

  return shapes.flatMap((shape, index) => {
    const label = shape.name ?? `${shape.kind} #${index + 1}`
    const issues: string[] = []
    const numericAttachTo = typeof shape.attachTo === 'number' ? shape.attachTo : undefined
    if (shape.attachTo != null && numericAttachTo == null && shape.kind !== 'conformal-strip') {
      issues.push(
        `${label}: attachTo must reference an earlier shape in the SAME compose_primitive call; got ${shape.attachTo}.`,
      )
    }
    if (
      numericAttachTo != null &&
      (!Number.isInteger(numericAttachTo) || numericAttachTo < 0 || numericAttachTo >= index)
    ) {
      issues.push(
        `${label}: attachTo must reference an earlier shape in the SAME compose_primitive call; got ${shape.attachTo}.`,
      )
    }
    if (
      numericAttachTo != null &&
      (!isPrimitiveAnchor(shape.anchor) || !isPrimitiveAnchor(shape.childAnchor))
    ) {
      issues.push(
        `${label}: attachTo requires explicit anchor and childAnchor. Examples: under desktop uses anchor="bottom", childAnchor="top"; front handle uses anchor="front", childAnchor="back".`,
      )
    }
    if (
      numericAttachTo != null &&
      isPrimitiveAnchor(shape.anchor) &&
      isPrimitiveAnchor(shape.childAnchor)
    ) {
      const parent = shapes[numericAttachTo]
      const expectedSide = getExpectedAttachmentSide(shape.anchor, shape.childAnchor)
      if (parent && expectedSide) {
        const delta = shape.position[expectedSide.axis] - parent.position[expectedSide.axis]
        if (Number.isFinite(delta) && Math.abs(delta) > 0.02 && delta * expectedSide.sign < -0.02) {
          issues.push(
            `${label}: anchor="${shape.anchor}" and childAnchor="${shape.childAnchor}" place the child ${expectedSide.label}, but its world-center position is on the opposite side of "${parent.name ?? parent.kind}". Reverse the anchors or remove attachTo.`,
          )
        }
      }
    }

    switch (shape.kind) {
      case 'box':
        if (!isPositiveNumber(shape.length))
          issues.push(`${label}: box.length is required (X left-right).`)
        if (!isPositiveNumber(shape.width))
          issues.push(`${label}: box.width is required (Z front-back depth).`)
        if (!isPositiveNumber(shape.height))
          issues.push(`${label}: box.height is required (Y vertical).`)
        break
      case 'rounded-panel':
        if (!isPositiveNumber(shape.length))
          issues.push(`${label}: rounded-panel.length is required (X left-right).`)
        if (!isPositiveNumber(shape.width))
          issues.push(`${label}: rounded-panel.width is required (Z front-back depth).`)
        if (!isPositiveNumber(shape.thickness))
          issues.push(`${label}: rounded-panel.thickness is required (Y thickness).`)
        break
      case 'conformal-strip':
        if (!isPositiveNumber(shape.width))
          issues.push(`${label}: conformal-strip.width is required (vertical strip width).`)
        if (!isPositiveNumber(shape.thickness))
          issues.push(`${label}: conformal-strip.thickness is required.`)
        if (!isPositiveNumber(shape.surfaceRadiusY))
          issues.push(`${label}: conformal-strip.surfaceRadiusY is required.`)
        if (!isPositiveNumber(shape.surfaceRadiusZ))
          issues.push(`${label}: conformal-strip.surfaceRadiusZ is required.`)
        if (
          !(
            typeof shape.xStart === 'number' &&
            typeof shape.xEnd === 'number' &&
            shape.xStart !== shape.xEnd
          )
        )
          issues.push(`${label}: conformal-strip.xStart and xEnd must define a nonzero X span.`)
        if (shape.side !== 'left' && shape.side !== 'right')
          issues.push(`${label}: conformal-strip.side must be "left" or "right".`)
        break
      case 'wedge':
      case 'trapezoid-prism':
        if (!isPositiveNumber(shape.length))
          issues.push(`${label}: ${shape.kind}.length is required (X left-right).`)
        if (!isPositiveNumber(shape.width))
          issues.push(`${label}: ${shape.kind}.width is required (Z front-back depth).`)
        if (!isPositiveNumber(shape.height))
          issues.push(`${label}: ${shape.kind}.height is required (Y vertical).`)
        break
      case 'cylinder':
      case 'hollow-cylinder':
      case 'cone':
      case 'capsule':
      case 'half-cylinder':
        if (!isPositiveNumber(shape.radius))
          issues.push(`${label}: ${shape.kind}.radius is required.`)
        if (!isPositiveNumber(shape.height))
          issues.push(`${label}: ${shape.kind}.height is required along axis.`)
        break
      case 'frustum':
        if (!isPositiveNumber(shape.radiusTop))
          issues.push(`${label}: frustum.radiusTop is required.`)
        if (!isPositiveNumber(shape.radiusBottom))
          issues.push(`${label}: frustum.radiusBottom is required.`)
        if (!isPositiveNumber(shape.height))
          issues.push(`${label}: frustum.height is required along axis.`)
        break
      case 'sphere':
        if (!isPositiveNumber(shape.radius)) issues.push(`${label}: sphere.radius is required.`)
        break
      case 'hemisphere':
        if (!isPositiveNumber(shape.radius)) issues.push(`${label}: hemisphere.radius is required.`)
        break
      case 'torus':
        if (!isPositiveNumber(shape.majorRadius ?? shape.radius))
          issues.push(`${label}: torus.majorRadius is required.`)
        if (!isPositiveNumber(shape.tubeRadius))
          issues.push(`${label}: torus.tubeRadius is required.`)
        break
      case 'lathe':
        if (!Array.isArray(shape.profile) || shape.profile.length < 2) {
          issues.push(`${label}: lathe.profile needs at least 2 [radius,height] points.`)
        }
        break
      case 'extrude':
        if (!Array.isArray(shape.profile) || shape.profile.length < 3) {
          issues.push(`${label}: extrude.profile needs at least 3 closed outline points.`)
        }
        if (Array.isArray(shape.holes)) {
          for (const [holeIndex, hole] of shape.holes.entries()) {
            if (!Array.isArray(hole) || hole.length < 3) {
              issues.push(`${label}: extrude.holes[${holeIndex}] needs at least 3 outline points.`)
            }
          }
        }
        if (!isPositiveNumber(shape.depth)) issues.push(`${label}: extrude.depth is required.`)
        break
      case 'sweep':
        if (!Array.isArray(shape.path) || shape.path.length < 2) {
          issues.push(`${label}: sweep.path needs at least 2 [x,y,z] points.`)
        }
        if (!isPositiveNumber(shape.radius)) issues.push(`${label}: sweep.radius is required.`)
        break
      default:
        issues.push(`${label}: unsupported kind "${shape.kind}".`)
    }
    return issues
  })
}
