/**
 * Pure helpers for reporting unsupported / invalid token `$type` values.
 * Used by the report-only CLI — never mutates or deletes workspace data.
 */

import { classifyDeclaredTokenType } from './allowedTokenTypes.js'

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Walk a DTCG document and collect declared `$type` values that are not
 * application-supported.
 *
 * @returns {Array<{ path: string, $type: string, classification: string, message: string }>}
 */
export function collectUnsupportedTokenTypesFromDocument(doc, pathPrefix = '') {
  const findings = []

  function visit(node, segments) {
    if (!isObject(node)) return

    if (typeof node.$type === 'string') {
      const classified = classifyDeclaredTokenType(node.$type)
      if (classified) {
        const path = segments.length > 0 ? segments.join('.') : pathPrefix || '(root)'
        findings.push({
          path,
          $type: classified.$type,
          classification: classified.classification,
          message: classified.message,
        })
      }
    }

    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) continue
      visit(child, [...segments, key])
    }
  }

  if (isObject(doc)) visit(doc, pathPrefix ? pathPrefix.split('.').filter(Boolean) : [])
  return findings
}

/**
 * @param {{ workspaceId: string, files?: Array<{ name?: string, content?: unknown }> }} workspace
 */
export function collectUnsupportedTokenTypesFromWorkspace(workspace) {
  const workspaceId = String(workspace.workspaceId ?? workspace._id ?? '')
  const rows = []

  for (const file of workspace.files ?? []) {
    const fileName = file?.name ?? '(unnamed)'
    const findings = collectUnsupportedTokenTypesFromDocument(file?.content)
    for (const finding of findings) {
      rows.push({
        workspaceId,
        fileName,
        path: finding.path,
        $type: finding.$type,
        classification: finding.classification,
        message: finding.message,
      })
    }
  }

  return rows
}
