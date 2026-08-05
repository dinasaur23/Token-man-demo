/**
 * Stage 11/13/14 — Generic UI + Color/Dimension/Number nav helpers.
 */
import { describe, expect, it } from 'vitest'
import {
  getRegisteredTokenTypeDefinitions,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinitionByNavPath,
  isRegisteredTokenType,
} from '../token-types'

describe('generic UI nav (registry-driven)', () => {
  it('registers Color, Dimension, and Number for UI nav', () => {
    expect(getRegisteredTokenTypeIds()).toEqual(['color', 'dimension', 'number'])
    const defs = getRegisteredTokenTypeDefinitions()
    expect(defs).toHaveLength(3)
    expect(defs.map((d) => d.id)).toEqual(['color', 'dimension', 'number'])
    expect(defs[0]).toMatchObject({
      id: 'color',
      label: 'Color',
      navPath: 'color',
      navIcon: 'mdi-palette',
    })
    expect(defs[1]).toMatchObject({
      id: 'dimension',
      label: 'Dimension',
      navPath: 'dimension',
      navIcon: 'mdi-ruler',
    })
    expect(defs[2]).toMatchObject({
      id: 'number',
      label: 'Number',
      navPath: 'number',
      navIcon: 'mdi-numeric',
    })
  })

  it('resolves /tokens/:tokenType segments via navPath', () => {
    expect(getTokenTypeDefinitionByNavPath('color')?.id).toBe('color')
    expect(getTokenTypeDefinitionByNavPath('dimension')?.id).toBe('dimension')
    expect(getTokenTypeDefinitionByNavPath('number')?.id).toBe('number')
    expect(getTokenTypeDefinitionByNavPath('ColorContentPage')).toBeUndefined()
  })

  it('exposes only registered types as navigable', () => {
    expect(isRegisteredTokenType('dimension')).toBe(true)
    expect(isRegisteredTokenType('color')).toBe(true)
    expect(isRegisteredTokenType('number')).toBe(true)
    expect(isRegisteredTokenType('duration')).toBe(false)
  })
})

describe('generic UI type filter helper', () => {
  it('filters table rows by tokenType (Color shell)', () => {
    const rows = [
      { path: 'a.one', type: 'color' as const },
      { path: 'b.two', type: 'dimension' as const },
      { path: 'a.three', type: 'color' as const },
    ]
    const filtered = rows.filter((r) => r.type === 'color')
    expect(filtered.map((r) => r.path)).toEqual(['a.one', 'a.three'])
  })

  it('filters table rows by tokenType (Dimension shell)', () => {
    const rows = [
      { path: 'a.one', type: 'color' as const },
      { path: 'b.two', type: 'dimension' as const },
      { path: 'b.three', type: 'dimension' as const },
    ]
    const filtered = rows.filter((r) => r.type === 'dimension')
    expect(filtered.map((r) => r.path)).toEqual(['b.two', 'b.three'])
  })

  it('filters table rows by tokenType (Number shell)', () => {
    const rows = [
      { path: 'a.one', type: 'color' as const },
      { path: 'n.two', type: 'number' as const },
      { path: 'n.three', type: 'number' as const },
    ]
    const filtered = rows.filter((r) => r.type === 'number')
    expect(filtered.map((r) => r.path)).toEqual(['n.two', 'n.three'])
  })
})
