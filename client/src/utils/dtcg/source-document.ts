/**
 * Source DTCG documents are the only trees that may be persisted.
 * Edits MUST mutate source nodes, then rebuild the resolved view.
 */

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
 * Update only `$value` on an existing token leaf, preserving every other
 * property on that node ($type, $description, $extensions, $deprecated, …)
 * and leaving sibling/group structure untouched.
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

  // Preserve all existing leaf properties; only replace $value.
  parent[leafKey] = { ...leaf, $value: nextValue }
  return cloned
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
