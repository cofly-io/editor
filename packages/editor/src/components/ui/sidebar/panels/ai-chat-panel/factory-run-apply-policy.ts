function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function shouldWaitForFactoryApply(data: unknown) {
  const result = isRecord(data) ? data : {}
  const patches = Array.isArray(result.patches) ? result.patches : []
  const intent = isRecord(result.intent) ? result.intent : undefined
  const qualityReport = isRecord(result.qualityReport) ? result.qualityReport : undefined
  const missingAssets = Array.isArray(result.missingAssets) ? result.missingAssets : []
  const action = typeof intent?.action === 'string' ? intent.action : undefined
  const hasCreatePatches = patches.some((patch) => isRecord(patch) && patch.op === 'create')
  const hasRequiredMissingAssets = missingAssets.some(
    (item) => isRecord(item) && item.required === true,
  )
  return (
    hasCreatePatches &&
    action !== 'edit_selection' &&
    action !== 'missing' &&
    qualityReport?.passed !== false &&
    !hasRequiredMissingAssets
  )
}
