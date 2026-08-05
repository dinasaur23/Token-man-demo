/**
 * Stage 12 — Export split focused tests.
 * Run: node --test src/utils/dtcg/__tests__/export-split.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  exportCanonicalJson,
  preparePlatformExport,
  prepareCssExport,
  prepareAndroidExport,
  mapDimensionValueForAndroid,
} from '../exporters/index.js'

const sourceDoc = {
  colors: {
    $type: 'color',
    $description: 'Brand palette',
    $extensions: { org: { layer: 'foundation' } },
    black: {
      $value: {
        colorSpace: 'srgb',
        components: [0, 0, 0],
        hex: '#000000',
      },
      $description: 'Pure black',
      $extensions: { figma: { variableId: '1:2' } },
    },
    primary: {
      $value: '{colors.black}',
      $extensions: { tool: { note: 'alias' } },
    },
  },
  spacing: {
    $type: 'dimension',
    md: {
      $value: { value: 1, unit: 'rem' },
    },
    sm: {
      $value: { value: 8, unit: 'px' },
    },
  },
}

describe('Stage 12: canonical JSON export', () => {
  it('preserves aliases, hierarchy, metadata, extensions, and group $type', () => {
    const result = exportCanonicalJson(sourceDoc)
    assert.equal(result.ok, true)
    assert.equal(result.errors.length, 0)

    const doc = result.document
    assert.equal(doc.colors.$type, 'color')
    assert.equal(doc.colors.$description, 'Brand palette')
    assert.deepEqual(doc.colors.$extensions, { org: { layer: 'foundation' } })
    assert.equal(doc.colors.primary.$value, '{colors.black}')
    assert.deepEqual(doc.colors.primary.$extensions, { tool: { note: 'alias' } })
    assert.equal(doc.colors.black.$description, 'Pure black')
    assert.deepEqual(doc.colors.black.$extensions, { figma: { variableId: '1:2' } })
    // Color objects stay as DTCG objects — no hex flatten on canonical path.
    assert.deepEqual(doc.colors.black.$value, {
      colorSpace: 'srgb',
      components: [0, 0, 0],
      hex: '#000000',
    })
    // Dimension objects stay as authored — no CSS stringify on canonical path.
    assert.deepEqual(doc.spacing.md.$value, { value: 1, unit: 'rem' })
  })

  it('does not materialize inherited group $type onto leaves that lacked it', () => {
    const result = exportCanonicalJson(sourceDoc)
    assert.equal(result.ok, true)
    assert.equal(
      Object.prototype.hasOwnProperty.call(result.document.colors.black, '$type'),
      false,
    )
    assert.equal(
      Object.prototype.hasOwnProperty.call(result.document.colors.primary, '$type'),
      false,
    )
    assert.equal(
      Object.prototype.hasOwnProperty.call(result.document.spacing.md, '$type'),
      false,
    )
  })

  it('does not mutate the source document', () => {
    const before = JSON.stringify(sourceDoc)
    exportCanonicalJson(sourceDoc)
    assert.equal(JSON.stringify(sourceDoc), before)
  })
})

describe('Stage 12: resolved platform export', () => {
  it('CSS exporter converts color objects and leaves aliases for SD', () => {
    const result = prepareCssExport(sourceDoc)
    assert.equal(result.ok, true)
    assert.equal(result.document.colors.black.$value, '#000000')
    assert.equal(result.document.colors.primary.$value, '{colors.black}')
    assert.ok(result.warnings.some((w) => w.code === 'EXPORT_LOSSY_COLOR'))
  })

  it('CSS exporter stringifies dimension objects as 16px / 1rem', () => {
    const result = prepareCssExport(sourceDoc)
    assert.equal(result.ok, true)
    assert.equal(result.document.spacing.md.$value, '1rem')
    assert.equal(result.document.spacing.sm.$value, '8px')
  })

  it('does not invent $type on inherited leaves during platform prep', () => {
    const result = prepareCssExport(sourceDoc)
    assert.equal(result.ok, true)
    assert.equal(
      Object.prototype.hasOwnProperty.call(result.document.colors.black, '$type'),
      false,
    )
  })

  it('each platform owns its color mapping (css vs android both hex today)', () => {
    const css = preparePlatformExport('css', {
      colors: {
        $type: 'color',
        red: {
          $value: { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' },
        },
      },
    })
    const android = preparePlatformExport('android', {
      colors: {
        $type: 'color',
        red: {
          $value: { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' },
        },
      },
    })
    assert.equal(css.ok, true)
    assert.equal(android.ok, true)
    assert.equal(css.document.colors.red.$value, '#ff0000')
    assert.equal(android.document.colors.red.$value, '#ff0000')
  })
})

describe('Stage 12: alias behavior', () => {
  it('canonical keeps curly-brace aliases; platform keeps them for SD resolution', () => {
    const canonical = exportCanonicalJson(sourceDoc)
    const platform = prepareCssExport(sourceDoc)
    assert.equal(canonical.document.colors.primary.$value, '{colors.black}')
    assert.equal(platform.document.colors.primary.$value, '{colors.black}')
  })
})

describe('Stage 12: structured errors for unsupported mappings', () => {
  it('errors (does not omit) when color cannot be converted', () => {
    const doc = {
      colors: {
        $type: 'color',
        weird: {
          $value: {
            colorSpace: 'display-p3',
            components: ['none', 0.2, 0.3],
          },
        },
      },
    }
    const result = prepareCssExport(doc)
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.code === 'EXPORT_UNSUPPORTED_COLOR'))
    assert.ok(result.errors.some((e) => e.path === 'colors.weird'))
    // Source value preserved on failure — not silently dropped.
    assert.deepEqual(result.document.colors.weird.$value, {
      colorSpace: 'display-p3',
      components: ['none', 0.2, 0.3],
    })
  })

  it('warns on lossy alpha drop instead of silent conversion', () => {
    const doc = {
      colors: {
        $type: 'color',
        translucent: {
          $value: {
            colorSpace: 'srgb',
            components: [1, 0, 0],
            alpha: 0.5,
            hex: '#ff0000',
          },
        },
      },
    }
    const result = prepareCssExport(doc)
    assert.equal(result.ok, true)
    assert.ok(result.warnings.some((w) => w.code === 'EXPORT_LOSSY_COLOR'))
    assert.equal(result.document.colors.translucent.$value, '#ff0000')
  })
})

describe('Stage 12: Android rem handling', () => {
  it('errors when rem tokens exist without remBasePx (never assumes 16)', () => {
    const result = prepareAndroidExport(sourceDoc)
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.code === 'EXPORT_REM_BASE_REQUIRED'))
    assert.ok(result.errors.some((e) => e.path === 'spacing.md'))
    // rem value not silently converted
    assert.deepEqual(result.document.spacing.md.$value, { value: 1, unit: 'rem' })
  })

  it('converts rem→dp when remBasePx is explicit and emits a lossy warning', () => {
    const result = prepareAndroidExport(sourceDoc, { remBasePx: 16 })
    assert.equal(result.ok, true)
    assert.deepEqual(result.document.spacing.md.$value, { value: 16, unit: 'dp' })
    assert.ok(result.warnings.some((w) => w.code === 'EXPORT_LOSSY_REM'))
    // px dimensions unchanged
    assert.deepEqual(result.document.spacing.sm.$value, { value: 8, unit: 'px' })
  })

  it('mapDimensionValueForAndroid rejects non-positive remBasePx', () => {
    const mapped = mapDimensionValueForAndroid(
      { value: 1.5, unit: 'rem' },
      'spacing.lg',
      { remBasePx: 0 },
    )
    assert.ok(mapped.errors.some((e) => e.code === 'EXPORT_REM_BASE_REQUIRED'))
    assert.deepEqual(mapped.value, { value: 1.5, unit: 'rem' })
  })
})

describe('Stage 14: number export', () => {
  it('canonical JSON preserves number values and aliases', () => {
    const doc = {
      opacity: {
        $type: 'number',
        full: { $value: 1 },
        muted: { $value: '{opacity.full}' },
      },
    }
    const result = exportCanonicalJson(doc)
    assert.equal(result.ok, true)
    assert.equal(result.document.opacity.full.$value, 1)
    assert.equal(result.document.opacity.muted.$value, '{opacity.full}')
  })

  it('platform exporters leave finite numbers as numbers', () => {
    const doc = {
      opacity: {
        $type: 'number',
        full: { $value: 0.85 },
        muted: { $value: '{opacity.full}' },
      },
    }
    const css = prepareCssExport(doc)
    assert.equal(css.ok, true)
    assert.equal(css.document.opacity.full.$value, 0.85)
    assert.equal(css.document.opacity.muted.$value, '{opacity.full}')
  })

  it('errors on non-finite number values instead of silently converting', () => {
    const doc = {
      opacity: {
        $type: 'number',
        bad: { $value: Number.NaN },
      },
    }
    const result = prepareCssExport(doc)
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.code === 'EXPORT_UNSUPPORTED_NUMBER'))
  })
})

describe('Stage 15: duration export', () => {
  it('canonical JSON preserves duration objects and aliases', () => {
    const doc = {
      motion: {
        $type: 'duration',
        fast: { $value: { value: 200, unit: 'ms' } },
        slow: { $value: '{motion.fast}' },
      },
    }
    const result = exportCanonicalJson(doc)
    assert.equal(result.ok, true)
    assert.deepEqual(result.document.motion.fast.$value, { value: 200, unit: 'ms' })
    assert.equal(result.document.motion.slow.$value, '{motion.fast}')
  })

  it('platform exporters stringify duration objects as 200ms / 0.3s', () => {
    const doc = {
      motion: {
        $type: 'duration',
        fast: { $value: { value: 200, unit: 'ms' } },
        medium: { $value: { value: 0.3, unit: 's' } },
        alias: { $value: '{motion.fast}' },
      },
    }
    const css = prepareCssExport(doc)
    assert.equal(css.ok, true)
    assert.equal(css.document.motion.fast.$value, '200ms')
    assert.equal(css.document.motion.medium.$value, '0.3s')
    assert.equal(css.document.motion.alias.$value, '{motion.fast}')

    const android = preparePlatformExport('android', doc)
    assert.equal(android.ok, true)
    assert.equal(android.document.motion.fast.$value, '200ms')
  })

  it('errors on unsupported duration units instead of silently converting', () => {
    const doc = {
      motion: {
        $type: 'duration',
        bad: { $value: { value: 200, unit: 'sec' } },
      },
    }
    const result = prepareCssExport(doc)
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.code === 'EXPORT_UNSUPPORTED_DURATION'))
    assert.deepEqual(result.document.motion.bad.$value, { value: 200, unit: 'sec' })
  })

  it('does not mis-route duration values through dimension mapping', () => {
    const doc = {
      motion: {
        $type: 'duration',
        fast: { $value: { value: 150, unit: 'ms' } },
      },
    }
    const result = prepareCssExport(doc)
    assert.equal(result.ok, true)
    assert.equal(result.document.motion.fast.$value, '150ms')
    assert.equal(result.errors.some((e) => e.code === 'EXPORT_UNSUPPORTED_DIMENSION'), false)
  })
})

describe('Stage 16: fontFamily export', () => {
  it('canonical JSON preserves fontFamily strings, arrays, and aliases', () => {
    const doc = {
      fonts: {
        $type: 'fontFamily',
        sans: { $value: ['Inter', 'Helvetica Neue', 'sans-serif'] },
        mono: { $value: 'Roboto Mono' },
        alias: { $value: '{fonts.sans}' },
      },
    }
    const result = exportCanonicalJson(doc)
    assert.equal(result.ok, true)
    assert.deepEqual(result.document.fonts.sans.$value, [
      'Inter',
      'Helvetica Neue',
      'sans-serif',
    ])
    assert.equal(result.document.fonts.mono.$value, 'Roboto Mono')
    assert.equal(result.document.fonts.alias.$value, '{fonts.sans}')
  })

  it('platform exporters emit CSS font-family list strings', () => {
    const doc = {
      fonts: {
        $type: 'fontFamily',
        sans: { $value: ['Inter', 'Helvetica Neue', 'sans-serif'] },
        mono: { $value: 'Roboto Mono' },
        alias: { $value: '{fonts.sans}' },
      },
    }
    const css = prepareCssExport(doc)
    assert.equal(css.ok, true)
    assert.equal(css.document.fonts.sans.$value, 'Inter, "Helvetica Neue", sans-serif')
    assert.equal(css.document.fonts.mono.$value, '"Roboto Mono"')
    assert.equal(css.document.fonts.alias.$value, '{fonts.sans}')
  })

  it('errors on empty fontFamily arrays instead of silently converting', () => {
    const doc = {
      fonts: {
        $type: 'fontFamily',
        bad: { $value: [] },
      },
    }
    const result = prepareCssExport(doc)
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.code === 'EXPORT_UNSUPPORTED_FONTFAMILY'))
    assert.deepEqual(result.document.fonts.bad.$value, [])
  })
})
