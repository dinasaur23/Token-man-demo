/**
 * Client-side: Figma-mapped DTCG documents must pass validateTokensStrict
 * and must not invent duration/cubicBezier from Figma-like names.
 */
import { describe, expect, it } from 'vitest'
import {
  countImportedByType,
  figmaVariablesToDtcgDocument,
} from '../../../../../shared/figma-dtcg-mapping/index.js'
import { validateTokensStrict } from '../dtcg-validator'

describe('Figma import → client strict validation', () => {
  it('mixed Figma mapping passes validateTokensStrict', async () => {
    const mode = 'm1'
    const { tokens, importReport } = figmaVariablesToDtcgDocument(
      [
        {
          id: 'c1',
          name: 'Primitives',
          modes: [{ modeId: mode, name: 'Default' }],
          variableIds: [
            'color',
            'gap',
            'num',
            'family',
            'weight',
            'bool',
            'str',
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
          valuesByMode: { [mode]: { r: 0.2, g: 0.4, b: 0.6, a: 1 } },
        },
        {
          id: 'gap',
          name: 'spacing/md',
          resolvedType: 'FLOAT',
          scopes: ['GAP'],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 16 },
        },
        {
          id: 'num',
          name: 'opacity/disabled',
          resolvedType: 'FLOAT',
          scopes: ['OPACITY'],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 0.5 },
        },
        {
          id: 'family',
          name: 'typography/family/body',
          resolvedType: 'STRING',
          scopes: ['FONT_FAMILY'],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 'Inter' },
        },
        {
          id: 'weight',
          name: 'typography/weight/bold',
          resolvedType: 'FLOAT',
          scopes: ['FONT_WEIGHT'],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 700 },
        },
        {
          id: 'bool',
          name: 'flags/enabled',
          resolvedType: 'BOOLEAN',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: true },
        },
        {
          id: 'str',
          name: 'misc/label',
          resolvedType: 'STRING',
          scopes: ['TEXT_CONTENT'],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 'hello' },
        },
      ],
    )

    const counts = countImportedByType(importReport)
    expect(counts).toEqual({
      color: 1,
      dimension: 1,
      number: 1,
      fontFamily: 1,
      fontWeight: 1,
    })
    expect(importReport.skipped.length).toBe(2)

    const validation = await validateTokensStrict(tokens)
    expect(validation).toEqual({ ok: true })
  })

  it('does not create duration or cubicBezier from Figma-like names', async () => {
    const mode = 'm1'
    const { tokens } = figmaVariablesToDtcgDocument(
      [
        {
          id: 'c1',
          name: 'Motion',
          modes: [{ modeId: mode, name: 'Default' }],
          variableIds: ['dur', 'ease'],
        },
      ],
      [
        {
          id: 'dur',
          name: 'duration/fast',
          resolvedType: 'FLOAT',
          scopes: ['ALL_SCOPES'],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 150 },
        },
        {
          id: 'ease',
          name: 'easing/standard',
          resolvedType: 'STRING',
          scopes: ['TEXT_CONTENT'],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 'cubic-bezier(0.4, 0, 0.2, 1)' },
        },
      ],
    )

    const motion = tokens.motion as {
      duration: { fast: { $type: string; $value: unknown } }
      easing?: unknown
    }
    expect(motion.duration.fast.$type).toBe('number')
    expect(motion.easing).toBeUndefined()
    expect(await validateTokensStrict(tokens)).toEqual({ ok: true })
  })

  it('TIMING and CUSTOM_CUBIC_BEZIER pass validateTokensStrict', async () => {
    const mode = 'm1'
    const { tokens, importReport } = figmaVariablesToDtcgDocument(
      [
        {
          id: 'c1',
          name: 'Motion',
          modes: [{ modeId: mode, name: 'Default' }],
          variableIds: ['timing', 'easing', 'preset'],
        },
      ],
      [
        {
          id: 'timing',
          name: 'duration/fast',
          resolvedType: 'TIMING',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: 0.25 },
        },
        {
          id: 'easing',
          name: 'easing/custom',
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
          id: 'preset',
          name: 'easing/ease-out',
          resolvedType: 'EASING',
          scopes: [],
          variableCollectionId: 'c1',
          valuesByMode: { [mode]: { type: 'EASE_OUT' } },
        },
      ],
    )

    expect(countImportedByType(importReport)).toEqual({
      duration: 1,
      cubicBezier: 1,
    })
    expect(importReport.skipped).toHaveLength(1)
    expect(await validateTokensStrict(tokens)).toEqual({ ok: true })
  })
})
