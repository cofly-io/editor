import { access } from 'node:fs/promises'
import { sceneThumbnailPath, sceneThumbnailPattern } from './scene-thumbnail-storage'

export async function resolveExistingSceneThumbnailUrl(url: string | null): Promise<string | null> {
  if (!url) return null
  const match = sceneThumbnailPattern.exec(url)
  if (!match?.groups?.file) return url

  try {
    await access(sceneThumbnailPath(match.groups.file))
    return url
  } catch {
    return null
  }
}

export async function resolveExistingSceneThumbnailUrls<
  T extends { thumbnailUrl: string | null },
>(scenes: T[]): Promise<T[]> {
  return Promise.all(
    scenes.map(async (scene) => ({
      ...scene,
      thumbnailUrl: await resolveExistingSceneThumbnailUrl(scene.thumbnailUrl),
    })),
  )
}
