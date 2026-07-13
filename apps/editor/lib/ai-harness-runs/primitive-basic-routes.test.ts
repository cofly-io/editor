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

  test('does not route when editing an existing artifact', () => {
    const revisionTarget = { id: 'existing' } as GeneratedGeometryArtifact

    expect(basicPrimitiveDeterministicRoute('generate a sphere', revisionTarget)).toBeUndefined()
  })
})
