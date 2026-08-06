/**
 * Stage 10 — DTCG Color Module 2025.10 compliance.
 * @see https://www.designtokens.org/tr/2025.10/color/
 * @see https://www.designtokens.org/tr/2025.10/format/
 */
import { describe, expect, it } from 'vitest'
import {
  normalizeHexColorsInSourceDocument,
  hexToDtcgColorValue,
} from '../color-conversion'
import {
  normalizeHexColorsInSourceDocumentMap,
  serializeSourceDocumentsForPersistence,
  rehydrateSourceDocumentsFromPersistence,
  cloneSourceDocumentMap,
} from '../source-document'
import { buildResolvedWorkspaceView } from '../resolved-view'
import {
  validateColorValue,
  SUPPORTED_COLOR_SPACE_IDS,
  CANONICAL_HEX_PATTERN,
} from '../token-types'
import { validateTokensStrict, validateColorSubtree } from '../dtcg-validator'

describe('color compliance: colorSpace allowlist', () => {
  it('exposes the Color Module 2025.10 supported spaces', () => {
    expect(SUPPORTED_COLOR_SPACE_IDS).toEqual([
      'srgb',
      'srgb-linear',
      'hsl',
      'hwb',
      'lab',
      'lch',
      'oklab',
      'oklch',
      'display-p3',
      'a98-rgb',
      'prophoto-rgb',
      'rec2020',
      'xyz-d65',
      'xyz-d50',
    ])
  })

  it('accepts each supported colorSpace with in-range components', () => {
    const samples: Record<string, unknown[]> = {
      srgb: [0, 0.5, 1],
      'srgb-linear': [0, 0.25, 1],
      hsl: [0, 50, 50],
      hwb: [359.9, 10, 20],
      lab: [50, -20, 30],
      lch: [50, 40, 180],
      oklab: [0.7, -0.1, 0.1],
      oklch: [0.7, 0.15, 40],
      'display-p3': [0.1, 0.2, 0.3],
      'a98-rgb': [0, 1, 0.5],
      'prophoto-rgb': [0.2, 0.3, 0.4],
      rec2020: [0, 0, 1],
      'xyz-d65': [0.1, 0.2, 0.3],
      'xyz-d50': [0.4, 0.5, 0.6],
    }

    for (const id of SUPPORTED_COLOR_SPACE_IDS) {
      const result = validateColorValue({
        colorSpace: id,
        components: samples[id],
      })
      expect(result, `colorSpace ${id}`).toEqual({ ok: true })
    }
  })

  it('rejects unknown colorSpace with INVALID_VALUE', () => {
    const result = validateColorValue({
      colorSpace: 'hsv',
      components: [0, 0, 0],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]!.message).toMatch(/INVALID_VALUE/)
      expect(result.errors[0]!.message).toMatch(/hsv/)
    }
  })
})

describe('color compliance: components, none, ranges', () => {
  it('accepts exact "none" in any component and preserves it through source normalize', () => {
    const value = {
      colorSpace: 'hsl',
      components: ['none', 0, 100],
    }
    expect(validateColorValue(value).ok).toBe(true)

    const doc = {
      colors: {
        $type: 'color',
        white: { $value: value },
      },
    }
    const normalized = normalizeHexColorsInSourceDocument(doc) as typeof doc
    expect(normalized.colors.white.$value).toEqual(value)
  })

  it('rejects wrong component arity', () => {
    const result = validateColorValue({
      colorSpace: 'srgb',
      components: [0, 0],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]!.message).toMatch(/INVALID_VALUE/)
      expect(result.errors[0]!.message).toMatch(/3 components/)
    }
  })

  it('rejects out-of-range srgb components', () => {
    const result = validateColorValue({
      colorSpace: 'srgb',
      components: [0, 1.5, 0],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]!.message).toMatch(/INVALID_VALUE/)
      expect(result.errors[0]!.message).toMatch(/out of range/)
    }
  })

  it('rejects hue at 360 (range is [0, 360))', () => {
    const result = validateColorValue({
      colorSpace: 'hsl',
      components: [360, 50, 50],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects non-number non-none components', () => {
    const result = validateColorValue({
      colorSpace: 'srgb',
      components: [0, 'red', 0],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]!.message).toMatch(/"none"/)
    }
  })
})

describe('color compliance: alpha and canonical hex', () => {
  it('accepts alpha in [0, 1] and rejects outside', () => {
    expect(
      validateColorValue({
        colorSpace: 'srgb',
        components: [0, 0, 0],
        alpha: 0,
      }).ok,
    ).toBe(true)
    expect(
      validateColorValue({
        colorSpace: 'srgb',
        components: [0, 0, 0],
        alpha: 1,
      }).ok,
    ).toBe(true)
    expect(
      validateColorValue({
        colorSpace: 'srgb',
        components: [0, 0, 0],
        alpha: 1.1,
      }).ok,
    ).toBe(false)
    expect(
      validateColorValue({
        colorSpace: 'srgb',
        components: [0, 0, 0],
        alpha: -0.01,
      }).ok,
    ).toBe(false)
  })

  it('accepts optional 6-digit hex only on canonical objects', () => {
    expect(CANONICAL_HEX_PATTERN.test('#ff0000')).toBe(true)
    expect(CANONICAL_HEX_PATTERN.test('#f00')).toBe(false)
    expect(CANONICAL_HEX_PATTERN.test('#ff000080')).toBe(false)

    expect(
      validateColorValue({
        colorSpace: 'srgb',
        components: [1, 0, 0],
        hex: '#ff0000',
      }).ok,
    ).toBe(true)
    expect(
      validateColorValue({
        colorSpace: 'srgb',
        components: [1, 0, 0],
        hex: '#f00',
      }).ok,
    ).toBe(false)
    expect(
      validateColorValue({
        colorSpace: 'srgb',
        components: [1, 0, 0],
        hex: '#ff000080',
      }).ok,
    ).toBe(false)
  })
})

describe('color compliance: hex-string → source normalize', () => {
  it('normalizes plain hex-string $value into canonical sRGB objects in source', () => {
    const source = {
      colors: {
        $type: 'color',
        black: { $value: '#000' },
        red: { $value: '#ff000080' },
        link: { $value: '{colors.black}' },
      },
    }

    const normalized = normalizeHexColorsInSourceDocument(source) as typeof source
    expect(normalized.colors.black.$value).toEqual({
      colorSpace: 'srgb',
      components: [0, 0, 0],
      hex: '#000000',
    })
    expect(normalized.colors.red.$value).toMatchObject({
      colorSpace: 'srgb',
      hex: '#ff0000',
    })
    expect((normalized.colors.red.$value as { alpha?: number }).alpha).toBeCloseTo(0.502, 2)
    expect(normalized.colors.link.$value).toBe('{colors.black}')

    // Persistence round-trip stores the normalized source, not hex strings.
    const files = serializeSourceDocumentsForPersistence({ 'tokens.json': normalized })
    const rehydrated = rehydrateSourceDocumentsFromPersistence(files)
    expect(rehydrated['tokens.json']).toEqual(normalized)
    expect(JSON.stringify(files)).not.toContain('"$value":"#000"')
  })

  it('normalizeHexColorsInSourceDocumentMap is idempotent and does not touch resolved views', () => {
    const source = {
      'tokens.json': {
        colors: {
          $type: 'color',
          black: { $value: '#000000' },
        },
      },
    }
    const once = normalizeHexColorsInSourceDocumentMap(source)
    const twice = normalizeHexColorsInSourceDocumentMap(once)
    expect(twice).toEqual(once)

    const before = cloneSourceDocumentMap(once)
    const view = buildResolvedWorkspaceView(once)
    ;(view.mergedDocument as Record<string, unknown>).tampered = true
    expect(once).toEqual(before)
  })

  it('hexToDtcgColorValue always emits 6-digit canonical hex', () => {
    expect(hexToDtcgColorValue('#abc').hex).toBe('#aabbcc')
    expect(CANONICAL_HEX_PATTERN.test(hexToDtcgColorValue('#abc').hex!)).toBe(true)
  })
})

describe('color compliance: import validation gate', () => {
  it('accepts normalized wide-gamut and none values via validateTokensStrict', async () => {
    const doc = {
      colors: {
        $type: 'color',
        p3: {
          $value: {
            colorSpace: 'display-p3',
            components: [1, 0, 0.5],
            alpha: 0.9,
          },
        },
        hslNone: {
          $value: {
            colorSpace: 'hsl',
            components: ['none', 0, 100],
          },
        },
      },
    }
    expect(await validateTokensStrict(doc)).toEqual({ ok: true })
    expect(validateColorSubtree(doc)).toEqual({ ok: true })
  })

  it('rejects invalid color objects at import after normalize', async () => {
    const doc = normalizeHexColorsInSourceDocument({
      colors: {
        $type: 'color',
        bad: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 2, 0],
            hex: '#00ff00',
          },
        },
      },
    })
    const result = await validateTokensStrict(doc)
    expect(result.ok).toBe(false)
  })
})
