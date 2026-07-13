import { NextResponse } from 'next/server'
import {
  type AssetPackKind,
  installAssetCloudPack,
  listAssetCloudCatalog,
  listInstalledAssetPacks,
} from '@/lib/asset-packs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function packKind(value: unknown): AssetPackKind | undefined {
  return value === 'component' || value === 'industry' ? value : undefined
}

export async function GET() {
  try {
    const [catalog, installed] = await Promise.all([
      listAssetCloudCatalog(),
      listInstalledAssetPacks(),
    ])
    return NextResponse.json({ catalog, installed })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'asset_cloud_read_failed', message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const kind = packKind(body.kind)
  const id = typeof body.id === 'string' ? body.id : undefined
  if (!kind || !id) {
    return NextResponse.json({ error: 'kind_and_id_required' }, { status: 400 })
  }

  try {
    const result = await installAssetCloudPack(
      kind,
      id,
      typeof body.version === 'string' ? body.version : undefined,
    )
    const [catalog, installed] = await Promise.all([
      listAssetCloudCatalog(),
      listInstalledAssetPacks(),
    ])
    return NextResponse.json({ ok: true, ...result, catalog, installed })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'asset_pack_install_failed', message }, { status: 400 })
  }
}
