'use client'

import type { SceneGraph } from '@pascal-app/editor/scene'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useState } from 'react'
import { t } from '@/i18n'

const EMPTY_GRAPH: SceneGraph = {
  nodes: {},
  rootNodeIds: [],
}

interface SaveButtonProps {
  sceneId: string
  name: string
  version: number
  getGraph: () => SceneGraph | null
}

/**
 * Creates a new empty scene and navigates the user to it.
 */
export function CreateSceneButton({ label }: { label?: string } = {}) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [sceneName, setSceneName] = useState('我的场景')
  const [error, setError] = useState<string | null>(null)
  const buttonLabel = label ?? t('scenes.createNewScene', 'Create new scene')

  const handleCreate = useCallback(async () => {
    const name = sceneName.trim()
    if (!name) return

    setIsCreating(true)
    setError(null)
    try {
      const response = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          graph: EMPTY_GRAPH,
        }),
      })
      if (!response.ok) {
        setError(
          t('save.createFailed', {
            fallback: 'Failed to create scene ({status})',
            params: { status: response.status },
          }),
        )
        return
      }
      const meta = (await response.json()) as { id: string }
      setIsDialogOpen(false)
      router.push(`/scene/${meta.id}`)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('save.createFailedGeneric', 'Failed to create scene'),
      )
    } finally {
      setIsCreating(false)
    }
  }, [router, sceneName])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleCreate()
  }

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-destructive text-xs">{error}</span>}
      <button
        className="rounded-md border border-border bg-accent px-3 py-1.5 font-medium text-sm hover:bg-accent/80 disabled:opacity-50"
        disabled={isCreating}
        onClick={() => {
          setError(null)
          setSceneName('我的场景')
          setIsDialogOpen(true)
        }}
        type="button"
      >
        {isCreating ? t('common.creating', 'Creating…') : buttonLabel}
      </button>
      {isDialogOpen && (
        <div
          aria-labelledby="create-scene-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isCreating) setIsDialogOpen(false)
          }}
          role="dialog"
        >
          <form
            className="w-full max-w-md rounded-xl border border-white/15 bg-[#14161b] p-6 text-white shadow-2xl shadow-black/40"
            onSubmit={handleSubmit}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] text-cyan-200 uppercase">New scene</p>
                <h2 className="mt-2 font-semibold text-xl" id="create-scene-title">
                  {t('save.newSceneName', 'Scene name')}
                </h2>
                <p className="mt-2 text-sm text-white/55">为场景设置一个便于识别的名称。</p>
              </div>
              <button
                aria-label="关闭"
                className="-mt-1 -mr-1 grid size-7 place-items-center rounded-md text-xl text-white/55 leading-none transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:outline-none disabled:opacity-50"
                disabled={isCreating}
                onClick={() => setIsDialogOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <label className="mt-6 block" htmlFor="new-scene-name">
              <span className="text-sm text-white/80">场景名称</span>
              <input
                className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-black/20 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-cyan-200/70 focus:ring-2 focus:ring-cyan-200/20"
                disabled={isCreating}
                id="new-scene-name"
                maxLength={120}
                onChange={(event) => setSceneName(event.target.value)}
                value={sceneName}
              />
            </label>
            <div className="mt-7 flex justify-end gap-3">
              <button
                className="h-10 rounded-md px-4 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                disabled={isCreating}
                onClick={() => setIsDialogOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="h-10 rounded-md bg-gradient-to-r from-cyan-300 to-[#a684ff] px-5 font-semibold text-[#071013] text-sm shadow-[0_0_20px_rgba(45,212,191,0.18)] transition-[filter,transform] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isCreating || !sceneName.trim()}
                type="submit"
              >
                {isCreating ? '创建中…' : '创建场景'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/**
 * Save + Save-as buttons that call the scenes API directly.
 * Used for UIs that want explicit save controls outside of the Editor's
 * built-in autosave plumbing.
 */
export function SaveButton({ sceneId, name, version, getGraph }: SaveButtonProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    const graph = getGraph()
    if (!graph) {
      setStatus(t('save.noSceneToSave', 'No scene to save'))
      return
    }
    setIsSaving(true)
    setStatus(null)
    try {
      const response = await fetch(`/api/scenes/${sceneId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': String(version),
        },
        body: JSON.stringify({ name, graph }),
      })
      if (response.status === 409) {
        setStatus(t('save.conflictReload', 'Conflict — reload to continue'))
        return
      }
      if (!response.ok) {
        setStatus(
          t('save.saveFailed', {
            fallback: 'Save failed ({status})',
            params: { status: response.status },
          }),
        )
        return
      }
      setStatus(t('common.saved', 'Saved'))
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : t('save.saveFailed', { fallback: 'Save failed ({status})', params: { status: '' } }),
      )
    } finally {
      setIsSaving(false)
    }
  }, [getGraph, name, sceneId, version])

  const handleSaveAs = useCallback(async () => {
    const graph = getGraph()
    if (!graph) {
      setStatus(t('save.noSceneToSave', 'No scene to save'))
      return
    }
    const newName =
      typeof window !== 'undefined'
        ? window.prompt(t('save.newSceneName', 'New scene name'), name)
        : null
    if (!newName) return
    setIsSaving(true)
    setStatus(null)
    try {
      const response = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, graph }),
      })
      if (!response.ok) {
        setStatus(
          t('save.saveAsFailed', {
            fallback: 'Save-as failed ({status})',
            params: { status: response.status },
          }),
        )
        return
      }
      const meta = (await response.json()) as { id: string }
      router.push(`/scene/${meta.id}`)
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : t('save.saveAsFailed', { fallback: 'Save-as failed ({status})', params: { status: '' } }),
      )
    } finally {
      setIsSaving(false)
    }
  }, [getGraph, name, router])

  return (
    <div className="flex items-center gap-2">
      <button
        className="rounded-md border border-border bg-accent px-3 py-1.5 font-medium text-xs hover:bg-accent/80 disabled:opacity-50"
        disabled={isSaving}
        onClick={handleSave}
        type="button"
      >
        {isSaving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
      </button>
      <button
        className="rounded-md border border-border bg-background px-3 py-1.5 font-medium text-xs hover:bg-accent/40 disabled:opacity-50"
        disabled={isSaving}
        onClick={handleSaveAs}
        type="button"
      >
        {t('common.saveAs', 'Save as…')}
      </button>
      {status && <span className="text-muted-foreground text-xs">{status}</span>}
    </div>
  )
}
