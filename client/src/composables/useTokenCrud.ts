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
  getEffectiveModeForPath: (tokenPath: string) => string
}

interface ResolverModifierLike {
  default?: string
  contexts?: Record<string, Array<{ $ref: string }> | JsonValue>
}

type Json = unknown
type TokenType = 'color' | 'number' | 'string' | 'boolean'

function isFigmaSyncedToken(node: unknown): boolean {
  if (!isJsonRecord(node)) return false
  const ext = (node as JsonRecord).$extensions
  if (!isJsonRecord(ext)) return false
  const fig = (ext as JsonRecord).figma
  if (!isJsonRecord(fig)) return false
  const variableId = (fig as JsonRecord).variableId
  return typeof variableId === 'string' && variableId.length > 0
}

function getFigmaOrder(node: JsonValue): number | undefined {
  if (typeof node !== 'object' || node === null) return undefined
  const ext = (node as Record<string, unknown>).$extensions
  if (typeof ext !== 'object' || ext === null) return undefined
  const figma = (ext as Record<string, unknown>).figma
  if (typeof figma !== 'object' || figma === null) return undefined
  const order = (figma as Record<string, unknown>).order
  return typeof order === 'number' ? order : undefined
}

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

function seedRowOrderForGroupIfMissing(
  store: WorkspaceStore,
  groupPath: string[],
  parent: JsonRecord,
) {
  const order = ensureRowOrder(store)
  const prefix = groupPath.length ? groupPath.join('.') + '.' : ''

  // build current sibling paths based on parent key order
  const siblingPaths = Object.keys(parent).map((k) => prefix + k)

  // only seed if NONE of the siblings are tracked yet
  const hasAny = siblingPaths.some((p) => order.includes(p))
  if (hasAny) return

  order.push(...siblingPaths)
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

function pushModeDeletedPath(store: WorkspaceStore, mode: string, tokenPath: string) {
  const next = { ...(store.modeDeletedPaths ?? {}) }
  const arr = Array.isArray(next[mode]) ? [...next[mode]] : []
  if (!arr.includes(tokenPath)) arr.push(tokenPath)
  next[mode] = arr
  store.modeDeletedPaths = next
}
interface ModeAddedRow {
  path: string
  type: TokenType
  value: JsonValue
  name?: string
  raw?: JsonValue
}

function isModeAddedRow(v: unknown): v is ModeAddedRow {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return typeof r.path === 'string' && typeof r.type === 'string' && 'value' in r
}

function getGroupKeyFromPath(tokenPath: string): string {
  return tokenPath.split('.')[0] ?? ''
}

function getModeAddedKey(mode: string, groupKey: string): string {
  return `${mode}::${groupKey}`
}

function readModeAddedRows(store: WorkspaceStore, mode: string, groupKey: string): ModeAddedRow[] {
  const map = store.modeAddedRows ?? {}
  const key = getModeAddedKey(mode, groupKey)
  const raw = map[key]
  if (!Array.isArray(raw)) return []
  const out: ModeAddedRow[] = []
  for (const item of raw) {
    if (isModeAddedRow(item)) out.push(item)
  }
  return out
}

function writeModeAddedRows(
  store: WorkspaceStore,
  mode: string,
  groupKey: string,
  rows: ModeAddedRow[],
) {
  const key = getModeAddedKey(mode, groupKey)
  const next = { ...(store.modeAddedRows ?? {}) }
  next[key] = rows
  store.modeAddedRows = next
}

function findModeAddedRow(
  store: WorkspaceStore,
  mode: string,
  tokenPath: string,
): { groupKey: string; key: string; rows: ModeAddedRow[]; index: number } | null {
  const groupKey = getGroupKeyFromPath(tokenPath)
  const key = getModeAddedKey(mode, groupKey)
  const rows = readModeAddedRows(store, mode, groupKey)
  const index = rows.findIndex((r) => r.path === tokenPath)
  if (index < 0) return null
  return { groupKey, key, rows, index }
}

function getParentPath(path: string): string {
  const seg = path.split('.')
  seg.pop()
  return seg.join('.')
}

function getLeafKey(path: string): string {
  const seg = path.split('.')
  return seg[seg.length - 1] ?? path
}

function buildSiblingKeyRecord(rows: ModeAddedRow[], parentPath: string): JsonRecord {
  const rec: JsonRecord = {}
  for (const r of rows) {
    if (getParentPath(r.path) !== parentPath) continue
    const leaf = getLeafKey(r.path)
    rec[leaf] = true
  }
  return rec
}

function removeOverridesForPath(store: WorkspaceStore, mode: string, tokenPath: string) {
  const modeKey = `${mode}::${tokenPath}`

  if (store.overrides[modeKey] !== undefined) {
    const copy = { ...store.overrides }
    delete copy[modeKey]
    store.overrides = copy
  }

  if (store.overrides[tokenPath] !== undefined) {
    const copy = { ...store.overrides }
    delete copy[tokenPath]
    store.overrides = copy
  }
}

export function useTokenCrud({
  uploadedDocs,
  workspaceStore,
  persistUploadedDocsAndReload,
  getEffectiveModeForPath,
}: CrudDeps) {
  async function updateTokenValueAny(row: TableRow, newValue: JsonValue): Promise<void> {
    const mode = getEffectiveModeForPath(row.path)

    // ✅ mode-added row: update in modeAddedRows (do NOT touch uploadedDocs)
    {
      const hit = findModeAddedRow(workspaceStore, mode, row.path)
      if (hit) {
        const nextRows = [...hit.rows]
        const existing = nextRows[hit.index]
        nextRows[hit.index] = {
          ...existing,
          value: newValue,
          raw: newValue,
          type: row.type,
        }

        writeModeAddedRows(workspaceStore, mode, hit.groupKey, nextRows)

        await workspaceStore.saveToServer()
        await persistUploadedDocsAndReload()
        return
      }
    }

    const segments = row.path.split('.')
    const found = findDocContainingPath(uploadedDocs.value, segments)
    if (!found) {
      console.warn('updateTokenValueAny: path not found in any uploaded doc', row.path)
      return
    }

    const { fileName, doc, token, parent, key } = found

    // ✅ Figma variables: store override only (do NOT mutate figma-sync.json)
    if (isFigmaSyncedToken(token)) {
      const k = `${mode}::${row.path}`
      workspaceStore.overrides = { ...workspaceStore.overrides, [k]: newValue }

      await workspaceStore.saveToServer()
      await persistUploadedDocsAndReload()
      return
    }

    // normal tokens: mutate original JSON
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

    // if we wrote to source, remove any override for this path
    if (workspaceStore.overrides[row.path] !== undefined) {
      const copy = { ...workspaceStore.overrides }
      delete copy[row.path]
      workspaceStore.overrides = copy
      await workspaceStore.saveToServer()
    }

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  async function updateTokenValue(row: TableRow, newHex: string): Promise<void> {
    const mode = getEffectiveModeForPath(row.path)

    // ✅ mode-added row: update in modeAddedRows
    {
      const hit = findModeAddedRow(workspaceStore, mode, row.path)
      if (hit) {
        const nextRows = [...hit.rows]
        const existing = nextRows[hit.index]
        nextRows[hit.index] = {
          ...existing,
          value: newHex,
          raw: newHex,
          type: 'color',
        }

        writeModeAddedRows(workspaceStore, mode, hit.groupKey, nextRows)

        await workspaceStore.saveToServer()
        await persistUploadedDocsAndReload()
        return
      }
    }

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
    {
      const mode = getEffectiveModeForPath(row.path)
      const hit = findModeAddedRow(workspaceStore, mode, row.path)
      if (hit) {
        const nextRows = hit.rows.filter((r) => r.path !== row.path)
        writeModeAddedRows(workspaceStore, mode, hit.groupKey, nextRows)

        removeOverridesForPath(workspaceStore, mode, row.path)
        delete workspaceStore.nameOverrides[row.path]

        await workspaceStore.saveToServer()
        await persistUploadedDocsAndReload()
        return
      }
    }
    {
      const found = findDocContainingPath(uploadedDocs.value, segments)
      if (found && isFigmaSyncedToken(found.token)) {
        const mode = getEffectiveModeForPath(row.path)
        console.log('[deleteToken figma] mode=', mode, 'path=', row.path)
        console.log('[deleteToken figma] BEFORE modeDeletedPaths=', workspaceStore.modeDeletedPaths)

        pushModeDeletedPath(workspaceStore, mode, row.path)
        console.log('[deleteToken figma] AFTER modeDeletedPaths=', workspaceStore.modeDeletedPaths)

        const k = `${mode}::${row.path}`
        if (workspaceStore.overrides[k] !== undefined) {
          const copy = { ...workspaceStore.overrides }
          delete copy[k]
          workspaceStore.overrides = copy
        }

        if (workspaceStore.overrides[row.path] !== undefined) {
          const copy = { ...workspaceStore.overrides }
          delete copy[row.path]
          workspaceStore.overrides = copy
        }

        delete workspaceStore.nameOverrides[row.path]

        await workspaceStore.saveToServer()
        await persistUploadedDocsAndReload()
        return
      }
    }

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

    const mode = getEffectiveModeForPath(row.path)
    const k = `${mode}::${row.path}`

    // remove mode-scoped override (new format)
    if (workspaceStore.overrides[k] !== undefined) {
      const copy = { ...workspaceStore.overrides }
      delete copy[k]
      workspaceStore.overrides = copy
    }

    // optional: remove legacy override (old format) so old data doesn't leak
    if (workspaceStore.overrides[row.path] !== undefined) {
      const copy = { ...workspaceStore.overrides }
      delete copy[row.path]
      workspaceStore.overrides = copy
    }

    delete workspaceStore.nameOverrides[row.path]

    removeAliasReferencesInDocs(uploadedDocs.value, row.path)

    await persistUploadedDocsAndReload()
  }

  async function duplicateToken(row: TableRow): Promise<void> {
    const mode = getEffectiveModeForPath(row.path)

    // ✅ MODE-ADDED: duplicate inside modeAddedRows (no uploadedDocs mutation)
    {
      const hit = findModeAddedRow(workspaceStore, mode, row.path)
      if (hit) {
        const original = hit.rows[hit.index]
        const parentPath = getParentPath(original.path)
        const siblingsRec = buildSiblingKeyRecord(hit.rows, parentPath)
        const newLeaf = createDuplicateKey(siblingsRec, row.name || getLeafKey(original.path))
        const newPath = parentPath ? `${parentPath}.${newLeaf}` : newLeaf

        const newRow: ModeAddedRow = {
          path: newPath,
          type: original.type,
          value: original.value,
          name: original.name ? `${original.name}-copy` : undefined,
          raw: original.raw ?? original.value,
        }

        const nextRows = [...hit.rows]
        nextRows.splice(hit.index + 1, 0, newRow)
        writeModeAddedRows(workspaceStore, mode, hit.groupKey, nextRows)

        // copy mode-scoped override (if any)
        const fromKey = `${mode}::${row.path}`
        const toKey = `${mode}::${newPath}`
        if (Object.prototype.hasOwnProperty.call(workspaceStore.overrides, fromKey)) {
          workspaceStore.overrides = {
            ...workspaceStore.overrides,
            [toKey]: workspaceStore.overrides[fromKey],
          }
        }

        const order = ensureRowOrder(workspaceStore)
        const idx = order.indexOf(row.path)
        const insertIndex = idx >= 0 ? idx + 1 : order.length
        order.splice(insertIndex, 0, newPath)

        await workspaceStore.saveToServer()
        await persistUploadedDocsAndReload()
        return
      }
    }

    const segments = row.path.split('.')
    const found = findDocContainingPath(uploadedDocs.value, segments)
    if (!found) {
      console.warn('duplicateToken: path not found in any uploaded doc', row.path)
      return
    }

    const { fileName, doc, token, parent, key: oldKey } = found
    const original: JsonValue = parent[oldKey]

    // ✅ FIGMA SYNCED: duplicate into modeAddedRows (do NOT mutate figma-sync.json)
    if (isFigmaSyncedToken(token)) {
      const parentPath = segments.slice(0, -1).join('.')
      const groupKey = getGroupKeyFromPath(row.path)
      const existingAdded = readModeAddedRows(workspaceStore, mode, groupKey)

      // build sibling name set within the same parent path (includes existing mode-added)
      const siblingsRec = buildSiblingKeyRecord(existingAdded, parentPath)
      // also include current base sibling keys from JSON (so we don’t collide)
      for (const k of Object.keys(parent)) siblingsRec[k] = true

      const newLeaf = createDuplicateKey(siblingsRec, row.name || oldKey)
      const newPath = parentPath ? `${parentPath}.${newLeaf}` : newLeaf

      const value: JsonValue = row.isAlias
        ? row.aliasPath
          ? `{${row.aliasPath}}`
          : String(row.raw ?? '')
        : parseRowValueForDtcg(row)

      const newRow: ModeAddedRow = {
        path: newPath,
        type: row.type,
        value,
        raw: value,
      }

      // insert after the clicked token (approx): append is fine, table ordering uses rowOrder anyway
      const nextRows = [...existingAdded, newRow]
      writeModeAddedRows(workspaceStore, mode, groupKey, nextRows)

      // copy override from original (mode-scoped)
      const fromKey = `${mode}::${row.path}`
      const toKey = `${mode}::${newPath}`
      if (Object.prototype.hasOwnProperty.call(workspaceStore.overrides, fromKey)) {
        workspaceStore.overrides = {
          ...workspaceStore.overrides,
          [toKey]: workspaceStore.overrides[fromKey],
        }
      }

      const order = ensureRowOrder(workspaceStore)
      const idx = order.indexOf(row.path)
      const insertIndex = idx >= 0 ? idx + 1 : order.length
      order.splice(insertIndex, 0, newPath)

      await workspaceStore.saveToServer()
      await persistUploadedDocsAndReload()
      return
    }

    // ✅ NORMAL TOKENS: keep your current behavior (mutate JSON)
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

    const fromKey = `${mode}::${row.path}`
    const toKey = `${mode}::${newPath}`

    if (Object.prototype.hasOwnProperty.call(workspaceStore.overrides, fromKey)) {
      workspaceStore.overrides = {
        ...workspaceStore.overrides,
        [toKey]: workspaceStore.overrides[fromKey],
      }
      await workspaceStore.saveToServer()
    }

    if (Object.prototype.hasOwnProperty.call(workspaceStore.overrides, row.path)) {
      workspaceStore.overrides = {
        ...workspaceStore.overrides,
        [toKey]: workspaceStore.overrides[row.path],
      }
      await workspaceStore.saveToServer()
    }

    const order = ensureRowOrder(workspaceStore)
    const idx = order.indexOf(row.path)
    const insertIndex = idx >= 0 ? idx + 1 : order.length
    order.splice(insertIndex, 0, newPath)

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  async function addRowBelowToken(row: TableRow): Promise<void> {
    const mode = getEffectiveModeForPath(row.path)

    // ✅ MODE-ADDED: add row below inside modeAddedRows
    {
      const hit = findModeAddedRow(workspaceStore, mode, row.path)
      if (hit) {
        const parentPath = getParentPath(row.path)
        const siblingsRec = buildSiblingKeyRecord(hit.rows, parentPath)
        const baseName = row.name || 'new-token'
        const newLeaf = createDuplicateKey(siblingsRec, baseName)
        const newPath = parentPath ? `${parentPath}.${newLeaf}` : newLeaf

        const newValue: JsonValue =
          row.type === 'color'
            ? '#000000'
            : row.type === 'number'
              ? 0
              : row.type === 'boolean'
                ? false
                : ''

        const newRow: ModeAddedRow = {
          path: newPath,
          type: row.type,
          value: newValue,
          raw: newValue,
        }

        const nextRows = [...hit.rows]
        nextRows.splice(hit.index + 1, 0, newRow)
        writeModeAddedRows(workspaceStore, mode, hit.groupKey, nextRows)

        const order = ensureRowOrder(workspaceStore)
        const idx = order.indexOf(row.path)
        const insertIndex = idx >= 0 ? idx + 1 : order.length
        order.splice(insertIndex, 0, newPath)

        await workspaceStore.saveToServer()
        await persistUploadedDocsAndReload()
        return
      }
    }

    const segments = row.path.split('.')
    const found = findDocContainingPath(uploadedDocs.value, segments)
    if (!found) {
      console.warn('addRowBelowToken: path not found in any uploaded doc', row.path)
      return
    }

    const { fileName, doc, token, parent, key: clickedKey } = found
    const groupPath = segments.slice(0, -1)

    // ✅ FIGMA SYNCED: create modeAddedRow (do NOT mutate figma-sync.json)
    if (isFigmaSyncedToken(token)) {
      const parentPath = groupPath.join('.')
      const groupKey = getGroupKeyFromPath(row.path)
      const existingAdded = readModeAddedRows(workspaceStore, mode, groupKey)

      // sibling names include JSON siblings + existing mode-added siblings (same parent path)
      const siblingsRec = buildSiblingKeyRecord(existingAdded, parentPath)
      for (const k of Object.keys(parent)) siblingsRec[k] = true

      const baseName = row.name || 'new-token'
      const newLeaf = createDuplicateKey(siblingsRec, baseName)
      const newPath = parentPath ? `${parentPath}.${newLeaf}` : newLeaf

      const newValue: JsonValue =
        row.type === 'color'
          ? '#000000'
          : row.type === 'number'
            ? 0
            : row.type === 'boolean'
              ? false
              : ''

      const newRow: ModeAddedRow = {
        path: newPath,
        type: row.type,
        value: newValue,
        raw: newValue,
      }

      // insert roughly after clicked token: just append; rowOrder controls visible placement
      writeModeAddedRows(workspaceStore, mode, groupKey, [...existingAdded, newRow])

      const order = ensureRowOrder(workspaceStore)
      const idx = order.indexOf(row.path)
      const insertIndex = idx >= 0 ? idx + 1 : order.length
      order.splice(insertIndex, 0, newPath)

      await workspaceStore.saveToServer()
      await persistUploadedDocsAndReload()
      return
    }

    // ✅ NORMAL TOKENS: keep your existing behavior
    seedRowOrderForGroupIfMissing(workspaceStore, groupPath, parent)

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

    // ---- Figma order handling (keep your existing logic) ----
    const clickedNode = parent[clickedKey]
    const clickedOrder = getFigmaOrder(clickedNode)

    if (clickedOrder !== undefined) {
      ;(newToken as Record<string, unknown>).$extensions = {
        figma: {
          order: clickedOrder + 0.01,
        },
      }
    }

    parent[newKey] = newToken

    const newPath = [...groupPath, newKey].join('.')
    const order = ensureRowOrder(workspaceStore)
    const clickedPath = [...groupPath, clickedKey].join('.')
    const idx = order.indexOf(clickedPath)
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
    // ✅ MODE-ADDED: store alias directly in modeAddedRows (no uploadedDocs mutation)
    {
      const mode = getEffectiveModeForPath(row.path)
      const hit = findModeAddedRow(workspaceStore, mode, row.path)

      if (hit) {
        const aliasValue =
          trimmedInput.startsWith('{') && trimmedInput.endsWith('}')
            ? trimmedInput
            : `{${targetNormalized}}`

        const nextRows = [...hit.rows]
        const existing = nextRows[hit.index]

        nextRows[hit.index] = {
          ...existing,
          type: row.type,
          value: aliasValue,
          raw: aliasValue,
        }

        writeModeAddedRows(workspaceStore, mode, hit.groupKey, nextRows)

        // remove any override for this path in this mode (avoid double sources)
        removeOverridesForPath(workspaceStore, mode, row.path)

        await workspaceStore.saveToServer()
        await persistUploadedDocsAndReload()
        return
      }
    }

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
    {
      const seg = row.path.split('.')
      const found = findDocContainingPath(uploadedDocs.value, seg)

      if (found && isFigmaSyncedToken(found.token)) {
        const aliasValue =
          trimmedInput.startsWith('{') && trimmedInput.endsWith('}')
            ? trimmedInput
            : `{${targetNormalized}}`

        const mode = getEffectiveModeForPath(row.path)
        const k = `${mode}::${row.path}`

        workspaceStore.overrides = {
          ...workspaceStore.overrides,
          [k]: aliasValue,
        }

        await workspaceStore.saveToServer()
        await persistUploadedDocsAndReload()
        return
      }
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

    const existing = parent[key]

    // if (isFigmaSyncedToken(existing)) {
    //   workspaceStore.overrides = {
    //     ...workspaceStore.overrides,
    //     [row.path]: aliasValue,
    //   }

    //   await workspaceStore.saveToServer()
    //   await persistUploadedDocsAndReload()
    //   return
    // }

    if (isJsonRecord(existing)) {
      ;(existing as JsonRecord).$value = aliasValue
      if (!(existing as JsonRecord).$type) (existing as JsonRecord).$type = row.type
    } else {
      parent[key] = { $type: row.type, $value: aliasValue }
    }

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

  //   const picked = pickDocForRowPath(docs, row.path, workspaceStore)
  //   if (!picked) {
  //     console.warn('clearTokenAlias: token not found in any uploaded doc', row.path)
  //     return
  //   }

  //   const { fileName, doc } = picked

  //   const pathSegments = row.path.split('.')
  //   const key = pathSegments.pop()!
  //   const parentPath = pathSegments

  //   const parent = ensurePath(doc, parentPath)
  //   const literal = parseRowLiteralValue(row)
  //   const existing = parent[key]

  //   if (isFigmaSyncedToken(existing)) {
  //     const copy = { ...workspaceStore.overrides }
  //     delete copy[row.path]
  //     workspaceStore.overrides = copy

  //     await workspaceStore.saveToServer()
  //     await persistUploadedDocsAndReload()
  //     return
  //   }

  //   if (isJsonRecord(existing)) {
  //     ;(existing as JsonRecord).$value = literal
  //     if (!(existing as JsonRecord).$type) (existing as JsonRecord).$type = row.type
  //   } else {
  //     parent[key] = { $type: row.type, $value: literal }
  //   }

  //   uploadedDocs.value[fileName] = doc
  //   await persistUploadedDocsAndReload()
  // }
  async function clearTokenAlias(row: TableRow): Promise<void> {
    const mode = getEffectiveModeForPath(row.path)

    // ✅ MODE-ADDED: clear alias by writing a literal back into modeAddedRows
    {
      const hit = findModeAddedRow(workspaceStore, mode, row.path)
      if (hit) {
        const literal = parseRowLiteralValue(row)

        const nextRows = [...hit.rows]
        const existing = nextRows[hit.index]

        nextRows[hit.index] = {
          ...existing,
          type: row.type,
          value: literal,
          raw: literal,
        }

        writeModeAddedRows(workspaceStore, mode, hit.groupKey, nextRows)

        // avoid double sources (override + modeAddedRows)
        removeOverridesForPath(workspaceStore, mode, row.path)

        await workspaceStore.saveToServer()
        await persistUploadedDocsAndReload()
        return
      }
    }

    // ---- existing logic (unchanged) ----
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
    const existing = parent[key]

    if (isFigmaSyncedToken(existing)) {
      const k = `${mode}::${row.path}`

      workspaceStore.overrides = {
        ...workspaceStore.overrides,
        [k]: literal,
      }

      await workspaceStore.saveToServer()
      await persistUploadedDocsAndReload()
      return
    }

    if (isJsonRecord(existing)) {
      ;(existing as JsonRecord).$value = literal
      if (!(existing as JsonRecord).$type) (existing as JsonRecord).$type = row.type
    } else {
      parent[key] = { $type: row.type, $value: literal }
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
