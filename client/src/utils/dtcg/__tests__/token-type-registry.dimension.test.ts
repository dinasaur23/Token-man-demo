/**
 * Stage 13 — Dimension token-type registry.
 */
import { describe, expect, it } from 'vitest'
import {
  createDefaultDimensionValue,
  formatDimensionForDisplay,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinition,
  getTokenTypeDefinitionByNavPath,
  isRegisteredTokenType,
  parseDimensionFromEditor,
  requireTokenTypeDefinition,
  validateDimensionValue,
} from '../token-types'
import { validateTokensStrict } from '../dtcg-validator'

describe('token-type registry (dimension)', () => {
  it('registers dimension alongside color, number, duration, and fontFamily', () => {
    expect(getRegisteredTokenTypeIds()).toEqual([
      'color',
      'dimension',
      'number',
      'duration',
      'fontFamily',
      'fontWeight',
    ])
    expect(getTokenTypeDefinition('dimension')?.label).toBe('Dimension')
    expect(requireTokenTypeDefinition('dimension').navIcon).toBe('mdi-ruler')
    expect(getTokenTypeDefinitionByNavPath('dimension')?.id).toBe('dimension')
    expect(isRegisteredTokenType('dimension')).toBe(true)
  })

  it('createDefaultDimensionValue is { value: 0, unit: "px" }', () => {
    expect(createDefaultDimensionValue()).toEqual({ value: 0, unit: 'px' })
  })

  it('validateDimensionValue accepts objects and aliases; rejects bad units', () => {
    expect(validateDimensionValue({ value: 16, unit: 'px' }).ok).toBe(true)
    expect(validateDimensionValue({ value: 1.5, unit: 'rem' }).ok).toBe(true)
    expect(validateDimensionValue({ value: 0, unit: 'px' }).ok).toBe(true)
    expect(validateDimensionValue('{spacing.md}').ok).toBe(true)

    const badUnit = validateDimensionValue({ value: 16, unit: 'em' })
    expect(badUnit.ok).toBe(false)
    if (!badUnit.ok) {
      expect(badUnit.errors[0]?.message).toContain('unit must be "px" or "rem"')
    }

    expect(validateDimensionValue({ value: 16 }).ok).toBe(false)
    expect(validateDimensionValue({ unit: 'px' }).ok).toBe(false)
    expect(validateDimensionValue('16px').ok).toBe(false)
  })

  it('formatDimensionForDisplay renders CSS-like strings', () => {
    expect(formatDimensionForDisplay({ value: 16, unit: 'px' }).primary).toBe('16px')
    expect(formatDimensionForDisplay({ value: 1, unit: 'rem' }).primary).toBe('1rem')
    expect(formatDimensionForDisplay('{spacing.md}').primary).toBe('{spacing.md}')
  })

  it('parseDimensionFromEditor accepts 16px / 1rem / aliases', () => {
    expect(parseDimensionFromEditor('16px')).toEqual({
      ok: true,
      value: { value: 16, unit: 'px' },
    })
    expect(parseDimensionFromEditor('1 rem')).toEqual({
      ok: true,
      value: { value: 1, unit: 'rem' },
    })
    expect(parseDimensionFromEditor('{spacing.md}')).toEqual({
      ok: true,
      value: '{spacing.md}',
    })
    expect(parseDimensionFromEditor('16').ok).toBe(false)
    expect(parseDimensionFromEditor('16em').ok).toBe(false)
  })

  it('import validation accepts valid dimension docs and rejects bad units', async () => {
    const okDoc = {
      spacing: {
        $type: 'dimension',
        md: { $value: { value: 16, unit: 'px' } },
        lg: { $value: '{spacing.md}' },
      },
    }
    expect(await validateTokensStrict(okDoc)).toEqual({ ok: true })

    const badDoc = {
      spacing: {
        $type: 'dimension',
        md: { $value: { value: 16, unit: 'em' } },
      },
    }
    const result = await validateTokensStrict(badDoc)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('value')
      expect(result.errors.some((e) => e.includes('unit must be "px" or "rem"'))).toBe(true)
    }
  })
})
