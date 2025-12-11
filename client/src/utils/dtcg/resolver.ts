export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonObject | JsonArray

export interface JsonObject {
  [key: string]: JsonValue | undefined
}

export type JsonArray = JsonValue[]

export interface DetectedModifier {
  name: string
  values: string[]
  defaultValue?: string
}

export interface ResolverSourceRef extends JsonObject {
  $ref: string
}

export type ResolverSource = ResolverSourceRef | JsonObject

export interface ResolverSet extends JsonObject {
  description?: string
  sources: ResolverSource[]
}

export interface ResolverModifier extends JsonObject {
  description?: string
  contexts: Record<string, ResolverSource[]>
  default?: string
}

export interface ResolverOrderEntry extends JsonObject {
  $ref: string
}

export interface ResolverDocument extends JsonObject {
  version: string
  name?: string
  description?: string
  sets?: Record<string, ResolverSet>
  modifiers?: Record<string, ResolverModifier>
  resolutionOrder: ResolverOrderEntry[]
}

export type ResolverInput = Record<string, string>

export interface GroupScopedModifierInfo {
  modifierName: string
  groupModes: Record<string, string[]>
}

// ---------- small helpers ----------------------------------------------------

export function applySelectedContextsToDoc(doc: JsonObject, input: ResolverInput): JsonObject {
  const selectedMode = input.mode || null

  console.log('[Resolver] applySelectedContextsToDoc start. Selected mode =', selectedMode)

  // helper type for the figma extension we actually use
  type FigmaExtension = {
    valuesByMode?: Record<string, JsonValue>
    defaultMode?: string
  }

  function visit(value: JsonValue): JsonValue {
    // arrays
    if (Array.isArray(value)) {
      return (value as JsonArray).map(visit)
    }

    // objects
    if (isJsonObject(value)) {
      const obj = value as JsonObject
      const out: JsonObject = {}

      for (const [key, v] of Object.entries(obj)) {
        out[key] = visit(v as JsonValue)
      }

      // ---------- Figma-mode handling ----------
      if (selectedMode && obj.$extensions && isJsonObject(obj.$extensions)) {
        const ext = obj.$extensions as { figma?: FigmaExtension }
        const fig = ext.figma

        if (fig && typeof fig === 'object') {
          const valuesByMode = fig.valuesByMode
          if (valuesByMode && typeof valuesByMode === 'object') {
            const defaultMode: string | undefined = fig.defaultMode
            const keys = Object.keys(valuesByMode)

            const map = valuesByMode as Record<string, JsonValue>

            const chosen: JsonValue | undefined =
              map[selectedMode] ??
              (defaultMode ? map[defaultMode] : undefined) ??
              (keys.length ? map[keys[0]] : undefined)

            if (typeof chosen === 'string') {
              // ✅ override $value with final scalar used by table & exporter
              out.$value = chosen
            }
          }
        }
      }

      return out
    }

    // primitives
    return value
  }

  const resolved = visit(doc) as JsonObject

  // DEBUG: log a sample token after resolution
  ;(() => {
    const cKeys = Object.keys(resolved)
    if (!cKeys.length) {
      console.log('[Resolver][DEBUG] No tokens after applySelectedContextsToDoc')
      return
    }

    const firstCollection = cKeys[0]
    const groupValue = resolved[firstCollection]

    if (!isJsonObject(groupValue)) {
      console.log('[Resolver][DEBUG] First collection not an object')
      return
    }

    const group = groupValue as JsonObject
    const tKeys = Object.keys(group)
    if (!tKeys.length) {
      console.log('[Resolver][DEBUG] First collection has no tokens')
      return
    }

    const firstTokenKey = tKeys[0]
    const tokenValue = group[firstTokenKey]

    if (!isJsonObject(tokenValue)) {
      console.log('[Resolver][DEBUG] First token is not an object')
      return
    }

    const token = tokenValue as JsonObject & { $value?: JsonValue }

    console.log(
      '[Resolver][DEBUG] Sample AFTER resolution:',
      `${firstCollection}/${firstTokenKey}`,
      'typeof $value =',
      typeof token.$value,
      'value =',
      token.$value,
    )
  })()

  console.log('[Resolver] applySelectedContextsToDoc end')
  return resolved
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepMergeDocs(target: JsonValue, source: JsonValue): JsonValue {
  if (!isJsonObject(target)) return source
  if (!isJsonObject(source)) return source

  const tObj = target
  const sObj = source

  const out: JsonObject = { ...tObj }

  for (const key of Object.keys(sObj)) {
    const tVal = tObj[key]
    const sVal = sObj[key]

    let merged: JsonValue

    if (tVal === undefined) {
      merged = sVal as JsonValue
    } else if (sVal === undefined) {
      merged = tVal
    } else {
      merged = deepMergeDocs(tVal, sVal)
    }

    out[key] = merged
  }

  return out
}

function mergeAllDocs(docs: Record<string, JsonValue>): JsonObject {
  const values = Object.values(docs)
  if (values.length === 0) return {}

  let result: JsonValue = {}

  for (const doc of values) {
    result = deepMergeDocs(result, doc)
  }

  return isJsonObject(result) ? result : {}
}

function isResolverDocument(value: JsonValue): value is ResolverDocument {
  if (!isJsonObject(value)) return false
  const maybe = value as { resolutionOrder?: JsonValue }
  return Array.isArray(maybe.resolutionOrder)
}

function isSourceRef(source: ResolverSource): source is ResolverSourceRef {
  return isJsonObject(source) && typeof (source as JsonObject).$ref === 'string'
}

function loadTokenSource(source: ResolverSource, docs: Record<string, JsonValue>): JsonObject {
  if (!isSourceRef(source)) {
    // inline object
    return source
  }

  const ref = source.$ref
  const [fileName] = ref.split('#')

  if (ref.startsWith('#/')) {
    throw new Error(`Internal JSON Pointer "${ref}" is not allowed for token sources.`)
  }

  const doc = docs[fileName]

  if (!doc) {
    throw new Error(`No uploaded document found for $ref "${ref}". Expected key "${fileName}".`)
  }
  if (!isJsonObject(doc)) {
    throw new Error(`Document "${fileName}" is not a JSON object.`)
  }

  return doc
}

// ---------- resolving sets & modifiers ---------------------------------------

function resolveSet(set: ResolverSet, docs: Record<string, JsonValue>): JsonObject {
  let result: JsonValue = {}

  for (const src of set.sources) {
    const tokensObject = loadTokenSource(src, docs)
    result = deepMergeDocs(result, tokensObject)
  }

  return isJsonObject(result) ? result : {}
}

function resolveModifier(
  name: string,
  modifier: ResolverModifier,
  docs: Record<string, JsonValue>,
  input: ResolverInput,
): JsonObject {
  const value = input[name] ?? modifier.default
  if (!value) {
    throw new Error(`Missing value for modifier "${name}" and no default defined.`)
  }

  const contextSources = modifier.contexts[value]
  if (!contextSources) {
    const allowed = Object.keys(modifier.contexts).join(', ')
    throw new Error(`Invalid value "${value}" for modifier "${name}". Allowed values: ${allowed}.`)
  }

  let result: JsonValue = {}

  for (const src of contextSources) {
    const tokensObject = loadTokenSource(src, docs)
    result = deepMergeDocs(result, tokensObject)
  }

  return isJsonObject(result) ? result : {}
}

// ---------- main resolver for a ResolverDocument -----------------------------

export function resolveWithResolverDocument(
  resolver: ResolverDocument,
  docs: Record<string, JsonValue>,
  input: ResolverInput = {},
): JsonObject {
  let result: JsonValue = {}

  for (const entry of resolver.resolutionOrder) {
    const ref = entry.$ref

    if (ref.startsWith('#/sets/')) {
      const setName = ref.slice('#/sets/'.length)
      const set = resolver.sets?.[setName]
      if (!set) {
        throw new Error(`Unknown set "${setName}" in resolutionOrder.`)
      }
      const merged = resolveSet(set, docs)
      result = deepMergeDocs(result, merged)
    } else if (ref.startsWith('#/modifiers/')) {
      const modifierName = ref.slice('#/modifiers/'.length)
      const modifier = resolver.modifiers?.[modifierName]
      if (!modifier) {
        throw new Error(`Unknown modifier "${modifierName}" in resolutionOrder.`)
      }
      const merged = resolveModifier(modifierName, modifier, docs, input)
      result = deepMergeDocs(result, merged)
    } else {
      // direct reference to a token document
      const pseudoSet: ResolverSet = { sources: [{ $ref: ref }] }
      const merged = resolveSet(pseudoSet, docs)
      result = deepMergeDocs(result, merged)
    }
  }

  return isJsonObject(result) ? result : {}
}

// export function resolveUploadedDocuments(
//   docs: Record<string, JsonValue>,
//   input: ResolverInput = {},
// ): JsonObject {
//   const resolverEntry = Object.entries(docs).find(([, value]) => isResolverDocument(value))

//   if (!resolverEntry) {
//     // no resolver found -> simple merge (old behaviour) ...
//     const merged = mergeAllDocs(docs)
//     // ... plus: apply selected modifier values to $value objects
//     return applySelectedContextsToDoc(merged, input)
//   }

//   const resolverValue = resolverEntry[1]
//   if (!isResolverDocument(resolverValue)) {
//     throw new Error('Resolver document has wrong shape.')
//   }

//   const resolverDoc = resolverValue
//   return resolveWithResolverDocument(resolverDoc, docs, input)
// }
export function resolveUploadedDocuments(
  docs: Record<string, JsonValue>,
  input: ResolverInput = {},
): JsonObject {
  console.log('[Resolver] resolveUploadedDocuments called', {
    docNames: Object.keys(docs),
    input,
  })

  const resolverEntry = Object.entries(docs).find(([, value]) => isResolverDocument(value))

  if (!resolverEntry) {
    console.log(
      '[Resolver] no resolver doc found → simple mergeAllDocs + applySelectedContextsToDoc',
    )
    const merged = mergeAllDocs(docs)
    console.log('[Resolver] merged document sample:', JSON.stringify(merged, null, 2).slice(0, 500))
    const applied = applySelectedContextsToDoc(merged, input)
    console.log(
      '[Resolver] after applySelectedContextsToDoc sample:',
      JSON.stringify(applied, null, 2).slice(0, 500),
    )
    return applied
  }

  console.log('[Resolver] resolver doc found:', resolverEntry[0])
  const resolverValue = resolverEntry[1]
  if (!isResolverDocument(resolverValue)) {
    throw new Error('Resolver document has wrong shape.')
  }

  const resolverDoc = resolverValue
  const resolved = resolveWithResolverDocument(resolverDoc, docs, input)
  console.log(
    '[Resolver] resolveWithResolverDocument finished, sample:',
    JSON.stringify(resolved, null, 2).slice(0, 500),
  )
  return resolved
}

export function extractModifiersFromDocs(docs: Record<string, JsonValue>): DetectedModifier[] {
  const resolverEntry = Object.entries(docs).find(([, value]) => isResolverDocument(value))

  if (!resolverEntry) {
    return []
  }

  const resolverValue = resolverEntry[1]
  if (!isResolverDocument(resolverValue)) {
    // should never happen at runtime, but keeps TS happy
    return []
  }

  const resolver = resolverValue
  const modifiers = resolver.modifiers ?? {}

  return Object.entries(modifiers).map(([name, modifier]) => ({
    name,
    values: Object.keys(modifier.contexts),
    defaultValue: modifier.default,
  }))
}
export function extractGroupModesFromResolverDocs(
  docs: Record<string, JsonValue>,
  preferredModifierName = 'mode',
): GroupScopedModifierInfo | null {
  const resolverEntry = Object.entries(docs).find(([, value]) => isResolverDocument(value))
  if (!resolverEntry) return null

  const resolverValue = resolverEntry[1]
  if (!isResolverDocument(resolverValue)) {
    return null
  }

  const resolver = resolverValue
  const modifiers = resolver.modifiers ?? {}

  const modifierNames = Object.keys(modifiers)
  if (modifierNames.length === 0) return null

  // helper: only return name if it actually exists in the resolver
  const pickIfExists = (name: string): string | null => (name in modifiers ? name : null)

  let modifierName: string | null = null

  // 1. explicit preferred name, if it exists
  if (preferredModifierName) {
    modifierName = pickIfExists(preferredModifierName)
  }

  // 2. otherwise try our common names in order
  if (!modifierName) {
    modifierName =
      pickIfExists('mode') ?? // old case (light/dark)
      pickIfExists('density') ?? // your example5.resolver
      null
  }

  // 3. final fallback → first modifier defined in the resolver
  if (!modifierName) {
    modifierName = modifierNames[0]
  }

  const modifier = modifiers[modifierName]
  if (!modifier) return null

  const groupMap = new Map<string, Set<string>>()

  for (const [contextValue, sources] of Object.entries(modifier.contexts ?? {})) {
    for (const src of sources) {
      const tokensObject = loadTokenSource(src, docs)
      if (!isJsonObject(tokensObject)) continue

      for (const groupKey of Object.keys(tokensObject)) {
        if (!groupKey) continue
        let set = groupMap.get(groupKey)
        if (!set) {
          set = new Set<string>()
          groupMap.set(groupKey, set)
        }
        set.add(contextValue)
      }
    }
  }

  const groupModes: Record<string, string[]> = {}
  for (const [groupKey, set] of groupMap.entries()) {
    groupModes[groupKey] = Array.from(set)
  }

  return {
    modifierName,
    groupModes,
  }
}
