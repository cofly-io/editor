import { describe, expect, test } from 'bun:test'
import type { GeneratedGeometryArtifact } from '../../../../packages/editor/src/lib/ai-generated-geometry-core'
import { basicPrimitiveDeterministicRoute } from './primitive-basic-routes'

describe('basicPrimitiveDeterministicRoute', () => {
  test('routes a standalone Chinese sphere request to compose_primitive args', () => {
    const route = basicPrimitiveDeterministicRoute('\u751f\u6210\u4e00\u4e2a\u7403', null)

    expect(route).toMatchObject({
      label: 'sphere',
      kind: 'sphere',
      args: {
        requiredRoles: ['sphere_body'],
      },
    })
    expect(route?.args.shapes).toEqual([
      expect.objectContaining({
        kind: 'sphere',
        semanticRole: 'sphere_body',
        radius: 1,
      }),
    ])
  })

  test('routes a standalone cylinder request', () => {
    const route = basicPrimitiveDeterministicRoute('generate a cylinder', null)

    expect(route).toMatchObject({
      label: 'cylinder',
      kind: 'cylinder',
      args: {
        requiredRoles: ['cylinder_body'],
      },
    })
  })

  test.each(['\u751f\u6210\u4e00\u4e2a\u5706\u76d8', 'generate a disk', '\u5706\u5f62\u677f'])(
    'routes %s to a thin disk primitive',
    (prompt) => {
      const route = basicPrimitiveDeterministicRoute(prompt, null)

      expect(route).toMatchObject({
        label: 'disk',
        kind: 'disk',
        args: { requiredRoles: ['disk_body'] },
      })
      expect(route?.args.shapes).toEqual([
        expect.objectContaining({ kind: 'disk', radius: 0.75, thickness: 0.05 }),
      ])
    },
  )

  test('routes a standalone Chinese cube request to an equal-sided box', () => {
    const route = basicPrimitiveDeterministicRoute('\u751f\u6210\u4e00\u4e2a\u6b63\u65b9\u4f53', null)

    expect(route).toMatchObject({
      label: 'box',
      kind: 'box',
      args: { requiredRoles: ['box_body'] },
    })
    expect(route?.args.shapes).toEqual([
      expect.objectContaining({
        kind: 'box',
        length: 1.2,
        width: 1.2,
        height: 1.2,
      }),
    ])
  })

  test.each(['\u751f\u6210\u4e00\u4e2a\u957f\u65b9\u4f53', 'generate a cuboid', 'create a rectangular prism'])(
    'routes %s to one non-cubic box',
    (prompt) => {
      const route = basicPrimitiveDeterministicRoute(prompt, null)

      expect(route).toMatchObject({
        label: 'cuboid',
        kind: 'box',
        args: { requiredRoles: ['box_body'] },
      })
      expect(route?.args.shapes).toEqual([
        expect.objectContaining({
          kind: 'box',
          length: 1.8,
          width: 1.2,
          height: 0.8,
        }),
      ])
    },
  )

  test('does not route when editing an existing artifact', () => {
    const revisionTarget = { id: 'existing' } as GeneratedGeometryArtifact

    expect(basicPrimitiveDeterministicRoute('sphere', revisionTarget)).toBeUndefined()
  })

  test('still routes explicit new Chinese primitive requests when an older artifact exists', () => {
    const revisionTarget = { id: 'existing' } as GeneratedGeometryArtifact
    const route = basicPrimitiveDeterministicRoute('\u751f\u6210\u4e00\u4e2a\u7403', revisionTarget)

    expect(route).toMatchObject({
      label: 'sphere',
      kind: 'sphere',
    })
  })

  test('keeps bare primitive words conservative when an older artifact exists', () => {
    const revisionTarget = { id: 'existing' } as GeneratedGeometryArtifact

    expect(basicPrimitiveDeterministicRoute('\u7403', revisionTarget)).toBeUndefined()
  })
})
