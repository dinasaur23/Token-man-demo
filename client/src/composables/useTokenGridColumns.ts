import { ref } from 'vue'
import type { ColDef, ICellRendererParams, NewValueParams } from 'ag-grid-community'
import type { TableRow } from '@/utils/dtcg/token-table-types'
import { srgbFromHex } from '@/utils/dtcg/color-display'
import { HEX_PATTERN } from '@/utils/dtcg/color-conversion'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'

const SRGB_PATTERN = /^srgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i

function srgbComponentsToHex(rStr: string, gStr: string, bStr: string): string {
  const toByteHex = (s: string): string => {
    const f = parseFloat(s)
    const clamped = Math.max(0, Math.min(1, Number.isNaN(f) ? 0 : f))
    const byte = Math.round(clamped * 255)
    return byte.toString(16).padStart(2, '0')
  }
  return `#${toByteHex(rStr)}${toByteHex(gStr)}${toByteHex(bStr)}`
}

export function useTokenGridColumns(onActionButtonClick: (row: TableRow, ev: MouseEvent) => void) {
  const workspaceStore = useTokenWorkspaceStore()

  const columnDefs = ref<ColDef<TableRow>[]>([
    // --- Name ---
    {
      headerName: 'Name',
      field: 'name',
      editable: true,
      flex: 1,
      onCellValueChanged: (params) => {
        const row = params.data
        if (!row?.path) return

        const newName = String(params.newValue ?? '').trim()
        row.name = newName
        params.node?.setDataValue('name', newName)

        if (!newName) {
          const copy = { ...workspaceStore.nameOverrides }
          delete copy[row.path]
          workspaceStore.nameOverrides = copy
        } else {
          workspaceStore.nameOverrides = {
            ...workspaceStore.nameOverrides,
            [row.path]: newName,
          }
        }

        void workspaceStore.saveToServer()
      },
    },

    // --- sRGB column ---
    {
      headerName: 'sRGB',
      field: 'value',
      flex: 1.4,
      editable: (params) => !params.data?.isAlias,
      onCellValueChanged: (params: NewValueParams<TableRow, string>) => {
        const newVal = String(params.newValue ?? '').trim()
        const node = params.node
        const row = params.data
        if (!node || !row || !row.path) return

        if (HEX_PATTERN.test(newVal)) {
          const srgb = srgbFromHex(newVal)
          node.setDataValue('hex', newVal)
          node.setDataValue('value', srgb)

          workspaceStore.overrides = {
            ...workspaceStore.overrides,
            [row.path]: newVal,
          }
          void workspaceStore.saveToServer()

          params.api.refreshCells({ rowNodes: [node], columns: ['hex'] })
          return
        }

        const match = newVal.match(SRGB_PATTERN)
        if (match) {
          const [, rStr, gStr, bStr] = match
          const hex = srgbComponentsToHex(rStr, gStr, bStr)

          node.setDataValue('value', newVal)
          node.setDataValue('hex', hex)

          workspaceStore.overrides = {
            ...workspaceStore.overrides,
            [row.path]: hex,
          }
          void workspaceStore.saveToServer()
          params.api.refreshCells({ rowNodes: [node], columns: ['hex'] })
          return
        }

        node.setDataValue('value', params.oldValue ?? row.value)
      },
    },

    // --- Hex column ---
    {
      headerName: 'Hex',
      field: 'hex',
      flex: 1,
      editable: (params) => !params.data?.isAlias,
      onCellValueChanged: (params: NewValueParams<TableRow, string>) => {
        const newVal = String(params.newValue ?? '').trim()
        const node = params.node
        const row = params.data
        if (!node || !row || !row.path) return

        if (!HEX_PATTERN.test(newVal)) {
          node.setDataValue('hex', params.oldValue ?? row.hex)
          return
        }

        const srgb = srgbFromHex(newVal)
        node.setDataValue('hex', newVal)
        node.setDataValue('value', srgb)

        workspaceStore.overrides = {
          ...workspaceStore.overrides,
          [row.path]: newVal,
        }
        void workspaceStore.saveToServer()
        params.api.refreshCells({ rowNodes: [node], columns: ['value'] })
      },
    },
    {
      headerName: 'Alias path',
      field: 'aliasPath',
      filter: true,
      valueFormatter: (p) => p.value ?? '',
    },

    // --- Color picker column ---
    {
      headerName: 'Color',
      field: 'hex',
      width: 120,
      cellRenderer: (params: ICellRendererParams<TableRow>) => {
        const eInput = document.createElement('input')
        eInput.type = 'color'

        const hex = params.data?.hex ?? '#000000'
        eInput.value = HEX_PATTERN.test(hex) ? hex : '#000000'

        eInput.style.width = '32px'
        eInput.style.height = '32px'
        eInput.style.border = 'none'
        eInput.style.padding = '0'
        eInput.style.background = 'transparent'

        eInput.addEventListener('mousedown', (ev) => {
          ev.stopPropagation()
        })

        eInput.addEventListener('change', (event: Event) => {
          const newColor = (event.target as HTMLInputElement).value

          params.node.setDataValue('hex', newColor)
          const srgb = srgbFromHex(newColor)
          params.node.setDataValue('value', srgb)

          const row = params.data
          if (row && row.path) {
            workspaceStore.overrides = {
              ...workspaceStore.overrides,
              [row.path]: newColor,
            }
            void workspaceStore.saveToServer()
          }
        })

        return eInput
      },
    },

    // --- Actions column with three-dots button ---
    {
      headerName: '',
      colId: 'actions',
      width: 60,
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams<TableRow>) => {
        const row = params.data
        if (!row) {
          const span = document.createElement('span')
          return span
        }

        const btn = document.createElement('button')
        btn.innerHTML = '⋮'
        btn.classList.add('action-dots-btn')
        btn.style.border = 'none'
        btn.style.background = 'transparent'
        btn.style.cursor = 'pointer'
        btn.style.fontSize = '18px'
        btn.style.padding = '0'

        btn.addEventListener('click', (ev: MouseEvent) => {
          ev.stopPropagation()
          onActionButtonClick(row, ev) // ✅ row is definitely TableRow here
        })

        return btn
      },
      cellClass: 'actions-cell',
      suppressKeyboardEvent: () => true,
    },
  ])

  const defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
  }

  return { columnDefs, defaultColDef }
}
