/**
 * Stage 17 — Font Weight token-type registry.
 */
import { describe, expect, it } from 'vitest'
import {
  createDefaultFontWeightValue,
  formatFontWeightForDisplay,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinition,
  getTokenTypeDefinitionByNavPath,
  isRegisteredTokenType,
  parseFontWeightFromEditor,
  requireTokenTypeDefinition,
  validateFontWeightValue,
} from '../token-types'
import { validateTokensStrict } from '../dtcg-validator'

describe('token-type registry (fontWeight)', () => {
  it('registers fontWeight alongside prior types', () => {
    expect(getRegisteredTokenTypeIds()).toEqual([
      'color',
      'dimension',
      'number',
      'duration',
      'fontFamily',
      'fontWeight',
    ])
    expect(getTokenTypeDefinition('fontWeight')?.label).toBe('Font Weight')
    expect(requireTokenTypeDefinition('fontWeight').navIcon).toBe('mdi-format-bold')
    expect(getTokenTypeDefinitionByNavPath('fontWeight')?.id).toBe('fontWeight')
    expect(isRegisteredTokenType('fontWeight')).toBe(true)
  })

  it('createDefaultFontWeightValue is 400', () => {
    expect(createDefaultFontWeightValue()).toBe(400)
  })

  it('validateFontWeightValue accepts numbers, names, and aliases', () => {
    expect(validateFontWeightValue(1).ok).toBe(true)
    expect(validateFontWeightValue(400).ok).toBe(true)
    expect(validateFontWeightValue(1000).ok).toBe(true)
    expect(validateFontWeightValue('bold').ok).toBe(true)
    expect(validateFontWeightValue('extra-light').ok).toBe(true)
    expect(validateFontWeightValue('{fonts.weight.bold}').ok).toBe(true)

    expect(validateFontWeightValue(0).ok).toBe(false)
    expect(validateFontWeightValue(1001).ok).toBe(false)
    expect(validateFontWeightValue('Bold').ok).toBe(false)
    expect(validateFontWeightValue('semibold').ok).toBe(false)
    expect(validateFontWeightValue(Number.NaN).ok).toBe(false)
  })

  it('formatFontWeightForDisplay renders numbers and names', () => {
    expect(formatFontWeightForDisplay(700).primary).toBe('700')
    expect(formatFontWeightForDisplay('bold').primary).toBe('bold')
    expect(formatFontWeightForDisplay('{fonts.weight.bold}').primary).toBe(
      '{fonts.weight.bold}',
    )
  })

  it('parseFontWeightFromEditor accepts numbers, exact names, aliases', () => {
    expect(parseFontWeightFromEditor('400')).toEqual({ ok: true, value: 400 })
    expect(parseFontWeightFromEditor('bold')).toEqual({ ok: true, value: 'bold' })
    expect(parseFontWeightFromEditor('{fonts.weight.bold}')).toEqual({
      ok: true,
      value: '{fonts.weight.bold}',
    })
    expect(parseFontWeightFromEditor('Bold').ok).toBe(false)
    expect(parseFontWeightFromEditor('0').ok).toBe(false)
    expect(parseFontWeightFromEditor('1001').ok).toBe(false)
  })

  it('import validation accepts valid fontWeight docs and rejects bad values', async () => {
    const okDoc = {
      fonts: {
        $type: 'fontWeight',
        regular: { $value: 400 },
        bold: { $value: 'bold' },
        alias: { $value: '{fonts.regular}' },
      },
    }
    expect(await validateTokensStrict(okDoc)).toEqual({ ok: true })

    const badDoc = {
      fonts: {
        $type: 'fontWeight',
        bad: { $value: 'Bold' },
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
