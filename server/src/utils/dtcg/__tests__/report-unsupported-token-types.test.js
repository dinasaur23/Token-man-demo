import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyDeclaredTokenType,
  APPLICATION_SUPPORTED_TYPES,
} from '../allowedTokenTypes.js'
import {
  collectUnsupportedTokenTypesFromDocument,
  collectUnsupportedTokenTypesFromWorkspace,
} from '../reportUnsupportedTokenTypes.js'

describe('classifyDeclaredTokenType (server)', () => {
  it('returns null for application-supported types', () => {
    for (const t of APPLICATION_SUPPORTED_TYPES) {
      assert.equal(classifyDeclaredTokenType(t), null)
    }
  })

  it('classifies string/boolean as INVALID_DTCG_TYPE', () => {
    const result = classifyDeclaredTokenType('boolean')
    assert.ok(result)
    assert.equal(result.classification, 'INVALID_DTCG_TYPE')
    assert.match(result.message, /boolean/)
    assert.match(result.message, /color, dimension, fontFamily/)
  })

  it('classifies typography as UNSUPPORTED_BY_APPLICATION', () => {
    const result = classifyDeclaredTokenType('typography')
    assert.ok(result)
    assert.equal(result.classification, 'UNSUPPORTED_BY_APPLICATION')
  })
})

describe('reportUnsupportedTokenTypes', () => {
  it('collects findings from a document', () => {
    const doc = {
      flags: { on: { $type: 'boolean', $value: true } },
      text: { title: { $type: 'typography', $value: {} } },
      colors: { black: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0] } } },
    }
    const findings = collectUnsupportedTokenTypesFromDocument(doc)
    assert.equal(findings.length, 2)
    assert.ok(findings.some((f) => f.$type === 'boolean' && f.classification === 'INVALID_DTCG_TYPE'))
    assert.ok(
      findings.some(
        (f) => f.$type === 'typography' && f.classification === 'UNSUPPORTED_BY_APPLICATION',
      ),
    )
  })

  it('collects findings from a workspace files array', () => {
    const rows = collectUnsupportedTokenTypesFromWorkspace({
      workspaceId: 'ws-1',
      files: [
        {
          name: 'tokens.json',
          content: {
            label: { $type: 'string', $value: 'x' },
          },
        },
      ],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].workspaceId, 'ws-1')
    assert.equal(rows[0].fileName, 'tokens.json')
    assert.equal(rows[0].$type, 'string')
    assert.equal(rows[0].classification, 'INVALID_DTCG_TYPE')
  })
})
