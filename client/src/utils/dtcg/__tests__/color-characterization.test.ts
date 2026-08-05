/**
 * Characterization tests for the current color token workflow.
 * These lock existing behavior before the DTCG multi-type refactor.
 * Update expectations deliberately when behavior is intentionally changed.
 */
import { describe, expect, it } from 'vitest'
import { convertHexColorsInDocument, hexToDtcgColorValue } from '../color-conversion'
import { makeDisplayColor } from '../color-display'
import {
  collectTokensWithPath,
  resolveAlias,
  resolveValue,
  type TokenEntry,
} from '../dtcg-parser'
import { validateColorSubtree, validateTokensStrict } from '../dtcg-validator'

describe('color characterization: hex → DTCG object conversion', () => {
  it('converts a 6-digit hex string to an srgb object with components and hex', () => {
    const result = hexToDtcgColorValue('#ff0000')
    expect(result).toEqual({
      colorSpace: 'srgb',
      components: [1, 0, 0],
      hex: '#ff0000',
    })
  })

  it('expands 3-digit hex and omits alpha when fully opaque', () => {
    const result = hexToDtcgColorValue('#f00')
    expect(result.colorSpace).toBe('srgb')
    expect(result.components).toEqual([1, 0, 0])
    expect(result.hex).toBe('#ff0000')
    expect(result.alpha).toBeUndefined()
  })

  it('includes alpha when 8-digit hex is not fully opaque', () => {
    const result = hexToDtcgColorValue('#ff000080')
    expect(result.colorSpace).toBe('srgb')
    expect(result.components[0]).toBeCloseTo(1)
    expect(result.components[1]).toBeCloseTo(0)
    expect(result.components[2]).toBeCloseTo(0)
    expect(result.alpha).toBeDefined()
    expect(result.alpha!).toBeCloseTo(0.502, 2)
  })

  it('walks a document and converts only color $value hex strings', () => {
    const doc = {
      colors: {
        $type: 'color',
        black: { $value: '#000000' },
        white: { $value: '#ffffff' },
      },
    }

    const converted = convertHexColorsInDocument(doc) as typeof doc
    expect(converted.colors.black.$value).toEqual({
      colorSpace: 'srgb',
      components: [0, 0, 0],
      hex: '#000000',
    })
    expect(converted.colors.white.$value).toEqual({
      colorSpace: 'srgb',
      components: [1, 1, 1],
      hex: '#ffffff',
    })
  })

  it('preserves curly-brace alias strings under color groups', () => {
    const doc = {
      colors: {
        $type: 'color',
        primary: { $value: '{colors.black}' },
        black: { $value: '#000000' },
      },
    }
    const converted = convertHexColorsInDocument(doc) as typeof doc
    expect(converted.colors.primary.$value).toBe('{colors.black}')
    expect(converted.colors.black.$value).toMatchObject({
      colorSpace: 'srgb',
      hex: '#000000',
    })
  })

  it('preserves existing color objects without rewriting them', () => {
    const obj = {
      colorSpace: 'srgb',
      components: [0.5, 0.25, 0.125],
      alpha: 0.9,
      hex: '#804020',
    }
    const doc = {
      brand: {
        accent: { $type: 'color', $value: obj },
      },
    }
    const converted = convertHexColorsInDocument(doc) as typeof doc
    expect(converted.brand.accent.$value).toEqual(obj)
  })
})

describe('color characterization: validation', () => {
  it('accepts a document with inherited group $type color and hex values after conversion', async () => {
    const doc = convertHexColorsInDocument({
      colors: {
        $type: 'color',
        black: { $value: '#000000' },
      },
    })
    const result = await validateTokensStrict(doc)
    expect(result).toEqual({ ok: true })
  })

  it('accepts explicit color objects with colorSpace, components, and hex', async () => {
    const doc = {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 0, 0],
            hex: '#ff0000',
          },
        },
      },
    }
    const result = await validateTokensStrict(doc)
    expect(result).toEqual({ ok: true })
  })

  it('accepts curly-brace aliases as color $value', () => {
    const doc = {
      colors: {
        $type: 'color',
        black: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
        primary: { $value: '{colors.black}' },
      },
    }
    const result = validateColorSubtree(doc)
    expect(result).toEqual({ ok: true })
  })

  it('rejects invalid color objects missing colorSpace/components', () => {
    const doc = {
      brand: {
        broken: {
          $type: 'color',
          $value: { hex: '#ff0000' },
        },
      },
    }
    const result = validateColorSubtree(doc)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })

  it('rejects unsupported $type values at structural validation', async () => {
    const doc = {
      space: {
        md: { $type: 'dimension', $value: { value: 16, unit: 'px' } },
      },
    }
    const result = await validateTokensStrict(doc)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('structural')
      expect(result.errors.some((e) => /dimension/i.test(e))).toBe(true)
    }
  })
})

describe('color characterization: parse and alias resolution', () => {
  it('collects color tokens with inherited group type', () => {
    const doc = {
      colors: {
        $type: 'color',
        black: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
        white: {
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
            hex: '#ffffff',
          },
        },
      },
    }
    const tokens = collectTokensWithPath(doc)
    expect(tokens).toHaveLength(2)
    expect(tokens.map((t) => t.path).sort()).toEqual(['colors.black', 'colors.white'])
    expect(tokens.every((t) => t.type === 'color')).toBe(true)
  })

  it('resolves a curly-brace alias to the target color object', () => {
    const blackValue = {
      colorSpace: 'srgb',
      components: [0, 0, 0],
      hex: '#000000',
    }
    const map: Record<string, TokenEntry> = {
      'colors.black': { path: 'colors.black', type: 'color', value: blackValue },
      'colors.primary': {
        path: 'colors.primary',
        type: 'color',
        value: '{colors.black}',
      },
    }
    expect(resolveAlias('colors.primary', map)).toEqual(blackValue)
    expect(resolveValue('{colors.black}', map)).toEqual(blackValue)
  })

  it('resolves chained curly-brace aliases', () => {
    const blackValue = {
      colorSpace: 'srgb',
      components: [0, 0, 0],
      hex: '#000000',
    }
    const map: Record<string, TokenEntry> = {
      'colors.black': { path: 'colors.black', type: 'color', value: blackValue },
      'colors.base': { path: 'colors.base', type: 'color', value: '{colors.black}' },
      'colors.primary': {
        path: 'colors.primary',
        type: 'color',
        value: '{colors.base}',
      },
    }
    expect(resolveAlias('colors.primary', map)).toEqual(blackValue)
  })

  it('does not infinitely recurse on circular aliases (current fallback behavior)', () => {
    const map: Record<string, TokenEntry> = {
      'a.one': { path: 'a.one', type: 'color', value: '{a.two}' },
      'a.two': { path: 'a.two', type: 'color', value: '{a.one}' },
    }
    // Current implementation falls back to the intermediate alias string when a cycle is detected.
    // Later stages will surface CIRCULAR_ALIAS as a structured validation error instead.
    const resolved = resolveAlias('a.one', map)
    expect(resolved === undefined || typeof resolved === 'string').toBe(true)
  })

  it('still resolves legacy { alias: "{path}" } object shape (current behavior to remove later)', () => {
    const blackValue = {
      colorSpace: 'srgb',
      components: [0, 0, 0],
      hex: '#000000',
    }
    const map: Record<string, TokenEntry> = {
      'colors.black': { path: 'colors.black', type: 'color', value: blackValue },
      'colors.primary': {
        path: 'colors.primary',
        type: 'color',
        value: { alias: '{colors.black}' },
      },
    }
    expect(resolveAlias('colors.primary', map)).toEqual(blackValue)
    expect(resolveValue({ alias: '{colors.black}' }, map)).toEqual(blackValue)
  })
})

describe('color characterization: display', () => {
  it('formats an srgb object into srgb(...) and hex for the table', () => {
    const display = makeDisplayColor({
      colorSpace: 'srgb',
      components: [1, 0, 0],
      hex: '#ff0000',
    })
    expect(display.hex).toBe('#ff0000')
    expect(display.srgb).toBe('srgb(1.000, 0.000, 0.000)')
  })

  it('formats a hex string value for display', () => {
    const display = makeDisplayColor('#00ff00')
    expect(display.hex).toBe('#00ff00')
    expect(display.srgb).toMatch(/^srgb\(/)
  })

  it('includes alpha in the srgb display string when present', () => {
    const display = makeDisplayColor({
      colorSpace: 'srgb',
      components: [0, 0, 1],
      alpha: 0.5,
      hex: '#0000ff',
    })
    expect(display.srgb).toBe('srgb(0.000, 0.000, 1.000, 0.500)')
  })
})

describe('color characterization: import pipeline (convert + validate + collect)', () => {
  it('runs the same steps as populateTableFromDocument for a hex color file', async () => {
    const source = {
      colors: {
        $type: 'color',
        black: { $value: '#000000' },
        link: { $value: '{colors.black}' },
      },
    }

    const converted = convertHexColorsInDocument(source)
    const validation = await validateTokensStrict(converted)
    expect(validation.ok).toBe(true)

    const tokens = collectTokensWithPath(converted)
    expect(tokens).toHaveLength(2)

    const byPath = Object.fromEntries(tokens.map((t) => [t.path, t]))
    expect(byPath['colors.link'].value).toBe('{colors.black}')
    expect(byPath['colors.black'].value).toMatchObject({
      colorSpace: 'srgb',
      hex: '#000000',
    })

    const map = Object.fromEntries(tokens.map((t) => [t.path, t]))
    const resolved = resolveAlias('colors.link', map)
    expect(resolved).toMatchObject({ colorSpace: 'srgb', hex: '#000000' })

    const display = makeDisplayColor(resolved)
    expect(display.hex).toBe('#000000')
  })
})
