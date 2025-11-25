//export type ColorTokenEntry = { path: string; value: string }
export type ColorRow = {
  name: string
  value: string
  raw: unknown
  group: string
  groupPath: string[]
}

// type DTCGNode = { [key: string]: unknown }
type Json = unknown
type JsonObject = Record<string, Json>

export type ColorTokenEntry = {
  path: string
  value: Json
}

const AliasPattern = /^\{([^}]+)\}$/

const isObject = (v: Json): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function collectColorTokensWithPath(root: Json): ColorTokenEntry[] {
  const results: ColorTokenEntry[] = []

  function visit(node: Json, pathParts: string[], inheritedType?: string): void {
    if (!isObject(node)) return

    const localType = typeof node['$type'] === 'string' ? String(node['$type']) : undefined
    const effectiveType = localType ?? inheritedType

    const hasValue = Object.prototype.hasOwnProperty.call(node, '$value')

    if (effectiveType === 'color' && hasValue) {
      results.push({
        path: pathParts.join('.'),
        value: (node as JsonObject)['$value'],
      })
    }

    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue // skip $themes, $metadata, etc.
      visit(value, [...pathParts, key], effectiveType)
    }
  }

  if (isObject(root)) {
    for (const [key, value] of Object.entries(root)) {
      visit(value, [key], undefined)
    }
  }

  return results
}
export function findEntryForTarget(
  target: string,
  map: Record<string, ColorTokenEntry>,
): ColorTokenEntry | null {
  if (map[target]) return map[target]

  const suffix = '.' + target

  for (const entry of Object.values(map)) {
    if (entry.path === target || entry.path.endsWith(suffix)) {
      return entry
    }
  }

  return null
}

export function resolveValue(value: Json, map: Record<string, ColorTokenEntry>): Json | undefined {
  // string alias
  if (typeof value === 'string') {
    const m = value.match(AliasPattern)
    if (!m) return undefined
    const targetPath = m[1]
    return resolveAlias(targetPath, map)
  }

  // object alias: { alias: "{...}" }
  if (isObject(value)) {
    const aliasValue = value['alias']
    if (typeof aliasValue === 'string') {
      const m = aliasValue.match(AliasPattern)
      if (!m) return undefined
      const targetPath = m[1]
      return resolveAlias(targetPath, map)
    }
  }

  return undefined
}

export function resolveAlias(
  path: string,
  map: Record<string, ColorTokenEntry>,
  seen: Set<string> = new Set(),
): Json | undefined {
  const entry = map[path]
  if (!entry) return undefined

  const value = entry.value

  // alias as string: "{path.to.token}"
  if (typeof value === 'string') {
    const m = value.match(AliasPattern)
    if (!m) return value // not an alias string, treat as literal

    const targetPath = m[1]
    if (seen.has(targetPath)) return undefined // avoid cycles

    seen.add(targetPath)
    return resolveAlias(targetPath, map, seen) ?? map[targetPath]?.value
  }

  // alias as object: { alias: "{...}" }
  if (isObject(value)) {
    const aliasValue = value['alias']
    if (typeof aliasValue === 'string') {
      const m = aliasValue.match(AliasPattern)
      if (!m) return value

      const targetPath = m[1]
      if (seen.has(targetPath)) return undefined

      seen.add(targetPath)
      return resolveAlias(targetPath, map, seen) ?? map[targetPath]?.value
    }
  }

  // already a resolved value
  return value
}
