/**
 * Font weight token type — DTCG Format 2025.10 §8.4.
 * @see https://www.designtokens.org/tr/2025.10/format/#font-weight
 *
 * `$value` MUST be a number in [1, 1000], a predefined weight name (exact case),
 * or a curly-brace alias.
 */

import type { TokenTypeDefinition, TokenValueValidationResult } from '../types'
import { formatDisplayNumber } from '../../formatDisplayNumber'

const AliasPattern = /^\{[^}]+\}$/

/** DTCG §8.4 named aliases → numeric value. Keys are exact-case. */
export const FONT_WEIGHT_NAME_TO_NUMBER = {
  thin: 100,
  hairline: 100,
  'extra-light': 200,
  'ultra-light': 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  'semi-bold': 600,
  'demi-bold': 600,
  bold: 700,
  'extra-bold': 800,
  'ultra-bold': 800,
  black: 900,
  heavy: 900,
  'extra-black': 950,
  'ultra-black': 950,
} as const

export type FontWeightName = keyof typeof FONT_WEIGHT_NAME_TO_NUMBER
export type FontWeightValue = number | FontWeightName

export const FONT_WEIGHT_NAMES = Object.keys(
  FONT_WEIGHT_NAME_TO_NUMBER,
) as FontWeightName[]

function fail(path: string, message: string): TokenValueValidationResult {
  return { ok: false, errors: [{ path, message }] }
}

export function isFontWeightName(value: unknown): value is FontWeightName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(
    FONT_WEIGHT_NAME_TO_NUMBER,
    value,
  )
}

export function isFontWeightNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 1000
}

/**
 * Validate a fontWeight `$value` per DTCG Format §8.4.
 */
export function validateFontWeightValue(
  value: unknown,
  path = '$value',
): TokenValueValidationResult {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 1000) {
      return fail(
        path,
        'INVALID_VALUE — Font weight number must be in the range [1, 1000].',
      )
    }
    return { ok: true }
  }

  if (typeof value === 'string') {
    if (AliasPattern.test(value)) return { ok: true }
    if (isFontWeightName(value)) return { ok: true }
    return fail(
      path,
      'INVALID_VALUE — Expected a number in [1, 1000], a DTCG font-weight name, or a curly-brace alias.',
    )
  }

  return fail(
    path,
    'INVALID_VALUE — Expected a number in [1, 1000], a DTCG font-weight name, or a curly-brace alias.',
  )
}

export function createDefaultFontWeightValue(): FontWeightValue {
  return 400
}

export function formatFontWeightForDisplay(
  value: unknown,
): { primary: string; secondary?: string } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { primary: formatDisplayNumber(value) }
  }
  if (typeof value === 'string') {
    return { primary: value }
  }
  try {
    return { primary: JSON.stringify(value) }
  } catch {
    return { primary: String(value) }
  }
}

/**
 * Parse editor input into a fontWeight `$value`.
 * Accepts: `400`, `bold`, `{alias.path}`. Named aliases are case-sensitive.
 */
export function parseFontWeightFromEditor(
  input: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    return {
      ok: false,
      message: 'Expected a weight number [1–1000], DTCG name, or {alias}',
    }
  }

  if (AliasPattern.test(trimmed)) {
    return { ok: true, value: trimmed }
  }

  if (isFontWeightName(trimmed)) {
    return { ok: true, value: trimmed }
  }

  if (!/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return {
      ok: false,
      message: 'Expected a weight number [1–1000], DTCG name (exact case), or {alias}',
    }
  }

  const n = Number(trimmed)
  if (!isFontWeightNumber(n)) {
    return { ok: false, message: 'Font weight number must be in the range [1, 1000]' }
  }

  return { ok: true, value: n }
}

export const fontWeightTokenTypeDefinition: TokenTypeDefinition = {
  id: 'fontWeight',
  label: 'Font Weight',
  navPath: 'fontWeight',
  navIcon: 'mdi-format-bold',
  validateValue: validateFontWeightValue,
  createDefaultValue: createDefaultFontWeightValue,
  formatForDisplay: formatFontWeightForDisplay,
  parseFromEditor: parseFontWeightFromEditor,
}
