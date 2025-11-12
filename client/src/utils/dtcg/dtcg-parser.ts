// export type ColorRow = { name: string; value: string }

// export type ColorTokenEntry = {
//   path: string
//   value: string
// }

// type DTCGNode = { [key: string]: unknown }

// function isObject(value: unknown): value is DTCGNode {
//   return typeof value === 'object' && value !== null
// }

// function isAlias(value: string): boolean {
//   return value.startsWith('{') && value.endsWith('}')
// }

// function aliasTarget(value: string): string {
//   return value.slice(1, -1) // "{a.b}" -> "a.b"
// }

// export function collectColorTokensWithPath(
//   node: unknown,
//   prefix: string,
//   inheritedType?: string,
// ): ColorTokenEntry[] {
//   const result: ColorTokenEntry[] = []
//   if (!isObject(node)) return result

//   const ownType = typeof node.$type === 'string' ? (node.$type as string) : inheritedType

//   for (const [key, value] of Object.entries(node)) {
//     if (key.startsWith('$')) continue
//     if (!isObject(value)) continue

//     const child = value as DTCGNode
//     const childType = typeof child.$type === 'string' ? (child.$type as string) : ownType
//     const path = prefix ? `${prefix}.${key}` : key

//     if (typeof child.$value === 'string') {
//       if (childType === 'color') {
//         result.push({ path, value: child.$value })
//       }
//       continue
//     }

//     const nested = collectColorTokensWithPath(child, path, childType)
//     result.push(...nested)
//   }

//   return result
// }

// export function resolveAlias(
//   path: string,
//   map: Record<string, ColorTokenEntry>,
//   stack: string[] = [],
// ): string | null {
//   const entry = map[path]
//   if (!entry) return null

//   const raw = entry.value
//   if (!isAlias(raw)) return raw

//   const target = aliasTarget(raw)
//   if (stack.includes(target)) return null

//   return resolveAlias(target, map, [...stack, target])
// }

export type ColorRow = { name: string; value: string; raw?: unknown }
export type ColorTokenEntry = { path: string; value: string }

type DTCGNode = { [key: string]: unknown }

function isObject(v: unknown): v is DTCGNode {
  return typeof v === 'object' && v !== null
}
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const ALIAS_RE = /^\{([^}]+)\}$/

function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v)
}
function isAlias(v: unknown): v is string {
  return typeof v === 'string' && ALIAS_RE.test(v)
}
function aliasTarget(v: string): string {
  return v.match(ALIAS_RE)![1]
}

/** Walks JSON, supports group-level and token-level $type:"color", with nesting. */
export function collectColorTokensWithPath(
  node: unknown,
  prefix: string,
  inheritedType?: string,
): ColorTokenEntry[] {
  const out: ColorTokenEntry[] = []
  if (!isObject(node)) return out

  const ownType = typeof node.$type === 'string' ? (node.$type as string) : inheritedType

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue
    if (!isObject(value)) continue

    const child = value as DTCGNode
    const childType = typeof child.$type === 'string' ? (child.$type as string) : ownType
    const path = prefix ? `${prefix}.${key}` : key

    if (typeof child.$value === 'string') {
      if (childType === 'color') out.push({ path, value: child.$value })
      continue
    }

    out.push(...collectColorTokensWithPath(child, path, childType))
  }
  return out
}

export function resolveValue(
  valueOrAlias: unknown,
  map: Record<string, ColorTokenEntry>,
  seen: Set<string> = new Set(),
): string | null {
  if (isHex(valueOrAlias)) return valueOrAlias

  if (valueOrAlias && typeof valueOrAlias === 'object') {
    const obj = valueOrAlias as Record<string, unknown>
    if (isHex(obj.hex)) return obj.hex
    if (typeof obj.alias === 'string') return resolveValue(obj.alias, map, seen)
    return null
  }

  if (isAlias(valueOrAlias)) {
    const target = aliasTarget(valueOrAlias)
    if (seen.has(target)) return null
    seen.add(target)
    const entry = map[target]
    return entry ? resolveValue(entry.value, map, seen) : null
  }

  return null
}

/** Resolve "{a.b}" -> final value. Returns null if unresolved/cycle. */
export function resolveAlias(path: string, map: Record<string, ColorTokenEntry>): string | null {
  const entry = map[path]
  if (!entry) return null
  return resolveValue(entry.value, map)
}
