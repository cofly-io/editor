import type { PrimitiveMaterialInput } from '@pascal-app/core/lib/primitive-compose'
import { MATERIAL_PRESETS, type RawGeometryToolShape } from './ai-geometry-tool-constants'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function colorArrayToHex(color: number[]): string {
  return `#${color
    .slice(0, 3)
    .map((channel) =>
      Math.round(Math.max(0, Math.min(1, Number(channel))) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

export function normalizePrimitiveMaterial(
  rawMaterial: unknown,
  materialColor: unknown,
  color: number[] | undefined,
): PrimitiveMaterialInput | undefined {
  if (typeof rawMaterial === 'string') {
    if (/^(#|rgb\(|rgba\(|hsl\(|hsla\()/i.test(rawMaterial))
      return { properties: { color: rawMaterial } }
    if (MATERIAL_PRESETS.has(rawMaterial)) return { preset: rawMaterial }
  }

  if (isRecord(rawMaterial)) {
    const rawProperties = isRecord(rawMaterial.properties) ? rawMaterial.properties : {}
    const rawColor = rawMaterial.color ?? rawProperties.color
    const rawRoughness = rawMaterial.roughness ?? rawProperties.roughness
    const rawMetalness = rawMaterial.metalness ?? rawProperties.metalness
    const rawOpacity = rawMaterial.opacity ?? rawProperties.opacity
    const rawTransparent = rawMaterial.transparent ?? rawProperties.transparent
    const rawSide = rawMaterial.side ?? rawProperties.side
    const gradient = normalizePrimitiveMaterialGradient(rawMaterial.gradient)
    const properties: NonNullable<PrimitiveMaterialInput['properties']> = {}

    if (typeof rawColor === 'string') properties.color = rawColor
    if (typeof rawRoughness === 'number' && Number.isFinite(rawRoughness)) {
      properties.roughness = Math.max(0, Math.min(1, rawRoughness))
    }
    if (typeof rawMetalness === 'number' && Number.isFinite(rawMetalness)) {
      properties.metalness = Math.max(0, Math.min(1, rawMetalness))
    }
    if (typeof rawOpacity === 'number' && Number.isFinite(rawOpacity)) {
      properties.opacity = Math.max(0, Math.min(1, rawOpacity))
    }
    if (typeof rawTransparent === 'boolean') properties.transparent = rawTransparent
    if (rawSide === 'front' || rawSide === 'back' || rawSide === 'double') properties.side = rawSide

    const material: PrimitiveMaterialInput = {}
    if (typeof rawMaterial.id === 'string') material.id = rawMaterial.id
    if (typeof rawMaterial.preset === 'string' && MATERIAL_PRESETS.has(rawMaterial.preset)) {
      material.preset = rawMaterial.preset
    }
    if (Object.keys(properties).length > 0) material.properties = properties
    if (gradient) material.gradient = gradient
    if (material.id || material.preset || material.properties || material.gradient) return material
  }

  if (typeof materialColor === 'string') return { properties: { color: materialColor } }
  if (color?.length) {
    return {
      properties: {
        color: colorArrayToHex(color),
        opacity: typeof color[3] === 'number' ? color[3] : 1,
        transparent: typeof color[3] === 'number' ? color[3] < 1 : false,
      },
    }
  }

  return undefined
}

function normalizePrimitiveMaterialGradient(
  value: unknown,
): PrimitiveMaterialInput['gradient'] | undefined {
  if (!isRecord(value)) return undefined
  const rawStops = Array.isArray(value.stops) ? value.stops : []
  const stops = rawStops.flatMap((rawStop) => {
    if (!isRecord(rawStop)) return []
    const offset =
      typeof rawStop.offset === 'number' && Number.isFinite(rawStop.offset)
        ? Math.max(0, Math.min(1, rawStop.offset))
        : undefined
    const color = typeof rawStop.color === 'string' ? rawStop.color : undefined
    const opacity =
      typeof rawStop.opacity === 'number' && Number.isFinite(rawStop.opacity)
        ? Math.max(0, Math.min(1, rawStop.opacity))
        : 1
    return offset != null && color ? [{ offset, color, opacity }] : []
  })

  if (stops.length < 2) return undefined

  const space =
    value.space === 'local' || value.space === 'world' || value.space === 'uv' ? value.space : 'uv'
  const axis = value.axis === 'x' || value.axis === 'y' || value.axis === 'z' ? value.axis : 'y'

  return {
    type: 'linear',
    space,
    axis,
    angle: typeof value.angle === 'number' && Number.isFinite(value.angle) ? value.angle : 0,
    stops: stops.slice(0, 8).sort((a, b) => a.offset - b.offset),
  }
}

function containsGlassText(value: unknown): boolean {
  return typeof value === 'string' && /glass|glazing|window|玻璃|透明/i.test(value)
}

export function shouldApplyGlassMaterial(
  shape: RawGeometryToolShape,
  kind: string,
  material: PrimitiveMaterialInput | undefined,
  materialPreset: unknown,
  prompt: string | undefined,
  expandedShapeCount: number,
): boolean {
  if (material?.preset === 'glass') return true
  if (materialPreset === 'preset-glass' || materialPreset === 'glass') return true

  const shapeText = [
    shape.name,
    shape.semanticRole,
    shape.semanticGroup,
    shape.sourcePartKind,
    shape.sourcePartId,
  ]
    .filter(Boolean)
    .join(' ')
  if (containsGlassText(shapeText)) return true

  const promptRequestsGlass = containsGlassText(prompt)
  if (!promptRequestsGlass) return false
  if (expandedShapeCount === 1) return true
  return kind === 'rounded-panel' || kind === 'ellipse-panel' || kind === 'semi-ellipse-panel'
}

export function withGlassMaterial(
  material: PrimitiveMaterialInput | undefined,
): PrimitiveMaterialInput {
  return {
    ...material,
    preset: 'glass',
    properties: {
      ...material?.properties,
      transparent: material?.properties?.transparent ?? true,
      opacity: material?.properties?.opacity ?? 0.35,
      roughness: material?.properties?.roughness ?? 0.08,
      metalness: material?.properties?.metalness ?? 0.05,
      side: material?.properties?.side ?? 'double',
    },
  }
}
