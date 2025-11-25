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

export function updateAliasReferencesInDocs(
  docs: Record<string, JsonValue>,
  oldPath: string,
  newPath: string | null,
): void {
  const targetAlias = `{${oldPath}}`
  const replacement = newPath ? `{${newPath}}` : null

  function visit(parent: JsonValue): void {
    if (Array.isArray(parent)) {
      for (let i = 0; i < parent.length; i += 1) {
        const value = parent[i]

        if (typeof value === 'string') {
          if (value === targetAlias) {
            if (replacement === null) {
              parent.splice(i, 1)
              i -= 1
            } else {
              parent[i] = replacement
            }
          }
        } else {
          visit(value)
        }
      }
    } else if (isJsonRecord(parent)) {
      for (const key of Object.keys(parent)) {
        const value = parent[key]

        if (typeof value === 'string') {
          if (value === targetAlias) {
            if (replacement === null) {
              delete parent[key]
            } else {
              parent[key] = replacement
            }
          }
        } else {
          visit(value)
        }
      }
    }
  }

  for (const value of Object.values(docs)) {
    visit(value)
  }
}

export function removeAliasReferencesInDocs(
  docs: Record<string, JsonValue>,
  oldPath: string,
): void {
  updateAliasReferencesInDocs(docs, oldPath, null)
}

export function countAliasReferencesInDocs(
  docs: Record<string, JsonValue>,
  targetPath: string,
): number {
  const alias = `{${targetPath}}`
  let count = 0

  function visit(node: JsonValue): void {
    if (typeof node === 'string') {
      if (node === alias) count += 1
      return
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item)
      }
      return
    }

    if (isJsonRecord(node)) {
      for (const value of Object.values(node)) {
        visit(value)
      }
    }
  }

  for (const value of Object.values(docs)) {
    visit(value)
  }

  return count
}
