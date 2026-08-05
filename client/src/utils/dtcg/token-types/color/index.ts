import {
  hexToDtcgColorValue,
  COMPAT_HEX_STRING_PATTERN,
  CANONICAL_HEX_PATTERN,
} from '../../color-conversion'
import { makeDisplayColor } from '../../color-display'
import type { TokenTypeDefinition, TokenValueValidationResult } from '../types'
import {
  describeComponentRange,
  getColorSpaceDefinition,
  isComponentInRange,
  isNoneKeyword,
  isSupportedColorSpace,
  SUPPORTED_COLOR_SPACE_IDS,
} from './color-spaces'

const AliasPattern = /^\{[^}]+\}$/

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string, message: string): TokenValueValidationResult {
  return { ok: false, errors: [{ path, message }] }
}

/**
 * Validate a color `$value` per Design Tokens Color Module 2025.10.
 * @see https://www.designtokens.org/tr/2025.10/color/
 *
 * - Canonical objects: supported colorSpace, arity, ranges, exact `"none"`,
 *   alpha ∈ [0,1], optional 6-digit `#RRGGBB` hex only.
 * - Curly-brace aliases: accepted.
 * - Plain hex-string `$value`: documented non-DTCG compatibility (normalized
 *   into source on import); accepted here so pre-normalize validation stays green.
 */
export function validateColorValue(
  value: unknown,
  path = '$value',
): TokenValueValidationResult {
  if (typeof value === 'string') {
    if (AliasPattern.test(value)) return { ok: true }
    if (COMPAT_HEX_STRING_PATTERN.test(value)) return { ok: true }
    return fail(
      path,
      'INVALID_VALUE — Expected a DTCG color object, a curly-brace alias, or a documented hex-string compatibility value.',
    )
  }

  if (!isJsonObject(value)) {
    return fail(path, 'INVALID_VALUE — Color value must be an object, alias string, or hex string.')
  }

  const colorSpace = value.colorSpace
  if (typeof colorSpace !== 'string') {
    return fail(`${path}.colorSpace`, 'INVALID_VALUE — "colorSpace" is required and must be a string.')
  }
  if (!isSupportedColorSpace(colorSpace)) {
    return fail(
      `${path}.colorSpace`,
      `INVALID_VALUE — Unknown colorSpace "${colorSpace}". Supported: ${SUPPORTED_COLOR_SPACE_IDS.join(', ')}.`,
    )
  }

  const space = getColorSpaceDefinition(colorSpace)!
  const components = value.components
  if (!Array.isArray(components)) {
    return fail(`${path}.components`, 'INVALID_VALUE — "components" is required and must be an array.')
  }
  if (components.length !== space.componentCount) {
    return fail(
      `${path}.components`,
      `INVALID_VALUE — colorSpace "${colorSpace}" requires ${space.componentCount} components; got ${components.length}.`,
    )
  }

  for (let i = 0; i < components.length; i++) {
    const component = components[i]
    const range = space.components[i]!
    const componentPath = `${path}.components.${i}`

    if (isNoneKeyword(component)) continue

    if (typeof component !== 'number') {
      return fail(
        componentPath,
        'INVALID_VALUE — Each component must be a number or the exact keyword "none".',
      )
    }
    if (!isComponentInRange(component, range)) {
      return fail(
        componentPath,
        `INVALID_VALUE — Component out of range for "${colorSpace}" (expected ${describeComponentRange(range)}).`,
      )
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, 'alpha')) {
    const alpha = value.alpha
    if (typeof alpha !== 'number' || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
      return fail(`${path}.alpha`, 'INVALID_VALUE — "alpha" must be a number in [0, 1].')
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, 'hex')) {
    const hex = value.hex
    if (typeof hex !== 'string' || !CANONICAL_HEX_PATTERN.test(hex)) {
      return fail(
        `${path}.hex`,
        'INVALID_VALUE — Optional "hex" must be a 6-digit CSS hex color (#RRGGBB).',
      )
    }
  }

  return { ok: true }
}

export function createDefaultColorValue(): unknown {
  return hexToDtcgColorValue('#000000')
}

export function formatColorForDisplay(value: unknown): { primary: string; secondary?: string } {
  const display = makeDisplayColor(value)
  return { primary: display.srgb, secondary: display.hex }
}

export function parseColorFromEditor(
  input: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = input.trim()
  if (AliasPattern.test(trimmed)) {
    return { ok: true, value: trimmed }
  }
  if (!COMPAT_HEX_STRING_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Expected a hex color or {alias} reference' }
  }
  try {
    return { ok: true, value: hexToDtcgColorValue(trimmed) }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Invalid hex color',
    }
  }
}

export const colorTokenTypeDefinition: TokenTypeDefinition = {
  id: 'color',
  label: 'Color',
  navPath: 'color',
  navIcon: 'mdi-palette',
  validateValue: validateColorValue,
  createDefaultValue: createDefaultColorValue,
  formatForDisplay: formatColorForDisplay,
  parseFromEditor: parseColorFromEditor,
}

export {
  CANONICAL_HEX_PATTERN,
  COMPAT_HEX_STRING_PATTERN,
} from '../../color-conversion'

export {
  SUPPORTED_COLOR_SPACE_IDS,
  SUPPORTED_COLOR_SPACES,
  getColorSpaceDefinition,
  isSupportedColorSpace,
} from './color-spaces'
