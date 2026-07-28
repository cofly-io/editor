import type { DSLDiagnostic } from '@pascal-app/core/lib/generated-geometry-dsl-contract'
import { type GenerationRouteDecision, NO_SIGNALS } from '../ai-harness-runs/generation-route'
import type { DslRunResult } from '../ai-harness-runs/generator-dsl-run'

const EQUIPMENT_CALLS = [
  'equipment',
  'boxFrame',
  'belt',
  'rollerArray',
  'guardCover',
  'motor',
  'inspectionDoor',
  'nameplate',
  'sheetCover',
  'flangePort',
  'pipeRun',
  'controlCabinet',
] as const

type EquipmentCallName = (typeof EQUIPMENT_CALLS)[number]

type SourceCall = {
  name: EquipmentCallName
  id: string
  text: string
}

export type PatchLocalityIssue = {
  code:
    | 'geometry_agent_removed_existing_id'
    | 'geometry_agent_changed_unrelated_call'
    | 'geometry_agent_rewrote_too_much'
  message: string
  hint: string
}

export type PatchLocalityReview = {
  passed: boolean
  localEdit: boolean
  allowedFunctions: EquipmentCallName[]
  issues: PatchLocalityIssue[]
  beforeIds: string[]
  afterIds: string[]
  changedIds: string[]
  addedIds: string[]
  removedIds: string[]
}

export function reviewGeometryAgentPatchLocality(input: {
  instruction: string
  beforeSource: string
  afterSource: string
}): PatchLocalityReview {
  const before = extractEquipmentCalls(input.beforeSource)
  const after = extractEquipmentCalls(input.afterSource)
  const allowedFunctions = allowedFunctionsForInstruction(input.instruction)
  const localEdit = allowedFunctions.length > 0
  const beforeById = new Map(before.map((call) => [call.id, call]))
  const afterById = new Map(after.map((call) => [call.id, call]))
  const removedIds = before.filter((call) => !afterById.has(call.id)).map((call) => call.id)
  const addedIds = after.filter((call) => !beforeById.has(call.id)).map((call) => call.id)
  const changedIds = before
    .filter((call) => {
      const next = afterById.get(call.id)
      return next && normalizeCallText(next.text) !== normalizeCallText(call.text)
    })
    .map((call) => call.id)

  const issues: PatchLocalityIssue[] = []
  if (!localEdit) {
    return {
      passed: true,
      localEdit,
      allowedFunctions,
      issues,
      beforeIds: before.map((call) => call.id),
      afterIds: after.map((call) => call.id),
      changedIds,
      addedIds,
      removedIds,
    }
  }

  for (const id of removedIds) {
    issues.push({
      code: 'geometry_agent_removed_existing_id',
      message: `Local edit removed existing stable id "${id}".`,
      hint: 'Restore existing IDs and only add/remove parts explicitly requested by the user.',
    })
  }

  for (const id of changedIds) {
    const call = beforeById.get(id)
    if (call && !allowedFunctions.includes(call.name)) {
      issues.push({
        code: 'geometry_agent_changed_unrelated_call',
        message: `Local edit changed unrelated ${call.name}("${id}").`,
        hint: `Only change ${allowedFunctions.join(', ')} for this instruction; preserve belt/frame/motor and unrelated source.`,
      })
    }
  }

  const preservedRatio =
    before.length === 0 ? 1 : before.filter((call) => afterById.has(call.id)).length / before.length
  const totalDelta = changedIds.length + addedIds.length + removedIds.length
  if (before.length >= 4 && (preservedRatio < 0.75 || totalDelta > Math.max(4, before.length))) {
    issues.push({
      code: 'geometry_agent_rewrote_too_much',
      message: 'Local edit rewrote too much of the equipment source.',
      hint: 'Patch the existing source locally instead of regenerating the whole assembly.',
    })
  }

  return {
    passed: issues.length === 0,
    localEdit,
    allowedFunctions,
    issues,
    beforeIds: before.map((call) => call.id),
    afterIds: after.map((call) => call.id),
    changedIds,
    addedIds,
    removedIds,
  }
}

export function patchLocalityFailureRun(review: PatchLocalityReview): DslRunResult {
  const diagnostics: DSLDiagnostic[] = review.issues.map((issue) => ({
    code: issue.code,
    severity: 'error',
    message: issue.message,
    hint: issue.hint,
    retryable: true,
  }))
  return {
    kind: 'failed',
    downgrade: {
      reason: 'compile_diagnostics',
      message: `Geometry agent patch locality rejected the source: ${review.issues[0]?.message ?? 'locality violation'}`,
      attempts: 1,
      diagnosticCodes: diagnostics.map((diagnostic) => diagnostic.code),
      route: PATCH_LOCALITY_ROUTE,
    },
    attempts: [{ attempt: 1, sandboxMs: 0, diagnostics }],
    budgetUsage: { sandboxAttempts: 0, totalSandboxMs: 0, partCount: 0, wallTimeBudgetMs: 0 },
  }
}

function allowedFunctionsForInstruction(instruction: string): EquipmentCallName[] {
  const text = instruction.toLowerCase()
  const allowed = new Set<EquipmentCallName>()
  if (/(罩|cover|guard|防护|护罩|变大|大一点|小一点|高一点|宽一点|透明)/i.test(text)) {
    allowed.add('guardCover')
  }
  if (/(门|door|inspection|检修|检查|铰链|把手)/i.test(text)) {
    allowed.add('inspectionDoor')
  }
  if (/(电机|motor|drive|右侧|左侧|前部|后部)/i.test(text)) {
    allowed.add('motor')
  }
  if (/(铭牌|nameplate|标签|label|编号)/i.test(text)) {
    allowed.add('nameplate')
  }
  if (/(皮带|belt|滚筒|roller|托辊)/i.test(text)) {
    allowed.add('belt')
    allowed.add('rollerArray')
  }
  if (/(框架|机架|frame|支腿|leg|rail)/i.test(text)) {
    allowed.add('boxFrame')
  }
  if (/(sheet|cover|guard|罩|防护|护罩)/i.test(text)) {
    allowed.add('sheetCover')
  }
  if (/(pipe|piping|flange|port|nozzle|inlet|outlet|管道|法兰|进口|出口)/i.test(text)) {
    allowed.add('pipeRun')
    allowed.add('flangePort')
  }
  if (/(cabinet|control|panel|electrical|plc|电柜|控制|控制柜|面板)/i.test(text)) {
    allowed.add('controlCabinet')
  }
  return Array.from(allowed)
}

function extractEquipmentCalls(source: string): SourceCall[] {
  const calls: SourceCall[] = []
  for (const name of EQUIPMENT_CALLS) {
    let offset = 0
    const token = `${name}(`
    while (offset < source.length) {
      const start = source.indexOf(token, offset)
      if (start === -1) break
      const end = findMatchingParen(source, start + name.length)
      if (end === -1) {
        offset = start + token.length
        continue
      }
      const text = source.slice(start, end + 1)
      const id = extractCallId(name, text)
      if (id) calls.push({ name, id, text })
      offset = end + 1
    }
  }
  return calls.sort((a, b) => a.id.localeCompare(b.id))
}

function extractCallId(name: EquipmentCallName, callText: string): string | null {
  if (name === 'equipment') {
    const match = /^\s*equipment\s*\(\s*['"]([^'"]+)['"]/.exec(callText)
    return match?.[1] ?? null
  }
  const match = /\bid\s*:\s*['"]([^'"]+)['"]/.exec(callText)
  return match?.[1] ?? null
}

function findMatchingParen(source: string, openParenIndex: number): number {
  let depth = 0
  let quote: '"' | "'" | null = null
  for (let i = openParenIndex; i < source.length; i++) {
    const char = source[i]
    const previous = source[i - 1]
    if (quote) {
      if (char === quote && previous !== '\\') quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function normalizeCallText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/;$/, '').trim()
}

const PATCH_LOCALITY_ROUTE: GenerationRouteDecision = {
  mode: 'generator_dsl',
  reasons: ['geometry_agent_patch_locality'],
  signals: { ...NO_SIGNALS, llmExplicitMode: 'generator_dsl' },
  flag: {
    enabled: true,
    killSwitch: false,
    rolloutPercent: 100,
    bucket: 0,
  },
}
