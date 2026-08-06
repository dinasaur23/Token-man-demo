import { computed, type Ref } from 'vue'
import type { ColDef } from 'ag-grid-community'
import type { TableRow } from '@/utils/dtcg/token-table-types'
import type { JsonValue } from '@/utils/dtcg/resolver'
import type { TokenTypeId } from '@/utils/dtcg/token-types'
import {
  buildTokenGridColumnDefs,
  type TokenGridColumnDeps,
} from '@/utils/dtcg/token-grid-columns'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'

/**
 * Reactive AG Grid columns for the token table.
 * Rebuilds when `tokenType` changes so Hex/Color columns appear only on Color pages.
 */
export function useTokenGridColumns(
  onActionButtonClick: (row: TableRow, ev: MouseEvent) => void,
  updateTokenValueAny: (row: TableRow, value: JsonValue) => Promise<void>,
  activeGroupIdRef: Ref<string | null>,
  tokenType: Ref<TokenTypeId> | TokenTypeId = 'color',
) {
  const workspaceStore = useTokenWorkspaceStore()

  const tokenTypeRef = computed(() =>
    typeof tokenType === 'string' ? tokenType : tokenType.value,
  )

  const deps: TokenGridColumnDeps = {
    onActionButtonClick,
    updateTokenValueAny,
    activeGroupIdRef,
    saveNameOverride: (path, name) => {
      if (!name) {
        const copy = { ...workspaceStore.nameOverrides }
        delete copy[path]
        workspaceStore.nameOverrides = copy
      } else {
        workspaceStore.nameOverrides = {
          ...workspaceStore.nameOverrides,
          [path]: name,
        }
      }
      void workspaceStore.saveToServer()
    },
  }

  const columnDefs = computed<ColDef<TableRow>[]>(() =>
    buildTokenGridColumnDefs(tokenTypeRef.value, deps),
  )

  const defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
  }

  return { columnDefs, defaultColDef, tokenType: tokenTypeRef }
}
