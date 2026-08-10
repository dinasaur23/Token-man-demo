/**
 * Token insertion helpers — registry defaults and source sibling order.
 */
import { describe, expect, it } from 'vitest'
import { collectTokensWithPath } from '../dtcg-parser'
import { getRegisteredTokenTypeDefinitions } from '../token-types/registry'
import {
  collectSourceTokenPaths,
  insertPathAfterInRowOrder,
  insertSiblingKeyAfter,
} from '../row-ordering'
import type { JsonRecord } from '../json-path-helpers'

function appendTokenToGroup(
  doc: JsonRecord,
  groupPath: string[],
  tokenType: string,
  tokenName: string,
): string {
  let container: JsonRecord = doc
  for (const seg of groupPath) {
    if (!container[seg] || typeof container[seg] !== 'object') {
      container[seg] = {}
    }
    container = container[seg] as JsonRecord
  }

  const def = getRegisteredTokenTypeDefinitions().find((d) => d.id === tokenType)
  if (!def) throw new Error(`missing type ${tokenType}`)

  container[tokenName] = {
    $type: tokenType,
    $value: def.createDefaultValue() as JsonRecord[string],
  }

  return [...groupPath, tokenName].join('.')
}

describe('insert token in group (source semantics)', () => {
  it('uses registry defaults for all seven basic types', () => {
    for (const def of getRegisteredTokenTypeDefinitions()) {
      const doc: JsonRecord = { grp: {} }
      appendTokenToGroup(doc, ['grp'], def.id, 't')
      const tokens = collectTokensWithPath(doc.grp as JsonRecord)
      expect(tokens[0]?.type).toBe(def.id)
      expect(tokens[0]?.value).toEqual(def.createDefaultValue())
    }
  })

  it('insert below selected row preserves sibling key order', () => {
    const parent: JsonRecord = {
      a: { $type: 'number', $value: 1 },
      b: { $type: 'number', $value: 2 },
      c: { $type: 'number', $value: 3 },
    }
    insertSiblingKeyAfter(parent, 'b', 'b-new', { $type: 'number', $value: 0 })
    expect(Object.keys(parent)).toEqual(['a', 'b', 'b-new', 'c'])
  })

  it('append without selection adds at end of group', () => {
    const doc: JsonRecord = {
      global: {
        first: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' } },
      },
    }
    appendTokenToGroup(doc, ['global'], 'dimension', 'second')
    expect(Object.keys(doc.global as JsonRecord)).toEqual(['first', 'second'])
  })

  it('row order append matches source path append fallback', () => {
    const docs = {
      'a.json': {
        g: {
          x: { $type: 'number', $value: 1 },
        },
      },
    }
    const pathsBefore = collectSourceTokenPaths(docs)
    const newPath = 'g.y'
    const order = insertPathAfterInRowOrder([], null, newPath, [...pathsBefore, newPath])
    expect(order[order.length - 1]).toBe(newPath)
  })
})

describe('empty group workflow', () => {
  it('empty group container has zero token leaves', () => {
    const doc: JsonRecord = { global: {} }
    expect(collectTokensWithPath(doc)).toEqual([])
    expect(collectSourceTokenPaths({ 'draft.json': doc })).toEqual([])
  })
})
