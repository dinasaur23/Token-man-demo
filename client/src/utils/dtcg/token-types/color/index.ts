import { z } from 'zod'
import { hexToDtcgColorValue, HEX_PATTERN } from '../../color-conversion'
import { makeDisplayColor } from '../../color-display'
import type { TokenTypeDefinition, TokenValueValidationResult } from '../types'

const AliasPattern = /^\{[^}]+\}$/

const StrictColorObject = z
  .object({
    colorSpace: z.string(),
    components: z.array(z.number()).length(3),
    alpha: z.number().min(0).max(1).optional(),
    hex: z
      .string()
      .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
      .optional(),
  })
  .refine((v) => v.hex !== undefined || v.components !== undefined, {
    message: 'Color object must have hex or components',
  })

const HexPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const ColorValueSchema = z.union([
  StrictColorObject,
  z.string().regex(HexPattern, 'Expected hex color'),
  z.string().regex(AliasPattern, 'Expected alias like {path.to.token}'),
])

/**
 * Color value validation matching current characterization behavior.
 * Stricter colorSpace / none / 6-digit hex rules land in the color-compliance stage.
 */
export function validateColorValue(
  value: unknown,
  path = '$value',
): TokenValueValidationResult {
  const parseResult = ColorValueSchema.safeParse(value)
  if (parseResult.success) return { ok: true }

  return {
    ok: false,
    errors: parseResult.error.issues.map((issue) => {
      const issuePath = issue.path.length > 0 ? `${path}.${issue.path.join('.')}` : path
      return { path: issuePath, message: issue.message }
    }),
  }
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
  if (!HEX_PATTERN.test(trimmed)) {
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
  validateValue: validateColorValue,
  createDefaultValue: createDefaultColorValue,
  formatForDisplay: formatColorForDisplay,
  parseFromEditor: parseColorFromEditor,
}
