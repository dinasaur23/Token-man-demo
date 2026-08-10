/**
 * Group-tree type fallback + empty groups from source.
 */
import { describe, expect, it } from 'vitest'
import {
  buildGroupTreeForTokenType,
  buildGroupTreeWithTypeFallback,
  filterRowsByTokenType,
} from '../grouping'
import { buildFullGroupTree, collectGroupPathsFromSourceRoot } from '../source-group-tree'
import type { TableRow } from '../token-table-types'

function row(
  path: string,
  type: TableRow['type'],
  groupPath: string[],
): Pick<TableRow, 'path' | 'type' | 'groupPath'> {
  return { path, type, groupPath }
}

const mixedWorkspace = [
  row('colors.brand.primary', 'color', ['colors', 'brand']),
  row('spacing.scale.md', 'dimension', ['spacing', 'scale']),
]

describe('group tree type fallback', () => {
  it('uses type-filtered tree when matches exist', () => {
    const fallback = buildFullGroupTree(mixedWorkspace, {})
    const tree = buildGroupTreeWithTypeFallback(mixedWorkspace, 'color', fallback)
    const filtered = buildGroupTreeForTokenType(mixedWorkspace, 'color')
    expect(tree).toEqual(filtered)
  })

  it('falls back to full hierarchy when no groups contain the active type', () => {
    const fallback = buildFullGroupTree(mixedWorkspace, {})
    const tree = buildGroupTreeWithTypeFallback(mixedWorkspace, 'fontFamily', fallback)
    expect(tree.map((n) => n.id).sort()).toEqual(['colors', 'spacing'])
  })

  it('resumes filtered behavior after first token of active type exists', () => {
    const withDimension = [
      ...mixedWorkspace,
      row('colors.brand.gap', 'dimension', ['colors', 'brand']),
    ]
    const fallback = buildFullGroupTree(withDimension, {})
    const tree = buildGroupTreeWithTypeFallback(withDimension, 'dimension', fallback)
    expect(tree.map((n) => n.id)).toEqual(['spacing', 'colors'])
    expect(filterRowsByTokenType(withDimension, 'dimension').length).toBeGreaterThan(0)
  })

  it('includes empty groups from source documents', () => {
    const docs = { 'draft.json': { global: {} } }
    const paths = collectGroupPathsFromSourceRoot(docs['draft.json'])
    expect(paths).toEqual([['global']])

    const tree = buildFullGroupTree([], docs)
    expect(tree.map((n) => n.id)).toEqual(['global'])
  })

  it('does not mutate source when building fallback trees', () => {
    const sourceDoc = { global: {}, colors: { primary: { $type: 'color', $value: '#000' } } }
    const snapshot = structuredClone(sourceDoc)
    buildFullGroupTree(mixedWorkspace, { 'a.json': sourceDoc })
    expect(sourceDoc).toEqual(snapshot)
  })
})
