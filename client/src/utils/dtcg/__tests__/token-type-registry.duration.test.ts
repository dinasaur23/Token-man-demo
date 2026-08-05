/**
 * Stage 15 — Duration token-type registry.
 */
import { describe, expect, it } from 'vitest'
import {
  createDefaultDurationValue,
  formatDurationForDisplay,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinition,
  getTokenTypeDefinitionByNavPath,
  isRegisteredTokenType,
  parseDurationFromEditor,
  requireTokenTypeDefinition,
  validateDurationValue,
} from '../token-types'
import { validateTokensStrict } from '../dtcg-validator'

describe('token-type registry (duration)', () => {
  it('registers duration alongside color, dimension, and number', () => {
    expect(getRegisteredTokenTypeIds()).toEqual([
      'color',
      'dimension',
      'number',
      'duration',
    ])
    expect(getTokenTypeDefinition('duration')?.label).toBe('Duration')
    expect(requireTokenTypeDefinition('duration').navIcon).toBe('mdi-timer-outline')
    expect(getTokenTypeDefinitionByNavPath('duration')?.id).toBe('duration')
    expect(isRegisteredTokenType('duration')).toBe(true)
  })

  it('createDefaultDurationValue is { value: 0, unit: "ms" }', () => {
    expect(createDefaultDurationValue()).toEqual({ value: 0, unit: 'ms' })
  })

  it('validateDurationValue accepts objects and aliases; rejects bad units', () => {
    expect(validateDurationValue({ value: 200, unit: 'ms' }).ok).toBe(true)
    expect(validateDurationValue({ value: 0.3, unit: 's' }).ok).toBe(true)
    expect(validateDurationValue({ value: 0, unit: 'ms' }).ok).toBe(true)
    expect(validateDurationValue('{motion.fast}').ok).toBe(true)

    const badUnit = validateDurationValue({ value: 200, unit: 'sec' })
    expect(badUnit.ok).toBe(false)
    if (!badUnit.ok) {
      expect(badUnit.errors[0]?.message).toContain('unit must be "ms" or "s"')
    }

    expect(validateDurationValue({ value: 200 }).ok).toBe(false)
    expect(validateDurationValue({ unit: 'ms' }).ok).toBe(false)
    expect(validateDurationValue('200ms').ok).toBe(false)
  })

  it('formatDurationForDisplay renders CSS-like strings', () => {
    expect(formatDurationForDisplay({ value: 200, unit: 'ms' }).primary).toBe('200ms')
    expect(formatDurationForDisplay({ value: 0.3, unit: 's' }).primary).toBe('0.3s')
    expect(formatDurationForDisplay('{motion.fast}').primary).toBe('{motion.fast}')
  })

  it('parseDurationFromEditor accepts 200ms / 0.3s / aliases', () => {
    expect(parseDurationFromEditor('200ms')).toEqual({
      ok: true,
      value: { value: 200, unit: 'ms' },
    })
    expect(parseDurationFromEditor('0.3 s')).toEqual({
      ok: true,
      value: { value: 0.3, unit: 's' },
    })
    expect(parseDurationFromEditor('{motion.fast}')).toEqual({
      ok: true,
      value: '{motion.fast}',
    })
    expect(parseDurationFromEditor('200').ok).toBe(false)
    expect(parseDurationFromEditor('200sec').ok).toBe(false)
  })

  it('import validation accepts valid duration docs and rejects bad units', async () => {
    const okDoc = {
      motion: {
        $type: 'duration',
        fast: { $value: { value: 200, unit: 'ms' } },
        slow: { $value: '{motion.fast}' },
      },
    }
    expect(await validateTokensStrict(okDoc)).toEqual({ ok: true })

    const badDoc = {
      motion: {
        $type: 'duration',
        fast: { $value: { value: 200, unit: 'sec' } },
      },
    }
    const result = await validateTokensStrict(badDoc)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('value')
      expect(result.errors.some((e) => e.includes('unit must be "ms" or "s"'))).toBe(true)
    }
  })
})
