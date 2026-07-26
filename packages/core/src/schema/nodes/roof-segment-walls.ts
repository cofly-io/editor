import type { RoofSegmentNode } from './roof-segment'

/** Identifies one of a roof segment's four vertical wall faces. */
export type RoofWallFaceId = 'front' | 'back' | 'right' | 'left'

type SegmentWallInputs = Pick<RoofSegmentNode, 'width' | 'depth' | 'wallThickness'>

const FACE_YAWS: Record<RoofWallFaceId, number> = {
  front: 0,
  back: Math.PI,
  right: Math.PI / 2,
  left: -Math.PI / 2,
}

/**
 * Returns the renderer frame for a roof segment wall face. Frame X runs along
 * the face, Y is vertical, and +Z points outward. Its origin is on the wall
 * mid-plane, so roof-hosted children use the same local coordinates as
 * ordinary wall children.
 */
export function getRoofWallFaceFrame(
  node: SegmentWallInputs,
  id: RoofWallFaceId,
): { origin: [number, number, number]; yaw: number } {
  const halfWidthWithWall = (node.width + node.wallThickness) / 2
  const halfDepthWithWall = (node.depth + node.wallThickness) / 2

  switch (id) {
    case 'front':
      return { origin: [-halfWidthWithWall, 0, node.depth / 2], yaw: FACE_YAWS.front }
    case 'back':
      return { origin: [halfWidthWithWall, 0, -node.depth / 2], yaw: FACE_YAWS.back }
    case 'right':
      return { origin: [node.width / 2, 0, halfDepthWithWall], yaw: FACE_YAWS.right }
    case 'left':
      return { origin: [-node.width / 2, 0, -halfDepthWithWall], yaw: FACE_YAWS.left }
  }
}
