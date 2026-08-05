import { describe, expect, it } from 'vitest'
import {
  applySourceTokenValueEdit,
  cloneSourceDocumentMap,
  getSourceNodeAtPath,
  mergeColorValuePreservingOptionalFields,
  rehydrateSourceDocumentsFromPersistence,
  serializeSourceDocumentsForPersistence,
  setSourceTokenValueAtPath,
  type SourceDocumentMap,
} from '../source-document'
import { buildResolvedWorkspaceView } from '../resolved-view'

/**
 * Rich source fixture covering metadata, aliases, hierarchy, group properties,
 * deprecated markers, extensions, and optional color fields.
 */
function makeSourceDocs(): SourceDocumentMap {
  return {
    'tokens.json': {
      colors: {
        $type: 'color',
        $description: 'Brand palette',
        $extensions: { org: { layer: 'foundation' } },
        black: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            alpha: 0.85,
            hex: '#000000',
          },
          $description: 'Pure black',
          $extensions: { figma: { variableId: '1:2' } },
          $deprecated: true,
        },
        primary: {
          $value: '{colors.black}',
          $description: 'Alias to black',
          $extensions: { tool: { note: 'alias' } },
        },
        accent: {
          $value: {
            colorSpace: 'display-p3',
            components: [1, 0, 0.5],
            alpha: 1,
          },
          $description: 'Wide-gamut accent',
        },
      },
      spacing: {
        $type: 'dimension',
        $description: 'Spacing scale',
        sm: {
          $value: { value: 4, unit: 'px' },
          $description: 'Small',
        },
      },
    },
  }
}

describe('round-trip preservation', () => {
  it('no-edit: serialize → rehydrate is deep-equal to source', () => {
    const source = makeSourceDocs()
    const persisted = serializeSourceDocumentsForPersistence(source)
    const rehydrated = rehydrateSourceDocumentsFromPersistence(persisted)

    expect(rehydrated).toEqual(source)
    expect(persisted).toEqual([
      { name: 'tokens.json', content: source['tokens.json'] },
    ])
  })

  it('no-edit: building a resolved view must not change authoritative source', () => {
    const source = makeSourceDocs()
    const before = cloneSourceDocumentMap(source)

    const view = buildResolvedWorkspaceView(source)
    // Mutate derived artifacts aggressively.
    ;(view.mergedDocument as Record<string, unknown>).tampered = true
    const colors = (view.mergedDocument as Record<string, Record<string, unknown>>).colors
    if (colors) colors.$description = 'mutated-derived'

    expect(source).toEqual(before)

    const persisted = serializeSourceDocumentsForPersistence(source)
    expect(rehydrateSourceDocumentsFromPersistence(persisted)).toEqual(before)
    expect(JSON.stringify(persisted)).not.toContain('mutated-derived')
    expect(JSON.stringify(persisted)).not.toContain('tampered')
  })

  it('single-edit: only the edited $value changes; metadata/aliases/hierarchy preserved', () => {
    const source = makeSourceDocs()
    const nextDocs = applySourceTokenValueEdit(source, 'tokens.json', ['colors', 'black'], {
      colorSpace: 'srgb',
      components: [0.1, 0.1, 0.1],
      hex: '#1a1a1a',
    })

    // Original source untouched.
    expect(source).toEqual(makeSourceDocs())

    const next = nextDocs['tokens.json']
    const black = getSourceNodeAtPath(next, ['colors', 'black']) as Record<string, unknown>
    expect(black.$description).toBe('Pure black')
    expect(black.$extensions).toEqual({ figma: { variableId: '1:2' } })
    expect(black.$deprecated).toBe(true)
    // alpha omitted from edit → preserved from previous color object
    expect(black.$value).toEqual({
      colorSpace: 'srgb',
      components: [0.1, 0.1, 0.1],
      hex: '#1a1a1a',
      alpha: 0.85,
    })

    const group = getSourceNodeAtPath(next, ['colors']) as Record<string, unknown>
    expect(group.$type).toBe('color')
    expect(group.$description).toBe('Brand palette')
    expect(group.$extensions).toEqual({ org: { layer: 'foundation' } })

    const primary = getSourceNodeAtPath(next, ['colors', 'primary']) as Record<string, unknown>
    expect(primary.$value).toBe('{colors.black}')
    expect(primary.$description).toBe('Alias to black')
    expect(primary.$extensions).toEqual({ tool: { note: 'alias' } })

    const accent = getSourceNodeAtPath(next, ['colors', 'accent']) as Record<string, unknown>
    expect(accent.$value).toEqual({
      colorSpace: 'display-p3',
      components: [1, 0, 0.5],
      alpha: 1,
    })
    expect(accent.$description).toBe('Wide-gamut accent')

    const spacing = getSourceNodeAtPath(next, ['spacing']) as Record<string, unknown>
    expect(spacing.$type).toBe('dimension')
    expect(spacing.$description).toBe('Spacing scale')

    // Sibling key order (hierarchy) preserved for unedited siblings.
    expect(Object.keys(group).filter((k) => !k.startsWith('$'))).toEqual([
      'black',
      'primary',
      'accent',
    ])
    expect(Object.keys(next as object)).toEqual(['colors', 'spacing'])
  })

  it('single-edit: persistence payload is source-only and round-trips the edit', () => {
    const source = makeSourceDocs()
    const edited = applySourceTokenValueEdit(source, 'tokens.json', ['colors', 'primary'], {
      colorSpace: 'srgb',
      components: [1, 0, 0],
      hex: '#ff0000',
    })

    // Rebuild resolved view from edited source (never persist it).
    const view = buildResolvedWorkspaceView(edited)
    ;(view.mergedDocument as Record<string, unknown>).shouldNotPersist = true

    const persisted = serializeSourceDocumentsForPersistence(edited)
    expect(JSON.stringify(persisted)).not.toContain('shouldNotPersist')

    const rehydrated = rehydrateSourceDocumentsFromPersistence(persisted)
    expect(rehydrated).toEqual(edited)

    const primary = getSourceNodeAtPath(rehydrated['tokens.json'], [
      'colors',
      'primary',
    ]) as Record<string, unknown>
    expect(primary.$description).toBe('Alias to black')
    expect(primary.$extensions).toEqual({ tool: { note: 'alias' } })
    expect(primary.$value).toEqual({
      colorSpace: 'srgb',
      components: [1, 0, 0],
      hex: '#ff0000',
    })

    // Unedited alias-target leaf still intact after sibling edit.
    const black = getSourceNodeAtPath(rehydrated['tokens.json'], [
      'colors',
      'black',
    ]) as Record<string, unknown>
    expect(black.$deprecated).toBe(true)
    expect(black.$value).toEqual({
      colorSpace: 'srgb',
      components: [0, 0, 0],
      alpha: 0.85,
      hex: '#000000',
    })
  })

  it('setSourceTokenValueAtPath does not invent $type on inherited-type leaves', () => {
    const doc = {
      colors: {
        $type: 'color',
        ink: {
          $value: '#111111',
          $description: 'Inherited type',
          $extensions: { a: 1 },
        },
      },
    }

    const next = setSourceTokenValueAtPath(doc, ['colors', 'ink'], {
      colorSpace: 'srgb',
      components: [0.2, 0.2, 0.2],
      hex: '#333333',
    })

    const ink = getSourceNodeAtPath(next, ['colors', 'ink']) as Record<string, unknown>
    expect(ink).not.toHaveProperty('$type')
    expect(ink.$description).toBe('Inherited type')
    expect(ink.$extensions).toEqual({ a: 1 })
  })

  it('mergeColorValuePreservingOptionalFields keeps alpha/hex when omitted from edit', () => {
    const previous = {
      colorSpace: 'srgb',
      components: [0, 0, 0],
      alpha: 0.4,
      hex: '#000000',
    }
    const next = {
      colorSpace: 'srgb',
      components: [1, 0, 0],
    }
    expect(mergeColorValuePreservingOptionalFields(previous, next)).toEqual({
      colorSpace: 'srgb',
      components: [1, 0, 0],
      alpha: 0.4,
      hex: '#000000',
    })
  })

  it('mergeColorValuePreservingOptionalFields does not override explicit next fields', () => {
    const previous = {
      colorSpace: 'srgb',
      components: [0, 0, 0],
      alpha: 0.4,
      hex: '#000000',
    }
    const next = {
      colorSpace: 'srgb',
      components: [1, 0, 0],
      alpha: 1,
      hex: '#ff0000',
    }
    expect(mergeColorValuePreservingOptionalFields(previous, next)).toEqual(next)
  })
})
