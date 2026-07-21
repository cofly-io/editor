import { randomUUID } from 'node:crypto'
import type { SceneGraph } from '@pascal-app/editor/scene'
import { exportSuposRuntime } from './supos-runtime-export'

const JOB_TTL_MS = 30 * 60 * 1000

type ExportJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

type ExportJob = {
  id: string
  sceneId: string
  status: ExportJobStatus
  progress: number
  messages: string[]
  createdAt: string
  updatedAt: string
  error?: string
  fileName?: string
  body?: Buffer
}

export type SuposRuntimeExportJobSnapshot = Omit<ExportJob, 'body'>

const jobs = new Map<string, ExportJob>()

function snapshot(job: ExportJob): SuposRuntimeExportJobSnapshot {
  const { body: _body, ...result } = job
  return result
}

function cleanupExpiredJobs() {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (now - new Date(job.updatedAt).getTime() > JOB_TTL_MS) jobs.delete(id)
  }
}

function updateJob(job: ExportJob, update: Partial<ExportJob>) {
  Object.assign(job, update, { updatedAt: new Date().toISOString() })
}

function errorDetail(error: unknown): string {
  const commandError = error as { message?: string; stderr?: string; stdout?: string }
  return [commandError.message, commandError.stderr, commandError.stdout]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n')
}

export function startSuposRuntimeExportJob(input: {
  sceneId: string
  sceneName: string
  graph: SceneGraph
}): SuposRuntimeExportJobSnapshot {
  cleanupExpiredJobs()
  const now = new Date().toISOString()
  const job: ExportJob = {
    id: randomUUID(),
    sceneId: input.sceneId,
    status: 'queued',
    progress: 0,
    messages: [
      '\u5bfc\u51fa\u4efb\u52a1\u5df2\u521b\u5efa\uff0c\u6b63\u5728\u7b49\u5f85\u6267\u884c\u2026',
    ],
    createdAt: now,
    updatedAt: now,
  }
  jobs.set(job.id, job)

  void (async () => {
    updateJob(job, { status: 'running' })
    try {
      const exported = await exportSuposRuntime({
        ...input,
        onProgress: (message, progress) => {
          job.messages.push(message)
          updateJob(job, { progress })
        },
      })
      updateJob(job, {
        status: 'succeeded',
        progress: 100,
        fileName: exported.fileName,
        body: exported.body,
      })
    } catch (error) {
      updateJob(job, {
        status: 'failed',
        error: errorDetail(error) || 'unknown_error',
      })
    }
  })()

  return snapshot(job)
}

export function getSuposRuntimeExportJob(sceneId: string, jobId: string) {
  cleanupExpiredJobs()
  const job = jobs.get(jobId)
  return job?.sceneId === sceneId ? snapshot(job) : null
}

export function getSuposRuntimeExportDownload(sceneId: string, jobId: string) {
  cleanupExpiredJobs()
  const job = jobs.get(jobId)
  if (job?.sceneId !== sceneId || job.status !== 'succeeded' || !job.body || !job.fileName)
    return null
  return { body: job.body, fileName: job.fileName }
}
