/**
 * Manual smoke scenario (Color / Dimension / Cubic Bézier) exercised as a script.
 * Run: npx tsx scripts/smoke-type-scoped-groups.ts  (or via vitest below)
 */
import { describe, expect, it } from 'vitest'
import {
  applyGroupNameOverrides,
  buildGroupTreeWithTypeFallback,
  collectGroupTreeIds,
} from '../grouping'
import type { JsonRecord } from '../json-path-helpers'
import {
  clearGroupNameOverridesForPath,
  renameGroupForTokenType,
} from '../rename-group-for-token-type'
import { getAtPath, isJsonRecord } from '../json-path-helpers'

function addTypedEmptyGroup(
  doc: JsonRecord,
  parentGroupPath: string[],
  groupName: string,
  tokenType: string,
): void {
  const fullPath = [...parentGroupPath, groupName]
  let node: JsonRecord = doc
  for (const seg of fullPath) {
    if (!isJsonRecord(node[seg])) node[seg] = {}
    node = node[seg] as JsonRecord
  }
  if (!Object.prototype.hasOwnProperty.call(node, '$type')) node.$type = tokenType
}

describe('manual smoke: Color / Dimension / Cubic Bézier', () => {
  it('mixed rename + new/child groups do not leak across types and persist', () => {
    const root: JsonRecord = {
      primary: {
        ink: {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [1, 0, 0], hex: '#FF0000' },
        },
        ease: { $type: 'cubicBezier', $value: [0.4, 0, 0.2, 1] },
        gap: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
      },
    }
    const overrides: Record<string, string> = { primary: 'old-display-name' }

    // 1–3: rename primary → primary1 on Color
    const renamed = renameGroupForTokenType({
      root,
      groupPath: ['primary'],
      newName: 'primary1',
      tokenType: 'color',
    })
    expect(renamed.ok).toBe(true)
    clearGroupNameOverridesForPath(overrides, 'primary')

    // 4–5: NEW GROUP on Color
    addTypedEmptyGroup(root, [], 'new-group', 'color')
    // 6–7: CHILD GROUP under primary1
    addTypedEmptyGroup(root, ['primary1'], 'child', 'color')

    // Simulate reload
    const reloaded = JSON.parse(JSON.stringify(root)) as JsonRecord

    const colorRows = [
      { path: 'primary1.ink', type: 'color', groupPath: ['primary1'] },
    ]
    const dimRows = [
      { path: 'primary.gap', type: 'dimension', groupPath: ['primary'] },
    ]
    const cubicRows = [
      { path: 'primary.ease', type: 'cubicBezier', groupPath: ['primary'] },
    ]

    const colorTree = applyGroupNameOverrides(
      buildGroupTreeWithTypeFallback(colorRows, 'color', { 'a.json': reloaded }),
      overrides,
    )
    const dimTree = applyGroupNameOverrides(
      buildGroupTreeWithTypeFallback(dimRows, 'dimension', { 'a.json': reloaded }),
      overrides,
    )
    const cubicTree = applyGroupNameOverrides(
      buildGroupTreeWithTypeFallback(cubicRows, 'cubicBezier', { 'a.json': reloaded }),
      overrides,
    )

    const colorIds = collectGroupTreeIds(colorTree)
    const dimIds = collectGroupTreeIds(dimTree)
    const cubicIds = collectGroupTreeIds(cubicTree)

    // Color follows new source path; Cubic/Dimension keep old name
    expect(colorIds.has('primary1')).toBe(true)
    expect(colorIds.has('primary')).toBe(false)
    expect(cubicIds.has('primary')).toBe(true)
    expect(cubicIds.has('primary1')).toBe(false)
    expect(dimIds.has('primary')).toBe(true)
    expect(dimIds.has('primary1')).toBe(false)

    // Color-only new groups do not leak
    expect(colorIds.has('new-group')).toBe(true)
    expect(colorIds.has('primary1.child')).toBe(true)
    expect(cubicIds.has('new-group')).toBe(false)
    expect(dimIds.has('new-group')).toBe(false)
    expect(cubicIds.has('primary1.child')).toBe(false)

    // Titles not overridden by stale legacy overlay
    expect(colorTree.find((n) => n.id === 'primary1')?.title).toBe('primary1')
    expect(cubicTree.find((n) => n.id === 'primary')?.title).toBe('primary')

    // Persist: child exists under primary1
    expect(getAtPath(reloaded, ['primary1', 'child'])).toEqual({ $type: 'color' })
    expect(getAtPath(reloaded, ['primary1', 'ink'])).toBeTruthy()
    expect(getAtPath(reloaded, ['primary', 'ease'])).toBeTruthy()
    expect(getAtPath(reloaded, ['primary', 'gap'])).toBeTruthy()
  })
})
