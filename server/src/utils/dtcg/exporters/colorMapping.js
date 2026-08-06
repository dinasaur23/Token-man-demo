/**
 * Per-platform color mapping for Style Dictionary prep.
 *
 * Never silently omit tokens. Unconvertible colors become structured errors.
 * Lossy conversions (e.g. alpha dropped when emitting 6-digit hex) become
 * structured warnings.
 */

import { extractPrimitiveColor } from '../extractPrimitiveColor.js'
import { createExportIssue } from './exportResult.js'
import { isCurlyBraceAlias, isJsonObject } from './walkTokens.js'

/**
 * Map a DTCG color `$value` to a CSS-compatible hex (or leave aliases).
 * @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }}
 */
export function mapColorValueForCss(value, path) {
  return mapColorValueToHex(value, path, 'css')
}

/** @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }} */
export function mapColorValueForTailwind(value, path) {
  return mapColorValueToHex(value, path, 'tailwind')
}

/** @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }} */
export function mapColorValueForSwift(value, path) {
  return mapColorValueToHex(value, path, 'swift')
}

/** @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }} */
export function mapColorValueForAndroid(value, path) {
  return mapColorValueToHex(value, path, 'android')
}

/**
 * Shared hex mapping used by current Style Dictionary pipelines.
 * Each platform owns the call site; this helper does not invent policy beyond
 * hex emission + structured issues.
 */
function mapColorValueToHex(value, path, platform) {
  const warnings = []
  const errors = []

  if (isCurlyBraceAlias(value)) {
    return { value, warnings, errors }
  }

  if (typeof value === 'string') {
    return { value, warnings, errors }
  }

  if (!isJsonObject(value)) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_COLOR',
        message: `${platform} export cannot map non-object color value at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  // Explicit unsupported: CSS "none" components without a usable hex.
  if (
    Array.isArray(value.components) &&
    value.components.some((c) => c === 'none') &&
    typeof value.hex !== 'string'
  ) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_COLOR',
        message: `${platform} export does not support color components "none" without a hex fallback at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  const primitive = extractPrimitiveColor(value)
  if (primitive == null) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_COLOR',
        message: `${platform} export cannot convert color at "${path}" to a primitive (unsupported colorSpace or components).`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  if (
    typeof value.alpha === 'number' &&
    value.alpha < 1 &&
    typeof primitive === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(primitive)
  ) {
    warnings.push(
      createExportIssue({
        path,
        code: 'EXPORT_LOSSY_COLOR',
        message: `${platform} export dropped alpha=${value.alpha} when converting color at "${path}" to ${primitive}.`,
        severity: 'warning',
      }),
    )
  } else if (isJsonObject(value) && primitive !== value) {
    warnings.push(
      createExportIssue({
        path,
        code: 'EXPORT_LOSSY_COLOR',
        message: `${platform} export converted DTCG color object at "${path}" to ${JSON.stringify(primitive)}.`,
        severity: 'warning',
      }),
    )
  }

  if (
    typeof value.colorSpace === 'string' &&
    value.colorSpace !== 'srgb' &&
    typeof value.hex === 'string'
  ) {
    warnings.push(
      createExportIssue({
        path,
        code: 'EXPORT_LOSSY_COLOR',
        message: `${platform} export used hex fallback for non-sRGB colorSpace "${value.colorSpace}" at "${path}".`,
        severity: 'warning',
      }),
    )
  }

  return { value: primitive, warnings, errors }
}
