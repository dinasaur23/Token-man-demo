import { describe, expect, it } from 'vitest'
import { resolveEffectiveTypeForLeaf } from '../effective-type'
import type { JsonObject } from '../reference-resolver'

describe('effective-type resolution', () => {
  it('uses explicit leaf $type with origin explicit', () => {
    const root = {
      spacing: {
        md: { $type: 'dimension', $value: { value: 16, unit: 'px' } },
      },
    }
    const leaf = root.spacing.md as JsonObject
    const result = resolveEffectiveTypeForLeaf(root, leaf, 'color')
    expect(result).toEqual({ ok: true, type: 'dimension', origin: 'explicit' })
  })

  it('inherits group $type when leaf has no $type and value is not a reference', () => {
    const root = {
      colors: {
        $type: 'color',
        black: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
      },
    }
    const leaf = root.colors.black as JsonObject
    const result = resolveEffectiveTypeForLeaf(root, leaf, 'color')
    expect(result).toEqual({ ok: true, type: 'color', origin: 'inherited' })
  })

  it('takes type from curly-brace alias target (explicit on target)', () => {
    const root = {
      base: {
        black: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
      },
      brand: {
        primary: { $value: '{base.black}' },
      },
    }
    const leaf = root.brand.primary as JsonObject
    const result = resolveEffectiveTypeForLeaf(root, leaf, undefined)
    expect(result).toEqual({ ok: true, type: 'color', origin: 'alias' })
  })

  it('takes type from alias target that itself inherits group type', () => {
    const root = {
      colors: {
        $type: 'color',
        black: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
      },
      brand: {
        primary: { $value: '{colors.black}' },
      },
    }
    const leaf = root.brand.primary as JsonObject
    const result = resolveEffectiveTypeForLeaf(root, leaf, undefined)
    expect(result).toEqual({ ok: true, type: 'color', origin: 'alias' })
  })

  it('resolves type through chained aliases', () => {
    const root = {
      colors: {
        $type: 'color',
        black: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
        base: { $value: '{colors.black}' },
      },
      brand: {
        primary: { $value: '{colors.base}' },
      },
    }
    const leaf = root.brand.primary as JsonObject
    const result = resolveEffectiveTypeForLeaf(root, leaf, undefined)
    expect(result).toEqual({ ok: true, type: 'color', origin: 'alias' })
  })

  it('returns MISSING_TYPE only after explicit, alias, and inherited rules fail', () => {
    const root = {
      orphan: {
        lonely: { $value: 42 },
      },
    }
    const leaf = root.orphan.lonely as JsonObject
    const result = resolveEffectiveTypeForLeaf(root, leaf, undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('MISSING_TYPE')
  })

  it('returns UNRESOLVED_ALIAS when alias target is missing', () => {
    const root = {
      brand: {
        primary: { $value: '{colors.missing}' },
      },
    }
    const leaf = root.brand.primary as JsonObject
    const result = resolveEffectiveTypeForLeaf(root, leaf, undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('UNRESOLVED_ALIAS')
  })

  it('returns CIRCULAR_ALIAS for cyclic alias type resolution', () => {
    const root = {
      a: { one: { $value: '{a.two}' } },
      // intentional cycle
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    root.a.two = { $value: '{a.one}' }
    const leaf = root.a.one as JsonObject
    const result = resolveEffectiveTypeForLeaf(root, leaf, undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('CIRCULAR_ALIAS')
  })

  it('resolves type via JSON Pointer to a typed token value', () => {
    const root = {
      colors: {
        black: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
      },
      brand: {
        primary: { $value: { $ref: '#/colors/black/$value' } },
      },
    }
    const leaf = root.brand.primary as JsonObject
    const result = resolveEffectiveTypeForLeaf(root, leaf, undefined)
    expect(result).toEqual({ ok: true, type: 'color', origin: 'alias' })
  })
})
