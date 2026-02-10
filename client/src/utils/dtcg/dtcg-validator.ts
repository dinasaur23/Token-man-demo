import { z } from 'zod'
import type { Json } from './color-conversion'

type JsonObject = Record<string, Json>

const isObject = (value: Json): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export type DtcgStructuralResult = { ok: true } | { ok: false; errors: readonly unknown[] }

export async function validateDtcgDocument(doc: Json): Promise<DtcgStructuralResult> {
  const errors: unknown[] = []
  let tokenCount = 0
  const AliasPattern = /^\{[^}]+\}$/
  const SIMPLE_TYPES = new Set(['number', 'string', 'boolean', 'color'])

  async function visit(node: Json, inheritedType?: string): Promise<void> {
    if (!isObject(node)) return

    const localType = typeof node['$type'] === 'string' ? String(node['$type']) : undefined
    const effectiveType = localType ?? inheritedType

    const hasValue = Object.prototype.hasOwnProperty.call(node, '$value')

    if (effectiveType && hasValue) {
      tokenCount += 1

      if (!SIMPLE_TYPES.has(effectiveType)) {
        errors.push(`Unsupported $type "${effectiveType}"`)
      } else if (effectiveType === 'number') {
        const v = node['$value']
        const ok = typeof v === 'number' || (typeof v === 'string' && AliasPattern.test(v))
        if (!ok)
          errors.push(`$value for type "number" must be a number or alias like {path.to.token}`)
      } else if (effectiveType === 'string') {
        const v = node['$value']
        const ok = typeof v === 'string'
        if (!ok) errors.push(`$value for type "string" must be a string`)
      } else if (effectiveType === 'boolean') {
        const v = node['$value']
        const ok = typeof v === 'boolean' || (typeof v === 'string' && AliasPattern.test(v))
        if (!ok)
          errors.push(`$value for type "boolean" must be a boolean or alias like {path.to.token}`)
      } else {
      }
    }

    for (const child of Object.values(node)) {
      await visit(child, effectiveType)
    }
  }

  await visit(doc, undefined)

  if (tokenCount === 0) {
    errors.push(
      'Document contains no DTCG tokens (no nodes with an effective "$type" and "$value"). It is not a valid DTCG token file.',
    )
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true }
}

const AliasPattern = /^\{[^}]+\}$/

const StrictColorObject = z
  .object({
    colorSpace: z.string(),
    components: z.array(z.number()).length(3),
    alpha: z.number().min(0).max(1).optional(),
    hex: z
      .string()
      .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
      .optional(),
  })
  .refine((v) => v.hex !== undefined || v.components !== undefined, {
    message: 'Color object must have hex or components',
  })

const HexPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const ColorValueSchema = z.union([
  StrictColorObject,
  z.string().regex(HexPattern, 'Expected hex color'),
  z.string().regex(AliasPattern, 'Expected alias like {path.to.token}'),
])

export type ColorValidationResult = { ok: true } | { ok: false; errors: string[] }

export function validateColorSubtree(doc: Json): ColorValidationResult {
  const errors: string[] = []

  const visit = (
    node: Json,
    inheritedType: string | undefined,
    path: (string | number)[],
  ): void => {
    if (!isObject(node)) return

    const localType = typeof node['$type'] === 'string' ? String(node['$type']) : undefined
    const effectiveType = localType ?? inheritedType

    const hasValue = Object.prototype.hasOwnProperty.call(node, '$value')

    if (effectiveType === 'color' && hasValue) {
      const parseResult = ColorValueSchema.safeParse(node['$value'])

      if (!parseResult.success) {
        for (const issue of parseResult.error.issues) {
          const fullPath = [...path, '$value', ...issue.path].join('.')
          errors.push(`${fullPath}: ${issue.message}`)
        }
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue
      visit(value, effectiveType, [...path, key])
    }
  }

  visit(doc, undefined, [])

  return errors.length > 0 ? { ok: false, errors } : { ok: true }
}

export type CombinedValidationResult =
  | { ok: true }
  | { ok: false; kind: 'structural' | 'color'; errors: string[] }

function formatStructuralIssue(issue: unknown): string {
  if (typeof issue === 'string') return issue

  if (typeof issue === 'object' && issue !== null) {
    const maybe = issue as { path?: unknown; message?: unknown }

    const pathArray = Array.isArray(maybe.path) ? maybe.path : undefined
    const msg = typeof maybe.message === 'string' ? maybe.message : JSON.stringify(issue)

    const path = pathArray && pathArray.length > 0 ? pathArray.join('.') : ''
    return path ? `${path}: ${msg}` : msg
  }

  return String(issue)
}

export async function validateTokensStrict(doc: Json): Promise<CombinedValidationResult> {
  const structural = await validateDtcgDocument(doc)
  if (!structural.ok) {
    return {
      ok: false,
      kind: 'structural',
      errors: structural.errors.map(formatStructuralIssue),
    }
  }

  const color = validateColorSubtree(doc)
  if (!color.ok) {
    return {
      ok: false,
      kind: 'color',
      errors: color.errors,
    }
  }

  return { ok: true }
}
