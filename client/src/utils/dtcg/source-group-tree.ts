/**
 * Derive group-tree paths from authoritative source documents (includes empty groups).
 */

import { isJsonRecord, type JsonRecord } from './json-path-helpers'
import type { JsonValue } from './resolver'
import { buildGroupTree, type GroupPathRow } from './grouping'

function isTokenLeafNode(node: JsonRecord): boolean {
  return Object.prototype.hasOwnProperty.call(node, '$value')
}

function childKeys(node: JsonRecord): string[] {
  return Object.keys(node).filter((key) => !key.startsWith('$'))
}

/**
 * Collect group container paths from a source document root.
 * Token leaves (`$value`) are skipped; empty `{}` groups are included.
 */
export function collectGroupPathsFromSourceRoot(
  root: JsonRecord,
  parentSegments: string[] = [],
): string[][] {
  const paths: string[][] = []

  for (const key of childKeys(root)) {
    const child = root[key]
    if (!isJsonRecord(child)) continue
    if (isTokenLeafNode(child)) continue

    const segments = [...parentSegments, key]
    paths.push(segments)
    paths.push(...collectGroupPathsFromSourceRoot(child, segments))
  }

  return paths
}

function sourceDocumentRoot(raw: JsonValue): JsonRecord | null {
  if (!isJsonRecord(raw)) return null
  if ('tokens' in raw && isJsonRecord(raw.tokens)) {
    return raw.tokens as JsonRecord
  }
  return raw as JsonRecord
}

/** Build group paths from all files in a source document map. */
export function collectGroupPathsFromSourceDocuments(
  docs: Record<string, JsonValue>,
): string[][] {
  const all: string[][] = []
  const seen = new Set<string>()

  for (const raw of Object.values(docs)) {
    const root = sourceDocumentRoot(raw)
    if (!root) continue
    for (const segments of collectGroupPathsFromSourceRoot(root)) {
      const id = segments.join('.')
      if (seen.has(id)) continue
      seen.add(id)
      all.push(segments)
    }
  }

  return all
}

export function buildGroupTreeFromSourceDocuments(
  docs: Record<string, JsonValue>,
): ReturnType<typeof buildGroupTree> {
  const rows: GroupPathRow[] = collectGroupPathsFromSourceDocuments(docs).map((groupPath) => ({
    groupPath,
  }))
  return buildGroupTree(rows)
}

/** Union of group paths from table rows and empty groups in source documents. */
export function buildFullGroupTree(
  rows: ReadonlyArray<{ groupPath: string[] }>,
  docs: Record<string, JsonValue>,
): ReturnType<typeof buildGroupTree> {
  const byId = new Map<string, string[]>()

  for (const row of rows) {
    if (!row.groupPath.length) continue
    byId.set(row.groupPath.join('.'), row.groupPath)
  }

  for (const segments of collectGroupPathsFromSourceDocuments(docs)) {
    byId.set(segments.join('.'), segments)
  }

  const mergedRows: GroupPathRow[] = [...byId.values()].map((groupPath) => ({ groupPath }))
  return buildGroupTree(mergedRows)
}
