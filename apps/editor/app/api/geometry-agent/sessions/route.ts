import { NextResponse } from 'next/server'
import {
  createGeometryAgentSessionFromRequest,
  GeometryAgentHttpError,
} from '@/lib/geometry-agent/geometry-agent-service'
import { parseJsonRequestBody } from '@/lib/request-json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await parseJsonRequestBody(request)
    return NextResponse.json(
      await createGeometryAgentSessionFromRequest(body, { signal: request.signal }),
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
