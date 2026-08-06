/**
 * Regression tests for intermittent token row-ordering bugs.
 *
 * Root cause fixed: inserting into an empty/stale `rowOrder` used
 * `insertIndex = order.length` (0 when empty), so the new path sorted to the
 * top while every other token fell back to MAX_SAFE_INTEGER.
 *
 * Source-document sibling key order is authoritative.
 */
import { describe, expect, it } from 'vitest'
import { collectTokensWithPath } from '../dtcg-parser'
import type { JsonRecord } from '../json-path-helpers'
import {
  buildPathToSourceFileMap,
  buildStableTokenRowId,
  collectSourceTokenPaths,
  insertPathAfterInRowOrder,
  insertSiblingKeyAfter,
  modeAddedSourceFile,
  reconcileRowOrderWithSource,
  WORKSPACE_FILE_FALLBACK,
} from '../row-ordering'

function sortByRowOrder(paths: string[], rowOrder: string[]): string[] {
  const indexMap = new Map(rowOrder.map((p, i) => [p, i]))
  return [...paths].sort((a, b) => {
    const ai = indexMap.get(a) ?? Number.MAX_SAFE_INTEGER
    const bi = indexMap.get(b) ?? Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    return paths.indexOf(a) - paths.indexOf(b)
  })
}

function filterByGroup(paths: string[], groupPrefix: string): string[] {
  const dot = groupPrefix + '.'
  return paths.filter((p) => p === groupPrefix || p.startsWith(dot))
}

function filterByType(
  entries: { path: string; type: string }[],
  type: string,
): string[] {
  return entries.filter((e) => e.type === type).map((e) => e.path)
}

const baseDoc: JsonRecord = {
  colors: {
    $type: 'color',
    a: {
      $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' },
    },
    b: {
      $value: { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' },
    },
    c: {
      $value: { colorSpace: 'srgb', components: [0, 1, 0], hex: '#00ff00' },
    },
  },
  spacing: {
    $type: 'dimension',
    sm: { $value: { value: 8, unit: 'px' } },
    md: { $value: { value: 16, unit: 'px' } },
  },
}

describe('token row ordering', () => {
  it('1. add inserts directly below the selected row (source + rowOrder)', () => {
    const parent = structuredClone(baseDoc.colors) as JsonRecord
    insertSiblingKeyAfter(parent, 'b', 'b-new', {
      $value: { colorSpace: 'srgb', components: [0, 0, 1], hex: '#0000ff' },
    })
    expect(Object.keys(parent).filter((k) => !k.startsWith('$'))).toEqual([
      'a',
      'b',
      'b-new',
      'c',
    ])

    const sourcePaths = ['colors.a', 'colors.b', 'colors.c']
    // Reproduce the intermittent failure mode: empty rowOrder
    const next = insertPathAfterInRowOrder([], 'colors.b', 'colors.b-new', sourcePaths)
    expect(next).toEqual(['colors.a', 'colors.b', 'colors.b-new', 'colors.c'])
    expect(sortByRowOrder([...sourcePaths, 'colors.b-new'], next)[2]).toBe('colors.b-new')
  })

  it('2. duplicate inserts directly below the source row', () => {
    const parent = structuredClone(baseDoc.colors) as JsonRecord
    insertSiblingKeyAfter(parent, 'a', 'a-copy', parent.a as JsonRecord)
    expect(Object.keys(parent).filter((k) => !k.startsWith('$'))).toEqual([
      'a',
      'a-copy',
      'b',
      'c',
    ])

    const sourcePaths = ['colors.a', 'colors.b', 'colors.c']
    const next = insertPathAfterInRowOrder(
      [...sourcePaths],
      'colors.a',
      'colors.a-copy',
      sourcePaths,
    )
    expect(next).toEqual(['colors.a', 'colors.a-copy', 'colors.b', 'colors.c'])
  })

  it('3. repeated add operations keep inserting below the chosen reference', () => {
    let sourcePaths = ['colors.a', 'colors.b', 'colors.c']
    let order = [...sourcePaths]
    const parent = structuredClone(baseDoc.colors) as JsonRecord

    for (let i = 1; i <= 5; i++) {
      const key = `b-new-${i}`
      const path = `colors.${key}`
      insertSiblingKeyAfter(parent, i === 1 ? 'b' : `b-new-${i - 1}`, key, {
        $value: { colorSpace: 'srgb', components: [0, 0, 1], hex: '#0000ff' },
      })
      // Simulate rebuild that wiped rowOrder (intermittent stale state)
      const stale = i % 2 === 0 ? [] : order
      order = insertPathAfterInRowOrder(
        stale,
        i === 1 ? 'colors.b' : `colors.b-new-${i - 1}`,
        path,
        sourcePaths,
      )
      sourcePaths = [...sourcePaths]
      // After source insert, authoritative paths include the new key in place
      sourcePaths = collectTokensWithPath({ colors: parent }).map((t) => t.path)
    }

    const leafKeys = Object.keys(parent).filter((k) => !k.startsWith('$'))
    expect(leafKeys).toEqual(['a', 'b', 'b-new-1', 'b-new-2', 'b-new-3', 'b-new-4', 'b-new-5', 'c'])
    expect(order.slice(order.indexOf('colors.b'), order.indexOf('colors.c'))).toEqual([
      'colors.b',
      'colors.b-new-1',
      'colors.b-new-2',
      'colors.b-new-3',
      'colors.b-new-4',
      'colors.b-new-5',
    ])
  })

  it('4. repeated duplicate operations keep inserting below each source', () => {
    const parent = structuredClone(baseDoc.colors) as JsonRecord
    let sourcePaths = ['colors.a', 'colors.b', 'colors.c']
    let order = [...sourcePaths]

    insertSiblingKeyAfter(parent, 'b', 'b-copy', parent.b as JsonRecord)
    order = insertPathAfterInRowOrder(order, 'colors.b', 'colors.b-copy', sourcePaths)
    sourcePaths = collectTokensWithPath({ colors: parent }).map((t) => t.path)

    insertSiblingKeyAfter(parent, 'b-copy', 'b-copy-copy', parent['b-copy'] as JsonRecord)
    // Empty rowOrder mid-sequence must not jump to top
    order = insertPathAfterInRowOrder([], 'colors.b-copy', 'colors.b-copy-copy', sourcePaths)
    sourcePaths = collectTokensWithPath({ colors: parent }).map((t) => t.path)

    expect(Object.keys(parent).filter((k) => !k.startsWith('$'))).toEqual([
      'a',
      'b',
      'b-copy',
      'b-copy-copy',
      'c',
    ])
    expect(order).toEqual([
      'colors.a',
      'colors.b',
      'colors.b-copy',
      'colors.b-copy-copy',
      'colors.c',
    ])
  })

  it('5. operations after route switching (rowOrder wiped) still insert below', () => {
    const sourcePaths = ['colors.a', 'colors.b', 'colors.c', 'spacing.sm', 'spacing.md']
    // Route switch / workspace remount often yields empty rowOrder until populate
    const next = insertPathAfterInRowOrder([], 'spacing.sm', 'spacing.sm-copy', sourcePaths)
    expect(next.indexOf('spacing.sm-copy')).toBe(next.indexOf('spacing.sm') + 1)
    expect(next[0]).not.toBe('spacing.sm-copy')
  })

  it('6. operations after group switching preserve insert-below within the group', () => {
    const sourcePaths = ['colors.a', 'colors.b', 'colors.c', 'spacing.sm', 'spacing.md']
    let order = [...sourcePaths]
    order = insertPathAfterInRowOrder(order, 'colors.b', 'colors.b-copy', sourcePaths)

    // Group switch filters display but authoritative order is unchanged
    const colorsOnly = filterByGroup(order, 'colors')
    expect(colorsOnly).toEqual(['colors.a', 'colors.b', 'colors.b-copy', 'colors.c'])

    const next = insertPathAfterInRowOrder(order, 'colors.a', 'colors.a-new', sourcePaths)
    expect(filterByGroup(next, 'colors')).toEqual([
      'colors.a',
      'colors.a-new',
      'colors.b',
      'colors.b-copy',
      'colors.c',
    ])
  })

  it('7. resolved-view rebuild preserves source order via reconcile', () => {
    const parent = structuredClone(baseDoc.colors) as JsonRecord
    insertSiblingKeyAfter(parent, 'b', 'b-copy', parent.b as JsonRecord)
    const sourcePaths = collectTokensWithPath({ colors: parent }).map((t) => t.path)

    // Stale rowOrder from before the insert + unrelated extras
    const stale = ['colors.a', 'colors.b', 'colors.c', 'mode::ghost']
    const reconciled = reconcileRowOrderWithSource(stale, sourcePaths)

    expect(reconciled.filter((p) => p.startsWith('colors.'))).toEqual([
      'colors.a',
      'colors.b',
      'colors.b-copy',
      'colors.c',
    ])
    expect(sourcePaths).toEqual(['colors.a', 'colors.b', 'colors.b-copy', 'colors.c'])
  })

  it('8. type filtering preserves relative order', () => {
    const entries = [
      { path: 'colors.a', type: 'color' },
      { path: 'spacing.sm', type: 'dimension' },
      { path: 'colors.b', type: 'color' },
      { path: 'spacing.md', type: 'dimension' },
      { path: 'colors.c', type: 'color' },
    ]
    const order = entries.map((e) => e.path)
    const next = insertPathAfterInRowOrder(order, 'colors.b', 'colors.b-copy', order)
    const colorOrder = filterByType(
      [
        ...entries,
        { path: 'colors.b-copy', type: 'color' },
      ].sort((a, b) => next.indexOf(a.path) - next.indexOf(b.path)),
      'color',
    )
    expect(colorOrder).toEqual(['colors.a', 'colors.b', 'colors.b-copy', 'colors.c'])
  })

  it('9. duplicate names in different groups do not collide (stable row ids)', () => {
    const docs = {
      'a.json': {
        brand: {
          $type: 'color',
          primary: {
            $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' },
          },
        },
      },
      'b.json': {
        system: {
          $type: 'color',
          primary: {
            $value: { colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' },
          },
        },
      },
    }

    const map = buildPathToSourceFileMap(docs)
    expect(map.get('brand.primary')).toBe('a.json')
    expect(map.get('system.primary')).toBe('b.json')

    const idA = buildStableTokenRowId(map.get('brand.primary'), 'brand.primary')
    const idB = buildStableTokenRowId(map.get('system.primary'), 'system.primary')
    expect(idA).not.toBe(idB)
    expect(idA).toBe('a.json::brand.primary')
    expect(idB).toBe('b.json::system.primary')

    // Same leaf name must not produce a name-only id
    expect(idA.endsWith('::brand.primary')).toBe(true)
    expect(buildStableTokenRowId(null, 'brand.primary')).toBe(
      `${WORKSPACE_FILE_FALLBACK}::brand.primary`,
    )
    expect(modeAddedSourceFile('light')).toBe('__modeAdded__:light')
  })

  it('10. save/reload preserves order (reconcile + source keys)', () => {
    const parent = structuredClone(baseDoc.colors) as JsonRecord
    insertSiblingKeyAfter(parent, 'b', 'b-copy', parent.b as JsonRecord)

    // Persist simulation: only the source document survives; rowOrder may be empty on reload
    const savedDoc = { colors: parent }
    const reloadedPaths = collectSourceTokenPaths({ 'tokens.json': savedDoc })
    const reloadedOrder = reconcileRowOrderWithSource([], reloadedPaths)

    expect(reloadedOrder).toEqual([
      'colors.a',
      'colors.b',
      'colors.b-copy',
      'colors.c',
    ])
    expect(Object.keys(parent).filter((k) => !k.startsWith('$'))).toEqual([
      'a',
      'b',
      'b-copy',
      'c',
    ])
  })

  it('11. source order matches displayed order', () => {
    const parent = structuredClone(baseDoc.colors) as JsonRecord
    insertSiblingKeyAfter(parent, 'a', 'a-copy', parent.a as JsonRecord)
    insertSiblingKeyAfter(parent, 'c', 'c-new', {
      $value: { colorSpace: 'srgb', components: [0, 0, 1], hex: '#0000ff' },
    })

    const sourceKeys = Object.keys(parent).filter((k) => !k.startsWith('$'))
    const sourcePaths = sourceKeys.map((k) => `colors.${k}`)
    const display = sortByRowOrder(sourcePaths, reconcileRowOrderWithSource([], sourcePaths))

    expect(display).toEqual(sourcePaths)
    expect(display).toEqual([
      'colors.a',
      'colors.a-copy',
      'colors.b',
      'colors.c',
      'colors.c-new',
    ])
  })

  it('documents fallback: no selected row appends', () => {
    const sourcePaths = ['colors.a', 'colors.b', 'colors.c']
    const next = insertPathAfterInRowOrder(sourcePaths, null, 'colors.z', sourcePaths)
    expect(next[next.length - 1]).toBe('colors.z')

    const parent = structuredClone(baseDoc.colors) as JsonRecord
    insertSiblingKeyAfter(parent, null, 'z', {
      $value: { colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' },
    })
    expect(Object.keys(parent).filter((k) => !k.startsWith('$')).at(-1)).toBe('z')
  })

  it('regression: empty rowOrder must not place the new path at the top', () => {
    const sourcePaths = ['colors.a', 'colors.b', 'colors.c']
    const next = insertPathAfterInRowOrder([], 'colors.b', 'colors.b-copy', sourcePaths)
    expect(next[0]).toBe('colors.a')
    expect(next.indexOf('colors.b-copy')).toBe(2)
  })
})
