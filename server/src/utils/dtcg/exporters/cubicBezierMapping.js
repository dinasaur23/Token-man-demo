/**
 * Per-platform cubicBezier mapping for Style Dictionary prep.
 *
 * Canonical JSON keeps `[P1x, P1y, P2x, P2y]` arrays.
 * Platforms emit `cubic-bezier(P1x, P1y, P2x, P2y)` CSS strings.
 * Aliases are left for Style Dictionary.
 */

import { createExportIssue } from './exportResult.js'
import { isCurlyBraceAlias } from './walkTokens.js'

/**
 * @param {unknown} value
 * @returns {value is [number, number, number, number]}
 */
export function isCubicBezierArray(value) {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function cubicBezierToCssString(value) {
  if (!isCubicBezierArray(value)) return null
  const [p1x, p1y, p2x, p2y] = value
  if (p1x < 0 || p1x > 1 || p2x < 0 || p2x > 1) return null
  return `cubic-bezier(${p1x}, ${p1y}, ${p2x}, ${p2y})`
}

/**
 * @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }}
 */
export function mapCubicBezierValueForPlatform(value, path, platform = 'css') {
  const warnings = []
  const errors = []

  if (isCurlyBraceAlias(value)) {
    return { value, warnings, errors }
  }

  // Already a CSS cubic-bezier() string — pass through if well-formed.
  if (typeof value === 'string') {
    const match = value
      .trim()
      .match(
        /^cubic-bezier\(\s*(-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?)\s*,\s*(-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?)\s*,\s*(-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?)\s*,\s*(-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?)\s*\)$/i,
      )
    if (match) {
      const nums = match.slice(1, 5).map(Number)
      const css = cubicBezierToCssString(nums)
      if (css) {
        return { value: css, warnings, errors }
      }
    }
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_CUBICBEZIER',
        message: `${platform} export cannot map cubicBezier string at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  const css = cubicBezierToCssString(value)
  if (css === null) {
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_UNSUPPORTED_CUBICBEZIER',
        message: `${platform} export expects [P1x, P1y, P2x, P2y] with x in [0,1] at "${path}".`,
        severity: 'error',
      }),
    )
    return { value, warnings, errors }
  }

  return { value: css, warnings, errors }
}

export function mapCubicBezierValueForCss(value, path) {
  return mapCubicBezierValueForPlatform(value, path, 'css')
}
export function mapCubicBezierValueForTailwind(value, path) {
  return mapCubicBezierValueForPlatform(value, path, 'tailwind')
}
export function mapCubicBezierValueForSwift(value, path) {
  return mapCubicBezierValueForPlatform(value, path, 'swift')
}
export function mapCubicBezierValueForAndroid(value, path) {
  return mapCubicBezierValueForPlatform(value, path, 'android')
}
