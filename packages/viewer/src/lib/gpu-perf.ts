// WebGPU queue-completion telemetry, gated by `?perf` in the URL.
//
// `device.queue.onSubmittedWorkDone()` reports when work already submitted to
// the queue has completed. It is useful for detecting queue pressure, but is
// not a timestamp-query measurement of one frame's GPU execution time.

const DEFAULT_PERF_TARGET_FPS = 120
const MAX_PERF_TARGET_FPS = 240

const perfParams =
  typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)

export const PERF_OVERLAY_ENABLED = perfParams?.has('perf') ?? false
export const PERF_TARGET_FPS = getPerfTargetFps(perfParams?.get('perfFps') ?? null)

const MAX_SAMPLES = 256
const queueWaitSamples: number[] = []

export function getPerfTargetFps(raw: string | null): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PERF_TARGET_FPS
  return Math.min(Math.round(parsed), MAX_PERF_TARGET_FPS)
}

export function pushQueueWaitSample(ms: number): void {
  queueWaitSamples.push(ms)
  if (queueWaitSamples.length > MAX_SAMPLES) queueWaitSamples.shift()
}

export function drainQueueWaitSamples(): number[] {
  if (queueWaitSamples.length === 0) return []
  const out = queueWaitSamples.slice()
  queueWaitSamples.length = 0
  return out
}
