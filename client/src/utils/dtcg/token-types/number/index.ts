/**
 * Number token type — DTCG Format 2025.10 §8.7.
 * @see https://www.designtokens.org/tr/2025.10/format/#number
 *
 * `$value` MUST be a JSON number (finite), or a curly-brace alias.
 * JSON Pointer `$ref` objects are also accepted as reference values
 * (consistent with prior structural number checks).
 */

import { isJsonPointerRef } from '../../reference-resolver'
import type { TokenTypeDefinition, TokenValueValidationResult } from '../types'
import { formatDisplayNumber } from '../../formatDisplayNumber'

const AliasPattern = /^\{[^}]+\}$/

function fail(path: string, message: string): TokenValueValidationResult {
  return { ok: false, errors: [{ path, message }] }
}

/**
 * Validate a number `$value` per DTCG Format §8.7.
 */
export function validateNumberValue(
  value: unknown,
  path = '$value',
): TokenValueValidationResult {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return fail(path, 'INVALID_VALUE — Number value must be a finite JSON number.')
    }
    return { ok: true }
  }

  if (typeof value === 'string') {
    if (AliasPattern.test(value)) return { ok: true }
    return fail(
      path,
      'INVALID_VALUE — Expected a JSON number or a curly-brace alias.',
    )
  }

  if (isJsonPointerRef(value)) {
    return { ok: true }
  }

  return fail(
    path,
    'INVALID_VALUE — $value for type "number" must be a number, curly-brace alias, or JSON Pointer $ref.',
  )
}

export function createDefaultNumberValue(): number {
  return 0
}

export function formatNumberForDisplay(
  value: unknown,
): { primary: string; secondary?: string } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { primary: formatDisplayNumber(value) }
  }
  if (typeof value === 'string' && AliasPattern.test(value)) {
    return { primary: value }
  }
  try {
    return { primary: JSON.stringify(value) }
  } catch {
    return { primary: String(value) }
  }
}

/**
 * Parse editor input into a number `$value`.
 * Accepts: finite numeric strings, `{alias.path}`.
 */
export function parseNumberFromEditor(
  input: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, message: 'Expected a number or {alias}' }
  }

  if (AliasPattern.test(trimmed)) {
    return { ok: true, value: trimmed }
  }

  // Reject trailing junk (Number('12px') === 12).
  if (!/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return { ok: false, message: 'Expected a number or {alias}' }
  }

  const n = Number(trimmed)
  if (!Number.isFinite(n)) {
    return { ok: false, message: 'Number value must be finite' }
  }

  return { ok: true, value: n }
}

export const numberTokenTypeDefinition: TokenTypeDefinition = {
  id: 'number',
  label: 'Number',
  navPath: 'number',
  navIcon: 'mdi-numeric',
  validateValue: validateNumberValue,
  createDefaultValue: createDefaultNumberValue,
  formatForDisplay: formatNumberForDisplay,
  parseFromEditor: parseNumberFromEditor,
}
