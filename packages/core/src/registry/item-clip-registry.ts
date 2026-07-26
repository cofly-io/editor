/**
 * Runtime animation clips registered by item renderers for GLB export.
 *
 * Core deliberately keeps the clip payload renderer-agnostic: the viewer and
 * exporter own the concrete Three.js animation type.
 */
export type ItemClipRegistryEntry<TClip = any> = {
  clip: TClip
  loop: boolean
}

export const itemClipRegistry = new Map<string, ItemClipRegistryEntry>()
