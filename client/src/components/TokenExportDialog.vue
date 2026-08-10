<template>
  <v-tooltip :disabled="canExport" text="Add at least one token before exporting">
    <template #activator="{ props: tooltipProps }">
      <span v-bind="tooltipProps">
        <v-btn
          color="white"
          variant="flat"
          class="mb-5"
          :disabled="!canExport"
          @click="openDialog"
        >
          Export tokens
        </v-btn>
      </span>
    </template>
  </v-tooltip>

  <v-dialog v-model="dialog" max-width="500">
    <v-card>
      <v-card-title>Export tokens</v-card-title>
      <v-card-text>
        <v-alert
          v-if="exportError"
          type="error"
          variant="tonal"
          class="mb-4"
          density="compact"
        >
          {{ exportError }}
        </v-alert>
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

        <v-text-field
          v-if="selectedFormats.includes('android')"
          v-model.number="remBasePx"
          class="mt-4"
          type="number"
          min="1"
          step="1"
          label="Android rem base (px)"
          hint="Required when any token uses rem. Converted as rem × remBasePx → dp."
          persistent-hint
          density="compact"
          variant="outlined"
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="dialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="loading"
          :disabled="selectedFormats.length === 0 || androidRemInvalid"
          @click="exportNow"
        >
          Download
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import axios from 'axios'
import { useDesignSystemStore } from '@/stores/DesignSystem'

const props = withDefaults(
  defineProps<{
    canExport?: boolean
  }>(),
  { canExport: true },
)

const canExport = computed(() => props.canExport)

const API_URL = import.meta.env.VITE_API_URL
type ExportFormat = 'css' | 'tailwind' | 'swift' | 'android' | 'json'

const dsStore = useDesignSystemStore()

const dialog = ref(false)
const loading = ref(false)
const exportError = ref<string | null>(null)
/** Explicit Android rem→dp base; never assumed by the exporter. */
const remBasePx = ref<number | null>(null)

const formats = [
  { label: 'CSS variables', value: 'css', icon: 'mdi-language-css3' },
  { label: 'Tailwind config', value: 'tailwind', icon: 'mdi-tailwind' },
  { label: 'Swift (iOS)', value: 'swift', icon: 'mdi-apple' },
  { label: 'Android', value: 'android', icon: 'mdi-android' },
  { label: 'JSON (canonical DTCG source)', value: 'json', icon: 'mdi-code-json' },
]
const selectedFormats = ref<ExportFormat[]>([])

const androidRemInvalid = computed(() => {
  if (!selectedFormats.value.includes('android')) return false
  // Allow export without remBasePx when the workspace has no rem tokens;
  // the server returns EXPORT_REM_BASE_REQUIRED if rem tokens exist.
  // When the user has typed a value, it must be a positive finite number.
  if (remBasePx.value === null) return false
  return !(Number.isFinite(remBasePx.value) && remBasePx.value > 0)
})

function openDialog() {
  exportError.value = null
  dialog.value = true
}

async function downloadOne(format: ExportFormat) {
  const designSystemId = dsStore.currentId

  if (!designSystemId) {
    console.error('[Export] No design system selected, aborting export')
    throw new Error('No design system selected')
  }

  console.log('[Export] downloading', format, 'for DS', designSystemId)

  const url = `${API_URL}/api/tokens/export/${encodeURIComponent(designSystemId)}`

  const params: Record<string, string | number> = { format, bundle: 1 }
  if (
    format === 'android' &&
    typeof remBasePx.value === 'number' &&
    Number.isFinite(remBasePx.value) &&
    remBasePx.value > 0
  ) {
    params.remBasePx = remBasePx.value
  }

  const res = await axios.get(url, {
    params,
    responseType: 'blob',
    withCredentials: true,
    validateStatus: () => true,
  })

  if (res.status >= 400) {
    let message = `Export failed (${res.status})`
    try {
      const text = await (res.data as Blob).text()
      const parsed = JSON.parse(text) as {
        message?: string
        errors?: Array<{ message?: string }>
      }
      message =
        parsed.message ||
        parsed.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
        text ||
        message
    } catch {
      /* keep default message */
    }
    throw new Error(message)
  }

  const blob = new Blob([res.data], {
    type: res.headers['content-type'] || 'application/octet-stream',
  })

  let filename = `tokens-${format}.zip`

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
  window.URL.revokeObjectURL(urlObject)
}

async function exportNow() {
  if (selectedFormats.value.length === 0) return
  loading.value = true
  exportError.value = null

  try {
    for (const fmt of selectedFormats.value) {
      await downloadOne(fmt)
    }
    dialog.value = false
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Export failed (unknown error)'
    exportError.value = message
    console.error('Export failed:', message, err)
  } finally {
    loading.value = false
  }
}
</script>
