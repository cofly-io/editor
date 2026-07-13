import type { GeneratedGeometryArtifact } from '../../../../../lib/ai-generated-geometry'
import type { ArticraftResult, FactoryRunSummary, GeneratedModelArtifact } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const GEOMETRY_REPAIR_COMPRESSION_INTERVAL = 4
export const GEOMETRY_REPAIR_STAGNATION_LIMIT = 4
const GEOMETRY_VISIBLE_RESULT_TAIL = 4

export function geometryRepairIssues(content: string) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ') && !line.startsWith('- Warning:'))
}

export function geometryRepairSignature(content: string) {
  const issues = geometryRepairIssues(content)
  if (issues.length > 0) return issues.slice().sort().join('|')
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('|')
}

export function compactGeometryRepairMemory(attempt: number, content: string) {
  const issues = geometryRepairIssues(content)
  const compactIssues = issues.length > 0 ? issues.slice(0, 10) : content.split('\n').slice(0, 6)
  return [`Attempt ${attempt} failed:`, ...compactIssues].join('\n')
}

export function formatVisibleGeometryResults(results: string[]) {
  if (results.length <= GEOMETRY_VISIBLE_RESULT_TAIL + 1) return results.join('\n')
  return [
    `Auto-repaired ${results.length} times; keeping latest ${GEOMETRY_VISIBLE_RESULT_TAIL} compressed context entries.`,
    ...results.slice(-GEOMETRY_VISIBLE_RESULT_TAIL),
  ].join('\n')
}

export function formatPrimitiveRunMessage(analysis: string | undefined, generate: string) {
  const trimmedAnalysis = analysis?.trim()
  return trimmedAnalysis
    ? `**Analysis:**\n${trimmedAnalysis}\n\n**Generate:**\n${generate}`
    : `**Generate:**\n${generate}`
}

export function formatFactoryRunResult(data: unknown) {
  const result = isRecord(data) ? data : {}
  const patches = Array.isArray(result.patches) ? result.patches : []
  const createPatchCount = patches.filter((patch) => isRecord(patch) && patch.op === 'create').length
  const updatePatchCount = patches.filter((patch) => isRecord(patch) && patch.op === 'update').length
  const deletePatchCount = patches.filter((patch) => isRecord(patch) && patch.op === 'delete').length
  const nodeIds = Array.isArray(result.nodeIds)
    ? result.nodeIds.map((id) => String(id)).filter(Boolean)
    : []
  const missingAssets = Array.isArray(result.missingAssets) ? result.missingAssets : []
  const editSummary = Array.isArray(result.editSummary)
    ? result.editSummary.map(String).filter(Boolean).slice(0, 6)
    : []
  const geometryRunId =
    typeof result.geometryRunId === 'string' ? result.geometryRunId : undefined
  const applied = result.applied === true
  const artifact = isRecord(result.artifact) ? result.artifact : undefined
  const artifactTitle =
    typeof artifact?.title === 'string'
      ? artifact.title
      : typeof artifact?.id === 'string'
        ? artifact.id
        : undefined
  const missingLines = missingAssets
    .map((item) => {
      if (!isRecord(item)) return null
      const name = typeof item.name === 'string' ? item.name : 'unknown'
      const reason = typeof item.reason === 'string' ? item.reason : 'not resolved'
      return `- ${name}: ${reason}`
    })
    .filter(Boolean)
  const layoutDiagnostics = isRecord(result.layoutDiagnostics)
    ? result.layoutDiagnostics
    : undefined
  const layoutDiagnosticCount = Array.isArray(layoutDiagnostics?.diagnostics)
    ? layoutDiagnostics.diagnostics.length
    : 0
  const layoutStrategy = isRecord(result.layoutStrategy) ? result.layoutStrategy : undefined
  const layoutStyle =
    typeof layoutStrategy?.style === 'string' ? ` via ${layoutStrategy.style}` : ''
  const layoutLine = layoutDiagnostics
    ? `- Layout: ${layoutDiagnostics.fits === true ? 'fits' : 'needs review'}${layoutStyle} (${layoutDiagnosticCount} diagnostics)`
    : undefined
  const qualityReport = isRecord(result.qualityReport) ? result.qualityReport : undefined
  const qualityScore =
    typeof qualityReport?.score === 'number' ? Math.round(qualityReport.score) : undefined
  const qualityPassed =
    typeof qualityReport?.passed === 'boolean' ? qualityReport.passed : undefined
  const qualityIssues = Array.isArray(qualityReport?.issues) ? qualityReport.issues : []
  const qualityIssueLines = qualityIssues
    .slice(0, 3)
    .map((item) => {
      if (!isRecord(item)) return null
      const severity = typeof item.severity === 'string' ? item.severity : 'issue'
      const message = typeof item.message === 'string' ? item.message : undefined
      return message ? `- ${severity}: ${message}` : null
    })
    .filter(Boolean)
  const qualityLine =
    qualityScore == null
      ? undefined
      : `- Quality: ${qualityPassed ? 'passed' : 'needs review'} (${qualityScore}/100, ${qualityIssues.length} issues)`

  return [
    '**Factory draft:**',
    artifactTitle ? `- Geometry artifact: ${artifactTitle}` : '- Geometry artifact: none',
    updatePatchCount > 0 || deletePatchCount > 0
      ? `- Scene patches: ${patches.length} (${createPatchCount} create, ${updatePatchCount} update, ${deletePatchCount} delete)`
      : `- Create patches: ${createPatchCount}`,
    layoutLine,
    qualityLine,
    nodeIds.length ? `- Node ids: ${nodeIds.join(', ')}` : '- Node ids: none',
    geometryRunId ? `- Geometry run: ${geometryRunId}` : undefined,
    `- Applied to canvas: ${applied ? 'yes' : 'no'}`,
    editSummary.length ? `\n**Edits:**\n${editSummary.map((line) => `- ${line}`).join('\n')}` : undefined,
    missingLines.length ? `\n**Missing assets:**\n${missingLines.join('\n')}` : undefined,
    qualityIssueLines.length ? `\n**Quality issues:**\n${qualityIssueLines.join('\n')}` : undefined,
    applied
      ? '\nPatches were applied to the current canvas.'
      : '\nPatches are prepared for review only. Nothing was applied to the canvas.',
  ]
    .filter(Boolean)
    .join('\n')
}

type DeviceGenerationRoute = 'primitive' | 'image-to-3d' | 'articraft'

function deviceRouteLabel(mode: DeviceGenerationRoute) {
  if (mode === 'primitive') return '几何搭建'
  if (mode === 'image-to-3d') return '图生建模'
  return '关节资产'
}

function deviceRunIcon(mode: DeviceGenerationRoute) {
  if (mode === 'primitive') return 'mdi:shape-plus'
  if (mode === 'image-to-3d') return 'mdi:image-sync-outline'
  return 'mdi:axis-arrow'
}

function deviceResultTitle(mode: DeviceGenerationRoute) {
  if (mode === 'primitive') return '设备几何已生成'
  if (mode === 'image-to-3d') return '设备模型已生成'
  return '关节设备已生成'
}

export function buildDeviceProgressSummary(input: {
  mode: DeviceGenerationRoute
  message?: string
  detailLines?: string[]
  analysis?: string
}): FactoryRunSummary {
  const details = [
    ...(input.analysis ? [`Analysis: ${input.analysis}`] : []),
    ...(input.detailLines ?? []),
  ]
    .filter(Boolean)
    .slice(-6)
    .join('\n')
  const routeLabel = deviceRouteLabel(input.mode)
  const description =
    input.message?.trim() ||
    `正在按“${routeLabel}”路线创建设备，生成过程会先拆解需求，再输出可应用到画布的资产。`

  if (input.mode === 'image-to-3d') {
    return {
      title: '正在创建设备',
      icon: deviceRunIcon(input.mode),
      status: 'running',
      description,
      steps: [
        { label: '理解设备需求', status: 'done' },
        { label: '图像理解', status: 'done' },
        { label: '图生建模', status: 'running' },
        { label: '资产检查', status: 'pending' },
        { label: '应用到画布', status: 'pending' },
      ],
      metrics: [{ label: '路线', value: routeLabel }],
      ...(details ? { details } : {}),
    }
  }

  if (input.mode === 'articraft') {
    return {
      title: '正在创建设备',
      icon: deviceRunIcon(input.mode),
      status: 'running',
      description,
      steps: [
        { label: '理解设备需求', status: 'done' },
        { label: '结构拆解/连杆拓扑', status: 'done' },
        { label: '关节资产', status: 'running' },
        { label: '姿态/关节检查', status: 'pending' },
        { label: '应用到画布', status: 'pending' },
      ],
      metrics: [{ label: '路线', value: routeLabel }],
      ...(details ? { details } : {}),
    }
  }

  return {
    title: '正在创建设备',
    icon: deviceRunIcon(input.mode),
    status: 'running',
    description,
    steps: [
      { label: '理解设备需求', status: 'done' },
      { label: '设备画像/Profile 匹配', status: 'done' },
      { label: '结构拆解/部件拓扑', status: input.analysis ? 'done' : 'running' },
      { label: '几何搭建', status: 'running' },
      { label: '质量检查', status: 'pending' },
      { label: '应用到画布', status: 'pending' },
    ],
    metrics: [{ label: '路线', value: routeLabel }],
    ...(details ? { details } : {}),
  }
}

export function buildPrimitiveResultSummary(artifact: GeneratedGeometryArtifact | undefined): FactoryRunSummary {
  const quality = artifact?.profileQuality
  const qualityScore = typeof quality?.overallScore === 'number' ? Math.round(quality.overallScore * 100) : undefined
  const hasIssues = Boolean(quality?.issues?.length)
  const shapeCount = artifact?.shapes.length ?? 0
  const createdCount = artifact?.createdNames.length ?? 0
  const sourceArgs = artifact?.sourceArgs ?? {}
  const profileId =
    typeof sourceArgs.deviceProfile === 'string'
      ? sourceArgs.deviceProfile
      : typeof sourceArgs.profile === 'string'
        ? sourceArgs.profile
        : undefined
  const metrics: FactoryRunSummary['metrics'] = [
    { label: '几何体', value: `${shapeCount}` },
    { label: '部件', value: `${createdCount}` },
  ]
  if (profileId) metrics.push({ label: 'Profile', value: profileId })
  if (qualityScore != null) metrics.push({ label: '质量', value: `${qualityScore}/100` })

  return {
    title: artifact ? deviceResultTitle('primitive') : '设备几何需要检查',
    icon: deviceRunIcon('primitive'),
    status: artifact && !hasIssues ? 'succeeded' : artifact ? 'failed' : 'failed',
    description: artifact
      ? '已生成可编辑的设备几何，可继续修改、保存到资料库，或应用到当前画布。'
      : '这次几何生成没有返回可用设备资产。',
    steps: [
      { label: '理解设备需求', status: 'done' },
      { label: profileId ? `设备画像/Profile ${profileId}` : '设备画像/Profile 匹配', status: 'done' },
      { label: '结构拆解/部件拓扑', status: 'done' },
      { label: '几何搭建', status: artifact ? 'done' : 'failed' },
      {
        label: `质量检查 ${hasIssues ? '需复核' : '通过'}`,
        status: hasIssues ? 'failed' : 'done',
      },
      { label: '应用到画布', status: artifact?.placedAt ? 'done' : 'pending' },
    ],
    metrics,
  }
}

export function buildPrimitiveResourceSelectionSummary(resourceSelection: unknown): FactoryRunSummary {
  const candidates =
    isRecord(resourceSelection) && Array.isArray(resourceSelection.candidates)
      ? resourceSelection.candidates
      : []
  const resourceOptions = candidates
    .map((candidate) => {
      if (!isRecord(candidate)) return null
      const id = typeof candidate.profileId === 'string' ? candidate.profileId : ''
      const label =
        typeof candidate.matchedLabel === 'string' && candidate.matchedLabel.trim()
          ? candidate.matchedLabel
          : typeof candidate.name === 'string'
            ? candidate.name
            : id
      const description =
        typeof candidate.usageHint === 'string'
          ? candidate.usageHint
          : typeof candidate.description === 'string'
            ? candidate.description
            : '适合该行业包中同名或近义设备场景。'
      return id
        ? {
            id,
            label,
            description,
            recommended: candidate.recommended === true,
            prompt: `生成一个${label}（${id}）`,
          }
        : null
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
  return {
    title: '需要选择设备资源',
    icon: deviceRunIcon('primitive'),
    status: 'needs_input',
    description:
      '已从行业资源包找到多个可能设备。默认建议选带“推荐”的设备；如果你的工艺语义更具体，再选择对应设备。',
    steps: [
      { label: '理解设备需求', status: 'done' },
      { label: '行业资源匹配', status: 'done' },
      { label: '等待选择设备', status: 'pending' },
      { label: '几何搭建', status: 'pending' },
      { label: '应用到画布', status: 'pending' },
    ],
    metrics: [
      { label: '候选', value: `${candidates.length}` },
      { label: '路线', value: deviceRouteLabel('primitive') },
    ],
    resourceOptions,
  }
}

export function buildImageTo3DResultSummary(artifact: GeneratedModelArtifact): FactoryRunSummary {
  return {
    title: deviceResultTitle('image-to-3d'),
    icon: deviceRunIcon('image-to-3d'),
    status: 'succeeded',
    description: '图生建模已生成设备外观资产，可应用到画布或保存到资料库。',
    steps: [
      { label: '理解设备需求', status: 'done' },
      { label: '图像理解', status: 'done' },
      { label: '图生建模', status: 'done' },
      { label: '资产检查 通过', status: 'done' },
      { label: '应用到画布', status: artifact.placedAt ? 'done' : 'pending' },
    ],
    metrics: [
      { label: '路线', value: deviceRouteLabel('image-to-3d') },
      { label: 'Provider', value: artifact.provider },
      { label: '资产', value: artifact.asset.id },
    ],
  }
}

export function buildArticraftResultSummary(result: ArticraftResult): FactoryRunSummary {
  return {
    title: deviceResultTitle('articraft'),
    icon: deviceRunIcon('articraft'),
    status: 'succeeded',
    description: '已生成带 links/joints 的设备资产，可查看源记录、导入画布并应用姿态。',
    steps: [
      { label: '理解设备需求', status: 'done' },
      { label: '结构拆解/连杆拓扑', status: 'done' },
      { label: '关节资产', status: result.jointCount > 0 ? 'done' : 'failed' },
      { label: `姿态/关节检查 ${result.jointCount > 0 ? '通过' : '需复核'}`, status: result.jointCount > 0 ? 'done' : 'failed' },
      { label: '应用到画布', status: result.status === 'imported' ? 'done' : 'pending' },
    ],
    metrics: [
      { label: '路线', value: deviceRouteLabel('articraft') },
      { label: 'Parts', value: `${result.partCount}` },
      { label: 'Joints', value: `${result.jointCount}` },
    ],
  }
}

function factoryPlanKindLabel(value: unknown) {
  if (value === 'layout') return '\u5de5\u5382/\u5efa\u7b51\u5e03\u5c40'
  if (value === 'process_line') return '\u5de5\u827a\u4ea7\u7ebf'
  if (value === 'catalog_item') return '\u56fa\u5b9a\u8d44\u4ea7'
  if (value === 'geometry') return '\u8bbe\u5907\u51e0\u4f55'
  if (value === 'missing') return '\u7f3a\u5c11\u884c\u4e1a\u5305'
  return '\u5de5\u5382\u4efb\u52a1'
}

function factoryStageLabel(value: unknown) {
  if (value === 'factory-plan') return '\u89c4\u5212\u5de5\u5382\u65b9\u6848'
  if (value === 'selection-edit') return '\u4fee\u6539\u5df2\u9009\u5bf9\u8c61'
  if (value === 'patch-plan') return '\u751f\u6210\u573a\u666f\u53d8\u66f4'
  return '\u5904\u7406\u5de5\u5382\u8bf7\u6c42'
}

function hasReadableHanText(value: string | undefined) {
  return typeof value === 'string' && /[\u4e00-\u9fff]/.test(value)
}

export function buildFactoryProgressSummary(input: {
  stage?: unknown
  planKind?: unknown
  message?: string
  patchCount?: number
  missingAssetCount?: number
  detailLines?: string[]
}): FactoryRunSummary {
  const stageLabel = factoryStageLabel(input.stage)
  const planLabel = factoryPlanKindLabel(input.planKind)
  const details = input.detailLines?.filter(Boolean).slice(-6).join('\n')
  const description = hasReadableHanText(input.message)
    ? input.message!.trim()
    : input.stage === 'patch-plan'
      ? '\u573a\u666f\u53d8\u66f4\u5df2\u7ecf\u751f\u6210\uff0c\u6b63\u5728\u7b49\u5f85\u6700\u7ec8\u7ed3\u679c\u3002'
      : `${stageLabel}\u4e2d\uff0c\u7cfb\u7edf\u4f1a\u628a\u673a\u5668\u6570\u636e\u9690\u85cf\u5728\u540e\u53f0\u3002`
  const metrics: FactoryRunSummary['metrics'] = []
  if (input.patchCount != null) metrics.push({ label: '\u573a\u666f\u53d8\u66f4', value: `${input.patchCount}` })
  if (input.missingAssetCount != null) {
    metrics.push({ label: '\u672a\u89e3\u6790\u8d44\u6e90', value: `${input.missingAssetCount}` })
  }
  return {
    title: '\u6b63\u5728\u521b\u5efa\u5de5\u5382',
    status: 'running',
    description,
    steps: [
      { label: '\u7406\u89e3\u9700\u6c42', status: 'done' },
      {
        label: planLabel === '\u5de5\u5382\u4efb\u52a1' ? stageLabel : planLabel,
        status: input.stage === 'patch-plan' ? 'done' : 'running',
      },
      { label: '\u751f\u6210\u573a\u666f\u53d8\u66f4', status: input.stage === 'patch-plan' ? 'running' : 'pending' },
      { label: '\u5e94\u7528\u5230\u753b\u5e03', status: 'pending' },
    ],
    metrics,
    ...(details ? { details } : {}),
  }
}

export function formatFactoryRunFailureMessage(message: string | undefined) {
  const text = typeof message === 'string' ? message.trim() : ''
  if (
    /invalid_union|Zod|expected string|expected number|Invalid input/i.test(text) ||
    /\[\s*\{\s*"code"\s*:\s*"invalid_union"/.test(text)
  ) {
    return [
      '\u6ca1\u6709\u627e\u5230\u80fd\u652f\u6301\u8fd9\u7c7b\u5de5\u5382\u7684\u884c\u4e1a\u5305\u3002',
      '',
      '\u8bf7\u5148\u524d\u5f80\u884c\u4e1a\u8d44\u6e90\u5305\u9875\u9762\uff0c\u4e0b\u8f7d\u6216\u542f\u7528\u5bf9\u5e94\u7684\u5de5\u5382\u884c\u4e1a\u5305\u540e\u518d\u751f\u6210\u3002',
      '',
      '\u884c\u4e1a\u8d44\u6e90\u5305\uff1a/profile-packs',
    ].join('\n')
  }
  if (!text) return '\u751f\u6210\u5931\u8d25\u3002\u8bf7\u68c0\u67e5\u884c\u4e1a\u5305\u662f\u5426\u5df2\u5b89\u88c5\u5e76\u542f\u7528\u3002'
  return text
}

export function buildFactoryResultSummary(data: unknown): FactoryRunSummary {
  const result = isRecord(data) ? data : {}
  const patches = Array.isArray(result.patches) ? result.patches : []
  const createPatchCount = patches.filter((patch) => isRecord(patch) && patch.op === 'create').length
  const updatePatchCount = patches.filter((patch) => isRecord(patch) && patch.op === 'update').length
  const deletePatchCount = patches.filter((patch) => isRecord(patch) && patch.op === 'delete').length
  const nodeIds = Array.isArray(result.nodeIds)
    ? result.nodeIds.map((id) => String(id)).filter(Boolean)
    : []
  const created = Array.isArray(result.created)
    ? result.created.map((item) => String(item)).filter(Boolean)
    : []
  const missingAssets = Array.isArray(result.missingAssets) ? result.missingAssets : []
  const requiredMissingAssets = missingAssets.some((item) => isRecord(item) && item.required === true)
  const qualityReport = isRecord(result.qualityReport) ? result.qualityReport : undefined
  const qualityScore =
    typeof qualityReport?.score === 'number' ? Math.round(qualityReport.score) : undefined
  const qualityPassed =
    typeof qualityReport?.passed === 'boolean' ? qualityReport.passed : undefined
  const qualityIssues = Array.isArray(qualityReport?.issues) ? qualityReport.issues : []
  const layoutDiagnostics = isRecord(result.layoutDiagnostics)
    ? result.layoutDiagnostics
    : undefined
  const layoutFits = typeof layoutDiagnostics?.fits === 'boolean' ? layoutDiagnostics.fits : undefined
  const artifact = isRecord(result.artifact) ? result.artifact : undefined
  const artifactTitle =
    typeof artifact?.title === 'string'
      ? artifact.title
      : typeof artifact?.id === 'string'
        ? artifact.id
        : undefined
  const intent = isRecord(result.intent) ? result.intent : undefined
  const action = typeof intent?.action === 'string' ? intent.action : undefined
  const succeeded = action !== 'missing' && !requiredMissingAssets && qualityPassed !== false
  const missingIndustryPack = action === 'missing' && missingAssets.length > 0 && patches.length === 0
  const applied = result.applied === true
  const details = formatFactoryRunResult(result)

  const readableCreated = created.slice(0, 4).join('\u3001')
  const missingName = missingAssets
    .map((item) => (isRecord(item) && typeof item.name === 'string' ? item.name : undefined))
    .find(Boolean)
  const description = missingIndustryPack
    ? `\u9700\u8981\u5148\u5b89\u88c5\u6216\u542f\u7528\u884c\u4e1a\u5305\uff1a${missingName ?? '\u672a\u5339\u914d\u7684\u884c\u4e1a\u8d44\u6e90'}\u3002\u8fd9\u6b21\u4e0d\u4f1a\u751f\u6210\u7a7a\u767d\u901a\u7528\u5382\u623f\u3002`
    : succeeded
      ? applied
        ? `\u5df2\u751f\u6210\u5e76\u5e94\u7528\u5230\u753b\u5e03${readableCreated ? `\uff1a${readableCreated}` : ''}\u3002`
        : '\u5df2\u751f\u6210\u573a\u666f\u53d8\u66f4\uff0c\u7b49\u5f85\u5e94\u7528\u5230\u753b\u5e03\u3002'
      : '\u8fd9\u6b21\u8bf7\u6c42\u6ca1\u6709\u5b8c\u5168\u751f\u6210\uff0c\u53ef\u67e5\u770b\u7f3a\u5931\u9879\u6216\u8d28\u91cf\u63d0\u793a\u3002'

  const metrics: FactoryRunSummary['metrics'] = [
    { label: '\u65b0\u589e', value: `${createPatchCount}` },
    { label: '\u4fee\u6539', value: `${updatePatchCount}` },
    { label: '\u5220\u9664', value: `${deletePatchCount}` },
    { label: '\u8282\u70b9', value: `${nodeIds.length}` },
  ]
  if (qualityScore != null) metrics.push({ label: '\u8d28\u91cf', value: `${qualityScore}/100` })
  if (missingAssets.length > 0) metrics.push({ label: '\u7f3a\u5931', value: `${missingAssets.length}` })

  return {
    title: succeeded ? '\u5de5\u5382\u5df2\u521b\u5efa' : missingIndustryPack ? '\u9700\u8981\u5b89\u88c5\u884c\u4e1a\u5305' : '\u5de5\u5382\u521b\u5efa\u9700\u8981\u68c0\u67e5',
    status: succeeded ? 'succeeded' : missingIndustryPack ? 'needs_input' : 'failed',
    description,
    steps: [
      { label: '\u7406\u89e3\u9700\u6c42', status: 'done' },
      { label: factoryPlanKindLabel(isRecord(result.plan) ? result.plan.kind : undefined), status: 'done' },
      {
        label: artifactTitle ? `\u751f\u6210 ${artifactTitle}` : missingIndustryPack ? '\u7b49\u5f85\u884c\u4e1a\u5305' : '\u751f\u6210\u573a\u666f\u53d8\u66f4',
        status: patches.length > 0 ? 'done' : succeeded ? 'done' : missingIndustryPack ? 'pending' : 'failed',
      },
      { label: '\u5e94\u7528\u5230\u753b\u5e03', status: applied ? 'done' : succeeded ? 'pending' : missingIndustryPack ? 'pending' : 'failed' },
      ...(qualityScore == null
        ? []
        : [
            {
              label: `\u8d28\u91cf\u68c0\u67e5${qualityPassed ? '\u901a\u8fc7' : '\u9700\u590d\u6838'}`,
              status: qualityPassed ? ('done' as const) : ('failed' as const),
            },
          ]),
      ...(layoutFits == null
        ? []
        : [
            {
              label: `\u5e03\u5c40\u68c0\u67e5${layoutFits ? '\u901a\u8fc7' : '\u9700\u590d\u6838'}`,
              status: layoutFits ? ('done' as const) : ('failed' as const),
            },
          ]),
      ...(qualityIssues.length > 0
        ? [
            {
              label: `\u8d28\u91cf\u63d0\u793a ${qualityIssues.length} \u6761`,
              status: qualityPassed ? ('done' as const) : ('failed' as const),
            },
          ]
        : []),
    ],
    metrics,
    ...(missingIndustryPack
      ? {
          resourceOptions: [
            {
              id: 'manage-industry-profile-packs',
              label: '\u884c\u4e1a\u8d44\u6e90\u5305',
              description:
                '\u524d\u5f80\u884c\u4e1a\u8d44\u6e90\u5305\u9875\u9762\uff0c\u4e0b\u8f7d\u6216\u5bfc\u5165\u5bf9\u5e94\u7684\u5de5\u5382\u884c\u4e1a\u5305\u540e\u518d\u751f\u6210\u3002',
              recommended: true,
              prompt: '',
              actionHref: '/profile-packs',
              actionLabel: '\u524d\u5f80\u884c\u4e1a\u8d44\u6e90\u5305',
            },
          ],
        }
      : {}),
    details,
  }
}
