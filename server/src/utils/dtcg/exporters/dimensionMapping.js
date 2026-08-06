/**
 * Per-platform dimension mapping for Style Dictionary prep.
 *
 * Canonical JSON keeps `{ value, unit }` objects.
 * CSS / Tailwind / Swift emit `16px` / `1rem` strings.
 * Android rem→dp is handled in `android/rem.js` (requires remBasePx).
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

/** @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }} */
export function mapDimensionValueForSwift(value, path) {
  // Swift / iOS: px → keep numeric string with pt-equivalent unit label for SD;
  // rem stays as rem string (lossy conversion is Android-specific with remBasePx).
  return mapDimensionValueToCssString(value, path, 'swift')
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
  return isDimensionValue(value) || (
    isJsonObject(value) &&
    typeof value.value === 'number' &&
    typeof value.unit === 'string'
  )
}
