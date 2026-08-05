/**
 * Stage 16 — Font Family token-type registry.
 */
import { describe, expect, it } from 'vitest'
import {
  createDefaultFontFamilyValue,
  formatFontFamilyForDisplay,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinition,
  getTokenTypeDefinitionByNavPath,
  isRegisteredTokenType,
  parseFontFamilyFromEditor,
  requireTokenTypeDefinition,
  validateFontFamilyValue,
} from '../token-types'
import { validateTokensStrict } from '../dtcg-validator'

describe('token-type registry (fontFamily)', () => {
  it('registers fontFamily alongside prior types', () => {
    expect(getRegisteredTokenTypeIds()).toEqual([
      'color',
      'dimension',
      'number',
      'duration',
      'fontFamily',
      'fontWeight',
    ])
    expect(getTokenTypeDefinition('fontFamily')?.label).toBe('Font Family')
    expect(requireTokenTypeDefinition('fontFamily').navIcon).toBe('mdi-format-font')
    expect(getTokenTypeDefinitionByNavPath('fontFamily')?.id).toBe('fontFamily')
    expect(isRegisteredTokenType('fontFamily')).toBe(true)
  })

  it('createDefaultFontFamilyValue is "sans-serif"', () => {
    expect(createDefaultFontFamilyValue()).toBe('sans-serif')
  })

  it('validateFontFamilyValue accepts strings, arrays, and aliases', () => {
    expect(validateFontFamilyValue('Helvetica').ok).toBe(true)
    expect(validateFontFamilyValue(['Helvetica Neue', 'Arial', 'sans-serif']).ok).toBe(true)
    expect(validateFontFamilyValue('{fonts.sans}').ok).toBe(true)

    expect(validateFontFamilyValue('').ok).toBe(false)
    expect(validateFontFamilyValue([]).ok).toBe(false)
    expect(validateFontFamilyValue(['Helvetica', '']).ok).toBe(false)
    expect(validateFontFamilyValue(['Helvetica', '{fonts.x}']).ok).toBe(false)
    expect(validateFontFamilyValue(12).ok).toBe(false)
    expect(validateFontFamilyValue({ name: 'Arial' }).ok).toBe(false)
  })

  it('formatFontFamilyForDisplay renders strings and joined arrays', () => {
    expect(formatFontFamilyForDisplay('Inter').primary).toBe('Inter')
    expect(formatFontFamilyForDisplay(['Helvetica Neue', 'Arial']).primary).toBe(
      'Helvetica Neue, Arial',
    )
    expect(formatFontFamilyForDisplay('{fonts.sans}').primary).toBe('{fonts.sans}')
  })

  it('parseFontFamilyFromEditor accepts names, lists, JSON arrays, aliases', () => {
    expect(parseFontFamilyFromEditor('Inter')).toEqual({ ok: true, value: 'Inter' })
    expect(parseFontFamilyFromEditor('Helvetica, Arial, sans-serif')).toEqual({
      ok: true,
      value: ['Helvetica', 'Arial', 'sans-serif'],
    })
    expect(parseFontFamilyFromEditor('["Roboto", "sans-serif"]')).toEqual({
      ok: true,
      value: ['Roboto', 'sans-serif'],
    })
    expect(parseFontFamilyFromEditor('{fonts.sans}')).toEqual({
      ok: true,
      value: '{fonts.sans}',
    })
    expect(parseFontFamilyFromEditor('').ok).toBe(false)
    expect(parseFontFamilyFromEditor('[]').ok).toBe(false)
  })

  it('import validation accepts valid fontFamily docs and rejects bad values', async () => {
    const okDoc = {
      fonts: {
        $type: 'fontFamily',
        sans: { $value: ['Inter', 'sans-serif'] },
        mono: { $value: 'Roboto Mono' },
        alias: { $value: '{fonts.sans}' },
      },
    }
    expect(await validateTokensStrict(okDoc)).toEqual({ ok: true })

    const badDoc = {
      fonts: {
        $type: 'fontFamily',
        bad: { $value: [] },
      },
    }
    const result = await validateTokensStrict(badDoc)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('value')
      expect(result.errors.some((e) => e.includes('INVALID_VALUE'))).toBe(true)
    }
  })
})
