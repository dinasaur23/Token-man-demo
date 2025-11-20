// client/src/composables/useTokenGridContextMenu.ts
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
}

export function useTokenGridContextMenu(rows: Ref<TableRow[]>, actions: ContextMenuActions) {
  const menu = reactive<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    row: null,
  })

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

  return {
    menu,
    onActionButtonClick,
    addRowBelow,
    duplicateRow,
    deleteRow,
    closeMenu,
  }
}
