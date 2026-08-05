/**
 * Stage 11–16 — Generic UI + registered-type nav helpers.
 */
import { describe, expect, it } from 'vitest'
import {
  getRegisteredTokenTypeDefinitions,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinitionByNavPath,
  isRegisteredTokenType,
} from '../token-types'

describe('generic UI nav (registry-driven)', () => {
  it('registers Color, Dimension, Number, Duration, and Font Family for UI nav', () => {
    expect(getRegisteredTokenTypeIds()).toEqual([
      'color',
      'dimension',
      'number',
      'duration',
      'fontFamily',
    ])
    const defs = getRegisteredTokenTypeDefinitions()
    expect(defs).toHaveLength(5)
    expect(defs.map((d) => d.id)).toEqual([
      'color',
      'dimension',
      'number',
      'duration',
      'fontFamily',
    ])
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
    expect(defs[3]).toMatchObject({
      id: 'duration',
      label: 'Duration',
      navPath: 'duration',
      navIcon: 'mdi-timer-outline',
    })
    expect(defs[4]).toMatchObject({
      id: 'fontFamily',
      label: 'Font Family',
      navPath: 'fontFamily',
      navIcon: 'mdi-format-font',
    })
  })

  it('resolves /tokens/:tokenType segments via navPath', () => {
    expect(getTokenTypeDefinitionByNavPath('color')?.id).toBe('color')
    expect(getTokenTypeDefinitionByNavPath('dimension')?.id).toBe('dimension')
    expect(getTokenTypeDefinitionByNavPath('number')?.id).toBe('number')
    expect(getTokenTypeDefinitionByNavPath('duration')?.id).toBe('duration')
    expect(getTokenTypeDefinitionByNavPath('fontFamily')?.id).toBe('fontFamily')
    expect(getTokenTypeDefinitionByNavPath('ColorContentPage')).toBeUndefined()
  })

  it('exposes only registered types as navigable', () => {
    expect(isRegisteredTokenType('dimension')).toBe(true)
    expect(isRegisteredTokenType('color')).toBe(true)
    expect(isRegisteredTokenType('number')).toBe(true)
    expect(isRegisteredTokenType('duration')).toBe(true)
    expect(isRegisteredTokenType('fontFamily')).toBe(true)
    expect(isRegisteredTokenType('fontWeight')).toBe(false)
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

  it('filters table rows by tokenType (Duration shell)', () => {
    const rows = [
      { path: 'a.one', type: 'color' as const },
      { path: 'm.two', type: 'duration' as const },
      { path: 'm.three', type: 'duration' as const },
    ]
    const filtered = rows.filter((r) => r.type === 'duration')
    expect(filtered.map((r) => r.path)).toEqual(['m.two', 'm.three'])
  })

  it('filters table rows by tokenType (Font Family shell)', () => {
    const rows = [
      { path: 'a.one', type: 'color' as const },
      { path: 'f.two', type: 'fontFamily' as const },
      { path: 'f.three', type: 'fontFamily' as const },
    ]
    const filtered = rows.filter((r) => r.type === 'fontFamily')
    expect(filtered.map((r) => r.path)).toEqual(['f.two', 'f.three'])
  })
})
