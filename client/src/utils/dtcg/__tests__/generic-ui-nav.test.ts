/**
 * Stage 11–18 — Generic UI + registered-type nav helpers.
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
  'cubicBezier',
] as const

describe('generic UI nav (registry-driven)', () => {
  it('registers all seven basic DTCG types for UI nav', () => {
    expect(getRegisteredTokenTypeIds()).toEqual([...REGISTERED_IDS])
    const defs = getRegisteredTokenTypeDefinitions()
    expect(defs).toHaveLength(7)
    expect(defs.map((d) => d.id)).toEqual([...REGISTERED_IDS])
    expect(defs[6]).toMatchObject({
      id: 'cubicBezier',
      label: 'Cubic Bézier',
      navPath: 'cubicBezier',
      navIcon: 'mdi-vector-curve',
    })
  })

  it('resolves /tokens/:tokenType segments via navPath', () => {
    expect(getTokenTypeDefinitionByNavPath('cubicBezier')?.id).toBe('cubicBezier')
    expect(getTokenTypeDefinitionByNavPath('fontWeight')?.id).toBe('fontWeight')
    expect(getTokenTypeDefinitionByNavPath('ColorContentPage')).toBeUndefined()
  })

  it('exposes only registered types as navigable', () => {
    expect(isRegisteredTokenType('cubicBezier')).toBe(true)
    expect(isRegisteredTokenType('fontWeight')).toBe(true)
    expect(isRegisteredTokenType('transition')).toBe(false)
  })
})

describe('generic UI type filter helper', () => {
  it('filters table rows by tokenType (Cubic Bézier shell)', () => {
    const rows = [
      { path: 'a.one', type: 'color' as const },
      { path: 'c.two', type: 'cubicBezier' as const },
      { path: 'c.three', type: 'cubicBezier' as const },
    ]
    const filtered = rows.filter((r) => r.type === 'cubicBezier')
    expect(filtered.map((r) => r.path)).toEqual(['c.two', 'c.three'])
  })
})
