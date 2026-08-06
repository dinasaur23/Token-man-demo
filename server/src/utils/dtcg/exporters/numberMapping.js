/**
 * Per-platform number mapping for Style Dictionary prep.
 *
 * Numbers stay JSON numbers on all platforms (plan: number → number).
 * Aliases are left for Style Dictionary. Non-finite / unsupported shapes error.
 */

import { createExportIssue } from './exportResult.js'
import { isCurlyBraceAlias } from './walkTokens.js'

/**
 * @returns {{ value: unknown, warnings: import('./exportResult.js').ExportIssue[], errors: import('./exportResult.js').ExportIssue[] }}
 */
export function mapNumberValueForPlatform(value, path, platform = 'css') {
  const warnings = []
  const errors = []

  if (isCurlyBraceAlias(value)) {
    return { value, warnings, errors }
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      errors.push(
        createExportIssue({
          path,
          code: 'EXPORT_UNSUPPORTED_NUMBER',
          message: `${platform} export requires a finite number at "${path}".`,
          severity: 'error',
        }),
      )
      return { value, warnings, errors }
    }
    return { value, warnings, errors }
  }

  errors.push(
    createExportIssue({
      path,
      code: 'EXPORT_UNSUPPORTED_NUMBER',
      message: `${platform} export expects a JSON number or curly-brace alias at "${path}".`,
      severity: 'error',
    }),
  )
  return { value, warnings, errors }
}

export function mapNumberValueForCss(value, path) {
  return mapNumberValueForPlatform(value, path, 'css')
}
export function mapNumberValueForTailwind(value, path) {
  return mapNumberValueForPlatform(value, path, 'tailwind')
}
export function mapNumberValueForSwift(value, path) {
  return mapNumberValueForPlatform(value, path, 'swift')
}
export function mapNumberValueForAndroid(value, path) {
  return mapNumberValueForPlatform(value, path, 'android')
}
