/**
 * Characterization of current server-side color flatten used before Style Dictionary.
 * Run: node --test src/utils/dtcg/__tests__/color-export-characterization.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractPrimitiveColor } from '../extractPrimitiveColor.js'
import { normalizeDtcgForCss } from '../normalizeDtcgForCss.js'

describe('color characterization: extractPrimitiveColor', () => {
  it('passes through hex strings', () => {
    assert.equal(extractPrimitiveColor('#ff0000'), '#ff0000')
  })

  it('prefers value.hex when present on a color object', () => {
    assert.equal(
      extractPrimitiveColor({
        colorSpace: 'srgb',
        components: [1, 0, 0],
        hex: '#ff0000',
      }),
      '#ff0000',
    )
  })

  it('builds hex from srgb components when hex is absent', () => {
    assert.equal(
      extractPrimitiveColor({
        colorSpace: 'srgb',
        components: [1, 0, 0],
      }),
      '#ff0000',
    )
  })

  it('returns null for non-color objects', () => {
    assert.equal(extractPrimitiveColor({ value: 16, unit: 'px' }), null)
  })
})

describe('color characterization: normalizeDtcgForCss', () => {
  it('rewrites color $value objects to hex strings in place', () => {
    const tree = {
      colors: {
        $type: 'color',
        red: {
          $value: {
            colorSpace: 'srgb',
            components: [1, 0, 0],
            hex: '#ff0000',
          },
        },
      },
    }
    normalizeDtcgForCss(tree)
    assert.equal(tree.colors.red.$value, '#ff0000')
  })

  it('leaves curly-brace aliases as strings', () => {
    const tree = {
      colors: {
        $type: 'color',
        primary: { $value: '{colors.red}' },
      },
    }
    normalizeDtcgForCss(tree)
    assert.equal(tree.colors.primary.$value, '{colors.red}')
  })
})
