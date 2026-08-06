/**
 * DTCG document validation for import/load (Stage 8).
 *
 * Combines Stage 7 structural checks, type taxonomy (rejects string/boolean
 * and out-of-scope composites), and registered-type `$value` checks.
 */

import type { Json } from './color-conversion'
import {
  validateDocumentStructure,
  collectDeclaredTypeTaxonomyErrors,
} from './structural-validation'
import {
  classifyDeclaredTokenType,
  formatTokenValidationError,
  type TokenValidationError,
} from './token-validation-error'
import { isJsonObject, type JsonObject } from './reference-resolver'
import { getTokenTypeDefinition, validateColorValue } from './token-types'

export type DtcgStructuralResult =
  | { ok: true }
  | { ok: false; errors: readonly TokenValidationError[] }

export type ColorValidationResult = { ok: true } | { ok: false; errors: string[] }

export type CombinedValidationResult =
  | { ok: true }
  | { ok: false; kind: 'structural' | 'color' | 'value'; errors: string[] }

function pathString(segments: string[]): string {
  return segments.join('.')
}

function childKeys(node: JsonObject): string[] {
  return Object.keys(node).filter((key) => !key.startsWith('$'))
}

/**
 * Validate token leaves for declared-type taxonomy.
 * Registered type `$value`s are checked separately via
 * {@link validateRegisteredTypeSubtree} / {@link validateColorSubtree}.
 */
export function validateDtcgDocument(doc: Json): DtcgStructuralResult {
  const errors: TokenValidationError[] = []

  const structural = validateDocumentStructure(doc)
  if (!structural.ok) {
    errors.push(...structural.errors)
  }

  // Declared $type taxonomy (groups + leaves): string/boolean → INVALID_DTCG_TYPE,
  // typography/… → UNSUPPORTED_BY_APPLICATION.
  errors.push(...collectDeclaredTypeTaxonomyErrors(doc))

  function visit(node: Json, segments: string[], inheritedType: string | undefined): void {
    if (!isJsonObject(node)) return

    const localType = typeof node.$type === 'string' ? node.$type : undefined
    const effectiveType = localType ?? inheritedType
    const hasValue = Object.prototype.hasOwnProperty.call(node, '$value')
    const path = pathString(segments) || '(root)'

    if (hasValue && effectiveType) {
      // Leaf may inherit a bad group type that was already reported on the group;
      // still report on the leaf when the leaf itself has no local $type so paths
      // are actionable. Skip duplicate when localType was already classified above.
      if (!localType) {
        const classified = classifyDeclaredTokenType(effectiveType)
        if (classified) {
          errors.push({
            path,
            code: classified.code,
            message: classified.message,
            $type: classified.$type,
          })
        }
      }
    }

    for (const key of childKeys(node)) {
      visit(node[key], [...segments, key], effectiveType)
    }
  }

  if (isJsonObject(doc)) {
    visit(doc, [], undefined)
  }

  // Deduplicate identical path+code+message entries (group + leaf inherited).
  const seen = new Set<string>()
  const unique = errors.filter((e) => {
    const key = `${e.path}|${e.code}|${e.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return unique.length > 0 ? { ok: false, errors: unique } : { ok: true }
}

export function validateColorSubtree(doc: Json): ColorValidationResult {
  const errors: string[] = []

  const visit = (
    node: Json,
    inheritedType: string | undefined,
    path: (string | number)[],
  ): void => {
    if (!isJsonObject(node)) return

    const localType = typeof node.$type === 'string' ? node.$type : undefined
    const effectiveType = localType ?? inheritedType
    const hasValue = Object.prototype.hasOwnProperty.call(node, '$value')

    if (effectiveType === 'color' && hasValue) {
      const tokenPath = path.length > 0 ? path.join('.') : '(root)'
      const parseResult = validateColorValue(node.$value, `${tokenPath}.$value`)

      if (!parseResult.ok) {
        for (const issue of parseResult.errors) {
          errors.push(`${issue.path}: ${issue.message}`)
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

/**
 * Validate `$value` for every registered token type (Color, Dimension, …)
 * using the token-type registry.
 */
export function validateRegisteredTypeSubtree(doc: Json): ColorValidationResult {
  const errors: string[] = []

  const visit = (
    node: Json,
    inheritedType: string | undefined,
    path: (string | number)[],
  ): void => {
    if (!isJsonObject(node)) return

    const localType = typeof node.$type === 'string' ? node.$type : undefined
    const effectiveType = localType ?? inheritedType
    const hasValue = Object.prototype.hasOwnProperty.call(node, '$value')

    if (hasValue && typeof effectiveType === 'string') {
      const def = getTokenTypeDefinition(effectiveType)
      if (def) {
        const tokenPath = path.length > 0 ? path.join('.') : '(root)'
        const parseResult = def.validateValue(node.$value, `${tokenPath}.$value`)
        if (!parseResult.ok) {
          for (const issue of parseResult.errors) {
            errors.push(`${issue.path}: ${issue.message}`)
          }
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

function formatStructuralIssue(issue: unknown): string {
  if (typeof issue === 'string') return issue

  if (typeof issue === 'object' && issue !== null) {
    const maybe = issue as TokenValidationError & { path?: unknown; message?: unknown }
    if (typeof maybe.code === 'string' && typeof maybe.message === 'string') {
      return formatTokenValidationError({
        path: typeof maybe.path === 'string' ? maybe.path : '',
        code: maybe.code,
        message: maybe.message,
        $type: maybe.$type,
      })
    }

    const pathArray = Array.isArray(maybe.path) ? maybe.path : undefined
    const msg = typeof maybe.message === 'string' ? maybe.message : JSON.stringify(issue)
    const path = pathArray && pathArray.length > 0 ? pathArray.join('.') : ''
    return path ? `${path}: ${msg}` : msg
  }

  return String(issue)
}

export async function validateTokensStrict(doc: Json): Promise<CombinedValidationResult> {
  const structural = validateDtcgDocument(doc)
  if (!structural.ok) {
    return {
      ok: false,
      kind: 'structural',
      errors: structural.errors.map(formatStructuralIssue),
    }
  }

  const typed = validateRegisteredTypeSubtree(doc)
  if (!typed.ok) {
    return {
      ok: false,
      kind: 'value',
      errors: typed.errors,
    }
  }

  return { ok: true }
}

export { formatStructuralErrors } from './structural-validation'
