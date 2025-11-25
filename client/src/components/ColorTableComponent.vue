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
      <!-- Export button -->
      <TokenExportDialog />
    </v-col>

    <v-col v-for="mod in detectedModifiers" :key="mod.name" cols="3">
      <v-select
        :label="mod.name"
        :items="mod.values"
        :model-value="selectedModifiers[mod.name]"
        @update:model-value="(value) => onModifierChange(mod.name, value)"
        variant="outlined"
        density="compact"
      />
    </v-col>
  </v-row>

  <v-row v-if="errorMessage" class="mt-2">
    <v-col cols="12">
      <v-alert type="error" variant="tonal" closable @click:close="errorMessage = null">
        <div class="font-weight-medium mb-1">Invalid DTCG file</div>
        <div>{{ errorMessage }}</div>
      </v-alert>
    </v-col>
  </v-row>
  <v-row v-if="rows.length" class="mt-4 ml-4">
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
          open-all
          rounded
          style="height: 70vh"
        >
          <!-- actions at the end of each row -->
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
        :theme="gridTheme"
        :columnDefs="columnDefs"
        :defaultColDef="defaultColDef"
        :rowData="filteredRows"
        rowSelection.mode="multiRow"
        style="height: 70vh"
        class="mr-5 mt-9"
        @grid-ready="onGridReady"
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
      <v-list-item @click="duplicateRow">
        <v-list-item-title>Duplicate row</v-list-item-title>
      </v-list-item>
      <v-list-item @click="addRowBelow">
        <v-list-item-title>Add row below</v-list-item-title>
      </v-list-item>
      <v-list-item @click="convertRowToAlias">
        <v-list-item-title>Convert to alias…</v-list-item-title>
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
          :items="allTokenPaths"
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
import { ref } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import { themeQuartz } from 'ag-grid-community'
import TokenExportDialog from './TokenExportDialog.vue'
import { useTokenGridColumns } from '@/composables/useTokenGridColumns'
import { useColorTableComponent } from '@/composables/useColorTableComponent'

const myTheme = themeQuartz.withParams({ accentColor: 'red' })
const gridTheme = ref(myTheme)

const {
  files,
  rows,
  errorMessage,
  activeNodeIds,
  detectedModifiers,
  selectedModifiers,
  groupTreeItems,
  filteredRows,
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
  allTokenPaths,
  confirmAliasForRow,
  menu,
  onActionButtonClick,
  addRowBelow,
  duplicateRow,
  deleteRow,
  closeMenu,
  convertRowToAlias,
  clearAliasForRow,
} = useColorTableComponent()

const { columnDefs, defaultColDef } = useTokenGridColumns(onActionButtonClick)
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
