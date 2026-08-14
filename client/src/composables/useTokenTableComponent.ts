import { ref, computed, watch, type Ref } from 'vue'
import { type GridApi, type GridReadyEvent } from 'ag-grid-community'
import { useTokenWorkspaceTable } from './useTokenWorkspaceTable'
import { useTokenGridContextMenu } from './useTokenGridContextMenu'
import type { TableRow, GroupNode } from '@/utils/dtcg/token-table-types'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'
import type { TokenTypeId } from '@/utils/dtcg/token-types'
import {
  applyGroupNameOverrides,
  buildGroupTreeWithTypeFallback,
  reconcileActiveGroupSelection,
  filterRowsByTokenType,
} from '@/utils/dtcg/grouping'

/**
 * Generic token-table shell composable.
 * Filters workspace rows and group tree to `tokenType`.
 */
export function useTokenTableComponent(tokenType: Ref<TokenTypeId> | TokenTypeId) {
  const tokenTypeRef = computed(() =>
    typeof tokenType === 'string' ? tokenType : tokenType.value,
  )

  const files = ref<File[] | null>(null)
  const wsStore = useTokenWorkspaceStore()

  const {
    rows,
    errorMessage,
    activeNodeIds,
    uploadedDocs,
    activeSourceFileName,
    tokenSetFileNames,
    setActiveSourceFileName,
    hasWorkspaceFiles,
    hasAnyTokens,
    detectedModifiers,
    selectedModifiers,
    filteredRows,
    groupScopedModifierName,
    modeOptionsForActiveGroup,
    visibleModifiers,
    groupHasModes,
    activeGroupId,
    uiSelectedModifiers,
    clearTokenAlias,
    setTokenAlias,
    addGroup,
    renameGroupForTokenType,
    deleteGroupFromSource,
    insertTokenInGroup,
    addRowBelowToken,
    duplicateToken,
    deleteToken,
    createTokenSet,
    onFileChange,
    onModifierChange,
    updateTokenValueAny,
    toDisplayTokenPath,
    isPersisting,
  } = useTokenWorkspaceTable()

  /** All workspace rows of the active type (effective type on each row). */
  const rowsOfSelectedType = computed(() =>
    filterRowsByTokenType(rows.value, tokenTypeRef.value),
  )

  /** True when the workspace has no tokens of the selected type (but may have other types). */
  const showTypeEmptyState = computed(
    () =>
      hasWorkspaceFiles.value &&
      rowsOfSelectedType.value.length === 0 &&
      rows.value.length > 0,
  )

  const showWorkspaceEmptyHint = computed(
    () => hasWorkspaceFiles.value && rows.value.length === 0,
  )

  /** Source documents scoped to the active token set (isolated resolution). */
  const activeSourceDocs = computed(() => {
    const name = activeSourceFileName.value
    if (!name || !(name in uploadedDocs.value)) return {}
    return { [name]: uploadedDocs.value[name]! }
  })

  const hasMultipleTokenSets = computed(() => tokenSetFileNames.value.length > 1)

  const activeTokenSetDisplayName = computed(() => activeSourceFileName.value ?? null)

  /**
   * Group tree filtered to the selected type; falls back to empty source groups
   * whose group-level `$type` matches the active route type.
   */
  const groupTreeItems = computed<GroupNode[]>(() => {
    const base = buildGroupTreeWithTypeFallback(
      rows.value,
      tokenTypeRef.value,
      activeSourceDocs.value,
    )
    const overrides = wsStore.groupNameOverrides ?? {}
    return applyGroupNameOverrides(base, overrides)
  })

  // Keep active selection inside the type-filtered tree.
  // Skips while persist is in flight (tree may be mid-rebuild). Watching
  // isPersisting ensures reconciliation runs once against the FINAL tree when
  // persistUploadedDocsAndReload flips it back to false — do not rely on
  // another dependency happening to change.
  watch(
    [tokenTypeRef, groupTreeItems, isPersisting],
    () => {
      if (isPersisting.value) return
      const next = reconcileActiveGroupSelection(
        groupTreeItems.value,
        activeNodeIds.value[0] ?? null,
      )
      const current = activeNodeIds.value
      if (current.length === next.length && current.every((id, i) => id === next[i])) {
        return
      }
      activeNodeIds.value = next
    },
    { immediate: true },
  )

  /** Rows for the active type page within the active group. */
  const typeFilteredRows = computed(() =>
    filteredRows.value.filter((r) => r.type === tokenTypeRef.value),
  )

  const gridApi = ref<GridApi<TableRow> | null>(null)
  const lastScrollPath = ref<string | null>(null)
  const selectedGridRow = ref<TableRow | null>(null)

  const canAddToken = computed(() => Boolean(activeGroupId.value))

  const showNewTokenSetDialog = ref(false)
  const newTokenSetName = ref('')
  const newTokenSetError = ref<string | null>(null)

  watch(activeGroupId, () => {
    selectedGridRow.value = null
  })

  watch(activeSourceFileName, () => {
    selectedGridRow.value = null
    const api = gridApi.value
    if (api && !api.isDestroyed()) {
      api.deselectAll()
    }
  })

  async function onActiveTokenSetChange(name: string | null): Promise<void> {
    await setActiveSourceFileName(name)
    selectedGridRow.value = null
    const api = gridApi.value
    if (api && !api.isDestroyed()) {
      api.deselectAll()
    }
  }

  const addGroupDialog = ref(false)
  const newGroupName = ref('')
  const currentParentGroupId = ref<string | null>(null)

  const showAddSiblingDialog = ref(false)
  const newSiblingGroupName = ref('')

  const addTokenDialog = ref(false)
  const newTokenName = ref('')
  const currentTokenGroupId = ref<string | null>(null)

  const editingGroupId = ref<string | null>(null)
  const editingGroupName = ref('')

  const addAliasDialog = ref(false)
  const aliasSourcePath = ref('')
  const currentAliasRow = ref<TableRow | null>(null)
  const aliasErrorMessage = ref<string | null>(null)

  const aliasOptions = computed(() => {
    const base = currentAliasRow.value
    if (!base) return []

    return rows.value
      .filter((r) => r.path !== base.path && r.type === base.type && !r.isAlias)
      .map((r) => ({
        title: toDisplayTokenPath(r.path),
        value: r.path,
      }))
  })

  function startRenameGroup(item: GroupNode): void {
    editingGroupId.value = item.id
    editingGroupName.value = item.title ?? ''
  }

  async function confirmRenameGroup(): Promise<void> {
    const id = editingGroupId.value
    const name = editingGroupName.value.trim()
    if (!id || !name) {
      editingGroupId.value = null
      return
    }

    const groupPath = id.split('.')
    const result = await renameGroupForTokenType(groupPath, name, tokenTypeRef.value)

    editingGroupId.value = null

    if (result.ok && result.newGroupPath) {
      activeNodeIds.value = [result.newGroupPath.join('.')]
    }
  }

  function cancelRenameGroup(): void {
    editingGroupId.value = null
  }

  function openAliasDialogForRow(row: TableRow): void {
    currentAliasRow.value = row
    aliasSourcePath.value = row.isAlias ? (row.aliasPath ?? '') : ''
    addAliasDialog.value = true
  }

  async function confirmAliasForRow(): Promise<void> {
    aliasErrorMessage.value = null

    const row = currentAliasRow.value
    const target = aliasSourcePath.value.trim()

    if (!row || !target) {
      addAliasDialog.value = false
      return
    }

    try {
      await setTokenAlias(row, target)
      addAliasDialog.value = false
    } catch (err: unknown) {
      if (err instanceof Error) {
        aliasErrorMessage.value = err.message
      } else {
        aliasErrorMessage.value = 'Unknown error while setting alias.'
      }
    }
  }

  function openAddSiblingGroupDialog() {
    newSiblingGroupName.value = ''
    showAddSiblingDialog.value = true
  }

  async function confirmAddSiblingGroup() {
    const name = newSiblingGroupName.value.trim()
    if (!name) return

    const existsAtRoot = groupTreeItems.value.some((node) => {
      return node.id === name || node.title === name
    })

    if (existsAtRoot) {
      console.warn('Root group already exists:', name)

      showAddSiblingDialog.value = false
      newSiblingGroupName.value = ''
      return
    }

    await addGroup([], name, tokenTypeRef.value)

    newSiblingGroupName.value = ''
    showAddSiblingDialog.value = false

    activeNodeIds.value = [name]
  }

  function onGridReady(event: GridReadyEvent<TableRow>): void {
    gridApi.value = event.api
  }

  function onModelUpdated(): void {
    const api = gridApi.value
    const path = lastScrollPath.value
    if (!api || !path) return

    lastScrollPath.value = null

    const rowCount = api.getDisplayedRowCount()
    for (let i = 0; i < rowCount; i++) {
      const node = api.getDisplayedRowAtIndex(i)
      if (node?.data?.path === path) {
        api.ensureIndexVisible(i, 'middle')
        break
      }
    }
  }

  function openAddGroupDialog(): void {
    if (!activeNodeIds.value.length) return
    currentParentGroupId.value = activeNodeIds.value[0]
    newGroupName.value = ''
    addGroupDialog.value = true
  }

  async function confirmAddGroup(): Promise<void> {
    const parentId = currentParentGroupId.value
    const name = newGroupName.value.trim()

    if (!parentId || !name) {
      addGroupDialog.value = false
      return
    }

    const parentSegments = parentId.split('.')
    await addGroup(parentSegments, name, tokenTypeRef.value)

    addGroupDialog.value = false

    const newGroupId = [...parentSegments, name].join('.')
    activeNodeIds.value = [newGroupId]
  }

  function onAddChildGroup(item: GroupNode): void {
    currentParentGroupId.value = item.id
    newGroupName.value = ''
    addGroupDialog.value = true
  }

  async function confirmAddTokenInGroup(): Promise<void> {
    const groupId = currentTokenGroupId.value
    const name = newTokenName.value.trim()

    if (!groupId || !name) {
      addTokenDialog.value = false
      return
    }

    const groupSegments = groupId.split('.')

    await insertTokenInGroup({
      groupPath: groupSegments,
      tokenType: tokenTypeRef.value,
      initialName: name,
    })

    addTokenDialog.value = false
  }

  function onGridSelectionChanged(): void {
    const api = gridApi.value
    if (!api) return

    const activeId = activeGroupId.value
    const selected = api.getSelectedRows() as TableRow[]
    const matching = selected.filter((row) => {
      if (row.type !== tokenTypeRef.value) return false
      if (!activeId) return false
      const groupId = row.groupPath.join('.')
      return groupId === activeId || groupId.startsWith(`${activeId}.`)
    })

    selectedGridRow.value =
      matching.length > 0 ? matching[matching.length - 1]! : null
  }

  async function onNewTokenClick(): Promise<void> {
    const groupId = activeGroupId.value
    if (!groupId) return

    const groupPath = groupId.split('.')
    const afterPath = selectedGridRow.value?.path ?? null

    lastScrollPath.value = afterPath
    await insertTokenInGroup({
      groupPath,
      tokenType: tokenTypeRef.value,
      insertAfterPath: afterPath,
    })
  }

  function openNewTokenSetDialog(): void {
    newTokenSetName.value = ''
    newTokenSetError.value = null
    showNewTokenSetDialog.value = true
  }

  async function confirmNewTokenSet(): Promise<void> {
    newTokenSetError.value = null
    const result = await createTokenSet(newTokenSetName.value)
    if (!result.ok) {
      newTokenSetError.value = result.error
      return
    }
    showNewTokenSetDialog.value = false
  }

  async function onDeleteGroup(item: GroupNode): Promise<void> {
    const groupId = item.id
    const confirmed = window.confirm(`Delete group "${groupId}" and all tokens inside it?`)
    if (!confirmed) return

    const prefix = groupId + '.'

    const rowsToDelete = rows.value.filter((row) => {
      return row.path === groupId || row.path.startsWith(prefix)
    })

    for (const row of rowsToDelete) {
      await deleteToken(row)
    }

    await deleteGroupFromSource(groupId.split('.'))

    if (activeNodeIds.value[0] === groupId) {
      activeNodeIds.value = []
    }
  }

  const {
    menu,
    onActionButtonClick,
    addRowBelow,
    duplicateRow,
    deleteRow,
    closeMenu,
    convertRowToAlias,
    clearAliasForRow,
    canConvertToAlias,
  } = useTokenGridContextMenu(rows, {
    async addRowBelowToken(row) {
      lastScrollPath.value = row.path
      await addRowBelowToken(row)
    },

    async duplicateToken(row) {
      lastScrollPath.value = row.path
      await duplicateToken(row)
    },

    async deleteToken(row) {
      const idx = rows.value.findIndex((r) => r.path === row.path)
      if (idx > 0) {
        lastScrollPath.value = rows.value[idx - 1]?.path ?? null
      } else if (idx >= 0 && idx + 1 < rows.value.length) {
        lastScrollPath.value = rows.value[idx + 1]?.path ?? null
      } else {
        lastScrollPath.value = null
      }

      await deleteToken(row)
    },
    convertToAlias(row) {
      openAliasDialogForRow(row)
    },
    clearAlias(row) {
      return clearTokenAlias(row)
    },
  })
  return {
    tokenType: tokenTypeRef,
    files,
    rows,
    errorMessage,
    activeNodeIds,
    activeGroupId,
    hasWorkspaceFiles,
    hasAnyTokens,
    activeSourceFileName,
    tokenSetFileNames,
    hasMultipleTokenSets,
    activeTokenSetDisplayName,
    onActiveTokenSetChange,
    detectedModifiers,
    selectedModifiers,
    groupTreeItems,
    filteredRows: typeFilteredRows,
    rowsOfSelectedType,
    showTypeEmptyState,
    showWorkspaceEmptyHint,
    groupScopedModifierName,
    modeOptionsForActiveGroup,
    visibleModifiers,
    groupHasModes,
    uiSelectedModifiers,

    clearTokenAlias,
    setTokenAlias,
    addGroup,
    insertTokenInGroup,
    addRowBelowToken,
    duplicateToken,
    deleteToken,
    createTokenSet,
    onFileChange,
    onModifierChange,

    canAddToken,
    onNewTokenClick,
    onGridSelectionChanged,
    showNewTokenSetDialog,
    newTokenSetName,
    newTokenSetError,
    openNewTokenSetDialog,
    confirmNewTokenSet,

    gridApi,
    lastScrollPath,
    onGridReady,
    onModelUpdated,

    addGroupDialog,
    newGroupName,
    currentParentGroupId,
    showAddSiblingDialog,
    newSiblingGroupName,
    openAddSiblingGroupDialog,
    confirmAddSiblingGroup,
    openAddGroupDialog,
    confirmAddGroup,
    onAddChildGroup,
    onDeleteGroup,

    addTokenDialog,
    newTokenName,
    currentTokenGroupId,
    confirmAddTokenInGroup,

    addAliasDialog,
    aliasSourcePath,
    currentAliasRow,
    aliasErrorMessage,
    aliasOptions,
    openAliasDialogForRow,
    confirmAliasForRow,

    menu,
    onActionButtonClick,
    addRowBelow,
    duplicateRow,
    deleteRow,
    closeMenu,
    convertRowToAlias,
    clearAliasForRow,
    canConvertToAlias,
    updateTokenValueAny,

    editingGroupId,
    editingGroupName,
    startRenameGroup,
    confirmRenameGroup,
    cancelRenameGroup,
  }
}

/** @deprecated Prefer useTokenTableComponent — Color-only alias. */
export function useColorTableComponent() {
  return useTokenTableComponent('color')
}
