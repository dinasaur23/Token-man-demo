/**
 * Shared structured export result / issue helpers (Stage 12).
 *
 * Platform exporters and canonical JSON export return this shape so callers
 * never silently omit or convert tokens.
 */

/**
 * @typedef {'error' | 'warning'} ExportIssueSeverity
 */

/**
 * @typedef {object} ExportIssue
 * @property {string} path
 * @property {string} code
 * @property {string} message
 * @property {ExportIssueSeverity} severity
 */

/**
 * @typedef {object} ExportResult
 * @property {boolean} ok
 * @property {unknown} [document]
 * @property {string} [json]
 * @property {ExportIssue[]} warnings
 * @property {ExportIssue[]} errors
 */

/**
 * @param {{ path?: string, code: string, message: string, severity?: ExportIssueSeverity }} issue
 * @returns {ExportIssue}
 */
export function createExportIssue({ path = '', code, message, severity = 'error' }) {
  return { path, code, message, severity }
}

/**
 * @param {{
 *   ok: boolean,
 *   document?: unknown,
 *   json?: string,
 *   warnings?: ExportIssue[],
 *   errors?: ExportIssue[],
 * }} partial
 * @returns {ExportResult}
 */
export function createExportResult({
  ok,
  document,
  json,
  warnings = [],
  errors = [],
}) {
  return {
    ok,
    document,
    json,
    warnings: [...warnings],
    errors: [...errors],
  }
}

/** @param {ExportIssue[]} issues */
export function hasExportErrors(issues) {
  return issues.some((i) => i.severity === 'error')
}
