/**
 * Post-Stage-18 — Filter group tree by selected token type.
 */
import { describe, expect, it } from 'vitest'
import {
  applyGroupNameOverrides,
  buildGroupTree,
  buildGroupTreeForTokenType,
  collectGroupTreeIds,
  filterRowsByTokenType,
} from '../grouping'
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
  row('colors.brand.secondary', 'color', ['colors', 'brand']),
  row('spacing.scale.md', 'dimension', ['spacing', 'scale']),
  row('spacing.scale.lg', 'dimension', ['spacing', 'scale']),
  row('theme.nested.motion.fast', 'duration', ['theme', 'nested', 'motion']),
  row('theme.nested.palette.accent', 'color', ['theme', 'nested', 'palette']),
]

describe('filter group tree by token type', () => {
  it('hides groups that contain only another token type', () => {
    const tree = buildGroupTreeForTokenType(mixedWorkspace, 'color')
    const ids = collectGroupTreeIds(tree)

    expect(ids.has('colors')).toBe(true)
    expect(ids.has('colors.brand')).toBe(true)
    expect(ids.has('spacing')).toBe(false)
    expect(ids.has('spacing.scale')).toBe(false)
  })

  it('keeps a parent visible when a nested descendant contains the selected type', () => {
    const tree = buildGroupTreeForTokenType(mixedWorkspace, 'color')
    const ids = collectGroupTreeIds(tree)

    // theme → nested → palette holds a color; motion is duration-only and dropped.
    expect(ids.has('theme')).toBe(true)
    expect(ids.has('theme.nested')).toBe(true)
    expect(ids.has('theme.nested.palette')).toBe(true)
    expect(ids.has('theme.nested.motion')).toBe(false)
  })

  it('shows only relevant branches for mixed-type workspaces', () => {
    const colorTree = buildGroupTreeForTokenType(mixedWorkspace, 'color')
    expect(colorTree.map((n) => n.id).sort()).toEqual(['colors', 'theme'])

    const dimensionTree = buildGroupTreeForTokenType(mixedWorkspace, 'dimension')
    expect(dimensionTree.map((n) => n.id)).toEqual(['spacing'])
    expect(collectGroupTreeIds(dimensionTree).has('spacing.scale')).toBe(true)
  })

  it('produces an empty tree (empty state signal) when no tokens match', () => {
    const tree = buildGroupTreeForTokenType(mixedWorkspace, 'fontFamily')
    expect(tree).toEqual([])
    expect(filterRowsByTokenType(mixedWorkspace, 'fontFamily')).toEqual([])
  })

  it('switching Color → Dimension → Color restores the correct tree', () => {
    const color1 = buildGroupTreeForTokenType(mixedWorkspace, 'color')
    const dimension = buildGroupTreeForTokenType(mixedWorkspace, 'dimension')
    const color2 = buildGroupTreeForTokenType(mixedWorkspace, 'color')

    expect(dimension.map((n) => n.id)).toEqual(['spacing'])
    expect(color2).toEqual(color1)
    expect(collectGroupTreeIds(color2).has('colors.brand')).toBe(true)
    expect(collectGroupTreeIds(color2).has('spacing')).toBe(false)
  })

  it('does not mutate source documents or input row arrays', () => {
    const sourceDoc = {
      colors: {
        $type: 'color',
        brand: { primary: { $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' } } },
      },
      spacing: {
        $type: 'dimension',
        scale: { md: { $value: { value: 16, unit: 'px' } } },
      },
    }
    const sourceSnapshot = structuredClone(sourceDoc)
    const rowsSnapshot = structuredClone(mixedWorkspace)

    const tree = buildGroupTreeForTokenType(mixedWorkspace, 'color')
    expect(tree.length).toBeGreaterThan(0)

    // Mutate the returned tree — must not affect inputs.
    tree[0]!.title = 'MUTATED'
    if (tree[0]!.children?.[0]) tree[0]!.children[0].title = 'MUTATED_CHILD'

    expect(sourceDoc).toEqual(sourceSnapshot)
    expect(mixedWorkspace).toEqual(rowsSnapshot)
  })

  it('applyGroupNameOverrides is non-mutating', () => {
    const base = buildGroupTree([
      { groupPath: ['colors', 'brand'] },
    ])
    const snapshot = structuredClone(base)
    const overridden = applyGroupNameOverrides(base, { colors: 'Brand colors' })
    expect(overridden[0]?.title).toBe('Brand colors')
    expect(base).toEqual(snapshot)
  })
})
