/**
 * Per-platform fontWeight mapping for Style Dictionary prep.
 *
 * Canonical JSON keeps numbers / named aliases as authored.
 * Platforms emit numeric weights in [1, 1000] (named aliases resolved).
 * Curly-brace aliases are left for Style Dictionary.
 */

import { createExportIssue } from './exportResult.js'
import { isCurlyBraceAlias } from './walkTokens.js'

/** DTCG §8.4 named aliases → numeric value (exact case). */
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
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function fontWeightToNumber(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 1000) return null
    return value
  }
  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(FONT_WEIGHT_NAME_TO_NUMBER, value)) {
    return FONT_WEIGHT_NAME_TO_NUMBER[value]
  }
  return null
}

/**
 * @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }}
 */
export function mapFontWeightValueForPlatform(value, path, platform = 'css') {
  const warnings = []
  const errors = []

  if (isCurlyBraceAlias(value)) {
    return { value, warnings, errors }
  }

  const numeric = fontWeightToNumber(value)
  if (numeric === null) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_FONTWEIGHT',
        message: `${platform} export expects a font weight number in [1, 1000] or DTCG name at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  return { value: numeric, warnings, errors }
}

export function mapFontWeightValueForCss(value, path) {
  return mapFontWeightValueForPlatform(value, path, 'css')
}
export function mapFontWeightValueForTailwind(value, path) {
  return mapFontWeightValueForPlatform(value, path, 'tailwind')
}
export function mapFontWeightValueForSwift(value, path) {
  return mapFontWeightValueForPlatform(value, path, 'swift')
}
export function mapFontWeightValueForAndroid(value, path) {
  return mapFontWeightValueForPlatform(value, path, 'android')
}
