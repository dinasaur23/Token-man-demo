/**
 * Font family token type — DTCG Format 2025.10 §8.3.
 * @see https://www.designtokens.org/tr/2025.10/format/#font-family
 *
 * `$value` MUST be a string (single font name), an array of font-name strings,
 * or a curly-brace alias.
 */

import type { TokenTypeDefinition, TokenValueValidationResult } from '../types'

const AliasPattern = /^\{[^}]+\}$/

export type FontFamilyValue = string | string[]

function fail(path: string, message: string): TokenValueValidationResult {
  return { ok: false, errors: [{ path, message }] }
}

function isNonEmptyFontName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Validate a fontFamily `$value` per DTCG Format §8.3.
 */
export function validateFontFamilyValue(
  value: unknown,
  path = '$value',
): TokenValueValidationResult {
  if (typeof value === 'string') {
    if (AliasPattern.test(value)) return { ok: true }
    if (value.trim().length === 0) {
      return fail(path, 'INVALID_VALUE — Font family string must be non-empty.')
    }
    return { ok: true }
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return fail(path, 'INVALID_VALUE — Font family array must contain at least one name.')
    }
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      if (!isNonEmptyFontName(item) || AliasPattern.test(item)) {
        return fail(
          `${path}[${i}]`,
          'INVALID_VALUE — Each font family array entry must be a non-empty font name string.',
        )
      }
    }
    return { ok: true }
  }

  return fail(
    path,
    'INVALID_VALUE — Expected a font name string, an array of font names, or a curly-brace alias.',
  )
}

export function createDefaultFontFamilyValue(): FontFamilyValue {
  return 'sans-serif'
}

export function formatFontFamilyForDisplay(
  value: unknown,
): { primary: string; secondary?: string } {
  if (typeof value === 'string') {
    return { primary: value }
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return { primary: value.join(', ') }
  }
  try {
    return { primary: JSON.stringify(value) }
  } catch {
    return { primary: String(value) }
  }
}

/**
 * Parse editor input into a fontFamily `$value`.
 * Accepts: `Helvetica`, `Helvetica, Arial, sans-serif`, `["A","B"]`, `{alias.path}`.
 */
export function parseFontFamilyFromEditor(
  input: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    return {
      ok: false,
      message: 'Expected a font name, comma-separated list, JSON array, or {alias}',
    }
  }

  if (AliasPattern.test(trimmed)) {
    return { ok: true, value: trimmed }
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      const check = validateFontFamilyValue(parsed)
      if (!check.ok) {
        return {
          ok: false,
          message: check.errors[0]?.message ?? 'Invalid font family JSON array',
        }
      }
      return { ok: true, value: parsed }
    } catch {
      return { ok: false, message: 'Invalid JSON array for font family' }
    }
  }

  if (trimmed.includes(',')) {
    const parts = trimmed
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
    if (parts.length === 0) {
      return { ok: false, message: 'Expected at least one font name' }
    }
    if (parts.length === 1) {
      return { ok: true, value: parts[0] }
    }
    return { ok: true, value: parts }
  }

  return { ok: true, value: trimmed }
}

export const fontFamilyTokenTypeDefinition: TokenTypeDefinition = {
  id: 'fontFamily',
  label: 'Font Family',
  navPath: 'fontFamily',
  navIcon: 'mdi-format-font',
  validateValue: validateFontFamilyValue,
  createDefaultValue: createDefaultFontFamilyValue,
  formatForDisplay: formatFontFamilyForDisplay,
  parseFromEditor: parseFontFamilyFromEditor,
}
