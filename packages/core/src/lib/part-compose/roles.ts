import type { PartComposePartInput } from './types'

export function normalizedRoleToken(role: unknown): string {
  return typeof role === 'string'
    ? role
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_')
    : ''
}

export function genericPartRole(part: PartComposePartInput, fallback: string): string {
  return normalizedRoleToken(part.semanticRole) || fallback
}
