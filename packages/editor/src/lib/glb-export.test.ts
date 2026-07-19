import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test'
import { type AnyNode, DoorNode, sceneRegistry } from '@pascal-app/core'
import * as THREE from 'three'

let buildDoorPreviewMesh: (node: DoorNode) => THREE.Mesh
let prepareSceneForExport: typeof import('./glb-export').prepareSceneForExport

beforeAll(async () => {
  const poseDoorMovingParts = (node: DoorNode, mesh: THREE.Object3D | undefined, value: number) => {
    if (!mesh) return false
    if (node.doorType === 'sliding') {
      const group = mesh.getObjectByName('door-sliding-active')
      if (!group) return false
      group.position.x = -0.44 * (node.width - 2 * node.frameThickness) * value
      return true
    }
    if (node.doorType === 'folding') {
      let posed = false
      for (let index = 0; index < (node.leafCount === 2 ? 2 : 4); index++) {
        const group = mesh.getObjectByName(`door-fold-${index}`)
        if (!group) continue
        posed = true
        group.rotation.set(0, value * 0.1 * (index % 2 === 0 ? 1 : -1), 0)
      }
      return posed
    }
    return false
  }

  mock.module('@pascal-app/viewer', () => {
    return {
      poseDoorMovingParts,
      poseWindowMovingParts: () => false,
      SCENE_LAYER: 0,
      snapLevelsToTruePositions: () => () => {},
    }
  })

  buildDoorPreviewMesh = (node: DoorNode) => {
    const mesh = new THREE.Mesh()
    for (let index = 0; index < (node.leafCount === 2 ? 2 : 4); index++) {
      const panel = new THREE.Group()
      panel.name = `door-fold-${index}`
      panel.add(meshWithNodeMaterial(nodeMaterial()))
      mesh.add(panel)
    }
    return mesh
  }
  const glbExport = await import('./glb-export')
  prepareSceneForExport = glbExport.prepareSceneForExport
})

afterAll(() => {
  mock.restore()
})

afterEach(() => {
  sceneRegistry.clear()
})

function nodeMaterial(overrides: Record<string, unknown> = {}) {
  return {
    isNodeMaterial: true,
    name: 'painted',
    color: new THREE.Color('#cc3300'),
    roughness: 0.3,
    metalness: 0.7,
    transparent: false,
    opacity: 1,
    side: THREE.FrontSide,
    alphaTest: 0,
    depthWrite: true,
    depthTest: true,
    vertexColors: false,
    toneMapped: true,
    ...overrides,
  } as unknown as THREE.Material
}

function meshWithNodeMaterial(material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
}

describe('prepareSceneForExport', () => {
  test('converts NodeMaterials to classic glTF-standard materials', () => {
    const root = new THREE.Group()
    const mesh = meshWithNodeMaterial(nodeMaterial())
    root.add(mesh)

    const { scene } = prepareSceneForExport(root, {})

    const exported = scene.children[0] as THREE.Mesh
    const material = exported.material as THREE.MeshStandardMaterial
    expect(material.isMeshStandardMaterial).toBe(true)
    expect(material.roughness).toBeCloseTo(0.3)
    expect(material.metalness).toBeCloseTo(0.7)
    expect(material.color.getHexString()).toBe('cc3300')
  })

  test('shared NodeMaterial instances convert to a single shared material', () => {
    const root = new THREE.Group()
    const shared = nodeMaterial()
    root.add(meshWithNodeMaterial(shared), meshWithNodeMaterial(shared))

    const { scene } = prepareSceneForExport(root, {})

    const meshes = scene.children as THREE.Mesh[]
    expect(meshes[0]!.material).toBe(meshes[1]!.material)
  })

  test('strips editor overlays that live off the scene layer', () => {
    const root = new THREE.Group()
    const realMesh = meshWithNodeMaterial(nodeMaterial())
    const overlay = meshWithNodeMaterial(nodeMaterial())
    overlay.layers.set(1) // OVERLAY_LAYER / EDITOR_LAYER — off scene layer 0
    root.add(realMesh, overlay)

    const { scene } = prepareSceneForExport(root, {})

    const meshes: THREE.Mesh[] = []
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
    })
    expect(meshes).toHaveLength(1)
  })

  test('neutralises an invisible hitbox root but keeps its visible children', () => {
    // Door/window roots are selection hitboxes: a box geometry with an invisible
    // material (object stays visible). Left intact it would plug the wall opening.
    const root = new THREE.Group()
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 0.2),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    const leaf = meshWithNodeMaterial(nodeMaterial())
    hitbox.add(leaf)
    root.add(hitbox)

    const doorId = 'door_hitbox'
    sceneRegistry.nodes.set(doorId, hitbox)
    const nodes: Record<string, AnyNode> = {
      [doorId]: { object: 'node', id: doorId, type: 'door' } as unknown as AnyNode,
    }

    const { scene } = prepareSceneForExport(root, nodes)

    const exported = scene.getObjectByProperty('name', doorId) as THREE.Mesh
    expect(exported).toBeDefined()
    // Geometry emptied -> GLTFExporter emits a plain node, no solid block.
    expect(exported.geometry.getAttribute('position')).toBeUndefined()
    // The visible leaf survives as a child.
    const visibleChildren = exported.children.filter((c) => (c as THREE.Mesh).isMesh)
    expect(visibleChildren).toHaveLength(1)
  })

  test('fills undefined slots in an array material so no undefined survives the prune', () => {
    // Multi-material / group geometry where one slot was never assigned:
    // `mesh.material = [validMat, undefined]`. The scalar-null guard doesn't
    // catch this (an array is never `== null`), so the undefined slot used to
    // reach GLTFExporter and crash on `material.isShaderMaterial`.
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    mesh.material = [nodeMaterial(), undefined as unknown as THREE.Material]
    root.add(mesh)

    const { scene } = prepareSceneForExport(root, {})

    const exported = scene.children[0] as THREE.Mesh
    const materials = exported.material as THREE.Material[]
    expect(Array.isArray(materials)).toBe(true)
    expect(materials).toHaveLength(2)
    // No undefined/null slot survives; every slot is a real material.
    expect(materials.every((m) => m != null)).toBe(true)
  })

  test('stamps identity from the scene registry and strips other userData', () => {
    const root = new THREE.Group()
    const doorGroup = new THREE.Group()
    const leaf = new THREE.Group()
    leaf.userData.pascalSwingLeaf = { axis: 'y', openRotationY: Math.PI / 2 }
    leaf.add(meshWithNodeMaterial(nodeMaterial()))
    doorGroup.add(leaf)
    root.add(doorGroup)

    const doorId = 'door_test'
    sceneRegistry.nodes.set(doorId, doorGroup)
    const nodes: Record<string, AnyNode> = {
      [doorId]: {
        object: 'node',
        id: doorId,
        type: 'door',
        name: 'Front door',
      } as unknown as AnyNode,
    }

    const { scene } = prepareSceneForExport(root, nodes)

    const exportedDoor = scene.getObjectByProperty('name', doorId)
    expect(exportedDoor).toBeDefined()
    expect(exportedDoor?.userData).toEqual({
      pascalId: doorId,
      kind: 'door',
      label: 'Front door',
      openable: true,
      clips: ['door_test: open'],
    })

    // The swing-leaf marker must not survive into glTF extras.
    let leafMarkerSurvived = false
    scene.traverse((object) => {
      if (object.userData.pascalSwingLeaf) leafMarkerSurvived = true
    })
    expect(leafMarkerSurvived).toBe(false)
  })

  test('does not flag a door/window openable when no open clip bakes', () => {
    // A cased opening (no swing leaf) / fixed window (no operable sash) builds
    // no movable part, so no clip bakes and the node must not claim openable.
    const root = new THREE.Group()
    const openingGroup = new THREE.Group()
    openingGroup.add(meshWithNodeMaterial(nodeMaterial()))
    root.add(openingGroup)

    const openingId = 'door_opening'
    sceneRegistry.nodes.set(openingId, openingGroup)
    const nodes: Record<string, AnyNode> = {
      [openingId]: {
        object: 'node',
        id: openingId,
        type: 'door',
        name: 'Cased opening',
      } as unknown as AnyNode,
    }

    const { scene, animations } = prepareSceneForExport(root, nodes)

    expect(animations).toHaveLength(0)
    const exported = scene.getObjectByProperty('name', openingId)
    expect(exported?.userData).toEqual({
      pascalId: openingId,
      kind: 'door',
      label: 'Cased opening',
    })
  })

  test('bakes a sliding door into a sampled position clip', () => {
    const root = new THREE.Group()
    const doorGroup = new THREE.Group()
    const activePanel = new THREE.Group()
    activePanel.name = 'door-sliding-active'
    activePanel.add(meshWithNodeMaterial(nodeMaterial()))
    doorGroup.add(activePanel)
    root.add(doorGroup)

    const doorId = 'door_sliding'
    sceneRegistry.nodes.set(doorId, doorGroup)
    const nodes: Record<string, AnyNode> = {
      [doorId]: {
        object: 'node',
        id: doorId,
        type: 'door',
        name: 'Slider',
        doorType: 'sliding',
        slideDirection: 'left',
        width: 1,
        height: 2.1,
        frameThickness: 0.05,
      } as unknown as AnyNode,
    }

    const { scene, animations } = prepareSceneForExport(root, nodes)

    expect(animations).toHaveLength(1)
    const clip = animations[0]!
    expect(clip.name).toBe('door_sliding: open')
    expect(clip.userData).toEqual({ loop: false })

    const track = clip.tracks[0]!
    expect(track).toBeInstanceOf(THREE.VectorKeyframeTrack)
    expect(track.name.endsWith('.position')).toBe(true)
    expect(track.times.length).toBe(17)
    expect(track.times[0]).toBeCloseTo(0)
    expect(track.times[track.times.length - 1]!).toBeCloseTo(1)

    expect(track.values[0]!).toBeCloseTo(0)
    const lastX = track.values[track.values.length - 3]!
    expect(Math.abs(lastX)).toBeGreaterThan(0.1)
    expect(scene.getObjectByProperty('uuid', track.name.replace('.position', ''))).toBeDefined()
  })

  test('bakes an identity rest pose for an open folding door', () => {
    const node = DoorNode.parse({
      id: 'door_folding',
      doorType: 'folding',
      leafCount: 4,
      operationState: 0.65,
    })
    const mesh = buildDoorPreviewMesh(node)
    const root = new THREE.Group()
    root.add(mesh)
    sceneRegistry.nodes.set(node.id, mesh)

    const { scene, animations } = prepareSceneForExport(root, {
      [node.id]: node as unknown as AnyNode,
    })

    expect(animations).toHaveLength(1)
    for (let index = 0; index < 4; index++) {
      const panel = scene.getObjectByName(`door-fold-${index}`)
      expect(panel).toBeDefined()
      expect(panel!.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-4)
    }
  })
})
