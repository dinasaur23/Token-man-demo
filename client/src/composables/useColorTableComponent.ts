import { ref, computed } from 'vue'
import { type GridApi, type GridReadyEvent } from 'ag-grid-community'
import { useTokenWorkspaceTable } from './useTokenWorkspaceTable'
import { useTokenGridContextMenu } from './useTokenGridContextMenu'
import type { TableRow, GroupNode } from '@/utils/dtcg/token-table-types'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'

export function useColorTableComponent() {
  const files = ref<File[] | null>(null)

  const {
    rows,
    errorMessage,
    activeNodeIds,
    detectedModifiers,
    selectedModifiers,
    groupTreeItems,
    filteredRows,
    groupScopedModifierName,
    modeOptionsForActiveGroup,
    visibleModifiers,
    groupHasModes,
    activeGroupId,
    uiSelectedModifiers,
    clearTokenAlias,
    setTokenAlias,
    addGroupWithToken,
    addRowBelowToken,
    duplicateToken,
    deleteToken,
    onFileChange,
    onModifierChange,
    updateTokenValueAny,
    toDisplayTokenPath,
  } = useTokenWorkspaceTable()

  const gridApi = ref<GridApi<TableRow> | null>(null)
  const lastScrollPath = ref<string | null>(null)

  const addGroupDialog = ref(false)
  const newGroupName = ref('')
  const currentParentGroupId = ref<string | null>(null)

  const showAddSiblingDialog = ref(false)
  const newSiblingGroupName = ref('')

  const addTokenDialog = ref(false)
  const newTokenName = ref('')
  const currentTokenGroupId = ref<string | null>(null)

  const wsStore = useTokenWorkspaceStore()
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
        title: toDisplayTokenPath(r.path), // what user sees
        value: r.path, // real path you store/use
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

    wsStore.groupNameOverrides[id] = name
    await wsStore.saveToServer()

    editingGroupId.value = null
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

    await addGroupWithToken([], name)

    newSiblingGroupName.value = ''
    showAddSiblingDialog.value = false
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
    await addGroupWithToken(parentSegments, name)

    addGroupDialog.value = false
  }

  function onAddChildGroup(item: GroupNode): void {
    // reuse existing "Add group" dialog as child of this node
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

    await addGroupWithToken(groupSegments, name)

    addTokenDialog.value = false
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
    files,
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

    clearTokenAlias,
    setTokenAlias,
    addGroupWithToken,
    addRowBelowToken,
    duplicateToken,
    deleteToken,
    onFileChange,
    onModifierChange,

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
