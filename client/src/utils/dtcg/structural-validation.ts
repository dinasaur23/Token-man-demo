/**
 * Structural DTCG document validation (Stage 7).
 *
 * Collects all structural issues; does not mutate the document.
 * Does not remove string/boolean from live import allowlists — that is a
 * later error-taxonomy stage. Reference target checks reuse Stage 5 resolver.
 */

import {
  isCurlyBraceAlias,
  isJsonObject,
  isJsonPointerRef,
  isLegacyAliasObject,
  resolveReferenceOnce,
  type Json,
  type JsonObject,
} from './reference-resolver'
import {
  classifyDeclaredTokenType,
  formatTokenValidationError,
  messageForTokenAndGroupConflict,
  messageForUnsupportedExtends,
  messageForUnsupportedGroupRefExtension,
  type TokenValidationError,
} from './token-validation-error'

export type StructuralValidationResult =
  | { ok: true; errors: [] }
  | { ok: false; errors: TokenValidationError[] }

function pathString(segments: string[]): string {
  return segments.join('.')
}

function childKeys(node: JsonObject): string[] {
  return Object.keys(node).filter((key) => !key.startsWith('$'))
}

function hasDollarProp(node: JsonObject, prop: string): boolean {
  return Object.prototype.hasOwnProperty.call(node, prop)
}

function isTokenLeaf(node: JsonObject): boolean {
  return hasDollarProp(node, '$value')
}

/**
 * Walk a source DTCG document and collect structural validation errors.
 * Callers that need a single failure for import should treat `ok: false` as
 * fail-closed for the entire file.
 */
export function validateDocumentStructure(doc: Json): StructuralValidationResult {
  const errors: TokenValidationError[] = []
  let tokenCount = 0

  function visit(node: Json, segments: string[]): void {
    if (!isJsonObject(node)) return

    const path = pathString(segments)
    const displayPath = path || '(root)'

    // Group extension forms — reject immediately (no target inspection).
    if (!isTokenLeaf(node) && hasDollarProp(node, '$extends')) {
      errors.push({
        path: displayPath,
        code: 'UNSUPPORTED_BY_APPLICATION',
        message: messageForUnsupportedExtends(),
      })
    }

    if (!isTokenLeaf(node) && hasDollarProp(node, '$ref')) {
      errors.push({
        path: displayPath,
        code: 'UNSUPPORTED_BY_APPLICATION',
        message: messageForUnsupportedGroupRefExtension(),
      })
    }

    // Token + group conflict: $value together with non-$ children.
    if (isTokenLeaf(node) && childKeys(node).length > 0) {
      errors.push({
        path: displayPath,
        code: 'TOKEN_AND_GROUP_CONFLICT',
        message: messageForTokenAndGroupConflict(),
      })
    }

    if (isTokenLeaf(node)) {
      tokenCount += 1
      // Declared `$type` taxonomy (INVALID_DTCG_TYPE / UNSUPPORTED_BY_APPLICATION)
      // is available via collectDeclaredTypeTaxonomyErrors — not applied here so
      // transitional string|boolean allowlists stay green until the removal stage.
      validateReferenceValue(doc, node.$value, displayPath, errors)
    }

    for (const key of childKeys(node)) {
      visit(node[key], [...segments, key])
    }
  }

  if (!isJsonObject(doc)) {
    return {
      ok: false,
      errors: [
        {
          path: '(root)',
          code: 'EMPTY_DOCUMENT',
          message: 'Document root must be a JSON object containing DTCG tokens.',
        },
      ],
    }
  }

  visit(doc, [])

  if (tokenCount === 0) {
    errors.push({
      path: '(root)',
      code: 'EMPTY_DOCUMENT',
      message:
        'Document contains no DTCG tokens (no nodes with "$value"). It is not a valid DTCG token file.',
    })
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, errors: [] }
}

function validateReferenceValue(
  root: Json,
  value: Json,
  tokenPath: string,
  errors: TokenValidationError[],
): void {
  if (isLegacyAliasObject(value)) {
    errors.push({
      path: tokenPath,
      code: 'INVALID_VALUE',
      message:
        'Legacy non-spec alias object { "alias": "{path}" } is not supported. Use a curly-brace string "$value" or a JSON Pointer { "$ref": "#/..." }.',
    })
    return
  }

  if (!isCurlyBraceAlias(value) && !isJsonPointerRef(value)) return

  const resolved = resolveReferenceOnce(root, value)
  if (resolved.ok) return

  if (
    resolved.code === 'ALIAS_TARGETS_GROUP' ||
    resolved.code === 'INVALID_ROOT_USAGE' ||
    resolved.code === 'UNRESOLVED_ALIAS' ||
    resolved.code === 'INVALID_POINTER' ||
    resolved.code === 'INVALID_VALUE'
  ) {
    errors.push({
      path: tokenPath,
      code: resolved.code,
      message: resolved.message,
    })
  }
}

/**
 * Optional strict type-taxonomy pass over declared `$type` values.
 * Not applied by {@link validateDocumentStructure} so characterization /
 * transitional string|boolean allowlists remain green until the removal stage.
 */
export function collectDeclaredTypeTaxonomyErrors(doc: Json): TokenValidationError[] {
  const errors: TokenValidationError[] = []

  function visit(node: Json, segments: string[]): void {
    if (!isJsonObject(node)) return

    const path = pathString(segments) || '(root)'
    if (typeof node.$type === 'string') {
      const classified = classifyDeclaredTokenType(node.$type)
      if (classified) {
        errors.push({
          path,
          code: classified.code,
          message: classified.message,
          $type: classified.$type,
        })
      }
    }

    for (const key of childKeys(node)) {
      visit(node[key], [...segments, key])
    }
  }

  if (isJsonObject(doc)) visit(doc, [])
  return errors
}

export function formatStructuralErrors(errors: readonly TokenValidationError[]): string[] {
  return errors.map(formatTokenValidationError)
}
