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

export function buildGroupTree(allRows: ColorRow[]): GroupNode[] {
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

export function extractGroupPath(path: string): string[] {
  const dot = path.indexOf('.')
  if (dot === -1) return []

  const tokenSetPart = path.slice(0, dot)
  const rest = path.slice(dot + 1)

  const tsSegments = tokenSetPart.split('/')

  const GENERIC_SUFFIXES = ['color', 'colors', 'typography', 'type', 'spacing']

  let collectionSegments = [...tsSegments]
  const last = collectionSegments[collectionSegments.length - 1]

  if (GENERIC_SUFFIXES.includes(last)) {
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
