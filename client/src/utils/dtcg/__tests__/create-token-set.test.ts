import { describe, expect, it } from 'vitest'
import { validateTokensStrict } from '../dtcg-validator'
import { serializeSourceDocumentsForPersistence } from '../source-document'
import {
  createEmptyTokenSetDocument,
  normalizeTokenSetFileName,
  tokenSetFileNameConflict,
} from '../workspace-file-names'

describe('create token set (workspace)', () => {
  it('requires a non-empty trimmed name', () => {
    expect(normalizeTokenSetFileName('')).toEqual({
      ok: false,
      error: 'Token set name is required.',
    })
    expect(normalizeTokenSetFileName('   ')).toEqual({
      ok: false,
      error: 'Token set name is required.',
    })
  })

  it('appends .json when missing', () => {
    expect(normalizeTokenSetFileName('My Tokens')).toEqual({
      ok: true,
      fileName: 'My Tokens.json',
    })
    expect(normalizeTokenSetFileName('tokens.json')).toEqual({
      ok: true,
      fileName: 'tokens.json',
    })
  })

  it('rejects duplicate workspace file names', () => {
    expect(tokenSetFileNameConflict('a.json', ['a.json', 'b.json'])).toMatch(/already exists/)
    expect(tokenSetFileNameConflict('c.json', ['a.json'])).toBeNull()
  })

  it('empty draft validates with allowEmptyDraft for workspace display', async () => {
    const doc = createEmptyTokenSetDocument()
    expect(await validateTokensStrict(doc, { allowEmptyDraft: true })).toEqual({ ok: true })
    expect(await validateTokensStrict(doc)).toMatchObject({ ok: false, kind: 'structural' })
  })

  it('serializes empty draft as source-only persistence payload', async () => {
    const doc = createEmptyTokenSetDocument()

    const files = serializeSourceDocumentsForPersistence({ 'draft.json': doc })
    expect(files).toEqual([{ name: 'draft.json', content: {} }])
    expect(files[0]?.content).not.toHaveProperty('tokens')
  })
})
