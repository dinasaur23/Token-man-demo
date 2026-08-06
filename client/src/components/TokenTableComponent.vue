<template>
  <v-row class="mt-3">
    <v-col cols="4">
      <v-file-input
        accept=".json, application/json"
        label="File input"
        variant="outlined"
        multiple
        density="compact"
        v-model="files"
        @update:model-value="onFileChange"
      />
    </v-col>

    <v-col cols="4" class="d-flex align-center">
      <TokenExportDialog />
    </v-col>

    <div v-if="visibleModifiers.length && groupHasModes">
      <v-col v-for="mod in visibleModifiers" :key="mod.name">
        <v-select
          :label="mod.name"
          :items="
            groupScopedModifierName === mod.name && modeOptionsForActiveGroup.length
              ? modeOptionsForActiveGroup
              : mod.values
          "
          :model-value="uiSelectedModifiers[mod.name]"
          @update:model-value="(value) => onModifierChange(mod.name, value)"
          variant="outlined"
          density="compact"
          style="min-width: 25vw"
        />
      </v-col>
    </div>
  </v-row>

  <v-row v-if="errorMessage" class="mt-2">
    <v-col cols="12">
      <v-alert type="error" variant="tonal" closable @click:close="errorMessage = null">
        <div class="font-weight-medium mb-1">Invalid DTCG file</div>
        <div>{{ errorMessage }}</div>
      </v-alert>
    </v-col>
  </v-row>

  <v-row v-if="showTypeEmptyState" class="mt-4 ml-4 mr-4">
    <v-col cols="12">
      <v-alert type="info" variant="tonal">
        <div class="font-weight-medium mb-1">No {{ tokenTypeLabel }} tokens</div>
        <div>
          This workspace has no tokens of type
          <code>{{ tokenType }}</code>. Switch token type in the navigation, or import a
          document that includes {{ tokenTypeLabel }} tokens.
        </div>
      </v-alert>
    </v-col>
  </v-row>

  <v-row v-show="rowsOfSelectedType.length" class="mt-4 ml-4">
    <v-col cols="12" md="3">
      <div style="overflow-y: auto">
        <div class="mb-2">
          <v-btn
            size="small"
            variant="text"
            @click="openAddGroupDialog"
            :disabled="!activeNodeIds.length"
          >
            <v-icon start>mdi-source-branch-plus</v-icon>
            Child group
          </v-btn>

          <v-btn size="small" variant="text" @click="openAddSiblingGroupDialog">
            <v-icon start>mdi-folder-plus</v-icon>
            New group
          </v-btn>
        </div>

        <v-treeview
          v-model:activated="activeNodeIds"
          :items="groupTreeItems"
          item-title="title"
          item-value="id"
          density="compact"
          activatable
          rounded
          style="height: 70vh"
        >
          <template #title="{ item }">
            <div v-if="editingGroupId !== item.id" @dblclick.stop="startRenameGroup(item)">
              {{ item.title }}
            </div>
            <v-text-field
              v-else
              v-model="editingGroupName"
              variant="underlined"
              density="compact"
              hide-details
              autofocus
              @blur="confirmRenameGroup"
              @keyup.enter="confirmRenameGroup"
              @keyup.esc="cancelRenameGroup"
              style="max-width: 180px"
            />
          </template>
          <template #append="{ item }">
            <v-menu location="end" origin="overlap" :close-on-content-click="false">
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  icon
                  variant="text"
                  density="compact"
                  class="group-actions-btn"
                >
                  <v-icon size="16">mdi-dots-vertical</v-icon>
                </v-btn>
              </template>

              <v-list density="compact">
                <v-list-item @click="onAddChildGroup(item)">
                  <v-list-item-title>Add child group</v-list-item-title>
                </v-list-item>
                <v-list-item @click="startRenameGroup(item)">
                  <v-list-item-title>Rename group</v-list-item-title>
                </v-list-item>
                <v-list-item @click="onDeleteGroup(item)">
                  <v-list-item-title class="text-error">Delete group</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </template>
        </v-treeview>
      </div>
    </v-col>

    <v-col cols="12" md="9">
      <ag-grid-vue
        :key="tokenType"
        :theme="gridTheme"
        :columnDefs="columnDefs"
        :defaultColDef="defaultColDef"
        :rowData="filteredRows"
        :getRowId="getRowId"
        rowSelection.mode="multiRow"
        style="height: 70vh"
        class="mr-5 mt-9"
        @grid-ready="handleGridReady"
        @model-updated="onModelUpdated"
      />
    </v-col>
  </v-row>
  <v-menu
    v-model="menu.visible"
    :target="[menu.x, menu.y]"
    location-strategy="connected"
    :close-on-content-click="false"
    scrim="transparent"
    @click:outside="closeMenu"
  >
    <v-list density="compact">
      <v-list-item
        @click.stop="
          () => {
            console.warn('[TEMPLATE] Duplicate clicked ✅', menu.row?.path)
            duplicateRow()
          }
        "
      >
        <v-list-item-title>Duplicate row</v-list-item-title>
      </v-list-item>
      <v-list-item @click="addRowBelow">
        <v-list-item-title>Add row below</v-list-item-title>
      </v-list-item>
      <v-list-item :disabled="!canConvertToAlias(menu.row, rows)" @click="convertRowToAlias">
        <v-list-item-title>
          {{ menu.row?.isAlias ? 'Change alias' : 'Create alias' }}
        </v-list-item-title>
      </v-list-item>
      <v-list-item v-if="menu.row?.aliasPath" @click="clearAliasForRow">
        <v-list-item-title>Remove alias</v-list-item-title>
      </v-list-item>
      <v-list-item @click="deleteRow">
        <v-list-item-title class="text-error">Delete row</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
  <v-dialog v-model="addGroupDialog" max-width="420">
    <v-card>
      <v-card-title class="text-subtitle-1">Add group</v-card-title>
      <v-card-text>
        <div class="text-caption mb-2" v-if="currentParentGroupId">
          Parent: <code>{{ currentParentGroupId }}</code>
        </div>
        <v-text-field v-model="newGroupName" label="Group name" density="comfortable" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="addGroupDialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!newGroupName.trim().length"
          @click="confirmAddGroup"
        >
          Add
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-dialog v-model="addTokenDialog" max-width="420">
    <v-card>
      <v-card-title class="text-subtitle-1">Add token</v-card-title>
      <v-card-text>
        <div class="text-caption mb-2" v-if="currentTokenGroupId">
          Group: <code>{{ currentTokenGroupId }}</code>
        </div>
        <v-text-field v-model="newTokenName" label="Token name" density="comfortable" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="addTokenDialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!newTokenName.trim().length"
          @click="confirmAddTokenInGroup"
        >
          Add
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="showAddSiblingDialog" max-width="480">
    <v-card>
      <v-card-title>Add group</v-card-title>
      <v-card-text>
        <div class="mb-2 text-caption text-medium-emphasis">Parent: — root —</div>
        <v-text-field
          v-model="newSiblingGroupName"
          label="Group name"
          variant="outlined"
          density="comfortable"
          @keyup.enter="confirmAddSiblingGroup"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="showAddSiblingDialog = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" @click="confirmAddSiblingGroup"> Add </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-dialog v-model="addAliasDialog" max-width="420">
    <v-card>
      <v-card-title class="text-subtitle-1">Convert to alias</v-card-title>
      <v-card-text>
        <div class="text-caption mb-2" v-if="currentAliasRow">
          Token: <code>{{ currentAliasRow.path }}</code>
        </div>

        <v-autocomplete
          v-model="aliasSourcePath"
          :items="aliasOptions"
          label="Alias target (token path)"
          density="comfortable"
          variant="outlined"
          clearable
        />
        <v-alert
          v-if="aliasErrorMessage"
          type="error"
          variant="tonal"
          class="mt-3"
          density="comfortable"
        >
          {{ aliasErrorMessage }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="addAliasDialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!aliasSourcePath.trim().length"
          @click="confirmAliasForRow"
        >
          Apply
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, toRef, computed } from 'vue'
import type { GetRowIdParams, GridApi, GridReadyEvent } from 'ag-grid-community'
import { AgGridVue } from 'ag-grid-vue3'
import { themeQuartz } from 'ag-grid-community'
import TokenExportDialog from './TokenExportDialog.vue'
import { useTokenGridColumns } from '@/composables/useTokenGridColumns'
import { useTokenTableComponent } from '@/composables/useTokenTableComponent'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'
import { getTokenTypeDefinition, type TokenTypeId } from '@/utils/dtcg/token-types'
import { buildStableTokenRowId } from '@/utils/dtcg/row-ordering'
import type { TableRow } from '@/utils/dtcg/token-table-types'

const props = withDefaults(
  defineProps<{
    /** Active token type for this table (from registry / route). */
    tokenType?: TokenTypeId
  }>(),
  { tokenType: 'color' },
)

const myTheme = themeQuartz.withParams({ accentColor: 'red' })
const gridTheme = ref(myTheme)

const {
  tokenType,
  files,
  rows,
  errorMessage,
  activeNodeIds,
  activeGroupId,
  uiSelectedModifiers,
  groupTreeItems,
  filteredRows,
  rowsOfSelectedType,
  showTypeEmptyState,
  groupScopedModifierName,
  modeOptionsForActiveGroup,
  visibleModifiers,
  groupHasModes,
  onFileChange,
  onModifierChange,

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
} = useTokenTableComponent(toRef(props, 'tokenType'))

const tokenTypeLabel = computed(
  () => getTokenTypeDefinition(tokenType.value)?.label ?? tokenType.value,
)

const gridApi = ref<GridApi | null>(null)

function getRowId(params: GetRowIdParams<TableRow>): string {
  const row = params.data
  return buildStableTokenRowId(row?.sourceFile, row?.path ?? '')
}

function handleGridReady(e: GridReadyEvent) {
  gridApi.value = e.api
  onGridReady(e)
}

watch(activeGroupId, () => {
  const api = gridApi.value
  if (!api || api.isDestroyed()) return
  api.refreshCells({ columns: ['name'], force: true })
})

// Columns rebuild from the modular factory when tokenType changes.
// Hex / Color preview are included only for `$type: "color"`.
const { columnDefs, defaultColDef } = useTokenGridColumns(
  onActionButtonClick,
  updateTokenValueAny,
  activeGroupId,
  tokenType,
)

const ws = useTokenWorkspaceStore()
;(window as unknown as { ws: typeof ws }).ws = ws
</script>

<style scoped>
.actions-cell {
  overflow: visible !important;
}

.action-dots-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
</style>
