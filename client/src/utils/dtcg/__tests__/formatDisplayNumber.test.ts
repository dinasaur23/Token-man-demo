import { describe, expect, it } from 'vitest'
import { formatDisplayNumber } from '../formatDisplayNumber'
import { formatCubicBezierForDisplay } from '../token-types/cubicBezier'

describe('formatDisplayNumber', () => {
  it('strips IEEE-754 float noise', () => {
    expect(formatDisplayNumber(0.4000000059604645)).toBe('0.4')
    expect(formatDisplayNumber(0.20000000298023224)).toBe('0.2')
  })

  it('keeps integers as integers', () => {
    expect(formatDisplayNumber(1)).toBe('1')
    expect(formatDisplayNumber(0)).toBe('0')
    expect(formatDisplayNumber(-0)).toBe('0')
  })

  it('preserves meaningful precision', () => {
    expect(formatDisplayNumber(1.25)).toBe('1.25')
    expect(formatDisplayNumber(0.333333)).toBe('0.333333')
  })
})

describe('formatCubicBezierForDisplay float noise', () => {
  it('formats noisy Figma floats as clean CSS cubic-bezier()', () => {
    expect(
      formatCubicBezierForDisplay([
        0.4000000059604645, 0, 0.20000000298023224, 1,
      ]).primary,
    ).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
  })
})
