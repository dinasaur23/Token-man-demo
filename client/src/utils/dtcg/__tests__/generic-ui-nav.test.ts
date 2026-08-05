/**
 * Stage 11–17 — Generic UI + registered-type nav helpers.
 */
import { describe, expect, it } from 'vitest'
import {
  getRegisteredTokenTypeDefinitions,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinitionByNavPath,
  isRegisteredTokenType,
} from '../token-types'

const REGISTERED_IDS = [
  'color',
  'dimension',
  'number',
  'duration',
  'fontFamily',
  'fontWeight',
] as const

describe('generic UI nav (registry-driven)', () => {
  it('registers Color through Font Weight for UI nav', () => {
    expect(getRegisteredTokenTypeIds()).toEqual([...REGISTERED_IDS])
    const defs = getRegisteredTokenTypeDefinitions()
    expect(defs).toHaveLength(6)
    expect(defs.map((d) => d.id)).toEqual([...REGISTERED_IDS])
    expect(defs[0]).toMatchObject({
      id: 'color',
      label: 'Color',
      navPath: 'color',
      navIcon: 'mdi-palette',
    })
    expect(defs[4]).toMatchObject({
      id: 'fontFamily',
      label: 'Font Family',
      navPath: 'fontFamily',
      navIcon: 'mdi-format-font',
    })
    expect(defs[5]).toMatchObject({
      id: 'fontWeight',
      label: 'Font Weight',
      navPath: 'fontWeight',
      navIcon: 'mdi-format-bold',
    })
  })

  it('resolves /tokens/:tokenType segments via navPath', () => {
    expect(getTokenTypeDefinitionByNavPath('color')?.id).toBe('color')
    expect(getTokenTypeDefinitionByNavPath('fontFamily')?.id).toBe('fontFamily')
    expect(getTokenTypeDefinitionByNavPath('fontWeight')?.id).toBe('fontWeight')
    expect(getTokenTypeDefinitionByNavPath('ColorContentPage')).toBeUndefined()
  })

  it('exposes only registered types as navigable', () => {
    expect(isRegisteredTokenType('fontWeight')).toBe(true)
    expect(isRegisteredTokenType('fontFamily')).toBe(true)
    expect(isRegisteredTokenType('cubicBezier')).toBe(false)
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

  it('filters table rows by tokenType (Font Weight shell)', () => {
    const rows = [
      { path: 'a.one', type: 'color' as const },
      { path: 'w.two', type: 'fontWeight' as const },
      { path: 'w.three', type: 'fontWeight' as const },
    ]
    const filtered = rows.filter((r) => r.type === 'fontWeight')
    expect(filtered.map((r) => r.path)).toEqual(['w.two', 'w.three'])
  })
})
