/**
 * Effective $type resolution per DTCG 2025.10 / approved Phase 2 plan.
 *
 * Order for a token leaf ($value present):
 * 1. Explicit leaf $type → origin 'explicit'
 * 2. Else if $value is a reference (curly-brace or JSON Pointer to a token value)
 *    → effective type of the resolved target → origin 'alias' (chains allowed)
 * 3. Else nearest parent group $type → origin 'inherited'
 * 4. Else MISSING_TYPE
 *
 * Does not guess type from value shape. Uses the Stage 5 reference-resolver for hops.
 */

import {
  classifyReferenceTarget,
  getNodeAtSegments,
  isCurlyBraceAlias,
  isJsonObject,
  isJsonPointerRef,
  isLegacyAliasObject,
  parseCurlyBracePath,
  parseJsonPointer,
  resolveReferenceOnce,
  segmentsToTokenPath,
  tokenPathToSegments,
  type Json,
  type JsonObject,
  type ReferenceResolutionErrorCode,
  type ReferenceResolutionResult,
} from './reference-resolver'

export type TypeOrigin = 'explicit' | 'inherited' | 'alias'

export type EffectiveTypeErrorCode =
  | 'MISSING_TYPE'
  | 'UNRESOLVED_ALIAS'
  | 'CIRCULAR_ALIAS'
  | 'ALIAS_TARGETS_GROUP'
  | 'ALIAS_TYPE_MISMATCH'
  | 'INVALID_VALUE'
  | 'INVALID_ROOT_USAGE'
  | 'INVALID_POINTER'

export type EffectiveTypeResult =
  | {
      ok: true
      type: string
      origin: TypeOrigin
    }
  | {
      ok: false
      code: EffectiveTypeErrorCode
      message: string
    }

function readLocalType(node: JsonObject): string | undefined {
  return typeof node.$type === 'string' ? node.$type : undefined
}

function isTokenLeaf(node: Json): node is JsonObject {
  return isJsonObject(node) && Object.prototype.hasOwnProperty.call(node, '$value')
}

/**
 * Nearest parent group `$type` for a leaf at `pathSegments` (leaf segment excluded).
 * Closer ancestors override farther ones.
 */
export function getInheritedTypeAtPath(root: Json, pathSegments: string[]): string | undefined {
  if (pathSegments.length === 0) return undefined

  let inherited: string | undefined
  let cursor: Json = root

  for (let i = 0; i < pathSegments.length - 1; i++) {
    const segment = pathSegments[i]!
    if (!isJsonObject(cursor)) return inherited
    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return inherited
    const next = cursor[segment]
    if (!isJsonObject(next)) return inherited
    if (typeof next.$type === 'string') inherited = next.$type
    cursor = next
  }

  return inherited
}

function mapReferenceError(
  result: Extract<ReferenceResolutionResult, { ok: false }>,
): EffectiveTypeResult {
  const code: EffectiveTypeErrorCode =
    result.code === 'UNRESOLVED_ALIAS' ||
    result.code === 'CIRCULAR_ALIAS' ||
    result.code === 'ALIAS_TARGETS_GROUP' ||
    result.code === 'INVALID_ROOT_USAGE' ||
    result.code === 'INVALID_POINTER' ||
    result.code === 'INVALID_VALUE'
      ? result.code
      : 'INVALID_VALUE'

  return { ok: false, code, message: result.message }
}

function referenceSeenKey(kind: string, targetPath: string): string {
  return `${kind}:${targetPath}`
}

/**
 * Locate the token leaf addressed by a JSON Pointer used as a type-bearing alias.
 * Accepts pointers to the token object or to its `$value` property only.
 */
function findTokenLeafForTypePointer(
  root: Json,
  pointer: string,
):
  | { ok: true; leaf: JsonObject; pathSegments: string[]; inheritedType: string | undefined }
  | { ok: false; code: EffectiveTypeErrorCode; message: string } {
  const segments = parseJsonPointer(pointer)
  if (segments === null) {
    return {
      ok: false,
      code: 'INVALID_POINTER',
      message: `Invalid JSON Pointer: ${JSON.stringify(pointer)}`,
    }
  }

  if (segments.length === 0) {
    return {
      ok: false,
      code: 'MISSING_TYPE',
      message: `JSON Pointer "${pointer}" does not address a typed token`,
    }
  }

  // Pointer to token leaf: #/group/token
  const asToken = classifyReferenceTarget(root, segments)
  if (asToken.status === 'token' && isTokenLeaf(asToken.node)) {
    return {
      ok: true,
      leaf: asToken.node,
      pathSegments: segments,
      inheritedType: getInheritedTypeAtPath(root, segments),
    }
  }

  // Pointer to token $value: #/group/token/$value
  if (segments[segments.length - 1] === '$value') {
    const tokenSegments = segments.slice(0, -1)
    const tokenNode = getNodeAtSegments(root, tokenSegments)
    if (isTokenLeaf(tokenNode)) {
      return {
        ok: true,
        leaf: tokenNode,
        pathSegments: tokenSegments,
        inheritedType: getInheritedTypeAtPath(root, tokenSegments),
      }
    }
  }

  return {
    ok: false,
    code: 'MISSING_TYPE',
    message: `JSON Pointer "${pointer}" does not address a typed token value`,
  }
}

function resolveTypeOfReferenceTarget(
  root: Json,
  value: Json,
  seen: Set<string>,
): EffectiveTypeResult {
  if (isLegacyAliasObject(value)) {
    return {
      ok: false,
      code: 'INVALID_VALUE',
      message:
        'Legacy non-spec alias object { "alias": "{path}" } is not supported for type resolution',
    }
  }

  if (isCurlyBraceAlias(value)) {
    const path = parseCurlyBracePath(value)
    if (!path) {
      return {
        ok: false,
        code: 'INVALID_VALUE',
        message: `Invalid curly-brace alias: ${JSON.stringify(value)}`,
      }
    }

    const key = referenceSeenKey('curly-brace', path)
    if (seen.has(key)) {
      return {
        ok: false,
        code: 'CIRCULAR_ALIAS',
        message: `Circular reference detected at "${path}"`,
      }
    }

    const once = resolveReferenceOnce(root, value)
    if (!once.ok) return mapReferenceError(once)

    seen.add(key)

    const segments = tokenPathToSegments(once.targetPath)
    const tokenNode = getNodeAtSegments(root, segments)
    if (!isTokenLeaf(tokenNode)) {
      return {
        ok: false,
        code: 'INVALID_VALUE',
        message: `Reference "{${path}}" does not target a token`,
      }
    }

    return resolveEffectiveTypeForLeaf(
      root,
      tokenNode,
      getInheritedTypeAtPath(root, segments),
      seen,
    )
  }

  if (isJsonPointerRef(value)) {
    const pointer = value.$ref
    const key = referenceSeenKey('json-pointer', pointer)
    if (seen.has(key)) {
      return {
        ok: false,
        code: 'CIRCULAR_ALIAS',
        message: `Circular reference detected at "${pointer}"`,
      }
    }

    const once = resolveReferenceOnce(root, value)
    if (!once.ok) return mapReferenceError(once)

    seen.add(key)

    const located = findTokenLeafForTypePointer(root, pointer)
    if (!located.ok) return located

    return resolveEffectiveTypeForLeaf(root, located.leaf, located.inheritedType, seen)
  }

  return {
    ok: false,
    code: 'MISSING_TYPE',
    message: 'Value is not a reference',
  }
}

/**
 * Resolve the effective type for a token leaf.
 *
 * `inheritedType` is the nearest parent group `$type` (typically from
 * {@link getInheritedTypeAtPath} while walking the document).
 */
export function resolveEffectiveTypeForLeaf(
  root: Json,
  leaf: JsonObject,
  inheritedType: string | undefined,
  seenAliasTargets: Set<string> = new Set(),
): EffectiveTypeResult {
  if (!Object.prototype.hasOwnProperty.call(leaf, '$value')) {
    return {
      ok: false,
      code: 'MISSING_TYPE',
      message: 'Node is not a token leaf (missing $value)',
    }
  }

  const explicit = readLocalType(leaf)
  const value = leaf.$value
  const isRef =
    isCurlyBraceAlias(value) || isJsonPointerRef(value) || isLegacyAliasObject(value)

  if (explicit) {
    if (isRef && !isLegacyAliasObject(value)) {
      const targetType = resolveTypeOfReferenceTarget(root, value, new Set(seenAliasTargets))
      if (targetType.ok && targetType.type !== explicit) {
        return {
          ok: false,
          code: 'ALIAS_TYPE_MISMATCH',
          message: `Alias type mismatch: leaf declares $type "${explicit}" but referenced token has effective type "${targetType.type}"`,
        }
      }
      // Unresolved / circular refs with an explicit leaf type still yield the
      // explicit type for effective-type purposes; dedicated reference validation
      // reports those codes separately. Type-mismatch only applies when both
      // sides resolve.
    }
    return { ok: true, type: explicit, origin: 'explicit' }
  }

  if (isLegacyAliasObject(value)) {
    return {
      ok: false,
      code: 'INVALID_VALUE',
      message:
        'Legacy non-spec alias object { "alias": "{path}" } is not supported for type resolution',
    }
  }

  if (isCurlyBraceAlias(value) || isJsonPointerRef(value)) {
    const targetType = resolveTypeOfReferenceTarget(root, value, seenAliasTargets)
    if (!targetType.ok) return targetType
    return { ok: true, type: targetType.type, origin: 'alias' }
  }

  if (inheritedType) {
    return { ok: true, type: inheritedType, origin: 'inherited' }
  }

  return {
    ok: false,
    code: 'MISSING_TYPE',
    message:
      'Token type could not be determined: no explicit $type, no resolvable reference type, and no inherited group $type',
  }
}

/**
 * Convenience: resolve effective type for the token at `pathSegments` under `root`.
 */
export function resolveEffectiveTypeAtPath(
  root: Json,
  pathSegments: string[],
): EffectiveTypeResult {
  const node = getNodeAtSegments(root, pathSegments)
  if (!isTokenLeaf(node)) {
    return {
      ok: false,
      code: 'MISSING_TYPE',
      message: `No token leaf at "${segmentsToTokenPath(pathSegments)}"`,
    }
  }

  return resolveEffectiveTypeForLeaf(
    root,
    node,
    getInheritedTypeAtPath(root, pathSegments),
  )
}

/** Re-export for callers that map reference failures without importing the resolver. */
export type { ReferenceResolutionErrorCode }
