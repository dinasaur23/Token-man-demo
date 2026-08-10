import { describe, expect, it } from 'vitest'
import { findDocContainingPath, findDocContainingPathPreferActive } from '../json-path-helpers'
import type { JsonValue } from '../resolver'

describe('findDocContainingPathPreferActive', () => {
  const docA: JsonValue = { grp: { tok: { $type: 'color', $value: 'a' } } }
  const docB: JsonValue = { grp: { tok: { $type: 'color', $value: 'b' } } }
  const docs = { 'a.json': docA, 'b.json': docB }
  const segments = ['grp', 'tok']

  it('returns preferred file when path exists there', () => {
    const result = findDocContainingPathPreferActive(docs, segments, 'b.json')
    expect(result?.fileName).toBe('b.json')
    expect((result?.token as { $value: string }).$value).toBe('b')
  })

  it('falls back to first match when preferred file lacks the path', () => {
    const result = findDocContainingPathPreferActive(
      docs,
      ['only', 'here'],
      'b.json',
    )
    expect(result).toBeNull()
  })

  it('matches findDocContainingPath when no preference and single file', () => {
    const single = { 'only.json': docA }
    const prefer = findDocContainingPathPreferActive(single, segments, null)
    const plain = findDocContainingPath(single, segments)
    expect(prefer?.fileName).toBe(plain?.fileName)
  })
})
