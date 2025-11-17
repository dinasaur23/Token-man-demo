// // client/src/utils/dtcg/resolver.ts

// export type JsonPrimitive = string | number | boolean | null

// export type JsonValue = JsonPrimitive | JsonObject | JsonArray

// export interface JsonObject {
//   [key: string]: JsonValue
// }

// export type JsonArray = JsonValue[]

// // deep merge of two JSON values
// export function deepMergeDocs(target: JsonValue, source: JsonValue): JsonValue {
//   if (typeof target !== 'object' || target === null) return source
//   if (typeof source !== 'object' || source === null) return source

//   // both arrays → concat
//   if (Array.isArray(target) && Array.isArray(source)) {
//     return [...target, ...source]
//   }

//   // one is array, the other is object/primitive → take source
//   if (Array.isArray(target) || Array.isArray(source)) {
//     return source
//   }

//   // both objects
//   const tObj = target as JsonObject
//   const sObj = source as JsonObject

//   const out: JsonObject = { ...tObj }

//   for (const key of Object.keys(sObj)) {
//     const tVal = tObj[key]
//     const sVal = sObj[key]

//     out[key] = tVal === undefined ? sVal : deepMergeDocs(tVal, sVal)
//   }

//   return out
// }

// // merge all uploaded docs into one JSON value
// export function resolveUploadedDocuments(docs: Record<string, JsonValue>): JsonValue {
//   const entries = Object.entries(docs)
//   if (entries.length === 0) return {}

//   let result: JsonValue = entries[0][1]

//   for (let i = 1; i < entries.length; i += 1) {
//     result = deepMergeDocs(result, entries[i][1])
//   }

//   return result
// }

// client/src/utils/dtcg/resolver.ts

// client/src/utils/dtcg/resolver.ts

// ---------- JSON types -------------------------------------------------------

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

// ---------- DTCG resolver model ---------------------------------------------

// Make these extend JsonObject so they are compatible with JsonValue
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
  // "#/sets/name", "#/modifiers/name" or "tokens.json"
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

// ---------- small helpers ----------------------------------------------------

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

// Type guard: JsonValue -> ResolverDocument
function isResolverDocument(value: JsonValue): value is ResolverDocument {
  if (!isJsonObject(value)) return false
  const maybe = value as { resolutionOrder?: JsonValue }
  return Array.isArray(maybe.resolutionOrder)
}

function isSourceRef(source: ResolverSource): source is ResolverSourceRef {
  return isJsonObject(source) && typeof (source as JsonObject).$ref === 'string'
}

// ---------- loading token sources (frontend) ---------------------------------
//
// On the frontend we don't read files from disk. Instead we assume docs is a
// map: { "fileName.json": parsedJson } built from your uploads.

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

// ---------- high-level helper for your UI -----------------------------------
//
//  docs: map from filename -> JSON (from uploaded files)
//  input: current modifier values, e.g. { theme: "dark" }

export function resolveUploadedDocuments(
  docs: Record<string, JsonValue>,
  input: ResolverInput = {},
): JsonObject {
  const resolverEntry = Object.entries(docs).find(([, value]) => isResolverDocument(value))

  if (!resolverEntry) {
    // no resolver found -> simple merge of all docs (your previous behavior)
    return mergeAllDocs(docs)
  }

  const resolverValue = resolverEntry[1]
  if (!isResolverDocument(resolverValue)) {
    // should never happen at runtime, but keeps TS happy
    throw new Error('Resolver document has wrong shape.')
  }

  const resolverDoc = resolverValue
  return resolveWithResolverDocument(resolverDoc, docs, input)
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
