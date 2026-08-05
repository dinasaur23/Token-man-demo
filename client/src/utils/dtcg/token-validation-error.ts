/**
 * Shared DTCG validation error taxonomy (Phase 2).
 *
 * Structural Stage 7 begins wiring these codes and public messages.
 * Live allowlists still accept string/boolean until the dedicated
 * error-taxonomy / removal stage updates import paths.
 */

import {
  APPLICATION_SUPPORTED_TYPES,
  INVALID_NON_DTCG_TYPES,
  KNOWN_DTCG_TYPES_OUT_OF_SCOPE,
  getApplicationSupportedTypesList,
} from './token-type-manifest'

export type TokenValidationErrorCode =
  | 'INVALID_DTCG_TYPE'
  | 'UNSUPPORTED_BY_APPLICATION'
  | 'INVALID_VALUE'
  | 'MISSING_TYPE'
  | 'UNRESOLVED_ALIAS'
  | 'CIRCULAR_ALIAS'
  | 'ALIAS_TYPE_MISMATCH'
  | 'ALIAS_TARGETS_GROUP'
  | 'INVALID_ROOT_USAGE'
  | 'TOKEN_AND_GROUP_CONFLICT'
  | 'EXTENDS_TARGETS_TOKEN'
  | 'EMPTY_DOCUMENT'
  | 'INVALID_POINTER'

export type TokenValidationError = {
  path: string
  code: TokenValidationErrorCode
  message: string
  $type?: string
}

export function formatTokenValidationError(error: TokenValidationError): string {
  const prefix = error.path ? `${error.path}: ` : ''
  return `${prefix}${error.code} — ${error.message}`
}

export function supportedTypesPublicList(): string {
  return getApplicationSupportedTypesList().join(', ')
}

/** Precise public wording for non-DTCG legacy types (string/boolean). */
export function messageForInvalidDtcgType(typeName: string): string {
  return `"$type" "${typeName}" is not supported. This application accepts only DTCG 2025.10 basic types: ${supportedTypesPublicList()}.`
}

/** Precise public wording for valid DTCG types outside application scope. */
export function messageForUnsupportedByApplicationType(typeName: string): string {
  return `"$type" "${typeName}" is a valid DTCG composite type but is outside the current application scope.`
}

export function messageForUnsupportedExtends(): string {
  return 'group "$extends" is valid DTCG but is not implemented; remove "$extends" or flatten inherited tokens before import.'
}

export function messageForUnsupportedGroupRefExtension(): string {
  return 'group-level "$ref" extension is valid DTCG but is not implemented; remove group "$ref" or flatten inherited tokens before import.'
}

export function messageForTokenAndGroupConflict(): string {
  return 'Node has both "$value" and non-"$" children; a node cannot be both a token and a group.'
}

/**
 * Classify a declared `$type` string into taxonomy codes.
 * Returns `null` when the type is application-supported.
 * Does not mutate documents or live allowlists.
 */
export function classifyDeclaredTokenType(
  typeName: string,
): Pick<TokenValidationError, 'code' | 'message' | '$type'> | null {
  if ((APPLICATION_SUPPORTED_TYPES as readonly string[]).includes(typeName)) {
    return null
  }

  if ((INVALID_NON_DTCG_TYPES as readonly string[]).includes(typeName)) {
    return {
      code: 'INVALID_DTCG_TYPE',
      message: messageForInvalidDtcgType(typeName),
      $type: typeName,
    }
  }

  if ((KNOWN_DTCG_TYPES_OUT_OF_SCOPE as readonly string[]).includes(typeName)) {
    return {
      code: 'UNSUPPORTED_BY_APPLICATION',
      message: messageForUnsupportedByApplicationType(typeName),
      $type: typeName,
    }
  }

  // Unknown / other strings: treat as invalid for this application.
  return {
    code: 'INVALID_DTCG_TYPE',
    message: messageForInvalidDtcgType(typeName),
    $type: typeName,
  }
}
