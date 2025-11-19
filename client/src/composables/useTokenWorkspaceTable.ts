import { ref, computed, onMounted } from 'vue'
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
  type ColorRow,
  type ColorTokenEntry,
} from '@/utils/dtcg/dtcg-parser'
import { validateTokensStrict } from '@/utils/dtcg/dtcg-validator'
import { buildGroupTree, extractGroupPath } from '@/utils/dtcg/grouping'
import { makeDisplayColor } from '@/utils/dtcg/color-display'
import type { GroupNode } from '@/utils/dtcg/token-table-types'
import { convertHexColorsInDocument } from '@/utils/dtcg/color-conversion'
import { pruneEmptyChildren } from '@/utils/dtcg/grouping'

export type TableRow = ColorRow & {
  raw?: unknown
  hex: string
  path: string
}

export function useTokenWorkspaceTable() {
  const rows = ref<TableRow[]>([])
  const errorMessage = ref<string | null>(null)
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

  async function populateTableFromDocument(doc: unknown): Promise<void> {
    const convertedDoc = convertHexColorsInDocument(doc)
    const validation = await validateTokensStrict(convertedDoc)

    if (!validation.ok) {
      const count = validation.errors.length
      errorMessage.value =
        `The uploaded JSON is not valid DTCG (${validation.kind} errors: ${count}). ` +
        `Open the browser console for details.`
      rows.value = []
      return
    }

    const tokens = collectColorTokensWithPath(convertedDoc)

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

    rows.value = tokens.map((t) => {
      const resolved = resolveAlias(t.path, map) ?? resolveValue(t.value, map) ?? t.value
      let display = makeDisplayColor(resolved)

      const override = workspaceStore.overrides[t.path]
      if (override) {
        display = makeDisplayColor(override)
      }

      const groupPath = extractGroupPath(t.path)
      const groupLabel = groupPath.length ? groupPath[groupPath.length - 1] : ''
      //const name = t.path.split('.').pop() ?? t.path
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
      } satisfies TableRow
    })

    activeNodeIds.value = []
  }

  async function resolveAndPopulateFromUploadedDocs(): Promise<void> {
    const docs = uploadedDocs.value
    if (Object.keys(docs).length === 0) return

    try {
      const input: Record<string, string> = { ...selectedModifiers.value }
      const resolvedDoc = resolveUploadedDocuments(docs, input)
      await populateTableFromDocument(resolvedDoc)
      errorMessage.value = null
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

  async function initFromWorkspaceStore(): Promise<void> {
    await workspaceStore.loadFromServer()
    if (workspaceStore.files.length === 0) return

    const docs: Record<string, JsonValue> = {}
    for (const file of workspaceStore.files) {
      docs[file.name] = file.content as JsonValue
    }
    uploadedDocs.value = docs

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

    await resolveAndPopulateFromUploadedDocs()
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
  }
}
