/**
 * Duration token type — DTCG Format 2025.10 §8.5.
 * @see https://www.designtokens.org/tr/2025.10/format/#duration
 *
 * `$value` MUST be `{ value: number, unit: "ms" | "s" }` or a curly-brace alias.
 * `unit` is required.
 */

import type { TokenTypeDefinition, TokenValueValidationResult } from '../types'

const AliasPattern = /^\{[^}]+\}$/

/** DTCG §8.5 supported units only. */
export const DURATION_UNITS = ['ms', 's'] as const
export type DurationUnit = (typeof DURATION_UNITS)[number]

export type DurationValue = {
  value: number
  unit: DurationUnit
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string, message: string): TokenValueValidationResult {
  return { ok: false, errors: [{ path, message }] }
}

export function isDurationUnit(unit: unknown): unit is DurationUnit {
  return unit === 'ms' || unit === 's'
}

/**
 * Validate a duration `$value` per DTCG Format §8.5.
 */
export function validateDurationValue(
  value: unknown,
  path = '$value',
): TokenValueValidationResult {
  if (typeof value === 'string') {
    if (AliasPattern.test(value)) return { ok: true }
    return fail(
      path,
      'INVALID_VALUE — Expected a DTCG duration object { value, unit } or a curly-brace alias.',
    )
  }

  if (!isJsonObject(value)) {
    return fail(
      path,
      'INVALID_VALUE — Duration value must be an object { value, unit } or a curly-brace alias.',
    )
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'value')) {
    return fail(`${path}.value`, 'INVALID_VALUE — "value" is required.')
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'unit')) {
    return fail(`${path}.unit`, 'INVALID_VALUE — "unit" is required.')
  }

  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    return fail(`${path}.value`, 'INVALID_VALUE — "value" must be a finite number.')
  }

  if (!isDurationUnit(value.unit)) {
    return fail(
      `${path}.unit`,
      'INVALID_VALUE for $type "duration": unit must be "ms" or "s".',
    )
  }

  return { ok: true }
}

export function createDefaultDurationValue(): DurationValue {
  return { value: 0, unit: 'ms' }
}

export function formatDurationForDisplay(
  value: unknown,
): { primary: string; secondary?: string } {
  if (typeof value === 'string' && AliasPattern.test(value)) {
    return { primary: value }
  }
  if (isJsonObject(value) && typeof value.value === 'number' && isDurationUnit(value.unit)) {
    return { primary: `${value.value}${value.unit}` }
  }
  try {
    return { primary: JSON.stringify(value) }
  } catch {
    return { primary: String(value) }
  }
}

/**
 * Parse editor input into a duration `$value`.
 * Accepts: `200ms`, `0.3s`, `200 ms`, `{alias.path}`.
 */
export function parseDurationFromEditor(
  input: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, message: 'Expected a duration like 200ms / 0.3s, or {alias}' }
  }

  if (AliasPattern.test(trimmed)) {
    return { ok: true, value: trimmed }
  }

  const match = trimmed.match(/^(-?(?:\d+|\d*\.\d+))\s*(ms|s)$/i)
  if (!match) {
    return {
      ok: false,
      message: 'Expected a duration like 200ms / 0.3s, or {alias}',
    }
  }

  const numeric = Number(match[1])
  if (!Number.isFinite(numeric)) {
    return { ok: false, message: 'Duration value must be a finite number' }
  }

  const unit = match[2]!.toLowerCase() as DurationUnit
  return { ok: true, value: { value: numeric, unit } }
}

export const durationTokenTypeDefinition: TokenTypeDefinition = {
  id: 'duration',
  label: 'Duration',
  navPath: 'duration',
  navIcon: 'mdi-timer-outline',
  validateValue: validateDurationValue,
  createDefaultValue: createDefaultDurationValue,
  formatForDisplay: formatDurationForDisplay,
  parseFromEditor: parseDurationFromEditor,
}
