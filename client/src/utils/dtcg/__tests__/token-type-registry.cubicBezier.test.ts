/**
 * Stage 18 — Cubic Bézier token-type registry.
 */
import { describe, expect, it } from 'vitest'
import {
  createDefaultCubicBezierValue,
  formatCubicBezierForDisplay,
  getRegisteredTokenTypeIds,
  getTokenTypeDefinition,
  getTokenTypeDefinitionByNavPath,
  isRegisteredTokenType,
  parseCubicBezierFromEditor,
  requireTokenTypeDefinition,
  validateCubicBezierValue,
} from '../token-types'
import { validateTokensStrict } from '../dtcg-validator'

describe('token-type registry (cubicBezier)', () => {
  it('registers cubicBezier alongside all prior types', () => {
    expect(getRegisteredTokenTypeIds()).toEqual([
      'color',
      'dimension',
      'number',
      'duration',
      'fontFamily',
      'fontWeight',
      'cubicBezier',
    ])
    expect(getTokenTypeDefinition('cubicBezier')?.label).toBe('Cubic Bézier')
    expect(requireTokenTypeDefinition('cubicBezier').navIcon).toBe('mdi-vector-curve')
    expect(getTokenTypeDefinitionByNavPath('cubicBezier')?.id).toBe('cubicBezier')
    expect(isRegisteredTokenType('cubicBezier')).toBe(true)
  })

  it('createDefaultCubicBezierValue is CSS ease [0.25, 0.1, 0.25, 1]', () => {
    expect(createDefaultCubicBezierValue()).toEqual([0.25, 0.1, 0.25, 1])
  })

  it('validateCubicBezierValue accepts arrays and aliases; rejects bad x', () => {
    expect(validateCubicBezierValue([0.25, 0.1, 0.25, 1]).ok).toBe(true)
    expect(validateCubicBezierValue([0, 0, 1, 1]).ok).toBe(true)
    expect(validateCubicBezierValue([0.5, -2, 0.5, 3]).ok).toBe(true)
    expect(validateCubicBezierValue('{motion.ease}').ok).toBe(true)

    expect(validateCubicBezierValue([1.5, 0, 0.5, 1]).ok).toBe(false)
    expect(validateCubicBezierValue([0.5, 0, -0.1, 1]).ok).toBe(false)
    expect(validateCubicBezierValue([0.25, 0.1, 0.25]).ok).toBe(false)
    expect(validateCubicBezierValue('0.25, 0.1, 0.25, 1').ok).toBe(false)
  })

  it('formatCubicBezierForDisplay renders CSS cubic-bezier()', () => {
    expect(formatCubicBezierForDisplay([0.25, 0.1, 0.25, 1]).primary).toBe(
      'cubic-bezier(0.25, 0.1, 0.25, 1)',
    )
    expect(formatCubicBezierForDisplay('{motion.ease}').primary).toBe('{motion.ease}')
    expect(
      formatCubicBezierForDisplay([
        0.4000000059604645, 0, 0.20000000298023224, 1,
      ]).primary,
    ).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
  })

  it('parseCubicBezierFromEditor accepts CSS, JSON, lists, aliases', () => {
    expect(parseCubicBezierFromEditor('cubic-bezier(0.25, 0.1, 0.25, 1)')).toEqual({
      ok: true,
      value: [0.25, 0.1, 0.25, 1],
    })
    expect(parseCubicBezierFromEditor('[0, 0, 1, 1]')).toEqual({
      ok: true,
      value: [0, 0, 1, 1],
    })
    expect(parseCubicBezierFromEditor('0.42, 0, 0.58, 1')).toEqual({
      ok: true,
      value: [0.42, 0, 0.58, 1],
    })
    expect(parseCubicBezierFromEditor('{motion.ease}')).toEqual({
      ok: true,
      value: '{motion.ease}',
    })
    expect(parseCubicBezierFromEditor('1.5, 0, 0.5, 1').ok).toBe(false)
    expect(parseCubicBezierFromEditor('').ok).toBe(false)
  })

  it('import validation accepts valid cubicBezier docs and rejects bad x', async () => {
    const okDoc = {
      motion: {
        $type: 'cubicBezier',
        ease: { $value: [0.25, 0.1, 0.25, 1] },
        alias: { $value: '{motion.ease}' },
      },
    }
    expect(await validateTokensStrict(okDoc)).toEqual({ ok: true })

    const badDoc = {
      motion: {
        $type: 'cubicBezier',
        bad: { $value: [1.2, 0, 0.5, 1] },
      },
    }
    const result = await validateTokensStrict(badDoc)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('value')
      expect(result.errors.some((e) => e.includes('P1x must be in the range'))).toBe(true)
    }
  })
})
