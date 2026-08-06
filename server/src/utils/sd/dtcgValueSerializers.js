/**
 * Pure DTCG → platform value serializers used by Style Dictionary transforms.
 *
 * Never coerce objects via String(value) / JSON.stringify for CSS-like output.
 * Callers must treat a returned `error` as a hard export failure.
 */

import { extractPrimitiveColor } from '../dtcg/extractPrimitiveColor.js'
import {
  cubicBezierToCssString,
  isCubicBezierArray,
} from '../dtcg/exporters/cubicBezierMapping.js'
import { fontFamilyToCssString } from '../dtcg/exporters/fontFamilyMapping.js'
import {
  FONT_WEIGHT_NAME_TO_NUMBER,
  fontWeightToNumber,
} from '../dtcg/exporters/fontWeightMapping.js'
import { isDurationValue } from '../dtcg/exporters/durationMapping.js'
import { isDimensionValue, isCurlyBraceAlias, isJsonObject } from '../dtcg/exporters/walkTokens.js'
import { createExportIssue } from '../dtcg/exporters/exportResult.js'

/**
 * @typedef {{ ok: true, value: unknown } | { ok: false, error: import('../dtcg/exporters/exportResult.js').ExportIssue }} SerializeResult
 */

/**
 * @param {unknown} token
 * @param {{ usesDtcg?: boolean }} [options]
 * @returns {string | undefined}
 */
export function getEffectiveTokenType(token, options = {}) {
  if (!token || typeof token !== 'object') return undefined
  if (options.usesDtcg) {
    if (typeof token.$type === 'string') return token.$type
  }
  if (typeof token.type === 'string') return token.type
  if (typeof token.$type === 'string') return token.$type
  return undefined
}

/**
 * @param {unknown} token
 * @param {{ usesDtcg?: boolean }} [options]
 */
export function getTokenValue(token, options = {}) {
  if (!token || typeof token !== 'object') return undefined
  if (options.usesDtcg && '$value' in token) return token.$value
  if ('value' in token) return token.value
  if ('$value' in token) return token.$value
  return undefined
}

/**
 * @param {string} path
 * @param {string} code
 * @param {string} message
 * @returns {SerializeResult}
 */
function fail(path, code, message) {
  return {
    ok: false,
    error: createExportIssue({ path, code, message, severity: 'error' }),
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeDimensionCss(value, path = '') {
  if (isCurlyBraceAlias(value)) return { ok: true, value }
  if (typeof value === 'string') {
    if (/^-?(?:\d+|\d*\.\d+)\s*(px|rem)$/i.test(value.trim())) {
      return { ok: true, value: value.trim().replace(/\s+/g, '') }
    }
    return fail(path, 'EXPORT_UNSUPPORTED_DIMENSION', `CSS export cannot map dimension string at "${path}".`)
  }
  if (!isDimensionValue(value)) {
    return fail(path, 'EXPORT_UNSUPPORTED_DIMENSION', `CSS export expects { value, unit } at "${path}".`)
  }
  if (value.unit !== 'px' && value.unit !== 'rem') {
    return fail(
      path,
      'EXPORT_UNSUPPORTED_DIMENSION',
      `CSS export: unit must be "px" or "rem" at "${path}" (got "${value.unit}").`,
    )
  }
  if (!Number.isFinite(value.value)) {
    return fail(path, 'EXPORT_UNSUPPORTED_DIMENSION', `CSS export: dimension value must be finite at "${path}".`)
  }
  return { ok: true, value: `${value.value}${value.unit}` }
}

/**
 * Android dimen output: never multiply by a hidden rem base here.
 * Accepts DTCG px/rem (rem only if already converted upstream) and prep dp objects.
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeDimensionAndroid(value, path = '') {
  if (isCurlyBraceAlias(value)) return { ok: true, value }
  if (typeof value === 'string') {
    if (/^-?(?:\d+|\d*\.\d+)\s*(px|dp|sp)$/i.test(value.trim())) {
      return { ok: true, value: value.trim().replace(/\s+/g, '') }
    }
    return fail(path, 'EXPORT_UNSUPPORTED_DIMENSION', `Android export cannot map dimension string at "${path}".`)
  }
  if (!isJsonObject(value) || typeof value.value !== 'number' || typeof value.unit !== 'string') {
    return fail(path, 'EXPORT_UNSUPPORTED_DIMENSION', `Android export expects { value, unit } at "${path}".`)
  }
  if (!Number.isFinite(value.value)) {
    return fail(path, 'EXPORT_UNSUPPORTED_DIMENSION', `Android export: dimension value must be finite at "${path}".`)
  }
  if (value.unit === 'rem') {
    return fail(
      path,
      'EXPORT_REM_BASE_REQUIRED',
      `Android rem conversion requires prep with remBasePx before SD at "${path}".`,
    )
  }
  if (value.unit === 'px' || value.unit === 'dp' || value.unit === 'sp') {
    // px → dp 1:1 (explicit platform policy; do not apply remBasePx again).
    const unit = value.unit === 'px' ? 'dp' : value.unit
    return { ok: true, value: `${value.value}${unit}` }
  }
  return fail(
    path,
    'EXPORT_UNSUPPORTED_DIMENSION',
    `Android export: unsupported dimension unit "${value.unit}" at "${path}".`,
  )
}

/**
 * Swift/iOS: emit numeric CGFloat literal from px/dp (1:1).
 * rem requires an explicit remBasePx (platform.basePxFontSize).
 * @param {unknown} value
 * @param {string} path
 * @param {{ remBasePx?: number }} [options]
 * @returns {SerializeResult}
 */
export function serializeDimensionSwift(value, path = '', options = {}) {
  const remBase =
    typeof options.remBasePx === 'number' && options.remBasePx > 0
      ? options.remBasePx
      : undefined

  if (isCurlyBraceAlias(value)) return { ok: true, value }
  if (typeof value === 'string') {
    const m = value.trim().match(/^(-?(?:\d+|\d*\.\d+))\s*(px|rem|pt|dp)?$/i)
    if (!m) {
      return fail(path, 'EXPORT_UNSUPPORTED_DIMENSION', `Swift export cannot map dimension string at "${path}".`)
    }
    const numeric = Number(m[1])
    const unit = (m[2] || 'px').toLowerCase()
    if (unit === 'rem') {
      if (remBase === undefined) {
        return fail(
          path,
          'EXPORT_REM_BASE_REQUIRED',
          `Swift rem conversion requires remBasePx / basePxFontSize at "${path}".`,
        )
      }
      return { ok: true, value: `CGFloat(${numeric * remBase})` }
    }
    return { ok: true, value: `CGFloat(${numeric})` }
  }
  if (!isJsonObject(value) || typeof value.value !== 'number' || typeof value.unit !== 'string') {
    return fail(path, 'EXPORT_UNSUPPORTED_DIMENSION', `Swift export expects { value, unit } at "${path}".`)
  }
  if (!Number.isFinite(value.value)) {
    return fail(path, 'EXPORT_UNSUPPORTED_DIMENSION', `Swift export: dimension value must be finite at "${path}".`)
  }
  if (value.unit === 'rem') {
    if (remBase === undefined) {
      return fail(
        path,
        'EXPORT_REM_BASE_REQUIRED',
        `Swift rem conversion requires remBasePx / basePxFontSize at "${path}".`,
      )
    }
    return { ok: true, value: `CGFloat(${value.value * remBase})` }
  }
  if (value.unit === 'px' || value.unit === 'pt' || value.unit === 'dp') {
    return { ok: true, value: `CGFloat(${value.value})` }
  }
  return fail(
    path,
    'EXPORT_UNSUPPORTED_DIMENSION',
    `Swift export: unsupported dimension unit "${value.unit}" at "${path}".`,
  )
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeDurationCss(value, path = '') {
  if (isCurlyBraceAlias(value)) return { ok: true, value }
  if (typeof value === 'string') {
    if (/^-?(?:\d+|\d*\.\d+)\s*(ms|s)$/i.test(value.trim())) {
      return { ok: true, value: value.trim().replace(/\s+/g, '') }
    }
    return fail(path, 'EXPORT_UNSUPPORTED_DURATION', `Duration export cannot map string at "${path}".`)
  }
  if (!isDurationValue(value)) {
    return fail(path, 'EXPORT_UNSUPPORTED_DURATION', `Duration export expects { value, unit: "ms"|"s" } at "${path}".`)
  }
  return { ok: true, value: `${value.value}${value.unit}` }
}

/**
 * Swift string literal for duration CSS values (e.g. `"150ms"`).
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeDurationSwift(value, path = '') {
  const css = serializeDurationCss(value, path)
  if (!css.ok) return css
  if (isCurlyBraceAlias(css.value)) return css
  return { ok: true, value: JSON.stringify(String(css.value)) }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeCubicBezierCss(value, path = '') {
  if (isCurlyBraceAlias(value)) return { ok: true, value }
  if (typeof value === 'string' && /^cubic-bezier\(/i.test(value.trim())) {
    return { ok: true, value: value.trim() }
  }
  const css = cubicBezierToCssString(value)
  if (css === null) {
    return fail(
      path,
      'EXPORT_UNSUPPORTED_CUBICBEZIER',
      `cubicBezier export expects [P1x, P1y, P2x, P2y] with x in [0,1] at "${path}".`,
    )
  }
  return { ok: true, value: css }
}

/**
 * Swift string literal for cubic-bezier CSS values.
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeCubicBezierSwift(value, path = '') {
  const css = serializeCubicBezierCss(value, path)
  if (!css.ok) return css
  if (isCurlyBraceAlias(css.value)) return css
  return { ok: true, value: JSON.stringify(String(css.value)) }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeFontFamilyCss(value, path = '') {
  if (isCurlyBraceAlias(value)) return { ok: true, value }
  const css = fontFamilyToCssString(value)
  if (css === null) {
    return fail(
      path,
      'EXPORT_UNSUPPORTED_FONTFAMILY',
      `fontFamily export expects a non-empty string or string[] at "${path}".`,
    )
  }
  return { ok: true, value: css }
}

/**
 * Swift string literal for font-family CSS lists.
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeFontFamilySwift(value, path = '') {
  const css = serializeFontFamilyCss(value, path)
  if (!css.ok) return css
  if (isCurlyBraceAlias(css.value)) return css
  return { ok: true, value: JSON.stringify(String(css.value)) }
}

/**
 * Prefer number; allow DTCG named keywords as CSS keywords when already valid.
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeFontWeightCss(value, path = '') {
  if (isCurlyBraceAlias(value)) return { ok: true, value }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 1000) {
    return { ok: true, value }
  }
  if (typeof value === 'string') {
    if (Object.prototype.hasOwnProperty.call(FONT_WEIGHT_NAME_TO_NUMBER, value)) {
      return { ok: true, value }
    }
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 1000) {
      return { ok: true, value: numeric }
    }
  }
  const asNumber = fontWeightToNumber(value)
  if (asNumber !== null) return { ok: true, value: asNumber }
  return fail(
    path,
    'EXPORT_UNSUPPORTED_FONTWEIGHT',
    `fontWeight export expects a number in [1,1000] or DTCG name at "${path}".`,
  )
}

/**
 * Swift always emits a numeric literal in [1, 1000].
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeFontWeightSwift(value, path = '') {
  if (isCurlyBraceAlias(value)) return { ok: true, value }
  const asNumber = fontWeightToNumber(value)
  if (asNumber !== null) return { ok: true, value: asNumber }
  return fail(
    path,
    'EXPORT_UNSUPPORTED_FONTWEIGHT',
    `Swift fontWeight export expects a number in [1,1000] or DTCG name at "${path}".`,
  )
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeNumberCss(value, path = '') {
  if (isCurlyBraceAlias(value)) return { ok: true, value }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { ok: true, value }
  }
  return fail(path, 'EXPORT_UNSUPPORTED_NUMBER', `number export expects a finite number at "${path}".`)
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {SerializeResult}
 */
export function serializeColorCss(value, path = '') {
  if (isCurlyBraceAlias(value)) return { ok: true, value }
  if (typeof value === 'string') {
    if (value.trim().length === 0) {
      return fail(path, 'EXPORT_UNSUPPORTED_COLOR', `color export got empty string at "${path}".`)
    }
    return { ok: true, value }
  }
  const primitive = extractPrimitiveColor(value)
  if (typeof primitive === 'string' && primitive.length > 0) {
    return { ok: true, value: primitive }
  }
  return fail(
    path,
    'EXPORT_UNSUPPORTED_COLOR',
    `color export cannot convert DTCG color object at "${path}" to a CSS color.`,
  )
}

/**
 * True when a value is still a non-null object (including arrays) that must not
 * reach CSS/SCSS stringification.
 * @param {unknown} value
 */
export function isRawObjectTokenValue(value) {
  return value !== null && typeof value === 'object'
}

/**
 * Detect DTCG dimension-shaped values even when $type was lost.
 * @param {unknown} value
 */
export function looksLikeDimensionObject(value) {
  return (
    isJsonObject(value) &&
    typeof value.value === 'number' &&
    (value.unit === 'px' || value.unit === 'rem' || value.unit === 'dp' || value.unit === 'sp' || value.unit === 'pt')
  )
}

/**
 * @param {unknown} value
 */
export function looksLikeDurationObject(value) {
  return isDurationValue(value)
}

/**
 * @param {unknown} value
 */
export function looksLikeColorObject(value) {
  return (
    isJsonObject(value) &&
    (typeof value.colorSpace === 'string' || typeof value.hex === 'string')
  )
}

/**
 * @param {unknown} value
 */
export function looksLikeCubicBezier(value) {
  return isCubicBezierArray(value)
}

export { isCubicBezierArray, isDimensionValue, isDurationValue }
