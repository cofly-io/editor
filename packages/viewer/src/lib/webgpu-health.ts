export function isGpuOutOfMemoryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { name?: unknown; message?: unknown }
  const name = typeof candidate.name === 'string' ? candidate.name.toLowerCase() : ''
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : ''
  return (
    name.includes('gpuoutofmemory') ||
    name.includes('outofmemory') ||
    message.includes('gpu out of memory') ||
    message.includes('out of memory')
  )
}
