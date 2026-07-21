import { type NextRequest, NextResponse } from 'next/server'
import { guardSceneApiRequest, sceneApiJson } from '@/lib/scene-api-security'
import { getSceneOperations } from '@/lib/scene-store-server'
import { exportSuposRuntime } from '@/lib/supos-runtime-export'
import {
  getSuposRuntimeExportDownload,
  getSuposRuntimeExportJob,
  startSuposRuntimeExportJob,
} from '@/lib/supos-runtime-export-jobs'

export const runtime = 'nodejs'

function exportFailure(request: NextRequest, error: unknown) {
  const commandError = error as { message?: string; stderr?: string; stdout?: string }
  const detail = [commandError.message, commandError.stderr, commandError.stdout]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n')
  return sceneApiJson(
    request,
    {
      error: 'supos_export_failed',
      detail: detail || 'unknown_error',
    },
    { status: 500 },
  )
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = guardSceneApiRequest(request)
  if (guard) return guard
  const { id } = await params
  const scene = await (await getSceneOperations()).loadStoredScene(id)
  if (!scene) return sceneApiJson(request, { error: 'not_found' }, { status: 404 })

  if (request.nextUrl.searchParams.get('async') === '1') {
    const job = startSuposRuntimeExportJob({
      sceneId: id,
      sceneName: scene.name,
      graph: scene.graph,
    })
    return NextResponse.json(job, { status: 202 })
  }

  try {
    const exported = await exportSuposRuntime({
      sceneId: id,
      sceneName: scene.name,
      graph: scene.graph,
    })
    return new NextResponse(exported.body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${exported.fileName}"`,
      },
    })
  } catch (error) {
    return exportFailure(request, error)
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // A runtime image build can take several minutes. Its same-origin progress polling
  // must not consume the shared scene API request bucket during that wait.
  const guard = guardSceneApiRequest(request, { skipRateLimit: true })
  if (guard) return guard
  const { id } = await params
  const jobId = request.nextUrl.searchParams.get('job')
  if (!jobId) return sceneApiJson(request, { error: 'job_id_required' }, { status: 400 })

  if (request.nextUrl.searchParams.get('download') === '1') {
    const download = getSuposRuntimeExportDownload(id, jobId)
    if (!download) return sceneApiJson(request, { error: 'export_not_ready' }, { status: 409 })
    return new NextResponse(new Uint8Array(download.body), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${download.fileName}"`,
      },
    })
  }

  const job = getSuposRuntimeExportJob(id, jobId)
  if (!job) return sceneApiJson(request, { error: 'export_not_found' }, { status: 404 })
  return NextResponse.json(job)
}
