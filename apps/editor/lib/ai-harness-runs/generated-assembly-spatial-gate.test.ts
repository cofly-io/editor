import { describe, expect, it } from 'bun:test'
import type { AssemblyIR } from '@pascal-app/core/lib/generated-assembly-ir'
import { LAPTOP_DSL_SOURCE } from './fixtures/laptop.dsl'
import { localEnvelope, reviewAssemblySpatial } from './generated-assembly-spatial-gate'
import { compileDsl } from './generated-geometry-dsl-compiler'

type Part = AssemblyIR['parts'][number]

function makePart(overrides: Partial<Part> & { id: string }): Part {
  return {
    transform: {
      space: 'world' as const,
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    geometry: {
      kind: 'primitive-recipe' as const,
      recipeId: 'primitive.box',
      params: { length: 1, width: 1, height: 1 },
    },
    material: {},
    fingerprint: `fp-${overrides.id}`,
    ...overrides,
  } as Part
}

function makeIR(parts: Part[], extra: Partial<AssemblyIR> = {}): AssemblyIR {
  return {
    schemaVersion: 1,
    generator: { sourceHash: 'src', apiVersion: '1.0.0', paramsHash: 'prm' },
    parts,
    constraints: [],
    ...extra,
  }
}

describe('reviewAssemblySpatial — laptop fixture (acceptance)', () => {
  it('compiled laptop IR passes the gate: no duplicate keys, lid rotated, screen in hierarchy', () => {
    const result = compileDsl(LAPTOP_DSL_SOURCE)
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(result.ir).toBeDefined()
    const review = reviewAssemblySpatial(result.ir!)
    expect(review.issues).toEqual([])
    expect(review.passed).toBe(true)
  })

  it('rejects a laptop where all 60 keys collapse to one position (stage-1 deferred case)', () => {
    const result = compileDsl(LAPTOP_DSL_SOURCE)
    const ir = result.ir!
    const collapsed: AssemblyIR = {
      ...ir,
      parts: ir.parts.map((p) =>
        p.id.startsWith('keyboard.key.')
          ? { ...p, transform: { ...p.transform, position: [0, 0.024, 0] } }
          : p,
      ),
    }
    const review = reviewAssemblySpatial(collapsed)
    expect(review.passed).toBe(false)
    expect(review.issues.some((i) => i.startsWith('gate_duplicate_position'))).toBe(true)
  })

  it('rejects a laptop whose lid is flat (zero hinge angle)', () => {
    const result = compileDsl(LAPTOP_DSL_SOURCE)
    const ir = result.ir!
    const flat: AssemblyIR = {
      ...ir,
      parts: ir.parts.map((p) =>
        p.id === 'laptop.lid' ? { ...p, transform: { ...p.transform, rotation: [0, 0, 0, 1] } } : p,
      ),
    }
    const review = reviewAssemblySpatial(flat)
    expect(review.passed).toBe(false)
    expect(review.issues.some((i) => i.startsWith('gate_hinge_zero_angle'))).toBe(true)
  })
})

describe('reviewAssemblySpatial — individual checks', () => {
  it('duplicate positions only fire for identical geometry', () => {
    const ir = makeIR([
      makePart({
        id: 'a',
        transform: {
          space: 'world',
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
      makePart({
        id: 'b',
        transform: {
          space: 'world',
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
      makePart({
        id: 'c',
        geometry: { kind: 'primitive-recipe', recipeId: 'primitive.sphere', params: { radius: 2 } },
        transform: {
          space: 'world',
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
    ])
    const review = reviewAssemblySpatial(ir)
    const dupIssues = review.issues.filter((i) => i.startsWith('gate_duplicate_position'))
    // a+b same geometry same position → 1 group issue; c is different geometry → not counted with them
    expect(dupIssues).toHaveLength(1)
    expect(dupIssues[0]).toContain('a')
    expect(dupIssues[0]).toContain('b')
  })

  it('unreasonable bounds are flagged', () => {
    const ir = makeIR([
      makePart({
        id: 'huge',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.box',
          params: { length: 1000, width: 1, height: 1 },
        },
      }),
    ])
    const review = reviewAssemblySpatial(ir)
    expect(review.issues.some((i) => i.startsWith('gate_bounds_unreasonable'))).toBe(true)
  })

  it('partId family gaps produce warnings, not errors', () => {
    const ir = makeIR([
      makePart({ id: 'grid.cell.r0' }),
      makePart({ id: 'grid.cell.r1' }),
      makePart({ id: 'grid.cell.r2' }),
      makePart({ id: 'grid.cell.r4' }),
    ])
    const review = reviewAssemblySpatial(ir)
    expect(review.warnings.some((w) => w.startsWith('gate_part_id_gap'))).toBe(true)
  })

  it('heavy overlap between unrelated parts is an issue; parent-child overlap is not', () => {
    const ir = makeIR([
      makePart({ id: 'base' }),
      makePart({
        id: 'screen',
        parentId: 'base',
        transform: {
          space: 'local',
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
      makePart({ id: 'intruder' }),
    ])
    const review = reviewAssemblySpatial(ir)
    const overlaps = review.issues.filter((i) => i.startsWith('gate_part_overlap'))
    // base∩screen skipped (parent-child); base∩intruder and screen∩intruder reported
    expect(overlaps.length).toBeGreaterThan(0)
    expect(overlaps.every((i) => !(i.includes('"base"') && i.includes('"screen"')))).toBe(true)
  })

  it('allows enclosure bodies to contain refrigerator shelves or cavities', () => {
    const ir = makeIR([
      makePart({
        id: 'refrigerator.cabinet',
        semanticRole: 'cabinet_body',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.box',
          params: { length: 1.2, width: 0.7, height: 2 },
        },
      }),
      makePart({
        id: 'refrigerator.cavity',
        semanticRole: 'interior_cavity',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.box',
          params: { length: 1.05, width: 0.55, height: 1.6 },
        },
      }),
      makePart({
        id: 'fridge.shelf.r0',
        semanticRole: 'interior_shelf',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.box',
          params: { length: 1, width: 0.5, height: 0.04 },
        },
        transform: {
          space: 'world',
          position: [0, 0.2, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
    ])
    const review = reviewAssemblySpatial(ir)
    expect(review.issues.filter((i) => i.startsWith('gate_part_overlap'))).toEqual([])
    expect(review.passed).toBe(true)
  })

  it('allows refrigerator shelves to overlap interior cavity volume markers', () => {
    const ir = makeIR([
      makePart({
        id: 'fridge.inner_cavity',
        semanticRole: 'interior_cavity',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.box',
          params: { length: 1.05, width: 0.55, height: 1.6 },
        },
      }),
      makePart({
        id: 'fridge.shelf.r1',
        semanticRole: 'interior_shelf',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.box',
          params: { length: 1, width: 0.5, height: 0.04 },
        },
        transform: {
          space: 'world',
          position: [0, 0.2, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
    ])
    const review = reviewAssemblySpatial(ir)
    expect(review.issues.filter((i) => i.startsWith('gate_part_overlap'))).toEqual([])
    expect(review.passed).toBe(true)
  })

  it('allows refrigerator handles and hinges to partially penetrate their host surface', () => {
    const ir = makeIR([
      makePart({
        id: 'fridge.body',
        semanticRole: 'cabinet_body',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.box',
          params: { length: 1.2, width: 0.7, height: 2 },
        },
      }),
      makePart({
        id: 'fridge.door.left.handle',
        semanticRole: 'door_handle',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.box',
          params: { length: 0.06, width: 0.08, height: 1.1 },
        },
        transform: {
          space: 'world',
          position: [0.25, 0, 0.34],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
      makePart({
        id: 'fridge.door.left.hinge.r0',
        semanticRole: 'door_hinge',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.cylinder',
          params: { radius: 0.025, height: 0.2 },
        },
        transform: {
          space: 'world',
          position: [-0.58, 0.6, 0.34],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      }),
    ])
    const review = reviewAssemblySpatial(ir)
    expect(review.issues.filter((i) => i.startsWith('gate_part_overlap'))).toEqual([])
    expect(review.passed).toBe(true)
  })

  it('allows refrigerator feet to overlap the cabinet body as support attachments', () => {
    const ir = makeIR([
      makePart({
        id: 'refrigerator.body',
        semanticRole: 'refrigerator_body',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.box',
          params: { length: 0.9, width: 0.7, height: 1.8 },
        },
      }),
      makePart({
        id: 'refrigerator.foot.backLeft',
        semanticRole: 'support_foot',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.box',
          params: { length: 0.08, width: 0.08, height: 0.1 },
        },
      }),
    ])
    const review = reviewAssemblySpatial(ir)
    expect(review.issues.filter((i) => i.startsWith('gate_part_overlap'))).toEqual([])
    expect(review.passed).toBe(true)
  })

  it('allows hinged refrigerator doors to overlap their cabinet anchor AABB', () => {
    const ir = makeIR(
      [
        makePart({
          id: 'fridge.body',
          semanticRole: 'cabinet_body',
          geometry: {
            kind: 'primitive-recipe',
            recipeId: 'primitive.box',
            params: { length: 1.2, width: 0.7, height: 2 },
          },
        }),
        makePart({
          id: 'fridge.leftDoor',
          semanticRole: 'left_hinged_door',
          geometry: {
            kind: 'primitive-recipe',
            recipeId: 'primitive.box',
            params: { length: 0.58, width: 0.08, height: 1.8 },
          },
          transform: {
            space: 'world',
            position: [-0.28, 0, 0.34],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        }),
      ],
      {
        constraints: [
          {
            kind: 'hinge',
            partId: 'fridge.leftDoor',
            anchorPartId: 'fridge.body',
            axisLocal: [0, 1, 0],
            pivotLocal: [-0.58, 0, 0.36],
            restAngle: Math.PI / 3,
          },
        ],
      },
    )
    const review = reviewAssemblySpatial(ir)
    expect(review.issues.filter((i) => i.startsWith('gate_part_overlap'))).toEqual([])
  })

  it('allows opposing hinged refrigerator doors on the same cabinet to overlap in projected AABB', () => {
    const ir = makeIR(
      [
        makePart({
          id: 'fridge.body',
          semanticRole: 'cabinet_body',
          geometry: {
            kind: 'primitive-recipe',
            recipeId: 'primitive.box',
            params: { length: 1.2, width: 0.7, height: 2 },
          },
        }),
        makePart({
          id: 'fridge.door.left',
          semanticRole: 'left_hinged_door',
          geometry: {
            kind: 'primitive-recipe',
            recipeId: 'primitive.box',
            params: { length: 0.58, width: 0.08, height: 1.8 },
          },
          transform: {
            space: 'world',
            position: [0, 0, 0.38],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        }),
        makePart({
          id: 'fridge.door.right',
          semanticRole: 'right_hinged_door',
          geometry: {
            kind: 'primitive-recipe',
            recipeId: 'primitive.box',
            params: { length: 0.58, width: 0.08, height: 1.8 },
          },
          transform: {
            space: 'world',
            position: [0.02, 0, 0.38],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        }),
      ],
      {
        constraints: [
          {
            kind: 'hinge',
            partId: 'fridge.door.left',
            anchorPartId: 'fridge.body',
            axisLocal: [0, 1, 0],
            pivotLocal: [-0.58, 0, 0.36],
            restAngle: Math.PI / 4,
          },
          {
            kind: 'hinge',
            partId: 'fridge.door.right',
            anchorPartId: 'fridge.body',
            axisLocal: [0, 1, 0],
            pivotLocal: [0.58, 0, 0.36],
            restAngle: -Math.PI / 4,
          },
        ],
      },
    )
    const review = reviewAssemblySpatial(ir)
    expect(review.issues.filter((i) => i.startsWith('gate_part_overlap'))).toEqual([])
  })

  it('allows descendants of opposing hinged refrigerator doors to overlap in projected AABB', () => {
    const ir = makeIR(
      [
        makePart({
          id: 'fridge.body',
          semanticRole: 'cabinet_body',
          geometry: {
            kind: 'primitive-recipe',
            recipeId: 'primitive.box',
            params: { length: 1.2, width: 0.7, height: 2 },
          },
        }),
        makePart({
          id: 'fridge.left_door',
          semanticRole: 'left_hinged_door',
          geometry: {
            kind: 'primitive-recipe',
            recipeId: 'primitive.box',
            params: { length: 0.58, width: 0.08, height: 1.8 },
          },
          transform: {
            space: 'world',
            position: [-0.02, 0, 0.38],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        }),
        makePart({
          id: 'fridge.right_door',
          semanticRole: 'right_hinged_door',
          geometry: {
            kind: 'primitive-recipe',
            recipeId: 'primitive.box',
            params: { length: 0.58, width: 0.08, height: 1.8 },
          },
          transform: {
            space: 'world',
            position: [0.02, 0, 0.38],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        }),
        makePart({
          id: 'fridge.left_door.shelf.2',
          parentId: 'fridge.left_door',
          semanticRole: 'left_door_shelf',
          geometry: {
            kind: 'primitive-recipe',
            recipeId: 'primitive.box',
            params: { length: 0.48, width: 0.05, height: 0.04 },
          },
          transform: {
            space: 'local',
            position: [0, 0.4, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        }),
        makePart({
          id: 'fridge.right_door.shelf.2',
          parentId: 'fridge.right_door',
          semanticRole: 'right_door_shelf',
          geometry: {
            kind: 'primitive-recipe',
            recipeId: 'primitive.box',
            params: { length: 0.48, width: 0.05, height: 0.04 },
          },
          transform: {
            space: 'local',
            position: [0, 0.4, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
        }),
      ],
      {
        constraints: [
          {
            kind: 'hinge',
            partId: 'fridge.left_door',
            anchorPartId: 'fridge.body',
            axisLocal: [0, 1, 0],
            pivotLocal: [-0.58, 0, 0.36],
            restAngle: Math.PI / 4,
          },
          {
            kind: 'hinge',
            partId: 'fridge.right_door',
            anchorPartId: 'fridge.body',
            axisLocal: [0, 1, 0],
            pivotLocal: [0.58, 0, 0.36],
            restAngle: -Math.PI / 4,
          },
        ],
      },
    )
    const review = reviewAssemblySpatial(ir)
    expect(review.issues.filter((i) => i.startsWith('gate_part_overlap'))).toEqual([])
  })

  it('dangling connected port is an issue; unconnected port is not', () => {
    const part = makePart({
      id: 'tank',
      geometry: {
        kind: 'primitive-recipe',
        recipeId: 'primitive.cylinder',
        params: { radius: 1, height: 2 },
      },
      transform: { space: 'world', position: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    })
    const ir = makeIR([part], {
      ports: [
        { id: 'tank.feed', partId: 'tank', medium: 'oil', side: 'left', height: 10 },
        { id: 'tank.vent', partId: 'tank', medium: 'air', side: 'top', height: 10 },
      ],
      connections: [
        // fromPort === toPort would fail IR validation as a self-loop, but
        // the spatial gate only cares that 'tank.feed' is referenced by a
        // connection and floats 8m above the tank envelope.
        { id: 'c1', fromPort: 'tank.feed', toPort: 'tank.feed', medium: 'oil' },
      ],
    })
    const review = reviewAssemblySpatial(ir)
    const dangling = review.issues.filter((i) => i.startsWith('gate_port_not_dangling'))
    expect(dangling).toHaveLength(1)
    expect(dangling[0]).toContain('tank.feed')
  })

  it('hinge pivot far outside the anchor envelope warns', () => {
    const anchor = makePart({ id: 'frame' })
    const door = makePart({
      id: 'door',
      transform: {
        space: 'world',
        position: [0, 0, 0],
        rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
        scale: [1, 1, 1],
      },
    })
    const ir = makeIR([anchor, door], {
      constraints: [
        {
          kind: 'hinge',
          partId: 'door',
          anchorPartId: 'frame',
          axisLocal: [1, 0, 0],
          pivotLocal: [50, 0, 0],
          restAngle: Math.PI / 2,
        },
      ],
    })
    const review = reviewAssemblySpatial(ir)
    expect(review.warnings.some((w) => w.startsWith('gate_hinge_pivot_outside_anchor'))).toBe(true)
    // but the rotated door should NOT trip the zero-angle check
    expect(review.issues.some((i) => i.startsWith('gate_hinge_zero_angle'))).toBe(false)
  })
})

describe('localEnvelope centering conventions', () => {
  it('box envelope matches renderer centering (position = bbox center)', () => {
    const env = localEnvelope(
      makePart({
        id: 'b',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.box',
          params: { length: 2, width: 4, height: 6 },
        },
      }),
    )
    expect(env).toEqual({ min: [-1, -3, -2], max: [1, 3, 2] })
  })

  it('lathe envelope is vertically centered like the renderer', () => {
    const env = localEnvelope(
      makePart({
        id: 'l',
        geometry: {
          kind: 'primitive-recipe',
          recipeId: 'primitive.lathe',
          params: {
            profile: [
              [0, 0],
              [0.5, 1],
            ],
          },
        },
      }),
    )
    expect(env.min[1]).toBeCloseTo(-0.5, 5)
    expect(env.max[1]).toBeCloseTo(0.5, 5)
    expect(env.max[0]).toBeCloseTo(0.5, 5)
  })
})
