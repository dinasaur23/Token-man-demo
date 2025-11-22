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
        />
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
        class="mr-5"
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
      <v-list-item @click="deleteRow">
        <v-list-item-title class="text-error">Delete row</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import { themeQuartz, type GridApi, type GridReadyEvent } from 'ag-grid-community'
import TokenExportDialog from './TokenExportDialog.vue'
import type { TableRow } from '@/utils/dtcg/token-table-types'
import { useTokenGridColumns } from '@/composables/useTokenGridColumns'
import { useTokenWorkspaceTable } from '@/composables/useTokenWorkspaceTable'
import { useTokenGridContextMenu } from '@/composables/useTokenGridContextMenu'

const myTheme = themeQuartz.withParams({ accentColor: 'red' })
const gridTheme = ref(myTheme)
const files = ref<File[] | null>(null)

const {
  rows,
  errorMessage,
  activeNodeIds,
  detectedModifiers,
  selectedModifiers,
  groupTreeItems,
  filteredRows,
  addRowBelowToken,
  duplicateToken,
  deleteToken,
  onFileChange,
  onModifierChange,
} = useTokenWorkspaceTable()

const gridApi = ref<GridApi<TableRow> | null>(null)
const lastScrollPath = ref<string | null>(null)

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

const { menu, onActionButtonClick, addRowBelow, duplicateRow, deleteRow, closeMenu } =
  useTokenGridContextMenu(rows, {
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
  })

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
