import { describe, expect, it } from 'vitest'
import { collectTokensWithPath } from '../dtcg-parser'
import { findDocContainingPathPreferActive } from '../json-path-helpers'
import { resolveUploadedDocuments } from '../resolver'
import type { JsonValue } from '../resolver'

const brandA: JsonValue = {
  global: {
    color: {
      primary: { $type: 'color', $value: '#ff0000' },
    },
  },
}

const brandB: JsonValue = {
  global: {
    color: {
      primary: { $type: 'color', $value: '#0000ff' },
    },
  },
}

const PATH = 'global.color.primary'
const SEGMENTS = PATH.split('.')

describe('active token set isolated resolution', () => {
  it('resolves BrandA document showing red only', () => {
    const resolved = resolveUploadedDocuments({ 'BrandA.json': brandA }, {})
    const tokens = collectTokensWithPath(resolved)
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.path).toBe(PATH)
    expect(tokens[0]?.value).toBe('#ff0000')
  })

  it('resolves BrandB document showing blue only', () => {
    const resolved = resolveUploadedDocuments({ 'BrandB.json': brandB }, {})
    const tokens = collectTokensWithPath(resolved)
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.path).toBe(PATH)
    expect(tokens[0]?.value).toBe('#0000ff')
  })

  it('all-file merge collapses colliding paths (why display must isolate)', () => {
    const merged = resolveUploadedDocuments(
      { 'BrandA.json': brandA, 'BrandB.json': brandB },
      {},
    )
    const tokens = collectTokensWithPath(merged)
    expect(tokens).toHaveLength(1)
    // Object insertion order: BrandA first, BrandB second — deep merge last wins → blue
    expect(tokens[0]?.value).toBe('#0000ff')
  })

  it('findDocContainingPathPreferActive returns the active file on path collision', () => {
    const docs = { 'BrandA.json': brandA, 'BrandB.json': brandB }

    const foundA = findDocContainingPathPreferActive(docs, SEGMENTS, 'BrandA.json')
    const foundB = findDocContainingPathPreferActive(docs, SEGMENTS, 'BrandB.json')

    expect(foundA?.fileName).toBe('BrandA.json')
    expect(foundB?.fileName).toBe('BrandB.json')
    expect((foundA?.token as { $value: string }).$value).toBe('#ff0000')
    expect((foundB?.token as { $value: string }).$value).toBe('#0000ff')
  })

  it('editing via active file lookup leaves the other token set unchanged', () => {
    const docs = {
      'BrandA.json': structuredClone(brandA) as JsonValue,
      'BrandB.json': structuredClone(brandB) as JsonValue,
    }

    const foundB = findDocContainingPathPreferActive(docs, SEGMENTS, 'BrandB.json')
    expect(foundB).not.toBeNull()
    if (foundB && typeof foundB.token === 'object' && foundB.token !== null) {
      ;(foundB.token as Record<string, JsonValue>).$value = '#00ff00'
    }

    const foundA = findDocContainingPathPreferActive(docs, SEGMENTS, 'BrandA.json')
    expect((foundA?.token as { $value: string }).$value).toBe('#ff0000')

    const foundBAfter = findDocContainingPathPreferActive(docs, SEGMENTS, 'BrandB.json')
    expect((foundBAfter?.token as { $value: string }).$value).toBe('#00ff00')
  })
})
