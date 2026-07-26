export const DEFAULT_OFFLINE_HDRI_PATH = 'environment/small_hangar_01_1k.hdr'

function normalizeAssetBasePath(value: string | undefined): string {
  return value?.trim().replace(/^\/+|\/+$/g, '') ?? ''
}

export function resolveOfflineHdriUrl(
  assetPath = DEFAULT_OFFLINE_HDRI_PATH,
  assetBasePath = process.env.NEXT_PUBLIC_VIEWER_ASSET_BASE_PATH,
): string {
  const basePath = normalizeAssetBasePath(assetBasePath)
  const path = assetPath.replace(/^\/+/, '')
  return basePath ? `/${basePath}/${path}` : `/${path}`
}
