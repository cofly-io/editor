import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { PROFILE_PACK_REFRESH_TTL_MS } from './chat-utils'
import type {
  ProfilePackApiSummary,
  ProfilePackDebugSummary,
  ProfilePackSummary,
} from './types'

export function useProfilePacks() {
  const [profilePacks, setProfilePacks] = useState<ProfilePackSummary[]>([])
  const [profilePackDebug, setProfilePackDebug] = useState<ProfilePackDebugSummary[]>([])
  const [profilePackSummary, setProfilePackSummary] = useState<ProfilePackApiSummary>({})
  const [profilePackWarningCount, setProfilePackWarningCount] = useState(0)
  const [profilePackImporting, setProfilePackImporting] = useState(false)
  const [profilePackStatus, setProfilePackStatus] = useState<string | null>(null)
  const profilePackInputRef = useRef<HTMLInputElement>(null)
  const profilePackRefreshRef = useRef<{ loadedAt: number; promise: Promise<void> | null }>({
    loadedAt: 0,
    promise: null,
  })

  const refreshProfilePacks = useCallback(async (options?: { force?: boolean }) => {
    const current = profilePackRefreshRef.current
    if (!options?.force && Date.now() - current.loadedAt < PROFILE_PACK_REFRESH_TTL_MS) return
    if (current.promise) return current.promise

    const promise = (async () => {
      const response = await fetch('/api/profile-packs', { cache: 'no-store' })
      if (!response.ok) return
      const data = (await response.json()) as {
        packs?: ProfilePackSummary[]
        profileDebug?: ProfilePackDebugSummary[]
        summary?: ProfilePackApiSummary
        warnings?: unknown[]
      }
      setProfilePacks(Array.isArray(data.packs) ? data.packs : [])
      setProfilePackDebug(Array.isArray(data.profileDebug) ? data.profileDebug : [])
      setProfilePackSummary(data.summary ?? {})
      setProfilePackWarningCount(Array.isArray(data.warnings) ? data.warnings.length : 0)
      profilePackRefreshRef.current.loadedAt = Date.now()
    })()

    profilePackRefreshRef.current.promise = promise
    try {
      await promise
    } catch {
      // The pack summary is non-critical; geometry generation still works without it.
    } finally {
      if (profilePackRefreshRef.current.promise === promise) {
        profilePackRefreshRef.current.promise = null
      }
    }
  }, [])

  useEffect(() => {
    void refreshProfilePacks()
  }, [refreshProfilePacks])

  const handleProfilePackSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (!file) return
      if (!/\.zip$/i.test(file.name)) {
        setProfilePackStatus('请选择 .zip 行业资源包。')
        return
      }
      setProfilePackImporting(true)
      setProfilePackStatus('正在导入行业资源包...')
      try {
        const form = new FormData()
        form.set('file', file)
        const response = await fetch('/api/profile-packs', {
          method: 'POST',
          body: form,
        })
        const data = (await response.json()) as {
          pack?: ProfilePackSummary
          message?: string
          error?: string
        }
        if (!response.ok || !data.pack) {
          throw new Error(data.message ?? data.error ?? '行业资源包导入失败。')
        }
        setProfilePackStatus(
          `已启用 ${data.pack.name}，新增 ${data.pack.profileCount} 个设备 profile。`,
        )
        await refreshProfilePacks({ force: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setProfilePackStatus(`行业资源包导入失败：${message}`)
      } finally {
        setProfilePackImporting(false)
      }
    },
    [refreshProfilePacks],
  )

  return {
    handleProfilePackSelected,
    profilePackDebug,
    profilePackImporting,
    profilePackInputRef,
    profilePackStatus,
    profilePackSummary,
    profilePacks,
    profilePackWarningCount,
  }
}
