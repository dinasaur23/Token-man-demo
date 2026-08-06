/**
 * Token-table column factory — Hex/Color columns only on Color pages.
 */
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import {
  buildTokenGridColumnDefs,
  COLOR_ONLY_TOKEN_GRID_HEADERS,
  getTokenGridColumnHeaders,
  SHARED_TOKEN_GRID_HEADERS,
  tokenTypeShowsColorColumns,
  type TokenGridColumnDeps,
} from '../token-grid-columns'
import {
  getRegisteredTokenTypeIds,
  type TokenTypeId,
} from '../token-types'

function stubDeps(): TokenGridColumnDeps {
  return {
    onActionButtonClick: () => {},
    updateTokenValueAny: async () => {},
    activeGroupIdRef: ref<string | null>(null),
    saveNameOverride: () => {},
  }
}

function headerNames(tokenType: TokenTypeId): string[] {
  return buildTokenGridColumnDefs(tokenType, stubDeps()).map(
    (c) => c.headerName ?? '',
  )
}

describe('token grid column factory', () => {
  it('1. Color page shows Hex and Color columns', () => {
    const headers = getTokenGridColumnHeaders('color')
    expect(headers).toContain('Hex')
    expect(headers).toContain('Color')
    expect(tokenTypeShowsColorColumns('color')).toBe(true)

    const defs = headerNames('color')
    expect(defs).toEqual(['Name', 'Value', 'Hex', 'Alias path', 'Color', ''])
  })

  it('2. Dimension page does not show Hex or Color', () => {
    const headers = getTokenGridColumnHeaders('dimension')
    expect(headers).not.toContain('Hex')
    expect(headers).not.toContain('Color')
    expect(tokenTypeShowsColorColumns('dimension')).toBe(false)

    expect(headerNames('dimension')).toEqual(['Name', 'Value', 'Alias path', ''])
  })

  it('3. Cubic Bézier page does not show Hex or Color', () => {
    const headers = getTokenGridColumnHeaders('cubicBezier')
    expect(headers).not.toContain('Hex')
    expect(headers).not.toContain('Color')
    expect(tokenTypeShowsColorColumns('cubicBezier')).toBe(false)

    expect(headerNames('cubicBezier')).toEqual(['Name', 'Value', 'Alias path', ''])
  })

  it('4. switching Color → Dimension → Color updates columns correctly', () => {
    const color1 = getTokenGridColumnHeaders('color')
    const dimension = getTokenGridColumnHeaders('dimension')
    const color2 = getTokenGridColumnHeaders('color')

    expect(color1).toContain('Hex')
    expect(color1).toContain('Color')

    expect(dimension).not.toContain('Hex')
    expect(dimension).not.toContain('Color')

    expect(color2).toEqual(color1)
    expect(color2).toContain('Hex')
    expect(color2).toContain('Color')

    // ColDef factory matches header helper through the same switch.
    expect(headerNames('color')).toEqual(color1)
    expect(headerNames('dimension')).toEqual(dimension)
    expect(headerNames('color')).toEqual(color2)
  })

  it('5. shared columns remain available for every registered type', () => {
    for (const id of getRegisteredTokenTypeIds()) {
      const headers = getTokenGridColumnHeaders(id)
      for (const shared of SHARED_TOKEN_GRID_HEADERS) {
        expect(headers).toContain(shared)
      }

      if (id === 'color') {
        for (const colorOnly of COLOR_ONLY_TOKEN_GRID_HEADERS) {
          expect(headers).toContain(colorOnly)
        }
      } else {
        for (const colorOnly of COLOR_ONLY_TOKEN_GRID_HEADERS) {
          expect(headers).not.toContain(colorOnly)
        }
      }
    }
  })
})
