/**
 * Group-tree type fallback — typed empty groups only (no cross-type row paths).
 */
import { describe, expect, it } from 'vitest'
import {
  buildGroupTreeWithTypeFallback,
  collectGroupTreeIds,
} from '../grouping'
import { collectGroupPathsFromSourceRoot } from '../source-group-tree'
import { validateDocumentStructure } from '../structural-validation'
import type { TableRow } from '../token-table-types'

function row(
  path: string,
  type: TableRow['type'],
  groupPath: string[],
): Pick<TableRow, 'path' | 'type' | 'groupPath'> {
  return { path, type, groupPath }
}

const colorOnlyWorkspace = [
  row('colors.brand.primary', 'color', ['colors', 'brand']),
]

const mixedWorkspace = [
  row('colors.brand.primary', 'color', ['colors', 'brand']),
  row('spacing.scale.md', 'dimension', ['spacing', 'scale']),
]

describe('group tree type fallback', () => {
  it('shows typed-empty color groups beside existing color token groups', () => {
    const docs = {
      'draft.json': {
        primary: {
          ink: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' },
          },
        },
        'new-group': { $type: 'color' },
      },
    }
    const rows = [row('primary.ink', 'color', ['primary'])]
    const colorTree = buildGroupTreeWithTypeFallback(rows, 'color', docs)
    const ids = collectGroupTreeIds(colorTree)

    expect(ids.has('primary')).toBe(true)
    expect(ids.has('new-group')).toBe(true)

    const dimensionTree = buildGroupTreeWithTypeFallback(rows, 'dimension', docs)
    expect(collectGroupTreeIds(dimensionTree).has('new-group')).toBe(false)
  })

  it('shows typed-empty dimension groups beside existing dimension token groups', () => {
    const docs = {
      'draft.json': {
        spacing: {
          md: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
        },
        'new-space': { $type: 'dimension' },
      },
    }
    const rows = [row('spacing.md', 'dimension', ['spacing'])]
    const tree = buildGroupTreeWithTypeFallback(rows, 'dimension', docs)
    expect(collectGroupTreeIds(tree).has('spacing')).toBe(true)
    expect(collectGroupTreeIds(tree).has('new-space')).toBe(true)
    expect(
      collectGroupTreeIds(buildGroupTreeWithTypeFallback(rows, 'color', docs)).has('new-space'),
    ).toBe(false)
  })

  it('shows nested typed-empty child groups under an existing parent', () => {
    const docs = {
      'draft.json': {
        primary: {
          ink: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' },
          },
          nested: { $type: 'color' },
        },
      },
    }
    const rows = [row('primary.ink', 'color', ['primary'])]
    const tree = buildGroupTreeWithTypeFallback(rows, 'color', docs)
    expect(collectGroupTreeIds(tree).has('primary')).toBe(true)
    expect(collectGroupTreeIds(tree).has('primary.nested')).toBe(true)
  })

  it('hides color-only groups with color tokens on dimension pages', () => {
    const tree = buildGroupTreeWithTypeFallback(colorOnlyWorkspace, 'dimension', {})
    expect(tree).toEqual([])
  })

  it('shows empty color-typed source groups on color only', () => {
    const docs = { 'draft.json': { primary: { $type: 'color' } } }
    const colorTree = buildGroupTreeWithTypeFallback([], 'color', docs)
    const dimensionTree = buildGroupTreeWithTypeFallback([], 'dimension', docs)

    expect(colorTree.map((n) => n.id)).toEqual(['primary'])
    expect(dimensionTree).toEqual([])
  })

  it('shows empty dimension-typed source groups on dimension only', () => {
    const docs = { 'draft.json': { spacing: { $type: 'dimension' } } }
    const dimensionTree = buildGroupTreeWithTypeFallback([], 'dimension', docs)

    expect(dimensionTree.map((n) => n.id)).toEqual(['spacing'])
    expect(buildGroupTreeWithTypeFallback([], 'color', docs)).toEqual([])
  })

  it('keeps independent typed empty groups per token type', () => {
    const docs = {
      'draft.json': {
        primary: { $type: 'color' },
        spacing: { $type: 'dimension' },
      },
    }

    const colorTree = buildGroupTreeWithTypeFallback([], 'color', docs)
    const dimensionTree = buildGroupTreeWithTypeFallback([], 'dimension', docs)

    expect(colorTree.map((n) => n.id)).toEqual(['primary'])
    expect(dimensionTree.map((n) => n.id)).toEqual(['spacing'])
  })

  it('shows mixed group on both pages when it contains color and dimension tokens', () => {
    const withMixed = [
      ...mixedWorkspace,
      row('colors.brand.gap', 'dimension', ['colors', 'brand']),
    ]

    const colorTree = buildGroupTreeWithTypeFallback(withMixed, 'color', {})
    const dimensionTree = buildGroupTreeWithTypeFallback(withMixed, 'dimension', {})

    expect(collectGroupTreeIds(colorTree).has('colors.brand')).toBe(true)
    expect(collectGroupTreeIds(dimensionTree).has('colors.brand')).toBe(true)
  })

  it('keeps ancestor paths visible for matching descendants', () => {
    const withNested = [
      row('theme.nested.palette.accent', 'color', ['theme', 'nested', 'palette']),
      row('theme.nested.motion.fast', 'duration', ['theme', 'nested', 'motion']),
    ]

    const colorTree = buildGroupTreeWithTypeFallback(withNested, 'color', {})
    const ids = collectGroupTreeIds(colorTree)

    expect(ids.has('theme')).toBe(true)
    expect(ids.has('theme.nested')).toBe(true)
    expect(ids.has('theme.nested.palette')).toBe(true)
    expect(ids.has('theme.nested.motion')).toBe(false)
  })

  it('reveals group on dimension after a dimension token is added to a color-typed empty group', () => {
    const docs = { 'draft.json': { primary: { $type: 'color' } } }
    const before = buildGroupTreeWithTypeFallback([], 'dimension', docs)
    expect(before).toEqual([])

    const withDimensionToken = [
      row('primary.gap', 'dimension', ['primary']),
    ]
    const after = buildGroupTreeWithTypeFallback(withDimensionToken, 'dimension', docs)
    expect(after.map((n) => n.id)).toEqual(['primary'])
  })

  it('returns empty tree on dimension when no dimension groups exist (NEW GROUP remains available)', () => {
    const docs = { 'draft.json': { primary: { $type: 'color' } } }
    const tree = buildGroupTreeWithTypeFallback(colorOnlyWorkspace, 'dimension', docs)
    expect(tree).toEqual([])
  })

  it('does not include untyped empty groups in fallback', () => {
    const docs = { 'draft.json': { global: {} } }
    const paths = collectGroupPathsFromSourceRoot(docs['draft.json'])
    expect(paths).toEqual([['global']])

    expect(buildGroupTreeWithTypeFallback([], 'color', docs)).toEqual([])
    expect(buildGroupTreeWithTypeFallback([], 'dimension', docs)).toEqual([])
  })

  it('typed empty group source remains valid DTCG draft', () => {
    const doc = { primary: { $type: 'color' } }
    expect(validateDocumentStructure(doc, { allowEmptyDraft: true })).toEqual({
      ok: true,
      errors: [],
    })
  })

  it('does not mutate source when building fallback trees', () => {
    const sourceDoc = { global: { $type: 'color' }, colors: { primary: { $type: 'color', $value: '#000' } } }
    const snapshot = structuredClone(sourceDoc)
    buildGroupTreeWithTypeFallback(mixedWorkspace, 'color', { 'a.json': sourceDoc })
    expect(sourceDoc).toEqual(snapshot)
  })
})
