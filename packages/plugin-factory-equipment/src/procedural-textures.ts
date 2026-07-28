/**
 * Procedural Texture Generator
 *
 * Turns a TextureSpec (from pbr-material-library) into raw pixel data the
 * renderer can upload as a DataTexture. Pure logic — no three.js / DOM —
 * so it is unit-testable and portable (Canvas is only a thin wrapper away).
 *
 * Output formats per slot:
 *  - baseColor / roughness / metalness: single-channel luminance (format 'luminance')
 *  - normal: RGB tangent-space normal (format 'rgb')
 *
 * All generators are deterministic: the same spec always yields the same
 * pixels (seeded value noise), so textures can be cached by spec key.
 */

import type { TextureSpec } from './pbr-material-library'

// ─── Public types ────────────────────────────────────────────────────────────

export type GeneratedTexture = {
  width: number
  height: number
  /** 'rgb' for normal maps, 'luminance' for single-channel maps */
  format: 'rgb' | 'luminance'
  /** RGB: width*height*3 bytes; luminance: width*height bytes */
  data: Uint8Array
  /** UV repeat from the spec (renderer applies to texture.repeat) */
  repeat: [number, number]
  slot: TextureSpec['slot']
}

// ─── Deterministic value noise ───────────────────────────────────────────────
// Hash-based lattice noise with bilinear interpolation. seed is derived from
// the spec so every material/slot combo gets a distinct but stable pattern.

function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967295
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Value noise in [0,1] at (x, y) with the given lattice scale + seed. */
export function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x * scale
  const fy = y * scale
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const tx = smooth(fx - ix)
  const ty = smooth(fy - iy)
  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
}

/** 2-octave fractal noise for richer patterns. */
function fbm(x: number, y: number, scale: number, seed: number): number {
  return valueNoise(x, y, scale, seed) * 0.65 + valueNoise(x, y, scale * 2.7, seed + 7) * 0.35
}

function seedOf(spec: TextureSpec): number {
  let s = 0
  const key = `${spec.slot}:${spec.noise}:${spec.repeat[0]}x${spec.repeat[1]}`
  for (let i = 0; i < key.length; i += 1) s = (s * 31 + key.charCodeAt(i)) | 0
  return Math.abs(s) % 100000
}

// ─── Height-field generators (one per noise kind) ────────────────────────────
// Each returns a height in [0,1] at normalized uv (0..1) — used directly for
// luminance maps and as the source for normal-map derivation.

type HeightFn = (u: number, v: number, seed: number) => number

const HEIGHT_FNS: Record<string, HeightFn> = {
  none: () => 0.5,
  'fine-grain': (u, v, seed) => fbm(u, v, 24, seed),
  'coarse-granules': (u, v, seed) => {
    // Cell-like granules: high-frequency noise quantized into blobs
    const n = fbm(u, v, 40, seed)
    return n > 0.55 ? 0.75 + n * 0.25 : n * 0.8
  },
  speckle: (u, v, seed) => {
    // Sparse dark speckles on mid-gray (galvanized zinc spangle)
    const n = valueNoise(u, v, 48, seed)
    return n > 0.72 ? 0.85 : 0.35 + fbm(u, v, 12, seed + 3) * 0.3
  },
  ripple: (u, v, seed) => {
    // Concentric-ish soft waves + light noise (liquid surface)
    const wave = Math.sin((u + fbm(u, v, 6, seed) * 0.4) * Math.PI * 8) * 0.5 + 0.5
    return wave * 0.6 + fbm(u, v, 10, seed + 11) * 0.4
  },
  'brushed-lines': () => 0.5, // handled separately (needs anisotropy angle)
}

/** Anisotropic brushed metal: lines along the anisotropy angle direction. */
function brushedHeight(u: number, v: number, seed: number, angle: number): number {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Project uv onto the axis perpendicular to the brushing direction
  const perp = u * -sin + v * cos
  const along = u * cos + v * sin
  // High-frequency lines across the brush, low-frequency drift along it
  const lines = valueNoise(perp, along * 0.02, 90, seed)
  const drift = fbm(u, v, 5, seed + 5)
  return lines * 0.75 + drift * 0.25
}

function heightAt(spec: TextureSpec, u: number, v: number, seed: number): number {
  if (spec.noise === 'brushed-lines') {
    return brushedHeight(u, v, seed, spec.anisotropyAngle ?? 0)
  }
  const fn = HEIGHT_FNS[spec.noise] ?? HEIGHT_FNS.none ?? (() => 0.5)
  return fn(u, v, seed)
}

// ─── Map builders ────────────────────────────────────────────────────────────

/** Single-channel luminance map. Base strength around a mid value. */
function buildLuminance(spec: TextureSpec, seed: number): Uint8Array {
  const res = spec.resolution
  const data = new Uint8Array(res * res)
  // Center the modulation: base 0.5, amplitude = strength * 0.5
  const amplitude = spec.strength * 0.5
  for (let y = 0; y < res; y += 1) {
    for (let x = 0; x < res; x += 1) {
      const h = heightAt(spec, x / res, y / res, seed)
      const value = 0.5 + (h - 0.5) * 2 * amplitude
      data[y * res + x] = Math.max(0, Math.min(255, Math.round(value * 255)))
    }
  }
  return data
}

/** Tangent-space normal map derived from the height field (Sobel). */
function buildNormal(spec: TextureSpec, seed: number): Uint8Array {
  const res = spec.resolution
  const data = new Uint8Array(res * res * 3)
  // Sample the height field once, then differentiate
  const heights = new Float32Array(res * res)
  for (let y = 0; y < res; y += 1) {
    for (let x = 0; x < res; x += 1) {
      heights[y * res + x] = heightAt(spec, x / res, y / res, seed)
    }
  }
  const bumpScale = spec.strength * 6
  const hAt = (x: number, y: number) => heights[((y + res) % res) * res + ((x + res) % res)] ?? 0.5
  for (let y = 0; y < res; y += 1) {
    for (let x = 0; x < res; x += 1) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * bumpScale
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * bumpScale
      // Normal = normalize(-dx, -dy, 1) mapped to 0..255
      const len = Math.sqrt(dx * dx + dy * dy + 1)
      const i = (y * res + x) * 3
      data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255)
      data[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255)
      data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255)
    }
  }
  return data
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate raw pixel data for one TextureSpec. Deterministic per spec.
 */
export function generateTextureData(spec: TextureSpec): GeneratedTexture {
  const seed = seedOf(spec)
  const isNormal = spec.slot === 'normal'
  return {
    width: spec.resolution,
    height: spec.resolution,
    format: isNormal ? 'rgb' : 'luminance',
    data: isNormal ? buildNormal(spec, seed) : buildLuminance(spec, seed),
    repeat: spec.repeat,
    slot: spec.slot,
  }
}

/** Stable cache key for a spec (for renderer-side texture caching). */
export function textureSpecKey(spec: TextureSpec): string {
  return [
    spec.slot,
    spec.noise,
    spec.repeat.join('x'),
    spec.strength,
    spec.resolution,
    spec.anisotropyAngle ?? '',
  ].join('|')
}

/**
 * Generate all textures for a spec list, keyed by slot. Later specs for the
 * same slot overwrite earlier ones (should not happen with the curated
 * TEXTURE_SPECS table).
 */
export function generateTextureSet(
  specs: readonly TextureSpec[],
): Partial<Record<TextureSpec['slot'], GeneratedTexture>> {
  const out: Partial<Record<TextureSpec['slot'], GeneratedTexture>> = {}
  for (const spec of specs) out[spec.slot] = generateTextureData(spec)
  return out
}
