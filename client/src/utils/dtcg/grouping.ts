import type { ColorRow } from './dtcg-parser'
import type { GroupNode } from './token-table-types'

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
