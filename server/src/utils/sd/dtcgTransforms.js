/**
 * Style Dictionary transforms that serialize DTCG 2025.10 basic types.
 *
 * These are registered in addition to (and ahead of) built-in transforms so we
 * never depend blindly on a single Style Dictionary transform group.
 */

import {
  getEffectiveTokenType,
  getTokenValue,
  looksLikeColorObject,
  looksLikeCubicBezier,
  looksLikeDimensionObject,
  looksLikeDurationObject,
  serializeColorCss,
  serializeCubicBezierCss,
  serializeCubicBezierSwift,
  serializeDimensionAndroid,
  serializeDimensionCss,
  serializeDimensionSwift,
  serializeDurationCss,
  serializeDurationSwift,
  serializeFontFamilyCss,
  serializeFontFamilySwift,
  serializeFontWeightCss,
  serializeFontWeightSwift,
  serializeNumberCss,
} from './dtcgValueSerializers.js'

/** @typedef {import('style-dictionary/types').Transform} Transform */

/**
 * @param {SerializeResult} result
 * @param {string} tokenName
 */
function unwrapOrThrow(result, tokenName) {
  if (result.ok) return result.value
  const err = new Error(result.error.message)
  err.code = result.error.code
  err.exportIssue = result.error
  err.tokenName = tokenName
  throw err
}

/**
 * @param {(value: unknown, path: string, ctx?: { remBasePx?: number }) => import('./dtcgValueSerializers.js').SerializeResult} serializer
 * @param {(type: string | undefined, value: unknown) => boolean} match
 * @param {{ usePlatformRemBase?: boolean }} [opts]
 * @returns {Omit<Transform, 'name'>}
 */
function makeValueTransform(serializer, match, opts = {}) {
  return {
    type: 'value',
    transitive: true,
    filter: (token, options) => {
      const type = getEffectiveTokenType(token, options)
      const value = getTokenValue(token, options)
      return match(type, value)
    },
    transform: (token, platform, options) => {
      const value = getTokenValue(token, options)
      const path = Array.isArray(token.path) ? token.path.join('.') : token.name || ''
      const ctx = {}
      if (opts.usePlatformRemBase) {
        const base = platform?.basePxFontSize
        if (typeof base === 'number' && base > 0) ctx.remBasePx = base
      }
      return unwrapOrThrow(serializer(value, path, ctx), token.name || path)
    },
  }
}

/** @type {Record<string, Omit<Transform, 'name'>>} */
export const dtcgTransforms = {
  'dtcg/css/dimension': makeValueTransform(
    serializeDimensionCss,
    (type, value) => type === 'dimension' || looksLikeDimensionObject(value),
  ),
  'dtcg/css/duration': makeValueTransform(
    serializeDurationCss,
    (type, value) => type === 'duration' || looksLikeDurationObject(value),
  ),
  'dtcg/css/cubicBezier': makeValueTransform(
    serializeCubicBezierCss,
    (type, value) => type === 'cubicBezier' || looksLikeCubicBezier(value),
  ),
  'dtcg/css/fontFamily': makeValueTransform(
    serializeFontFamilyCss,
    (type) => type === 'fontFamily',
  ),
  'dtcg/css/fontWeight': makeValueTransform(
    serializeFontWeightCss,
    (type) => type === 'fontWeight',
  ),
  'dtcg/css/number': makeValueTransform(
    serializeNumberCss,
    (type) => type === 'number',
  ),
  'dtcg/css/color': makeValueTransform(
    serializeColorCss,
    (type, value) => type === 'color' || looksLikeColorObject(value),
  ),

  // Tailwind / JS module: same CSS-compatible literals for the seven basics.
  'dtcg/js/dimension': makeValueTransform(
    serializeDimensionCss,
    (type, value) => type === 'dimension' || looksLikeDimensionObject(value),
  ),
  'dtcg/js/duration': makeValueTransform(
    serializeDurationCss,
    (type, value) => type === 'duration' || looksLikeDurationObject(value),
  ),
  'dtcg/js/cubicBezier': makeValueTransform(
    serializeCubicBezierCss,
    (type, value) => type === 'cubicBezier' || looksLikeCubicBezier(value),
  ),
  'dtcg/js/fontFamily': makeValueTransform(
    serializeFontFamilyCss,
    (type) => type === 'fontFamily',
  ),
  'dtcg/js/fontWeight': makeValueTransform(
    serializeFontWeightCss,
    (type) => type === 'fontWeight',
  ),
  'dtcg/js/number': makeValueTransform(
    serializeNumberCss,
    (type) => type === 'number',
  ),
  'dtcg/js/color': makeValueTransform(
    serializeColorCss,
    (type, value) => type === 'color' || looksLikeColorObject(value),
  ),

  'dtcg/android/dimension': makeValueTransform(
    serializeDimensionAndroid,
    (type, value) => type === 'dimension' || looksLikeDimensionObject(value),
  ),
  'dtcg/android/duration': makeValueTransform(
    serializeDurationCss,
    (type, value) => type === 'duration' || looksLikeDurationObject(value),
  ),
  'dtcg/android/cubicBezier': makeValueTransform(
    serializeCubicBezierCss,
    (type, value) => type === 'cubicBezier' || looksLikeCubicBezier(value),
  ),
  'dtcg/android/fontFamily': makeValueTransform(
    serializeFontFamilyCss,
    (type) => type === 'fontFamily',
  ),
  'dtcg/android/fontWeight': makeValueTransform(
    serializeFontWeightCss,
    (type) => type === 'fontWeight',
  ),
  'dtcg/android/number': makeValueTransform(
    serializeNumberCss,
    (type) => type === 'number',
  ),
  'dtcg/android/color': makeValueTransform(
    serializeColorCss,
    (type, value) => type === 'color' || looksLikeColorObject(value),
  ),

  'dtcg/swift/dimension': makeValueTransform(
    serializeDimensionSwift,
    (type, value) => type === 'dimension' || looksLikeDimensionObject(value),
    { usePlatformRemBase: true },
  ),
  'dtcg/swift/duration': makeValueTransform(
    serializeDurationSwift,
    (type, value) => type === 'duration' || looksLikeDurationObject(value),
  ),
  'dtcg/swift/cubicBezier': makeValueTransform(
    serializeCubicBezierSwift,
    (type, value) => type === 'cubicBezier' || looksLikeCubicBezier(value),
  ),
  'dtcg/swift/fontFamily': makeValueTransform(
    serializeFontFamilySwift,
    (type) => type === 'fontFamily',
  ),
  'dtcg/swift/fontWeight': makeValueTransform(
    serializeFontWeightSwift,
    (type) => type === 'fontWeight',
  ),
  'dtcg/swift/number': makeValueTransform(
    serializeNumberCss,
    (type) => type === 'number',
  ),
  'dtcg/swift/color': makeValueTransform(
    serializeColorCss,
    (type, value) => type === 'color' || looksLikeColorObject(value),
  ),
}

/**
 * Custom transform groups. DTCG serializers run before remaining built-ins.
 * Android/Swift omit rem* size transforms that re-scale already-resolved values.
 */
export const dtcgTransformGroups = {
  'token-manager/css': [
    'attribute/cti',
    'name/kebab',
    'dtcg/css/dimension',
    'dtcg/css/duration',
    'dtcg/css/cubicBezier',
    'dtcg/css/fontFamily',
    'dtcg/css/fontWeight',
    'dtcg/css/number',
    'dtcg/css/color',
    // Built-ins kept for non-DTCG / already-stringified fallthrough paths.
    'time/seconds',
    'html/icon',
    'size/rem',
    'color/css',
    'asset/url',
    'fontFamily/css',
    'cubicBezier/css',
    'strokeStyle/css/shorthand',
    'border/css/shorthand',
    'typography/css/shorthand',
    'transition/css/shorthand',
    'shadow/css/shorthand',
  ],
  // SCSS uses the same DTCG serializers as CSS (same CSS-compatible literals).
  'token-manager/scss': [
    'attribute/cti',
    'name/kebab',
    'dtcg/css/dimension',
    'dtcg/css/duration',
    'dtcg/css/cubicBezier',
    'dtcg/css/fontFamily',
    'dtcg/css/fontWeight',
    'dtcg/css/number',
    'dtcg/css/color',
    'time/seconds',
    'html/icon',
    'size/rem',
    'color/css',
    'asset/url',
    'fontFamily/css',
    'cubicBezier/css',
    'strokeStyle/css/shorthand',
    'border/css/shorthand',
    'typography/css/shorthand',
    'transition/css/shorthand',
    'shadow/css/shorthand',
  ],
  'token-manager/tailwind': [
    'attribute/cti',
    'name/pascal',
    'dtcg/js/dimension',
    'dtcg/js/duration',
    'dtcg/js/cubicBezier',
    'dtcg/js/fontFamily',
    'dtcg/js/fontWeight',
    'dtcg/js/number',
    'dtcg/js/color',
    'size/rem',
    'color/hex',
  ],
  'token-manager/android': [
    'attribute/cti',
    'name/snake',
    'dtcg/android/dimension',
    'dtcg/android/duration',
    'dtcg/android/cubicBezier',
    'dtcg/android/fontFamily',
    'dtcg/android/fontWeight',
    'dtcg/android/number',
    'dtcg/android/color',
    'color/hex8android',
    // Intentionally omit size/remToDp + size/remToSp — they re-scale DTCG units.
  ],
  'token-manager/ios-swift': [
    'attribute/cti',
    'name/camel',
    'dtcg/swift/dimension',
    'dtcg/swift/duration',
    'dtcg/swift/cubicBezier',
    'dtcg/swift/fontFamily',
    'dtcg/swift/fontWeight',
    'dtcg/swift/number',
    'dtcg/swift/color',
    'color/UIColorSwift',
    'content/swift/literal',
    'asset/swift/literal',
    // Intentionally omit size/swift/remToCGFloat — it re-scales DTCG units.
  ],
}

/**
 * Merge DTCG hooks into a Style Dictionary config object.
 * @param {object} config
 * @returns {object}
 */
export function withDtcgSdAdapters(config) {
  const existingHooks = config.hooks || {}
  return {
    ...config,
    hooks: {
      ...existingHooks,
      transforms: {
        ...(existingHooks.transforms || {}),
        ...dtcgTransforms,
      },
      transformGroups: {
        ...(existingHooks.transformGroups || {}),
        ...dtcgTransformGroups,
      },
    },
  }
}
