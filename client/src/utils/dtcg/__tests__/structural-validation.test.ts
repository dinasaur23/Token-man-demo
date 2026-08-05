import { describe, expect, it } from 'vitest'
import {
  collectDeclaredTypeTaxonomyErrors,
  formatStructuralErrors,
  validateDocumentStructure,
} from '../structural-validation'
import {
  classifyDeclaredTokenType,
  formatTokenValidationError,
  messageForInvalidDtcgType,
  messageForUnsupportedByApplicationType,
  messageForUnsupportedExtends,
} from '../token-validation-error'

describe('token validation error taxonomy', () => {
  it('classifies string/boolean as INVALID_DTCG_TYPE with strict-application wording', () => {
    const booleanError = classifyDeclaredTokenType('boolean')
    expect(booleanError).toEqual({
      code: 'INVALID_DTCG_TYPE',
      message: messageForInvalidDtcgType('boolean'),
      $type: 'boolean',
    })
    expect(booleanError?.message).toContain('color, dimension, fontFamily, fontWeight, duration, cubicBezier, number')

    const stringError = classifyDeclaredTokenType('string')
    expect(stringError?.code).toBe('INVALID_DTCG_TYPE')
    expect(stringError?.$type).toBe('string')
  })

  it('classifies typography as UNSUPPORTED_BY_APPLICATION', () => {
    const result = classifyDeclaredTokenType('typography')
    expect(result).toEqual({
      code: 'UNSUPPORTED_BY_APPLICATION',
      message: messageForUnsupportedByApplicationType('typography'),
      $type: 'typography',
    })
  })

  it('returns null for application-supported basic types', () => {
    expect(classifyDeclaredTokenType('color')).toBeNull()
    expect(classifyDeclaredTokenType('dimension')).toBeNull()
    expect(classifyDeclaredTokenType('number')).toBeNull()
  })

  it('formats errors as path: CODE — message', () => {
    expect(
      formatTokenValidationError({
        path: 'brand.flags.isEnabled',
        code: 'INVALID_DTCG_TYPE',
        message: messageForInvalidDtcgType('boolean'),
        $type: 'boolean',
      }),
    ).toBe(
      `brand.flags.isEnabled: INVALID_DTCG_TYPE — ${messageForInvalidDtcgType('boolean')}`,
    )
  })
})

describe('structural validation', () => {
  it('accepts a well-formed color token document', () => {
    const doc = {
      colors: {
        $type: 'color',
        black: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
        primary: { $value: '{colors.black}' },
      },
    }
    const result = validateDocumentStructure(doc)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('reports TOKEN_AND_GROUP_CONFLICT when a node has $value and non-$ children', () => {
    const doc = {
      bad: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0, 0, 0],
          hex: '#000000',
        },
        child: {
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
            hex: '#ffffff',
          },
        },
      },
    }
    const result = validateDocumentStructure(doc)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.code === 'TOKEN_AND_GROUP_CONFLICT' && e.path === 'bad')).toBe(
      true,
    )
  })

  it('rejects $extends on groups as UNSUPPORTED_BY_APPLICATION without inspecting the target', () => {
    const doc = {
      base: {
        buttons: {
          bg: {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [0, 0, 0],
              hex: '#000000',
            },
          },
        },
      },
      buttons: {
        $extends: '{base.buttons}',
        bg: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 0, 0],
            hex: '#ff0000',
          },
        },
      },
    }
    const result = validateDocumentStructure(doc)
    expect(result.ok).toBe(false)
    const extendsError = result.errors.find((e) => e.path === 'buttons')
    expect(extendsError).toEqual({
      path: 'buttons',
      code: 'UNSUPPORTED_BY_APPLICATION',
      message: messageForUnsupportedExtends(),
    })
  })

  it('rejects group-level $ref extension as UNSUPPORTED_BY_APPLICATION', () => {
    const doc = {
      buttons: {
        $ref: '#/base/buttons',
        bg: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
      },
    }
    const result = validateDocumentStructure(doc)
    expect(result.ok).toBe(false)
    expect(
      result.errors.some(
        (e) => e.path === 'buttons' && e.code === 'UNSUPPORTED_BY_APPLICATION' && e.message.includes('$ref'),
      ),
    ).toBe(true)
  })

  it('does not treat token JSON Pointer $value refs as group extension', () => {
    const doc = {
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
    const result = validateDocumentStructure(doc)
    expect(result.ok).toBe(true)
  })

  it('reports ALIAS_TARGETS_GROUP for curly-brace refs to a group', () => {
    const doc = {
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
    const result = validateDocumentStructure(doc)
    expect(result.ok).toBe(false)
    expect(
      result.errors.some((e) => e.code === 'ALIAS_TARGETS_GROUP' && e.path === 'brand.primary'),
    ).toBe(true)
  })

  it('reports INVALID_ROOT_USAGE for {$root} alone', () => {
    const doc = {
      a: { $type: 'number', $value: '{$root}' },
    }
    const result = validateDocumentStructure(doc)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.code === 'INVALID_ROOT_USAGE')).toBe(true)
  })

  it('reports EMPTY_DOCUMENT when there are no token leaves', () => {
    const result = validateDocumentStructure({ meta: { note: 'no tokens' } })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.code === 'EMPTY_DOCUMENT')).toBe(true)
  })

  it('collects multiple structural errors without failing closed early', () => {
    const doc = {
      bad: {
        $value: 1,
        child: { $value: 2 },
      },
      extended: {
        $extends: '{missing}',
        leaf: { $value: 3 },
      },
    }
    const result = validateDocumentStructure(doc)
    expect(result.ok).toBe(false)
    const codes = result.errors.map((e) => e.code)
    expect(codes).toContain('TOKEN_AND_GROUP_CONFLICT')
    expect(codes).toContain('UNSUPPORTED_BY_APPLICATION')
  })

  it('formatStructuralErrors uses taxonomy formatting', () => {
    const formatted = formatStructuralErrors([
      {
        path: 'buttons',
        code: 'UNSUPPORTED_BY_APPLICATION',
        message: messageForUnsupportedExtends(),
      },
    ])
    expect(formatted[0]).toContain('UNSUPPORTED_BY_APPLICATION —')
    expect(formatted[0]).toContain('buttons:')
  })
})

describe('declared type taxonomy collector (opt-in)', () => {
  it('reports string/boolean and composites without being invoked by structural validation', () => {
    const doc = {
      flags: {
        on: { $type: 'boolean', $value: true },
      },
      text: {
        title: { $type: 'typography', $value: { fontFamily: 'Inter' } },
      },
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
    }

    // Structural pass must not reject string/boolean yet.
    const structural = validateDocumentStructure(doc)
    expect(structural.ok).toBe(true)

    const taxonomy = collectDeclaredTypeTaxonomyErrors(doc)
    expect(taxonomy.some((e) => e.code === 'INVALID_DTCG_TYPE' && e.$type === 'boolean')).toBe(true)
    expect(
      taxonomy.some((e) => e.code === 'UNSUPPORTED_BY_APPLICATION' && e.$type === 'typography'),
    ).toBe(true)
    expect(taxonomy.some((e) => e.$type === 'color')).toBe(false)
  })
})
