import crypto from 'node:crypto'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { findRepoRoot, sanitizeSegment } from './generated-assets/manifest'

export type AssetPackDependency = {
  id: string
  version?: string
}

export type AssetPackRegistryEntry = {
  id: string
  name: string
  version: string
  description?: string
  category?: string
  industry?: string
  url: string
  size?: number
  sha256?: string
  generators?: string[]
  dependsOnComponentPacks?: AssetPackDependency[]
  engine?: { minEditorVersion?: string }
  packSchemaVersion?: string
  tags?: string[]
  locale?: string
  author?: string
  license?: string
  releaseNotes?: string
  preview?: string
}

export type AssetPackRegistry = {
  schemaVersion?: string
  generatedAt?: string
  componentPacks: AssetPackRegistryEntry[]
  industryPacks: AssetPackRegistryEntry[]
}

export type InstalledAssetPack = {
  id: string
  version: string
  kind: AssetPackKind
  path: string
  installedAt: string
  sha256?: string
  size?: number
  url?: string
}

export type AssetPackKind = 'component' | 'industry'

export type AssetPackSourceStatus = {
  status: 'current' | 'dirty' | 'unknown'
  sourceRoot?: string
  sourceFingerprint?: string
  artifactContentFingerprint?: string
  reason?: string
}

export type AssetPackCatalogEntry = AssetPackRegistryEntry & {
  kind: AssetPackKind
  installed: boolean
  installedSha256?: string
  updateAvailable: boolean
  sourceStatus?: AssetPackSourceStatus
  artifactExists: boolean
  artifactPath: string
  previewSummary?: AssetPackPreviewSummary
  dependencyStatus?: 'none' | 'satisfied' | 'missing' | 'outdated'
  missingDependencies?: AssetPackDependency[]
  outdatedDependencies?: AssetPackDependency[]
}

export type AssetPackPreviewSummary = {
  assemblyCount?: number
  connectionCount?: number
  qualityPassed?: boolean
  stationCount?: number
  stations?: Array<{
    stationId?: string
    profileId?: string
    primarySemanticRole?: string
    partCount?: number
    portCount?: number
    generatorRef?: {
      componentPack?: string
      generator?: string
    }
  }>
}

type InstalledAssetPackIndex = {
  installedPacks: InstalledAssetPack[]
}

type ZipEntry = {
  name: string
  bytes: Buffer
}

const MAX_ASSET_PACK_BYTES = 32 * 1024 * 1024

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

function generatorArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string' && item.trim()) return item.trim()
      if (!isRecord(item)) return undefined
      const id = stringValue(item.id)
      if (!id) return undefined
      const componentPack = stringValue(item.componentPack)
      return componentPack ? `${componentPack}/${id}` : id
    })
    .filter((item): item is string => Boolean(item))
}

function dependencyArray(value: unknown): AssetPackDependency[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!isRecord(item)) return undefined
      const id = stringValue(item.id)
      if (!id) return undefined
      return {
        id,
        ...(stringValue(item.version) ? { version: stringValue(item.version) } : {}),
      }
    })
    .filter((item): item is AssetPackDependency => Boolean(item))
}

function normalizeRegistryEntry(value: unknown, kind: AssetPackKind): AssetPackRegistryEntry {
  if (!isRecord(value)) throw new Error(`${kind} pack registry entry must be an object.`)
  const id = stringValue(value.id)
  const name = stringValue(value.name)
  const version = stringValue(value.version)
  const url = stringValue(value.url)
  if (!id) throw new Error(`${kind} pack registry entry id is required.`)
  if (!name) throw new Error(`${kind} pack registry entry name is required.`)
  if (!version) throw new Error(`${kind} pack registry entry version is required.`)
  if (!url) throw new Error(`${kind} pack registry entry url is required.`)
  return {
    id,
    name,
    version,
    url,
    ...(stringValue(value.description) ? { description: stringValue(value.description) } : {}),
    ...(stringValue(value.category) ? { category: stringValue(value.category) } : {}),
    ...(stringValue(value.industry) ? { industry: stringValue(value.industry) } : {}),
    ...(typeof value.size === 'number' && Number.isFinite(value.size) ? { size: value.size } : {}),
    ...(stringValue(value.sha256) ? { sha256: stringValue(value.sha256) } : {}),
    ...(generatorArray(value.generators).length
      ? { generators: generatorArray(value.generators) }
      : {}),
    ...(dependencyArray(value.dependsOnComponentPacks).length
      ? { dependsOnComponentPacks: dependencyArray(value.dependsOnComponentPacks) }
      : {}),
    ...(isRecord(value.engine)
      ? {
          engine: {
            ...(stringValue(value.engine.minEditorVersion)
              ? { minEditorVersion: stringValue(value.engine.minEditorVersion) }
              : {}),
          },
        }
      : {}),
    ...(stringValue(value.packSchemaVersion)
      ? { packSchemaVersion: stringValue(value.packSchemaVersion) }
      : {}),
    ...(stringArray(value.tags).length ? { tags: stringArray(value.tags) } : {}),
    ...(stringValue(value.locale) ? { locale: stringValue(value.locale) } : {}),
    ...(stringValue(value.author) ? { author: stringValue(value.author) } : {}),
    ...(stringValue(value.license) ? { license: stringValue(value.license) } : {}),
    ...(stringValue(value.releaseNotes) ? { releaseNotes: stringValue(value.releaseNotes) } : {}),
    ...(stringValue(value.preview) ? { preview: stringValue(value.preview) } : {}),
  }
}

function normalizeRegistry(value: unknown): AssetPackRegistry {
  if (!isRecord(value)) throw new Error('Asset cloud registry must be an object.')
  return {
    ...(stringValue(value.schemaVersion)
      ? { schemaVersion: stringValue(value.schemaVersion) }
      : {}),
    ...(stringValue(value.generatedAt) ? { generatedAt: stringValue(value.generatedAt) } : {}),
    componentPacks: Array.isArray(value.componentPacks)
      ? value.componentPacks.map((entry) => normalizeRegistryEntry(entry, 'component'))
      : [],
    industryPacks: Array.isArray(value.industryPacks)
      ? value.industryPacks.map((entry) => normalizeRegistryEntry(entry, 'industry'))
      : [],
  }
}

export async function assetCloudRoot() {
  const configured = process.env.PASCAL_ASSET_CLOUD_ROOT?.trim()
  if (configured) return path.resolve(configured)
  const repoRoot = await findRepoRoot()
  const siblingIndustrialPackCloud = path.resolve(repoRoot, '..', 'IndustrialPack', 'cloud')
  if (fsSync.existsSync(path.join(siblingIndustrialPackCloud, 'registry.json'))) {
    return siblingIndustrialPackCloud
  }
  return path.join(repoRoot, 'cloud')
}

export async function assetPackStoreRoot() {
  const repoRoot = await findRepoRoot()
  return path.join(repoRoot, 'apps', 'editor', '.local', 'asset-packs')
}

async function installedIndexPath() {
  return path.join(await assetPackStoreRoot(), 'installed-packs.json')
}

function findRepoRootSync(start = process.cwd()) {
  let current = path.resolve(start)
  for (;;) {
    if (
      fsSync.existsSync(path.join(current, 'package.json')) &&
      fsSync.existsSync(path.join(current, 'apps', 'editor'))
    ) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) return path.resolve(start)
    current = parent
  }
}

function assetPackStoreRootSync() {
  const repoRoot = findRepoRootSync()
  return path.join(repoRoot, 'apps', 'editor', '.local', 'asset-packs')
}

function installedIndexPathSync() {
  return path.join(assetPackStoreRootSync(), 'installed-packs.json')
}

async function readJsonFile(file: string) {
  return JSON.parse(await fs.readFile(file, 'utf8')) as unknown
}

function normalizeInstalledAssetPack(entry: Record<string, unknown>): InstalledAssetPack {
  return {
    id: stringValue(entry.id) ?? '',
    version: stringValue(entry.version) ?? '',
    kind: entry.kind === 'industry' ? 'industry' : 'component',
    path: stringValue(entry.path) ?? '',
    installedAt: stringValue(entry.installedAt) ?? new Date(0).toISOString(),
    ...(stringValue(entry.sha256) ? { sha256: stringValue(entry.sha256) } : {}),
    ...(typeof entry.size === 'number' && Number.isFinite(entry.size) ? { size: entry.size } : {}),
    ...(stringValue(entry.url) ? { url: stringValue(entry.url) } : {}),
  }
}

async function readInstalledIndex(): Promise<InstalledAssetPackIndex> {
  try {
    const raw = await readJsonFile(await installedIndexPath())
    if (!isRecord(raw) || !Array.isArray(raw.installedPacks)) return { installedPacks: [] }
    return {
      installedPacks: raw.installedPacks.filter(isRecord).map(normalizeInstalledAssetPack),
    }
  } catch {
    return { installedPacks: [] }
  }
}

function readInstalledIndexSync(): InstalledAssetPackIndex {
  try {
    const raw = JSON.parse(fsSync.readFileSync(installedIndexPathSync(), 'utf8')) as unknown
    if (!isRecord(raw) || !Array.isArray(raw.installedPacks)) return { installedPacks: [] }
    return {
      installedPacks: raw.installedPacks.filter(isRecord).map(normalizeInstalledAssetPack),
    }
  } catch {
    return { installedPacks: [] }
  }
}

async function writeInstalledIndex(index: InstalledAssetPackIndex) {
  const file = await installedIndexPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
}

function relativeArtifactPath(root: string, url: string) {
  const normalized = url.replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) {
    throw new Error(`Unsafe asset pack url: ${url}`)
  }
  const resolved = path.resolve(root, normalized)
  const relative = path.relative(root, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Asset pack url escapes cloud root: ${url}`)
  }
  return resolved
}

export async function loadAssetCloudRegistry() {
  const root = await assetCloudRoot()
  const registry = normalizeRegistry(await readJsonFile(path.join(root, 'registry.json')))
  return { root, registry }
}

export async function listInstalledAssetPacks() {
  const index = await readInstalledIndex()
  return index.installedPacks.filter((pack) => pack.id && pack.version && pack.path)
}

function installedAssetPackDir(storeRoot: string, pack: InstalledAssetPack) {
  if (!pack.path) return undefined
  const resolved = path.resolve(storeRoot, pack.path)
  const relative = path.relative(storeRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined
  return resolved
}

export async function installedAssetIndustryPackDirs() {
  const storeRoot = await assetPackStoreRoot()
  const index = await readInstalledIndex()
  return index.installedPacks
    .filter((pack) => pack.kind === 'industry' && pack.id && pack.version && pack.path)
    .flatMap((pack) => {
      const dir = installedAssetPackDir(storeRoot, pack)
      return dir && fsSync.existsSync(path.join(dir, 'industry-pack.json')) ? [dir] : []
    })
}

export function installedAssetIndustryPackDirsSync() {
  const storeRoot = assetPackStoreRootSync()
  const index = readInstalledIndexSync()
  return index.installedPacks
    .filter((pack) => pack.kind === 'industry' && pack.id && pack.version && pack.path)
    .flatMap((pack) => {
      const dir = installedAssetPackDir(storeRoot, pack)
      return dir && fsSync.existsSync(path.join(dir, 'industry-pack.json')) ? [dir] : []
    })
}

export function installedAssetComponentPackDirsSync() {
  const storeRoot = assetPackStoreRootSync()
  const index = readInstalledIndexSync()
  return index.installedPacks
    .filter((pack) => pack.kind === 'component' && pack.id && pack.version && pack.path)
    .flatMap((pack) => {
      const dir = installedAssetPackDir(storeRoot, pack)
      return dir &&
        (fsSync.existsSync(path.join(dir, 'component-pack.json')) ||
          fsSync.existsSync(path.join(dir, 'generators')))
        ? [dir]
        : []
    })
}

async function readPreviewSummary(root: string, entry: AssetPackRegistryEntry) {
  if (!entry.preview) return undefined
  try {
    const raw = await readJsonFile(relativeArtifactPath(root, entry.preview))
    if (!isRecord(raw)) return undefined
    const stations = Array.isArray(raw.stations)
      ? raw.stations.filter(isRecord).map((station) => ({
          ...(stringValue(station.stationId) ? { stationId: stringValue(station.stationId) } : {}),
          ...(stringValue(station.profileId) ? { profileId: stringValue(station.profileId) } : {}),
          ...(stringValue(station.primarySemanticRole)
            ? { primarySemanticRole: stringValue(station.primarySemanticRole) }
            : {}),
          ...(typeof station.partCount === 'number' ? { partCount: station.partCount } : {}),
          ...(typeof station.portCount === 'number' ? { portCount: station.portCount } : {}),
          ...(isRecord(station.generatorRef)
            ? {
                generatorRef: {
                  ...(stringValue(station.generatorRef.componentPack)
                    ? { componentPack: stringValue(station.generatorRef.componentPack) }
                    : {}),
                  ...(stringValue(station.generatorRef.generator)
                    ? { generator: stringValue(station.generatorRef.generator) }
                    : {}),
                },
              }
            : {}),
        }))
      : undefined
    return {
      ...(typeof raw.assemblyCount === 'number' ? { assemblyCount: raw.assemblyCount } : {}),
      ...(typeof raw.connectionCount === 'number' ? { connectionCount: raw.connectionCount } : {}),
      ...(isRecord(raw.qualitySummary) && typeof raw.qualitySummary.passed === 'boolean'
        ? { qualityPassed: raw.qualitySummary.passed }
        : {}),
      ...(isRecord(raw.qualitySummary) && typeof raw.qualitySummary.stationCount === 'number'
        ? { stationCount: raw.qualitySummary.stationCount }
        : {}),
      ...(stations ? { stations } : {}),
    } satisfies AssetPackPreviewSummary
  } catch {
    return undefined
  }
}

async function latestFolderMtimeMs(root: string) {
  let latestMtimeMs = 0

  async function visit(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      const stats = await fs.stat(absolutePath)
      latestMtimeMs = Math.max(latestMtimeMs, stats.mtimeMs)
    }
  }

  await visit(root)
  return latestMtimeMs
}

function sourcePackRoot(cloudRoot: string, kind: AssetPackKind, entry: AssetPackRegistryEntry) {
  const workspaceRoot = path.dirname(cloudRoot)
  const folder = kind === 'component' ? 'component-packs' : 'industry-packs'
  return path.join(workspaceRoot, folder, entry.id)
}

async function readSourceStatus(
  cloudRoot: string,
  kind: AssetPackKind,
  entry: AssetPackRegistryEntry,
  artifactPath: string,
): Promise<AssetPackSourceStatus | undefined> {
  const root = sourcePackRoot(cloudRoot, kind, entry)
  if (!fsSync.existsSync(root)) return undefined
  if (!fsSync.existsSync(artifactPath)) {
    return {
      status: 'unknown',
      sourceRoot: root,
      reason: 'artifact_missing',
    }
  }

  try {
    const [sourceMtimeMs, artifactStats] = await Promise.all([
      latestFolderMtimeMs(root),
      fs.stat(artifactPath),
    ])
    const artifactMtimeMs = artifactStats.mtimeMs
    return {
      status: sourceMtimeMs > artifactMtimeMs + 1000 ? 'dirty' : 'current',
      sourceRoot: root,
      sourceFingerprint: String(Math.round(sourceMtimeMs)),
      artifactContentFingerprint: String(Math.round(artifactMtimeMs)),
    }
  } catch (error) {
    return {
      status: 'unknown',
      sourceRoot: root,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function listAssetCloudCatalog() {
  const { root, registry } = await loadAssetCloudRegistry()
  const installed = await listInstalledAssetPacks()
  const installedByKey = new Map(
    installed.map((pack) => [`${pack.kind}:${pack.id}@${pack.version}`, pack]),
  )
  const installedComponents = new Set(
    installed.filter((pack) => pack.kind === 'component').map((pack) => pack.id),
  )
  const installedComponentPacks = installed.filter((pack) => pack.kind === 'component')

  const componentPacks: AssetPackCatalogEntry[] = await Promise.all(
    registry.componentPacks.map(async (entry) => {
      const installedPack = installedByKey.get(`component:${entry.id}@${entry.version}`)
      const updateAvailable = Boolean(
        installedPack && entry.sha256 && installedPack.sha256 !== entry.sha256,
      )
      const artifactPath = relativeArtifactPath(root, entry.url)
      return {
        ...entry,
        kind: 'component' as const,
        installed: Boolean(installedPack),
        ...(installedPack?.sha256 ? { installedSha256: installedPack.sha256 } : {}),
        updateAvailable,
        sourceStatus: await readSourceStatus(root, 'component', entry, artifactPath),
        artifactPath,
        artifactExists: fsSync.existsSync(artifactPath),
        dependencyStatus: 'none' as const,
        missingDependencies: [],
      }
    }),
  )
  const industryPacks: AssetPackCatalogEntry[] = await Promise.all(
    registry.industryPacks.map(async (entry) => {
      const installedPack = installedByKey.get(`industry:${entry.id}@${entry.version}`)
      const ownUpdateAvailable = Boolean(
        installedPack && entry.sha256 && installedPack.sha256 !== entry.sha256,
      )
      const missingDependencies = (entry.dependsOnComponentPacks ?? []).filter(
        (dependency) => !installedComponents.has(dependency.id),
      )
      const outdatedDependencies = (entry.dependsOnComponentPacks ?? []).filter((dependency) => {
        const installedDependency = installedComponentPacks.find(
          (pack) => pack.id === dependency.id && versionSatisfies(pack.version, dependency.version),
        )
        if (!installedDependency) return false
        const cloudDependency = registry.componentPacks.find(
          (pack) => pack.id === dependency.id && versionSatisfies(pack.version, dependency.version),
        )
        return Boolean(
          cloudDependency?.sha256 &&
            installedDependency.sha256 &&
            cloudDependency.sha256 !== installedDependency.sha256,
        )
      })
      const dependencyUpdateAvailable = Boolean(installedPack && outdatedDependencies.length > 0)
      const updateAvailable = ownUpdateAvailable || dependencyUpdateAvailable
      const artifactPath = relativeArtifactPath(root, entry.url)
      return {
        ...entry,
        kind: 'industry' as const,
        installed: Boolean(installedPack),
        ...(installedPack?.sha256 ? { installedSha256: installedPack.sha256 } : {}),
        updateAvailable,
        sourceStatus: await readSourceStatus(root, 'industry', entry, artifactPath),
        artifactPath,
        artifactExists: fsSync.existsSync(artifactPath),
        previewSummary: await readPreviewSummary(root, entry),
        dependencyStatus:
          missingDependencies.length === 0
            ? outdatedDependencies.length > 0
              ? 'outdated'
              : entry.dependsOnComponentPacks?.length
                ? 'satisfied'
                : 'none'
            : 'missing',
        missingDependencies,
        outdatedDependencies,
      }
    }),
  )

  return {
    cloudRoot: root,
    generatedAt: registry.generatedAt,
    componentPacks,
    industryPacks,
    summary: {
      componentPackCount: componentPacks.length,
      industryPackCount: industryPacks.length,
      installedComponentPackCount: componentPacks.filter((pack) => pack.installed).length,
      installedIndustryPackCount: industryPacks.filter((pack) => pack.installed).length,
      generatorCount: componentPacks.reduce((sum, pack) => sum + (pack.generators?.length ?? 0), 0),
    },
  }
}

function assetPackInstallDirName(entry: AssetPackRegistryEntry) {
  return `${sanitizeSegment(entry.id, 'asset-pack')}@${sanitizeSegment(entry.version, '0.0.0')}`
}

function isSafeZipEntryPath(value: string) {
  const normalized = value.replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return false
  return normalized.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
}

function zipEntries(buffer: Buffer): ZipEntry[] {
  if (buffer.length > MAX_ASSET_PACK_BYTES) throw new Error('Asset pack zip is too large.')
  let eocdOffset = -1
  for (
    let offset = buffer.length - 22;
    offset >= Math.max(0, buffer.length - 65_557);
    offset -= 1
  ) {
    if (buffer.readUInt32LE(offset) === 0x0605_4b50) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset < 0) throw new Error('Invalid zip: end of central directory not found.')
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16)
  const entries: ZipEntry[] = []
  let cursor = centralDirectoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x0201_4b50) {
      throw new Error('Invalid zip: central directory entry is corrupt.')
    }
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const fileNameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + fileNameLength)
      .toString('utf8')
      .replace(/\\/g, '/')
    cursor += 46 + fileNameLength + extraLength + commentLength
    if (!name || name.endsWith('/')) continue
    if (!isSafeZipEntryPath(name)) throw new Error(`Unsafe zip entry path: ${name}`)
    if (buffer.readUInt32LE(localHeaderOffset) !== 0x0403_4b50) {
      throw new Error(`Invalid zip: local header missing for ${name}.`)
    }
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    let bytes: Buffer
    if (method === 0) {
      bytes = Buffer.from(compressed)
    } else if (method === 8) {
      bytes = Buffer.from(inflateRawSync(compressed))
    } else {
      throw new Error(`Unsupported zip compression method ${method} for ${name}.`)
    }
    if (bytes.length !== uncompressedSize) {
      throw new Error(`Invalid zip entry size for ${name}.`)
    }
    entries.push({ name, bytes })
  }
  return entries
}

async function extractZipToDir(buffer: Buffer, targetDir: string) {
  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(targetDir, { recursive: true })
  for (const entry of zipEntries(buffer)) {
    const file = path.resolve(targetDir, entry.name)
    const relative = path.relative(targetDir, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Asset pack zip entry escapes install dir: ${entry.name}`)
    }
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, entry.bytes)
  }
}

async function installRegistryEntry(
  entry: AssetPackRegistryEntry,
  kind: AssetPackKind,
  root: string,
) {
  const artifact = relativeArtifactPath(root, entry.url)
  const bytes = await fs.readFile(artifact)
  if (entry.size != null && bytes.length !== entry.size) {
    throw new Error(`Artifact size mismatch for ${entry.id}@${entry.version}.`)
  }
  if (entry.sha256) {
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    if (hash !== entry.sha256)
      throw new Error(`Artifact hash mismatch for ${entry.id}@${entry.version}.`)
  }
  const storeRoot = await assetPackStoreRoot()
  const installPath = path.join(
    storeRoot,
    kind === 'component' ? 'component-packs' : 'industry-packs',
    assetPackInstallDirName(entry),
  )
  await extractZipToDir(bytes, installPath)
  const index = await readInstalledIndex()
  const installed: InstalledAssetPack = {
    id: entry.id,
    version: entry.version,
    kind,
    path: path.relative(storeRoot, installPath).replace(/\\/g, '/'),
    installedAt: new Date().toISOString(),
    ...(entry.sha256 ? { sha256: entry.sha256 } : {}),
    ...(entry.size != null ? { size: entry.size } : {}),
    url: entry.url,
  }
  index.installedPacks = [
    ...index.installedPacks.filter(
      (pack) => !(pack.kind === kind && pack.id === entry.id && pack.version === entry.version),
    ),
    installed,
  ]
  await writeInstalledIndex(index)
  return installed
}

function versionSatisfies(version: string, requirement?: string) {
  if (!requirement?.trim()) return true
  const normalized = requirement.trim()
  if (normalized.startsWith('^')) {
    const base = normalized.slice(1)
    return version.split('.')[0] === base.split('.')[0] && compareSemver(version, base) >= 0
  }
  if (normalized.startsWith('>=')) return compareSemver(version, normalized.slice(2).trim()) >= 0
  if (normalized.startsWith('=')) return version === normalized.slice(1).trim()
  return version === normalized
}

function compareSemver(left: string, right: string) {
  const l = left.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const r = right.split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let index = 0; index < Math.max(l.length, r.length); index += 1) {
    const delta = (l[index] ?? 0) - (r[index] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

function findRegistryEntry(
  registry: AssetPackRegistry,
  kind: AssetPackKind,
  id: string,
  version?: string,
) {
  const entries = kind === 'component' ? registry.componentPacks : registry.industryPacks
  return entries.find((entry) => entry.id === id && (!version || entry.version === version))
}

export async function installAssetCloudPack(kind: AssetPackKind, id: string, version?: string) {
  const { root, registry } = await loadAssetCloudRegistry()
  const entry = findRegistryEntry(registry, kind, id, version)
  if (!entry) throw new Error(`Asset pack not found: ${kind}:${id}${version ? `@${version}` : ''}`)

  const installed: InstalledAssetPack[] = []
  if (kind === 'industry') {
    for (const dependency of entry.dependsOnComponentPacks ?? []) {
      const dependencyEntry = registry.componentPacks.find(
        (component) =>
          component.id === dependency.id && versionSatisfies(component.version, dependency.version),
      )
      if (!dependencyEntry) {
        throw new Error(
          `Missing component dependency: ${dependency.id}@${dependency.version ?? '*'}`,
        )
      }
      installed.push(await installRegistryEntry(dependencyEntry, 'component', root))
    }
  }
  installed.push(await installRegistryEntry(entry, kind, root))
  return { installed }
}

export async function removeInstalledAssetPack(kind: AssetPackKind, id: string, version?: string) {
  const storeRoot = await assetPackStoreRoot()
  const index = await readInstalledIndex()
  const removed = index.installedPacks.filter(
    (pack) => pack.kind === kind && pack.id === id && (!version || pack.version === version),
  )
  for (const pack of removed) {
    const dir = installedAssetPackDir(storeRoot, pack)
    if (dir) await fs.rm(dir, { recursive: true, force: true })
  }
  index.installedPacks = index.installedPacks.filter(
    (pack) => !(pack.kind === kind && pack.id === id && (!version || pack.version === version)),
  )
  await writeInstalledIndex(index)
  return { removed }
}
