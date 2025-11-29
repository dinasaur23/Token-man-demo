<template>
  <v-btn color="white" variant="flat" class="mb-5" @click="openDialog"> Export tokens </v-btn>

  <v-dialog v-model="dialog" max-width="500">
    <v-card>
      <v-card-title>Export tokens</v-card-title>
      <v-card-text>
        <div
          v-for="fmt in formats"
          :key="fmt.value"
          class="d-flex align-center mb-2"
          style="gap: 14px"
        >
          <v-switch
            v-model="selectedFormats"
            :value="fmt.value"
            inset
            color="primary"
            hide-details
            density="compact"
            class="ma-0 pa-0"
            style="min-width: 48px"
          />
          <v-icon size="20">{{ fmt.icon }}</v-icon>
          <span style="font-size: 15px">{{ fmt.label }}</span>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="dialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          :disabled="selectedFormats.length === 0"
          @click="exportNow"
        >
          Download
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import axios from 'axios'
import { useDesignSystemStore } from '@/stores/DesignSystem'
type ExportFormat = 'css' | 'tailwind' | 'swift' | 'android' | 'json'

const dsStore = useDesignSystemStore()
const dialog = ref(false)
const loading = ref(false)

const formats = [
  { label: 'CSS variables', value: 'css', icon: 'mdi-language-css3' },
  { label: 'Tailwind config', value: 'tailwind', icon: 'mdi-tailwind' },
  { label: 'Swift (iOS)', value: 'swift', icon: 'mdi-apple' },
  { label: 'Android', value: 'android', icon: 'mdi-android' },
  { label: 'JSON', value: 'json', icon: 'mdi-code-json' },
]
const selectedFormats = ref<ExportFormat[]>([])

function openDialog() {
  dialog.value = true
}

async function downloadOne(format: ExportFormat) {
  const designSystemId = dsStore.currentId

  if (!designSystemId) {
    console.error('[Export] No design system selected, aborting export')
    return
  }

  console.log('[Export] downloading', format, 'for DS', designSystemId)

  const url = `/api/tokens/export/${encodeURIComponent(designSystemId)}`
  const res = await axios.get(url, {
    params: { format },
    responseType: 'blob',
    withCredentials: true,
  })

  const blob = new Blob([res.data], {
    type: res.headers['content-type'] || 'application/octet-stream',
  })

  // default filename
  let filename = `tokens.${format}.txt`
  const disposition = res.headers['content-disposition']
  if (disposition && typeof disposition === 'string') {
    const m = disposition.match(/filename="([^"]+)"/)
    if (m) filename = m[1]
  }

  const urlObject = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = urlObject
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

async function exportNow() {
  if (selectedFormats.value.length === 0) return
  loading.value = true

  try {
    for (const fmt of selectedFormats.value) {
      await downloadOne(fmt)
    }
    dialog.value = false
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response) {
      try {
        const blob = err.response.data as Blob
        const text = await blob.text()
        console.error('Export failed. Backend says:', text)
      } catch (readErr) {
        console.error('Export failed, could not read error blob', readErr)
      }
    } else {
      console.error('Export failed (no response)', err)
    }
  } finally {
    loading.value = false
  }
}
</script>
