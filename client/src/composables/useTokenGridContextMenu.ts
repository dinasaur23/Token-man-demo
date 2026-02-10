import { reactive } from 'vue'
import type { Ref } from 'vue'
import type { TableRow } from '@/utils/dtcg/token-table-types'

export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  row: TableRow | null
}

export interface ContextMenuActions {
  addRowBelowToken: (row: TableRow) => Promise<void>
  duplicateToken: (row: TableRow) => Promise<void>
  deleteToken: (row: TableRow) => Promise<void>
  convertToAlias?: (row: TableRow) => void | Promise<void>
  clearAlias?: (row: TableRow) => void | Promise<void>
}

export function useTokenGridContextMenu(rows: Ref<TableRow[]>, actions: ContextMenuActions) {
  const menu = reactive<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    row: null,
  })

  function canConvertToAlias(
    row: TableRow | null | undefined,
    rows: Ref<TableRow[]> | TableRow[] | null | undefined,
  ): boolean {
    if (!row) return false

    const list = Array.isArray(rows) ? rows : rows?.value
    if (!list) return false

    return list.some((r) => r.path !== row.path && r.type === row.type)
  }

  function onActionButtonClick(row: TableRow, ev: MouseEvent): void {
    ev.stopPropagation()
    menu.x = ev.clientX
    menu.y = ev.clientY
    menu.row = row
    menu.visible = true
  }

  function closeMenu(): void {
    menu.visible = false
  }

  async function addRowBelow(): Promise<void> {
    const base = menu.row
    if (!base) {
      closeMenu()
      return
    }

    await actions.addRowBelowToken(base)
    closeMenu()
  }
  async function duplicateRow(): Promise<void> {
    const base = menu.row

    if (!base) {
      closeMenu()
      return
    }

    await actions.duplicateToken(base)
    closeMenu()
  }
  async function deleteRow(): Promise<void> {
    const base = menu.row
    if (!base) {
      closeMenu()
      return
    }

    await actions.deleteToken(base)
    closeMenu()
  }
  async function convertRowToAlias(): Promise<void> {
    const base = menu.row
    const handler = actions.convertToAlias
    if (!base || !handler) {
      closeMenu()
      return
    }

    await handler(base)
    closeMenu()
  }
  async function clearAliasForRow(): Promise<void> {
    const base = menu.row
    const handler = actions.clearAlias
    if (!base || !handler) {
      closeMenu()
      return
    }

    await handler(base)
    closeMenu()
  }

  return {
    menu,
    onActionButtonClick,
    addRowBelow,
    duplicateRow,
    deleteRow,
    closeMenu,
    convertRowToAlias,
    clearAliasForRow,
    canConvertToAlias,
  }
}
