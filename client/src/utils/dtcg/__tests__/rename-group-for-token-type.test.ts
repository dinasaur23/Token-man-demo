/**
 * Type-scoped group rename — exclusive rename vs mixed split.
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
import { updateAliasReferencesInDocs } from '../json-path-helpers'
import type { JsonValue } from '../resolver'

const colorValue = {
  colorSpace: 'srgb',
  components: [1, 0, 0],
  hex: '#FF0000',
}

function colorLeaf(): JsonRecord {
  return { $type: 'color', $value: { ...colorValue } }
}

function cubicLeaf(): JsonRecord {
  return { $type: 'cubicBezier', $value: [0.4, 0, 0.2, 1] }
}

describe('renameGroupForTokenType', () => {
  it('exclusive color group renames the physical key in place', () => {
    const root: JsonRecord = {
      primary: {
        $description: 'Brand',
        ink: colorLeaf(),
      },
    }

    const result = renameGroupForTokenType({
      root,
      groupPath: ['primary'],
      newName: 'primary1',
      tokenType: 'color',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mode).toBe('exclusive')
    expect(root.primary).toBeUndefined()
    expect(root.primary1).toEqual({
      $description: 'Brand',
      ink: colorLeaf(),
    })
    expect(result.movedLeafPaths).toEqual([{ from: 'primary.ink', to: 'primary1.ink' }])
  })

  it('mixed group splits: color moves, cubicBezier stays; metadata not duplicated', () => {
    const ink = colorLeaf()
    const ease = cubicLeaf()
    const root: JsonRecord = {
      primary: {
        $description: 'Shared Figma path',
        $extensions: { org: { layer: 'foundation' } },
        $deprecated: false,
        ink,
        ease,
      },
    }

    const result = renameGroupForTokenType({
      root,
      groupPath: ['primary'],
      newName: 'primary1',
      tokenType: 'color',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mode).toBe('split')

    expect(root.primary1).toEqual({
      $type: 'color',
      ink,
    })
    // Same leaf reference — no token duplication.
    expect((root.primary1 as JsonRecord).ink).toBe(ink)

    expect(root.primary).toEqual({
      $description: 'Shared Figma path',
      $extensions: { org: { layer: 'foundation' } },
      $deprecated: false,
      ease,
    })
    expect((root.primary as JsonRecord).ease).toBe(ease)

    // Non-$type metadata must not be copied onto the destination.
    expect((root.primary1 as JsonRecord).$description).toBeUndefined()
    expect((root.primary1 as JsonRecord).$extensions).toBeUndefined()
    expect((root.primary1 as JsonRecord).$deprecated).toBeUndefined()
  })

  it('after color rename, type trees diverge (other page keeps old name)', () => {
    const root: JsonRecord = {
      primary: {
        ink: colorLeaf(),
        ease: cubicLeaf(),
      },
    }

    renameGroupForTokenType({
      root,
      groupPath: ['primary'],
      newName: 'primary1',
      tokenType: 'color',
    })

    const rows = [
      { path: 'primary1.ink', type: 'color', groupPath: ['primary1'] },
      { path: 'primary.ease', type: 'cubicBezier', groupPath: ['primary'] },
    ]

    const colorTree = buildGroupTreeWithTypeFallback(rows, 'color', { 'a.json': root })
    const cubicTree = buildGroupTreeWithTypeFallback(rows, 'cubicBezier', { 'a.json': root })

    expect(collectGroupTreeIds(colorTree).has('primary1')).toBe(true)
    expect(collectGroupTreeIds(colorTree).has('primary')).toBe(false)
    expect(collectGroupTreeIds(cubicTree).has('primary')).toBe(true)
    expect(collectGroupTreeIds(cubicTree).has('primary1')).toBe(false)
  })

  it('nested mixed hierarchy splits only as deep as needed and preserves metadata', () => {
    const accent = colorLeaf()
    const fast = { $type: 'duration', $value: { value: 100, unit: 'ms' } }
    const root: JsonRecord = {
      theme: {
        $description: 'Theme root',
        nested: {
          $extensions: { tool: { note: 'nested' } },
          palette: {
            accent,
          },
          motion: {
            fast,
          },
        },
      },
    }

    const result = renameGroupForTokenType({
      root,
      groupPath: ['theme'],
      newName: 'theme-color',
      tokenType: 'color',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mode).toBe('split')

    const moved = root['theme-color'] as JsonRecord
    const left = root.theme as JsonRecord

    expect(moved.$type).toBe('color')
    expect(moved.$description).toBeUndefined()
    expect((moved.nested as JsonRecord).palette).toEqual({ accent })
    expect((moved.nested as JsonRecord).motion).toBeUndefined()

    expect(left.$description).toBe('Theme root')
    expect((left.nested as JsonRecord).$extensions).toEqual({ tool: { note: 'nested' } })
    expect((left.nested as JsonRecord).motion).toEqual({ fast })
    expect((left.nested as JsonRecord).palette).toBeUndefined()
  })

  it('persistence round-trip keeps type-scoped result', () => {
    const root: JsonRecord = {
      primary: {
        ink: colorLeaf(),
        ease: cubicLeaf(),
      },
    }

    renameGroupForTokenType({
      root,
      groupPath: ['primary'],
      newName: 'primary1',
      tokenType: 'color',
    })

    const reloaded = JSON.parse(JSON.stringify(root)) as JsonRecord
    expect(reloaded.primary1).toBeTruthy()
    expect((reloaded.primary1 as JsonRecord).ink).toBeTruthy()
    expect((reloaded.primary as JsonRecord).ease).toBeTruthy()
    expect((reloaded.primary as JsonRecord).ink).toBeUndefined()
  })

  it('updates alias source strings for moved current-type tokens only', () => {
    const root: JsonRecord = {
      primary: {
        ink: colorLeaf(),
        accent: { $type: 'color', $value: '{primary.ink}' },
        ease: cubicLeaf(),
      },
      other: {
        refEase: { $type: 'cubicBezier', $value: '{primary.ease}' },
      },
    }

    const result = renameGroupForTokenType({
      root,
      groupPath: ['primary'],
      newName: 'primary1',
      tokenType: 'color',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const docs: Record<string, JsonValue> = { 'a.json': root }
    for (const { from, to } of result.movedLeafPaths) {
      updateAliasReferencesInDocs(docs, from, to)
    }

    const moved = docs['a.json'] as JsonRecord
    expect(((moved.primary1 as JsonRecord).accent as JsonRecord).$value).toBe('{primary1.ink}')
    expect(((moved.other as JsonRecord).refEase as JsonRecord).$value).toBe('{primary.ease}')
  })

  it('rejects empty name, duplicate sibling, and no-ops same name', () => {
    const root: JsonRecord = {
      primary: { ink: colorLeaf() },
      other: { x: colorLeaf() },
    }

    expect(
      renameGroupForTokenType({
        root,
        groupPath: ['primary'],
        newName: '   ',
        tokenType: 'color',
      }).ok,
    ).toBe(false)

    expect(
      renameGroupForTokenType({
        root,
        groupPath: ['primary'],
        newName: 'other',
        tokenType: 'color',
      }).ok,
    ).toBe(false)

    const same = renameGroupForTokenType({
      root,
      groupPath: ['primary'],
      newName: 'primary',
      tokenType: 'color',
    })
    expect(same.ok).toBe(true)
    if (same.ok) expect(same.mode).toBe('noop')
    expect(root.primary).toBeTruthy()
  })

  it('strips leftover group $type when it matched the moved type', () => {
    const root: JsonRecord = {
      primary: {
        $type: 'color',
        ink: { $value: { ...colorValue } },
        ease: cubicLeaf(),
      },
    }

    renameGroupForTokenType({
      root,
      groupPath: ['primary'],
      newName: 'primary1',
      tokenType: 'color',
    })

    expect((root.primary1 as JsonRecord).$type).toBe('color')
    expect((root.primary as JsonRecord).$type).toBeUndefined()
    expect((root.primary as JsonRecord).ease).toEqual(cubicLeaf())
  })

  it('legacy groupNameOverrides for the renamed path are cleared and do not retitle other types', () => {
    const root: JsonRecord = {
      primary: {
        ink: colorLeaf(),
        ease: cubicLeaf(),
      },
    }
    const overrides: Record<string, string> = {
      primary: 'old-display-name',
      'unrelated.group': 'keep-me',
    }

    const result = renameGroupForTokenType({
      root,
      groupPath: ['primary'],
      newName: 'primary1',
      tokenType: 'color',
    })
    expect(result.ok).toBe(true)

    clearGroupNameOverridesForPath(overrides, 'primary')
    expect(overrides.primary).toBeUndefined()
    expect(overrides['unrelated.group']).toBe('keep-me')

    const rows = [
      { path: 'primary1.ink', type: 'color', groupPath: ['primary1'] },
      { path: 'primary.ease', type: 'cubicBezier', groupPath: ['primary'] },
    ]
    const colorTree = applyGroupNameOverrides(
      buildGroupTreeWithTypeFallback(rows, 'color', { 'a.json': root }),
      overrides,
    )
    const cubicTree = applyGroupNameOverrides(
      buildGroupTreeWithTypeFallback(rows, 'cubicBezier', { 'a.json': root }),
      overrides,
    )

    expect(colorTree.map((n) => n.title)).toEqual(['primary1'])
    expect(cubicTree.map((n) => n.title)).toEqual(['primary'])
  })
})
