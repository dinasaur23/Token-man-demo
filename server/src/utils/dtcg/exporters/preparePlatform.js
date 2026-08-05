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
import { createExportResult } from './exportResult.js'
import { mapDimensionValueForAndroid } from './android/rem.js'
import { cloneJson, walkTokenLeaves } from './walkTokens.js'

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

    if (effectiveType === 'dimension' || looksLikeDimension(value)) {
      if (platform === 'android') {
        const mapped = mapDimensionValueForAndroid(value, path, options)
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
    }
  })

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
    case 'swift':
      return mapDimensionValueForSwift
    case 'css':
    default:
      return mapDimensionValueForCss
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

function looksLikeDimension(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.value === 'number' &&
    typeof value.unit === 'string'
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
