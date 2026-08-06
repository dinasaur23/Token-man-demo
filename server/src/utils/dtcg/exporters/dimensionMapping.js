/**
 * Per-platform dimension mapping for Style Dictionary prep.
 *
 * Canonical JSON keeps `{ value, unit }` objects.
 * CSS / Tailwind emit `16px` / `1rem` strings.
 * Swift emits unitless point numbers (px as-is; rem requires remBasePx).
 * Android rem→dp strings are handled in `android/rem.js`.
 */

import { createExportIssue } from './exportResult.js'
import { isCurlyBraceAlias, isDimensionValue, isJsonObject } from './walkTokens.js'

const DIMENSION_UNITS = new Set(['px', 'rem'])

/**
 * @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }}
 */
export function mapDimensionValueForCss(value, path) {
  return mapDimensionValueToCssString(value, path, 'css')
}

/** @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }} */
export function mapDimensionValueForTailwind(value, path) {
  return mapDimensionValueToCssString(value, path, 'tailwind')
}

/**
 * Swift / iOS: emit unitless CGFloat-compatible numbers (points).
 * `px` → number; `rem` → number × remBasePx (required) with lossy warning.
 *
 * @param {unknown} value
 * @param {string} path
 * @param {{ remBasePx?: number }} [options]
 */
export function mapDimensionValueForSwift(value, path, options = {}) {
  const warnings = []
  const errors = []

  if (isCurlyBraceAlias(value)) {
    return { value, warnings, errors }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value, warnings, errors }
  }

  if (typeof value === 'string') {
    const match = value.trim().match(/^(-?(?:\d+|\d*\.\d+))\s*(px|rem)?$/i)
    if (match) {
      const numeric = Number(match[1])
      const unit = (match[2] || 'px').toLowerCase()
      if (unit === 'px') return { value: numeric, warnings, errors }
      // rem string without options — fall through to object path via reconstruction
      value = { value: numeric, unit: 'rem' }
    } else {
      errors.push(
        createExportIssue({
          path,
          code: 'EXPORT_UNSUPPORTED_DIMENSION',
          message: `swift export cannot map dimension string at "${path}".`,
          severity: 'error',
        }),
      )
      return { value, warnings, errors }
    }
  }

  if (!isDimensionValue(value)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DIMENSION',
        message: `swift export expects { value, unit } at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (!DIMENSION_UNITS.has(value.unit)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DIMENSION',
        message: `swift export: unit must be "px" or "rem" at "${path}" (got "${value.unit}").`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DIMENSION',
        message: `swift export: dimension value must be a finite number at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (value.unit === 'px') {
    return { value: value.value, warnings, errors }
  }

  const remBasePx = options.remBasePx
  if (typeof remBasePx !== 'number' || !Number.isFinite(remBasePx) || remBasePx <= 0) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_REM_BASE_REQUIRED',
        message: `Swift rem→pt conversion requires an explicit remBasePx option (token at "${path}").`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  const points = value.value * remBasePx
  warnings.push(
    createExportIssue({
      path,
      code: 'EXPORT_LOSSY_REM',
      message: `Swift export converted rem→pt at "${path}" using remBasePx=${remBasePx} (${value.value}rem → ${points}).`,
      severity: 'warning',
    }),
  )
  return { value: points, warnings, errors }
}

function mapDimensionValueToCssString(value, path, platform) {
  const warnings = []
  const errors = []

  if (isCurlyBraceAlias(value)) {
    return { value, warnings, errors }
  }

  if (typeof value === 'string') {
    // Already a CSS-like dimension string — pass through if well-formed.
    if (/^-?(?:\d+|\d*\.\d+)\s*(px|rem)$/i.test(value.trim())) {
      return { value: value.trim().replace(/\s+/g, ''), warnings, errors }
    }
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DIMENSION',
        message: `${platform} export cannot map dimension string at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (!isDimensionValue(value)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DIMENSION',
        message: `${platform} export expects { value, unit } at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (!DIMENSION_UNITS.has(value.unit)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DIMENSION',
        message: `${platform} export: unit must be "px" or "rem" at "${path}" (got "${value.unit}").`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DIMENSION',
        message: `${platform} export: dimension value must be a finite number at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  return {
    value: `${value.value}${value.unit}`,
    warnings,
    errors,
  }
}

/**
 * Android: px pass-through as object (or leave for rem handler).
 * Prefer `mapDimensionValueForAndroid` from android/rem.js for rem.
 */
export function isDimensionObject(value) {
  return (
    isDimensionValue(value) ||
    (isJsonObject(value) &&
      typeof value.value === 'number' &&
      typeof value.unit === 'string')
  )
}
