/**
 * Shared DTCG reference resolver.
 *
 * Supported representations:
 * - Curly-brace token alias (string): "{path.to.token}" / "{group.$root}"
 * - JSON Pointer object: { "$ref": "#/path/to/property" }
 *
 * Rejected legacy non-spec shape:
 * - { "alias": "{path.to.token}" }
 */

export type Json = unknown
export type JsonObject = Record<string, Json>

export type ReferenceKind = 'curly-brace' | 'json-pointer'

export type ReferenceResolutionErrorCode =
  | 'UNRESOLVED_ALIAS'
  | 'CIRCULAR_ALIAS'
  | 'ALIAS_TARGETS_GROUP'
  | 'INVALID_ROOT_USAGE'
  | 'INVALID_VALUE'
  | 'INVALID_POINTER'

export type ReferenceResolutionResult =
  | { ok: true; value: Json; kind: ReferenceKind; targetPath: string }
  | {
      ok: false
      code: ReferenceResolutionErrorCode
      message: string
      kind?: ReferenceKind
      targetPath?: string
    }

const CURLY_BRACE_PATTERN = /^\{([^}]+)\}$/

export function isJsonObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Curly-brace alias string, e.g. "{spacing.medium}". */
export function isCurlyBraceAlias(value: Json): value is string {
  return typeof value === 'string' && CURLY_BRACE_PATTERN.test(value)
}

/** JSON Pointer reference object, e.g. { "$ref": "#/colors/blue/$value" }. */
export function isJsonPointerRef(value: Json): value is { $ref: string } {
  if (!isJsonObject(value)) return false
  if (typeof value.$ref !== 'string') return false
  // Must not be confused with legacy { alias: "..." } (rejected separately).
  return true
}

/** Legacy non-spec shape to remove: { "alias": "{path}" }. */
export function isLegacyAliasObject(value: Json): boolean {
  if (!isJsonObject(value)) return false
  if (!Object.prototype.hasOwnProperty.call(value, 'alias')) return false
  // A valid JSON Pointer ref may coexist with other keys; legacy alias objects
  // are identified by `alias` without a `$ref`.
  if (typeof value.$ref === 'string') return false
  return typeof value.alias === 'string'
}

export function parseCurlyBracePath(value: string): string | null {
  const match = value.match(CURLY_BRACE_PATTERN)
  return match?.[1] ?? null
}

export function tokenPathToSegments(tokenPath: string): string[] {
  return tokenPath.split('.').filter((s) => s.length > 0)
}

export function segmentsToTokenPath(segments: string[]): string {
  return segments.join('.')
}

/**
 * Decode a JSON Pointer (RFC 6901) into path segments.
 * Accepts forms: "#/a/b", "/a/b".
 */
export function parseJsonPointer(pointer: string): string[] | null {
  let raw = pointer.trim()
  if (raw.startsWith('#')) raw = raw.slice(1)
  if (raw === '') return []
  if (!raw.startsWith('/')) return null

  return raw
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
}

export function getNodeAtSegments(root: Json, segments: string[]): Json | undefined {
  let current: Json = root
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined
      current = current[index]
      continue
    }
    if (!isJsonObject(current)) return undefined
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined
    current = current[segment]
  }
  return current
}

function isTokenLeaf(node: Json): boolean {
  return isJsonObject(node) && Object.prototype.hasOwnProperty.call(node, '$value')
}

function isGroupNode(node: Json): boolean {
  return isJsonObject(node) && !Object.prototype.hasOwnProperty.call(node, '$value')
}

/**
 * Classify a path that ends at a document node for token-reference purposes.
 */
export function classifyReferenceTarget(
  root: Json,
  segments: string[],
): {
  status: 'token' | 'group' | 'value' | 'missing' | 'invalid-root'
  node?: Json
} {
  if (segments.length === 0) {
    return { status: 'missing' }
  }

  // `$root` may only appear as a token name segment, not alone at document root.
  if (segments[0] === '$root' && segments.length === 1) {
    return { status: 'invalid-root' }
  }

  const node = getNodeAtSegments(root, segments)
  if (node === undefined) return { status: 'missing' }

  if (isTokenLeaf(node)) return { status: 'token', node }
  if (isGroupNode(node)) return { status: 'group', node }
  return { status: 'value', node }
}

export type ResolveReferenceOptions = {
  /** When true, curly-brace refs that land on a group are errors (default). */
  requireTokenTargetForCurlyBrace?: boolean
}

/**
 * Resolve a single reference value against a source/merged document root.
 * Does not replace references inside the returned value (one hop); use
 * `resolveReferenceFully` for chains.
 */
export function resolveReferenceOnce(
  root: Json,
  value: Json,
  options: ResolveReferenceOptions = {},
): ReferenceResolutionResult {
  const requireTokenTarget = options.requireTokenTargetForCurlyBrace !== false

  if (isLegacyAliasObject(value)) {
    return {
      ok: false,
      code: 'INVALID_VALUE',
      message:
        'Legacy non-spec alias object { "alias": "{path}" } is not supported. Use a curly-brace string "$value" or a JSON Pointer { "$ref": "#/..." }.',
    }
  }

  if (isCurlyBraceAlias(value)) {
    const tokenPath = parseCurlyBracePath(value)
    if (!tokenPath) {
      return {
        ok: false,
        code: 'INVALID_VALUE',
        message: `Invalid curly-brace alias: ${JSON.stringify(value)}`,
        kind: 'curly-brace',
      }
    }

    const segments = tokenPathToSegments(tokenPath)
    const classified = classifyReferenceTarget(root, segments)

    if (classified.status === 'invalid-root') {
      return {
        ok: false,
        code: 'INVALID_ROOT_USAGE',
        message: `Invalid $root usage in reference "{${tokenPath}}"`,
        kind: 'curly-brace',
        targetPath: tokenPath,
      }
    }

    if (classified.status === 'missing') {
      return {
        ok: false,
        code: 'UNRESOLVED_ALIAS',
        message: `Unresolved reference "{${tokenPath}}"`,
        kind: 'curly-brace',
        targetPath: tokenPath,
      }
    }

    if (classified.status === 'group') {
      if (requireTokenTarget) {
        return {
          ok: false,
          code: 'ALIAS_TARGETS_GROUP',
          message: `Reference "{${tokenPath}}" targets a group. Use "{${tokenPath}.$root}" to reference the group's root token.`,
          kind: 'curly-brace',
          targetPath: tokenPath,
        }
      }
    }

    if (classified.status === 'token') {
      const leaf = classified.node as JsonObject
      return {
        ok: true,
        value: leaf.$value,
        kind: 'curly-brace',
        targetPath: tokenPath,
      }
    }

    // Non-token value via curly-brace is not valid (curly-brace targets tokens only).
    return {
      ok: false,
      code: 'ALIAS_TARGETS_GROUP',
      message: `Curly-brace reference "{${tokenPath}}" must target a token with $value`,
      kind: 'curly-brace',
      targetPath: tokenPath,
    }
  }

  if (isJsonPointerRef(value)) {
    const pointer = value.$ref
    const segments = parseJsonPointer(pointer)
    if (segments === null) {
      return {
        ok: false,
        code: 'INVALID_POINTER',
        message: `Invalid JSON Pointer: ${JSON.stringify(pointer)}`,
        kind: 'json-pointer',
      }
    }

    const node = getNodeAtSegments(root, segments)
    if (node === undefined) {
      return {
        ok: false,
        code: 'UNRESOLVED_ALIAS',
        message: `Unresolved JSON Pointer reference "${pointer}"`,
        kind: 'json-pointer',
        targetPath: segmentsToTokenPath(segments),
      }
    }

    return {
      ok: true,
      value: node,
      kind: 'json-pointer',
      targetPath: segmentsToTokenPath(segments),
    }
  }

  return {
    ok: false,
    code: 'INVALID_VALUE',
    message: 'Value is not a curly-brace alias or JSON Pointer $ref object',
  }
}

export function isReferenceValue(value: Json): boolean {
  return isCurlyBraceAlias(value) || isJsonPointerRef(value) || isLegacyAliasObject(value)
}

/**
 * Fully resolve reference chains (curly-brace and JSON Pointer).
 * Detects cycles via seen target paths.
 * Non-reference values are returned as a successful passthrough with kind omitted via ok+empty target.
 */
export function resolveReferenceFully(
  root: Json,
  value: Json,
  options: ResolveReferenceOptions = {},
  seen: Set<string> = new Set(),
): ReferenceResolutionResult {
  if (isLegacyAliasObject(value)) {
    return resolveReferenceOnce(root, value, options)
  }

  if (!isCurlyBraceAlias(value) && !isJsonPointerRef(value)) {
    return {
      ok: true,
      value,
      kind: 'curly-brace',
      targetPath: '',
    }
  }

  const once = resolveReferenceOnce(root, value, options)
  if (!once.ok) return once

  const key = `${once.kind}:${once.targetPath}`
  if (seen.has(key)) {
    return {
      ok: false,
      code: 'CIRCULAR_ALIAS',
      message: `Circular reference detected at "${once.targetPath}"`,
      kind: once.kind,
      targetPath: once.targetPath,
    }
  }

  seen.add(key)

  if (isCurlyBraceAlias(once.value) || isJsonPointerRef(once.value) || isLegacyAliasObject(once.value)) {
    return resolveReferenceFully(root, once.value, options, seen)
  }

  return once
}
