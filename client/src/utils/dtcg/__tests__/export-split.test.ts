/**
 * Stage 12 — client-side canonical source serialization checks.
 */
import { describe, expect, it } from 'vitest'
import {
  serializeSourceDocumentsForPersistence,
  getSourceNodeAtPath,
} from '../source-document'
import { buildResolvedWorkspaceView } from '../resolved-view'

describe('Stage 12: canonical source vs resolved export inputs', () => {
  const sourceDocs = {
    'tokens.json': {
      colors: {
        $type: 'color',
        $description: 'Brand',
        black: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
          $extensions: { figma: { variableId: '1:2' } },
        },
        primary: { $value: '{colors.black}' },
      },
    },
  }

  it('persistence serialization keeps aliases and group $type as authored', () => {
    const files = serializeSourceDocumentsForPersistence(sourceDocs)
    const content = files[0]!.content as Record<string, unknown>
    const colors = content.colors as Record<string, unknown>
    expect(colors.$type).toBe('color')
    expect(colors.$description).toBe('Brand')
    const primary = getSourceNodeAtPath(content, ['colors', 'primary']) as {
      $value: string
    }
    expect(primary.$value).toBe('{colors.black}')
    const black = getSourceNodeAtPath(content, ['colors', 'black']) as Record<
      string,
      unknown
    >
    expect(black).not.toHaveProperty('$type')
    expect(black.$extensions).toEqual({ figma: { variableId: '1:2' } })
  })

  it('resolved view is a separate derivation for platform exporters', () => {
    const view = buildResolvedWorkspaceView(sourceDocs)
    expect(view.sourceSnapshot['tokens.json']).toEqual(sourceDocs['tokens.json'])
    // Platform exporters must consume resolved/merged — never write it back.
    const mergedColors = (view.mergedDocument as Record<string, unknown>).colors as Record<
      string,
      unknown
    >
    expect((mergedColors.primary as { $value: string }).$value).toBe('{colors.black}')
  })
})
