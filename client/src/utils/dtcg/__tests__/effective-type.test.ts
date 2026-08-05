import { describe, expect, it } from 'vitest'
import {
  getInheritedTypeAtPath,
  resolveEffectiveTypeAtPath,
  resolveEffectiveTypeForLeaf,
} from '../effective-type'
import type { JsonObject } from '../reference-resolver'

describe('effective-type resolution', () => {
  it('uses explicit leaf $type with origin explicit (ignores inherited)', () => {
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

  it('getInheritedTypeAtPath prefers nearest parent group $type', () => {
    const root = {
      outer: {
        $type: 'number',
        inner: {
          $type: 'color',
          leaf: {
            $value: {
              colorSpace: 'srgb',
              components: [0, 0, 0],
              hex: '#000000',
            },
          },
        },
      },
    }
    expect(getInheritedTypeAtPath(root, ['outer', 'inner', 'leaf'])).toBe('color')
    expect(resolveEffectiveTypeAtPath(root, ['outer', 'inner', 'leaf'])).toEqual({
      ok: true,
      type: 'color',
      origin: 'inherited',
    })
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

  it('prefers alias target type over the referencing leaf inherited group type', () => {
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
      spacing: {
        $type: 'dimension',
        fromColor: { $value: '{colors.black}' },
      },
    }
    const result = resolveEffectiveTypeAtPath(root, ['spacing', 'fromColor'])
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
      a: {
        one: { $value: '{a.two}' },
        two: { $value: '{a.one}' },
      },
    }
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

  it('resolves type via JSON Pointer to a typed token object', () => {
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
        primary: { $value: { $ref: '#/colors/black' } },
      },
    }
    const result = resolveEffectiveTypeAtPath(root, ['brand', 'primary'])
    expect(result).toEqual({ ok: true, type: 'color', origin: 'alias' })
  })

  it('returns ALIAS_TYPE_MISMATCH when explicit leaf type differs from reference target type', () => {
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
      spacing: {
        bad: {
          $type: 'dimension',
          $value: '{colors.black}',
        },
      },
    }
    const result = resolveEffectiveTypeAtPath(root, ['spacing', 'bad'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ALIAS_TYPE_MISMATCH')
  })

  it('allows matching explicit leaf type with reference target type', () => {
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
        primary: {
          $type: 'color',
          $value: '{colors.black}',
        },
      },
    }
    const result = resolveEffectiveTypeAtPath(root, ['brand', 'primary'])
    expect(result).toEqual({ ok: true, type: 'color', origin: 'explicit' })
  })

  it('rejects legacy {alias} objects during type resolution', () => {
    const root = {
      brand: {
        primary: { $value: { alias: '{colors.black}' } },
      },
    }
    const result = resolveEffectiveTypeAtPath(root, ['brand', 'primary'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_VALUE')
  })

  it('returns ALIAS_TARGETS_GROUP when curly-brace alias points at a group', () => {
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
        primary: { $value: '{colors}' },
      },
    }
    const result = resolveEffectiveTypeAtPath(root, ['brand', 'primary'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ALIAS_TARGETS_GROUP')
  })
})
