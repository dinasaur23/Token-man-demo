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

export function supportedTypesPublicList() {
  return APPLICATION_SUPPORTED_TYPES.join(', ')
}

export function messageForInvalidDtcgType(typeName) {
  return `"$type" "${typeName}" is not supported. This application accepts only DTCG 2025.10 basic types: ${supportedTypesPublicList()}.`
}

export function messageForUnsupportedByApplicationType(typeName) {
  return `"$type" "${typeName}" is a valid DTCG composite type but is outside the current application scope.`
}

/**
 * Classify a declared `$type` for the report script / server allowlist.
 * Returns null when application-supported.
 */
export function classifyDeclaredTokenType(typeName) {
  if (typeof typeName !== 'string') return null

  if (APPLICATION_SUPPORTED_TYPES.includes(typeName)) {
    return null
  }

  if (INVALID_NON_DTCG_TYPES.includes(typeName)) {
    return {
      classification: 'INVALID_DTCG_TYPE',
      message: messageForInvalidDtcgType(typeName),
      $type: typeName,
    }
  }

  if (KNOWN_DTCG_TYPES_OUT_OF_SCOPE.includes(typeName)) {
    return {
      classification: 'UNSUPPORTED_BY_APPLICATION',
      message: messageForUnsupportedByApplicationType(typeName),
      $type: typeName,
    }
  }

  return {
    classification: 'INVALID_DTCG_TYPE',
    message: messageForInvalidDtcgType(typeName),
    $type: typeName,
  }
}
