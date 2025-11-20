// utils/dtcg/json-path-helpers.ts
import type { JsonValue } from './resolver'

export type JsonRecord = Record<string, JsonValue>

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function deepClone<T extends JsonValue>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export function getAtPath(obj: JsonRecord, segments: string[]): JsonValue | undefined {
  let current: JsonValue = obj
  for (const key of segments) {
    if (!isJsonRecord(current) || !(key in current)) return undefined
    current = current[key]
  }
  return current
}

export function getParentAndKey(
  obj: JsonRecord,
  segments: string[],
): { parent: JsonRecord; key: string } | null {
  if (segments.length === 0) return null
  const key = segments[segments.length - 1]
  const parentSegments = segments.slice(0, -1)
  const parentValue = getAtPath(obj, parentSegments)
  if (!parentValue || !isJsonRecord(parentValue)) return null
  return { parent: parentValue, key }
}

export function deleteAtPathIfExists(obj: JsonRecord, segments: string[]): boolean {
  const info = getParentAndKey(obj, segments)
  if (!info) return false
  const { parent, key } = info
  if (!(key in parent)) return false
  delete parent[key]
  return true
}

export interface DocPathResult {
  fileName: string
  doc: JsonRecord
  token: JsonValue
  parent: JsonRecord
  key: string
}

/**
 * Find which uploaded document actually contains a given path.
 */
export function findDocContainingPath(
  docs: Record<string, JsonValue>,
  segments: string[],
): DocPathResult | null {
  for (const [fileName, rawDoc] of Object.entries(docs)) {
    if (!isJsonRecord(rawDoc)) continue
    const doc: JsonRecord = rawDoc
    const info = getParentAndKey(doc, segments)
    if (!info) continue
    const { parent, key } = info
    if (!(key in parent)) continue
    const token = parent[key]
    return { fileName, doc, token, parent, key }
  }
  return null
}

export interface GroupContainerResult {
  fileName: string
  doc: JsonRecord
  container: JsonRecord
}

/**
 * Find the group container (object) for a given group path.
 */
export function findGroupContainer(
  docs: Record<string, JsonValue>,
  groupSegments: string[],
): GroupContainerResult | null {
  for (const [fileName, rawDoc] of Object.entries(docs)) {
    if (!isJsonRecord(rawDoc)) continue
    const doc: JsonRecord = rawDoc
    const containerValue = getAtPath(doc, groupSegments)
    if (!containerValue || !isJsonRecord(containerValue)) continue
    return { fileName, doc, container: containerValue }
  }
  return null
}

/**
 * Generate a unique key in an object for duplications.
 */
export function createDuplicateKey(obj: JsonRecord, baseName: string): string {
  if (!(baseName in obj)) return baseName
  let counter = 1
  let candidate = `${baseName}-copy`
  while (candidate in obj) {
    counter += 1
    candidate = `${baseName}-copy-${counter}`
  }
  return candidate
}
