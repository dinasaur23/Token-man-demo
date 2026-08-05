/**
 * Stage 14 — Number token-type registry.
 */
import { describe, expect, it } from 'vitest'
import {
  createDefaultNumberValue,
  formatNumberForDisplay,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinition,
  getTokenTypeDefinitionByNavPath,
  isRegisteredTokenType,
  parseNumberFromEditor,
  requireTokenTypeDefinition,
  validateNumberValue,
} from '../token-types'
import { validateTokensStrict } from '../dtcg-validator'

describe('token-type registry (number)', () => {
  it('registers number alongside color, dimension, and duration', () => {
    expect(getRegisteredTokenTypeIds()).toEqual([
      'color',
      'dimension',
      'number',
      'duration',
    ])
    expect(getTokenTypeDefinition('number')?.label).toBe('Number')
    expect(requireTokenTypeDefinition('number').navIcon).toBe('mdi-numeric')
    expect(getTokenTypeDefinitionByNavPath('number')?.id).toBe('number')
    expect(isRegisteredTokenType('number')).toBe(true)
  })

  it('createDefaultNumberValue is 0', () => {
    expect(createDefaultNumberValue()).toBe(0)
  })

  it('validateNumberValue accepts finite numbers, aliases, and JSON Pointer refs', () => {
    expect(validateNumberValue(0).ok).toBe(true)
    expect(validateNumberValue(-1.5).ok).toBe(true)
    expect(validateNumberValue('{opacity.full}').ok).toBe(true)
    expect(validateNumberValue({ $ref: '#/opacity/full/$value' }).ok).toBe(true)

    expect(validateNumberValue(Number.NaN).ok).toBe(false)
    expect(validateNumberValue(Number.POSITIVE_INFINITY).ok).toBe(false)
    expect(validateNumberValue('12').ok).toBe(false)
    expect(validateNumberValue({ value: 1 }).ok).toBe(false)
  })

  it('formatNumberForDisplay renders numeric strings', () => {
    expect(formatNumberForDisplay(1.25).primary).toBe('1.25')
    expect(formatNumberForDisplay('{opacity.full}').primary).toBe('{opacity.full}')
  })

  it('parseNumberFromEditor accepts numbers and aliases', () => {
    expect(parseNumberFromEditor('1.25')).toEqual({ ok: true, value: 1.25 })
    expect(parseNumberFromEditor('-3')).toEqual({ ok: true, value: -3 })
    expect(parseNumberFromEditor('{opacity.full}')).toEqual({
      ok: true,
      value: '{opacity.full}',
    })
    expect(parseNumberFromEditor('12px').ok).toBe(false)
    expect(parseNumberFromEditor('').ok).toBe(false)
  })

  it('import validation accepts valid number docs and rejects bad values', async () => {
    const okDoc = {
      opacity: {
        $type: 'number',
        full: { $value: 1 },
        muted: { $value: '{opacity.full}' },
      },
    }
    expect(await validateTokensStrict(okDoc)).toEqual({ ok: true })

    const badDoc = {
      opacity: {
        $type: 'number',
        full: { $value: '1' },
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
