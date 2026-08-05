import { describe, expect, it } from 'vitest'
import {
  classifyReferenceTarget,
  isCurlyBraceAlias,
  isJsonPointerRef,
  isLegacyAliasObject,
  parseJsonPointer,
  resolveReferenceFully,
  resolveReferenceOnce,
} from '../reference-resolver'

const doc = {
  colors: {
    $type: 'color',
    $root: {
      $value: {
        colorSpace: 'srgb',
        components: [0.5, 0.5, 0.5],
        hex: '#808080',
      },
    },
    black: {
      $value: {
        colorSpace: 'srgb',
        components: [0, 0, 0],
        hex: '#000000',
      },
    },
    primary: {
      $value: '{colors.black}',
    },
    semantic: {
      $value: '{colors.primary}',
    },
    cycleA: { $value: '{colors.cycleB}' },
    cycleB: { $value: '{colors.cycleA}' },
    viaPointer: {
      $value: { $ref: '#/colors/black/$value' },
    },
    redComponent: {
      $type: 'number',
      $value: { $ref: '#/colors/black/$value/components/0' },
    },
  },
}

describe('reference representations', () => {
  it('detects curly-brace aliases, JSON Pointer refs, and legacy alias objects', () => {
    expect(isCurlyBraceAlias('{colors.black}')).toBe(true)
    expect(isCurlyBraceAlias('#ff0000')).toBe(false)

    expect(isJsonPointerRef({ $ref: '#/colors/black/$value' })).toBe(true)
    expect(isJsonPointerRef({ alias: '{colors.black}' })).toBe(false)

    expect(isLegacyAliasObject({ alias: '{colors.black}' })).toBe(true)
    expect(isLegacyAliasObject({ $ref: '#/colors/black/$value' })).toBe(false)
    expect(isLegacyAliasObject({ $ref: '#/x', alias: '{y}' })).toBe(false)
  })

  it('parses JSON Pointer segments including array indexes', () => {
    expect(parseJsonPointer('#/colors/black/$value/components/0')).toEqual([
      'colors',
      'black',
      '$value',
      'components',
      '0',
    ])
    expect(parseJsonPointer('colors/black')).toBeNull()
  })
})

describe('curly-brace resolution', () => {
  it('resolves a token alias to its $value', () => {
    const result = resolveReferenceOnce(doc, '{colors.black}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.kind).toBe('curly-brace')
      expect(result.value).toEqual({
        colorSpace: 'srgb',
        components: [0, 0, 0],
        hex: '#000000',
      })
    }
  })

  it('resolves chained aliases', () => {
    const result = resolveReferenceFully(doc, '{colors.semantic}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        colorSpace: 'srgb',
        components: [0, 0, 0],
        hex: '#000000',
      })
    }
  })

  it('resolves group.$root token references', () => {
    const result = resolveReferenceOnce(doc, '{colors.$root}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({ hex: '#808080' })
    }
  })

  it('rejects curly-brace references that target only a group', () => {
    const result = resolveReferenceOnce(doc, '{colors}')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('ALIAS_TARGETS_GROUP')
      expect(result.message).toMatch(/\$root/)
    }
  })

  it('reports unresolved curly-brace references', () => {
    const result = resolveReferenceOnce(doc, '{colors.missing}')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('UNRESOLVED_ALIAS')
  })

  it('detects circular curly-brace aliases', () => {
    const result = resolveReferenceFully(doc, '{colors.cycleA}')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('CIRCULAR_ALIAS')
  })
})

describe('JSON Pointer resolution', () => {
  it('resolves a pointer to a token $value', () => {
    const result = resolveReferenceOnce(doc, { $ref: '#/colors/black/$value' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.kind).toBe('json-pointer')
      expect(result.value).toEqual({
        colorSpace: 'srgb',
        components: [0, 0, 0],
        hex: '#000000',
      })
    }
  })

  it('resolves a pointer to an array element inside a color value', () => {
    const result = resolveReferenceOnce(doc, {
      $ref: '#/colors/black/$value/components/0',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(0)
  })

  it('resolves a token whose $value is a JSON Pointer', () => {
    const result = resolveReferenceFully(doc, '{colors.viaPointer}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        colorSpace: 'srgb',
        components: [0, 0, 0],
        hex: '#000000',
      })
    }
  })

  it('reports unresolved JSON Pointers', () => {
    const result = resolveReferenceOnce(doc, { $ref: '#/colors/nope/$value' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('UNRESOLVED_ALIAS')
  })
})

describe('legacy alias object rejection', () => {
  it('rejects { alias: "{path}" } without rejecting valid $ref objects', () => {
    const legacy = resolveReferenceOnce(doc, { alias: '{colors.black}' })
    expect(legacy.ok).toBe(false)
    if (!legacy.ok) {
      expect(legacy.code).toBe('INVALID_VALUE')
      expect(legacy.message).toMatch(/Legacy non-spec alias object/)
    }

    const pointer = resolveReferenceOnce(doc, { $ref: '#/colors/black/$value' })
    expect(pointer.ok).toBe(true)
  })
})

describe('$root classification', () => {
  it('classifies colors.$root as a token and colors as a group', () => {
    expect(classifyReferenceTarget(doc, ['colors', '$root']).status).toBe('token')
    expect(classifyReferenceTarget(doc, ['colors']).status).toBe('group')
    expect(classifyReferenceTarget(doc, ['$root']).status).toBe('invalid-root')
  })
})
