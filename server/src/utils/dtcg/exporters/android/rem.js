/**
 * Android-specific dimension / rem handling.
 *
 * rem → dp conversion REQUIRES an explicit `remBasePx` option.
 * Never assume 16.
 *
 * Style Dictionary's default `size/remToDp` assumes unitless rem and would
 * emit `[object Object]` for DTCG `{ value, unit }` objects. We therefore
 * emit final Android resource strings here (`8px`, `16dp`) and pair them with
 * an SD transform list that does not re-scale sizes.
 */

import { createExportIssue } from '../exportResult.js'
import { isCurlyBraceAlias, isDimensionValue } from '../walkTokens.js'

/**
 * @param {unknown} value
 * @param {string} path
 * @param {{ remBasePx?: number }} options
 * @returns {{ value: unknown, warnings: import('../exportResult.js').ExportIssue[], errors: import('../exportResult.js').ExportIssue[] }}
 */
export function mapDimensionValueForAndroid(value, path, options = {}) {
  const warnings = []
  const errors = []

  if (isCurlyBraceAlias(value)) {
    return { value, warnings, errors }
  }

  if (typeof value === 'string') {
    // Already a dimen-like string — pass through.
    if (/^-?(?:\d+|\d*\.\d+)\s*(px|dp|sp)$/i.test(value.trim())) {
      return { value: value.trim().replace(/\s+/g, ''), warnings, errors }
    }
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DIMENSION',
        message: `android export cannot map dimension string at "${path}".`,
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
        message: `android export expects { value, unit } at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  const unit = value.unit
  const numeric = value.value

  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DIMENSION',
        message: `android export: dimension value must be a finite number at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (unit === 'px') {
    // Preserve px in the resource string; do not invent dp without a documented policy.
    return { value: `${numeric}px`, warnings, errors }
  }

  if (unit !== 'rem') {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DIMENSION',
        message: `android export: unit must be "px" or "rem" at "${path}" (got "${unit}").`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  const remBasePx = options.remBasePx
  if (typeof remBasePx !== 'number' || !Number.isFinite(remBasePx) || remBasePx <= 0) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_REM_BASE_REQUIRED',
        message: `Android rem conversion requires an explicit remBasePx option (token at "${path}"). Do not assume a root font size.`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  const dp = numeric * remBasePx
  warnings.push(
    createExportIssue({
      path,
      code: 'EXPORT_LOSSY_REM',
      message: `Android export converted rem→dp at "${path}" using remBasePx=${remBasePx} (${numeric}rem → ${dp}dp).`,
      severity: 'warning',
    }),
  )

  return {
    value: `${dp}dp`,
    warnings,
    errors,
  }
}
