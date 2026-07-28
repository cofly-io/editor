import { NextResponse } from 'next/server'
import {
  GeometryAgentHttpError,
  sendGeometryAgentMessageFromRequest,
} from '@/lib/geometry-agent/geometry-agent-service'
import { parseJsonRequestBody } from '@/lib/request-json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ sessionId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { sessionId } = await params
    const body = await parseJsonRequestBody(request)
    return NextResponse.json(
      await sendGeometryAgentMessageFromRequest(sessionId, body, { signal: request.signal }),
    )
  } catch (error) {
    return geometryAgentErrorResponse(error)
  }
}

function geometryAgentErrorResponse(error: unknown) {
  if (error instanceof GeometryAgentHttpError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status },
    )
  }
  const message = error instanceof Error ? error.message : String(error)
  return NextResponse.json({ error: 'geometry_agent_failed', message }, { status: 500 })
}
