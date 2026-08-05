/**
 * Effective $type resolution per DTCG 2025.10.
 * Order: explicit leaf $type → reference target type → inherited group $type → MISSING_TYPE.
 */

import {
  isCurlyBraceAlias,
  isJsonObject,
  isJsonPointerRef,
  isLegacyAliasObject,
  resolveReferenceFully,
  type Json,
  type JsonObject,
} from './reference-resolver'

export type TypeOrigin = 'explicit' | 'inherited' | 'alias'

export type EffectiveTypeResult =
  | {
      ok: true
      type: string
      origin: TypeOrigin
    }
  | {
      ok: false
      code: 'MISSING_TYPE' | 'UNRESOLVED_ALIAS' | 'CIRCULAR_ALIAS' | 'INVALID_VALUE'
      message: string
    }

function readLocalType(node: JsonObject): string | undefined {
  return typeof node.$type === 'string' ? node.$type : undefined
}

/**
 * Resolve the effective type for a token leaf at `pathSegments` within `root`.
 * `inheritedType` is the nearest parent group $type already computed by the walker.
 */
export function resolveEffectiveTypeForLeaf(
  root: Json,
  leaf: JsonObject,
  inheritedType: string | undefined,
  seenAliasTargets: Set<string> = new Set(),
): EffectiveTypeResult {
  const hasValue = Object.prototype.hasOwnProperty.call(leaf, '$value')
  if (!hasValue) {
    return {
      ok: false,
      code: 'MISSING_TYPE',
      message: 'Node is not a token leaf (missing $value)',
    }
  }

  const explicit = readLocalType(leaf)
  if (explicit) {
    return { ok: true, type: explicit, origin: 'explicit' }
  }

  const value = leaf.$value

  if (isLegacyAliasObject(value)) {
    return {
      ok: false,
      code: 'INVALID_VALUE',
      message:
        'Legacy non-spec alias object { "alias": "{path}" } is not supported for type resolution',
    }
  }

  if (isCurlyBraceAlias(value) || isJsonPointerRef(value)) {
    const resolved = resolveReferenceFully(root, value, {}, new Set(seenAliasTargets))
    if (!resolved.ok) {
      if (resolved.code === 'CIRCULAR_ALIAS') {
        return { ok: false, code: 'CIRCULAR_ALIAS', message: resolved.message }
      }
      if (resolved.code === 'UNRESOLVED_ALIAS') {
        return { ok: false, code: 'UNRESOLVED_ALIAS', message: resolved.message }
      }
      return { ok: false, code: 'INVALID_VALUE', message: resolved.message }
    }

    // If the reference resolved to a token leaf's $value, recover the target token's type
    // by resolving the reference target path's token node when possible.
    const targetType = resolveTypeOfReferenceTarget(root, value, seenAliasTargets)
    if (targetType.ok) {
      return { ok: true, type: targetType.type, origin: 'alias' }
    }
    return targetType
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

function resolveTypeOfReferenceTarget(
  root: Json,
  value: Json,
  seen: Set<string>,
): EffectiveTypeResult {
  // Walk one reference hop to the token leaf (for curly-brace) or owning token (for pointers).
  if (isCurlyBraceAlias(value)) {
    const path = value.slice(1, -1)
    if (seen.has(`curly:${path}`)) {
      return {
        ok: false,
        code: 'CIRCULAR_ALIAS',
        message: `Circular reference detected at "${path}"`,
      }
    }
    seen.add(`curly:${path}`)

    const segments = path.split('.').filter(Boolean)
    let node: Json = root
    for (const segment of segments) {
      if (!isJsonObject(node) || !Object.prototype.hasOwnProperty.call(node, segment)) {
        return {
          ok: false,
          code: 'UNRESOLVED_ALIAS',
          message: `Unresolved reference "{${path}}"`,
        }
      }
      node = node[segment]
    }

    if (!isJsonObject(node) || !Object.prototype.hasOwnProperty.call(node, '$value')) {
      return {
        ok: false,
        code: 'INVALID_VALUE',
        message: `Reference "{${path}}" does not target a token`,
      }
    }

    // Inherited type for the target: walk parents in the path.
    let inherited: string | undefined
    let cursor: Json = root
    for (let i = 0; i < segments.length - 1; i++) {
      if (!isJsonObject(cursor)) break
      const child = cursor[segments[i]!]
      if (!isJsonObject(child)) break
      if (typeof child.$type === 'string') inherited = child.$type
      cursor = child
    }

    return resolveEffectiveTypeForLeaf(root, node, inherited, seen)
  }

  if (isJsonPointerRef(value)) {
    // For pointers into a token, find the nearest ancestor token leaf along the pointer.
    const pointer = value.$ref
    let raw = pointer.trim()
    if (raw.startsWith('#')) raw = raw.slice(1)
    if (!raw.startsWith('/')) {
      return { ok: false, code: 'INVALID_VALUE', message: `Invalid JSON Pointer: ${pointer}` }
    }
    const segments = raw
      .slice(1)
      .split('/')
      .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))

    if (seen.has(`ptr:${pointer}`)) {
      return {
        ok: false,
        code: 'CIRCULAR_ALIAS',
        message: `Circular reference detected at "${pointer}"`,
      }
    }
    seen.add(`ptr:${pointer}`)

    let inherited: string | undefined
    let cursor: Json = root
    let lastToken: JsonObject | null = null
    let lastTokenInherited: string | undefined

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!
      if (Array.isArray(cursor)) {
        const index = Number(segment)
        if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
          return {
            ok: false,
            code: 'UNRESOLVED_ALIAS',
            message: `Unresolved JSON Pointer reference "${pointer}"`,
          }
        }
        cursor = cursor[index]
        continue
      }
      if (!isJsonObject(cursor) || !Object.prototype.hasOwnProperty.call(cursor, segment)) {
        return {
          ok: false,
          code: 'UNRESOLVED_ALIAS',
          message: `Unresolved JSON Pointer reference "${pointer}"`,
        }
      }
      const next = cursor[segment]
      if (isJsonObject(cursor) && typeof cursor.$type === 'string' && segment !== '$value') {
        // group/token container type before descending
      }
      if (isJsonObject(next)) {
        if (typeof next.$type === 'string') inherited = next.$type
        if (Object.prototype.hasOwnProperty.call(next, '$value')) {
          lastToken = next
          lastTokenInherited = inherited
        }
      }
      cursor = next
    }

    if (lastToken) {
      return resolveEffectiveTypeForLeaf(root, lastToken, lastTokenInherited, seen)
    }

    return {
      ok: false,
      code: 'MISSING_TYPE',
      message: `JSON Pointer "${pointer}" does not address a typed token`,
    }
  }

  return {
    ok: false,
    code: 'MISSING_TYPE',
    message: 'Value is not a reference',
  }
}
