import type { Ref } from 'vue'
import type { JsonValue } from '@/utils/dtcg/resolver'
import type { TableRow } from '@/utils/dtcg/token-table-types'
import {
  deepClone,
  findDocContainingPath,
  deleteAtPathIfExists,
  createDuplicateKey,
  findGroupContainer,
  isJsonRecord,
  type JsonRecord,
  updateAliasReferencesInDocs,
  removeAliasReferencesInDocs,
  countAliasReferencesInDocs,
} from '@/utils/dtcg/json-path-helpers'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'

type WorkspaceStore = ReturnType<typeof useTokenWorkspaceStore>

interface CrudDeps {
  uploadedDocs: Ref<Record<string, JsonValue>>
  workspaceStore: WorkspaceStore
  persistUploadedDocsAndReload: () => Promise<void>
}
interface ResolverModifierLike {
  default?: string
  contexts?: Record<string, Array<{ $ref: string }> | JsonValue>
}

type Json = unknown
type TokenType = 'color' | 'number' | 'string' | 'boolean'

function isTokenType(t: unknown): t is TokenType {
  return t === 'color' || t === 'number' || t === 'string' || t === 'boolean'
}
function parseRowValueForDtcg(row: TableRow): JsonValue {
  if (row.type === 'color') {
    return row.hex || '#000000'
  }

  if (row.type === 'number') {
    const n = Number(row.value)
    return Number.isFinite(n) ? n : 0
  }

  if (row.type === 'boolean') {
    const s = String(row.value ?? '')
      .trim()
      .toLowerCase()
    return s === 'true'
  }

  // string
  return String(row.value ?? '')
}

function parseRowLiteralValue(row: TableRow): JsonValue {
  // used when we need a literal (non-alias) value for $value
  if (row.type === 'color') return row.hex || '#000000'
  if (row.type === 'number') {
    const n = Number(row.value)
    return Number.isFinite(n) ? n : 0
  }
  if (row.type === 'boolean') {
    const s = String(row.value ?? '')
      .trim()
      .toLowerCase()
    return s === 'true'
  }
  // string (and anything else) -> string
  return String(row.value ?? '')
}

function getTokenTypeFromNode(node: Json): TokenType | null {
  if (!isJsonRecord(node)) return null
  const t = (node as JsonRecord)['$type']
  return isTokenType(t) ? t : null
}

function normalizeAliasTarget(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('{') && s.endsWith('}')) {
    s = s.slice(1, -1).trim()
  }
  return s
}

function getNodeAtPath(root: JsonRecord, path: string[]): Json | undefined {
  let current: Json = root
  for (const segment of path) {
    if (!isJsonRecord(current)) return undefined
    current = current[segment]
  }
  return current
}

function getAliasTargetFromToken(node: Json): string | null {
  if (!isJsonRecord(node)) return null

  const rawValue = (node as JsonRecord)['$value']
  if (typeof rawValue !== 'string') return null

  const trimmed = rawValue.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null

  return normalizeAliasTarget(trimmed)
}

function wouldCreateAliasCycle(
  root: JsonRecord,
  fromPath: string[],
  targetPath: string[],
): boolean {
  const startId = fromPath.join('.')
  let currentId = targetPath.join('.')

  const visited = new Set<string>()

  while (true) {
    if (currentId === startId) {
      return true
    }

    if (visited.has(currentId)) {
      return true
    }
    visited.add(currentId)

    const node = getNodeAtPath(root, currentId.split('.'))
    if (!node) return false

    const nextTarget = getAliasTargetFromToken(node)
    if (!nextTarget) {
      return false
    }

    currentId = nextTarget
  }
}

function ensurePath(root: JsonRecord, segments: string[]): JsonRecord {
  let node: JsonRecord = root
  for (const seg of segments) {
    if (!node[seg] || typeof node[seg] !== 'object' || Array.isArray(node[seg])) {
      node[seg] = {}
    }
    node = node[seg] as JsonRecord
  }
  return node
}

function ensureRowOrder(store: WorkspaceStore): string[] {
  if (!Array.isArray(store.rowOrder)) {
    store.rowOrder = []
  }
  return store.rowOrder
}

function isResolverDocument(value: JsonValue): value is JsonRecord {
  return isJsonRecord(value) && Array.isArray((value as JsonRecord).resolutionOrder)
}

// Find the resolver document, if any, among uploaded docs
function findResolverDoc(
  docs: Record<string, JsonValue>,
): { fileName: string; doc: JsonRecord } | null {
  for (const [fileName, raw] of Object.entries(docs)) {
    if (isResolverDocument(raw)) {
      return { fileName, doc: raw as JsonRecord }
    }
  }
  return null
}

function hasPathInDoc(doc: JsonRecord, segments: string[]): boolean {
  return getNodeAtPath(doc, segments) !== undefined
}

function pickDocForRowPath(
  docs: Record<string, JsonValue>,
  rowPath: string,
  workspaceStore: WorkspaceStore,
): { fileName: string; doc: JsonRecord } | null {
  const segments = rowPath.split('.')
  const resolverInfo = findResolverDoc(docs)

  if (resolverInfo) {
    const resolver = resolverInfo.doc
    const mods = (resolver.modifiers ?? {}) as Record<string, ResolverModifierLike>
    const wsMods = (workspaceStore.modifiers ?? {}) as Record<string, string>

    // Pick the first modifier that has a selected value in the workspace
    const activeModName = Object.keys(mods).find((name) => wsMods[name])
    if (activeModName) {
      const mod = mods[activeModName]
      const selectedValue: string = wsMods[activeModName] ?? mod.default ?? null

      if (selectedValue && mod.contexts && mod.contexts[selectedValue]) {
        const sources = mod.contexts[selectedValue] as Array<{ $ref: string }>
        const candidateFiles = sources
          .map((s) => (typeof s.$ref === 'string' ? s.$ref.split('#')[0] : ''))
          .filter(Boolean)

        // Among candidate files, pick the one that actually contains the path
        for (const fileName of candidateFiles) {
          const raw = docs[fileName]
          if (!isJsonRecord(raw)) continue
          const doc = raw as JsonRecord
          if (hasPathInDoc(doc, segments)) {
            return { fileName, doc }
          }
        }
      }
    }
  }
  const found = findDocContainingPath(docs, segments)
  if (!found || !isJsonRecord(found.doc)) return null

  return {
    fileName: found.fileName,
    doc: found.doc as JsonRecord,
  }
}

export function useTokenCrud({
  uploadedDocs,
  workspaceStore,
  persistUploadedDocsAndReload,
}: CrudDeps) {
  async function updateTokenValueAny(row: TableRow, newValue: JsonValue): Promise<void> {
    const segments = row.path.split('.')
    const found = findDocContainingPath(uploadedDocs.value, segments)
    if (!found) {
      console.warn('updateTokenValueAny: path not found in any uploaded doc', row.path)
      return
    }

    const { fileName, doc, token, parent, key } = found

    const type = row.type

    if (isJsonRecord(token)) {
      const tokenRecord: JsonRecord = token
      tokenRecord['$type'] = type
      tokenRecord['$value'] = newValue
    } else {
      parent[key] = {
        $type: type,
        $value: newValue,
      }
    }

    delete workspaceStore.overrides[row.path]

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  async function updateTokenValue(row: TableRow, newHex: string): Promise<void> {
    const segments = row.path.split('.')
    const found = findDocContainingPath(uploadedDocs.value, segments)
    if (!found) {
      console.warn('updateTokenValue: path not found in any uploaded doc', row.path)
      return
    }

    const { fileName, doc, token, parent, key } = found

    if (isJsonRecord(token)) {
      const tokenRecord: JsonRecord = token
      tokenRecord['$value'] = newHex
    } else {
      parent[key] = {
        $type: 'color',
        $value: newHex,
      }
    }

    delete workspaceStore.overrides[row.path]

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  async function updateTokenName(row: TableRow, newName: string): Promise<void> {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === row.name) return

    const segments = row.path.split('.')
    const found = findDocContainingPath(uploadedDocs.value, segments)
    if (!found) {
      console.warn('updateTokenName: path not found in any uploaded doc', row.path)
      return
    }

    const { fileName, doc, parent, key: oldKey } = found

    if (trimmed in parent) {
      console.warn('updateTokenName: target name already exists in this group', trimmed)
      return
    }

    const tokenValue: JsonValue = parent[oldKey]
    parent[trimmed] = tokenValue
    delete parent[oldKey]

    const newPathSegments = [...segments.slice(0, -1), trimmed]
    const newPath = newPathSegments.join('.')

    if (workspaceStore.nameOverrides[row.path]) {
      workspaceStore.nameOverrides[newPath] = workspaceStore.nameOverrides[row.path]
      delete workspaceStore.nameOverrides[row.path]
    }
    updateAliasReferencesInDocs(uploadedDocs.value, row.path, newPath)

    const order = ensureRowOrder(workspaceStore)
    const idx = order.indexOf(row.path)
    if (idx >= 0) {
      order[idx] = newPath
    }

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  async function deleteToken(row: TableRow): Promise<void> {
    const refCount = countAliasReferencesInDocs(uploadedDocs.value, row.path)

    if (refCount > 0 && typeof window !== 'undefined') {
      const message =
        refCount === 1
          ? 'This token is referenced by 1 other token. If you delete it, that reference will also be removed. Do you want to continue?'
          : `This token is referenced by ${refCount} other tokens. If you delete it, those references will also be removed. Do you want to continue?`

      const confirmed = window.confirm(message)
      if (!confirmed) {
        return
      }
    }

    const segments = row.path.split('.')
    let changedFile: string | null = null

    for (const [fileName, rawDoc] of Object.entries(uploadedDocs.value)) {
      const maybeDoc: JsonValue = rawDoc
      if (!isJsonRecord(maybeDoc)) continue
      const doc: JsonRecord = maybeDoc
      const deleted = deleteAtPathIfExists(doc, segments)
      if (deleted) {
        changedFile = fileName
        uploadedDocs.value[fileName] = doc
        break
      }
    }

    if (!changedFile) {
      console.warn('deleteToken: path not found in any uploaded doc', row.path)
      return
    }

    delete workspaceStore.overrides[row.path]
    delete workspaceStore.nameOverrides[row.path]

    removeAliasReferencesInDocs(uploadedDocs.value, row.path)

    await persistUploadedDocsAndReload()
  }

  async function duplicateToken(row: TableRow): Promise<void> {
    const segments = row.path.split('.')
    const found = findDocContainingPath(uploadedDocs.value, segments)
    if (!found) {
      console.warn('duplicateToken: path not found in any uploaded doc', row.path)
      return
    }

    const { fileName, doc, parent, key: oldKey } = found
    const original: JsonValue = parent[oldKey]
    const newKey = createDuplicateKey(parent, row.name || oldKey)

    let newToken: JsonValue

    if (isJsonRecord(original)) {
      const copy = deepClone(original as JsonRecord)
      copy['$type'] = row.type
      copy['$value'] = row.isAlias ? (copy['$value'] as JsonValue) : parseRowValueForDtcg(row)
      newToken = copy
    } else {
      newToken = { $type: row.type, $value: row.isAlias ? original : parseRowValueForDtcg(row) }
    }

    parent[newKey] = newToken

    const newPathSegments = [...segments.slice(0, -1), newKey]
    const newPath = newPathSegments.join('.')

    const order = ensureRowOrder(workspaceStore)
    const idx = order.indexOf(row.path)
    const insertIndex = idx >= 0 ? idx + 1 : order.length
    order.splice(insertIndex, 0, newPath)

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  async function addRowBelowToken(row: TableRow): Promise<void> {
    const segments = row.path.split('.')
    const found = findDocContainingPath(uploadedDocs.value, segments)
    if (!found) {
      console.warn('addRowBelowToken: path not found in any uploaded doc', row.path)
      return
    }

    const { fileName, doc, parent } = found

    const baseName = row.name || 'new-token'
    const newKey = createDuplicateKey(parent, baseName)
    const newToken: JsonValue = {
      $type: row.type,
      $value:
        row.type === 'color'
          ? '#000000'
          : row.type === 'number'
            ? 0
            : row.type === 'boolean'
              ? false
              : '',
    }

    parent[newKey] = newToken

    const newPathSegments = [...segments.slice(0, -1), newKey]
    const newPath = newPathSegments.join('.')

    const order = ensureRowOrder(workspaceStore)
    const idx = order.indexOf(row.path)
    const insertIndex = idx >= 0 ? idx + 1 : order.length
    order.splice(insertIndex, 0, newPath)

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  async function addTokenToGroup(
    groupPath: string[],
    initialName = 'new-token',
    initialHex = '#000000',
  ): Promise<void> {
    if (groupPath.length === 0) {
      console.warn('addTokenToGroup: empty groupPath – not supported')
      return
    }

    const found = findGroupContainer(uploadedDocs.value, groupPath)
    if (!found) {
      console.warn('addTokenToGroup: group not found in any uploaded doc', groupPath.join('.'))
      return
    }

    const { fileName, doc, container } = found
    const key = createDuplicateKey(container, initialName)

    const newToken: JsonValue = {
      $type: 'color',
      $value: initialHex,
    }

    container[key] = newToken

    const newPathSegments = [...groupPath, key]
    const newPath = newPathSegments.join('.')

    const order = ensureRowOrder(workspaceStore)
    order.push(newPath)

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  async function addGroupWithToken(
    parentGroupPath: string[],
    groupName: string,
    initialHex = '#000000',
  ): Promise<void> {
    if (!groupName.trim()) {
      console.warn('addGroupWithToken: empty group name')
      return
    }

    const docs = uploadedDocs.value
    const fileNames = Object.keys(docs)

    if (fileNames.length === 0) {
      console.warn('addGroupWithToken: no uploaded docs')
      return
    }

    const fileName = fileNames[0]
    const rawDoc = docs[fileName]

    if (!isJsonRecord(rawDoc)) {
      console.warn('addGroupWithToken: first uploaded doc is not an object')
      return
    }

    const doc = rawDoc as JsonRecord

    const fullGroupPath = [...parentGroupPath, groupName.trim()]

    const groupContainer = ensurePath(doc, fullGroupPath)

    const tokenKey = createDuplicateKey(groupContainer, 'default')

    groupContainer[tokenKey] = {
      $type: 'color',
      $value: initialHex,
    }

    const newPath = [...fullGroupPath, tokenKey].join('.')

    const order = ensureRowOrder(workspaceStore)
    order.push(newPath)

    uploadedDocs.value[fileName] = doc

    await persistUploadedDocsAndReload()
  }

  async function addSiblingGroupWithToken(
    siblingOfGroupPath: string[],
    newGroupName: string,
    initialTokenName = 'new-token',
    initialHex = '#000000',
  ): Promise<void> {
    if (siblingOfGroupPath.length === 0) {
      console.warn('addSiblingGroupWithToken: empty sibling path is not supported')
      return
    }

    const parentPath = siblingOfGroupPath.slice(0, -1)

    const parentFound =
      parentPath.length > 0
        ? findGroupContainer(uploadedDocs.value, parentPath)
        : (() => {
            // root-level sibling: use the first document as container
            const [fileName, maybeDoc] = Object.entries(uploadedDocs.value)[0] ?? []
            if (!fileName || !isJsonRecord(maybeDoc)) return null
            const doc = maybeDoc as JsonRecord
            return { fileName, doc, container: doc }
          })()

    if (!parentFound) {
      console.warn(
        'addSiblingGroupWithToken: parent group not found for path',
        parentPath.join('.'),
      )
      return
    }

    const { fileName, doc, container } = parentFound
    const parentContainer: JsonRecord = container

    const safeGroupName = createDuplicateKey(parentContainer, newGroupName)

    const newGroup: JsonRecord = {}
    parentContainer[safeGroupName] = newGroup

    const safeTokenName = createDuplicateKey(newGroup, initialTokenName)
    newGroup[safeTokenName] = {
      $type: 'color',
      $value: initialHex,
    }

    const order = ensureRowOrder(workspaceStore)
    const newTokenPath = [...parentPath, safeGroupName, safeTokenName].join('.')
    order.push(newTokenPath)

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }
  // async function setTokenAlias(row: TableRow, aliasPath: string): Promise<void> {
  //   const trimmedInput = aliasPath.trim()
  //   if (!trimmedInput) {
  //     throw new Error('Alias path cannot be empty.')
  //   }

  //   const targetNormalized = normalizeAliasTarget(trimmedInput)

  //   if (targetNormalized === row.path) {
  //     throw new Error('A token cannot alias itself.')
  //   }

  //   const docs = uploadedDocs.value
  //   const fileNames = Object.keys(docs)
  //   if (!fileNames.length) {
  //     throw new Error('No token files are loaded.')
  //   }

  //   const fileName = fileNames[0]
  //   const rawDoc = docs[fileName]
  //   if (!isJsonRecord(rawDoc)) {
  //     throw new Error('First uploaded token file is not an object.')
  //   }

  //   const doc = rawDoc as JsonRecord

  //   const fromSegments = row.path.split('.')
  //   const targetSegments = targetNormalized.split('.')

  //   const targetNode = getNodeAtPath(doc, targetSegments)
  //   if (!targetNode) {
  //     throw new Error(`Alias target "${targetNormalized}" does not exist.`)
  //   }

  //   if (wouldCreateAliasCycle(doc, fromSegments, targetSegments)) {
  //     throw new Error(
  //       `Alias "${row.path}" → "${targetNormalized}" would create a circular reference.`,
  //     )
  //   }

  //   const pathSegments = row.path.split('.')
  //   const key = pathSegments.pop()!
  //   const parentPath = pathSegments

  //   const parent = ensurePath(doc, parentPath)

  //   const aliasValue =
  //     trimmedInput.startsWith('{') && trimmedInput.endsWith('}')
  //       ? trimmedInput
  //       : `{${targetNormalized}}`

  //   parent[key] = { $type: 'color', $value: aliasValue }

  //   uploadedDocs.value[fileName] = doc
  //   await persistUploadedDocsAndReload()
  // }
  async function setTokenAlias(row: TableRow, aliasPath: string): Promise<void> {
    const trimmedInput = aliasPath.trim()
    if (!trimmedInput) {
      throw new Error('Alias path cannot be empty.')
    }

    const targetNormalized = normalizeAliasTarget(trimmedInput)

    if (targetNormalized === row.path) {
      throw new Error('A token cannot alias itself.')
    }

    const docs = uploadedDocs.value
    const fileNames = Object.keys(docs)
    if (!fileNames.length) {
      throw new Error('No token files are loaded.')
    }

    const targetSegments = targetNormalized.split('.')
    let targetExists = false
    let targetType: TokenType | null = null

    for (const raw of Object.values(docs)) {
      if (!isJsonRecord(raw)) continue
      const node = getNodeAtPath(raw as JsonRecord, targetSegments)
      if (node !== undefined) {
        targetExists = true
        targetType = getTokenTypeFromNode(node)
        break
      }
    }

    if (!targetExists) {
      throw new Error(`Alias target "${targetNormalized}" does not exist.`)
    }

    if (targetType && targetType !== row.type) {
      throw new Error(
        `Alias target type mismatch: "${row.path}" is "${row.type}" but "${targetNormalized}" is "${targetType}".`,
      )
    }

    const picked = pickDocForRowPath(docs, row.path, workspaceStore)
    if (!picked) {
      throw new Error(`Token "${row.path}" was not found in any uploaded document.`)
    }

    const { fileName, doc } = picked

    const fromSegments = row.path.split('.')

    if (wouldCreateAliasCycle(doc, fromSegments, targetSegments)) {
      throw new Error(
        `Alias "${row.path}" → "${targetNormalized}" would create a circular reference.`,
      )
    }

    const pathSegments = row.path.split('.')
    const key = pathSegments.pop()!
    const parentPath = pathSegments

    const parent = ensurePath(doc, parentPath)

    const aliasValue =
      trimmedInput.startsWith('{') && trimmedInput.endsWith('}')
        ? trimmedInput
        : `{${targetNormalized}}`

    parent[key] = { $type: row.type, $value: aliasValue }

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  // async function clearTokenAlias(row: TableRow): Promise<void> {
  //   const docs = uploadedDocs.value
  //   const fileNames = Object.keys(docs)
  //   if (!fileNames.length) {
  //     console.warn('clearTokenAlias: no uploaded docs')
  //     return
  //   }

  //   const fileName = fileNames[0]
  //   const rawDoc = docs[fileName]
  //   if (!isJsonRecord(rawDoc)) {
  //     console.warn('clearTokenAlias: first uploaded doc is not an object')
  //     return
  //   }

  //   const doc = rawDoc as JsonRecord

  //   const pathSegments = row.path.split('.') // e.g. ["global","palette","neutral","50"]
  //   const key = pathSegments.pop()!
  //   const parentPath = pathSegments

  //   const parent = ensurePath(doc, parentPath)

  //   const hex = row.hex

  //   parent[key] = {
  //     $type: 'color',
  //     $value: hex,
  //   }

  //   uploadedDocs.value[fileName] = doc
  //   await persistUploadedDocsAndReload()
  // }
  async function clearTokenAlias(row: TableRow): Promise<void> {
    const docs = uploadedDocs.value
    const fileNames = Object.keys(docs)
    if (!fileNames.length) {
      console.warn('clearTokenAlias: no uploaded docs')
      return
    }

    const picked = pickDocForRowPath(docs, row.path, workspaceStore)
    if (!picked) {
      console.warn('clearTokenAlias: token not found in any uploaded doc', row.path)
      return
    }

    const { fileName, doc } = picked

    const pathSegments = row.path.split('.')
    const key = pathSegments.pop()!
    const parentPath = pathSegments

    const parent = ensurePath(doc, parentPath)
    const literal = parseRowLiteralValue(row)
    parent[key] = {
      $type: row.type,
      $value: literal,
    }

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  return {
    updateTokenValue,
    updateTokenValueAny,
    updateTokenName,
    deleteToken,
    duplicateToken,
    addRowBelowToken,
    addTokenToGroup,
    addGroupWithToken,
    addSiblingGroupWithToken,
    setTokenAlias,
    clearTokenAlias,
  }
}
