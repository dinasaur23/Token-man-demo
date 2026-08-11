/**
 * Cubic Bézier token type — DTCG Format 2025.10 §8.6.
 * @see https://www.designtokens.org/tr/2025.10/format/#cubic-bezier
 *
 * `$value` MUST be `[P1x, P1y, P2x, P2y]` (four numbers) or a curly-brace alias.
 * P1x and P2x MUST be in [0, 1]; P1y and P2y may be any finite number.
 */

import type { TokenTypeDefinition, TokenValueValidationResult } from '../types'
import { formatDisplayNumber } from '../../formatDisplayNumber'

const AliasPattern = /^\{[^}]+\}$/

export type CubicBezierValue = [number, number, number, number]

function fail(path: string, message: string): TokenValueValidationResult {
  return { ok: false, errors: [{ path, message }] }
}

export function isCubicBezierArray(value: unknown): value is CubicBezierValue {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/**
 * Validate a cubicBezier `$value` per DTCG Format §8.6.
 */
export function validateCubicBezierValue(
  value: unknown,
  path = '$value',
): TokenValueValidationResult {
  if (typeof value === 'string') {
    if (AliasPattern.test(value)) return { ok: true }
    return fail(
      path,
      'INVALID_VALUE — Expected a cubicBezier array [P1x, P1y, P2x, P2y] or a curly-brace alias.',
    )
  }

  if (!Array.isArray(value)) {
    return fail(
      path,
      'INVALID_VALUE — Cubic Bézier value must be an array of four numbers.',
    )
  }

  if (value.length !== 4) {
    return fail(
      path,
      'INVALID_VALUE — Cubic Bézier array must contain exactly four numbers [P1x, P1y, P2x, P2y].',
    )
  }

  for (let i = 0; i < 4; i++) {
    const n = value[i]
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return fail(
        `${path}[${i}]`,
        'INVALID_VALUE — Each cubicBezier component must be a finite number.',
      )
    }
  }

  const [p1x, , p2x] = value as CubicBezierValue
  if (p1x < 0 || p1x > 1) {
    return fail(`${path}[0]`, 'INVALID_VALUE — P1x must be in the range [0, 1].')
  }
  if (p2x < 0 || p2x > 1) {
    return fail(`${path}[2]`, 'INVALID_VALUE — P2x must be in the range [0, 1].')
  }

  return { ok: true }
}

/** CSS `ease` equivalent — common animation default. */
export function createDefaultCubicBezierValue(): CubicBezierValue {
  return [0.25, 0.1, 0.25, 1]
}

export function formatCubicBezierForDisplay(
  value: unknown,
): { primary: string; secondary?: string } {
  if (typeof value === 'string' && AliasPattern.test(value)) {
    return { primary: value }
  }
  if (isCubicBezierArray(value)) {
    return {
      primary: `cubic-bezier(${value.map(formatDisplayNumber).join(', ')})`,
    }
  }
  try {
    return { primary: JSON.stringify(value) }
  } catch {
    return { primary: String(value) }
  }
}

/**
 * Parse editor input into a cubicBezier `$value`.
 * Accepts: `cubic-bezier(0.25, 0.1, 0.25, 1)`, `[0.25,0.1,0.25,1]`,
 * `0.25, 0.1, 0.25, 1`, `{alias.path}`.
 */
export function parseCubicBezierFromEditor(
  input: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    return {
      ok: false,
      message: 'Expected cubic-bezier(...), a 4-number list, JSON array, or {alias}',
    }
  }

  if (AliasPattern.test(trimmed)) {
    return { ok: true, value: trimmed }
  }

  const cssMatch = trimmed.match(
    /^cubic-bezier\(\s*(-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?)\s*,\s*(-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?)\s*,\s*(-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?)\s*,\s*(-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?)\s*\)$/i,
  )
  if (cssMatch) {
    const nums = cssMatch.slice(1, 5).map(Number) as CubicBezierValue
    const check = validateCubicBezierValue(nums)
    if (!check.ok) {
      return { ok: false, message: check.errors[0]?.message ?? 'Invalid cubicBezier' }
    }
    return { ok: true, value: nums }
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      const check = validateCubicBezierValue(parsed)
      if (!check.ok) {
        return {
          ok: false,
          message: check.errors[0]?.message ?? 'Invalid cubicBezier JSON array',
        }
      }
      return { ok: true, value: parsed }
    } catch {
      return { ok: false, message: 'Invalid JSON array for cubicBezier' }
    }
  }

  const parts = trimmed.split(',').map((p) => p.trim())
  if (parts.length === 4 && parts.every((p) => /^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(p))) {
    const nums = parts.map(Number) as CubicBezierValue
    const check = validateCubicBezierValue(nums)
    if (!check.ok) {
      return { ok: false, message: check.errors[0]?.message ?? 'Invalid cubicBezier' }
    }
    return { ok: true, value: nums }
  }

  return {
    ok: false,
    message: 'Expected cubic-bezier(...), a 4-number list, JSON array, or {alias}',
  }
}

export const cubicBezierTokenTypeDefinition: TokenTypeDefinition = {
  id: 'cubicBezier',
  label: 'Cubic Bézier',
  navPath: 'cubicBezier',
  navIcon: 'mdi-vector-curve',
  validateValue: validateCubicBezierValue,
  createDefaultValue: createDefaultCubicBezierValue,
  formatForDisplay: formatCubicBezierForDisplay,
  parseFromEditor: parseCubicBezierFromEditor,
}
