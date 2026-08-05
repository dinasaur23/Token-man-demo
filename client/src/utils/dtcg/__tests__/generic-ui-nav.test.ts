/**
 * Stage 11/13 — Generic UI + Color/Dimension nav helpers.
 */
import { describe, expect, it } from 'vitest'
import {
  getRegisteredTokenTypeDefinitions,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinitionByNavPath,
  isRegisteredTokenType,
} from '../token-types'

describe('generic UI nav (registry-driven)', () => {
  it('registers Color and Dimension for UI nav', () => {
    expect(getRegisteredTokenTypeIds()).toEqual(['color', 'dimension'])
    const defs = getRegisteredTokenTypeDefinitions()
    expect(defs).toHaveLength(2)
    expect(defs.map((d) => d.id)).toEqual(['color', 'dimension'])
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
  })

  it('resolves /tokens/:tokenType segments via navPath', () => {
    expect(getTokenTypeDefinitionByNavPath('color')?.id).toBe('color')
    expect(getTokenTypeDefinitionByNavPath('dimension')?.id).toBe('dimension')
    expect(getTokenTypeDefinitionByNavPath('ColorContentPage')).toBeUndefined()
  })

  it('exposes only registered types as navigable', () => {
    expect(isRegisteredTokenType('dimension')).toBe(true)
    expect(isRegisteredTokenType('color')).toBe(true)
    expect(isRegisteredTokenType('number')).toBe(false)
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
})
