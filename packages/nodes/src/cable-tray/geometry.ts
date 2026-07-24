import {
  getWallCurveFrameAt,
  getWallCurveLength,
  isCurvedWall,
  sampleWallCenterline,
} from '@pascal-app/core'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import type { CableTrayNode } from './schema'

function material(color: string) {
  return new MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.58 })
}

/**
 * Straight trays are a single extrusion. Sampling each one into 32 pieces
 * created 93 mesh objects per route without adding any visible detail.
 * Curves retain an adaptive tessellation so their silhouette stays smooth.
 */
export function getCableTraySegmentCount(node: CableTrayNode) {
  const curveNode = node as Parameters<typeof isCurvedWall>[0]
  if (!isCurvedWall(curveNode)) return 1

  const length = getWallCurveLength(curveNode)
  return Math.max(6, Math.min(24, Math.ceil(length / 0.5)))
}

function addBoxSegment(
  group: Group,
  args: {
    x1: number
    z1: number
    x2: number
    z2: number
    y: number
    lengthPad?: number
    sizeY: number
    sizeZ: number
    offsetZ?: number
    material: MeshStandardMaterial
  },
) {
  const dx = args.x2 - args.x1
  const dz = args.z2 - args.z1
  const length = Math.hypot(dx, dz) + (args.lengthPad ?? 0)
  if (length < 0.01) return
  const angle = Math.atan2(dz, dx)
  const normalX = -Math.sin(angle)
  const normalZ = Math.cos(angle)
  const offset = args.offsetZ ?? 0
  const mesh = new Mesh(new BoxGeometry(length, args.sizeY, args.sizeZ), args.material)
  mesh.position.set(
    (args.x1 + args.x2) / 2 + normalX * offset,
    args.y,
    (args.z1 + args.z2) / 2 + normalZ * offset,
  )
  mesh.rotation.y = -angle
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
}

export function buildCableTrayGeometry(node: CableTrayNode): Group {
  const group = new Group()
  const segmentCount = getCableTraySegmentCount(node)
  const points = sampleWallCenterline(node, segmentCount)
  if (points.length < 2) return group

  const mat = material(node.color)
  const bottomY = node.elevation + node.thickness / 2
  const sideY = node.elevation + node.sideHeight / 2
  const sideOffset = Math.max(0, node.width / 2 - node.thickness / 2)

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!
    const next = points[index]!
    addBoxSegment(group, {
      x1: prev.x,
      z1: prev.y,
      x2: next.x,
      z2: next.y,
      y: bottomY,
      sizeY: node.thickness,
      sizeZ: node.width,
      material: mat,
    })
    for (const side of [-1, 1] as const) {
      addBoxSegment(group, {
        x1: prev.x,
        z1: prev.y,
        x2: next.x,
        z2: next.y,
        y: sideY,
        sizeY: node.sideHeight,
        sizeZ: node.thickness,
        offsetZ: side * sideOffset,
        material: mat,
      })
    }
  }

  if (node.showRungs && node.rungSpacing > 0.05) {
    const length = getWallCurveLength(node)
    const count = Math.max(1, Math.floor(length / node.rungSpacing))
    for (let index = 0; index <= count; index += 1) {
      const frame = getWallCurveFrameAt(node, index / count)
      const rung = new Mesh(new BoxGeometry(node.thickness, node.thickness, node.width), mat)
      rung.position.set(
        frame.point.x,
        node.elevation + node.sideHeight + node.thickness / 2,
        frame.point.y,
      )
      rung.rotation.y = -Math.atan2(frame.tangent.y, frame.tangent.x)
      rung.castShadow = true
      rung.receiveShadow = true
      group.add(rung)
    }
  }

  return group
}
