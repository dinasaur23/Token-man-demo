/**
 * Platform-export SD pipeline regressions for DTCG 2025.10 basic types.
 * Run: node --test src/utils/sd/__tests__/platform-export-serialization.test.js
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import StyleDictionary from 'style-dictionary'
import {
  exportCanonicalJson,
  prepareAndroidExport,
  prepareCssExport,
  prepareSwiftExport,
  prepareTailwindExport,
} from '../../dtcg/exporters/index.js'
import { buildPlatformWithDtcgGuards } from '../buildPlatformWithDtcgGuards.js'
import { createSdConfig } from '../index.js'
import { assertNoRawObjectExportValues } from '../exportGuard.js'

const FIXTURE = {
  $schema: 'https://schemas.designtokens.org/drafts/format/2025.10/format.json',
  spacing: {
    $type: 'dimension',
    xs: { $value: { value: 4, unit: 'px' } },
    sm: { $value: { value: 8, unit: 'px' } },
    remMd: { $value: { value: 1, unit: 'rem' } },
    aliasSm: { $value: '{spacing.sm}' },
  },
  nested: {
    layout: {
      $type: 'dimension',
      gap: { $value: { value: 12, unit: 'px' } },
      aliasGap: { $value: '{nested.layout.gap}' },
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
  colors: {
    $type: 'color',
    black: {
      $value: {
        colorSpace: 'srgb',
        components: [0, 0, 0],
        hex: '#000000',
      },
    },
    aliasBlack: { $value: '{colors.black}' },
  },
  font: {
    family: {
      $type: 'fontFamily',
      sans: { $value: ['Source Sans 3', 'system-ui', 'sans-serif'] },
      mono: { $value: 'Roboto Mono' },
      aliasSans: { $value: '{font.family.sans}' },
    },
    weight: {
      $type: 'fontWeight',
      bold: { $value: 700 },
      medium: { $value: 'medium' },
      aliasBold: { $value: '{font.weight.bold}' },
    },
  },
  scale: {
    $type: 'number',
    ratio: { $value: 1.25 },
    aliasRatio: { $value: '{scale.ratio}' },
  },
}

function tmpDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tm-sd-${label}-`))
}

async function buildFormat(format, document, options = {}) {
  const dir = tmpDir(format)
  const jsonPath = path.join(dir, 'tokens.json')
  fs.writeFileSync(jsonPath, JSON.stringify(document, null, 2))
  const sdConfig = createSdConfig(format, jsonPath, path.join(dir, 'build'))
  if (options.basePxFontSize && sdConfig.platforms.ios) {
    sdConfig.platforms.ios.basePxFontSize = options.basePxFontSize
  }
  const result = await buildPlatformWithDtcgGuards({ format, sdConfig })
  const cssLikePath = result.outputFilePaths?.find((p) => /\.(css|scss|js|xml|swift)$/.test(p))
  const output = cssLikePath && fs.existsSync(cssLikePath) ? fs.readFileSync(cssLikePath, 'utf8') : ''
  return { ...result, dir, output, outputPath: cssLikePath }
}

describe('Style Dictionary installed version', () => {
  it('is 5.5.0 (lockfile-aligned)', async () => {
    const pkgPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '../../../../node_modules/style-dictionary/package.json',
    )
    const version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
    assert.equal(version, '5.5.0')
  })
})

describe('CSS SD pipeline: seven basic types', () => {
  it('serializes raw DTCG objects (no prep) without [object Object]', async () => {
    const { ok, output, errors } = await buildFormat('css', FIXTURE)
    assert.equal(ok, true, errors.map((e) => e.message).join('; '))
    assert.doesNotMatch(output, /\[object Object\]/)
    assert.match(output, /--spacing-xs:\s*4px;/)
    assert.match(output, /--spacing-sm:\s*8px;/)
    assert.match(output, /--spacing-rem-md:\s*1rem;/)
    assert.match(output, /--spacing-alias-sm:\s*8px;/)
    assert.match(output, /--nested-layout-gap:\s*12px;/)
    assert.match(output, /--motion-duration-fast:\s*150ms;/)
    assert.match(output, /--motion-duration-slow:\s*0\.3s;/)
    assert.match(output, /--motion-duration-alias-fast:\s*150ms;/)
    assert.match(output, /--motion-easing-standard:\s*cubic-bezier\(0\.4, 0, 0\.2, 1\);/)
    assert.match(output, /--motion-easing-alias:\s*cubic-bezier\(0\.4, 0, 0\.2, 1\);/)
    assert.match(output, /--colors-black:\s*#000000;/i)
    assert.match(output, /--font-family-sans:.*"Source Sans 3".*sans-serif;/)
    assert.match(output, /--font-family-mono:.*"Roboto Mono";/)
    assert.match(output, /--font-weight-bold:\s*700;/)
    assert.match(output, /--font-weight-medium:\s*medium;/)
    assert.match(output, /--scale-ratio:\s*1\.25;/)
  })

  it('serializes prepared CSS export the same way', async () => {
    const prepared = prepareCssExport(FIXTURE)
    assert.equal(prepared.ok, true)
    const { ok, output, allTokens } = await buildFormat('css', prepared.document)
    assert.equal(ok, true)
    assert.doesNotMatch(output, /\[object Object\]/)
    for (const token of allTokens) {
      const v = token.$value ?? token.value
      assert.notEqual(typeof v, 'object')
    }
  })

  it('preserves canonical JSON structured values and aliases', () => {
    const canonical = exportCanonicalJson(FIXTURE)
    assert.equal(canonical.ok, true)
    const parsed = JSON.parse(canonical.json)
    assert.deepEqual(parsed.spacing.sm.$value, { value: 8, unit: 'px' })
    assert.equal(parsed.spacing.aliasSm.$value, '{spacing.sm}')
    assert.deepEqual(parsed.motion.duration.fast.$value, { value: 150, unit: 'ms' })
    assert.deepEqual(parsed.motion.easing.standard.$value, [0.4, 0, 0.2, 1])
    assert.equal(parsed.font.family.mono.$value, 'Roboto Mono')
    assert.deepEqual(parsed.font.family.sans.$value, ['Source Sans 3', 'system-ui', 'sans-serif'])
    assert.equal(parsed.font.weight.medium.$value, 'medium')
    assert.equal(parsed.scale.ratio.$value, 1.25)
  })
})

describe('SCSS SD pipeline', () => {
  it('emits valid scss variables without [object Object]', async () => {
    const { ok, output, errors } = await buildFormat('scss', FIXTURE)
    assert.equal(ok, true, errors.map((e) => e.message).join('; '))
    assert.doesNotMatch(output, /\[object Object\]/)
    assert.match(output, /\$spacing-sm:\s*8px;/)
    assert.match(output, /\$motion-duration-fast:\s*150ms;/)
  })
})

describe('Tailwind / Android / Swift exporters', () => {
  it('tailwind emits serialized values or structured success', async () => {
    const prepared = prepareTailwindExport(FIXTURE)
    assert.equal(prepared.ok, true)
    const { ok, output, errors } = await buildFormat('tailwind', prepared.document)
    assert.equal(ok, true, errors.map((e) => e.message).join('; '))
    assert.doesNotMatch(output, /\[object Object\]/)
    assert.match(output, /8px/)
    assert.match(output, /150ms/)
  })

  it('android emits dimen/string values without object fallthrough', async () => {
    const prepared = prepareAndroidExport(FIXTURE, { remBasePx: 16 })
    assert.equal(prepared.ok, true)
    const { ok, output, errors } = await buildFormat('android', prepared.document)
    assert.equal(ok, true, errors.map((e) => e.message).join('; '))
    assert.doesNotMatch(output, /\[object Object\]/)
    assert.match(output, /8dp|8\.00dp|8px/)
    assert.match(output, /150ms/)
  })

  it('swift emits CGFloat / literals without object fallthrough', async () => {
    const prepared = prepareSwiftExport(FIXTURE)
    assert.equal(prepared.ok, true)
    const { ok, output, errors } = await buildFormat('swift', prepared.document)
    assert.equal(ok, true, errors.map((e) => e.message).join('; '))
    assert.doesNotMatch(output, /\[object Object\]/)
    assert.match(output, /CGFloat\(8\)/)
    assert.match(output, /"150ms"/)
    assert.match(output, /"cubic-bezier\(0\.4, 0, 0\.2, 1\)"/)
  })
})

describe('export guard', () => {
  it('fails when a transformed token value is still an object', () => {
    const guard = assertNoRawObjectExportValues({
      format: 'css',
      allTokens: [
        {
          name: 'spacing-sm',
          path: ['spacing', 'sm'],
          $type: 'dimension',
          $value: { value: 8, unit: 'px' },
        },
      ],
      outputFilePaths: [],
    })
    assert.equal(guard.ok, false)
    assert.equal(guard.errors[0].code, 'EXPORT_RAW_OBJECT_VALUE')
  })

  it('fails when generated CSS contains [object Object]', () => {
    const dir = tmpDir('guard')
    const file = path.join(dir, 'bad.css')
    fs.writeFileSync(file, ':root { --x: [object Object]; }\n')
    const guard = assertNoRawObjectExportValues({
      format: 'css',
      allTokens: [],
      outputFilePaths: [file],
    })
    assert.equal(guard.ok, false)
    assert.equal(guard.errors[0].code, 'EXPORT_OBJECT_STRINGIFIED')
  })
})

describe('aliases for all seven basic types', () => {
  it('resolves aliases through SD for each type', async () => {
    const { ok, output } = await buildFormat('css', FIXTURE)
    assert.equal(ok, true)
    assert.match(output, /--spacing-alias-sm:\s*8px;/)
    assert.match(output, /--motion-duration-alias-fast:\s*150ms;/)
    assert.match(output, /--motion-easing-alias:\s*cubic-bezier/)
    assert.match(output, /--colors-alias-black:\s*#000000;/i)
    assert.match(output, /--font-family-alias-sans:/)
    assert.match(output, /--font-weight-alias-bold:\s*700;/)
    assert.match(output, /--scale-alias-ratio:\s*1\.25;/)
  })
})

describe('native SD without adapters still breaks duration (characterization)', () => {
  it('documents why custom duration transforms are required on 5.5.0', async () => {
    const dir = tmpDir('native')
    const jsonPath = path.join(dir, 'tokens.json')
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        motion: {
          $type: 'duration',
          fast: { $value: { value: 150, unit: 'ms' } },
        },
      }),
    )
    const sd = new StyleDictionary({
      source: [jsonPath],
      platforms: {
        css: {
          transformGroup: 'css',
          buildPath: path.join(dir, 'css/'),
          files: [{ destination: 't.css', format: 'css/variables' }],
        },
      },
    })
    await sd.buildAllPlatforms()
    const out = fs.readFileSync(path.join(dir, 'css/t.css'), 'utf8')
    assert.match(out, /\[object Object\]/)
  })
})
