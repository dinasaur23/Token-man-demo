/**
 * Token table row ordering helpers.
 *
 * Source-document sibling key order is authoritative for tokens that live in
 * uploaded DTCG JSON. `rowOrder` mirrors that order (plus mode-added paths) and
 * must never place a new path at index 0 merely because the reference path was
 * missing from a stale/empty `rowOrder` array.
 *
 * Fallback when there is no reference row (no selection / unknown path):
 * append the new path after the current authoritative order (same as the
 * historical `insertIndex = order.length` behavior when the list was already
 * complete).
 */

import type { JsonValue } from './resolver'
import { collectTokensWithPath } from './dtcg-parser'
import { isJsonRecord, type JsonRecord } from './json-path-helpers'

export const MODE_ADDED_FILE_PREFIX = '__modeAdded__:'
export const WORKSPACE_FILE_FALLBACK = '__workspace__'

/**
 * Stable AG Grid row id: file identity + full token path.
 * Paths are unique within a workspace; file identity prevents collisions across
 * identically named leaves that live under different groups/files, and keeps
 * mode-added rows distinct from source rows.
 */
export function buildStableTokenRowId(sourceFile: string | null | undefined, path: string): string {
  const file = sourceFile && sourceFile.length > 0 ? sourceFile : WORKSPACE_FILE_FALLBACK
  return `${file}::${path}`
}

/**
 * Insert `newKey` into `parent` immediately after `afterKey`, preserving the
 * relative order of all other own keys. Mutates `parent` in place.
 *
 * If `afterKey` is missing, appends (documented fallback — equivalent to no
 * selected sibling in the source object).
 */
export function insertSiblingKeyAfter(
  parent: JsonRecord,
  afterKey: string | null | undefined,
  newKey: string,
  value: JsonValue,
): void {
  if (newKey in parent && newKey !== afterKey) {
    delete parent[newKey]
  }

  const keys = Object.keys(parent)
  const rebuilt: JsonRecord = {}
  let inserted = false

  if (!afterKey || !keys.includes(afterKey)) {
    for (const k of keys) {
      if (k === newKey) continue
      rebuilt[k] = parent[k]
    }
    rebuilt[newKey] = value
    inserted = true
  } else {
    for (const k of keys) {
      if (k === newKey) continue
      rebuilt[k] = parent[k]
      if (k === afterKey) {
        rebuilt[newKey] = value
        inserted = true
      }
    }
  }

  if (!inserted) {
    rebuilt[newKey] = value
  }

  for (const k of Object.keys(parent)) {
    delete parent[k]
  }
  Object.assign(parent, rebuilt)
}

/**
 * Reconcile persisted `rowOrder` with authoritative source-document path order.
 * Source paths define the backbone; non-source (e.g. mode-added) paths from the
 * previous `rowOrder` keep their position relative to the nearest preceding
 * source path.
 */
export function reconcileRowOrderWithSource(
  rowOrder: readonly string[],
  authoritativeSourcePaths: readonly string[],
): string[] {
  const sourceSet = new Set(authoritativeSourcePaths)
  const result = [...authoritativeSourcePaths]

  const extras = rowOrder.filter((p) => !sourceSet.has(p))
  for (const extra of extras) {
    const oldIdx = rowOrder.indexOf(extra)
    let insertAt = result.length

    let placed = false
    for (let i = oldIdx - 1; i >= 0; i--) {
      const prev = rowOrder[i]
      if (!sourceSet.has(prev)) continue
      const at = result.indexOf(prev)
      insertAt = at >= 0 ? at + 1 : result.length
      placed = true
      break
    }

    if (!placed) {
      insertAt = 0
    }

    result.splice(insertAt, 0, extra)
  }

  return result
}

/**
 * Ensure every source path appears in `rowOrder` without reshuffling paths that
 * are already present (preserves figma-seeded / intentional order). Missing
 * source paths are inserted after their nearest preceding source neighbor.
 */
export function ensureRowOrderContainsSourcePaths(
  rowOrder: readonly string[],
  authoritativeSourcePaths: readonly string[],
): string[] {
  if (rowOrder.length === 0) {
    return [...authoritativeSourcePaths]
  }

  const order = [...rowOrder]
  const have = new Set(order)

  for (let i = 0; i < authoritativeSourcePaths.length; i++) {
    const path = authoritativeSourcePaths[i]
    if (have.has(path)) continue

    let insertAt = order.length
    for (let j = i - 1; j >= 0; j--) {
      const prev = authoritativeSourcePaths[j]
      const at = order.indexOf(prev)
      if (at >= 0) {
        insertAt = at + 1
        break
      }
    }

    order.splice(insertAt, 0, path)
    have.add(path)
  }

  return order
}

/**
 * Insert `newPath` directly below `afterPath` in `rowOrder`.
 *
 * When `afterPath` is missing from a stale/empty order, first rebuild against
 * `authoritativeSourcePaths` so the insert cannot land at index 0 ahead of all
 * existing tokens (the intermittent “new row jumps to top” bug).
 *
 * When `afterPath` is null/undefined (no selected row), appends — preserving
 * the existing fallback.
 */
export function insertPathAfterInRowOrder(
  rowOrder: readonly string[],
  afterPath: string | null | undefined,
  newPath: string,
  authoritativeSourcePaths: readonly string[],
): string[] {
  // Empty / missing-reference orders must be rebuilt from source so splice(0)
  // cannot put the new path alone at the front of the sort.
  let order =
    rowOrder.length === 0 || (afterPath != null && !rowOrder.includes(afterPath))
      ? reconcileRowOrderWithSource(rowOrder, authoritativeSourcePaths)
      : ensureRowOrderContainsSourcePaths(rowOrder, authoritativeSourcePaths)

  const existingNew = order.indexOf(newPath)
  if (existingNew >= 0) {
    order = order.filter((p) => p !== newPath)
  }

  if (!afterPath) {
    order.push(newPath)
    return order
  }

  const idx = order.indexOf(afterPath)
  if (idx < 0) {
    // Reference still unknown after reconcile: append (no-selection-equivalent fallback)
    order.push(newPath)
    return order
  }

  order.splice(idx + 1, 0, newPath)
  return order
}

/**
 * Collect token paths from uploaded source documents in DFS Object.entries order
 * (matches `collectTokensWithPath` / source sibling key order).
 */
export function collectSourceTokenPaths(docs: Record<string, JsonValue>): string[] {
  const paths: string[] = []
  const seen = new Set<string>()

  for (const raw of Object.values(docs)) {
    if (!isJsonRecord(raw)) continue
    const root =
      'tokens' in raw && isJsonRecord(raw.tokens) ? (raw.tokens as JsonRecord) : (raw as JsonRecord)

    for (const entry of collectTokensWithPath(root)) {
      if (seen.has(entry.path)) continue
      seen.add(entry.path)
      paths.push(entry.path)
    }
  }

  return paths
}

/**
 * Build path → source file map from uploaded docs (first file wins).
 */
export function buildPathToSourceFileMap(docs: Record<string, JsonValue>): Map<string, string> {
  const map = new Map<string, string>()

  for (const [fileName, raw] of Object.entries(docs)) {
    if (!isJsonRecord(raw)) continue
    const root =
      'tokens' in raw && isJsonRecord(raw.tokens) ? (raw.tokens as JsonRecord) : (raw as JsonRecord)

    for (const entry of collectTokensWithPath(root)) {
      if (!map.has(entry.path)) {
        map.set(entry.path, fileName)
      }
    }
  }

  return map
}

export function modeAddedSourceFile(mode: string): string {
  return `${MODE_ADDED_FILE_PREFIX}${mode}`
}
