/**
 * Contract: checked-in examples/ JSON must pass import validation.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateTokensStrict } from '../dtcg-validator'

const examplesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../../examples')

const FILES = [
  'all-basic-types.json',
  'aliases.json',
  'color-theme.json',
  'figma-like-tokens.json',
] as const

describe('repo examples/ import validation', () => {
  for (const name of FILES) {
    it(`${name} parses and passes validateTokensStrict`, async () => {
      const raw = readFileSync(join(examplesDir, name), 'utf8')
      const doc = JSON.parse(raw)
      const result = await validateTokensStrict(doc)
      expect(result).toEqual({ ok: true })
    })
  }
})
