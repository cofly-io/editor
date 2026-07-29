export const EQUIPMENT_CALLS = [
  'equipment',
  'boxFrame',
  'belt',
  'rollerArray',
  'guardCover',
  'motor',
  'gearbox',
  'bearingBlock',
  'platform',
  'ladder',
  'handrail',
  'inspectionDoor',
  'nameplate',
  'sheetCover',
  'flangePort',
  'pipeRun',
  'controlCabinet',
  'skidBase',
  'pumpCasing',
  'centrifugalFan',
  'blowerPackage',
  'verticalVessel',
  'dustCollector',
  'heatExchanger',
  'agitatorTank',
] as const

export type EquipmentCallName = (typeof EQUIPMENT_CALLS)[number]

export type EquipmentSourceCall = {
  name: EquipmentCallName
  id: string
  text: string
  params: Record<string, string>
}

export function extractEquipmentCalls(source: string): EquipmentSourceCall[] {
  const calls: EquipmentSourceCall[] = []
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
      if (id) calls.push({ name, id, text, params: extractParams(name, text) })
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
  const objectStart = callText.indexOf('{')
  const objectEnd = callText.lastIndexOf('}')
  if (objectStart === -1 || objectEnd === -1 || objectEnd <= objectStart) return {}

  const objectText = callText.slice(objectStart + 1, objectEnd)
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
