import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { getActionMenuAnchor, getActionMenuTargetId } from './action-menu-placement'

function boxFromSize(width: number, height: number, depth: number) {
  return new THREE.Box3(
    new THREE.Vector3(-width / 2, -height / 2, -depth / 2),
    new THREE.Vector3(width / 2, height / 2, depth / 2),
  )
}

describe('getActionMenuAnchor', () => {
  test('keeps compact data labels close to the label center', () => {
    const anchor = getActionMenuAnchor(
      { type: 'data-widget' },
      boxFromSize(1.6, 0.5, 0.08),
      new THREE.Vector3(),
    )

    expect(anchor.y).toBeCloseTo(0.24)
  })

  test('places data chart menus above the full html panel footprint', () => {
    const anchor = getActionMenuAnchor(
      { type: 'data-chart' },
      boxFromSize(1.65, 0.7, 0.08),
      new THREE.Vector3(),
    )

    expect(anchor.y).toBeCloseTo(0.85)
  })

  test('treats card-style data widgets as html panels', () => {
    const anchor = getActionMenuAnchor(
      { type: 'data-widget', widgetType: 'card' },
      boxFromSize(2.8, 1, 0.08),
      new THREE.Vector3(),
    )

    expect(anchor.y).toBeCloseTo(1)
  })
})

describe('getActionMenuTargetId', () => {
  test('anchors a semantic assembly to its declared primary child', () => {
    expect(
      getActionMenuTargetId(
        {
          type: 'assembly',
          children: ['support', 'shell'],
          metadata: { equipmentAssembly: { primarySemanticRole: 'vessel_shell' } },
        },
        {
          support: { metadata: { semanticRole: 'support_roller' } },
          shell: { metadata: { semanticRole: 'vessel_shell' } },
        },
      ),
    ).toBe('shell')
  })

  test('uses a single generated required role when no explicit primary role exists', () => {
    expect(
      getActionMenuTargetId(
        {
          type: 'assembly',
          children: ['rack', 'body'],
          metadata: { sourceArgs: { requiredRoles: ['rebar_body'] } },
        },
        {
          rack: { metadata: { semanticRole: 'support_frame' } },
          body: { metadata: { semanticRole: 'rebar_body' } },
        },
      ),
    ).toBe('body')
  })
})
