import { NextResponse } from 'next/server'
import { resolveArticraftMaxTurns } from '@/lib/ai-harness-runs/articraft-turn-budget'
import { createRun, listRecentRuns } from '@/lib/ai-harness-runs/run-store'
import type { AiHarnessRunMode } from '@/lib/ai-harness-runs/types'
import { parseJsonRequestBody } from '@/lib/request-json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clientRunId(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!/^run_[A-Za-z0-9._-]{1,96}$/.test(trimmed)) return undefined
  return trimmed
}

function scheduleRunStart(request: Request, runId: string) {
  const eventsUrl = new URL(
    `/api/ai-harness/runs/${encodeURIComponent(runId)}/events?after=0`,
    request.url,
  )
  setTimeout(() => {
    void fetch(eventsUrl)
      .then((response) => response.body?.cancel())
      .catch(() => {})
  }, 0)
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await parseJsonRequestBody(request)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const mode = body.mode
  if (
    !(mode === 'articraft' || mode === 'image-to-3d' || mode === 'primitive' || mode === 'factory')
  ) {
    return NextResponse.json({ error: 'Unsupported run mode' }, { status: 400 })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt && mode !== 'image-to-3d') {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  const image = isRecord(body.image)
    ? {
        name: typeof body.image.name === 'string' ? body.image.name : 'reference',
        type: typeof body.image.type === 'string' ? body.image.type : 'image/png',
        dataUrl: typeof body.image.dataUrl === 'string' ? body.image.dataUrl : '',
      }
    : undefined

  try {
    const run = await createRun({
      id: clientRunId(body.runId),
      conversationId: typeof body.conversationId === 'string' ? body.conversationId : 'default',
      sceneId:
        typeof body.sceneId === 'string' && body.sceneId.trim() ? body.sceneId.trim() : undefined,
      mode: mode as AiHarnessRunMode,
      prompt: prompt || 'Generate a 3D model from the reference image',
      articraftMode: body.articraftMode === 'static' ? 'static' : 'articulated',
      maxTurns: mode === 'articraft' ? resolveArticraftMaxTurns(prompt, body.maxTurns) : undefined,
      params: isRecord(body.params) ? body.params : undefined,
      context: body.context,
      image,
    })

    if (run.status !== 'cancelled') scheduleRunStart(request, run.id)

    return NextResponse.json({ runId: run.id, conversationId: run.conversationId, run })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function GET() {
  return NextResponse.json({ runs: await listRecentRuns() })
}
