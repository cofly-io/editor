'use client'

import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Cloud,
  DatabaseZap,
  Download,
  Factory,
  Package,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

type AssetPackKind = 'component' | 'industry'

type AssetPackDependency = {
  id: string
  version?: string
}

type AssetPackEntry = {
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
  tags?: string[]
  author?: string
  license?: string
  releaseNotes?: string
  kind: AssetPackKind
  installed: boolean
  installedSha256?: string
  updateAvailable: boolean
  sourceStatus?: {
    status: 'current' | 'dirty' | 'unknown'
    sourceRoot?: string
    sourceFingerprint?: string
    artifactContentFingerprint?: string
    reason?: string
  }
  artifactExists: boolean
  artifactPath: string
  dependencyStatus?: 'none' | 'satisfied' | 'missing' | 'outdated'
  missingDependencies?: AssetPackDependency[]
  outdatedDependencies?: AssetPackDependency[]
  previewSummary?: {
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
}

type InstalledAssetPack = {
  id: string
  version: string
  kind: AssetPackKind
  path: string
  installedAt: string
}

type AssetCatalogResponse = {
  catalog?: {
    cloudRoot: string
    generatedAt?: string
    componentPacks: AssetPackEntry[]
    industryPacks: AssetPackEntry[]
    summary: {
      componentPackCount: number
      industryPackCount: number
      installedComponentPackCount: number
      installedIndustryPackCount: number
      generatorCount: number
    }
  }
  installed?: InstalledAssetPack[]
  error?: string
  message?: string
}

async function jsonOrThrow(response: Response) {
  const data = (await response.json().catch(() => ({}))) as AssetCatalogResponse
  if (!response.ok) {
    throw new Error(data.message ?? data.error ?? '请求失败')
  }
  return data
}

function formatBytes(value?: number) {
  if (!value) return 'unknown size'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function shortHash(hash?: string) {
  return hash ? `${hash.slice(0, 10)}...` : 'no hash'
}

function dependencyLabel(dependency: AssetPackDependency) {
  return `${dependency.id}${dependency.version ? ` ${dependency.version}` : ''}`
}

function StatusBadge({ pack }: { pack: AssetPackEntry }) {
  if (pack.sourceStatus?.status === 'dirty') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 font-medium text-amber-100 text-xs">
        <TriangleAlert aria-hidden className="size-3" />
        源码已变
      </span>
    )
  }
  if (!pack.artifactExists) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-400/25 bg-red-400/10 px-2 py-1 font-medium text-red-100 text-xs">
        <TriangleAlert aria-hidden className="size-3" />
        Artifact missing
      </span>
    )
  }
  if (pack.installed) {
    if (pack.updateAvailable) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 font-medium text-amber-100 text-xs">
          <RefreshCw aria-hidden className="size-3" />
          Update available
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 font-medium text-emerald-100 text-xs">
        <CheckCircle2 aria-hidden className="size-3" />
        Installed
      </span>
    )
  }
  if (pack.dependencyStatus === 'missing') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 font-medium text-amber-100 text-xs">
        <TriangleAlert aria-hidden className="size-3" />
        Dependency needed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-cyan-200/25 bg-cyan-200/10 px-2 py-1 font-medium text-cyan-100 text-xs">
      <Cloud aria-hidden className="size-3" />
      Available
    </span>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="text-white/48 text-xs">{label}</div>
      <div className="mt-2 font-semibold text-2xl text-white">{value}</div>
    </div>
  )
}

function PackMeta({ pack }: { pack: AssetPackEntry }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2 text-xs">
      <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-white/62">
        v{pack.version}
      </span>
      <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-white/62">
        {formatBytes(pack.size)}
      </span>
      <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 font-mono text-white/62">
        {shortHash(pack.sha256)}
      </span>
      {pack.updateAvailable ? (
        <span className="rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-1 font-mono text-amber-100">
          {pack.installedSha256 && pack.installedSha256 !== pack.sha256
            ? `installed ${shortHash(pack.installedSha256)}`
            : 'dependency update needed'}
        </span>
      ) : null}
      {pack.sourceStatus?.status === 'dirty' ? (
        <span className="rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-amber-100">
          源码已变，需重新构建 cloud
        </span>
      ) : null}
      {pack.category ? (
        <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-white/62">
          {pack.category}
        </span>
      ) : null}
    </div>
  )
}

function InstallButton({
  busy,
  onInstall,
  pack,
}: {
  busy: boolean
  onInstall: (pack: AssetPackEntry) => void
  pack: AssetPackEntry
}) {
  const sourceDirty = pack.sourceStatus?.status === 'dirty'
  const label = sourceDirty
    ? '先构建 cloud'
    : pack.updateAvailable
      ? 'Update'
      : pack.installed
        ? 'Installed'
        : pack.kind === 'industry'
          ? 'Install industry pack'
          : 'Install component pack'

  return (
    <button
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-cyan-200/35 bg-cyan-200/12 px-3 font-medium text-cyan-50 text-sm transition-colors hover:bg-cyan-200/18 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={
        busy || sourceDirty || (!pack.updateAvailable && pack.installed) || !pack.artifactExists
      }
      onClick={() => onInstall(pack)}
      type="button"
    >
      {busy ? (
        <RefreshCw aria-hidden className="size-4 animate-spin" />
      ) : sourceDirty ? (
        <TriangleAlert aria-hidden className="size-4" />
      ) : pack.updateAvailable ? (
        <RefreshCw aria-hidden className="size-4" />
      ) : (
        <Download aria-hidden className="size-4" />
      )}
      {label}
    </button>
  )
}

function ComponentPackCard({
  busy,
  onInstall,
  pack,
}: {
  busy: boolean
  onInstall: (pack: AssetPackEntry) => void
  pack: AssetPackEntry
}) {
  return (
    <article className="rounded-lg border border-white/10 bg-[#11141a] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-cyan-100 text-xs">
            <Package aria-hidden className="size-4" />
            Component Pack
          </div>
          <h3 className="mt-2 font-semibold text-lg text-white">{pack.name}</h3>
          <p className="mt-2 text-sm text-white/58 leading-6">{pack.description ?? pack.id}</p>
        </div>
        <StatusBadge pack={pack} />
      </div>

      <PackMeta pack={pack} />

      <div className="mt-5">
        <div className="mb-2 font-medium text-sm text-white/78">Generators</div>
        <div className="flex flex-wrap gap-2">
          {(pack.generators ?? []).map((generator) => (
            <span
              className="rounded-md border border-[#a684ff]/20 bg-[#a684ff]/10 px-2 py-1 font-mono text-[#ded5ff] text-xs"
              key={generator}
            >
              {generator}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="truncate font-mono text-[11px] text-white/36">{pack.url}</div>
        <InstallButton busy={busy} onInstall={onInstall} pack={pack} />
      </div>
    </article>
  )
}

function IndustryPackCard({
  busy,
  onInstall,
  pack,
}: {
  busy: boolean
  onInstall: (pack: AssetPackEntry) => void
  pack: AssetPackEntry
}) {
  const preview = pack.previewSummary
  const outdatedDependencyIds = new Set(
    (pack.outdatedDependencies ?? []).map((dependency) => dependency.id),
  )
  return (
    <article className="rounded-lg border border-white/10 bg-[#11141a] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-emerald-100 text-xs">
            <Factory aria-hidden className="size-4" />
            Industry Pack
          </div>
          <h3 className="mt-2 font-semibold text-lg text-white">{pack.name}</h3>
          <p className="mt-2 text-sm text-white/58 leading-6">{pack.description ?? pack.id}</p>
        </div>
        <StatusBadge pack={pack} />
      </div>

      <PackMeta pack={pack} />

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Assemblies" value={preview?.assemblyCount ?? 0} />
        <Stat label="Connections" value={preview?.connectionCount ?? 0} />
        <Stat label="Quality" value={preview?.qualityPassed ? 'Passed' : 'Unknown'} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <div className="mb-2 font-medium text-sm text-white/78">Dependencies</div>
          <div className="space-y-2">
            {(pack.dependsOnComponentPacks ?? []).map((dependency) => (
              <div
                className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 text-sm"
                key={`${dependency.id}:${dependency.version ?? ''}`}
              >
                <span className="text-white/70">{dependencyLabel(dependency)}</span>
                <span className="text-cyan-100 text-xs">
                  {outdatedDependencyIds.has(dependency.id) ? 'update needed' : 'auto install'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 font-medium text-sm text-white/78">Preview stations</div>
          <div className="grid gap-2">
            {(preview?.stations ?? []).map((station) => (
              <div
                className="rounded-md border border-white/10 bg-white/[0.025] px-3 py-2"
                key={station.stationId ?? station.profileId}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-white/82">
                    {station.stationId ?? station.profileId}
                  </span>
                  <span className="text-white/42 text-xs">
                    {station.partCount ?? 0} parts / {station.portCount ?? 0} ports
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-white/42">
                  {station.generatorRef?.componentPack}/{station.generatorRef?.generator}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="truncate font-mono text-[11px] text-white/36">{pack.url}</div>
        <div className="flex items-center gap-2">
          <InstallButton busy={busy} onInstall={onInstall} pack={pack} />
        </div>
      </div>
    </article>
  )
}

export default function ProfilePacksPage() {
  const [data, setData] = useState<AssetCatalogResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/asset-packs/cloud', { cache: 'no-store' })
      setData(await jsonOrThrow(response))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const install = useCallback(async (pack: AssetPackEntry) => {
    const key = `${pack.kind}:${pack.id}@${pack.version}`
    setBusyKey(key)
    setError(null)
    try {
      const response = await fetch('/api/asset-packs/cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: pack.kind, id: pack.id, version: pack.version }),
      })
      setData(await jsonOrThrow(response))
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError))
    } finally {
      setBusyKey(null)
    }
  }, [])

  const catalog = data?.catalog
  const installed = data?.installed ?? []
  const installedLabel = useMemo(
    () =>
      installed.length
        ? installed.map((pack) => `${pack.id}@${pack.version}`).join(', ')
        : 'No packs installed yet',
    [installed],
  )

  return (
    <main className="min-h-screen bg-[#080a0f] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.028)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_74%_8%,rgba(45,212,191,0.14),transparent_34%),radial-gradient(circle_at_18%_20%,rgba(166,132,255,0.13),transparent_32%)]" />

      <div className="relative mx-auto w-full max-w-7xl px-5 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              className="inline-flex items-center gap-2 text-sm text-white/58 transition-colors hover:text-white"
              href="/"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Back to home
            </Link>
            <div className="mt-5 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-lg border border-cyan-200/20 bg-cyan-200/10 text-cyan-100">
                <Cloud aria-hidden className="size-5" />
              </span>
              <div>
                <h1 className="font-semibold text-3xl text-white">Cloud Asset Marketplace</h1>
                <p className="mt-1 text-sm text-white/52">
                  Component packs and industry packs from IndustrialPack cloud.
                </p>
              </div>
            </div>
          </div>

          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 font-medium text-sm text-white/76 transition-colors hover:bg-white/[0.075] disabled:opacity-50"
            disabled={loading}
            onClick={() => void load()}
            type="button"
          >
            <RefreshCw aria-hidden className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </header>

        {error ? (
          <div className="mt-6 rounded-lg border border-red-400/25 bg-red-400/10 p-4 text-red-100 text-sm">
            {error}
          </div>
        ) : null}

        <section className="mt-8 grid gap-3 md:grid-cols-5">
          <Stat label="Component packs" value={catalog?.summary.componentPackCount ?? 0} />
          <Stat label="Industry packs" value={catalog?.summary.industryPackCount ?? 0} />
          <Stat label="Generators" value={catalog?.summary.generatorCount ?? 0} />
          <Stat
            label="Installed components"
            value={catalog?.summary.installedComponentPackCount ?? 0}
          />
          <Stat
            label="Installed industries"
            value={catalog?.summary.installedIndustryPackCount ?? 0}
          />
        </section>

        <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
            <div>
              <div className="flex items-center gap-2 text-white/78 text-sm">
                <DatabaseZap aria-hidden className="size-4 text-cyan-100" />
                Cloud root
              </div>
              <div className="mt-2 break-all font-mono text-[11px] text-white/42">
                {catalog?.cloudRoot ?? 'Loading...'}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-white/78 text-sm">
                <ShieldCheck aria-hidden className="size-4 text-emerald-100" />
                Registry generated
              </div>
              <div className="mt-2 text-sm text-white/52">
                {catalog?.generatedAt ? new Date(catalog.generatedAt).toLocaleString() : 'Unknown'}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-white/78 text-sm">
                <Boxes aria-hidden className="size-4 text-[#d8ccff]" />
                Installed
              </div>
              <div className="mt-2 line-clamp-2 text-sm text-white/52">{installedLabel}</div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] text-cyan-100 uppercase">Reusable generators</p>
              <h2 className="mt-2 font-semibold text-2xl text-white">Component Packs</h2>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {(catalog?.componentPacks ?? []).map((pack) => (
              <ComponentPackCard
                busy={busyKey === `${pack.kind}:${pack.id}@${pack.version}`}
                key={`${pack.id}@${pack.version}`}
                onInstall={install}
                pack={pack}
              />
            ))}
          </div>
        </section>

        <section className="mt-10 pb-12">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] text-emerald-100 uppercase">Factory knowledge</p>
              <h2 className="mt-2 font-semibold text-2xl text-white">Industry Packs</h2>
            </div>
          </div>
          <div className="grid gap-4">
            {(catalog?.industryPacks ?? []).map((pack) => (
              <IndustryPackCard
                busy={busyKey === `${pack.kind}:${pack.id}@${pack.version}`}
                key={`${pack.id}@${pack.version}`}
                onInstall={install}
                pack={pack}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
