const UNRECOVERABLE_GPU_ERROR_MESSAGES = [
  'a valid external instance reference no longer exists',
  'device was destroyed',
  'gpu device was lost',
  'device lost',
  'operationerror: instance dropped',
  'instance dropped in poperrorscope',
]

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

export function isUnrecoverableGpuError(error: unknown): boolean {
  if (isGpuOutOfMemoryError(error)) return true
  if (!error || typeof error !== 'object') return false

  const candidate = error as { name?: unknown; message?: unknown }
  const name = typeof candidate.name === 'string' ? candidate.name.toLowerCase() : ''
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : ''

  if (name.includes('gpuinternalerror') || name.includes('operationerror')) {
    return UNRECOVERABLE_GPU_ERROR_MESSAGES.some((pattern) => message.includes(pattern))
  }

  return UNRECOVERABLE_GPU_ERROR_MESSAGES.some((pattern) => message.includes(pattern))
}

export function isUnrecoverableGpuDeviceLoss(info: { reason?: unknown } | null | undefined) {
  const reason = typeof info?.reason === 'string' ? info.reason.toLowerCase() : 'unknown'
  return reason !== 'destroyed'
}
