import { describe, expect, it } from 'vitest'
import {
  cloneSourceDocumentMap,
  getSourceNodeAtPath,
  serializeSourceDocumentsForPersistence,
  setSourceTokenValueAtPath,
} from '../source-document'
import { buildResolvedWorkspaceView } from '../resolved-view'

describe('source vs resolved model', () => {
  const sourceDocs = {
    'tokens.json': {
      colors: {
        $type: 'color',
        $description: 'Brand palette',
        black: {
          $value: '#000000',
          $description: 'Pure black',
          $extensions: { figma: { variableId: '1:2' } },
        },
        primary: {
          $value: '{colors.black}',
          $extensions: { tool: { note: 'alias' } },
        },
      },
    },
  }

  it('setSourceTokenValueAtPath preserves sibling metadata and other $props', () => {
    const next = setSourceTokenValueAtPath(
      sourceDocs['tokens.json'],
      ['colors', 'black'],
      {
        colorSpace: 'srgb',
        components: [0, 0, 0],
        hex: '#000000',
      },
    )

    const black = getSourceNodeAtPath(next, ['colors', 'black']) as Record<string, unknown>
    expect(black.$description).toBe('Pure black')
    expect(black.$extensions).toEqual({ figma: { variableId: '1:2' } })
    expect(black.$value).toEqual({
      colorSpace: 'srgb',
      components: [0, 0, 0],
      hex: '#000000',
    })

    const group = getSourceNodeAtPath(next, ['colors']) as Record<string, unknown>
    expect(group.$description).toBe('Brand palette')
    expect(group.$type).toBe('color')

    const primary = getSourceNodeAtPath(next, ['colors', 'primary']) as Record<string, unknown>
    expect(primary.$value).toBe('{colors.black}')
    expect(primary.$extensions).toEqual({ tool: { note: 'alias' } })
  })

  it('does not mutate the original source document when updating a value', () => {
    const original = cloneSourceDocumentMap(sourceDocs)
    setSourceTokenValueAtPath(sourceDocs['tokens.json'], ['colors', 'black'], {
      colorSpace: 'srgb',
      components: [1, 0, 0],
      hex: '#ff0000',
    })
    expect(sourceDocs).toEqual(original)
  })

  it('buildResolvedWorkspaceView returns a detached merged document', () => {
    const view = buildResolvedWorkspaceView(sourceDocs)
    expect(view.mergedDocument).toEqual(sourceDocs['tokens.json'])

    // Mutating the derived view must not affect the authoritative source map.
    const mergedColors = (view.mergedDocument as Record<string, unknown>).colors as Record<
      string,
      unknown
    >
    mergedColors.$description = 'mutated derived'
    expect(
      (sourceDocs['tokens.json'].colors as { $description: string }).$description,
    ).toBe('Brand palette')
  })

  it('serializeSourceDocumentsForPersistence clones source files only', () => {
    const files = serializeSourceDocumentsForPersistence(sourceDocs)
    expect(files).toEqual([
      { name: 'tokens.json', content: sourceDocs['tokens.json'] },
    ])
    files[0]!.content = { tampered: true }
    expect(sourceDocs['tokens.json']).toHaveProperty('colors')
  })
})
