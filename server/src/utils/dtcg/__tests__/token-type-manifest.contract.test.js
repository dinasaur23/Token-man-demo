/**
 * Contract: server allowlist loader matches shared/dtcg-basic-token-types.json
 * and stays aligned with the client loader's exported lists.
 *
 * Run: node --test src/utils/dtcg/__tests__/token-type-manifest.contract.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  APPLICATION_SUPPORTED_TYPES,
  DEFERRED_GROUP_FEATURES,
  DTCG_MANIFEST_VERSION,
  INVALID_NON_DTCG_TYPES,
  KNOWN_DTCG_TYPES_OUT_OF_SCOPE,
  getApplicationSupportedTypesList,
} from '../allowedTokenTypes.js'

const sharedManifest = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../../../shared/dtcg-basic-token-types.json'),
    'utf8',
  ),
)

describe('shared DTCG token-type manifest contract (server)', () => {
  it('server loader matches the shared JSON file', () => {
    assert.equal(DTCG_MANIFEST_VERSION, sharedManifest.version)
    assert.deepEqual(
      [...APPLICATION_SUPPORTED_TYPES],
      sharedManifest.applicationSupportedTypes,
    )
    assert.deepEqual([...INVALID_NON_DTCG_TYPES], sharedManifest.invalidNonDtcgTypes)
    assert.deepEqual(
      [...KNOWN_DTCG_TYPES_OUT_OF_SCOPE],
      sharedManifest.knownDtcgTypesOutOfScope,
    )
    assert.deepEqual([...DEFERRED_GROUP_FEATURES], sharedManifest.deferredGroupFeatures)
  })

  it('exposes the seven application-supported basic types', () => {
    assert.deepEqual(getApplicationSupportedTypesList(), [
      'color',
      'dimension',
      'fontFamily',
      'fontWeight',
      'duration',
      'cubicBezier',
      'number',
    ])
  })
})
