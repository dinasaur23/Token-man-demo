/**
 * Shared DTCG tree helpers for exporters.
 */

export function isJsonObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

/** Curly-brace alias string, e.g. "{colors.black}". */
export function isCurlyBraceAlias(value) {
  return typeof value === 'string' && /^\{[^}]+\}$/.test(value)
}

/**
 * A token leaf has `$value` (DTCG). Groups may have `$type` without `$value`.
 */
export function isTokenLeaf(node) {
  return isJsonObject(node) && Object.prototype.hasOwnProperty.call(node, '$value')
}

/**
 * Walk every token leaf. Visitor may mutate `node` in place.
 * @param {unknown} root
 * @param {(node: Record<string, unknown>, path: string, inheritedType: string | undefined) => void} visitor
 */
export function walkTokenLeaves(root, visitor) {
  function visit(node, pathSegments, inheritedType) {
    if (!isJsonObject(node)) return

    const nextInherited =
      typeof node.$type === 'string' ? node.$type : inheritedType

    if (isTokenLeaf(node)) {
      visitor(node, pathSegments.join('.'), nextInherited)
      return
    }

    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) continue
      visit(child, pathSegments.concat(key), nextInherited)
    }
  }

  visit(root, [], undefined)
}

/**
 * Dimension-shaped `$value`: `{ value: number, unit: string }`.
 */
export function isDimensionValue(value) {
  return (
    isJsonObject(value) &&
    typeof value.value === 'number' &&
    typeof value.unit === 'string'
  )
}
