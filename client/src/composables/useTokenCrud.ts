// composables/useTokenCrud.ts
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
} from '@/utils/dtcg/json-path-helpers'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'

type WorkspaceStore = ReturnType<typeof useTokenWorkspaceStore>

interface CrudDeps {
  uploadedDocs: Ref<Record<string, JsonValue>>
  workspaceStore: WorkspaceStore
  persistUploadedDocsAndReload: () => Promise<void>
}

// small helper so we don’t repeat the same pattern
function ensureRowOrder(store: WorkspaceStore): string[] {
  if (!Array.isArray(store.rowOrder)) {
    // if backend didn’t send it yet, initialise
    store.rowOrder = []
  }
  return store.rowOrder
}

export function useTokenCrud({
  uploadedDocs,
  workspaceStore,
  persistUploadedDocsAndReload,
}: CrudDeps) {
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

    // clear overrides hiding the real JSON
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

    // update rowOrder entry
    const order = ensureRowOrder(workspaceStore)
    const idx = order.indexOf(row.path)
    if (idx >= 0) {
      order[idx] = newPath
    }

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  async function deleteToken(row: TableRow): Promise<void> {
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

    // remove from rowOrder
    const order = ensureRowOrder(workspaceStore)
    const idx = order.indexOf(row.path)
    if (idx >= 0) {
      order.splice(idx, 1)
    }

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

    // copy underlying token but force $value to row.hex
    let newToken: JsonValue
    if (isJsonRecord(original)) {
      const originalRecord: JsonRecord = original
      const copy = deepClone(originalRecord)
      copy['$value'] = row.hex
      newToken = copy
    } else {
      newToken = { $type: 'color', $value: row.hex }
    }

    parent[newKey] = newToken

    const newPathSegments = [...segments.slice(0, -1), newKey]
    const newPath = newPathSegments.join('.')

    // insert newPath in rowOrder directly after row.path
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
      $type: 'color',
      $value: '#000000', // or row.hex if you want same color by default
    }

    parent[newKey] = newToken

    const newPathSegments = [...segments.slice(0, -1), newKey]
    const newPath = newPathSegments.join('.')

    // insert newPath in rowOrder directly after row.path
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

    // add at end of group in rowOrder
    const order = ensureRowOrder(workspaceStore)
    order.push(newPath)

    uploadedDocs.value[fileName] = doc
    await persistUploadedDocsAndReload()
  }

  return {
    updateTokenValue,
    updateTokenName,
    deleteToken,
    duplicateToken,
    addRowBelowToken,
    addTokenToGroup,
  }
}
