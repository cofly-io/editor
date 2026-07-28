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
  'skidBase',
  'pumpCasing',
] as const

type EquipmentCallName = (typeof EQUIPMENT_CALLS)[number]

type SourceCall = {
  name: EquipmentCallName
  id: string
  params: Record<string, string>
}

export type GeometryAgentSourceChange = {
  id: string
  functionName: EquipmentCallName
  changedParams: Array<{ name: string; before: string; after: string }>
}

export type GeometryAgentChangeFeedback = {
  changed: GeometryAgentSourceChange[]
  added: Array<{ id: string; functionName: EquipmentCallName }>
  removed: Array<{ id: string; functionName: EquipmentCallName }>
  unchangedImportantIds: string[]
  text: string
}

const IMPORTANT_IDS = [
  'belt',
  'frame',
  'rollers',
  'drive_motor',
  'top_guard_cover',
  'nameplate',
  'control_cabinet',
  'process_pipe',
  'skid',
  'pump',
]

export function summarizeGeometryAgentSourceChange(input: {
  beforeSource: string
  afterSource: string
  instruction: string
}): GeometryAgentChangeFeedback {
  const before = extractEquipmentCalls(input.beforeSource)
  const after = extractEquipmentCalls(input.afterSource)
  const beforeById = new Map(before.map((call) => [call.id, call]))
  const afterById = new Map(after.map((call) => [call.id, call]))
  const changed: GeometryAgentSourceChange[] = []

  for (const call of before) {
    const next = afterById.get(call.id)
    if (!next) continue
    const changedParams = diffParams(call.params, next.params)
    if (changedParams.length > 0 || call.name !== next.name) {
      changed.push({
        id: call.id,
        functionName: next.name,
        changedParams:
          call.name === next.name
            ? changedParams
            : [{ name: 'function', before: call.name, after: next.name }],
      })
    }
  }

  const added = after
    .filter((call) => !beforeById.has(call.id))
    .map((call) => ({ id: call.id, functionName: call.name }))
  const removed = before
    .filter((call) => !afterById.has(call.id))
    .map((call) => ({ id: call.id, functionName: call.name }))
  const changedIds = new Set(changed.map((change) => change.id))
  const unchangedImportantIds = IMPORTANT_IDS.filter((id) => {
    return beforeById.has(id) && afterById.has(id) && !changedIds.has(id)
  })

  const feedback: Omit<GeometryAgentChangeFeedback, 'text'> = {
    changed,
    added,
    removed,
    unchangedImportantIds,
  }
  return { ...feedback, text: formatGeometryAgentChangeFeedback(feedback, input.instruction) }
}

export function formatGeometryAgentChangeFeedback(
  feedback: Omit<GeometryAgentChangeFeedback, 'text'>,
  instruction?: string,
): string {
  const lines: string[] = []
  lines.push('已按源码增量修改：')
  if (instruction?.trim()) lines.push(`- 用户指令：${instruction.trim()}`)
  if (feedback.changed.length > 0) {
    lines.push('- 修改：')
    for (const change of feedback.changed.slice(0, 8)) {
      const params = change.changedParams
        .slice(0, 6)
        .map((param) => `${param.name}: ${param.before} → ${param.after}`)
        .join('；')
      lines.push(`  - ${change.functionName}(${change.id}) ${params}`)
    }
  }
  if (feedback.added.length > 0) {
    lines.push(
      `- 新增：${feedback.added.map((item) => `${item.functionName}(${item.id})`).join('，')}`,
    )
  }
  if (feedback.removed.length > 0) {
    lines.push(
      `- 删除：${feedback.removed.map((item) => `${item.functionName}(${item.id})`).join('，')}`,
    )
  }
  if (
    feedback.changed.length === 0 &&
    feedback.added.length === 0 &&
    feedback.removed.length === 0
  ) {
    lines.push('- 源码语义调用未发生可识别参数变化。')
  }
  if (feedback.unchangedImportantIds.length > 0) {
    lines.push(`- 保持不变：${feedback.unchangedImportantIds.join('，')}`)
  }
  return lines.join('\n')
}

function diffParams(
  before: Record<string, string>,
  after: Record<string, string>,
): Array<{ name: string; before: string; after: string }> {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort()
  return keys
    .filter((key) => before[key] !== after[key])
    .map((key) => ({
      name: key,
      before: before[key] ?? '<missing>',
      after: after[key] ?? '<missing>',
    }))
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
      if (id) calls.push({ name, id, params: extractParams(name, text) })
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

function extractParams(name: EquipmentCallName, callText: string): Record<string, string> {
  const objectText =
    name === 'equipment'
      ? callText.slice(callText.indexOf('{') + 1, callText.lastIndexOf('}'))
      : callText.slice(callText.indexOf('{') + 1, callText.lastIndexOf('}'))
  const params: Record<string, string> = {}
  for (const chunk of splitTopLevelCommas(objectText)) {
    const colon = chunk.indexOf(':')
    if (colon === -1) continue
    const key = chunk
      .slice(0, colon)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    if (!key || key === 'id') continue
    params[key] = chunk
      .slice(colon + 1)
      .trim()
      .replace(/,$/, '')
  }
  return params
}

function splitTopLevelCommas(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  let depth = 0
  let quote: '"' | "'" | null = null
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const previous = text[i - 1]
    if (quote) {
      if (char === quote && previous !== '\\') quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '{' || char === '[' || char === '(') depth += 1
    if (char === '}' || char === ']' || char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      chunks.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  const last = text.slice(start).trim()
  if (last) chunks.push(last)
  return chunks
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
