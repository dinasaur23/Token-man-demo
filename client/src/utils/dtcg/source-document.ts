/**
 * Source DTCG documents are the only trees that may be persisted.
 * Edits MUST mutate source nodes, then rebuild the resolved view.
 */

import { normalizeHexColorsInSourceDocument } from './color-conversion'

export type Json = unknown
export type JsonObject = Record<string, Json>

export type SourceDocument = Json
export type SourceDocumentMap = Record<string, SourceDocument>

export function isJsonObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function cloneSourceDocument<T extends Json>(doc: T): T {
  return JSON.parse(JSON.stringify(doc)) as T
}

export function cloneSourceDocumentMap(docs: SourceDocumentMap): SourceDocumentMap {
  const out: SourceDocumentMap = {}
  for (const [name, content] of Object.entries(docs)) {
    out[name] = cloneSourceDocument(content)
  }
  return out
}

/**
 * Walk to a path of non-$ segments and return the node, if any.
 */
export function getSourceNodeAtPath(
  root: SourceDocument,
  pathSegments: string[],
): Json | undefined {
  let current: Json = root
  for (const segment of pathSegments) {
    if (!isJsonObject(current)) return undefined
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined
    current = current[segment]
  }
  return current
}

/**
 * When replacing a color `$value`, keep unedited optional fields from the
 * previous color object (e.g. `alpha` when the editor only supplied a new hex).
 * Does not invent fields; only copies keys present on previous and absent on next.
 */
export function mergeColorValuePreservingOptionalFields(
  previous: Json,
  next: Json,
): Json {
  if (!isJsonObject(previous) || !isJsonObject(next)) return next
  if (typeof next.colorSpace !== 'string' || !Array.isArray(next.components)) {
    return next
  }
  if (typeof previous.colorSpace !== 'string') return next

  const out: JsonObject = { ...next }

  // Documented optional color fields: alpha, hex. Preserve when the edit omitted them.
  if (!Object.prototype.hasOwnProperty.call(next, 'alpha') &&
      Object.prototype.hasOwnProperty.call(previous, 'alpha')) {
    out.alpha = previous.alpha
  }
  if (!Object.prototype.hasOwnProperty.call(next, 'hex') &&
      Object.prototype.hasOwnProperty.call(previous, 'hex')) {
    out.hex = previous.hex
  }

  return out
}

/**
 * Update only `$value` on an existing token leaf, preserving every other
 * property on that node ($type, $description, $extensions, $deprecated, …)
 * and leaving sibling/group structure untouched.
 *
 * When both previous and next `$value` are color objects, optional color
 * fields omitted from `nextValue` are carried forward from the previous value.
 */
export function setSourceTokenValueAtPath(
  root: SourceDocument,
  pathSegments: string[],
  nextValue: Json,
): SourceDocument {
  if (pathSegments.length === 0) {
    throw new Error('setSourceTokenValueAtPath: empty path')
  }

  const cloned = cloneSourceDocument(root)
  let parent: JsonObject = isJsonObject(cloned)
    ? cloned
    : (() => {
        throw new Error('setSourceTokenValueAtPath: root must be an object')
      })()

  for (let i = 0; i < pathSegments.length - 1; i++) {
    const segment = pathSegments[i]!
    const child = parent[segment]
    if (!isJsonObject(child)) {
      throw new Error(
        `setSourceTokenValueAtPath: missing object at "${pathSegments.slice(0, i + 1).join('.')}"`,
      )
    }
    parent = child
  }

  const leafKey = pathSegments[pathSegments.length - 1]!
  const leaf = parent[leafKey]
  if (!isJsonObject(leaf)) {
    throw new Error(
      `setSourceTokenValueAtPath: missing token object at "${pathSegments.join('.')}"`,
    )
  }

  const mergedValue = mergeColorValuePreservingOptionalFields(leaf.$value, nextValue)

  // Preserve all existing leaf properties; only replace $value.
  parent[leafKey] = { ...leaf, $value: mergedValue }
  return cloned
}

/**
 * Apply a single-token `$value` edit on one file in a source document map.
 * Returns a new map; does not mutate `docs`. Never writes a resolved view.
 */
export function applySourceTokenValueEdit(
  docs: SourceDocumentMap,
  fileName: string,
  pathSegments: string[],
  nextValue: Json,
): SourceDocumentMap {
  const doc = docs[fileName]
  if (doc === undefined) {
    throw new Error(`applySourceTokenValueEdit: missing document "${fileName}"`)
  }
  return {
    ...docs,
    [fileName]: setSourceTokenValueAtPath(doc, pathSegments, nextValue),
  }
}

/**
 * Serialize source documents for persistence / canonical DTCG JSON export.
 * Never pass a resolved view into this helper.
 */
export function serializeSourceDocumentsForPersistence(
  docs: SourceDocumentMap,
): Array<{ name: string; content: SourceDocument }> {
  return Object.entries(docs).map(([name, content]) => ({
    name,
    content: cloneSourceDocument(content),
  }))
}

/**
 * Rehydrate a persistence payload back into a source document map.
 * Round-trip companion to `serializeSourceDocumentsForPersistence`.
 */
export function rehydrateSourceDocumentsFromPersistence(
  files: Array<{ name: string; content: SourceDocument }>,
): SourceDocumentMap {
  const out: SourceDocumentMap = {}
  for (const file of files) {
    out[file.name] = cloneSourceDocument(file.content)
  }
  return out
}

/**
 * Normalize documented hex-string color `$value`s into canonical DTCG objects
 * across a source document map. Writes source only — never a resolved view.
 */
export function normalizeHexColorsInSourceDocumentMap(
  docs: SourceDocumentMap,
): SourceDocumentMap {
  const out: SourceDocumentMap = {}
  for (const [name, content] of Object.entries(docs)) {
    out[name] = normalizeHexColorsInSourceDocument(content)
  }
  return out
}
