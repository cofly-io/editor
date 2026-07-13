import {
  type InstalledAssetPack,
  installAssetCloudPack,
  listInstalledAssetPacks,
  removeInstalledAssetPack,
} from '../asset-packs'
import {
  type InstalledProfilePack,
  installCloudProfilePack,
  listInstalledProfilePacks,
  removeProfilePack,
  setProfilePackEnabled,
} from '../profile-packs'
import { resetIndustryProcessTemplateCacheForTests } from './industry-factory-knowledge'
import { resetProcessEquipmentContractCacheForTests } from './process-equipment-contracts'

type RequestedPack = {
  id: string
  version: string
}

type PackSnapshot = Pick<InstalledProfilePack, 'id' | 'version' | 'path' | 'enabled'>
type AssetPackSnapshot = Pick<InstalledAssetPack, 'id' | 'version' | 'kind'>

function packKey(pack: Pick<InstalledProfilePack, 'id' | 'version'>) {
  return `${pack.id}@${pack.version}`
}

function resetIndustryCaches() {
  resetIndustryProcessTemplateCacheForTests()
  resetProcessEquipmentContractCacheForTests()
}

export async function installIndustryPacksForTests(requested: RequestedPack[]) {
  const initial = await listInstalledProfilePacks()
  const initialByKey = new Map(initial.map((pack) => [packKey(pack), pack]))
  const initialAssets = await listInstalledAssetPacks()
  const initialAssetKeys = new Set(
    initialAssets.map((pack) => `${pack.kind}:${pack.id}@${pack.version}`),
  )
  const installedByTest = new Map<string, PackSnapshot>()
  const installedAssetByTest = new Map<string, AssetPackSnapshot>()
  const enabledByTest = new Map<string, PackSnapshot>()

  for (const request of requested) {
    const key = `${request.id}@${request.version}`
    const existing = initialByKey.get(key)
    if (existing) {
      if (!existing.enabled) {
        await setProfilePackEnabled(existing.path, true)
        enabledByTest.set(key, existing)
      }
      continue
    }

    try {
      const result = await installCloudProfilePack(request.id, request.version)
      for (const pack of [...result.installedDependencies, result.pack]) {
        const dependencyKey = packKey(pack)
        if (!initialByKey.has(dependencyKey)) {
          installedByTest.set(dependencyKey, pack)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/Cloud profile pack not found|ENOENT|no such file/i.test(message)) throw error
      const result = await installAssetCloudPack('industry', request.id, request.version)
      for (const pack of result.installed) {
        const dependencyKey = `${pack.kind}:${pack.id}@${pack.version}`
        if (!initialAssetKeys.has(dependencyKey)) {
          installedAssetByTest.set(dependencyKey, pack)
        }
      }
    }
  }

  resetIndustryCaches()

  return async () => {
    for (const pack of [...installedByTest.values()].reverse()) {
      await removeProfilePack(pack.path).catch(() => {})
    }
    for (const pack of [...installedAssetByTest.values()].reverse()) {
      await removeInstalledAssetPack(pack.kind, pack.id, pack.version).catch(() => {})
    }
    for (const pack of enabledByTest.values()) {
      await setProfilePackEnabled(pack.path, false).catch(() => {})
    }
    resetIndustryCaches()
  }
}

export async function withIndustryPackDisabledForTests(request: RequestedPack) {
  const existing = (await listInstalledProfilePacks()).find(
    (pack) => pack.id === request.id && pack.version === request.version,
  )
  const existingAsset = (await listInstalledAssetPacks()).find(
    (pack) =>
      pack.kind === 'industry' && pack.id === request.id && pack.version === request.version,
  )
  let installedByTest: PackSnapshot | undefined
  let reenable = false
  let removedAssetForTest = false
  let restoreAssetOnCleanup = false

  if (!existing && !existingAsset) {
    try {
      const result = await installCloudProfilePack(request.id, request.version)
      installedByTest = result.pack
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/Cloud profile pack not found|ENOENT|no such file/i.test(message)) throw error
      await installAssetCloudPack('industry', request.id, request.version)
      await removeInstalledAssetPack('industry', request.id, request.version)
      removedAssetForTest = true
    }
  } else if (existing?.enabled) {
    reenable = true
  } else if (existingAsset) {
    await removeInstalledAssetPack('industry', request.id, request.version)
    removedAssetForTest = true
    restoreAssetOnCleanup = true
  }

  const current = (await listInstalledProfilePacks()).find(
    (pack) => pack.id === request.id && pack.version === request.version,
  )
  if (current?.enabled) {
    await setProfilePackEnabled(current.path, false)
  }
  resetIndustryCaches()

  return async () => {
    if (installedByTest) {
      await removeProfilePack(installedByTest.path).catch(() => {})
    } else if (reenable && current) {
      await setProfilePackEnabled(current.path, true).catch(() => {})
    }
    if (removedAssetForTest && restoreAssetOnCleanup) {
      await installAssetCloudPack('industry', request.id, request.version).catch(() => {})
    }
    resetIndustryCaches()
  }
}
