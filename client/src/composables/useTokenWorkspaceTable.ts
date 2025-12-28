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
import { expandNameOverrides } from '@/utils/dtcg/expandNameOverrides'

type TokenType = TableRow['type']

interface ModeAddedRow {
  path: string
  type: TokenType
  value: JsonValue
  name?: string
  raw?: JsonValue
}

function buildOverrideRules(overrides: Record<string, string>) {
  // Sort longest path first so "a.b" applies before "a"
  return Object.entries(overrides)
    .filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && v.trim().length > 0)
    .sort((a, b) => b[0].split('.').length - a[0].split('.').length)
}

function mapPathSegmentsByOverrides(
  path: string,
  overrides: Record<string, string>,
  direction: 'toDisplay' | 'toReal',
): string {
  if (!path || !path.includes('.')) return path

  const seg = path.split('.')
  const rules = buildOverrideRules(overrides)

  for (const [groupId, newLabel] of rules) {
    const gidSeg = groupId.split('.')
    const parentSeg = gidSeg.slice(0, -1)
    const oldKey = gidSeg[gidSeg.length - 1]
    const idx = parentSeg.length

    // must match parent path exactly
    let parentMatches = true
    for (let i = 0; i < parentSeg.length; i++) {
      if (seg[i] !== parentSeg[i]) {
        parentMatches = false
        break
      }
    }
    if (!parentMatches) continue
    if (idx >= seg.length) continue

    if (direction === 'toDisplay') {
      if (seg[idx] === oldKey) seg[idx] = newLabel
    } else {
      // toReal: reverse mapping
      if (seg[idx] === newLabel) seg[idx] = oldKey
    }
  }

  return seg.join('.')
}

function rewriteRefsInJsonValue(
  v: JsonValue,
  overrides: Record<string, string>,
  direction: 'toDisplay' | 'toReal',
): JsonValue {
  if (typeof v === 'string') {
    // handle "{path}" references
    const m = v.match(/^\{(.+)\}$/)
    if (m) {
      const inner = m[1]
      const mapped = mapPathSegmentsByOverrides(inner, overrides, direction)
      return `{${mapped}}`
    }

    // sometimes you store raw path strings too (your alias picker / overrides)
    if (v.includes('.')) {
      return mapPathSegmentsByOverrides(v, overrides, direction)
    }

    return v
  }

  if (Array.isArray(v)) {
    return v.map((x) => rewriteRefsInJsonValue(x as JsonValue, overrides, direction)) as JsonValue
  }

  if (v && typeof v === 'object') {
    const obj = v as Record<string, JsonValue>
    const out: Record<string, JsonValue> = {}
    for (const [k, val] of Object.entries(obj)) {
      out[k] = rewriteRefsInJsonValue(val, overrides, direction)
    }
    return out as JsonValue
  }

  return v
}

function isModeAddedRow(v: unknown): v is ModeAddedRow {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return typeof r.path === 'string' && typeof r.type === 'string' && 'value' in r
}

function getModeAddedRowsFor(
  store: ReturnType<typeof useTokenWorkspaceStore>,
  mode: string,
  groupKey: string,
): ModeAddedRow[] {
  const map = store.modeAddedRows ?? {}
  const key = `${mode}::${groupKey}`
  const raw = map[key]

  if (!Array.isArray(raw)) return []

  const out: ModeAddedRow[] = []
  for (const item of raw) {
    if (isModeAddedRow(item)) out.push(item)
  }
  return out
}

function isDeletedInMode(
  store: ReturnType<typeof useTokenWorkspaceStore>,
  mode: string,
  tokenPath: string,
): boolean {
  const map = store.modeDeletedPaths ?? {}
  const arr = map[mode]
  return Array.isArray(arr) && arr.includes(tokenPath)
}

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

  function debugAliasResolution(
    label: string,
    tokens: TokenEntry[],
    map: Record<string, TokenEntry>,
    watchPaths: string[],
  ): void {
    console.group(`[ALIAS DEBUG] ${label}`)

    for (const aliasPath of watchPaths) {
      const aliasEntry = tokens.find((t) => t.path === aliasPath)

      if (!aliasEntry) {
        console.log('❌ alias token not found:', aliasPath)
        continue
      }

      const rawValue = aliasEntry.value
      const rawString = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue)

      const match = typeof rawValue === 'string' ? rawValue.match(/^\{(.+)\}$/) : null

      const targetPath = match?.[1] ?? null

      console.log('---')
      console.log('alias token:', aliasPath)
      console.log('raw $value:', rawString)
      console.log('parsed target:', targetPath)

      if (targetPath) {
        const targetEntry = map[targetPath]
        console.log('map has target:', Boolean(targetEntry))
        console.log('target entry value:', targetEntry?.value)
        console.log('resolved target:', targetEntry ? resolveAlias(targetPath, map) : undefined)
      }

      console.log('resolved alias (resolveAlias):', resolveAlias(aliasPath, map))

      console.log('resolved alias (resolveValue):', resolveValue(rawValue, map))
    }

    console.groupEnd()
  }

  function toDisplayTokenPath(realPath: string): string {
    const groupOv = workspaceStore.groupNameOverrides ?? {}
    const nameOvFixed = expandNameOverrides(
      workspaceStore.nameOverrides ?? {},
      workspaceStore.groupNameOverrides ?? {},
    )
    const afterGroup = mapPathSegmentsByOverrides(realPath, groupOv, 'toDisplay')
    return nameOvFixed[afterGroup] ?? afterGroup
  }
  function toRealTokenPath(displayPath: string): string {
    const groupOv = workspaceStore.groupNameOverrides ?? {}

    // Build "display -> real" map for renamed tokens
    const nameOvFixed = expandNameOverrides(
      workspaceStore.nameOverrides ?? {},
      workspaceStore.groupNameOverrides ?? {},
    )

    const reverseName: Record<string, string> = {}
    for (const [real, display] of Object.entries(nameOvFixed)) {
      reverseName[display] = real
    }

    // 1) reverse token rename (grey.1000test -> grey.1000)
    const afterName = reverseName[displayPath] ?? displayPath

    // 2) reverse group rename (brand.colors -> brand.color) if you have that kind of rename
    return mapPathSegmentsByOverrides(afterName, groupOv, 'toReal')
  }

  function forceTableRefresh(): void {
    // 1) force Vue watchers + ag-grid to see a new reference
    rows.value = [...rows.value]
  }
  function rewriteRefsByToRealTokenPath(v: JsonValue): JsonValue {
    if (typeof v === 'string') {
      const m = v.match(/^\{(.+)\}$/)
      if (m) return `{${toRealTokenPath(m[1])}}`

      // sometimes you store raw dot paths too
      if (v.includes('.')) return toRealTokenPath(v)

      return v
    }

    if (Array.isArray(v)) {
      return v.map((x) => rewriteRefsByToRealTokenPath(x as JsonValue)) as JsonValue
    }

    if (v && typeof v === 'object') {
      const obj = v as Record<string, JsonValue>
      const out: Record<string, JsonValue> = {}
      for (const [k, val] of Object.entries(obj)) {
        out[k] = rewriteRefsByToRealTokenPath(val)
      }
      return out as JsonValue
    }

    return v
  }

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
  function groupKeyHasModes(groupKey: string): boolean {
    const map = groupScopedModeOptions.value
    if (map[groupKey]) return true

    const firstSeg = groupKey.split('.')[0]
    if (firstSeg && map[firstSeg]) return true

    return false
  }

  function getEffectiveModeForGroupKey(groupKey: string): string {
    // ✅ No-mode collections must always use "default"
    if (!groupKeyHasModes(groupKey)) return 'default'

    const globalMode = uiSelectedModifiers.value.mode ?? null
    const scopedMode = workspaceStore.scopedModifiers?.mode?.[groupKey]
    return scopedMode ?? globalMode ?? 'default'
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
    [
      () => uploadedDocs.value,
      () => workspaceStore.overrides,
      () => workspaceStore.modeDeletedPaths,
      () => workspaceStore.modeAddedRows,

      // 🔑 ADD THESE TWO
      () => workspaceStore.nameOverrides,
      () => workspaceStore.groupNameOverrides,
    ],
    () => {
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
  function makeNameOverridesFixed(): Record<string, string> {
    return expandNameOverrides(
      workspaceStore.nameOverrides ?? {},
      workspaceStore.groupNameOverrides ?? {},
    )
  }

  function rewriteAliasPathForUi(p: string): string {
    const groupOv = workspaceStore.groupNameOverrides ?? {}
    const nameOvFixed = makeNameOverridesFixed()

    const afterGroup = mapPathSegmentsByOverrides(p, groupOv, 'toDisplay')

    return nameOvFixed[p] ?? afterGroup
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

    for (const [realPath, entry] of Object.entries(map)) {
      const displayPath = toDisplayTokenPath(realPath)
      if (displayPath && displayPath !== realPath && !map[displayPath]) {
        map[displayPath] = entry
      }
    }
    debugAliasResolution('after map build', tokens, map, [
      'alias.color.primary.dark',
      'alias.color.primary.black',
    ])
    const newRows: TableRow[] = orderedTokens
      .map((t) => {
        const aliasRaw = extractAliasPath(t.value)
        const aliasPathReal = aliasRaw ? toRealTokenPath(aliasRaw) : null
        const aliasPathDisplay = aliasPathReal ? rewriteAliasPathForUi(aliasPathReal) : null

        // These are the ones we will actually use after overrides are applied
        let aliasPathRealFinal: string | null = aliasPathReal
        let aliasPathDisplayFinal: string | null = aliasPathDisplay

        let resolved: unknown
        if (aliasPathReal) {
          // force resolve using REAL alias target
          resolved = resolveValue(`{${aliasPathReal}}`, map) ?? t.value
        } else {
          resolved = resolveAlias(t.path, map) ?? resolveValue(t.value, map) ?? t.value
        }

        if (aliasPathReal && typeof t.value === 'string') {
          resolved = resolveValue(`{${aliasPathReal}}`, map) ?? resolveAlias(t.path, map) ?? t.value
        } else {
          resolved = resolveAlias(t.path, map) ?? resolveValue(t.value, map) ?? t.value
        }

        const groupPath = extractGroupPath(t.path)
        const groupKey = groupPath?.[0] ?? t.path.split('.')[0] ?? ''
        const effectiveMode = getEffectiveModeForGroupKey(groupKey)
        // console.log('[table row]', {
        //   path: t.path,
        //   effectiveMode,
        //   deleted: isDeletedInMode(workspaceStore, effectiveMode, t.path),
        //   modeDeletedPaths: workspaceStore.modeDeletedPaths,
        // })
        if (isDeletedInMode(workspaceStore, effectiveMode, t.path)) {
          return null
        }

        // mode-scoped override key + legacy fallback
        const directKey = `${effectiveMode}::${t.path}`
        const hasDirectOv =
          Object.prototype.hasOwnProperty.call(workspaceStore.overrides, directKey) ||
          Object.prototype.hasOwnProperty.call(workspaceStore.overrides, t.path)

        const directOv = workspaceStore.overrides[directKey] ?? workspaceStore.overrides[t.path]

        if (typeof directOv === 'string') {
          const ovAliasRaw = extractAliasPath(directOv)
          const ovAliasReal = ovAliasRaw ? toRealTokenPath(ovAliasRaw) : null
          const ovAliasDisplay = ovAliasReal ? rewriteAliasPathForUi(ovAliasReal) : null

          if (ovAliasReal) {
            // override becomes an alias -> keep alias info + resolve via REAL target
            aliasPathRealFinal = ovAliasReal
            aliasPathDisplayFinal = ovAliasDisplay
            resolved = resolveValue(`{${ovAliasReal}}`, map) ?? directOv
          } else {
            // override is a literal -> clear alias
            aliasPathRealFinal = null
            aliasPathDisplayFinal = null
            resolved = directOv
          }
        } else if (hasDirectOv) {
          // non-string override -> literal value
          aliasPathRealFinal = null
          aliasPathDisplayFinal = null
          resolved = directOv
        }

        const overridePathReal = aliasPathRealFinal ?? t.path

        if (overridePathReal !== t.path) {
          const aliasKey = `${effectiveMode}::${overridePathReal}`
          if (
            Object.prototype.hasOwnProperty.call(workspaceStore.overrides, aliasKey) ||
            Object.prototype.hasOwnProperty.call(workspaceStore.overrides, overridePathReal)
          ) {
            resolved =
              workspaceStore.overrides[aliasKey] ?? workspaceStore.overrides[overridePathReal]
          }
        }

        //console.log('TOKEN PATH:', t.path)

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
          isAlias: !!aliasPathDisplayFinal,
          aliasPath: aliasPathDisplayFinal ?? '',
        } as TableRow
      })
      .filter((r): r is TableRow => r !== null)

    //const globalMode = uiSelectedModifiers.value.mode ?? 'default'

    const existingPaths = new Set(newRows.map((r) => r.path))

    const topGroups = new Set<string>()
    for (const r of newRows) {
      const g0 = r.groupPath?.[0]
      if (g0) topGroups.add(g0)
    }

    for (const groupKey of topGroups) {
      const effectiveMode = getEffectiveModeForGroupKey(groupKey)
      const added = getModeAddedRowsFor(workspaceStore, effectiveMode, groupKey)

      for (const a of added) {
        const path = a.path
        if (!path) continue
        if (existingPaths.has(path)) continue
        if (isDeletedInMode(workspaceStore, effectiveMode, path)) continue

        const groupPath = extractGroupPath(path)
        const groupLabel = groupPath.length ? groupPath[groupPath.length - 1] : ''
        const name = a.name && a.name.trim().length > 0 ? a.name : (path.split('.').pop() ?? path)

        // ✅ alias detection for added/duplicated rows
        const rawValue: JsonValue = a.raw ?? a.value
        let aliasPath = extractAliasPath(rawValue)
        if (aliasPath) aliasPath = rewriteAliasPathForUi(aliasPath)

        // resolve value like normal rows do
        let resolved: unknown = rawValue
        if (typeof rawValue === 'string') {
          resolved = resolveValue(rawValue, map) ?? rawValue
        }

        let value = ''
        let hex = ''

        if (a.type === 'color') {
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

        newRows.push({
          name,
          value,
          hex,
          raw: rawValue,
          group: groupLabel,
          groupPath,
          path,
          type: a.type,
          isAlias: !!aliasPath,
          aliasPath: aliasPath ?? '',
        })

        existingPaths.add(path)
      }
    }

    const tokenOrderByPath = figmaOrderMap

    const rowOrderIndex = new Map<string, number>()
    workspaceStore.rowOrder.forEach((p: string, i: number) => rowOrderIndex.set(p, i))

    newRows.sort((a, b) => {
      const aGroupKey = buildGroupOrderKey(a.groupPath, tokenOrderByPath)
      const bGroupKey = buildGroupOrderKey(b.groupPath, tokenOrderByPath)

      // 1) keep your existing group hierarchy ordering
      const g = compareNumberArrays(aGroupKey, bGroupKey)
      if (g !== 0) return g

      // 2) within same group: use rowOrder if present (this fixes "add/duplicate below")
      const ai = rowOrderIndex.get(a.path) ?? Number.MAX_SAFE_INTEGER
      const bi = rowOrderIndex.get(b.path) ?? Number.MAX_SAFE_INTEGER
      if (ai !== bi) return ai - bi

      // 3) fallback to figma order
      const ao = tokenOrderByPath.get(a.path) ?? Number.MAX_SAFE_INTEGER
      const bo = tokenOrderByPath.get(b.path) ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo

      return 0
    })

    rows.value.splice(0, rows.value.length, ...newRows)
  }

  // async function resolveAndPopulateFromUploadedDocs(): Promise<void> {
  //   const docs = uploadedDocs.value
  //   if (Object.keys(docs).length === 0) return
  //   const overrides = workspaceStore.groupNameOverrides ?? {}
  //   const normalizedDocs: Record<string, JsonValue> = {}
  //   for (const [name, content] of Object.entries(docs)) {
  //     normalizedDocs[name] = rewriteRefsInJsonValue(content, overrides, 'toReal')
  //   }

  //   try {
  //     type ResolverInput = Record<string, string> & {
  //       scopedModifiers?: Record<string, Record<string, string>>
  //     }

  //     const input: ResolverInput = { ...uiSelectedModifiers.value }
  //     input.scopedModifiers = workspaceStore.scopedModifiers ?? {}

  //     const resolvedDoc = resolveUploadedDocuments(docs, input)

  //     console.log('[Table] resolvedDoc sample:', JSON.stringify(resolvedDoc, null, 2).slice(0, 500))

  //     await populateTableFromDocument(resolvedDoc)
  //     if (rows.value.length > 0) {
  //       errorMessage.value = null
  //     }
  //   } catch (err) {
  //     console.error('Error resolving tokens:', err)
  //     errorMessage.value =
  //       err instanceof Error ? err.message : 'Error resolving tokens with current modifier values.'
  //     rows.value = []
  //   }
  // }
  async function resolveAndPopulateFromUploadedDocs(): Promise<void> {
    const docs = uploadedDocs.value
    if (Object.keys(docs).length === 0) return

    const overrides = workspaceStore.groupNameOverrides ?? {}
    const normalizedDocs: Record<string, JsonValue> = {}
    for (const [name, content] of Object.entries(docs)) {
      // 1) group override mapping
      const step1 = rewriteRefsInJsonValue(content, overrides, 'toReal')
      // 2) token rename mapping (nameOverrides + groupNameOverrides via toRealTokenPath)
      normalizedDocs[name] = rewriteRefsByToRealTokenPath(step1)
    }

    try {
      type ResolverInput = Record<string, string> & {
        scopedModifiers?: Record<string, Record<string, string>>
      }

      const input: ResolverInput = { ...uiSelectedModifiers.value }
      input.scopedModifiers = workspaceStore.scopedModifiers ?? {}

      // ✅ IMPORTANT: resolve using normalized docs (real paths)
      const resolvedDoc = resolveUploadedDocuments(normalizedDocs, input)

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
    getEffectiveModeForPath: (tokenPath: string) => {
      const groupKey = extractGroupPath(tokenPath)?.[0] ?? tokenPath.split('.')[0] ?? ''
      return getEffectiveModeForGroupKey(groupKey)
    },
  })
  console.warn('[WIRE DEBUG] updateTokenName function =', updateTokenName)

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
    buildOverrideRules,
    mapPathSegmentsByOverrides,
    toDisplayTokenPath,
    toRealTokenPath,
    forceTableRefresh,
  }
}
