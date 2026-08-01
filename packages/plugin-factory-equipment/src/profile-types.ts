/**
 * Equipment profile types shared by the AI generation pipeline.
 *
 * These types were originally defined in industry-pack-loader.ts (deleted
 * together with the legacy /api/industry-scene link). They are kept here as
 * lightweight type-only declarations because the AI link
 * (process-equipment-resolver / runtime-geometry-synthesizer) still consumes
 * profile metadata with this shape.
 */

export type GeneratorRef = {
  componentPack: string
  generator: string
}

export type Profile = {
  id: string
  name: string
  family: string
  generatorRef: GeneratorRef
  defaultDimensions: {
    length: number
    width: number
    height: number
  }
  params: Record<string, unknown>
  ports: Record<string, string>
  primarySemanticRole: string
  qualityRequiredRoles: string[]
  displayName?: string
  localizedNames?: Record<string, string>
}
