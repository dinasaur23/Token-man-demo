/**
 * Export serialization regressions — Style Dictionary end-to-end.
 *
 * Guards against `[object Object]` in generated CSS / Tailwind / Swift / Android
 * output for all seven application-supported basic DTCG types.
 *
 * Run: node --test src/utils/dtcg/__tests__/export-serialization.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import StyleDictionary from 'style-dictionary'
import {
  exportCanonicalJson,
  preparePlatformExport,
  prepareCssExport,
  prepareAndroidExport,
  prepareSwiftExport,
  prepareTailwindExport,
} from '../exporters/index.js'
import { createSdConfig } from '../../sd/index.js'

/** Fixture covering all seven types: direct, inherited, alias, nested. */
const mixedSource = {
  colors: {
    $type: 'color',
    brand: {
      black: {
        $value: {
          colorSpace: 'srgb',
          components: [0, 0, 0],
          hex: '#000000',
        },
      },
      primary: { $value: '{colors.brand.black}' },
    },
  },
  spacing: {
    $type: 'dimension',
    md: { $value: { value: 16, unit: 'px' } },
    lg: { $value: { value: 1, unit: 'rem' } },
    aliasMd: { $value: '{spacing.md}' },
    scale: {
      xl: { $value: { value: 24, unit: 'px' } },
    },
  },
  motion: {
    duration: {
      $type: 'duration',
      fast: { $value: { value: 150, unit: 'ms' } },
      slow: { $value: { value: 0.3, unit: 's' } },
      aliasFast: { $value: '{motion.duration.fast}' },
    },
    easing: {
      $type: 'cubicBezier',
      standard: { $value: [0.4, 0, 0.2, 1] },
      alias: { $value: '{motion.easing.standard}' },
    },
  },
  opacity: {
    $type: 'number',
    full: { $value: 1 },
    muted: { $value: 0.5 },
    aliasFull: { $value: '{opacity.full}' },
  },
  fonts: {
    $type: 'fontFamily',
    sans: { $value: ['Inter', 'sans-serif'] },
    mono: { $value: 'Roboto Mono' },
    aliasSans: { $value: '{fonts.sans}' },
  },
  weights: {
    $type: 'fontWeight',
    bold: { $value: 700 },
    medium: { $value: 'medium' },
    aliasBold: { $value: '{weights.bold}' },
  },
}

function assertNoObjectObject(label, text) {
  assert.equal(
    text.includes('[object Object]'),
    false,
    `${label} must not contain [object Object]\n---\n${text}\n---`,
  )
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) walkFiles(full, acc)
    else acc.push(full)
  }
  return acc
}

/**
 * Prepare + Style Dictionary build for one platform; return concatenated output.
 * @param {'css'|'tailwind'|'swift'|'android'} format
 * @param {unknown} doc
 * @param {{ remBasePx?: number }} [options]
 */
async function buildPlatformOutput(format, doc, options = {}) {
  const prepared = preparePlatformExport(format, doc, options)
  assert.equal(prepared.ok, true, () =>
    JSON.stringify(prepared.errors, null, 2),
  )

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `export-${format}-`))
  const jsonPath = path.join(tmp, 'tokens.json')
  const buildBase = path.join(tmp, 'build')
  fs.writeFileSync(jsonPath, JSON.stringify(prepared.document, null, 2))

  const sdConfig = createSdConfig(format, jsonPath, buildBase)
  const sd = new StyleDictionary(sdConfig)
  await sd.buildAllPlatforms()

  const files = walkFiles(buildBase)
  assert.ok(files.length > 0, `${format} build produced no files`)
  const bodies = files.map((f) => fs.readFileSync(f, 'utf8'))
  const joined = bodies.join('\n')
  assertNoObjectObject(`${format} output`, joined)
  return { prepared, joined, files, bodies }
}

describe('export serialization: prepare + Style Dictionary', () => {
  it('1. dimension px and rem direct values → CSS 16px / 1rem', async () => {
    const { prepared, joined } = await buildPlatformOutput('css', {
      spacing: {
        $type: 'dimension',
        md: { $value: { value: 16, unit: 'px' } },
        lg: { $value: { value: 1, unit: 'rem' } },
      },
    })
    assert.equal(prepared.document.spacing.md.$value, '16px')
    assert.equal(prepared.document.spacing.lg.$value, '1rem')
    assert.match(joined, /--spacing-md:\s*16px/)
    assert.match(joined, /--spacing-lg:\s*1rem/)
  })

  it('2. duration ms and s direct values → CSS 150ms / 0.3s', async () => {
    const { prepared, joined } = await buildPlatformOutput('css', {
      motion: {
        $type: 'duration',
        fast: { $value: { value: 150, unit: 'ms' } },
        slow: { $value: { value: 0.3, unit: 's' } },
      },
    })
    assert.equal(prepared.document.motion.fast.$value, '150ms')
    assert.equal(prepared.document.motion.slow.$value, '0.3s')
    assert.match(joined, /--motion-fast:\s*150ms/)
    assert.match(joined, /--motion-slow:\s*0\.3s/)
  })

  it('3. cubicBezier direct and aliased values', async () => {
    const { prepared, joined } = await buildPlatformOutput('css', {
      easing: {
        $type: 'cubicBezier',
        standard: { $value: [0.4, 0, 0.2, 1] },
        alias: { $value: '{easing.standard}' },
      },
    })
    assert.equal(
      prepared.document.easing.standard.$value,
      'cubic-bezier(0.4, 0, 0.2, 1)',
    )
    assert.equal(prepared.document.easing.alias.$value, '{easing.standard}')
    assert.match(joined, /--easing-standard:\s*cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
    assert.match(joined, /--easing-alias:\s*cubic-bezier\(0\.4, 0, 0\.2, 1\)/)
  })

  it('4. nested groups appear in CSS variable names', async () => {
    const { joined } = await buildPlatformOutput('css', {
      motion: {
        duration: {
          $type: 'duration',
          fast: { $value: { value: 150, unit: 'ms' } },
        },
      },
    })
    assert.match(joined, /--motion-duration-fast:\s*150ms/)
  })

  it('5. inherited $type is serialized for dimension and duration', async () => {
    const { prepared, joined } = await buildPlatformOutput('css', {
      spacing: {
        $type: 'dimension',
        scale: { md: { $value: { value: 8, unit: 'px' } } },
      },
      motion: {
        $type: 'duration',
        nested: { fast: { $value: { value: 100, unit: 'ms' } } },
      },
    })
    assert.equal(prepared.document.spacing.scale.md.$value, '8px')
    assert.equal(prepared.document.motion.nested.fast.$value, '100ms')
    assert.match(joined, /--spacing-scale-md:\s*8px/)
    assert.match(joined, /--motion-nested-fast:\s*100ms/)
  })

  it('6. aliases for every supported basic type resolve in CSS', async () => {
    const { joined } = await buildPlatformOutput('css', mixedSource, {
      remBasePx: 16,
    })
    assert.match(joined, /--colors-brand-primary:\s*#000000/)
    assert.match(joined, /--spacing-alias-md:\s*16px/)
    assert.match(joined, /--motion-duration-alias-fast:\s*150ms/)
    assert.match(
      joined,
      /--motion-easing-alias:\s*cubic-bezier\(0\.4, 0, 0\.2, 1\)/,
    )
    assert.match(joined, /--opacity-alias-full:\s*1/)
    assert.match(joined, /--fonts-alias-sans:\s*Inter,\s*sans-serif/)
    assert.match(joined, /--weights-alias-bold:\s*700/)
  })

  it('7. fontFamily string and string-array values', async () => {
    const { prepared, joined } = await buildPlatformOutput('css', {
      fonts: {
        $type: 'fontFamily',
        sans: { $value: ['Inter', 'sans-serif'] },
        mono: { $value: 'Roboto Mono' },
      },
    })
    assert.equal(prepared.document.fonts.sans.$value, 'Inter, sans-serif')
    assert.equal(prepared.document.fonts.mono.$value, '"Roboto Mono"')
    assert.match(joined, /--fonts-sans:\s*Inter,\s*sans-serif/)
    assert.match(joined, /--fonts-mono:\s*"Roboto Mono"/)
  })

  it('8. fontWeight numeric and keyword values', async () => {
    const { prepared, joined } = await buildPlatformOutput('css', {
      weights: {
        $type: 'fontWeight',
        bold: { $value: 700 },
        medium: { $value: 'medium' },
      },
    })
    assert.equal(prepared.document.weights.bold.$value, 700)
    assert.equal(prepared.document.weights.medium.$value, 500)
    assert.match(joined, /--weights-bold:\s*700/)
    assert.match(joined, /--weights-medium:\s*500/)
  })

  it('9. number values', async () => {
    const { prepared, joined } = await buildPlatformOutput('css', {
      opacity: {
        $type: 'number',
        full: { $value: 1 },
        muted: { $value: 0.85 },
      },
    })
    assert.equal(prepared.document.opacity.full.$value, 1)
    assert.equal(prepared.document.opacity.muted.$value, 0.85)
    assert.match(joined, /--opacity-full:\s*1/)
    assert.match(joined, /--opacity-muted:\s*0\.85/)
  })

  it('10. color values', async () => {
    const { prepared, joined } = await buildPlatformOutput('css', {
      colors: {
        $type: 'color',
        black: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
        alias: { $value: '{colors.black}' },
      },
    })
    assert.equal(prepared.document.colors.black.$value, '#000000')
    assert.match(joined, /--colors-black:\s*#000000/)
    assert.match(joined, /--colors-alias:\s*#000000/)
  })

  it('11. no generated CSS/Tailwind/Swift/Android contains [object Object]', async () => {
    const opts = { remBasePx: 16 }
    for (const format of ['css', 'tailwind', 'swift', 'android']) {
      await buildPlatformOutput(format, mixedSource, opts)
    }
  })

  it('12. canonical JSON still preserves structured DTCG values and aliases', () => {
    const result = exportCanonicalJson(mixedSource)
    assert.equal(result.ok, true)
    assert.deepEqual(result.document.spacing.md.$value, { value: 16, unit: 'px' })
    assert.deepEqual(result.document.spacing.lg.$value, { value: 1, unit: 'rem' })
    assert.equal(result.document.spacing.aliasMd.$value, '{spacing.md}')
    assert.deepEqual(result.document.motion.duration.fast.$value, {
      value: 150,
      unit: 'ms',
    })
    assert.deepEqual(result.document.motion.easing.standard.$value, [
      0.4, 0, 0.2, 1,
    ])
    assert.equal(result.document.motion.easing.alias.$value, '{motion.easing.standard}')
    assert.deepEqual(result.document.fonts.sans.$value, ['Inter', 'sans-serif'])
    assert.equal(result.document.weights.medium.$value, 'medium')
    assert.equal(result.document.opacity.aliasFull.$value, '{opacity.full}')
    assert.deepEqual(result.document.colors.brand.black.$value, {
      colorSpace: 'srgb',
      components: [0, 0, 0],
      hex: '#000000',
    })
    assert.equal(result.document.colors.brand.primary.$value, '{colors.brand.black}')

    // Platform prep must not mutate the canonical source fixture.
    const before = JSON.stringify(mixedSource)
    prepareCssExport(mixedSource)
    prepareAndroidExport(mixedSource, { remBasePx: 16 })
    prepareSwiftExport(mixedSource, { remBasePx: 16 })
    prepareTailwindExport(mixedSource)
    assert.equal(JSON.stringify(mixedSource), before)
  })
})

describe('export serialization: per-platform policies', () => {
  it('Android emits dimen strings (not objects) for px and rem', async () => {
    const { prepared, joined } = await buildPlatformOutput(
      'android',
      {
        spacing: {
          $type: 'dimension',
          sm: { $value: { value: 8, unit: 'px' } },
          md: { $value: { value: 1, unit: 'rem' } },
        },
      },
      { remBasePx: 16 },
    )
    assert.equal(prepared.document.spacing.sm.$value, '8px')
    assert.equal(prepared.document.spacing.md.$value, '16dp')
    assert.match(joined, />8px</)
    assert.match(joined, />16dp</)
  })

  it('Swift emits point numbers for dimensions and seconds for durations', async () => {
    const { prepared, joined } = await buildPlatformOutput(
      'swift',
      {
        spacing: {
          $type: 'dimension',
          md: { $value: { value: 16, unit: 'px' } },
          lg: { $value: { value: 1, unit: 'rem' } },
        },
        motion: {
          $type: 'duration',
          fast: { $value: { value: 150, unit: 'ms' } },
        },
        easing: {
          $type: 'cubicBezier',
          standard: { $value: [0.4, 0, 0.2, 1] },
        },
        fonts: {
          $type: 'fontFamily',
          sans: { $value: 'Inter' },
        },
      },
      { remBasePx: 16 },
    )
    assert.equal(prepared.document.spacing.md.$value, 16)
    assert.equal(prepared.document.spacing.lg.$value, 16)
    assert.equal(prepared.document.motion.fast.$value, 0.15)
    assert.equal(
      prepared.document.easing.standard.$value,
      '"cubic-bezier(0.4, 0, 0.2, 1)"',
    )
    assert.equal(prepared.document.fonts.sans.$value, '"Inter"')
    assert.match(joined, /spacingMd = 16/)
    assert.match(joined, /motionFast = 0\.15/)
    assert.match(joined, /easingStandard = "cubic-bezier\(0\.4, 0, 0\.2, 1\)"/)
    assert.match(joined, /fontsSans = "Inter"/)
    assert.equal(joined.includes('CGFloat(256'), false)
  })

  it('Tailwind module keeps CSS-like serialized primitives', async () => {
    const { prepared, joined } = await buildPlatformOutput('tailwind', {
      spacing: {
        $type: 'dimension',
        md: { $value: { value: 16, unit: 'px' } },
      },
      motion: {
        $type: 'duration',
        fast: { $value: { value: 150, unit: 'ms' } },
      },
    })
    assert.equal(prepared.document.spacing.md.$value, '16px')
    assert.equal(prepared.document.motion.fast.$value, '150ms')
    assert.match(joined, /"16px"/)
    assert.match(joined, /"150ms"/)
  })
})
