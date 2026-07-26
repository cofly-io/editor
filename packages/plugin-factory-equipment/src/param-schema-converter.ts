/**
 * Generator Parameter Schema to Zod Schema Converter
 *
 * Converts IndustrialPack generator.json param definitions to zod schemas
 * for runtime validation in the editor. This eliminates the need to maintain
 * parallel TypeScript interfaces and JSON Schema definitions.
 *
 * Usage:
 *   import { generatorParamsToZodSchema } from './param-schema-converter'
 *   const schema = generatorParamsToZodSchema(generatorManifest.params)
 *   const validated = schema.parse(inputParams)
 */

import { z } from 'zod'
import type { GeneratorManifest, GeneratorParamSchema } from './industry-pack-loader'

// ─── Zod Schema Cache ────────────────────────────────────────────────────────

const schemaCache = new Map<string, z.ZodObject<Record<string, z.ZodTypeAny>>>()

/**
 * Clear the schema cache. Useful for testing or hot-reloading.
 */
export function clearParamSchemaCache(): void {
  schemaCache.clear()
}

// ─── Main Converter ──────────────────────────────────────────────────────────

/**
 * Convert a generator manifest's params to a zod object schema.
 * The schema validates that:
 * - All provided params match their declared types
 * - Number params are within min/max bounds
 * - Enum params are one of the allowed options
 * - Color params are valid hex color strings
 * - Boolean params are actual booleans
 */
export function generatorParamsToZodSchema(
  params: Record<string, GeneratorParamSchema> | undefined,
  options: { strict?: boolean } = {},
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  if (!params || Object.keys(params).length === 0) {
    return z.object({})
  }

  const cacheKey = JSON.stringify(params)
  const cached = schemaCache.get(cacheKey)
  if (cached) return cached

  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [key, schema] of Object.entries(params)) {
    shape[key] = paramSchemaToZodType(key, schema, options.strict)
  }

  const zodSchema = z.object(shape).partial() // All params optional with defaults
  schemaCache.set(cacheKey, zodSchema)
  return zodSchema
}

/**
 * Convert a full generator manifest to a zod schema.
 * Includes both params validation and manifest metadata.
 */
export function generatorManifestToZodSchema(manifest: GeneratorManifest): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const paramsSchema = generatorParamsToZodSchema(manifest.params)

  return z.object({
    id: z.string(),
    family: z.string(),
    params: paramsSchema,
  })
}

// ─── Individual Param Converters ─────────────────────────────────────────────

function paramSchemaToZodType(
  key: string,
  schema: GeneratorParamSchema,
  strict = false,
): z.ZodTypeAny {
  switch (schema.type) {
    case 'number':
      return numberParamToZod(key, schema, strict)
    case 'enum':
      return enumParamToZod(key, schema, strict)
    case 'color':
      return colorParamToZod(key, schema, strict)
    case 'boolean':
      return booleanParamToZod(key, schema, strict)
    case 'string':
      return stringParamToZod(key, schema, strict)
    default:
      return z.unknown()
  }
}

function numberParamToZod(
  key: string,
  schema: GeneratorParamSchema,
  strict: boolean,
): z.ZodTypeAny {
  let base = z.number()

  if (typeof schema.min === 'number') {
    base = base.min(schema.min, `${key} must be >= ${schema.min}`)
  }
  if (typeof schema.max === 'number') {
    base = base.max(schema.max, `${key} must be <= ${schema.max}`)
  }

  if (schema.default !== undefined && typeof schema.default === 'number') {
    return base.default(schema.default)
  }

  return strict ? base : base.optional()
}

function enumParamToZod(
  key: string,
  schema: GeneratorParamSchema,
  strict: boolean,
): z.ZodTypeAny {
  if (!schema.options || schema.options.length === 0) {
    return z.string().optional()
  }

  const enumValues = schema.options as [string, ...string[]]
  let base = z.enum(enumValues)

  if (schema.default !== undefined && typeof schema.default === 'string') {
    base = base.default(schema.default)
    return base
  }

  return strict ? base : base.optional()
}

function colorParamToZod(
  key: string,
  schema: GeneratorParamSchema,
  strict: boolean,
): z.ZodTypeAny {
  const base = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, `${key} must be a valid hex color (e.g. #38bdf8)`)

  if (schema.default !== undefined && typeof schema.default === 'string') {
    return base.default(schema.default)
  }

  return strict ? base : base.optional()
}

function booleanParamToZod(
  key: string,
  schema: GeneratorParamSchema,
  strict: boolean,
): z.ZodTypeAny {
  const base = z.boolean()

  if (schema.default !== undefined && typeof schema.default === 'boolean') {
    return base.default(schema.default)
  }

  return strict ? base : base.optional()
}

function stringParamToZod(
  key: string,
  schema: GeneratorParamSchema,
  strict: boolean,
): z.ZodTypeAny {
  const base = z.string()

  if (schema.default !== undefined && typeof schema.default === 'string') {
    return base.default(schema.default)
  }

  return strict ? base : base.optional()
}

// ─── Validation Helpers ──────────────────────────────────────────────────────

/**
 * Validate params against a generator manifest's schema.
 * Returns { success: true, data } or { success: false, errors }.
 */
export function validateGeneratorParams(
  manifest: GeneratorManifest,
  params: Record<string, unknown>,
): { success: true; data: Record<string, unknown> } | { success: false; errors: z.ZodError } {
  const schema = generatorParamsToZodSchema(manifest.params, { strict: false })
  const result = schema.safeParse(params)

  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, errors: result.error }
}

/**
 * Validate params and throw on failure.
 * Use this when invalid params should halt execution.
 */
export function assertGeneratorParams(
  manifest: GeneratorManifest,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const result = validateGeneratorParams(manifest, params)
  if (!result.success) {
    const messages = result.errors.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid params for generator "${manifest.id}": ${messages}`)
  }
  return result.data
}

/**
 * Merge profile params with generator defaults.
 * Profile params take precedence over generator defaults.
 */
export function mergeParamsWithDefaults(
  manifest: GeneratorManifest,
  profileParams: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const schema = generatorParamsToZodSchema(manifest.params, { strict: false })
  const parsed = schema.parse(profileParams ?? {})

  // Fill in defaults for missing params
  const merged: Record<string, unknown> = { ...parsed }
  for (const [key, paramSchema] of Object.entries(manifest.params ?? {})) {
    if (merged[key] === undefined && paramSchema.default !== undefined) {
      merged[key] = paramSchema.default
    }
  }

  return merged
}
