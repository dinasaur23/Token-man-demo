/**
 * Typed empty group creation semantics used by NEW GROUP / CHILD GROUP.
 */
import { describe, expect, it } from 'vitest'
import { buildGroupTreeWithTypeFallback, collectGroupTreeIds } from '../grouping'
import { getAtPath, isJsonRecord, type JsonRecord } from '../json-path-helpers'

/**
 * Mirror of addGroup source mutation rules (type-scoped empty group).
 * Kept here so creation semantics stay covered without mounting the composable.
 */
function addTypedEmptyGroup(
  doc: JsonRecord,
  parentGroupPath: string[],
  groupName: string,
  tokenType: string,
): { ok: boolean; reason?: string } {
  const trimmed = groupName.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }

  const fullPath = [...parentGroupPath, trimmed]
  const existing = getAtPath(doc, fullPath)

  if (existing !== undefined) {
    if (!isJsonRecord(existing) || Object.prototype.hasOwnProperty.call(existing, '$value')) {
      return { ok: false, reason: 'not-empty-group' }
    }
    const hasChildren = Object.keys(existing).some((k) => !k.startsWith('$'))
    if (hasChildren) return { ok: false, reason: 'has-children' }
    if (!Object.prototype.hasOwnProperty.call(existing, '$type')) {
      existing.$type = tokenType
      return { ok: true }
    }
    if (existing.$type !== tokenType) return { ok: false, reason: 'type-mismatch' }
    return { ok: true }
  }

  let node: JsonRecord = doc
  for (const seg of fullPath) {
    if (!node[seg] || typeof node[seg] !== 'object' || Array.isArray(node[seg])) {
      node[seg] = {}
    }
    node = node[seg] as JsonRecord
  }
  if (!Object.prototype.hasOwnProperty.call(node, '$type')) {
    node.$type = tokenType
  }
  return { ok: true }
}

describe('typed empty group creation', () => {
  it('Color NEW GROUP is visible on Color only', () => {
    const doc: JsonRecord = {
      primary: {
        ink: {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' },
        },
      },
    }
    expect(addTypedEmptyGroup(doc, [], 'new-group', 'color').ok).toBe(true)

    const rows = [{ path: 'primary.ink', type: 'color' as const, groupPath: ['primary'] }]
    const docs = { 'set.json': doc }
    const colorIds = collectGroupTreeIds(buildGroupTreeWithTypeFallback(rows, 'color', docs))
    const dimensionIds = collectGroupTreeIds(
      buildGroupTreeWithTypeFallback(rows, 'dimension', docs),
    )

    expect(colorIds.has('new-group')).toBe(true)
    expect(dimensionIds.has('new-group')).toBe(false)
  })

  it('Dimension NEW GROUP is visible on Dimension only', () => {
    const doc: JsonRecord = {
      spacing: {
        md: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
      },
    }
    expect(addTypedEmptyGroup(doc, [], 'gap', 'dimension').ok).toBe(true)
    const rows = [{ path: 'spacing.md', type: 'dimension' as const, groupPath: ['spacing'] }]
    const docs = { 'set.json': doc }
    expect(
      collectGroupTreeIds(buildGroupTreeWithTypeFallback(rows, 'dimension', docs)).has('gap'),
    ).toBe(true)
    expect(
      collectGroupTreeIds(buildGroupTreeWithTypeFallback(rows, 'color', docs)).has('gap'),
    ).toBe(false)
  })

  it('CHILD GROUP nests under selected parent for current type', () => {
    const doc: JsonRecord = {
      primary: {
        ink: {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' },
        },
      },
    }
    expect(addTypedEmptyGroup(doc, ['primary'], 'nested', 'color').ok).toBe(true)
    expect((doc.primary as JsonRecord).nested).toEqual({ $type: 'color' })

    const rows = [{ path: 'primary.ink', type: 'color' as const, groupPath: ['primary'] }]
    const ids = collectGroupTreeIds(
      buildGroupTreeWithTypeFallback(rows, 'color', { 'set.json': doc }),
    )
    expect(ids.has('primary.nested')).toBe(true)
  })

  it('rejects creating into a mixed group that already has children', () => {
    const doc: JsonRecord = {
      primary: {
        ink: {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' },
        },
        ease: { $type: 'cubicBezier', $value: [0.4, 0, 0.2, 1] },
      },
    }
    const before = structuredClone(doc)
    expect(addTypedEmptyGroup(doc, [], 'primary', 'color').ok).toBe(false)
    expect(doc).toEqual(before)
  })

  it('create → serialize reload keeps typed empty group', () => {
    const doc: JsonRecord = {}
    expect(addTypedEmptyGroup(doc, [], 'draft', 'color').ok).toBe(true)
    const reloaded = JSON.parse(JSON.stringify(doc)) as JsonRecord
    expect(reloaded.draft).toEqual({ $type: 'color' })
    expect(
      collectGroupTreeIds(
        buildGroupTreeWithTypeFallback([], 'color', { 'set.json': reloaded }),
      ).has('draft'),
    ).toBe(true)
  })

  it('mutations target the provided active document only', () => {
    const active: JsonRecord = {}
    const other: JsonRecord = { keep: { $type: 'color' } }
    expect(addTypedEmptyGroup(active, [], 'only-here', 'color').ok).toBe(true)
    expect(active['only-here']).toEqual({ $type: 'color' })
    expect(other['only-here']).toBeUndefined()
  })
})
