import * as os from 'node:os'
import path from 'node:path'

export const sceneThumbnailPattern =
  /^\/scene-thumbnails\/(?<file>[A-Za-z0-9_-]+\.(?:png|jpg|webp))$/

export function resolveSceneThumbnailDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.PASCAL_THUMBNAIL_DIR
  if (configured && configured.length > 0) return path.resolve(configured)

  const dataDir = env.PASCAL_DATA_DIR
  if (dataDir && dataDir.length > 0) {
    return path.join(dataDir, 'scene-thumbnails')
  }

  if (process.platform === 'win32') {
    const appData = env.APPDATA
    if (appData && appData.length > 0) {
      return path.join(appData, 'Pascal', 'data', 'scene-thumbnails')
    }
  }

  const xdgData = env.XDG_DATA_HOME
  if (xdgData && xdgData.length > 0) {
    return path.join(xdgData, 'pascal', 'data', 'scene-thumbnails')
  }

  return path.join(os.homedir(), '.pascal', 'data', 'scene-thumbnails')
}

export function safeSceneThumbnailFileName(raw: string): string | null {
  return /^[A-Za-z0-9_-]+\.(?:png|jpg|webp)$/.test(raw) ? raw : null
}

export function sceneThumbnailPath(fileName: string): string {
  const safeFileName = safeSceneThumbnailFileName(fileName)
  if (!safeFileName) throw new Error('invalid_scene_thumbnail_file')
  return path.join(resolveSceneThumbnailDir(), safeFileName)
}

export function sceneThumbnailContentType(fileName: string): string | null {
  if (fileName.endsWith('.webp')) return 'image/webp'
  if (fileName.endsWith('.jpg')) return 'image/jpeg'
  if (fileName.endsWith('.png')) return 'image/png'
  return null
}
