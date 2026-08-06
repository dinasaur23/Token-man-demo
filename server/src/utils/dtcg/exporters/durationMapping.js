/**
 * Per-platform duration mapping for Style Dictionary prep.
 *
 * Canonical JSON keeps `{ value, unit }` objects.
 * CSS / Tailwind / Android emit `200ms` / `0.3s` strings.
 * Swift emits TimeInterval seconds as JSON numbers (150ms → 0.15).
 */

import { createExportIssue } from './exportResult.js'
import { isCurlyBraceAlias, isJsonObject } from './walkTokens.js'

const DURATION_UNITS = new Set(['ms', 's'])

/**
 * @returns {boolean}
 */
export function isDurationValue(value) {
  return (
    isJsonObject(value) &&
    typeof value.value === 'number' &&
    typeof value.unit === 'string' &&
    DURATION_UNITS.has(value.unit)
  )
}

/**
 * @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }}
 */
export function mapDurationValueForCss(value, path) {
  return mapDurationValueToCssString(value, path, 'css')
}

/** @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }} */
export function mapDurationValueForTailwind(value, path) {
  return mapDurationValueToCssString(value, path, 'tailwind')
}

/**
 * Swift: emit seconds as a finite number (TimeInterval-compatible).
 * @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }}
 */
export function mapDurationValueForSwift(value, path) {
  const warnings = []
  const errors = []

  if (isCurlyBraceAlias(value)) {
    return { value, warnings, errors }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value, warnings, errors }
  }

  if (typeof value === 'string') {
    const match = value.trim().match(/^(-?(?:\d+|\d*\.\d+))\s*(ms|s)$/i)
    if (match) {
      const numeric = Number(match[1])
      const unit = match[2].toLowerCase()
      return {
        value: unit === 'ms' ? numeric / 1000 : numeric,
        warnings,
        errors,
      }
    }
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DURATION',
        message: `swift export cannot map duration string at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (!isDurationValue(value)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DURATION',
        message: `swift export expects { value, unit } at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (!Number.isFinite(value.value)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DURATION',
        message: `swift export: duration value must be a finite number at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  const seconds = value.unit === 'ms' ? value.value / 1000 : value.value
  return { value: seconds, warnings, errors }
}

/** @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }} */
export function mapDurationValueForAndroid(value, path) {
  return mapDurationValueToCssString(value, path, 'android')
}

function mapDurationValueToCssString(value, path, platform) {
  const warnings = []
  const errors = []

  if (isCurlyBraceAlias(value)) {
    return { value, warnings, errors }
  }

  if (typeof value === 'string') {
    if (/^-?(?:\d+|\d*\.\d+)\s*(ms|s)$/i.test(value.trim())) {
      return { value: value.trim().replace(/\s+/g, ''), warnings, errors }
    }
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DURATION',
        message: `${platform} export cannot map duration string at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (!isJsonObject(value) || typeof value.value !== 'number' || typeof value.unit !== 'string') {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DURATION',
        message: `${platform} export expects { value, unit } at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (!DURATION_UNITS.has(value.unit)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DURATION',
        message: `${platform} export: unit must be "ms" or "s" at "${path}" (got "${value.unit}").`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (!Number.isFinite(value.value)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_DURATION',
        message: `${platform} export: duration value must be a finite number at "${path}".`,
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
