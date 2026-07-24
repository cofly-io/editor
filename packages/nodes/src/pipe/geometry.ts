import { getWallCurveLength, isCurvedWall, samplePipeCenterline3D } from '@pascal-app/core'
import { CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, TubeGeometry, Vector3 } from 'three'
import type { PipeNode } from './schema'

function createPipeMaterial(color: string, opacity = 1) {
  return new MeshStandardMaterial({
    color,
    metalness: 0.45,
    roughness: 0.42,
    transparent: opacity < 1,
    opacity,
  })
}

function createInsulationMaterial(color: string) {
  return new MeshStandardMaterial({
    color,
    metalness: 0.05,
    roughness: 0.85,
    transparent: true,
    opacity: 0.72,
  })
}

/** A straight tube has no curvature to approximate, so one longitudinal
 * segment renders identically to a densely sampled path. */
export function getPipePathSegmentCount(node: PipeNode) {
  return isCurvedWall(node) ? 16 : 1
}

export function getPipeTubularSegmentCount(node: PipeNode) {
  if (!isCurvedWall(node)) return 1
  return Math.max(12, Math.ceil(getWallCurveLength(node) / 0.2))
}

function addInsulationShell(
  group: Group,
  node: PipeNode,
  innerRadius: number,
  buildInner: (outerRadius: number) => Mesh | null,
) {
  if (!node.insulated || node.insulationThickness <= 0) {
    const inner = buildInner(innerRadius)
    if (inner) group.add(inner)
    return
  }

  const outerRadius = innerRadius + node.insulationThickness
  const outer = buildInner(outerRadius)
  if (outer) {
    outer.material = createInsulationMaterial(node.color)
    group.add(outer)
  }

  const inner = buildInner(innerRadius)
  if (inner) group.add(inner)
}

function buildPipeMeshes(node: PipeNode, group: Group) {
  const samples = samplePipeCenterline3D(node, getPipePathSegmentCount(node))
  if (samples.length < 2) return

  const points = samples.map((point) => new Vector3(point.x, point.y, point.z))
  const curve = new CatmullRomCurve3(points)
  const tubularSegments = getPipeTubularSegmentCount(node)
  const radius = node.diameter / 2

  addInsulationShell(group, node, radius, (pipeRadius) => {
    const geometry = new TubeGeometry(curve, tubularSegments, pipeRadius, 16, false)
    const mesh = new Mesh(geometry, createPipeMaterial(node.color, node.opacity))
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  })
}

/** Tube along the tilted 3D centerline — rotate 0° horizontal, 90° vertical. */
export function buildPipeGeometry(node: PipeNode): Group {
  const group = new Group()
  buildPipeMeshes(node, group)
  return group
}
