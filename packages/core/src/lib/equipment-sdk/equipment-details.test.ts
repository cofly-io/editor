import { describe, expect, test } from 'bun:test'
import {
  addBoltCircle,
  addCouplingRing,
  addFlangeBolts,
  addHorizontalSeams,
  addRustStains,
  addSaddleBolts,
} from './equipment-details'

describe('equipment-details', () => {
  test('addHorizontalSeams creates torus rings around a cylindrical body', () => {
    const seams = addHorizontalSeams('vessel', [0, 5, 0], 1.2, 10, 3)
    expect(seams.length).toBe(3)
    for (const s of seams) {
      expect(s.kind).toBe('torus')
      expect(s.semanticRole).toBe('weld_seam')
      expect(s.material).toBe('dark_fastener')
    }
    // Verify first seam is at the right height
    expect(seams[0].position[1]).toBeCloseTo(2.5) // 5 - 5 + 2.5*1
  })

  test('addRustStains creates surface stain planes on a vessel body', () => {
    const stains = addRustStains('vessel', [0, 5, 0], 0.6, 10, 3)
    expect(stains.length).toBe(3)
    for (const s of stains) {
      expect(s.kind).toBe('box')
      expect(s.semanticRole).toBe('surface_stain')
      expect(s.material).toBe('cast_iron')
    }
  })

  test('addBoltCircle creates equally-spaced bolt head cylinders', () => {
    const bolts = addBoltCircle('flange', [0, 0, 0], 8, 0.5)
    expect(bolts.length).toBe(8)
    for (const b of bolts) {
      expect(b.kind).toBe('cylinder')
      expect(b.semanticRole).toBe('bolt_head')
      expect(b.material).toBe('dark_fastener')
    }
    // Verify bolts are distributed around the circle
    const angles = bolts.map((b) => {
      const dx = b.position[0]
      const dz = b.position[2]
      return Math.atan2(dz, dx)
    })
    for (let i = 0; i < 7; i++) {
      const delta = (angles[i + 1] - angles[i] + Math.PI * 3) % (Math.PI * 2)
      expect(delta).toBeCloseTo((Math.PI * 2) / 8, 0)
    }
  })

  test('addFlangeBolts creates stainless steel bolt pairs on both flange faces', () => {
    const bolts = addFlangeBolts('flange_port', [0, 1, 0], 0.3)
    expect(bolts.length).toBeGreaterThanOrEqual(6)
    for (const b of bolts) {
      expect(b.semanticRole).toBe('bolt_head')
      expect(b.material).toBe('stainless_steel')
    }
  })

  test('addSaddleBolts creates bolt details at saddle base plate corners', () => {
    const bolts = addSaddleBolts('saddle', [0, 0.1, 0], 0.5, 0.3)
    expect(bolts.length).toBe(4) // 2x X 2x Z
    for (const b of bolts) {
      expect(b.semanticRole).toBe('bolt_head')
      expect(b.material).toBe('dark_fastener')
    }
  })

  test('addCouplingRing creates a contrasting joint ring', () => {
    const ring = addCouplingRing('motor', [2, 0.5, 0], 0.3, 'z')
    expect(ring.semanticRole).toBe('coupling_joint')
    expect(ring.material).toBe('cast_iron')
    expect(ring.kind).toBe('cylinder')
  })

  test('detailed vessel includes seams and stains', () => {
    const seams = addHorizontalSeams('tank', [0, 4, 0], 2, 8)
    const stains = addRustStains('tank', [0, 4, 0], 1, 8, 2)
    const bolts = addBoltCircle('tank.manway', [0, 6, -1.05], 8, 0.35)

    expect(seams.length).toBeGreaterThan(1)
    expect(stains.length).toBe(2)
    expect(bolts.length).toBe(8)
    // All detail parts have meaningful semantic roles
    const allRoles = [
      ...seams.map((s) => s.semanticRole),
      ...stains.map((s) => s.semanticRole),
      ...bolts.map((b) => b.semanticRole),
    ]
    for (const role of allRoles) {
      expect(role).toBeDefined()
      expect(role.length).toBeGreaterThan(0)
    }
  })
})
