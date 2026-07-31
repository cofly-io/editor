import fs from 'node:fs'
import path from 'node:path'

export type AssetIndustryPackManifest = {
  id: string
  name?: string
  version: string
  industry: string
  description?: string
  profiles: string[]
  layouts: string[]
  connections: string[]
  qualityRules: string[]
}

export type AssetIndustryPackResources = {
  dir: string
  manifest: AssetIndustryPackManifest
  profiles: Record<string, unknown>[]
  layouts: Record<string, unknown>[]
  connections: Record<string, unknown>[]
  qualityRules: Record<string, unknown>[]
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function safeRelativePath(value: string) {
  const normalized = value.replace(/\\/g, '/')
  return (
    normalized.length > 0 &&
    !normalized.startsWith('/') &&
    !/^[a-z]:/i.test(normalized) &&
    normalized.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
  )
}

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
}

function readJsonRecords(file: string, warnings: string[]) {
  try {
    const raw = readJson(file)
    return (Array.isArray(raw) ? raw : [raw]).filter(isRecord).map((entry) => ({ ...entry }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`Failed to read asset industry resource ${file}: ${message}`)
    return []
  }
}

export function isAssetIndustryPackDir(dir: string) {
  return (
    fs.existsSync(path.join(dir, 'industry-pack.json')) || fs.existsSync(path.join(dir, 'pack.json'))
  )
}

export function readAssetIndustryPackManifestSync(dir: string): AssetIndustryPackManifest | null {
  // Prefer legacy generator-based manifest, fall back to recipe-based v2 (pack.json).
  const assetManifestPath = path.join(dir, 'industry-pack.json')
  const v2ManifestPath = path.join(dir, 'pack.json')
  const manifestPath = fs.existsSync(assetManifestPath) ? assetManifestPath : v2ManifestPath
  if (!fs.existsSync(manifestPath)) return null
  const raw = readJson(manifestPath)
  if (!isRecord(raw)) return null
  const id = stringValue(raw.id)
  const version = stringValue(raw.version)
  const industry = stringValue(raw.industry)
  if (!id || !version || !industry) return null
  return {
    id,
    ...(stringValue(raw.name) ? { name: stringValue(raw.name) } : {}),
    version,
    industry,
    ...(stringValue(raw.description) ? { description: stringValue(raw.description) } : {}),
    profiles: stringArray(raw.profiles),
    layouts: stringArray(raw.layouts),
    connections: stringArray(raw.connections),
    qualityRules: stringArray(raw.qualityRules),
  }
}

function resourceFiles(dir: string, files: readonly string[], warnings: string[]) {
  const resolvedDir = path.resolve(dir)
  return files.flatMap((rel) => {
    if (!safeRelativePath(rel)) {
      warnings.push(`Ignored unsafe asset industry resource path: ${rel}`)
      return []
    }
    const file = path.resolve(dir, rel)
    if (!(file === resolvedDir || file.startsWith(`${resolvedDir}${path.sep}`))) {
      warnings.push(`Ignored asset industry resource outside pack: ${rel}`)
      return []
    }
    if (!fs.existsSync(file)) {
      warnings.push(`Asset industry resource is missing: ${rel}`)
      return []
    }
    return [file]
  })
}

export function loadAssetIndustryPackResourcesSync(dir: string): AssetIndustryPackResources | null {
  const warnings: string[] = []
  const manifest = readAssetIndustryPackManifestSync(dir)
  if (!manifest) return null
  return {
    dir,
    manifest,
    profiles: resourceFiles(dir, manifest.profiles, warnings).flatMap((file) =>
      readJsonRecords(file, warnings),
    ),
    layouts: resourceFiles(dir, manifest.layouts, warnings).flatMap((file) =>
      readJsonRecords(file, warnings),
    ),
    connections: resourceFiles(dir, manifest.connections, warnings).flatMap((file) =>
      readJsonRecords(file, warnings),
    ),
    qualityRules: resourceFiles(dir, manifest.qualityRules, warnings).flatMap((file) =>
      readJsonRecords(file, warnings),
    ),
    warnings,
  }
}
