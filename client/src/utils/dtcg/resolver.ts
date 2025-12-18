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

export type ResolverInput = Record<string, string> & {
  scopedModifiers?: Record<string, Record<string, string>>
}

export interface GroupScopedModifierInfo {
  modifierName: string
  groupModes: Record<string, string[]>
}
function unwrapTokensRoot(obj: JsonObject): JsonObject {
  const maybe = (obj as Record<string, unknown>).tokens
  return isJsonObject(maybe) ? (maybe as JsonObject) : obj
}
// ---------- small helpers ----------------------------------------------------
export function applySelectedContextsToDoc(doc: JsonObject, input: ResolverInput): JsonObject {
  type FigmaExtension = {
    valuesByMode?: Record<string, JsonValue>
    defaultMode?: string
  }

  // global fallback (still useful)
  const globalMode = input.mode || null

  function pickModeForGroup(groupKey: string | null): string | null {
    if (!groupKey) return globalMode
    const scopedName = 'mode' // keep as 'mode' unless you pass the actual scoped modifier name in input
    const scoped = input.scopedModifiers?.[scopedName]?.[groupKey]

    return scoped ?? globalMode
  }

  function visit(value: JsonValue, topGroupKey: string | null): JsonValue {
    if (Array.isArray(value)) {
      return (value as JsonArray).map((v) => visit(v, topGroupKey))
    }

    if (isJsonObject(value)) {
      const obj = value as JsonObject
      const out: JsonObject = {}

      for (const [key, v] of Object.entries(obj)) {
        // top-level group is the first key under the root doc
        const nextTopGroupKey = topGroupKey ?? key
        out[key] = visit(v as JsonValue, nextTopGroupKey)
      }

      // ---------- Figma-mode handling (GROUP AWARE) ----------

      const selectedMode = pickModeForGroup(topGroupKey)
      // if (topGroupKey && selectedMode) {
      //   console.log('[Resolver] mode for group', topGroupKey, '=', selectedMode)
      // }

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
              out.$value = chosen
            }
          }
        }
      }

      return out
    }

    return value
  }

  const resolved = visit(doc, null) as JsonObject
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
    // console.log(
    //   '[Resolver] no resolver doc found → simple mergeAllDocs + applySelectedContextsToDoc',
    // )
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
  const applied = applySelectedContextsToDoc(resolved, input)
  return applied
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

  const pickIfExists = (name: string): string | null => (name in modifiers ? name : null)

  let modifierName: string | null = null

  if (preferredModifierName) {
    modifierName = pickIfExists(preferredModifierName)
  }
  if (!modifierName) {
    modifierName = pickIfExists('mode') ?? null
  }

  if (!modifierName) {
    // IMPORTANT: don't guess "density" here — pick the first modifier defined in the resolver
    modifierName = modifierNames[0] ?? null
  }

  const modifier = modifiers[modifierName]
  if (!modifier) return null

  // groupKey -> contextValue -> serialized subtree snapshot
  const snapshots = new Map<string, Map<string, string>>()

  for (const [contextValue, sources] of Object.entries(modifier.contexts ?? {})) {
    for (const src of sources) {
      const tokensObject = loadTokenSource(src, docs)
      if (!isJsonObject(tokensObject)) continue

      const root = unwrapTokensRoot(tokensObject)

      for (const groupKey of Object.keys(root)) {
        if (!groupKey) continue

        const subtree = (root as Record<string, JsonValue>)[groupKey]

        let serialized = ''
        try {
          serialized = JSON.stringify(subtree)
        } catch {
          serialized = String(subtree)
        }

        let byContext = snapshots.get(groupKey)
        if (!byContext) {
          byContext = new Map<string, string>()
          snapshots.set(groupKey, byContext)
        }

        byContext.set(contextValue, serialized)
      }
    }
  }

  // Only keep groups where at least 2 contexts produce different content
  const groupModes: Record<string, string[]> = {}

  for (const [groupKey, byContext] of snapshots.entries()) {
    const unique = new Set(byContext.values())
    if (unique.size <= 1) continue // identical across contexts => NOT scoped => no dropdown

    groupModes[groupKey] = Array.from(byContext.keys())
  }

  if (Object.keys(groupModes).length === 0) return null

  return {
    modifierName,
    groupModes,
  }
}
