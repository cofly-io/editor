import type { GeneratedGeometryArtifact } from '../../../../packages/editor/src/lib/ai-generated-geometry-core'

type BasicPrimitiveKind = 'sphere' | 'box' | 'cylinder'

export type BasicPrimitiveDeterministicRoute = {
  label: string
  kind: BasicPrimitiveKind
  args: Record<string, unknown>
}

const BASIC_MATERIAL = {
  properties: { color: '#cccccc', roughness: 0.5, metalness: 0.1 },
}

function createBasicPrimitiveRoute(
  kind: BasicPrimitiveKind,
  label: string,
): BasicPrimitiveDeterministicRoute {
  const semanticRole =
    kind === 'sphere' ? 'sphere_body' : kind === 'cylinder' ? 'cylinder_body' : 'box_body'
  return {
    label,
    kind,
    args: {
      shapes:
        kind === 'sphere'
          ? [
              {
                id: 'sphere_1',
                kind: 'sphere',
                semanticRole,
                radius: 1,
                material: BASIC_MATERIAL,
              },
            ]
          : kind === 'cylinder'
            ? [
                {
                  id: 'cylinder_1',
                  kind: 'cylinder',
                  semanticRole,
                  radius: 0.6,
                  height: 1.4,
                  axis: 'y',
                  material: BASIC_MATERIAL,
                },
              ]
            : [
                {
                  id: 'box_1',
                  kind: 'box',
                  semanticRole,
                  length: 1.2,
                  width: 1.2,
                  height: 1.2,
                  material: BASIC_MATERIAL,
                },
              ],
      geometryBrief: `A basic ${label} shape with default dimensions and neutral gray material.`,
      requiredRoles: [semanticRole],
    },
  }
}

function normalizeBasicPrimitivePrompt(userPrompt: string) {
  return userPrompt
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:\uFF0C\u3002\uFF01\uFF1F\uFF1B\uFF1A\u3001\s]+/g, '')
    .replace(/^(please)?(create|generate|make|build|model|draw)(a|an|one|1)?/, '')
    .replace(
      /^(\u8bf7)?(\u751f\u6210|\u521b\u5efa|\u5236\u4f5c|\u505a|\u642d\u5efa|\u5efa\u6a21|\u753b)(\u4e00\u4e2a|\u4e00\u9897|1\u4e2a)?/,
      '',
    )
}

export function basicPrimitiveDeterministicRoute(
  userPrompt: string,
  revisionTarget: GeneratedGeometryArtifact | null,
): BasicPrimitiveDeterministicRoute | undefined {
  if (revisionTarget) return undefined
  const normalized = normalizeBasicPrimitivePrompt(userPrompt)

  if (/^(sphere|ball|\u7403|\u7403\u4f53|\u5706\u7403)$/.test(normalized)) {
    return createBasicPrimitiveRoute('sphere', 'sphere')
  }
  if (/^(cube|box|\u7acb\u65b9\u4f53|\u65b9\u5757|\u7bb1\u4f53)$/.test(normalized)) {
    return createBasicPrimitiveRoute('box', 'box')
  }
  if (/^(cylinder|\u5706\u67f1|\u5706\u67f1\u4f53)$/.test(normalized)) {
    return createBasicPrimitiveRoute('cylinder', 'cylinder')
  }
  return undefined
}
