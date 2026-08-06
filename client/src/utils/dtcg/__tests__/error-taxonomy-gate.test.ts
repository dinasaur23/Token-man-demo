import { describe, expect, it } from 'vitest'
import { validateTokensStrict } from '../dtcg-validator'
import { messageForInvalidDtcgType } from '../token-validation-error'

describe('Stage 8 import taxonomy gate', () => {
  it('fails closed on string tokens with precise INVALID_DTCG_TYPE message', async () => {
    const result = await validateTokensStrict({
      brand: { label: { $type: 'string', $value: 'hello' } },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes(messageForInvalidDtcgType('string')))).toBe(true)
    }
  })

  it('still accepts color documents', async () => {
    const result = await validateTokensStrict({
      colors: {
        $type: 'color',
        black: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
      },
    })
    expect(result).toEqual({ ok: true })
  })

  it('rejects $extends via structural wiring inside validateTokensStrict', async () => {
    const result = await validateTokensStrict({
      buttons: {
        $extends: '{base.buttons}',
        bg: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => /UNSUPPORTED_BY_APPLICATION/.test(e) && /\$extends/.test(e))).toBe(
        true,
      )
    }
  })
})
