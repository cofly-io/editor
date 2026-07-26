import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { NextRequest } from 'next/server'
import {
  sceneThumbnailContentType,
  sceneThumbnailPath,
} from '@/lib/scene-thumbnail-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ file: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { file } = await params
  let bytes: Buffer
  try {
    bytes = await readFile(sceneThumbnailPath(file))
  } catch {
    return new Response('Not Found', { status: 404 })
  }

  const etag = `"${createHash('sha256').update(bytes).digest('base64url')}"`
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        'Cache-Control': 'private, max-age=0, must-revalidate',
        ETag: etag,
      },
    })
  }

  const body = new Uint8Array(bytes.length)
  body.set(bytes)
  return new Response(body, {
    headers: {
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'Content-Type': sceneThumbnailContentType(file) ?? 'application/octet-stream',
      ETag: etag,
    },
  })
}
