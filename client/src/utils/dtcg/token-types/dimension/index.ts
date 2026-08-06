/**
 * Dimension token type — DTCG Format 2025.10 §8.2.
 * @see https://www.designtokens.org/tr/2025.10/format/#dimension
 *
 * `$value` MUST be `{ value: number, unit: "px" | "rem" }` or a curly-brace alias.
 * `unit` is required even when `value` is `0`.
 */

import type { TokenTypeDefinition, TokenValueValidationResult } from '../types'

const AliasPattern = /^\{[^}]+\}$/

/** DTCG §8.2 supported units only. */
export const DIMENSION_UNITS = ['px', 'rem'] as const
export type DimensionUnit = (typeof DIMENSION_UNITS)[number]

export type DimensionValue = {
  value: number
  unit: DimensionUnit
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string, message: string): TokenValueValidationResult {
  return { ok: false, errors: [{ path, message }] }
}

export function isDimensionUnit(unit: unknown): unit is DimensionUnit {
  return unit === 'px' || unit === 'rem'
}

/**
 * Validate a dimension `$value` per DTCG Format §8.2.
 */
export function validateDimensionValue(
  value: unknown,
  path = '$value',
): TokenValueValidationResult {
  if (typeof value === 'string') {
    if (AliasPattern.test(value)) return { ok: true }
    return fail(
      path,
      'INVALID_VALUE — Expected a DTCG dimension object { value, unit } or a curly-brace alias.',
    )
  }

  if (!isJsonObject(value)) {
    return fail(
      path,
      'INVALID_VALUE — Dimension value must be an object { value, unit } or a curly-brace alias.',
    )
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'value')) {
    return fail(`${path}.value`, 'INVALID_VALUE — "value" is required.')
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'unit')) {
    return fail(
      `${path}.unit`,
      'INVALID_VALUE — "unit" is required even when value is 0.',
    )
  }

  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    return fail(`${path}.value`, 'INVALID_VALUE — "value" must be a finite number.')
  }

  if (!isDimensionUnit(value.unit)) {
    return fail(
      `${path}.unit`,
      'INVALID_VALUE for $type "dimension": unit must be "px" or "rem".',
    )
  }

  return { ok: true }
}

export function createDefaultDimensionValue(): DimensionValue {
  return { value: 0, unit: 'px' }
}

export function formatDimensionForDisplay(
  value: unknown,
): { primary: string; secondary?: string } {
  if (typeof value === 'string' && AliasPattern.test(value)) {
    return { primary: value }
  }
  if (isJsonObject(value) && typeof value.value === 'number' && isDimensionUnit(value.unit)) {
    return { primary: `${value.value}${value.unit}` }
  }
  try {
    return { primary: JSON.stringify(value) }
  } catch {
    return { primary: String(value) }
  }
}

/**
 * Parse editor input into a dimension `$value`.
 * Accepts: `16px`, `1rem`, `16 px`, `{alias.path}`.
 */
export function parseDimensionFromEditor(
  input: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, message: 'Expected a dimension like 16px / 1rem, or {alias}' }
  }

  if (AliasPattern.test(trimmed)) {
    return { ok: true, value: trimmed }
  }

  const match = trimmed.match(/^(-?(?:\d+|\d*\.\d+))\s*(px|rem)$/i)
  if (!match) {
    return {
      ok: false,
      message: 'Expected a dimension like 16px / 1rem, or {alias}',
    }
  }

  const numeric = Number(match[1])
  if (!Number.isFinite(numeric)) {
    return { ok: false, message: 'Dimension value must be a finite number' }
  }

  const unit = match[2]!.toLowerCase() as DimensionUnit
  return { ok: true, value: { value: numeric, unit } }
}

export const dimensionTokenTypeDefinition: TokenTypeDefinition = {
  id: 'dimension',
  label: 'Dimension',
  navPath: 'dimension',
  navIcon: 'mdi-ruler',
  validateValue: validateDimensionValue,
  createDefaultValue: createDefaultDimensionValue,
  formatForDisplay: formatDimensionForDisplay,
  parseFromEditor: parseDimensionFromEditor,
}
