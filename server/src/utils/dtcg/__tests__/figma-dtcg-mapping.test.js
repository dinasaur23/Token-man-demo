/**
 * Figma → DTCG mapping unit + integration tests.
 * Run: node --test src/utils/dtcg/__tests__/figma-dtcg-mapping.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import {
  DIMENSIONAL_SCOPES,
  FIGMA_IMPORTABLE_DTCG_TYPES,
  SKIP_REASON,
  WARNING_CODE,
  classifyFigmaVariable,
  convertFigmaValueToDtcg,
  countImportedByType,
  figmaVariablesToDtcgDocument,
  formatImportReportSummary,
  validateFigmaImportDtcgValue,
  validateFigmaImportTokenTree,
} from '../../../../../shared/figma-dtcg-mapping/index.js'
import { isApplicationSupportedTokenType } from '../allowedTokenTypes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../../../')

describe('classifyFigmaVariable', () => {
  it('1. COLOR → color', () => {
    assert.deepEqual(classifyFigmaVariable({ resolvedType: 'COLOR', scopes: [] }), {
      status: 'supported',
      dtcgType: 'color',
      mappingReason: 'COLOR',
    })
  })

  it('2. STRING + FONT_FAMILY → fontFamily', () => {
    const r = classifyFigmaVariable({
      resolvedType: 'STRING',
      scopes: ['FONT_FAMILY'],
    })
    assert.equal(r.status, 'supported')
    assert.equal(r.dtcgType, 'fontFamily')
  })

  it('3. FLOAT + FONT_WEIGHT → fontWeight', () => {
    const r = classifyFigmaVariable({
      resolvedType: 'FLOAT',
      scopes: ['FONT_WEIGHT'],
    })
    assert.equal(r.dtcgType, 'fontWeight')
  })

  it('4. FLOAT + GAP → dimension', () => {
    const r = classifyFigmaVariable({ resolvedType: 'FLOAT', scopes: ['GAP'] })
    assert.equal(r.dtcgType, 'dimension')
    assert.equal(r.warning, WARNING_CODE.DIMENSION_NORMALIZED_TO_PX)
  })

  it('5. FLOAT + WIDTH_HEIGHT → dimension', () => {
    assert.equal(
      classifyFigmaVariable({
        resolvedType: 'FLOAT',
        scopes: ['WIDTH_HEIGHT'],
      }).dtcgType,
      'dimension',
    )
  })

  it('6. FLOAT + CORNER_RADIUS → dimension', () => {
    assert.equal(
      classifyFigmaVariable({
        resolvedType: 'FLOAT',
        scopes: ['CORNER_RADIUS'],
      }).dtcgType,
      'dimension',
    )
  })

  it('7. generic FLOAT → number', () => {
    assert.equal(
      classifyFigmaVariable({ resolvedType: 'FLOAT', scopes: ['ALL_SCOPES'] })
        .dtcgType,
      'number',
    )
  })

  it('8. FLOAT + OPACITY → number', () => {
    assert.equal(
      classifyFigmaVariable({ resolvedType: 'FLOAT', scopes: ['OPACITY'] })
        .dtcgType,
      'number',
    )
  })

  it('9. BOOLEAN → unsupported', () => {
    const r = classifyFigmaVariable({ resolvedType: 'BOOLEAN', scopes: [] })
    assert.equal(r.status, 'unsupported')
    assert.equal(r.mappingReason, SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING)
  })

  it('10. STRING without FONT_FAMILY → unsupported', () => {
    const r = classifyFigmaVariable({
      resolvedType: 'STRING',
      scopes: ['FONT_STYLE'],
      name: 'cubic-bezier(0.4, 0, 0.2, 1)',
    })
    assert.equal(r.status, 'unsupported')
  })

  it('11. duration-like variable name must NOT become duration', () => {
    const r = classifyFigmaVariable({
      resolvedType: 'FLOAT',
      scopes: ['ALL_SCOPES'],
      name: 'motion/duration/fast',
    })
    assert.equal(r.dtcgType, 'number')
    assert.notEqual(r.dtcgType, 'duration')
  })

  it('12. cubic-bezier-like string must NOT become cubicBezier', () => {
    const r = classifyFigmaVariable({
      resolvedType: 'STRING',
      scopes: ['TEXT_CONTENT'],
      name: 'easing/standard',
    })
    assert.equal(r.status, 'unsupported')
    assert.notEqual(r.dtcgType, 'cubicBezier')
  })

  it('13. FLOAT + FONT_WEIGHT does not become number', () => {
    assert.equal(
      classifyFigmaVariable({
        resolvedType: 'FLOAT',
        scopes: ['FONT_WEIGHT', 'ALL_SCOPES'],
      }).dtcgType,
      'fontWeight',
    )
  })

  it('14. dimensional FLOAT does not become number', () => {
    assert.equal(
      classifyFigmaVariable({
        resolvedType: 'FLOAT',
        scopes: ['GAP', 'OPACITY'],
      }).dtcgType,
      'dimension',
    )
  })

  it('15. TIMING → duration', () => {
    const r = classifyFigmaVariable({ resolvedType: 'TIMING', scopes: [] })
    assert.equal(r.status, 'supported')
    assert.equal(r.dtcgType, 'duration')
    assert.equal(r.mappingReason, 'TIMING')
  })

  it('16. EASING → cubicBezier (value conversion decides kind)', () => {
    const r = classifyFigmaVariable({ resolvedType: 'EASING', scopes: [] })
    assert.equal(r.status, 'supported')
    assert.equal(r.dtcgType, 'cubicBezier')
    assert.equal(r.mappingReason, 'EASING')
  })
})

describe('convertFigmaValueToDtcg', () => {
  it('17. color RGB/RGBA → valid canonical DTCG color', () => {
    const r = convertFigmaValueToDtcg(
      { resolvedType: 'COLOR', scopes: [] },
      { r: 1, g: 0, b: 0, a: 0.5 },
    )
    assert.equal(r.ok, true)
    assert.equal(r.value.colorSpace, 'srgb')
    assert.deepEqual(r.value.components, [1, 0, 0])
    assert.equal(r.value.alpha, 0.5)
    assert.ok(typeof r.value.hex === 'string')
    assert.equal(validateFigmaImportDtcgValue('color', r.value).ok, true)
  })

  it('18. dimension → { value, unit: "px" }', () => {
    const r = convertFigmaValueToDtcg(
      { resolvedType: 'FLOAT', scopes: ['GAP'] },
      16,
    )
    assert.deepEqual(r.value, { value: 16, unit: 'px' })
    assert.equal(r.warning, WARNING_CODE.DIMENSION_NORMALIZED_TO_PX)
  })

  it('19. fontWeight validates', () => {
    const r = convertFigmaValueToDtcg(
      { resolvedType: 'FLOAT', scopes: ['FONT_WEIGHT'] },
      700,
    )
    assert.equal(r.ok, true)
    assert.equal(r.value, 700)
    assert.equal(validateFigmaImportDtcgValue('fontWeight', 700).ok, true)
    assert.equal(validateFigmaImportDtcgValue('fontWeight', 0).ok, false)
  })

  it('20. fontFamily validates', () => {
    const r = convertFigmaValueToDtcg(
      { resolvedType: 'STRING', scopes: ['FONT_FAMILY'] },
      'Inter',
    )
    assert.equal(r.ok, true)
    assert.equal(r.value, 'Inter')
    assert.equal(
      convertFigmaValueToDtcg(
        { resolvedType: 'STRING', scopes: ['FONT_FAMILY'] },
        123,
      ).ok,
      false,
    )
  })

  it('21. number validates', () => {
    const r = convertFigmaValueToDtcg(
      { resolvedType: 'FLOAT', scopes: ['OPACITY'] },
      0.4,
    )
    assert.equal(r.ok, true)
    assert.equal(r.value, 0.4)
  })

  it('22. TIMING 0.25 → duration { value: 0.25, unit: "s" }', () => {
    const r = convertFigmaValueToDtcg(
      { resolvedType: 'TIMING', scopes: [] },
      0.25,
    )
    assert.equal(r.ok, true)
    assert.deepEqual(r.value, { value: 0.25, unit: 's' })
    assert.equal(validateFigmaImportDtcgValue('duration', r.value).ok, true)
  })

  it('23. malformed TIMING is rejected', () => {
    const r = convertFigmaValueToDtcg(
      { resolvedType: 'TIMING', scopes: [] },
      '0.25s',
    )
    assert.equal(r.ok, false)
    assert.equal(r.reason, SKIP_REASON.INVALID_VALUE)
  })

  it('24. CUSTOM_CUBIC_BEZIER → [x1,y1,x2,y2]', () => {
    const r = convertFigmaValueToDtcg(
      { resolvedType: 'EASING', scopes: [] },
      {
        type: 'CUSTOM_CUBIC_BEZIER',
        easingFunctionCubicBezier: { x1: 0.4, y1: 0, x2: 0.2, y2: 1 },
      },
    )
    assert.equal(r.ok, true)
    assert.deepEqual(r.value, [0.4, 0, 0.2, 1])
    assert.equal(validateFigmaImportDtcgValue('cubicBezier', r.value).ok, true)
  })

  it('25. preset easing without control points → explicit skip', () => {
    for (const type of [
      'EASE_IN',
      'EASE_OUT',
      'EASE_IN_AND_OUT',
      'LINEAR',
      'EASE_IN_BACK',
      'EASE_OUT_BACK',
      'EASE_IN_AND_OUT_BACK',
    ]) {
      const r = convertFigmaValueToDtcg(
        { resolvedType: 'EASING', scopes: [] },
        { type },
      )
      assert.equal(r.ok, false, type)
      assert.equal(r.reason, SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING, type)
      assert.match(r.message, /does not expose cubic-bezier control points/, type)
      assert.match(r.message, new RegExp(`'${type}'`), type)
    }
  })

  it('26. spring easing → explicit skip', () => {
    for (const type of ['GENTLE', 'QUICK', 'BOUNCY', 'SLOW', 'CUSTOM_SPRING']) {
      const raw =
        type === 'CUSTOM_SPRING'
          ? { type, easingFunctionSpring: { bounce: 0.3 } }
          : { type }
      const r = convertFigmaValueToDtcg(
        { resolvedType: 'EASING', scopes: [] },
        raw,
      )
      assert.equal(r.ok, false, type)
      assert.equal(r.reason, SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING, type)
      assert.match(r.message, /does not expose cubic-bezier control points/, type)
    }
  })

  it('27. HOLD → explicit skip', () => {
    const r = convertFigmaValueToDtcg(
      { resolvedType: 'EASING', scopes: [] },
      { type: 'HOLD' },
    )
    assert.equal(r.ok, false)
    assert.equal(r.reason, SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING)
    assert.match(r.message, /'HOLD'/)
  })

  it('28. cubicBezier rejects out-of-range P1x/P2x', () => {
    const r = convertFigmaValueToDtcg(
      { resolvedType: 'EASING', scopes: [] },
      {
        type: 'CUSTOM_CUBIC_BEZIER',
        easingFunctionCubicBezier: { x1: 1.5, y1: 0, x2: 0.2, y2: 1 },
      },
    )
    assert.equal(r.ok, false)
    assert.equal(r.reason, SKIP_REASON.INVALID_VALUE)
  })

  it('29. preset with explicit bezier points maps (no inventing)', () => {
    const r = convertFigmaValueToDtcg(
      { resolvedType: 'EASING', scopes: [] },
      {
        type: 'EASE_OUT',
        easingFunctionCubicBezier: { x1: 0, y1: 0, x2: 0.58, y2: 1 },
      },
    )
    assert.equal(r.ok, true)
    assert.deepEqual(r.value, [0, 0, 0.58, 1])
  })
})

describe('figmaVariablesToDtcgDocument integration', () => {
  const modeLight = 'm-light'
  const modeDark = 'm-dark'

  function mixedFixture() {
    const collections = [
      {
        id: 'col1',
        name: 'Primitives',
        modes: [{ modeId: modeLight, name: 'Light' }],
        variableIds: [
          'v-color',
          'v-gap',
          'v-radius',
          'v-opacity',
          'v-ratio',
          'v-family',
          'v-weight',
          'v-bool',
          'v-string',
          'v-alias',
          'v-duration-name',
        ],
      },
      {
        id: 'col2',
        name: 'Semantic',
        modes: [
          { modeId: modeLight, name: 'Light' },
          { modeId: modeDark, name: 'Dark' },
        ],
        variableIds: ['v-semantic-bg'],
      },
    ]

    const variables = [
      {
        id: 'v-color',
        name: 'brand/primary',
        resolvedType: 'COLOR',
        scopes: ['ALL_SCOPES'],
        variableCollectionId: 'col1',
        valuesByMode: {
          [modeLight]: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
        },
      },
      {
        id: 'v-gap',
        name: 'spacing/md',
        resolvedType: 'FLOAT',
        scopes: ['GAP'],
        variableCollectionId: 'col1',
        valuesByMode: { [modeLight]: 16 },
      },
      {
        id: 'v-radius',
        name: 'radius/md',
        resolvedType: 'FLOAT',
        scopes: ['CORNER_RADIUS'],
        variableCollectionId: 'col1',
        valuesByMode: { [modeLight]: 8 },
      },
      {
        id: 'v-opacity',
        name: 'opacity/disabled',
        resolvedType: 'FLOAT',
        scopes: ['OPACITY'],
        variableCollectionId: 'col1',
        valuesByMode: { [modeLight]: 0.4 },
      },
      {
        id: 'v-ratio',
        name: 'generic/ratio',
        resolvedType: 'FLOAT',
        scopes: ['ALL_SCOPES'],
        variableCollectionId: 'col1',
        valuesByMode: { [modeLight]: 1.5 },
      },
      {
        id: 'v-family',
        name: 'typography/family/body',
        resolvedType: 'STRING',
        scopes: ['FONT_FAMILY'],
        variableCollectionId: 'col1',
        valuesByMode: { [modeLight]: 'Inter' },
      },
      {
        id: 'v-weight',
        name: 'typography/weight/bold',
        resolvedType: 'FLOAT',
        scopes: ['FONT_WEIGHT'],
        variableCollectionId: 'col1',
        valuesByMode: { [modeLight]: 700 },
      },
      {
        id: 'v-bool',
        name: 'unsupported/enabled',
        resolvedType: 'BOOLEAN',
        scopes: [],
        variableCollectionId: 'col1',
        valuesByMode: { [modeLight]: true },
      },
      {
        id: 'v-string',
        name: 'unsupported/string-example',
        resolvedType: 'STRING',
        scopes: ['TEXT_CONTENT'],
        variableCollectionId: 'col1',
        valuesByMode: { [modeLight]: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      },
      {
        id: 'v-duration-name',
        name: 'motion/duration/fast',
        resolvedType: 'FLOAT',
        scopes: ['ALL_SCOPES'],
        variableCollectionId: 'col1',
        valuesByMode: { [modeLight]: 150 },
      },
      {
        id: 'v-alias',
        name: 'alias/primary',
        resolvedType: 'COLOR',
        scopes: ['ALL_FILLS'],
        variableCollectionId: 'col1',
        valuesByMode: {
          [modeLight]: { type: 'VARIABLE_ALIAS', id: 'v-color' },
        },
      },
      {
        id: 'v-semantic-bg',
        name: 'background',
        resolvedType: 'COLOR',
        scopes: ['FRAME_FILL'],
        variableCollectionId: 'col2',
        valuesByMode: {
          [modeLight]: { r: 1, g: 1, b: 1, a: 1 },
          [modeDark]: { r: 0, g: 0, b: 0, a: 1 },
        },
      },
    ]

    return figmaVariablesToDtcgDocument(collections, variables)
  }

  it('20. mixed collection imports mapped types', () => {
    const { tokens, importReport } = mixedFixture()
    const counts = countImportedByType(importReport)
    assert.equal(counts.color, 3) // primary + alias + semantic bg
    assert.equal(counts.dimension, 2)
    assert.equal(counts.number, 3) // opacity + ratio + duration-name-as-number
    assert.equal(counts.fontFamily, 1)
    assert.equal(counts.fontWeight, 1)

    assert.equal(tokens.primitives.brand.primary.$type, 'color')
    assert.deepEqual(tokens.primitives.spacing.md.$value, {
      value: 16,
      unit: 'px',
    })
    assert.equal(tokens.primitives.opacity.disabled.$type, 'number')
    assert.equal(tokens.primitives.typography.family.body.$value, 'Inter')
    assert.equal(tokens.primitives.typography.weight.bold.$value, 700)
  })

  it('21. generated document passes value-shape validation', () => {
    const { tokens } = mixedFixture()
    const result = validateFigmaImportTokenTree(tokens)
    assert.equal(result.ok, true)
  })

  it('22. boolean/string unsupported variables do not enter source', () => {
    const { tokens, importReport } = mixedFixture()
    assert.equal(tokens.primitives.unsupported, undefined)
    const skippedReasons = importReport.skipped.map((s) => s.reason)
    assert.ok(
      skippedReasons.includes(SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING),
    )
    const json = JSON.stringify(tokens)
    assert.equal(json.includes('"boolean"'), false)
    assert.equal(json.includes('"$type":"string"'), false)
  })

  it('23. color import still produces srgb objects', () => {
    const { tokens } = mixedFixture()
    assert.equal(tokens.primitives.brand.primary.$value.colorSpace, 'srgb')
  })

  it('24. aliases preserve path refs', () => {
    const { tokens } = mixedFixture()
    assert.equal(
      tokens.primitives.alias.primary.$value,
      '{primitives.brand.primary}',
    )
  })

  it('25. multiple modes preserve valuesByMode and warn', () => {
    const { tokens, importReport, modifiers } = mixedFixture()
    const bg = tokens.semantic.background
    assert.ok(bg.$extensions.figma.valuesByMode.light)
    assert.ok(bg.$extensions.figma.valuesByMode.dark)
    assert.equal(bg.$extensions.figma.defaultMode, 'light')
    assert.ok(modifiers.mode)
    assert.ok(
      importReport.warnings.some(
        (w) => w.code === WARNING_CODE.MULTI_MODE_COLLECTION,
      ),
    )
    assert.ok(
      importReport.warnings.some(
        (w) => w.code === WARNING_CODE.CLIENT_MODE_SWITCH_LIMITATION,
      ),
    )
  })

  it('26. import report counts supported/skipped/warnings', () => {
    const { importReport } = mixedFixture()
    assert.ok(importReport.imported.length >= 10)
    assert.ok(importReport.skipped.length >= 2)
    assert.ok(importReport.warnings.length >= 2)
    const summary = formatImportReportSummary(importReport)
    assert.ok(summary.includes('Imported from Figma:'))
    assert.ok(summary.includes('Skipped:'))
    assert.ok(summary.includes('Warnings:'))
  })

  it('duration-named FLOAT is number, not duration', () => {
    const { tokens } = mixedFixture()
    assert.equal(tokens.primitives.motion.duration.fast.$type, 'number')
    assert.equal(tokens.primitives.motion.duration.fast.$value, 150)
  })

  it('all emitted $types are application-supported and importable', () => {
    const { tokens } = mixedFixture()
    function walk(node) {
      if (!node || typeof node !== 'object') return
      if (node.$type && node.$value !== undefined) {
        assert.equal(isApplicationSupportedTokenType(node.$type), true)
        assert.ok(FIGMA_IMPORTABLE_DTCG_TYPES.includes(node.$type))
        return
      }
      for (const k of Object.keys(node)) {
        if (!k.startsWith('$')) walk(node[k])
      }
    }
    walk(tokens)
  })

  it('rejects invalid fontWeight before emit', () => {
    const result = figmaVariablesToDtcgDocument(
      [
        {
          id: 'c',
          name: 'C',
          modes: [{ modeId: 'm', name: 'Default' }],
          variableIds: ['w'],
        },
      ],
      [
        {
          id: 'w',
          name: 'weight/bad',
          resolvedType: 'FLOAT',
          scopes: ['FONT_WEIGHT'],
          variableCollectionId: 'c',
          valuesByMode: { m: 0 },
        },
      ],
    )
    assert.equal(result.importReport.imported.length, 0)
    assert.equal(result.importReport.skipped[0].reason, SKIP_REASON.INVALID_VALUE)
  })
})

describe('TIMING / EASING document mapping', () => {
  const mode = 'm1'

  it('TIMING + CUSTOM_CUBIC_BEZIER import with aliases; presets/springs skipped', () => {
    const { tokens, importReport } = figmaVariablesToDtcgDocument(
      [
        {
          id: 'c1',
          name: 'Collection 1',
          modes: [{ modeId: mode, name: 'Default' }],
          variableIds: [
            'v-timing',
            'v-timing-alias',
            'v-ease-custom',
            'v-ease-alias',
            'v-ease-out',
            'v-spring',
            'v-hold',
          ],
        },
      ],
      [
        {
          id: 'v-timing',
          name: 'motion/duration/fast',
          resolvedType: 'TIMING',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 0.25 },
        },
        {
          id: 'v-timing-alias',
          name: 'motion/duration/fast-ref',
          resolvedType: 'TIMING',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: {
            [mode]: { type: 'VARIABLE_ALIAS', id: 'v-timing' },
          },
        },
        {
          id: 'v-ease-custom',
          name: 'motion/easing/custom',
          resolvedType: 'EASING',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: {
            [mode]: {
              type: 'CUSTOM_CUBIC_BEZIER',
              easingFunctionCubicBezier: { x1: 0.4, y1: 0, x2: 0.2, y2: 1 },
            },
          },
        },
        {
          id: 'v-ease-alias',
          name: 'motion/easing/custom-ref',
          resolvedType: 'EASING',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: {
            [mode]: { type: 'VARIABLE_ALIAS', id: 'v-ease-custom' },
          },
        },
        {
          id: 'v-ease-out',
          name: 'motion/easing/ease-out',
          resolvedType: 'EASING',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: { type: 'EASE_OUT' } },
        },
        {
          id: 'v-spring',
          name: 'motion/easing/spring',
          resolvedType: 'EASING',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: {
            [mode]: {
              type: 'CUSTOM_SPRING',
              easingFunctionSpring: { bounce: 0.2 },
            },
          },
        },
        {
          id: 'v-hold',
          name: 'motion/easing/hold',
          resolvedType: 'EASING',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: { type: 'HOLD' } },
        },
      ],
    )

    assert.deepEqual(tokens['collection-1'].motion.duration.fast.$value, {
      value: 0.25,
      unit: 's',
    })
    assert.equal(tokens['collection-1'].motion.duration.fast.$type, 'duration')
    assert.equal(
      tokens['collection-1'].motion.duration['fast-ref'].$value,
      '{collection-1.motion.duration.fast}',
    )
    assert.deepEqual(tokens['collection-1'].motion.easing.custom.$value, [
      0.4, 0, 0.2, 1,
    ])
    assert.equal(
      tokens['collection-1'].motion.easing.custom.$type,
      'cubicBezier',
    )
    assert.equal(
      tokens['collection-1'].motion.easing['custom-ref'].$value,
      '{collection-1.motion.easing.custom}',
    )

    const counts = countImportedByType(importReport)
    assert.equal(counts.duration, 2)
    assert.equal(counts.cubicBezier, 2)

    const skippedTypes = importReport.skipped.map((s) => s.path)
    assert.ok(skippedTypes.some((p) => p.includes('ease-out')))
    assert.ok(skippedTypes.some((p) => p.includes('spring')))
    assert.ok(skippedTypes.some((p) => p.includes('hold')))
    assert.ok(
      importReport.skipped.every(
        (s) =>
          s.reason === SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING &&
          /cubic-bezier control points/.test(s.detail),
      ),
    )
    assert.equal(importReport.skipped.length, 3)

    const treeCheck = validateFigmaImportTokenTree(tokens)
    assert.equal(treeCheck.ok, true)
  })

  it('complete payload with all 7 DTCG basic types', () => {
    const { tokens, importReport } = figmaVariablesToDtcgDocument(
      [
        {
          id: 'c1',
          name: 'All',
          modes: [{ modeId: mode, name: 'Default' }],
          variableIds: [
            'color',
            'dim',
            'num',
            'family',
            'weight',
            'timing',
            'easing',
          ],
        },
      ],
      [
        {
          id: 'color',
          name: 'brand/primary',
          resolvedType: 'COLOR',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: { r: 1, g: 0, b: 0, a: 1 } },
        },
        {
          id: 'dim',
          name: 'space/md',
          resolvedType: 'FLOAT',
          scopes: ['GAP'],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 16 },
        },
        {
          id: 'num',
          name: 'opacity/muted',
          resolvedType: 'FLOAT',
          scopes: ['OPACITY'],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 0.5 },
        },
        {
          id: 'family',
          name: 'type/family',
          resolvedType: 'STRING',
          scopes: ['FONT_FAMILY'],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 'Inter' },
        },
        {
          id: 'weight',
          name: 'type/weight',
          resolvedType: 'FLOAT',
          scopes: ['FONT_WEIGHT'],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 600 },
        },
        {
          id: 'timing',
          name: 'motion/fast',
          resolvedType: 'TIMING',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 0.25 },
        },
        {
          id: 'easing',
          name: 'motion/curve',
          resolvedType: 'EASING',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: {
            [mode]: {
              type: 'CUSTOM_CUBIC_BEZIER',
              easingFunctionCubicBezier: { x1: 0.4, y1: 0, x2: 0.2, y2: 1 },
            },
          },
        },
      ],
    )

    const counts = countImportedByType(importReport)
    assert.deepEqual(counts, {
      color: 1,
      dimension: 1,
      number: 1,
      fontFamily: 1,
      fontWeight: 1,
      duration: 1,
      cubicBezier: 1,
    })
    const summary = formatImportReportSummary(importReport)
    assert.match(summary, /1 Duration/)
    assert.match(summary, /1 Cubic Bézier/)
    assert.equal(importReport.skipped.length, 0)
    assert.equal(validateFigmaImportTokenTree(tokens).ok, true)
    for (const t of FIGMA_IMPORTABLE_DTCG_TYPES) {
      assert.equal(isApplicationSupportedTokenType(t), true)
    }
  })
})

describe('plugin embed contract', () => {
  it('plugin generated block matches shared source hash', () => {
    const shared = readFileSync(
      join(root, 'shared/figma-dtcg-mapping/index.js'),
      'utf8',
    )
    const plugin = readFileSync(join(root, 'figma-token-plugin/code.js'), 'utf8')
    const hash = createHash('sha256').update(shared).digest('hex').slice(0, 16)
    assert.ok(
      plugin.includes(`sha256:${hash}`),
      'plugin missing current shared mapping hash — run node scripts/embed-figma-dtcg-mapping.js',
    )
    assert.ok(plugin.includes('function classifyFigmaVariable'))
    assert.ok(plugin.includes('DIMENSIONAL_SCOPES'))
    for (const scope of DIMENSIONAL_SCOPES) {
      assert.ok(plugin.includes(`'${scope}'`), `missing scope ${scope}`)
    }
  })

  it('plugin does not contain dormant string/boolean DTCG type maps', () => {
    const plugin = readFileSync(join(root, 'figma-token-plugin/code.js'), 'utf8')
    assert.equal(plugin.includes('if (t === "STRING") return "string"'), false)
    assert.equal(plugin.includes('if (t === "BOOLEAN") return "boolean"'), false)
  })
})
