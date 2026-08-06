/**
 * Canonical DTCG JSON export — serializes the persisted *source* document.
 *
 * Guarantees:
 * - Aliases (`{…}`) are preserved as authored
 * - Hierarchy, metadata ($description, $deprecated), and $extensions preserved
 * - Group `$type` left on groups; never materialized onto leaves that lacked it
 * - No color flattening / platform conversion
 * - No silent omission
 */

import { createExportResult } from './exportResult.js'
import { cloneJson, isJsonObject, walkTokenLeaves } from './walkTokens.js'

/**
 * @param {unknown} sourceDocument Authoritative source tree (not a resolved view).
 * @returns {import('./exportResult.js').ExportResult}
 */
export function exportCanonicalJson(sourceDocument) {
  if (sourceDocument === null || sourceDocument === undefined) {
    return createExportResult({
      ok: false,
      errors: [
        {
          path: '',
          code: 'EXPORT_EMPTY_SOURCE',
          message: 'Canonical JSON export requires a source document.',
          severity: 'error',
        },
      ],
      warnings: [],
    })
  }

  const document = cloneJson(sourceDocument)

  // Ensure we did not invent leaf $type from inheritance during clone.
  assertNoInventedLeafTypes(sourceDocument, document)

  return createExportResult({
    ok: true,
    document,
    json: JSON.stringify(document, null, 2),
    warnings: [],
    errors: [],
  })
}

/**
 * Compare source vs clone: any leaf that lacked `$type` in source must still
 * lack it in the export (group inheritance must not be materialized).
 */
function assertNoInventedLeafTypes(source, exported) {
  const sourceTypes = new Map()
  walkTokenLeaves(source, (node, path) => {
    sourceTypes.set(path, Object.prototype.hasOwnProperty.call(node, '$type'))
  })
  walkTokenLeaves(exported, (node, path) => {
    const hadType = sourceTypes.get(path)
    if (hadType === false && Object.prototype.hasOwnProperty.call(node, '$type')) {
      throw new Error(
        `Canonical export invented $type on leaf "${path}" — group inheritance must stay inherited.`,
      )
    }
  })
}

/**
 * Merge multiple source files for canonical export without mode flattening
 * or alias resolution.
 * @param {Record<string, unknown>} docs
 */
export function mergeSourceDocumentsForCanonicalExport(docs) {
  const values = Object.values(docs ?? {})
  if (values.length === 0) return {}

  let result = {}
  for (const doc of values) {
    result = deepMerge(result, doc)
  }
  return isJsonObject(result) ? result : {}
}

function deepMerge(target, source) {
  if (!isJsonObject(target)) return cloneJson(source)
  if (!isJsonObject(source)) return cloneJson(source)

  const out = { ...target }
  for (const key of Object.keys(source)) {
    const tVal = target[key]
    const sVal = source[key]
    if (tVal === undefined) {
      out[key] = cloneJson(sVal)
    } else if (sVal === undefined) {
      out[key] = cloneJson(tVal)
    } else {
      out[key] = deepMerge(tVal, sVal)
    }
  }
  return out
}
