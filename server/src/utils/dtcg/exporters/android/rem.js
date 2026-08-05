/**
 * Android-specific dimension / rem handling.
 *
 * rem → dp/sp conversion REQUIRES an explicit `remBasePx` option.
 * Never assume 16.
 */

import { createExportIssue } from '../exportResult.js'
import { isDimensionValue } from '../walkTokens.js'

/**
 * @param {unknown} value
 * @param {string} path
 * @param {{ remBasePx?: number }} options
 * @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }}
 */
export function mapDimensionValueForAndroid(value, path, options = {}) {
  const warnings = []
  const errors = []

  if (!isDimensionValue(value)) {
    return { value, warnings, errors }
  }

  const unit = value.unit
  const numeric = value.value

  if (unit !== 'rem') {
    // px and other absolute units: pass through as authored for SD;
    // do not silently invent dp/sp without a documented mapping.
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

  const px = numeric * remBasePx
  warnings.push(
    createExportIssue({
      path,
      code: 'EXPORT_LOSSY_REM',
      message: `Android export converted rem→dp at "${path}" using remBasePx=${remBasePx} (${numeric}rem → ${px}dp).`,
      severity: 'warning',
    }),
  )

  return {
    value: { value: px, unit: 'dp' },
    warnings,
    errors,
  }
}
