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
      <div style="max-height: 600px; overflow-y: auto">
        <v-treeview
          v-model:activated="activeNodeIds"
          :items="groupTreeItems"
          item-title="title"
          item-value="id"
          density="compact"
          activatable
          open-all
          rounded
          style="height: 600px"
        />
      </div>
    </v-col>

    <v-col cols="12" md="9">
      <ag-grid-vue
        :theme="gridTheme"
        :columnDefs="columnDefs"
        :defaultColDef="defaultColDef"
        :rowData="filteredRows"
        style="height: 600px"
        class="mr-5"
      />
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import { themeQuartz } from 'ag-grid-community'
import { useTokenGridColumns } from '@/composables/useTokenGridColumns'
import { useTokenWorkspaceTable } from '@/composables/useTokenWorkspaceTable'

const myTheme = themeQuartz.withParams({ accentColor: 'red' })
const gridTheme = ref(myTheme)
const files = ref<File[] | null>(null)
const { columnDefs, defaultColDef } = useTokenGridColumns()

const {
  rows,
  errorMessage,
  activeNodeIds,
  detectedModifiers,
  selectedModifiers,
  groupTreeItems,
  filteredRows,
  onFileChange,
  onModifierChange,
} = useTokenWorkspaceTable()
</script>
