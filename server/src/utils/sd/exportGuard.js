/**
 * Final export guard: refuse builds that still contain raw object token values
 * (which become "[object Object]" under String(value) in CSS/SCSS formatters).
 */

import fs from 'fs'
import { createExportIssue, createExportResult } from '../dtcg/exporters/exportResult.js'
import { getTokenValue, isRawObjectTokenValue } from './dtcgValueSerializers.js'

/**
 * Platforms whose generated files must never contain the Object stringification
 * artifact, and whose transformed token values must not remain objects.
 */
const OBJECT_FORBIDDEN_FORMATS = new Set(['css', 'scss', 'tailwind', 'android', 'swift'])

/**
 * @param {object} options
 * @param {string} options.format - export format key (css|tailwind|android|swift|scss)
 * @param {Array<object>} options.allTokens - Style Dictionary dictionary.allTokens
 * @param {string[]} [options.outputFilePaths] - generated file paths to scan
 * @param {{ usesDtcg?: boolean }} [options.sdOptions]
 * @returns {import('../dtcg/exporters/exportResult.js').ExportResult}
 */
export function assertNoRawObjectExportValues({
  format,
  allTokens,
  outputFilePaths = [],
  sdOptions = { usesDtcg: true },
}) {
  const errors = []
  const warnings = []

  if (!OBJECT_FORBIDDEN_FORMATS.has(format)) {
    return createExportResult({ ok: true, warnings, errors })
  }

  for (const token of allTokens || []) {
    const value = getTokenValue(token, sdOptions)
    if (!isRawObjectTokenValue(value)) continue

    const path = Array.isArray(token.path) ? token.path.join('.') : token.name || ''
    errors.push(
      createExportIssue({
        path,
        code: 'EXPORT_RAW_OBJECT_VALUE',
        message: `${format} export left a non-null object value at "${path}" (would stringify as "[object Object]").`,
        severity: 'error',
      }),
    )
  }

  for (const filePath of outputFilePaths) {
    if (!filePath || !fs.existsSync(filePath)) continue
    const text = fs.readFileSync(filePath, 'utf8')
    if (text.includes('[object Object]')) {
      errors.push(
        createExportIssue({
          path: filePath,
          code: 'EXPORT_OBJECT_STRINGIFIED',
          message: `${format} output contains "[object Object]" in ${filePath}.`,
          severity: 'error',
        }),
      )
    }
  }

  return createExportResult({
    ok: errors.length === 0,
    warnings,
    errors,
  })
}

export { OBJECT_FORBIDDEN_FORMATS }
