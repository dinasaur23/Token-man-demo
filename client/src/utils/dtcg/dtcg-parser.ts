export type ColorTokenEntry = { path: string; value: string }
export type ColorRow = {
  name: string
  value: string // resolved hex
  raw: unknown // raw $value or alias
  group: string // e.g. "brandRole.intent.success"
  groupPath: string[] // e.g. ["brandRole", "intent", "success"]
}

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

function findEntryForTarget(
  target: string,
  map: Record<string, ColorTokenEntry>,
): ColorTokenEntry | null {
  // 1) exact match
  if (map[target]) return map[target]

  // 2) suffix match: “…global.color.brandRole.intent.info.medium”
  const suffix = '.' + target

  for (const entry of Object.values(map)) {
    if (entry.path === target || entry.path.endsWith(suffix)) {
      return entry
    }
  }

  return null
}

export function resolveValue(
  valueOrAlias: unknown,
  map: Record<string, ColorTokenEntry>,
  seen: Set<string> = new Set(),
): string | null {
  // plain hex, e.g. "#0f172a"
  if (isHex(valueOrAlias)) return valueOrAlias

  // object form: { hex: "#xxxxxx" } or { alias: "{...}" }
  if (valueOrAlias && typeof valueOrAlias === 'object') {
    const obj = valueOrAlias as Record<string, unknown>
    if (isHex(obj.hex)) return obj.hex
    if (typeof obj.alias === 'string') {
      return resolveValue(obj.alias, map, seen)
    }
    return null
  }

  // string alias "{foo.bar.baz}"
  if (isAlias(valueOrAlias)) {
    const target = aliasTarget(valueOrAlias) // e.g. "global.color.brandRole.intent.info.medium"

    const entry = findEntryForTarget(target, map)
    if (!entry) return null

    if (seen.has(entry.path)) {
      // avoid cycles
      return null
    }
    seen.add(entry.path)

    return resolveValue(entry.value, map, seen)
  }

  return null
}

/** Resolve the token at `path` (follows aliases until hex). */
export function resolveAlias(path: string, map: Record<string, ColorTokenEntry>): string | null {
  const entry = map[path]
  if (!entry) return null
  return resolveValue(entry.value, map, new Set())
}
