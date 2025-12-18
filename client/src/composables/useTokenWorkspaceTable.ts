import { ref, computed, onMounted, watch } from 'vue'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'
import {
  resolveUploadedDocuments,
  extractModifiersFromDocs,
  extractGroupModesFromResolverDocs,
  type DetectedModifier,
  type JsonValue,
} from '@/utils/dtcg/resolver'
import {
  //collectColorTokensWithPath,
  collectTokensWithPath,
  resolveAlias,
  resolveValue,
  type TokenEntry,
} from '@/utils/dtcg/dtcg-parser'
import { validateTokensStrict } from '@/utils/dtcg/dtcg-validator'
import { buildGroupTree, extractGroupPath } from '@/utils/dtcg/grouping'
import { makeDisplayColor } from '@/utils/dtcg/color-display'
import type { GroupNode, TableRow } from '@/utils/dtcg/token-table-types'
import { convertHexColorsInDocument } from '@/utils/dtcg/color-conversion'
import { pruneEmptyChildren } from '@/utils/dtcg/grouping'
import { useTokenCrud } from './useTokenCrud'
import type { FigmaModifierOptions } from '@/stores/TokenWorkspace'

function collectFigmaOrderMap(doc: unknown): Map<string, number> {
  const map = new Map<string, number>()

  type AnyRecord = Record<string, unknown>

  function isObject(v: unknown): v is AnyRecord {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
  }

  const root = isObject(doc) && isObject(doc.tokens) ? doc.tokens : doc

  function walk(node: unknown, path: string[]) {
    if (!isObject(node)) return

    const maybeType = node['$type']
    if (typeof maybeType === 'string') {
      const ext = node['$extensions']
      if (isObject(ext)) {
        const figma = ext['figma']
        if (isObject(figma)) {
          const order = figma['order']
          if (typeof order === 'number' && Number.isFinite(order)) {
            map.set(path.join('.'), order)
          }
        }
      }
      return
    }

    for (const key of Object.keys(node)) {
      if (key === '$type' || key === '$value' || key === '$extensions') continue
      walk(node[key], path.concat(key))
    }
  }

  walk(root, [])
  return map
}
function buildGroupOrderKey(groupPath: string[], tokenOrderByPath: Map<string, number>): number[] {
  const key: number[] = []

  for (let i = 0; i < groupPath.length; i++) {
    const prefix = groupPath.slice(0, i + 1).join('.')

    // Find minimum order among tokens that start with this prefix + "."
    let min = Number.MAX_SAFE_INTEGER
    const prefixDot = prefix + '.'

    for (const [tokenPath, ord] of tokenOrderByPath.entries()) {
      if (tokenPath === prefix || tokenPath.startsWith(prefixDot)) {
        if (ord < min) min = ord
      }
    }

    key.push(min)
  }

  return key
}

function compareNumberArrays(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? Number.MAX_SAFE_INTEGER
    const bv = b[i] ?? Number.MAX_SAFE_INTEGER
    if (av !== bv) return av - bv
  }
  return 0
}

function sortTokensByRowOrder(tokens: TokenEntry[], rowOrder: string[]): TokenEntry[] {
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
  const selectedScopedModifiersByGroup = ref<Record<string, string>>({})
  const workspaceStore = useTokenWorkspaceStore()
  const groupScopedModifierName = ref<string | null>(null)
  const groupScopedModeOptions = ref<Record<string, string[]>>({})

  //const groupTreeItems = computed<GroupNode[]>(() => pruneEmptyChildren(buildGroupTree(rows.value)))
  const groupTreeItems = computed<GroupNode[]>(() => {
    const base = pruneEmptyChildren(buildGroupTree(rows.value))
    const overrides = workspaceStore.groupNameOverrides ?? {}

    function applyOverrides(nodes: GroupNode[]): GroupNode[] {
      return nodes.map((node) => {
        const overriddenTitle = overrides[node.id] ?? node.title

        // only keep children when there actually are children
        if (node.children && node.children.length > 0) {
          return {
            id: node.id,
            title: overriddenTitle,
            children: applyOverrides(node.children), // node.children is GroupNode[] here
          }
        }

        // leaf node: no children property at all → no arrow in v-treeview
        return {
          id: node.id,
          title: overriddenTitle,
        }
      })
    }

    return applyOverrides(base)
  })

  watch(
    groupTreeItems,
    (items) => {
      if (!items.length) return
      if (activeNodeIds.value.length === 0) {
        activeNodeIds.value = [items[0].id]
      }
    },
    { immediate: true },
  )

  const activeGroupId = computed<string | null>(() => activeNodeIds.value[0] ?? null)

  function getScopedGroupKey(): string | null {
    const activeId = activeGroupId.value
    if (!activeId) return null

    const map = groupScopedModeOptions.value
    if (map[activeId]) return activeId

    const firstSeg = activeId.split('.')[0]
    if (firstSeg && map[firstSeg]) return firstSeg

    return null
  }

  const filteredRows = computed<TableRow[]>(() => {
    const g = activeNodeIds.value[0]
    // ⬇️ when no active group → show nothing
    if (!g) return []

    return rows.value.filter((r) => {
      const id = r.groupPath.join('.')
      return id === g || id.startsWith(g + '.')
    })
  })

  const modeOptionsForActiveGroup = computed<string[]>(() => {
    // No group-scoped modifier → nothing to show
    if (!groupScopedModifierName.value) return []

    const activeId = activeGroupId.value
    if (!activeId) return []

    const map = groupScopedModeOptions.value

    // Try full id first (e.g. "components.button"), then first segment ("components")
    const candidates: string[] = [activeId]
    const firstSeg = activeId.split('.')[0]
    if (firstSeg && firstSeg !== activeId) {
      candidates.push(firstSeg)
    }

    for (const cand of candidates) {
      const scoped = map[cand]
      if (Array.isArray(scoped) && scoped.length > 0) {
        // groupModes already contains only the allowed values
        return scoped
      }
    }

    // This group has no mapped modes
    return []
  })

  // Does the *current* group have any modes mapped in the resolver?
  const groupHasModes = computed<boolean>(() => {
    const activeId = activeGroupId.value
    if (!activeId) return false

    const map = groupScopedModeOptions.value

    const candidates: string[] = [activeId]
    const firstSeg = activeId.split('.')[0]
    if (firstSeg && firstSeg !== activeId) {
      candidates.push(firstSeg)
    }

    for (const cand of candidates) {
      const scoped = map[cand]
      if (Array.isArray(scoped) && scoped.length > 0) {
        return true
      }
    }

    return false
  })

  const visibleModifiers = computed<DetectedModifier[]>(() => {
    if (!groupScopedModifierName.value) {
      return detectedModifiers.value
    }

    const activeId = activeGroupId.value
    const map = groupScopedModeOptions.value

    let hasScopedOptions = false

    if (activeId) {
      const candidates: string[] = [activeId]
      const firstSeg = activeId.split('.')[0]
      if (firstSeg && firstSeg !== activeId) {
        candidates.push(firstSeg)
      }

      for (const cand of candidates) {
        const scoped = map[cand]
        if (Array.isArray(scoped) && scoped.length > 0) {
          hasScopedOptions = true
          break
        }
      }
    }

    return detectedModifiers.value.filter((mod) => {
      if (mod.name !== groupScopedModifierName.value) {
        return true
      }
      return hasScopedOptions
    })
  })

  const uiSelectedModifiers = computed<Record<string, string>>(() => {
    const out: Record<string, string> = { ...selectedModifiers.value }

    const scopedName = groupScopedModifierName.value
    const gk = getScopedGroupKey()

    if (scopedName && gk) {
      const v =
        selectedScopedModifiersByGroup.value[gk] ??
        workspaceStore.scopedModifiers?.[scopedName]?.[gk]

      if (v) out[scopedName] = v
    }

    return out
  })

  watch([activeGroupId, visibleModifiers], ([g, mods]) => {
    console.log(
      '[mods] active group =',
      g,
      'visible =',
      mods.map((m) => m.name),
    )
  })

  watch(
    () => ({
      activeId: activeGroupId.value,
      scopedName: groupScopedModifierName.value,
      options: modeOptionsForActiveGroup.value,
    }),
    ({ activeId, scopedName, options }) => {
      if (!activeId || !scopedName) return
      if (!options.length) return

      const gk = getScopedGroupKey()
      if (!gk) return

      // ✅ IMPORTANT: read persisted scoped selection too
      const stored =
        selectedScopedModifiersByGroup.value[gk] ??
        workspaceStore.scopedModifiers?.[scopedName]?.[gk]

      // if valid, keep local memory in sync and sync current global selection
      if (stored && options.includes(stored)) {
        selectedScopedModifiersByGroup.value[gk] = stored
        // selectedModifiers.value[scopedName] = stored
        // workspaceStore.modifiers[scopedName] = stored
        return
      }

      // otherwise initialize to first option
      const first = options[0]
      if (!first) return

      selectedScopedModifiersByGroup.value[gk] = first

      const nextScoped = { ...(workspaceStore.scopedModifiers ?? {}) }
      nextScoped[scopedName] = { ...(nextScoped[scopedName] ?? {}), [gk]: first }
      workspaceStore.scopedModifiers = nextScoped

      // selectedModifiers.value[scopedName] = first
      // workspaceStore.modifiers[scopedName] = first
    },
    { immediate: true },
  )

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
    () => ({
      files: workspaceStore.files,
      figmaModifiers: workspaceStore.figmaModifierOptions,
    }),
    async (ws, prevWs) => {
      console.log('[Workspace watch] Triggered')
      console.log('files:', ws.files)
      console.log('figmaModifierOptions from store:', ws.figmaModifiers)

      // only react when files / figma options actually change
      if (prevWs && ws.files === prevWs.files && ws.figmaModifiers === prevWs.figmaModifiers) {
        return
      }

      rows.value = []
      errorMessage.value = null
      // IMPORTANT: do NOT touch activeNodeIds here – keeps current group

      if (ws.files.length === 0) {
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
    //console.log('DTCG validation result:', validation)

    if (!validation.ok) {
      //console.error('DTCG validation errors:', validation.errors)
      const count = validation.errors.length
      errorMessage.value =
        `The uploaded JSON is not valid DTCG (${validation.kind} errors: ${count}). ` +
        `Open the browser console for details.`
      rows.value = []
      return
    }

    const root =
      typeof convertedDoc === 'object' &&
      convertedDoc !== null &&
      'tokens' in (convertedDoc as Record<string, unknown>) &&
      typeof (convertedDoc as Record<string, unknown>).tokens === 'object' &&
      (convertedDoc as Record<string, unknown>).tokens !== null
        ? (convertedDoc as Record<string, unknown>).tokens
        : convertedDoc

    const tokens = collectTokensWithPath(root)
    const figmaOrderMap = collectFigmaOrderMap(convertedDoc) // this one unwraps internally

    if (figmaOrderMap.size > 0 && workspaceStore.rowOrder.length === 0) {
      workspaceStore.rowOrder = Array.from(figmaOrderMap.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([path]) => path)
    }

    if (workspaceStore.rowOrder.length === 0) {
      workspaceStore.rowOrder = tokens.map((t) => t.path)
    }

    const orderedTokens = sortTokensByRowOrder(tokens, workspaceStore.rowOrder)
    const map: Record<string, TokenEntry> = {}

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
      let aliasPath = extractAliasPath(t.value)

      let resolved = resolveAlias(t.path, map) ?? resolveValue(t.value, map) ?? t.value

      const hasDirectOv = Object.prototype.hasOwnProperty.call(workspaceStore.overrides, t.path)
      const directOv = workspaceStore.overrides[t.path]

      if (typeof directOv === 'string') {
        const ovAlias = extractAliasPath(directOv)

        if (ovAlias) {
          aliasPath = ovAlias
          resolved = resolveValue(directOv, map) ?? directOv
        } else {
          aliasPath = null
          resolved = directOv
        }
      } else if (hasDirectOv) {
        aliasPath = null
        resolved = directOv
      }

      const overridePath = aliasPath ?? t.path
      if (
        overridePath !== t.path &&
        Object.prototype.hasOwnProperty.call(workspaceStore.overrides, overridePath)
      ) {
        resolved = workspaceStore.overrides[overridePath]
      }

      //console.log('TOKEN PATH:', t.path)
      const groupPath = extractGroupPath(t.path)
      const groupLabel = groupPath.length ? groupPath[groupPath.length - 1] : ''
      const nameOverride = workspaceStore.nameOverrides[t.path]
      const fallbackName = t.path.split('.').pop() ?? t.path
      const name = nameOverride && nameOverride.trim().length > 0 ? nameOverride : fallbackName

      let value = ''
      let hex = ''

      if (t.type === 'color') {
        const display = makeDisplayColor(resolved)
        value = display.srgb
        hex = display.hex
      } else if (typeof resolved === 'string') {
        value = resolved
      } else if (typeof resolved === 'number') {
        value = Number.isFinite(resolved) ? String(resolved) : ''
      } else if (typeof resolved === 'boolean') {
        value = resolved ? 'true' : 'false'
      } else if (resolved == null) {
        value = ''
      } else {
        try {
          value = JSON.stringify(resolved)
        } catch {
          value = String(resolved)
        }
      }

      return {
        name,
        value,
        hex,
        raw: t.value,
        group: groupLabel,
        groupPath,
        path: t.path,
        type: t.type,
        isAlias: !!aliasPath,
        aliasPath: aliasPath ?? '',
      }
    })
    // token order map is already by tokenPath -> order
    const tokenOrderByPath = figmaOrderMap

    newRows.sort((a, b) => {
      const aGroupKey = buildGroupOrderKey(a.groupPath, tokenOrderByPath)
      const bGroupKey = buildGroupOrderKey(b.groupPath, tokenOrderByPath)

      // 1) group hierarchy order (keeps Padding rows together, Margin rows together, etc.)
      const g = compareNumberArrays(aGroupKey, bGroupKey)
      if (g !== 0) return g

      // 2) within same group, sort by token order
      const ao = tokenOrderByPath.get(a.path) ?? Number.MAX_SAFE_INTEGER
      const bo = tokenOrderByPath.get(b.path) ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo

      return 0
    })

    rows.value.splice(0, rows.value.length, ...newRows)
  }

  async function resolveAndPopulateFromUploadedDocs(): Promise<void> {
    const docs = uploadedDocs.value
    if (Object.keys(docs).length === 0) return

    try {
      type ResolverInput = Record<string, string> & {
        scopedModifiers?: Record<string, Record<string, string>>
      }

      const input: ResolverInput = { ...uiSelectedModifiers.value }
      input.scopedModifiers = workspaceStore.scopedModifiers ?? {}

      const resolvedDoc = resolveUploadedDocuments(docs, input)

      console.log('[Table] resolvedDoc sample:', JSON.stringify(resolvedDoc, null, 2).slice(0, 500))

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
    const isGroupScoped = groupScopedModifierName.value === name && groupHasModes.value

    if (isGroupScoped) {
      const gk = getScopedGroupKey()
      if (!gk) return

      // update UI memory
      if (!value) {
        delete selectedScopedModifiersByGroup.value[gk]
      } else {
        selectedScopedModifiersByGroup.value[gk] = value
      }

      // ✅ update store.scopedModifiers without writing ""
      const nextScoped = { ...(workspaceStore.scopedModifiers ?? {}) }
      const byName = { ...(nextScoped[name] ?? {}) }

      if (!value) {
        delete byName[gk]
      } else {
        byName[gk] = value
      }

      nextScoped[name] = byName
      workspaceStore.scopedModifiers = nextScoped

      void workspaceStore.saveToServer().then(() => {
        void resolveAndPopulateFromUploadedDocs()
      })
      return
    }

    // normal (global) modifier
    if (!value) {
      delete selectedModifiers.value[name]
      delete workspaceStore.modifiers[name]
    } else {
      selectedModifiers.value[name] = value
      workspaceStore.modifiers[name] = value
    }

    void workspaceStore.saveToServer().then(() => {
      void resolveAndPopulateFromUploadedDocs()
    })
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
    selectedScopedModifiersByGroup.value = {}
    workspaceStore.scopedModifiers = {}

    await workspaceStore.saveToServer()

    await syncFromWorkspaceStoreFiles()
  }

  async function syncFromWorkspaceStoreFiles(): Promise<void> {
    // 1) rebuild docs from workspace files
    const docs: Record<string, JsonValue> = {}
    for (const file of workspaceStore.files) {
      docs[file.name] = file.content as JsonValue
    }
    uploadedDocs.value = docs

    // 2) modifiers + group modes from resolver docs (if there is a resolver)
    const resolverMods = extractModifiersFromDocs(docs)
    let groupModesInfo = extractGroupModesFromResolverDocs(docs)

    // 3) merge in Figma modifiers / group modes
    const figmaOpts = workspaceStore.figmaModifierOptions as FigmaModifierOptions
    console.log('[syncFromWorkspaceStoreFiles] figmaModifierOptions =', figmaOpts)

    const combined: DetectedModifier[] = [...resolverMods]

    const modeOpt = figmaOpts?.mode
    if (modeOpt && Array.isArray(modeOpt.values)) {
      const modeMod: DetectedModifier = {
        name: 'mode',
        values: modeOpt.values,
        defaultValue: modeOpt.default ?? modeOpt.values[0],
      }

      // avoid duplicate "mode" if resolver already defined one
      const hasModeAlready = combined.some((m) => m.name === 'mode')
      if (!hasModeAlready) {
        combined.push(modeMod)
      }

      // only take Figma's groupModes when resolver didn't already define some
      if (!groupModesInfo && modeOpt.groupModes) {
        groupModesInfo = {
          modifierName: 'mode',
          groupModes: modeOpt.groupModes,
        }
      }
    }

    detectedModifiers.value = combined
    console.log('[syncFromWorkspaceStoreFiles] detectedModifiers =', combined)

    // 4) write group scoped info for the UI
    if (groupModesInfo) {
      groupScopedModifierName.value = groupModesInfo.modifierName
      groupScopedModeOptions.value = groupModesInfo.groupModes
      console.log('[syncFromWorkspaceStoreFiles] group modes =', groupModesInfo)
    } else {
      groupScopedModifierName.value = null
      groupScopedModeOptions.value = {}
    }

    // 5) restore / initialize selected modifiers
    selectedModifiers.value = { ...workspaceStore.modifiers }

    if (Object.keys(selectedModifiers.value).length === 0) {
      for (const mod of combined) {
        const initial = mod.defaultValue ?? (mod.values.length > 0 ? mod.values[0] : '')
        if (initial) {
          selectedModifiers.value[mod.name] = initial
        }
      }
    }

    // 6) re-resolve tokens with current modifier selection
    await resolveAndPopulateFromUploadedDocs()
  }

  async function initFromWorkspaceStore(): Promise<void> {
    await workspaceStore.loadFromServer()
    console.log('figmaModifierOptions:', workspaceStore.figmaModifierOptions)
    if (workspaceStore.files.length === 0) return

    await syncFromWorkspaceStoreFiles()
  }

  const {
    updateTokenValue,
    updateTokenValueAny,
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
    activeGroupId,
    detectedModifiers,
    selectedModifiers,
    groupTreeItems,
    filteredRows,
    groupScopedModifierName,
    modeOptionsForActiveGroup,
    visibleModifiers,
    groupHasModes,
    uiSelectedModifiers,

    // handlers for the component
    onFileChange,
    onModifierChange,

    // CRUD handlers (use these in ag-grid)
    updateTokenValue,
    updateTokenValueAny,
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
