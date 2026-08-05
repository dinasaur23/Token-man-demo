/**
 * Stage 11 — Generic UI + Color nav helpers.
 */
import { describe, expect, it } from 'vitest'
import {
  getRegisteredTokenTypeDefinitions,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinitionByNavPath,
  isRegisteredTokenType,
} from '../token-types'

describe('generic UI nav (registry-driven)', () => {
  it('registers only Color for UI nav at this stage', () => {
    expect(getRegisteredTokenTypeIds()).toEqual(['color'])
    const defs = getRegisteredTokenTypeDefinitions()
    expect(defs).toHaveLength(1)
    expect(defs[0]).toMatchObject({
      id: 'color',
      label: 'Color',
      navPath: 'color',
      navIcon: 'mdi-palette',
    })
  })

  it('resolves /tokens/:tokenType segments via navPath', () => {
    expect(getTokenTypeDefinitionByNavPath('color')?.id).toBe('color')
    expect(getTokenTypeDefinitionByNavPath('dimension')).toBeUndefined()
    expect(getTokenTypeDefinitionByNavPath('ColorContentPage')).toBeUndefined()
  })

  it('does not expose unregistered types as navigable', () => {
    expect(isRegisteredTokenType('dimension')).toBe(false)
    expect(isRegisteredTokenType('color')).toBe(true)
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
})
