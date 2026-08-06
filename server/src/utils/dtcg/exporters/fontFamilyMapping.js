/**
 * Per-platform fontFamily mapping for Style Dictionary prep.
 *
 * Canonical JSON keeps string or string[] as authored.
 * Platforms emit a CSS font-family list string (arrays joined).
 * Aliases are left for Style Dictionary.
 */

import { createExportIssue } from './exportResult.js'
import { isCurlyBraceAlias } from './walkTokens.js'

/**
 * Quote a font name for CSS when it contains spaces or non-identifier chars.
 * @param {string} name
 * @returns {string}
 */
export function quoteCssFontName(name) {
  const trimmed = name.trim()
  // CSS-wide keywords / generics stay unquoted.
  if (/^(?:inherit|initial|unset|revert|serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(trimmed)) {
    return trimmed
  }
  if (/^[A-Za-z_][\w-]*$/.test(trimmed)) {
    return trimmed
  }
  return `"${trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function fontFamilyToCssString(value) {
  if (typeof value === 'string') {
    if (value.trim().length === 0) return null
    return quoteCssFontName(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    if (!value.every((v) => typeof v === 'string' && v.trim().length > 0)) {
      return null
    }
    return value.map((v) => quoteCssFontName(v)).join(', ')
  }
  return null
}

/**
 * @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }}
 */
export function mapFontFamilyValueForPlatform(value, path, platform = 'css') {
  const warnings = []
  const errors = []

  if (isCurlyBraceAlias(value)) {
    return { value, warnings, errors }
  }

  const css = fontFamilyToCssString(value)
  if (css === null) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_FONTFAMILY',
        message: `${platform} export expects a non-empty font name string or string[] at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  return { value: css, warnings, errors }
}

export function mapFontFamilyValueForCss(value, path) {
  return mapFontFamilyValueForPlatform(value, path, 'css')
}
export function mapFontFamilyValueForTailwind(value, path) {
  return mapFontFamilyValueForPlatform(value, path, 'tailwind')
}
export function mapFontFamilyValueForSwift(value, path) {
  const mapped = mapFontFamilyValueForPlatform(value, path, 'swift')
  if (mapped.errors.length > 0 || isCurlyBraceAlias(mapped.value)) {
    return mapped
  }
  if (typeof mapped.value === 'string' && !mapped.value.startsWith('"')) {
    const escaped = mapped.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return { ...mapped, value: `"${escaped}"` }
  }
  return mapped
}
export function mapFontFamilyValueForAndroid(value, path) {
  return mapFontFamilyValueForPlatform(value, path, 'android')
}
