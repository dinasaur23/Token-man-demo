import { ref, computed, onMounted, watch } from 'vue'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'
import {
  resolveUploadedDocuments,
  extractModifiersFromDocs,
  type DetectedModifier,
  type JsonValue,
} from '@/utils/dtcg/resolver'
import {
  collectColorTokensWithPath,
  resolveAlias,
  resolveValue,
  type ColorTokenEntry,
} from '@/utils/dtcg/dtcg-parser'
import { validateTokensStrict } from '@/utils/dtcg/dtcg-validator'
import { buildGroupTree, extractGroupPath } from '@/utils/dtcg/grouping'
import { makeDisplayColor } from '@/utils/dtcg/color-display'
import type { GroupNode, TableRow } from '@/utils/dtcg/token-table-types'
import { convertHexColorsInDocument } from '@/utils/dtcg/color-conversion'
import { pruneEmptyChildren } from '@/utils/dtcg/grouping'
import { useTokenCrud } from './useTokenCrud'

function sortTokensByRowOrder(tokens: ColorTokenEntry[], rowOrder: string[]): ColorTokenEntry[] {
  const order = rowOrder
  const indexMap = new Map<string, number>()
  order.forEach((path: string, idx: number) => indexMap.set(path, idx))

  const withMeta = tokens.map((t, defaultIndex) => {
    const idx = indexMap.get(t.path)
    return {
      token: t,
      orderIndex: idx ?? Number.MAX_SAFE_INTEGER,
      defaultIndex,
    }
  })

  withMeta.sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex
    return a.defaultIndex - b.defaultIndex
  })

  return withMeta.map((m) => m.token)
}

export function useTokenWorkspaceTable() {
  const rows = ref<TableRow[]>([])
  const errorMessage = ref<string | null>(null)
  // watch(errorMessage, (val) => {
  //   console.log('🔍 UI sees errorMessage =', val)
  // })
  const activeNodeIds = ref<string[]>([])
  const uploadedDocs = ref<Record<string, JsonValue>>({})
  const detectedModifiers = ref<DetectedModifier[]>([])
  const selectedModifiers = ref<Record<string, string>>({})
  const workspaceStore = useTokenWorkspaceStore()

  const groupTreeItems = computed<GroupNode[]>(() => pruneEmptyChildren(buildGroupTree(rows.value)))

  const filteredRows = computed<TableRow[]>(() => {
    const g = activeNodeIds.value[0]
    if (!g) return rows.value

    return rows.value.filter((r) => {
      const id = r.groupPath.join('.')
      return id === g || id.startsWith(g + '.')
    })
  })

  watch(
    [() => uploadedDocs.value, () => workspaceStore.overrides],
    () => {
      // only run when docs are non-empty (optional)
      if (Object.keys(uploadedDocs.value).length > 0) {
        resolveAndPopulateFromUploadedDocs().catch((err) => {
          console.error('Watch-triggered table refresh failed:', err)
        })
      }
    },
    { deep: true },
  )

  watch(
    () => workspaceStore.files,
    async () => {
      console.log(
        '[Table] workspaceStore.files changed → syncing table, file count =',
        workspaceStore.files.length,
      )

      // Reset table visual state so we don't mix DS1+DS2
      rows.value = []
      activeNodeIds.value = []
      errorMessage.value = null

      if (workspaceStore.files.length === 0) {
        uploadedDocs.value = {}
        detectedModifiers.value = []
        selectedModifiers.value = {}
        return
      }

      await syncFromWorkspaceStoreFiles()
    },
    { deep: true },
  )

  function extractAliasPath(raw: unknown): string | null {
    if (!raw) return null

    if (typeof raw === 'string') {
      const braceMatch = raw.match(/^\{(.+)\}$/)
      if (braceMatch) return braceMatch[1]
      return raw.includes('.') ? raw : null
    }

    if (typeof raw === 'object') {
      const obj = raw as Record<string, unknown>

      if (typeof obj.alias === 'string') {
        return obj.alias
      }

      if (obj.$value) {
        const v = obj.$value as unknown

        if (typeof v === 'string') {
          const braceMatch = v.match(/^\{(.+)\}$/)
          if (braceMatch) return braceMatch[1]
          return v.includes('.') ? v : null
        }

        if (typeof v === 'object' && v !== null) {
          const vObj = v as Record<string, unknown>
          if (typeof vObj.alias === 'string') {
            return vObj.alias
          }
        }
      }
    }

    return null
  }

  // ---- persist helper used by CRUD composable -------------------------

  async function persistUploadedDocsAndReload(): Promise<void> {
    workspaceStore.files = Object.entries(uploadedDocs.value).map(([name, content]) => ({
      name,
      content,
    }))

    await workspaceStore.saveToServer()
    await resolveAndPopulateFromUploadedDocs()
  }

  async function populateTableFromDocument(doc: unknown): Promise<void> {
    const convertedDoc = convertHexColorsInDocument(doc)
    const validation = await validateTokensStrict(convertedDoc)
    //console.log('✅ DTCG validation result:', validation)

    if (!validation.ok) {
      //console.error('❌ DTCG validation errors:', validation.errors)
      const count = validation.errors.length
      errorMessage.value =
        `The uploaded JSON is not valid DTCG (${validation.kind} errors: ${count}). ` +
        `Open the browser console for details.`
      rows.value = []
      return
    }

    const tokens = collectColorTokensWithPath(convertedDoc)

    if (workspaceStore.rowOrder.length === 0) {
      workspaceStore.rowOrder = tokens.map((t) => t.path)
    }

    const orderedTokens = sortTokensByRowOrder(tokens, workspaceStore.rowOrder)
    const map: Record<string, ColorTokenEntry> = {}
    for (const t of tokens) {
      map[t.path] = t
      const match = t.path.match(/((?:global|alias)\.color\..+)$/)
      if (match) {
        const shortKey = match[1]
        if (!map[shortKey]) {
          map[shortKey] = t
        }
      }
    }

    const newRows: TableRow[] = orderedTokens.map((t) => {
      const aliasPath = extractAliasPath(t.value)

      if (aliasPath && workspaceStore.overrides[t.path]) {
        delete workspaceStore.overrides[t.path]
      }

      let resolved = resolveAlias(t.path, map) ?? resolveValue(t.value, map) ?? t.value

      if (aliasPath && workspaceStore.overrides[aliasPath]) {
        resolved = workspaceStore.overrides[aliasPath]
      }

      if (!aliasPath && workspaceStore.overrides[t.path]) {
        resolved = workspaceStore.overrides[t.path]
      }

      const display = makeDisplayColor(resolved)

      const groupPath = extractGroupPath(t.path)
      const groupLabel = groupPath.length ? groupPath[groupPath.length - 1] : ''
      const nameOverride = workspaceStore.nameOverrides[t.path]
      const fallbackName = t.path.split('.').pop() ?? t.path
      const name = nameOverride && nameOverride.trim().length > 0 ? nameOverride : fallbackName

      return {
        name,
        value: display.srgb,
        hex: display.hex,
        raw: t.value,
        group: groupLabel,
        groupPath,
        path: t.path,
        isAlias: !!aliasPath,
        aliasPath: aliasPath ?? '',
      }
    })

    rows.value.splice(0, rows.value.length, ...newRows)
  }

  async function resolveAndPopulateFromUploadedDocs(): Promise<void> {
    const docs = uploadedDocs.value
    if (Object.keys(docs).length === 0) return

    try {
      const input: Record<string, string> = { ...selectedModifiers.value }
      const resolvedDoc = resolveUploadedDocuments(docs, input)
      await populateTableFromDocument(resolvedDoc)
      if (rows.value.length > 0) {
        errorMessage.value = null
      }
    } catch (err) {
      console.error('Error resolving tokens:', err)
      errorMessage.value =
        err instanceof Error ? err.message : 'Error resolving tokens with current modifier values.'
      rows.value = []
    }
  }

  function onModifierChange(name: string, value: string | null): void {
    if (!value) {
      delete selectedModifiers.value[name]
      delete workspaceStore.modifiers[name]
    } else {
      selectedModifiers.value[name] = value
      workspaceStore.modifiers[name] = value
    }

    void workspaceStore.saveToServer()
    void resolveAndPopulateFromUploadedDocs()
  }

  async function onFileChange(newFiles: File[] | File | null): Promise<void> {
    rows.value = []
    errorMessage.value = null
    activeNodeIds.value = []

    if (!newFiles) {
      uploadedDocs.value = {}
      detectedModifiers.value = []
      selectedModifiers.value = {}
      workspaceStore.files = []
      workspaceStore.modifiers = {}
      await workspaceStore.saveToServer()
      return
    }

    const fileList: File[] = Array.isArray(newFiles) ? newFiles : [newFiles]
    if (fileList.length === 0) {
      uploadedDocs.value = {}
      detectedModifiers.value = []
      selectedModifiers.value = {}
      workspaceStore.files = []
      workspaceStore.modifiers = {}
      await workspaceStore.saveToServer()
      return
    }

    const docs: Record<string, JsonValue> = {}
    const dtoFiles: { name: string; content: JsonValue }[] = []

    for (const file of fileList) {
      try {
        const text = await file.text()
        const json = JSON.parse(text) as JsonValue
        docs[file.name] = json
        dtoFiles.push({ name: file.name, content: json })
      } catch (err) {
        console.error('Error parsing file', file.name, err)
        errorMessage.value = `File "${file.name}" is not valid JSON.`
        return
      }
    }

    uploadedDocs.value = docs
    workspaceStore.files = dtoFiles
    await workspaceStore.saveToServer()

    detectedModifiers.value = extractModifiersFromDocs(docs)
    selectedModifiers.value = {}

    for (const mod of detectedModifiers.value) {
      const initial = mod.defaultValue ?? (mod.values.length > 0 ? mod.values[0] : '')
      if (initial) {
        selectedModifiers.value[mod.name] = initial
      }
    }

    workspaceStore.modifiers = { ...selectedModifiers.value }
    await workspaceStore.saveToServer()

    await resolveAndPopulateFromUploadedDocs()
  }
  async function syncFromWorkspaceStoreFiles(): Promise<void> {
    // 1) copy files from store → uploadedDocs
    const docs: Record<string, JsonValue> = {}

    for (const file of workspaceStore.files) {
      docs[file.name] = file.content as JsonValue
    }
    uploadedDocs.value = docs

    // 2) rebuild modifiers
    detectedModifiers.value = extractModifiersFromDocs(docs)
    selectedModifiers.value = { ...workspaceStore.modifiers }

    if (Object.keys(selectedModifiers.value).length === 0) {
      for (const mod of detectedModifiers.value) {
        const initial = mod.defaultValue ?? (mod.values.length > 0 ? mod.values[0] : '')
        if (initial) {
          selectedModifiers.value[mod.name] = initial
        }
      }
    }

    // 3) actually rebuild rows
    await resolveAndPopulateFromUploadedDocs()
  }

  async function initFromWorkspaceStore(): Promise<void> {
    await workspaceStore.loadFromServer()
    if (workspaceStore.files.length === 0) return

    await syncFromWorkspaceStoreFiles()
  }

  const {
    updateTokenValue,
    updateTokenName,
    deleteToken,
    duplicateToken,
    addRowBelowToken,
    addGroupWithToken,
    addSiblingGroupWithToken,
    setTokenAlias,
    clearTokenAlias,
  } = useTokenCrud({
    uploadedDocs,
    workspaceStore,
    persistUploadedDocsAndReload,
  })

  async function addSiblingGroupForActiveGroup(newGroupName: string): Promise<void> {
    const trimmed = newGroupName.trim()
    if (!trimmed) return

    const activeId = activeNodeIds.value[0] ?? ''

    const siblingPath = activeId ? activeId.split('.') : []

    await addSiblingGroupWithToken(siblingPath, trimmed)
  }

  onMounted(() => {
    void initFromWorkspaceStore()
  })

  return {
    // state for the component
    rows,
    errorMessage,
    activeNodeIds,
    detectedModifiers,
    selectedModifiers,
    groupTreeItems,
    filteredRows,

    // handlers for the component
    onFileChange,
    onModifierChange,

    // CRUD handlers (use these in ag-grid)
    updateTokenValue,
    updateTokenName,
    deleteToken,
    duplicateToken,
    addRowBelowToken,
    addGroupWithToken,
    addSiblingGroupForActiveGroup,
    setTokenAlias,
    clearTokenAlias,
  }
}
