/**
 * Dimension visibility regression — import → parse → groupPath → type filter → rows.
 *
 * Guards the bug where valid Dimension tokens imported successfully but
 * `/tokens/dimension` showed no groups/rows because `extractGroupPath` stripped
 * lone top-level segments named `spacing` (and similar), emptying `groupPath`.
 */
import { describe, expect, it } from 'vitest'
import { collectTokensWithPath } from '../dtcg-parser'
import {
  buildGroupTreeForTokenType,
  collectGroupTreeIds,
  extractGroupPath,
  filterRowsByTokenType,
} from '../grouping'
import type { TableRow } from '../token-table-types'

type PipelineRow = Pick<TableRow, 'path' | 'type' | 'groupPath'>

function rowsFromDocument(doc: unknown): PipelineRow[] {
  return collectTokensWithPath(doc).map((t) => ({
    path: t.path,
    type: t.type,
    groupPath: extractGroupPath(t.path),
  }))
}

/** Rows belonging to the active group (mirrors useTokenWorkspaceTable filteredRows). */
function rowsInSelectedGroup(rows: PipelineRow[], activeGroupId: string | null): PipelineRow[] {
  if (!activeGroupId) return []
  return rows.filter((r) => {
    const id = r.groupPath.join('.')
    return id === activeGroupId || id.startsWith(activeGroupId + '.')
  })
}

const mixedDoc = {
  colors: {
    $type: 'color',
    brand: {
      primary: {
        $value: { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' },
      },
      secondary: {
        $value: { colorSpace: 'srgb', components: [0, 0, 1], hex: '#0000ff' },
      },
    },
  },
  spacing: {
    $type: 'dimension',
    md: { $value: { value: 8, unit: 'px' } },
    lg: { $value: { value: 1, unit: 'rem' } },
    scale: {
      xl: { $value: { value: 24, unit: 'px' } },
    },
  },
}

describe('Dimension display pipeline visibility', () => {
  it('1. direct Dimension tokens with explicit $type appear under /tokens/dimension', () => {
    const doc = {
      size: {
        padding: {
          $type: 'dimension',
          $value: { value: 8, unit: 'px' },
        },
        gap: {
          $type: 'dimension',
          $value: { value: 1, unit: 'rem' },
        },
      },
    }
    const rows = rowsFromDocument(doc)
    const dimensionRows = filterRowsByTokenType(rows, 'dimension')
    expect(dimensionRows.map((r) => r.path).sort()).toEqual(['size.gap', 'size.padding'])
    expect(dimensionRows.every((r) => r.type === 'dimension')).toBe(true)

    const tree = buildGroupTreeForTokenType(rows, 'dimension')
    expect(tree.map((n) => n.id)).toEqual(['size'])
    expect(collectGroupTreeIds(tree).has('size')).toBe(true)
  })

  it('2. Dimension tokens inheriting $type from a group are classified as dimension', () => {
    const doc = {
      spacing: {
        $type: 'dimension',
        md: { $value: { value: 8, unit: 'px' } },
        lg: { $value: { value: 16, unit: 'px' } },
      },
    }
    const rows = rowsFromDocument(doc)
    expect(rows.every((r) => r.type === 'dimension')).toBe(true)
    expect(rows.map((r) => r.path).sort()).toEqual(['spacing.lg', 'spacing.md'])

    // Critical: lone top-level "spacing" must remain in groupPath (not stripped).
    expect(rows.every((r) => r.groupPath[0] === 'spacing')).toBe(true)

    const tree = buildGroupTreeForTokenType(rows, 'dimension')
    expect(tree.map((n) => n.id)).toEqual(['spacing'])
    expect(filterRowsByTokenType(rows, 'dimension').length).toBe(2)
  })

  it('3. Dimension aliases resolve to type dimension and stay visible', () => {
    const doc = {
      spacing: {
        $type: 'dimension',
        md: { $value: { value: 8, unit: 'px' } },
        aliasMd: { $value: '{spacing.md}' },
      },
    }
    const rows = rowsFromDocument(doc)
    const dimensionRows = filterRowsByTokenType(rows, 'dimension')
    expect(dimensionRows.map((r) => r.path).sort()).toEqual(['spacing.aliasMd', 'spacing.md'])
    expect(dimensionRows.every((r) => r.type === 'dimension')).toBe(true)

    const tree = buildGroupTreeForTokenType(rows, 'dimension')
    expect(collectGroupTreeIds(tree).has('spacing')).toBe(true)
  })

  it('4. nested Dimension groups remain visible in the type-filtered tree', () => {
    const rows = rowsFromDocument(mixedDoc)
    const tree = buildGroupTreeForTokenType(rows, 'dimension')
    const ids = collectGroupTreeIds(tree)

    expect(ids.has('spacing')).toBe(true)
    expect(ids.has('spacing.scale')).toBe(true)
    // Color-only branches must not appear on the Dimension page.
    expect(ids.has('colors')).toBe(false)
    expect(ids.has('colors.brand')).toBe(false)
  })

  it('5. selecting a Dimension group displays its rows', () => {
    const rows = rowsFromDocument(mixedDoc)
    const dimensionRows = filterRowsByTokenType(rows, 'dimension')
    const tree = buildGroupTreeForTokenType(rows, 'dimension')
    expect(tree[0]?.id).toBe('spacing')

    const inSpacing = rowsInSelectedGroup(dimensionRows, 'spacing')
    expect(inSpacing.map((r) => r.path).sort()).toEqual([
      'spacing.lg',
      'spacing.md',
      'spacing.scale.xl',
    ])

    const inScale = rowsInSelectedGroup(dimensionRows, 'spacing.scale')
    expect(inScale.map((r) => r.path)).toEqual(['spacing.scale.xl'])
  })

  it('6. switching between Color and Dimension recomputes the correct tree', () => {
    const rows = rowsFromDocument(mixedDoc)

    const colorTree = buildGroupTreeForTokenType(rows, 'color')
    const dimensionTree = buildGroupTreeForTokenType(rows, 'dimension')
    const colorTreeAgain = buildGroupTreeForTokenType(rows, 'color')

    expect(collectGroupTreeIds(colorTree).has('colors')).toBe(true)
    expect(collectGroupTreeIds(colorTree).has('colors.brand')).toBe(true)
    expect(collectGroupTreeIds(colorTree).has('spacing')).toBe(false)

    expect(dimensionTree.map((n) => n.id)).toEqual(['spacing'])
    expect(collectGroupTreeIds(dimensionTree).has('spacing.scale')).toBe(true)
    expect(collectGroupTreeIds(dimensionTree).has('colors')).toBe(false)

    expect(colorTreeAgain).toEqual(colorTree)

    // Registry / route id is lowercase "dimension", not the label "Dimension".
    expect(filterRowsByTokenType(rows, 'Dimension')).toEqual([])
    expect(filterRowsByTokenType(rows, 'dimension').length).toBe(3)
  })

  it('7. source documents remain unchanged by the display pipeline', () => {
    const sourceDoc = structuredClone(mixedDoc)
    const snapshot = structuredClone(sourceDoc)

    const rows = rowsFromDocument(sourceDoc)
    const tree = buildGroupTreeForTokenType(rows, 'dimension')
    expect(tree.length).toBeGreaterThan(0)

    // Mutate derived view artifacts — must not touch the source document.
    rows[0]!.groupPath.push('MUTATED')
    tree[0]!.title = 'MUTATED'
    if (tree[0]!.children?.[0]) tree[0]!.children[0].title = 'MUTATED_CHILD'

    expect(sourceDoc).toEqual(snapshot)
    expect(sourceDoc.spacing.$type).toBe('dimension')
    expect(sourceDoc.spacing.md.$value).toEqual({ value: 8, unit: 'px' })
  })

  it('preserves Tokens Studio collection/type-suffix stripping for slash paths', () => {
    // Multi-segment collection path: strip trailing type suffix after `/`.
    expect(extractGroupPath('MyCollection/spacing.md')).toEqual(['MyCollection'])
    expect(extractGroupPath('Brand/colors.brand.primary')).toEqual(['Brand', 'brand'])
  })

  it('does not empty groupPath for DTCG-native spacing.* / colors.* roots', () => {
    expect(extractGroupPath('spacing.md')).toEqual(['spacing'])
    expect(extractGroupPath('spacing.scale.md')).toEqual(['spacing', 'scale'])
    expect(extractGroupPath('colors.brand.primary')).toEqual(['colors', 'brand'])
    expect(extractGroupPath('colors.primary')).toEqual(['colors'])
  })
})
