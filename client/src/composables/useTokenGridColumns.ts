import { ref, type Ref } from 'vue'
import type { ColDef, ICellRendererParams, NewValueParams } from 'ag-grid-community'
import type { TableRow } from '@/utils/dtcg/token-table-types'
import { srgbFromHex } from '@/utils/dtcg/color-display'
import { HEX_PATTERN } from '@/utils/dtcg/color-conversion'
import {
  formatCubicBezierForDisplay,
  formatDimensionForDisplay,
  formatDurationForDisplay,
  formatFontFamilyForDisplay,
  formatFontWeightForDisplay,
  formatNumberForDisplay,
  parseCubicBezierFromEditor,
  parseDimensionFromEditor,
  parseDurationFromEditor,
  parseFontFamilyFromEditor,
  parseFontWeightFromEditor,
  parseNumberFromEditor,
} from '@/utils/dtcg/token-types'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'
import type { JsonValue } from '@/utils/dtcg/resolver'

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

function formatNameWithRelativeGroup(row: TableRow, activeGroupId: string | null): string {
  if (!activeGroupId) return row.name

  const activeSegs = activeGroupId.split('.').filter(Boolean)
  const rowSegs = row.groupPath ?? []

  if (rowSegs.length <= activeSegs.length) return row.name

  const rel = rowSegs.slice(activeSegs.length).join('/')
  return rel ? `${rel}/${row.name}` : row.name
}

export function useTokenGridColumns(
  onActionButtonClick: (row: TableRow, ev: MouseEvent) => void,
  updateTokenValueAny: (row: TableRow, value: JsonValue) => Promise<void>,
  activeGroupIdRef: Ref<string | null>,
) {
  const workspaceStore = useTokenWorkspaceStore()

  const columnDefs = ref<ColDef<TableRow>[]>([
    {
      headerName: 'Name',
      field: 'name',
      editable: true,
      flex: 1,
      valueFormatter: (params) => {
        const row = params.data as TableRow | undefined
        if (!row) return ''
        return formatNameWithRelativeGroup(row, activeGroupIdRef.value)
      },

      onCellValueChanged: async (params) => {
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

    {
      headerName: 'Value',
      field: 'value',
      flex: 1.4,
      editable: (params) => !params.data?.isAlias,
      onCellValueChanged: async (params: NewValueParams<TableRow, string>) => {
        const row = params.data
        const node = params.node
        if (!row || !node || !row.path) return

        const newVal = String(params.newValue ?? '').trim()
        const oldVal = String(params.oldValue ?? row.value ?? '').trim()

        const revert = () => {
          row.value = oldVal
          params.api.refreshCells({ rowNodes: [node], columns: ['value'] })
        }

        if (row.type === 'color') {
          if (HEX_PATTERN.test(newVal)) {
            const srgb = srgbFromHex(newVal)

            row.hex = newVal
            row.value = srgb

            await updateTokenValueAny(row, newVal)

            params.api.refreshCells({ rowNodes: [node], columns: ['value', 'hex'] })
            return
          }

          const match = newVal.match(SRGB_PATTERN)
          if (match) {
            const [, rStr, gStr, bStr] = match
            const hex = srgbComponentsToHex(rStr, gStr, bStr)
            const srgb = srgbFromHex(hex)

            row.value = srgb
            row.hex = hex

            await updateTokenValueAny(row, hex)

            params.api.refreshCells({ rowNodes: [node], columns: ['value', 'hex'] })
            return
          }
          revert()
          return
        }

        if (row.type === 'dimension') {
          const parsedDim = parseDimensionFromEditor(newVal)
          if (!parsedDim.ok) {
            revert()
            return
          }
          const display = formatDimensionForDisplay(parsedDim.value)
          row.value = display.primary
          await updateTokenValueAny(row, parsedDim.value as JsonValue)
          params.api.refreshCells({ rowNodes: [node], columns: ['value'] })
          return
        }

        if (row.type === 'number') {
          const parsedNum = parseNumberFromEditor(newVal)
          if (!parsedNum.ok) {
            revert()
            return
          }
          const display = formatNumberForDisplay(parsedNum.value)
          row.value = display.primary
          await updateTokenValueAny(row, parsedNum.value as JsonValue)
          params.api.refreshCells({ rowNodes: [node], columns: ['value'] })
          return
        }

        if (row.type === 'duration') {
          const parsedDur = parseDurationFromEditor(newVal)
          if (!parsedDur.ok) {
            revert()
            return
          }
          const display = formatDurationForDisplay(parsedDur.value)
          row.value = display.primary
          await updateTokenValueAny(row, parsedDur.value as JsonValue)
          params.api.refreshCells({ rowNodes: [node], columns: ['value'] })
          return
        }

        if (row.type === 'fontFamily') {
          const parsedFf = parseFontFamilyFromEditor(newVal)
          if (!parsedFf.ok) {
            revert()
            return
          }
          const display = formatFontFamilyForDisplay(parsedFf.value)
          row.value = display.primary
          await updateTokenValueAny(row, parsedFf.value as JsonValue)
          params.api.refreshCells({ rowNodes: [node], columns: ['value'] })
          return
        }

        if (row.type === 'fontWeight') {
          const parsedFw = parseFontWeightFromEditor(newVal)
          if (!parsedFw.ok) {
            revert()
            return
          }
          const display = formatFontWeightForDisplay(parsedFw.value)
          row.value = display.primary
          await updateTokenValueAny(row, parsedFw.value as JsonValue)
          params.api.refreshCells({ rowNodes: [node], columns: ['value'] })
          return
        }

        if (row.type === 'cubicBezier') {
          const parsedCb = parseCubicBezierFromEditor(newVal)
          if (!parsedCb.ok) {
            revert()
            return
          }
          const display = formatCubicBezierForDisplay(parsedCb.value)
          row.value = display.primary
          await updateTokenValueAny(row, parsedCb.value as JsonValue)
          params.api.refreshCells({ rowNodes: [node], columns: ['value'] })
          return
        }

        const parsed: JsonValue = newVal
        row.value = newVal

        await updateTokenValueAny(row, parsed)
        params.api.refreshCells({ rowNodes: [node], columns: ['value'] })
      },
    },

    {
      headerName: 'Hex',
      field: 'hex',
      flex: 1,
      editable: (params) => params.data?.type === 'color' && !params.data?.isAlias,
      onCellValueChanged: async (params: NewValueParams<TableRow, string>) => {
        const row = params.data
        const node = params.node
        if (!row || row.type !== 'color' || !node || !row.path) return

        // normalize (allow users to paste without '#')
        let newVal = String(params.newValue ?? '').trim()
        if (newVal && !newVal.startsWith('#')) newVal = `#${newVal}`

        const oldHex = String(params.oldValue ?? row.hex ?? '').trim()

        const revert = () => {
          row.hex = oldHex
          params.api.refreshCells({ rowNodes: [node], columns: ['hex'] })
        }

        if (!HEX_PATTERN.test(newVal)) {
          revert()
          return
        }

        const srgb = srgbFromHex(newVal)
        row.hex = newVal
        row.value = srgb

        await updateTokenValueAny(row, newVal)

        params.api.refreshCells({ rowNodes: [node], columns: ['hex', 'value'] })
      },
    },

    {
      headerName: 'Alias path',
      field: 'aliasPath',
      filter: true,
      valueFormatter: (p) => p.value ?? '',
    },

    {
      headerName: 'Color',
      field: 'hex',
      width: 120,
      cellRenderer: (params: ICellRendererParams<TableRow>) => {
        const row = params.data
        if (!row || row.type !== 'color') {
          const span = document.createElement('span')
          span.textContent = ''
          return span
        }

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

        eInput.addEventListener('change', async (event: Event) => {
          const newColor = (event.target as HTMLInputElement).value

          params.node.setDataValue('hex', newColor)
          const srgb = srgbFromHex(newColor)
          params.node.setDataValue('value', srgb)

          const row = params.data
          if (row && row.path) {
            await updateTokenValueAny(row, newColor)
          }
        })

        return eInput
      },
    },
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
          onActionButtonClick(row, ev)
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
