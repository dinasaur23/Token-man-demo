import manifest from '../../../../shared/dtcg-basic-token-types.json'

export type ApplicationSupportedTokenType =
  (typeof manifest.applicationSupportedTypes)[number]

export const DTCG_MANIFEST_VERSION = manifest.version

export const APPLICATION_SUPPORTED_TYPES = manifest.applicationSupportedTypes as readonly ApplicationSupportedTokenType[]

export const INVALID_NON_DTCG_TYPES = manifest.invalidNonDtcgTypes as readonly string[]

export const KNOWN_DTCG_TYPES_OUT_OF_SCOPE = manifest.knownDtcgTypesOutOfScope as readonly string[]

export const DEFERRED_GROUP_FEATURES = manifest.deferredGroupFeatures as readonly string[]

export function isApplicationSupportedTokenType(
  value: unknown,
): value is ApplicationSupportedTokenType {
  return (
    typeof value === 'string' &&
    (APPLICATION_SUPPORTED_TYPES as readonly string[]).includes(value)
  )
}

export function getApplicationSupportedTypesList(): readonly string[] {
  return APPLICATION_SUPPORTED_TYPES
}
