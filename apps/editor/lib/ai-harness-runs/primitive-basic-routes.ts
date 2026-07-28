import type { GeneratedGeometryArtifact } from '../../../../packages/editor/src/lib/ai-generated-geometry-core'

type BasicPrimitiveKind =
  | 'sphere'
  | 'box'
  | 'cylinder'
  | 'disk'
  | 'cone'
  | 'frustum'
  | 'hemisphere'
  | 'torus'
  | 'capsule'
  | 'half-cylinder'
  | 'wedge'
  | 'trapezoid-prism'
  | 'ellipsoid'
  | 'ellipse-panel'
  | 'pyramid'

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
  shape: Record<string, unknown>,
): BasicPrimitiveDeterministicRoute {
  return {
    label,
    kind,
    args: {
      shapes: [
        {
          id: `${kind}_1`,
          kind,
          semanticRole: `${kind.replace(/-/g, '_')}_body`,
          ...shape,
          material: BASIC_MATERIAL,
        },
      ],
      geometryBrief: `A basic ${label} shape with default dimensions and neutral gray material.`,
      requiredRoles: [`${kind.replace(/-/g, '_')}_body`],
    },
  }
}

const BASIC_PRIMITIVE_ROUTES: Array<{
  match: RegExp
  kind: BasicPrimitiveKind
  label: string
  shape: Record<string, unknown>
}> = [
  { match: /^(sphere|ball|\u7403|\u7403\u4f53|\u5706\u7403)$/, kind: 'sphere', label: 'sphere', shape: { radius: 1 } },
  { match: /^(cube|box|\u7acb\u65b9\u4f53|\u6b63\u65b9\u4f53|\u65b9\u5757|\u7bb1\u4f53)$/, kind: 'box', label: 'box', shape: { length: 1.2, width: 1.2, height: 1.2 } },
  { match: /^(cuboid|rectangularprism|\u957f\u65b9\u4f53)$/, kind: 'box', label: 'cuboid', shape: { length: 1.8, width: 1.2, height: 0.8 } },
  { match: /^(cylinder|\u5706\u67f1|\u5706\u67f1\u4f53)$/, kind: 'cylinder', label: 'cylinder', shape: { radius: 0.6, height: 1.4, axis: 'y' } },
  { match: /^(disk|disc|circle|\u5706\u76d8|\u5706\u7247|\u5706\u997c|\u5706\u76d8\u5f62|\u5706\u5f62\u677f)$/, kind: 'disk', label: 'disk', shape: { radius: 0.75, thickness: 0.05, axis: 'y', radialSegments: 48 } },
  { match: /^(cone|\u5706\u9525|\u5706\u9525\u4f53)$/, kind: 'cone', label: 'cone', shape: { radius: 0.6, height: 1.2, axis: 'y' } },
  { match: /^(frustum|truncatedcone|\u5706\u53f0)$/, kind: 'frustum', label: 'frustum', shape: { radiusBottom: 0.6, radiusTop: 0.35, height: 1.2, axis: 'y' } },
  { match: /^(hemisphere|dome|\u534a\u7403|\u7a79\u9876)$/, kind: 'hemisphere', label: 'hemisphere', shape: { radius: 0.75, axis: 'y' } },
  { match: /^(torus|ring|donut|\u5706\u73af|\u751c\u751c\u5708)$/, kind: 'torus', label: 'torus', shape: { majorRadius: 0.6, tubeRadius: 0.1, axis: 'y' } },
  { match: /^(capsule|pill|\u80f6\u56ca)$/, kind: 'capsule', label: 'capsule', shape: { radius: 0.35, height: 1.4, axis: 'y' } },
  { match: /^(half-cylinder|semicylinder|\u534a\u5706\u67f1)$/, kind: 'half-cylinder', label: 'half-cylinder', shape: { radius: 0.6, height: 1.2, axis: 'y' } },
  { match: /^(wedge|ramp|\u659c\u5761|\u6954\u5f62)$/, kind: 'wedge', label: 'wedge', shape: { length: 1.4, width: 1, height: 0.7, slopeAxis: 'z', slopeDirection: 'positive' } },
  { match: /^(trapezoid|trapezoid-prism|\u68af\u5f62\u67f1)$/, kind: 'trapezoid-prism', label: 'trapezoid-prism', shape: { length: 1.4, width: 1, height: 0.8, topLengthScale: 0.65, topWidthScale: 0.8 } },
  { match: /^(ellipsoid|oval|\u692d\u5706\u4f53)$/, kind: 'ellipsoid', label: 'ellipsoid', shape: { length: 1.6, width: 1.1, height: 0.8 } },
  { match: /^(ellipse-panel|oval-panel|\u692d\u5706\u677f)$/, kind: 'ellipse-panel', label: 'ellipse-panel', shape: { length: 1.4, width: 0.9, thickness: 0.04 } },
  { match: /^(pyramid|\u91d1\u5b57\u5854)$/, kind: 'pyramid', label: 'pyramid', shape: { radius: 0.75, height: 1.2 } },
]

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

function isExplicitCreatePrompt(userPrompt: string) {
  const text = userPrompt.trim().toLowerCase()
  return /^(please\s*)?(create|generate|make|build|model|draw)\b/i.test(text) ||
    /^(\u8bf7)?(\u751f\u6210|\u521b\u5efa|\u5236\u4f5c|\u505a|\u642d\u5efa|\u5efa\u6a21|\u753b)/.test(text)
}

export function basicPrimitiveDeterministicRoute(
  userPrompt: string,
  revisionTarget: GeneratedGeometryArtifact | null,
): BasicPrimitiveDeterministicRoute | undefined {
  if (revisionTarget && !isExplicitCreatePrompt(userPrompt)) return undefined
  const normalized = normalizeBasicPrimitivePrompt(userPrompt)

  const route = BASIC_PRIMITIVE_ROUTES.find((candidate) => candidate.match.test(normalized))
  return route && createBasicPrimitiveRoute(route.kind, route.label, route.shape)
}
