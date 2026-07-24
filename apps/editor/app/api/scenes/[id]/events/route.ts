import {
  guardSceneApiRequest,
  sceneApiJson,
  sceneApiPreflight,
  withSceneApiHeaders,
} from '@/lib/scene-api-security'
import { getSceneOperations } from '@/lib/scene-store-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

const POLL_MS = 1_000
const HEARTBEAT_MS = 15_000
const MAX_EVENTS_PER_POLL = 50

export function OPTIONS(request: Request) {
  return sceneApiPreflight(request)
}

export async function GET(request: Request, { params }: RouteParams) {
  const guard = guardSceneApiRequest(request)
  if (guard) return guard

  const { id } = await params
  const operations = await getSceneOperations()

  if (!operations.canGetLatestSceneEventId || !operations.canListSceneEvents) {
    return sceneApiJson(request, { error: 'scene_events_unavailable' }, { status: 501 })
  }

  const scene = await operations.loadStoredScene(id)
  if (!scene) {
    return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const afterFromQuery = Number.parseInt(url.searchParams.get('after') ?? '0', 10)
  const afterFromHeader = Number.parseInt(request.headers.get('Last-Event-ID') ?? '0', 10)
  const afterVersionFromQuery = Number.parseInt(url.searchParams.get('version') ?? '0', 10)
  const snapshotVersion =
    Number.isFinite(afterVersionFromQuery) && afterVersionFromQuery >= 0
      ? afterVersionFromQuery
      : 0
  let cursor = Math.max(
    0,
    Number.isFinite(afterFromQuery) ? afterFromQuery : 0,
    Number.isFinite(afterFromHeader) ? afterFromHeader : 0,
  )

  const encoder = new TextEncoder()
  let closed = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let polling = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk))
      }
      // This only observes queued stream bytes. A slow client that keeps
      // draining will not trip it, so POLL_MS and MAX_EVENTS_PER_POLL remain
      // the independent bounds on database work.
      const isBackpressured = () => controller.desiredSize !== null && controller.desiredSize <= 0

      const close = () => {
        if (closed) return
        closed = true
        if (pollTimer) clearTimeout(pollTimer)
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        try {
          controller.close()
        } catch {
          // The client may have already closed the stream.
        }
      }

      request.signal.addEventListener('abort', close, { once: true })
      enqueue('retry: 1000\n\n')

      const poll = async () => {
        if (closed) return
        if (polling) {
          pollTimer = setTimeout(poll, POLL_MS)
          return
        }
        if (isBackpressured()) {
          pollTimer = setTimeout(poll, POLL_MS)
          return
        }
        polling = true
        try {
          const latestEventId = await operations.getLatestSceneEventId(id)
          if (latestEventId <= cursor) return

          if (operations.canGetSceneEventCursorRange) {
            const range = await operations.getSceneEventCursorRange(id)
            if (cursor > 0 && range.earliestEventId > 0 && cursor < range.earliestEventId - 1) {
              cursor = latestEventId
              enqueue(`id: ${latestEventId}\n`)
              enqueue('event: snapshot-required\n')
              enqueue(
                `data: ${JSON.stringify({
                  sceneId: id,
                  snapshotUrl: `/api/scenes/${id}`,
                  snapshotVersion: range.snapshotVersion,
                  snapshotEventId: range.snapshotEventId,
                })}\n\n`,
              )
              return
            }
          }

          const events = await operations.listSceneEvents(id, {
            afterEventId: cursor,
            afterVersion: snapshotVersion,
            limit: MAX_EVENTS_PER_POLL,
          })
          if (events.length === 0) {
            // The loaded snapshot already includes these historic events. Move
            // the cursor forward without deserializing/replaying their graphs.
            cursor = latestEventId
            return
          }
          for (const event of events) {
            cursor = event.eventId
            enqueue(`id: ${event.eventId}\n`)
            enqueue('event: scene\n')
            enqueue(`data: ${JSON.stringify(event)}\n\n`)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          enqueue('event: error\n')
          enqueue(`data: ${JSON.stringify({ message })}\n\n`)
        } finally {
          polling = false
          if (!closed) pollTimer = setTimeout(poll, POLL_MS)
        }
      }

      heartbeatTimer = setInterval(() => {
        if (!isBackpressured()) enqueue(': keepalive\n\n')
      }, HEARTBEAT_MS)
      void poll()
    },
    cancel() {
      closed = true
      if (pollTimer) clearTimeout(pollTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
    },
  })

  return withSceneApiHeaders(
    request,
    new Response(stream, {
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no',
      },
    }),
  )
}
