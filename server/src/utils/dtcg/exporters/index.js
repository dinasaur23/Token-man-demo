/**
 * Stage 12 export split — public entry points.
 *
 * - Canonical JSON ← source document (aliases / hierarchy / metadata intact)
 * - Platform exporters ← resolved view + per-target policy
 */

export { exportCanonicalJson, mergeSourceDocumentsForCanonicalExport } from './canonicalJson.js'
export {
  preparePlatformExport,
  prepareCssExport,
  prepareTailwindExport,
  prepareSwiftExport,
  prepareAndroidExport,
} from './preparePlatform.js'
export { createExportIssue, createExportResult } from './exportResult.js'
export { mapDimensionValueForAndroid } from './android/rem.js'
export {
  mapDimensionValueForCss,
  mapDimensionValueForTailwind,
  mapDimensionValueForSwift,
} from './dimensionMapping.js'
export {
  mapNumberValueForCss,
  mapNumberValueForTailwind,
  mapNumberValueForSwift,
  mapNumberValueForAndroid,
} from './numberMapping.js'
export {
  mapDurationValueForCss,
  mapDurationValueForTailwind,
  mapDurationValueForSwift,
  mapDurationValueForAndroid,
  isDurationValue,
} from './durationMapping.js'
export {
  mapFontFamilyValueForCss,
  mapFontFamilyValueForTailwind,
  mapFontFamilyValueForSwift,
  mapFontFamilyValueForAndroid,
  fontFamilyToCssString,
  quoteCssFontName,
} from './fontFamilyMapping.js'
export {
  mapFontWeightValueForCss,
  mapFontWeightValueForTailwind,
  mapFontWeightValueForSwift,
  mapFontWeightValueForAndroid,
  fontWeightToNumber,
  FONT_WEIGHT_NAME_TO_NUMBER,
} from './fontWeightMapping.js'
