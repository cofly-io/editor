import type { AssetInput } from '@pascal-app/core'
import type { AiGenerationMode, ApiContentPart, ChatImageAttachment, ChatMessage } from './types'

export type AiGenerationModeConfig = {
  id: AiGenerationMode
  label: string
  tech: string
  description: string
}

export const AI_GENERATION_MODES: AiGenerationModeConfig[] = [
  {
    id: 'primitive',
    label: '\u51e0\u4f55\u642d\u5efa',
    tech: 'Primitive',
    description: 'LLM \u8c03\u7528 Pascal primitive \u5de5\u5177\uff0c\u751f\u6210\u53ef\u7f16\u8f91\u51e0\u4f55\u4f53\u3002',
  },
  {
    id: 'image-to-3d',
    label: '\u56fe\u751f\u5efa\u6a21',
    tech: 'Image to 3D',
    description: '\u4e0a\u4f20\u56fe\u7247\u8c03\u7528\u56fe\u751f 3D \u670d\u52a1\uff0c\u4fdd\u5b58\u4e3a\u7269\u54c1\u5e93\u6a21\u578b\u3002',
  },
  {
    id: 'articraft',
    label: '\u5173\u8282\u8d44\u4ea7',
    tech: 'Articraft',
    description: '\u751f\u6210\u5e26 links/joints \u7684\u53ef\u52a8\u8d44\u4ea7\uff0c\u53ef\u67e5\u770b\u3001\u5bfc\u5165\u548c\u8c03\u59ff\u6001\u3002',
  },
]

export function shouldRouteAssetPromptToFactory(input: {
  generationMode: AiGenerationMode
  hasImageAttachment: boolean
  text: string
}) {
  if (input.generationMode !== 'primitive' || input.hasImageAttachment) return false
  const text = input.text.trim().toLowerCase()
  if (!text) return false
  return (
    /\b(factory|plant|workshop|refinery|process\s+line|production\s+line)\b/i.test(text) ||
    /(?:\u70bc\u6cb9\u5382|\u5de5\u5382|\u5382\u533a|\u8f66\u95f4|\u751f\u4ea7\u7ebf|\u5de5\u827a\u7ebf)/.test(text)
  )
}

export const ARTICRAFT_PROGRESS_LINE_LIMIT = 12
export const AI_IMAGE_MAX_BYTES = 8 * 1024 * 1024
export const AI_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
export const CONVERSATION_HISTORY_PAGE_SIZE = 15
export const PROFILE_PACK_REFRESH_TTL_MS = 30_000
export const CONVERSATION_HISTORY_REFRESH_TTL_MS = 5_000

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read image file'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })
}

export function imageAttachmentBaseName(image: ChatImageAttachment) {
  return image.name.replace(/\.[^.]+$/, '').trim() || 'Image to 3D asset'
}

export function isImageTo3DAsset(value: unknown): value is AssetInput & { id: string; source: 'mine' } {
  if (typeof value !== 'object' || value === null) return false
  const asset = value as { id?: unknown; src?: unknown; thumbnail?: unknown; source?: unknown }
  return (
    typeof asset.id === 'string' &&
    typeof asset.src === 'string' &&
    typeof asset.thumbnail === 'string' &&
    asset.source === 'mine'
  )
}

export function isMineAsset(value: unknown): value is AssetInput & { id: string; source: 'mine' } {
  return isImageTo3DAsset(value)
}

export function isAbortError(error: unknown) {
  return isRecord(error) && error.name === 'AbortError'
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

export function isTerminalGenerationStatus(status: NonNullable<ChatMessage['generationRun']>['status']) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled'
}

export function isActiveGenerationRun(
  run: ChatMessage['generationRun'] | undefined,
): run is NonNullable<ChatMessage['generationRun']> {
  return Boolean(run && !isTerminalGenerationStatus(run.status))
}

export function buildMultimodalContent(text: string, image?: ChatImageAttachment): string | ApiContentPart[] {
  const normalizedText =
    text.trim() || 'Describe the image and generate a 3D object.'
  if (!image) return normalizedText
  return [
    { type: 'text', text: normalizedText },
    { type: 'image_url', image_url: { url: image.dataUrl } },
  ]
}

export function formatArticraftProgressMessage(header: string, lines: string[]) {
  const visibleLines = lines.map((line) => line.trim()).filter(Boolean).slice(-ARTICRAFT_PROGRESS_LINE_LIMIT)
  if (visibleLines.length === 0) return header
  return `${header}\n\n${visibleLines.map((line) => `- ${line}`).join('\n')}`
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function safeParseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function findPendingPrimitiveRunMessageIndex(messages: readonly ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (
      message?.role === 'assistant' &&
      !message.generationRun &&
      !message.geometryArtifact &&
      !message.modelArtifact &&
      !message.imageTo3dResult &&
      !message.articraftResult &&
      message.content.startsWith('**Generate:**')
    ) {
      return index
    }
  }
  return -1
}

export function normalizeToolArgumentsSource(raw: string) {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced?.[1]?.trim() ?? trimmed
}

export function extractFirstBalancedJsonObject(source: string) {
  const start = source.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < source.length; index += 1) {
    const char = source[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }

  return null
}

export function requireToolArgumentsObject(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new Error('Tool arguments must be a JSON object.')
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  const source = normalizeToolArgumentsSource(raw || '{}') || '{}'
  try {
    return requireToolArgumentsObject(JSON.parse(source))
  } catch (strictError) {
    const firstObject = extractFirstBalancedJsonObject(source)
    if (!firstObject || firstObject === source) {
      throw strictError
    }
    try {
      return requireToolArgumentsObject(JSON.parse(firstObject))
    } catch {
      throw strictError
    }
  }
}
