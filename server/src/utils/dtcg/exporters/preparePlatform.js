/**
 * Per-platform preparers that replace shared `normalizeDtcgForCss`.
 *
 * Input: resolved (merged / mode-applied) view — not the persistence source.
 * Output: ExportResult with a mutated clone ready for Style Dictionary, plus
 * structured warnings/errors. Never silently omits tokens.
 */

import {
  mapColorValueForAndroid,
  mapColorValueForCss,
  mapColorValueForSwift,
  mapColorValueForTailwind,
} from './colorMapping.js'
import {
  mapDimensionValueForCss,
  mapDimensionValueForSwift,
  mapDimensionValueForTailwind,
} from './dimensionMapping.js'
import {
  mapDurationValueForAndroid,
  mapDurationValueForCss,
  mapDurationValueForSwift,
  mapDurationValueForTailwind,
} from './durationMapping.js'
import {
  mapFontFamilyValueForAndroid,
  mapFontFamilyValueForCss,
  mapFontFamilyValueForSwift,
  mapFontFamilyValueForTailwind,
} from './fontFamilyMapping.js'
import {
  mapFontWeightValueForAndroid,
  mapFontWeightValueForCss,
  mapFontWeightValueForSwift,
  mapFontWeightValueForTailwind,
} from './fontWeightMapping.js'
import {
  mapCubicBezierValueForAndroid,
  mapCubicBezierValueForCss,
  mapCubicBezierValueForSwift,
  mapCubicBezierValueForTailwind,
} from './cubicBezierMapping.js'
import {
  mapNumberValueForAndroid,
  mapNumberValueForCss,
  mapNumberValueForSwift,
  mapNumberValueForTailwind,
} from './numberMapping.js'
import { createExportResult, createExportIssue } from './exportResult.js'
import { mapDimensionValueForAndroid } from './android/rem.js'
import { cloneJson, isCurlyBraceAlias, walkTokenLeaves } from './walkTokens.js'

/**
 * @param {'css' | 'tailwind' | 'swift' | 'android'} platform
 * @param {unknown} resolvedDocument
 * @param {{ remBasePx?: number }} [options]
 * @returns {import('./exportResult.js').ExportResult}
 */
export function preparePlatformExport(platform, resolvedDocument, options = {}) {
  if (resolvedDocument === null || resolvedDocument === undefined) {
    return createExportResult({
      ok: false,
      errors: [
        {
          path: '',
          code: 'EXPORT_EMPTY_RESOLVED',
          message: `${platform} export requires a resolved document.`,
          severity: 'error',
        },
      ],
      warnings: [],
    })
  }

  const document = cloneJson(resolvedDocument)
  const warnings = []
  const errors = []

  walkTokenLeaves(document, (node, path, inheritedType) => {
    const effectiveType =
      typeof node.$type === 'string' ? node.$type : inheritedType

    // Never invent or overwrite $type during platform prep.
    const value = node.$value

    if (effectiveType === 'color' || looksLikeColorObject(value)) {
      const mapper = colorMapperFor(platform)
      const mapped = mapper(value, path)
      warnings.push(...mapped.warnings)
      errors.push(...mapped.errors)
      if (mapped.errors.length === 0) {
        node.$value = mapped.value
      }
      return
    }

    if (effectiveType === 'duration' || looksLikeDuration(value)) {
      const mapper = durationMapperFor(platform)
      const mapped = mapper(value, path)
      warnings.push(...mapped.warnings)
      errors.push(...mapped.errors)
      if (mapped.errors.length === 0) {
        node.$value = mapped.value
      }
      return
    }

    if (effectiveType === 'dimension' || looksLikeDimension(value)) {
      if (platform === 'android') {
        const mapped = mapDimensionValueForAndroid(value, path, options)
        warnings.push(...mapped.warnings)
        errors.push(...mapped.errors)
        if (mapped.errors.length === 0) {
          node.$value = mapped.value
        }
      } else if (platform === 'swift') {
        const mapped = mapDimensionValueForSwift(value, path, options)
        warnings.push(...mapped.warnings)
        errors.push(...mapped.errors)
        if (mapped.errors.length === 0) {
          node.$value = mapped.value
        }
      } else {
        const mapper = dimensionMapperFor(platform)
        const mapped = mapper(value, path)
        warnings.push(...mapped.warnings)
        errors.push(...mapped.errors)
        if (mapped.errors.length === 0) {
          node.$value = mapped.value
        }
      }
      return
    }

    if (effectiveType === 'number') {
      const mapper = numberMapperFor(platform)
      const mapped = mapper(value, path)
      warnings.push(...mapped.warnings)
      errors.push(...mapped.errors)
      if (mapped.errors.length === 0) {
        node.$value = mapped.value
      }
      return
    }

    if (effectiveType === 'fontFamily') {
      const mapper = fontFamilyMapperFor(platform)
      const mapped = mapper(value, path)
      warnings.push(...mapped.warnings)
      errors.push(...mapped.errors)
      if (mapped.errors.length === 0) {
        node.$value = mapped.value
      }
      return
    }

    if (effectiveType === 'fontWeight') {
      const mapper = fontWeightMapperFor(platform)
      const mapped = mapper(value, path)
      warnings.push(...mapped.warnings)
      errors.push(...mapped.errors)
      if (mapped.errors.length === 0) {
        node.$value = mapped.value
      }
      return
    }

    if (effectiveType === 'cubicBezier') {
      const mapper = cubicBezierMapperFor(platform)
      const mapped = mapper(value, path)
      warnings.push(...mapped.warnings)
      errors.push(...mapped.errors)
      if (mapped.errors.length === 0) {
        node.$value = mapped.value
      }
    }
  })

  // Defense: any remaining non-alias object/array $value would become
  // "[object Object]" / bad coercion in Style Dictionary formatters.
  if (errors.length === 0) {
    walkTokenLeaves(document, (node, path) => {
      const v = node.$value
      if (isCurlyBraceAlias(v)) return
      if (v !== null && typeof v === 'object') {
        errors.push(
          createExportIssue({
            path,
            code: 'EXPORT_UNSERIALIZED_VALUE',
            message: `${platform} export left a structured $value at "${path}" that would coerce to an invalid platform literal. Serialize it in the per-type mapper.`,
            severity: 'error',
          }),
        )
      }
    })
  }

  const ok = errors.length === 0
  return createExportResult({
    ok,
    document: ok ? document : cloneJson(resolvedDocument),
    warnings,
    errors,
  })
}

function colorMapperFor(platform) {
  switch (platform) {
    case 'css':
      return mapColorValueForCss
    case 'tailwind':
      return mapColorValueForTailwind
    case 'swift':
      return mapColorValueForSwift
    case 'android':
      return mapColorValueForAndroid
    default:
      return mapColorValueForCss
  }
}

function dimensionMapperFor(platform) {
  switch (platform) {
    case 'tailwind':
      return mapDimensionValueForTailwind
    case 'css':
    default:
      return mapDimensionValueForCss
  }
}

function numberMapperFor(platform) {
  switch (platform) {
    case 'tailwind':
      return mapNumberValueForTailwind
    case 'swift':
      return mapNumberValueForSwift
    case 'android':
      return mapNumberValueForAndroid
    case 'css':
    default:
      return mapNumberValueForCss
  }
}

function durationMapperFor(platform) {
  switch (platform) {
    case 'tailwind':
      return mapDurationValueForTailwind
    case 'swift':
      return mapDurationValueForSwift
    case 'android':
      return mapDurationValueForAndroid
    case 'css':
    default:
      return mapDurationValueForCss
  }
}

function fontFamilyMapperFor(platform) {
  switch (platform) {
    case 'tailwind':
      return mapFontFamilyValueForTailwind
    case 'swift':
      return mapFontFamilyValueForSwift
    case 'android':
      return mapFontFamilyValueForAndroid
    case 'css':
    default:
      return mapFontFamilyValueForCss
  }
}

function fontWeightMapperFor(platform) {
  switch (platform) {
    case 'tailwind':
      return mapFontWeightValueForTailwind
    case 'swift':
      return mapFontWeightValueForSwift
    case 'android':
      return mapFontWeightValueForAndroid
    case 'css':
    default:
      return mapFontWeightValueForCss
  }
}

function cubicBezierMapperFor(platform) {
  switch (platform) {
    case 'tailwind':
      return mapCubicBezierValueForTailwind
    case 'swift':
      return mapCubicBezierValueForSwift
    case 'android':
      return mapCubicBezierValueForAndroid
    case 'css':
    default:
      return mapCubicBezierValueForCss
  }
}

function looksLikeColorObject(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (typeof value.colorSpace === 'string' || typeof value.hex === 'string')
  )
}

/** Dimension heuristic: only px/rem so duration {value, unit: ms|s} is not mis-routed. */
function looksLikeDimension(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.value === 'number' &&
    (value.unit === 'px' || value.unit === 'rem')
  )
}

/** Duration heuristic: ms/s units only. */
function looksLikeDuration(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.value === 'number' &&
    (value.unit === 'ms' || value.unit === 's')
  )
}

/** Convenience wrappers */
export function prepareCssExport(doc, options) {
  return preparePlatformExport('css', doc, options)
}
export function prepareTailwindExport(doc, options) {
  return preparePlatformExport('tailwind', doc, options)
}
export function prepareSwiftExport(doc, options) {
  return preparePlatformExport('swift', doc, options)
}
export function prepareAndroidExport(doc, options) {
  return preparePlatformExport('android', doc, options)
}
