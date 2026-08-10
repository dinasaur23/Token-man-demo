import type { ColorRow } from './dtcg-parser'
import type { GroupNode } from './token-table-types'
import type { JsonValue } from './resolver'
import { isJsonRecord, type JsonRecord } from './json-path-helpers'

export function pruneEmptyChildren(nodes: GroupNode[]): GroupNode[] {
  return nodes.map((node) => {
    const children = node.children ? pruneEmptyChildren(node.children) : undefined
    const hasChildren = !!(children && children.length)

    if (hasChildren) {
      return { ...node, children }
    }
    const result: GroupNode = { ...node }
    delete (result as { children?: GroupNode[] }).children
    return result
  })
}

/** Rows that contribute group path segments to the tree. */
export type GroupPathRow = {
  groupPath: string[]
  type?: string
}

export function buildGroupTree(allRows: GroupPathRow[]): GroupNode[] {
  const root: GroupNode[] = []
  const lookup = new Map<string, GroupNode>()

  for (const row of allRows) {
    if (!row.groupPath.length) continue

    const pathSoFar: string[] = []
    let children = root

    for (const segment of row.groupPath) {
      pathSoFar.push(segment)
      const id = pathSoFar.join('.')

      let node = lookup.get(id)
      if (!node) {
        node = { id, title: segment, children: [] }
        lookup.set(id, node)
        children.push(node)
      }

      children = node.children!
    }
  }

  return root
}

/**
 * Keep rows whose effective `type` matches `tokenType`.
 * Uses the resolved/effective type already on each row — does not infer from value shape.
 */
export function filterRowsByTokenType<T extends { type: string }>(
  rows: readonly T[],
  tokenType: string,
): T[] {
  return rows.filter((row) => row.type === tokenType)
}

/**
 * Build a group tree containing only groups that (directly or via descendants)
 * hold at least one token of `tokenType`. Ancestor paths to nested matches are kept.
 * Pure: does not mutate `rows` or any source document.
 */
export function buildGroupTreeForTokenType(
  rows: ReadonlyArray<{ type: string; groupPath: string[] }>,
  tokenType: string,
): GroupNode[] {
  const matching = filterRowsByTokenType(rows, tokenType)
  return pruneEmptyChildren(buildGroupTree(matching))
}

function sourceDocumentRoot(raw: JsonValue): JsonRecord | null {
  if (!isJsonRecord(raw)) return null
  if ('tokens' in raw && isJsonRecord(raw.tokens)) {
    return raw.tokens as JsonRecord
  }
  return raw as JsonRecord
}

function isTokenLeafNode(node: JsonRecord): boolean {
  return Object.prototype.hasOwnProperty.call(node, '$value')
}

function childKeys(node: JsonRecord): string[] {
  return Object.keys(node).filter((key) => !key.startsWith('$'))
}

function hasTokenLeafInSubtree(node: JsonRecord): boolean {
  if (isTokenLeafNode(node)) return true
  for (const key of childKeys(node)) {
    const child = node[key]
    if (isJsonRecord(child) && hasTokenLeafInSubtree(child)) return true
  }
  return false
}

function collectEmptyTypedGroupPathsFromSourceRoot(
  root: JsonRecord,
  tokenType: string,
  parentSegments: string[] = [],
  inheritedType?: string,
): string[][] {
  const paths: string[][] = []

  for (const key of childKeys(root)) {
    const child = root[key]
    if (!isJsonRecord(child) || isTokenLeafNode(child)) continue

    const localType = typeof child.$type === 'string' ? child.$type : undefined
    const effectiveType = localType ?? inheritedType
    const segments = [...parentSegments, key]

    if (!hasTokenLeafInSubtree(child) && effectiveType === tokenType) {
      paths.push(segments)
    }

    paths.push(
      ...collectEmptyTypedGroupPathsFromSourceRoot(child, tokenType, segments, effectiveType),
    )
  }

  return paths
}

function collectEmptyTypedGroupPathsFromSourceDocuments(
  docs: Record<string, JsonValue>,
  tokenType: string,
): string[][] {
  const all: string[][] = []
  const seen = new Set<string>()

  for (const raw of Object.values(docs)) {
    const root = sourceDocumentRoot(raw)
    if (!root) continue
    for (const segments of collectEmptyTypedGroupPathsFromSourceRoot(root, tokenType)) {
      const id = segments.join('.')
      if (seen.has(id)) continue
      seen.add(id)
      all.push(segments)
    }
  }

  return all
}

/**
 * Type-filtered tree when token rows match; otherwise empty source groups whose
 * effective group `$type` matches `tokenType` (typed empty workspaces only).
 * Does not expose groups from other token types as creation destinations.
 * Pure — never mutates source data.
 */
export function buildGroupTreeWithTypeFallback(
  rows: ReadonlyArray<{ type: string; groupPath: string[] }>,
  tokenType: string,
  docs: Record<string, JsonValue>,
): GroupNode[] {
  const filtered = buildGroupTreeForTokenType(rows, tokenType)
  if (filtered.length > 0) return filtered

  const fallbackRows: GroupPathRow[] = collectEmptyTypedGroupPathsFromSourceDocuments(
    docs,
    tokenType,
  ).map((groupPath) => ({ groupPath }))

  return pruneEmptyChildren(buildGroupTree(fallbackRows))
}

/** Apply display-name overrides without mutating the input tree. */
export function applyGroupNameOverrides(
  nodes: GroupNode[],
  overrides: Record<string, string>,
): GroupNode[] {
  return nodes.map((node) => {
    const overriddenTitle = overrides[node.id] ?? node.title
    if (node.children && node.children.length > 0) {
      return {
        id: node.id,
        title: overriddenTitle,
        children: applyGroupNameOverrides(node.children, overrides),
      }
    }
    return {
      id: node.id,
      title: overriddenTitle,
    }
  })
}

/** Collect every node id in a group tree (for selection validity checks). */
export function collectGroupTreeIds(nodes: GroupNode[]): Set<string> {
  const ids = new Set<string>()
  function walk(list: GroupNode[]) {
    for (const node of list) {
      ids.add(node.id)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return ids
}

export function extractGroupPath(path: string): string[] {
  const dot = path.indexOf('.')
  if (dot === -1) return []

  const tokenSetPart = path.slice(0, dot)
  const rest = path.slice(dot + 1)

  const tsSegments = tokenSetPart.split('/')

  /**
   * Tokens Studio / multi-file collection paths may end with a type-ish suffix
   * after a slash, e.g. `MyCollection/spacing.md` or `Brand/colors.brand.primary`.
   * Strip that suffix only when a parent collection segment remains.
   *
   * Do NOT strip when the suffix is the sole first segment (DTCG-native roots
   * like `spacing.md` / `colors.brand.primary`). Stripping those emptied
   * `groupPath`, which dropped Dimension (and flat Color) tokens from the
   * group tree and type-filtered table.
   */
  const GENERIC_SUFFIXES = ['color', 'colors', 'typography', 'type', 'spacing']

  let collectionSegments = [...tsSegments]
  const last = collectionSegments[collectionSegments.length - 1]

  if (GENERIC_SUFFIXES.includes(last) && collectionSegments.length > 1) {
    collectionSegments = collectionSegments.slice(0, -1)
  }

  const collection = collectionSegments.join('/')

  const parts = rest.split('.')
  parts.pop()
  const cleaned = parts.filter((p, i) => {
    if (p === 'alias') return false
    if (p === 'color' && parts[i - 1] === 'alias') return false
    return true
  })

  return collection ? [collection, ...cleaned] : cleaned
}

/** @deprecated Prefer GroupPathRow — kept for callers that still import ColorRow. */
export type { ColorRow }
