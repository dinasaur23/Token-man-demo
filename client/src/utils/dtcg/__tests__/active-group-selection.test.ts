/**
 * Active group selection after CRUD / tree rebuild.
 *
 * Guards the regression where NEW TOKEN inserted into the correct group but the
 * type-filtered selection watcher snapped back to the first root group because
 * persist briefly emptied `rows` and dropped token-backed groups from the tree.
 */
import { describe, expect, it } from 'vitest'
import {
  buildGroupTreeWithTypeFallback,
  reconcileActiveGroupSelection,
} from '../grouping'
import type { TableRow } from '../token-table-types'
import type { JsonValue } from '../resolver'

type PipelineRow = Pick<TableRow, 'path' | 'type' | 'groupPath'>

function row(
  path: string,
  type: TableRow['type'],
  groupPath: string[],
): PipelineRow {
  return { path, type, groupPath }
}

/** Rows belonging to the active group (mirrors useTokenWorkspaceTable filteredRows). */
function rowsInSelectedGroup(rows: PipelineRow[], activeGroupId: string | null): PipelineRow[] {
  if (!activeGroupId) return []
  return rows.filter((r) => {
    const id = r.groupPath.join('.')
    return id === activeGroupId || id.startsWith(activeGroupId + '.')
  })
}

function colorValue(hex: string) {
  return {
    colorSpace: 'srgb',
    components: [0, 0, 0],
    hex,
  }
}

describe('reconcileActiveGroupSelection', () => {
  it('preserves background after NEW TOKEN rebuild (sibling groups)', () => {
    const docs = { 'tokens.json': { primary: {}, background: {} } as JsonValue }
    let rows: PipelineRow[] = [
      row('primary.ink', 'color', ['primary']),
      row('background.surface', 'color', ['background']),
    ]

    let active = reconcileActiveGroupSelection(
      buildGroupTreeWithTypeFallback(rows, 'color', docs),
      'background',
    )
    expect(active).toEqual(['background'])

    // Simulate NEW TOKEN landing in background, then tree rebuild.
    rows = [
      ...rows,
      row('background.new-token', 'color', ['background']),
    ]
    active = reconcileActiveGroupSelection(
      buildGroupTreeWithTypeFallback(rows, 'color', docs),
      active[0] ?? null,
    )

    expect(active).toEqual(['background'])
    expect(rowsInSelectedGroup(rows, active[0]!).map((r) => r.path)).toEqual([
      'background.surface',
      'background.new-token',
    ])
  })

  it('keeps background selected across repeated NEW TOKEN insertions', () => {
    const docs = { 'tokens.json': {} as JsonValue }
    let rows: PipelineRow[] = [
      row('primary.ink', 'color', ['primary']),
      row('background.surface', 'color', ['background']),
    ]
    let activeId: string | null = 'background'

    for (let i = 1; i <= 5; i++) {
      rows = [...rows, row(`background.token-${i}`, 'color', ['background'])]
      const next = reconcileActiveGroupSelection(
        buildGroupTreeWithTypeFallback(rows, 'color', docs),
        activeId,
      )
      expect(next).toEqual(['background'])
      activeId = next[0] ?? null
    }

    expect(rowsInSelectedGroup(rows, 'background').length).toBe(6)
    expect(rowsInSelectedGroup(rows, 'primary').map((r) => r.path)).toEqual(['primary.ink'])
  })

  it('preserves nested primary.background after NEW TOKEN', () => {
    const docs = { 'tokens.json': {} as JsonValue }
    let rows: PipelineRow[] = [
      row('primary.brand.ink', 'color', ['primary', 'brand']),
      row('primary.background.surface', 'color', ['primary', 'background']),
    ]

    let active = reconcileActiveGroupSelection(
      buildGroupTreeWithTypeFallback(rows, 'color', docs),
      'primary.background',
    )
    expect(active).toEqual(['primary.background'])

    rows = [
      ...rows,
      row('primary.background.new-token', 'color', ['primary', 'background']),
    ]
    active = reconcileActiveGroupSelection(
      buildGroupTreeWithTypeFallback(rows, 'color', docs),
      active[0] ?? null,
    )

    expect(active).toEqual(['primary.background'])
    expect(rowsInSelectedGroup(rows, 'primary.background').map((r) => r.path)).toEqual([
      'primary.background.surface',
      'primary.background.new-token',
    ])
  })

  it.each([
    {
      type: 'color' as const,
      primaryPath: 'primary.ink',
      backgroundPath: 'background.surface',
      newPath: 'background.added',
      valueNote: 'color',
    },
    {
      type: 'dimension' as const,
      primaryPath: 'primary.md',
      backgroundPath: 'background.md',
      newPath: 'background.added',
      valueNote: 'dimension',
    },
    {
      type: 'cubicBezier' as const,
      primaryPath: 'primary.ease',
      backgroundPath: 'background.ease',
      newPath: 'background.added',
      valueNote: 'cubicBezier',
    },
  ])('preserves background for $valueNote token type', ({ type, primaryPath, backgroundPath, newPath }) => {
    const docs = { 'tokens.json': {} as JsonValue }
    let rows: PipelineRow[] = [
      row(primaryPath, type, ['primary']),
      row(backgroundPath, type, ['background']),
    ]

    let active = reconcileActiveGroupSelection(
      buildGroupTreeWithTypeFallback(rows, type, docs),
      'background',
    )
    expect(active).toEqual(['background'])

    rows = [...rows, row(newPath, type, ['background'])]
    active = reconcileActiveGroupSelection(
      buildGroupTreeWithTypeFallback(rows, type, docs),
      active[0] ?? null,
    )
    expect(active).toEqual(['background'])
  })

  it('auto-selects the first valid group when there is no prior selection', () => {
    const docs = { 'tokens.json': {} as JsonValue }
    const rows = [
      row('primary.ink', 'color', ['primary']),
      row('background.surface', 'color', ['background']),
    ]
    const tree = buildGroupTreeWithTypeFallback(rows, 'color', docs)
    expect(reconcileActiveGroupSelection(tree, null)).toEqual([tree[0]!.id])
    expect(reconcileActiveGroupSelection(tree, undefined)).toEqual([tree[0]!.id])
    expect(reconcileActiveGroupSelection(tree, '')).toEqual([tree[0]!.id])
  })

  it('falls back when the previously selected group was deleted', () => {
    const docs = { 'tokens.json': {} as JsonValue }
    const before = [
      row('primary.ink', 'color', ['primary']),
      row('background.surface', 'color', ['background']),
    ]
    expect(
      reconcileActiveGroupSelection(
        buildGroupTreeWithTypeFallback(before, 'color', docs),
        'background',
      ),
    ).toEqual(['background'])

    const afterDelete = [row('primary.ink', 'color', ['primary'])]
    const tree = buildGroupTreeWithTypeFallback(afterDelete, 'color', docs)
    expect(reconcileActiveGroupSelection(tree, 'background')).toEqual(['primary'])
  })

  it('clears selection when the rebuilt tree is empty', () => {
    expect(reconcileActiveGroupSelection([], 'background')).toEqual([])
  })

  it('does not restore a group id from a previous token set after selection clear', () => {
    const setARows = [
      row('primary.ink', 'color', ['primary']),
      row('background.surface', 'color', ['background']),
    ]
    const setBRows = [
      row('accent.core', 'color', ['accent']),
      row('neutral.base', 'color', ['neutral']),
    ]
    const docsA = { 'BrandA.json': {} as JsonValue }
    const docsB = { 'BrandB.json': {} as JsonValue }

    // Active on BrandA / background, then token-set switch clears selection
    // (setActiveSourceFileName sets activeNodeIds = []).
    expect(
      reconcileActiveGroupSelection(
        buildGroupTreeWithTypeFallback(setARows, 'color', docsA),
        'background',
      ),
    ).toEqual(['background'])

    const setBTree = buildGroupTreeWithTypeFallback(setBRows, 'color', docsB)
    const afterSwitch = reconcileActiveGroupSelection(setBTree, null)
    expect(afterSwitch).toEqual([setBTree[0]!.id])
    expect(afterSwitch[0]).not.toBe('background')
    expect(afterSwitch[0]).not.toBe('primary')
  })

  it('characterizes why persist must not empty rows: token-backed groups drop out', () => {
    const docs = {
      'tokens.json': {
        primary: {
          ink: {
            $type: 'color',
            $value: colorValue('#000000'),
          },
        },
        background: {
          surface: {
            $type: 'color',
            $value: colorValue('#ffffff'),
          },
        },
      } as JsonValue,
    }

    const populated = [
      row('primary.ink', 'color', ['primary']),
      row('background.surface', 'color', ['background']),
    ]
    const fullTree = buildGroupTreeWithTypeFallback(populated, 'color', docs)
    expect(reconcileActiveGroupSelection(fullTree, 'background')).toEqual(['background'])

    // Empty rows + no typed-empty $type on groups → tree loses token-backed groups.
    const emptyTree = buildGroupTreeWithTypeFallback([], 'color', docs)
    expect(emptyTree.map((n) => n.id)).toEqual([])
    // Watcher seeing this transient tree would clear/snap selection incorrectly.
    expect(reconcileActiveGroupSelection(emptyTree, 'background')).toEqual([])
  })
})
