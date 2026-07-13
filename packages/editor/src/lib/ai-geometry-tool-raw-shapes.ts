import type { RawGeometryToolShape as RawShape } from './ai-geometry-tool-constants'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function rawShapeRead(shape: RawShape, key: string): unknown {
  const shapeRecord = shape as Record<string, unknown>
  const params = isRecord(shapeRecord.params) ? shapeRecord.params : {}
  const dimensions = isRecord(shapeRecord.dimensions)
    ? shapeRecord.dimensions
    : isRecord(params.dimensions)
      ? params.dimensions
      : {}
  return shapeRecord[key] ?? params[key] ?? dimensions[key]
}

function primitiveReferenceKeys(shape: RawShape, index: number): string[] {
  return [
    rawShapeRead(shape, 'id'),
    rawShapeRead(shape, 'name'),
    rawShapeRead(shape, 'semanticRole'),
    rawShapeRead(shape, 'sourcePartId'),
    rawShapeRead(shape, 'sourcePartKind'),
    `#${index}`,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
}

export function resolvePrimitiveShapeReference(
  reference: unknown,
  shapes: readonly RawShape[],
  currentIndex: number,
): number | undefined {
  if (typeof reference === 'number' && Number.isInteger(reference) && reference >= 0) {
    return reference < currentIndex ? reference : undefined
  }
  if (typeof reference !== 'string') return undefined
  const normalized = reference.trim()
  if (!normalized) return undefined
  const numeric = normalized.match(/^#?(\d+)$/)
  if (numeric?.[1]) {
    const index = Number.parseInt(numeric[1], 10)
    return index >= 0 && index < currentIndex ? index : undefined
  }
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (primitiveReferenceKeys(shapes[index]!, index).includes(normalized)) return index
  }
  return undefined
}

export function primitiveShapeReferenceText(shape: RawShape): string {
  return [
    rawShapeRead(shape, 'id'),
    rawShapeRead(shape, 'name'),
    rawShapeRead(shape, 'semanticRole'),
    rawShapeRead(shape, 'sourcePartId'),
    rawShapeRead(shape, 'sourcePartKind'),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}
