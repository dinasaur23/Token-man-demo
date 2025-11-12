<template>
  <v-row>
    <v-col cols="4">
      <v-file-input
        accept=".json, application/json"
        label="File input"
        variant="outlined"
        multiple
        v-model="files"
        @update:model-value="onFileChange"
      ></v-file-input>
    </v-col>
  </v-row>
  <div style="max-height: 100vh; overflow-y: auto">
    <v-data-table :headers="headers" :items="rows">
      <template #[`item.color`]="{ item }">
        <input
          type="color"
          v-model="item.value"
          style="width: 32px; height: 32px; padding: 0; border: none; background: transparent"
        />
      </template>
      <template #[`item.raw`]="{ item }">
        <code>{{ typeof item.raw === 'string' ? item.raw : JSON.stringify(item.raw) }}</code>
      </template>
    </v-data-table>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
//import { validateDtcgColorsInDoc } from '@/utils/dtcg/dtcg-validator'
import { validateColorSubtree } from '@/utils/dtcg/dtcg-validator'
import {
  collectColorTokensWithPath,
  resolveAlias,
  resolveValue,
  type ColorRow,
  type ColorTokenEntry,
} from '@/utils/dtcg/dtcg-parser'
const files = ref<File[] | File | null>(null)
const rows = ref<ColorRow[]>([])
const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Value', key: 'value' },
  { title: 'Color', key: 'color' },
]

async function onFileChange(newFiles: File[] | File) {
  const list = Array.isArray(newFiles) ? newFiles : [newFiles]
  if (list.length === 0) return

  try {
    const text = await list[0].text()
    const json = JSON.parse(text)

    // Step 1: Schema validation
    const result = validateColorSubtree(json)
    if (!result.ok) {
      console.error('❌ Invalid DTCG format:', result.errors)
      rows.value = []
      return
    }

    // ✅ Step 2: Extract and resolve tokens
    const tokens = collectColorTokensWithPath(json, '', undefined)
    const map: Record<string, ColorTokenEntry> = Object.fromEntries(tokens.map((t) => [t.path, t]))

    rows.value = tokens.map((t) => {
      const resolved = resolveAlias(t.path, map) ?? resolveValue(t.value, map) ?? '#000000'

      return {
        name: t.path.split('.').pop() ?? t.path,
        value: resolved, // <- resolved hex goes into .value
        raw: t.value, // <- keep the original for display
      } satisfies ColorRow & { raw: unknown }
    })

    console.log('✅ DTCG colors:', rows.value)
  } catch (err) {
    console.error('Error reading/parsing file:', err)
  }
}
</script>
