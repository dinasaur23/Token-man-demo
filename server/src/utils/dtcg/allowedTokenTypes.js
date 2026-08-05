import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const manifestPath = join(__dirname, '../../../../shared/dtcg-basic-token-types.json')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

export const DTCG_MANIFEST_VERSION = manifest.version

/** Application-supported DTCG basic types for this milestone. */
export const APPLICATION_SUPPORTED_TYPES = Object.freeze([
  ...manifest.applicationSupportedTypes,
])

export const INVALID_NON_DTCG_TYPES = Object.freeze([...manifest.invalidNonDtcgTypes])

export const KNOWN_DTCG_TYPES_OUT_OF_SCOPE = Object.freeze([
  ...manifest.knownDtcgTypesOutOfScope,
])

export const DEFERRED_GROUP_FEATURES = Object.freeze([
  ...manifest.deferredGroupFeatures,
])

export function isApplicationSupportedTokenType(value) {
  return typeof value === 'string' && APPLICATION_SUPPORTED_TYPES.includes(value)
}

export function getApplicationSupportedTypesList() {
  return APPLICATION_SUPPORTED_TYPES
}
