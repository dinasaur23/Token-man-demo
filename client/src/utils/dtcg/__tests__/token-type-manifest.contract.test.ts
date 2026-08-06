import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  APPLICATION_SUPPORTED_TYPES,
  DEFERRED_GROUP_FEATURES,
  DTCG_MANIFEST_VERSION,
  INVALID_NON_DTCG_TYPES,
  KNOWN_DTCG_TYPES_OUT_OF_SCOPE,
  getApplicationSupportedTypesList,
} from '../token-type-manifest'

const sharedManifest = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../../../shared/dtcg-basic-token-types.json'),
    'utf8',
  ),
)

describe('shared DTCG token-type manifest contract', () => {
  it('client loader matches the shared JSON file', () => {
    expect(DTCG_MANIFEST_VERSION).toBe(sharedManifest.version)
    expect([...APPLICATION_SUPPORTED_TYPES]).toEqual(sharedManifest.applicationSupportedTypes)
    expect([...INVALID_NON_DTCG_TYPES]).toEqual(sharedManifest.invalidNonDtcgTypes)
    expect([...KNOWN_DTCG_TYPES_OUT_OF_SCOPE]).toEqual(sharedManifest.knownDtcgTypesOutOfScope)
    expect([...DEFERRED_GROUP_FEATURES]).toEqual(sharedManifest.deferredGroupFeatures)
  })

  it('exposes the seven application-supported basic types in order', () => {
    expect(getApplicationSupportedTypesList()).toEqual([
      'color',
      'dimension',
      'fontFamily',
      'fontWeight',
      'duration',
      'cubicBezier',
      'number',
    ])
  })

  it('lists string and boolean as invalid non-DTCG types', () => {
    expect(INVALID_NON_DTCG_TYPES).toContain('string')
    expect(INVALID_NON_DTCG_TYPES).toContain('boolean')
  })

  it('defers $extends until a later milestone', () => {
    expect(DEFERRED_GROUP_FEATURES).toContain('$extends')
  })
})
