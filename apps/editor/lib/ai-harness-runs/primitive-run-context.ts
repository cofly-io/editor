import {
  type GeometryContextDecision,
  isLikelyGeometryRevisionRequest,
} from '../../../../packages/editor/src/lib/ai-chat-harness'
import type { GeneratedGeometryArtifact } from '../../../../packages/editor/src/lib/ai-generated-geometry-core'

export const CONTEXT_RESOLVER_SYSTEM_PROMPT = [
  'You are a context intent resolver for a 3D geometry tool harness.',
  'Classify whether the current request should edit/regenerate the latest generated artifact, merely keep it as summary context, or ignore it.',
  'Return strict JSON only. Do not call tools. Do not include markdown.',
].join('\n')

const CONTEXT_RELATIONSHIPS = new Set([
  'modify_previous',
  'regenerate_previous',
  'different_object',
  'new_unrelated_object',
  'ambiguous',
])

const CONTEXT_POLICIES = new Set(['none', 'summary_only', 'include_full_artifact'])

const CONTEXT_ROUTES = new Set([
  'revise_geometry',
  'fresh_replacement',
  'new_geometry',
  'model_decide',
])

const NEGATED_TARGET_CLAUSE_PATTERNS = [
  /\b(?:do\s+not|don't|dont|never|avoid|not)\s+(?:generate|create|make|build|model|use)?\s*([^.!?;\n]+)/gi,
  /(?:\u4e0d\u8981\u751f\u6210|\u4e0d\u8981|\u522b\u751f\u6210|\u4e0d\u662f|\u907f\u514d\u751f\u6210|\u7981\u6b62\u751f\u6210)\s*([^\u3002\uff01\uff1f\uff1b\n]+)/g,
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringMember<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value) ? (value as T) : fallback
}

function numberConfidence(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5
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
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return null
}

function normalizeContextDecision(value: unknown): GeometryContextDecision {
  const record = isRecord(value) ? value : {}
  const editIntent = isRecord(record.editIntent)
    ? {
        type: typeof record.editIntent.type === 'string' ? record.editIntent.type : undefined,
        target: typeof record.editIntent.target === 'string' ? record.editIntent.target : undefined,
        dimension:
          typeof record.editIntent.dimension === 'string' ? record.editIntent.dimension : undefined,
        strength:
          typeof record.editIntent.strength === 'string' ? record.editIntent.strength : undefined,
      }
    : undefined

  return {
    relationshipToLatestArtifact: stringMember(
      record.relationshipToLatestArtifact,
      CONTEXT_RELATIONSHIPS,
      'ambiguous',
    ),
    contextPolicy: stringMember(record.contextPolicy, CONTEXT_POLICIES, 'summary_only'),
    recommendedRoute: stringMember(record.recommendedRoute, CONTEXT_ROUTES, 'model_decide'),
    confidence: numberConfidence(record.confidence),
    reason: typeof record.reason === 'string' ? record.reason.slice(0, 600) : 'Model decision.',
    ...(editIntent ? { editIntent } : {}),
  }
}

export function parseContextDecision(content: string): GeometryContextDecision {
  const source = normalizeToolArgumentsSource(content || '{}') || '{}'
  try {
    return normalizeContextDecision(JSON.parse(source))
  } catch {
    const firstObject = extractFirstBalancedJsonObject(source)
    return normalizeContextDecision(firstObject ? JSON.parse(firstObject) : {})
  }
}

export function fallbackContextDecision(
  userPrompt: string,
  latestArtifact: GeneratedGeometryArtifact | null,
): GeometryContextDecision {
  const revision = isLikelyGeometryRevisionRequest(userPrompt, latestArtifact)
  return {
    relationshipToLatestArtifact: revision ? 'modify_previous' : 'ambiguous',
    contextPolicy: revision ? 'include_full_artifact' : latestArtifact ? 'summary_only' : 'none',
    recommendedRoute: revision ? 'revise_geometry' : 'model_decide',
    confidence: revision ? 0.65 : 0.35,
    reason: 'Fallback decision used because context resolver did not return usable JSON.',
  }
}

export function ensurePromptInPrimitiveContext(userPrompt: string, contextText: string): string {
  const prompt = userPrompt.trim()
  const text = contextText.trim()
  if (!prompt || !text) return text || prompt
  if (text.toLowerCase().includes(prompt.toLowerCase())) return text
  return [`User request: ${prompt}`, '', 'Additional context:', text].join('\n')
}

export function stripNegatedTargetClauses(userPrompt: string): string {
  let text = userPrompt
  for (const pattern of NEGATED_TARGET_CLAUSE_PATTERNS) {
    text = text.replace(pattern, ' ')
  }
  return text
}
