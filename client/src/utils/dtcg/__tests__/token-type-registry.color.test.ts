import { describe, expect, it } from 'vitest'
import {
  createDefaultColorValue,
  formatColorForDisplay,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinition,
  parseColorFromEditor,
  requireTokenTypeDefinition,
  validateColorValue,
} from '../token-types'
import { validateTokensStrict } from '../dtcg-validator'
import { convertHexColorsInDocument } from '../color-conversion'

describe('token-type registry (color)', () => {
  it('registers color (later types land in subsequent stages)', () => {
    expect(getRegisteredTokenTypeIds()).toContain('color')
    expect(getTokenTypeDefinition('color')?.label).toBe('Color')
    expect(getTokenTypeDefinition('dimension')?.label).toBe('Dimension')
    expect(getTokenTypeDefinition('number')?.label).toBe('Number')
    expect(getTokenTypeDefinition('duration')?.label).toBe('Duration')
    expect(getTokenTypeDefinition('fontFamily')?.label).toBe('Font Family')
    expect(getTokenTypeDefinition('fontWeight')?.label).toBe('Font Weight')
    expect(() => requireTokenTypeDefinition('cubicBezier')).toThrow(/not registered/)
  })

  it('createDefaultColorValue returns a canonical srgb object', () => {
    expect(createDefaultColorValue()).toEqual({
      colorSpace: 'srgb',
      components: [0, 0, 0],
      hex: '#000000',
    })
  })

  it('parseColorFromEditor accepts hex and curly-brace aliases', () => {
    expect(parseColorFromEditor('#ff0000')).toEqual({
      ok: true,
      value: {
        colorSpace: 'srgb',
        components: [1, 0, 0],
        hex: '#ff0000',
      },
    })
    expect(parseColorFromEditor('{colors.black}')).toEqual({
      ok: true,
      value: '{colors.black}',
    })
    expect(parseColorFromEditor('not-a-color').ok).toBe(false)
  })

  it('formatColorForDisplay matches makeDisplayColor output shape', () => {
    const formatted = formatColorForDisplay({
      colorSpace: 'srgb',
      components: [1, 0, 0],
      hex: '#ff0000',
    })
    expect(formatted.primary).toBe('srgb(1.000, 0.000, 0.000)')
    expect(formatted.secondary).toBe('#ff0000')
  })

  it('validateColorValue accepts objects, hex, and aliases', () => {
    expect(validateColorValue({ colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' }).ok).toBe(
      true,
    )
    expect(validateColorValue('#ffffff').ok).toBe(true)
    expect(validateColorValue('{a.b}').ok).toBe(true)
    expect(validateColorValue({ hex: '#ff0000' }).ok).toBe(false)
  })

  it('keeps characterization import pipeline green via registry-backed color validation', async () => {
    const source = {
      colors: {
        $type: 'color',
        black: { $value: '#000000' },
        link: { $value: '{colors.black}' },
      },
    }
    const converted = convertHexColorsInDocument(source)
    const validation = await validateTokensStrict(converted)
    expect(validation).toEqual({ ok: true })
  })
})
