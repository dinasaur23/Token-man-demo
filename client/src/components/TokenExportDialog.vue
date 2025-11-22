<template>
  <v-btn color="white" variant="flat" class="mb-5" @click="openDialog"> Export tokens </v-btn>

  <v-dialog v-model="dialog" max-width="500">
    <v-card>
      <v-card-title>Export tokens</v-card-title>
      <v-card-text>
        <v-radio-group v-model="selectedFormat" label="Format">
          <v-radio label="CSS variables" value="css" />
          <v-radio label="Tailwind config (colors)" value="tailwind" />
          <v-radio label="Swift (UIColor)" value="swift" />
        </v-radio-group>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="dialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          :disabled="!selectedFormat"
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

const dialog = ref(false)
const selectedFormat = ref<'css' | 'tailwind' | 'swift' | ''>('css')
const loading = ref(false)

function openDialog() {
  dialog.value = true
}

async function exportNow() {
  if (!selectedFormat.value) return
  loading.value = true

  try {
    const res = await axios.get('/api/tokens/export', {
      params: { format: selectedFormat.value },
      responseType: 'blob',
    })

    const blob = new Blob([res.data], {
      type: res.headers['content-type'] || 'application/octet-stream',
    })

    let filename = 'tokens.txt'
    const disposition = res.headers['content-disposition']
    if (disposition && typeof disposition === 'string') {
      const m = disposition.match(/filename="([^"]+)"/)
      if (m) filename = m[1]
    }

    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)

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
