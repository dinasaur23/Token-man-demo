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
    <v-col cols="12" md="2">
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
      />
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import type { ColDef, ICellRendererParams } from 'ag-grid-community'
import { themeQuartz } from 'ag-grid-community'
import { validateTokensStrict } from '@/utils/dtcg/dtcg-validator'
import { convertHexColorsInDocument, HEX_PATTERN } from '@/utils/dtcg/color-conversion'
import {
  collectColorTokensWithPath,
  resolveAlias,
  resolveValue,
  type ColorRow,
  type ColorTokenEntry,
} from '@/utils/dtcg/dtcg-parser'
import {
  resolveUploadedDocuments,
  extractModifiersFromDocs,
  type DetectedModifier,
  type JsonValue,
} from '@/utils/dtcg/resolver'

const myTheme = themeQuartz.withParams({ accentColor: 'red' })
const gridTheme = ref(myTheme)
const files = ref<File[] | null>(null)
const rows = ref<TableRow[]>([])
const errorMessage = ref<string | null>(null)
const activeNodeIds = ref<string[]>([])
const uploadedDocs = ref<Record<string, JsonValue>>({})
const detectedModifiers = ref<DetectedModifier[]>([])
const selectedModifiers = ref<Record<string, string>>({})

type GroupNode = {
  id: string
  title: string
  children?: GroupNode[]
}
type SrgbObject = {
  colorSpace?: unknown
  components?: unknown
  alpha?: unknown
  hex?: unknown
}
type TableRow = ColorRow & {
  raw?: unknown
  hex: string
}
function onModifierChange(name: string, value: string | null): void {
  if (!value) {
    delete selectedModifiers.value[name]
  } else {
    selectedModifiers.value[name] = value
  }

  void resolveAndPopulateFromUploadedDocs()
}

function buildGroupTree(allRows: ColorRow[]): GroupNode[] {
  const root: GroupNode[] = []
  const lookup = new Map<string, GroupNode>()

  for (const row of allRows) {
    if (!row.groupPath.length) continue

    const pathSoFar: string[] = []
    let children = root

    for (const segment of row.groupPath) {
      pathSoFar.push(segment)
      const id = pathSoFar.join('.')

      let node = lookup.get(id)
      if (!node) {
        node = { id, title: segment, children: [] }
        lookup.set(id, node)
        children.push(node)
      }

      children = node.children!
    }
  }

  return root
}

const groupTreeItems = computed(() => buildGroupTree(rows.value))

const filteredRows = computed(() => {
  const g = activeNodeIds.value[0]
  if (!g) return rows.value

  return rows.value.filter((r) => {
    const id = r.groupPath.join('.')
    return id === g || id.startsWith(g + '.')
  })
})

function extractGroupPath(path: string): string[] {
  const dot = path.indexOf('.')
  if (dot === -1) return []

  const tokenSetPart = path.slice(0, dot)
  const rest = path.slice(dot + 1)

  const tsSegments = tokenSetPart.split('/')

  const GENERIC_SUFFIXES = ['color', 'colors', 'typography', 'type', 'spacing']

  let collectionSegments = [...tsSegments]
  const last = collectionSegments[collectionSegments.length - 1]

  if (GENERIC_SUFFIXES.includes(last)) {
    collectionSegments = collectionSegments.slice(0, -1)
  }

  const collection = collectionSegments.join('/')

  const parts = rest.split('.')
  parts.pop()
  const cleaned = parts.filter((p) => p !== 'global' && p !== 'alias' && p !== 'color')
  return collection ? [collection, ...cleaned] : cleaned
}

const columnDefs = ref<ColDef<TableRow>[]>([
  { headerName: 'Group', field: 'group', flex: 1 },
  {
    headerName: 'Name',
    field: 'name',
    flex: 1,
  },
  {
    headerName: 'Value',
    field: 'value',
    flex: 1,
    editable: true,
  },
  {
    headerName: 'Color',
    field: 'hex',
    width: 120,
    cellRenderer: (params: ICellRendererParams<TableRow>) => {
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

      eInput.addEventListener('change', (event: Event) => {
        const newColor = (event.target as HTMLInputElement).value

        params.node.setDataValue('hex', newColor)

        const srgb = srgbFromHex(newColor)
        params.node.setDataValue('value', srgb)
      })

      return eInput
    },
  },
  //   {
  //     headerName: 'Alias',
  //     field: 'raw',
  //     flex: 1,
  //     valueFormatter: (p) => (typeof p.value === 'string' ? p.value : JSON.stringify(p.value)),
  //   },
])

const defaultColDef: ColDef = {
  sortable: true,
  filter: true,
  resizable: true,
}

function srgbFromHex(hex: string): string {
  if (!HEX_PATTERN.test(hex)) return hex

  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  return `srgb(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`
}

async function resolveAndPopulateFromUploadedDocs(): Promise<void> {
  const docs = uploadedDocs.value
  if (Object.keys(docs).length === 0) return

  try {
    const input: Record<string, string> = { ...selectedModifiers.value }

    const resolvedDoc = resolveUploadedDocuments(docs, input)
    await populateTableFromDocument(resolvedDoc)
    errorMessage.value = null
  } catch (err) {
    console.error('Error resolving tokens:', err)
    errorMessage.value =
      err instanceof Error ? err.message : 'Error resolving tokens with current modifier values.'
    rows.value = []
  }
}

async function onFileChange(newFiles: File[] | File | null) {
  rows.value = []
  errorMessage.value = null
  activeNodeIds.value = []

  if (!newFiles) {
    uploadedDocs.value = {}
    detectedModifiers.value = []
    selectedModifiers.value = {}
    return
  }
  const fileList: File[] = Array.isArray(newFiles) ? newFiles : [newFiles]
  if (fileList.length === 0) {
    uploadedDocs.value = {}
    detectedModifiers.value = []
    selectedModifiers.value = {}
    return
  }
  const docs: Record<string, JsonValue> = {}
  for (const file of fileList) {
    try {
      const text = await file.text()
      const json = JSON.parse(text) as JsonValue
      docs[file.name] = json
    } catch (err) {
      console.error('Error parsing file', file.name, err)
      errorMessage.value = `File "${file.name}" is not valid JSON.`
      return
    }
  }
  uploadedDocs.value = docs
  detectedModifiers.value = extractModifiersFromDocs(docs)
  selectedModifiers.value = {}
  for (const mod of detectedModifiers.value) {
    const initial = mod.defaultValue ?? (mod.values.length > 0 ? mod.values[0] : '')
    if (initial) {
      selectedModifiers.value[mod.name] = initial
    }
  }
  await resolveAndPopulateFromUploadedDocs()
}

async function populateTableFromDocument(doc: unknown) {
  const convertedDoc = convertHexColorsInDocument(doc)
  console.log('Converted DTCG document:', convertedDoc)
  const validation = await validateTokensStrict(convertedDoc)
  if (!validation.ok) {
    console.error('❌ Invalid DTCG format:', validation.errors)
    const count = validation.errors.length
    errorMessage.value =
      `The uploaded JSON is not valid DTCG (${validation.kind} errors: ${count}). ` +
      `Open the browser console for details.`
    rows.value = []
    return
  }
  const tokens = collectColorTokensWithPath(convertedDoc)
  console.log('Collected color tokens:', tokens)
  const map: Record<string, ColorTokenEntry> = {}
  for (const t of tokens) {
    map[t.path] = t
    const match = t.path.match(/((?:global|alias)\.color\..+)$/)
    if (match) {
      const shortKey = match[1]
      if (!map[shortKey]) {
        map[shortKey] = t
      }
    }
  }
  rows.value = tokens.map((t) => {
    const resolved = resolveAlias(t.path, map) ?? resolveValue(t.value, map) ?? t.value
    const display = makeDisplayColor(resolved)
    const groupPath = extractGroupPath(t.path)
    const groupLabel = groupPath.length ? groupPath[groupPath.length - 1] : ''
    const name = t.path.split('.').pop() ?? t.path
    return {
      name,
      value: display.srgb,
      hex: display.hex,
      raw: t.value,
      group: groupLabel,
      groupPath,
    } satisfies TableRow
  })
  activeNodeIds.value = []
  console.log('✅ Valid DTCG colors:', rows.value)
}

function makeDisplayColor(value: unknown): { srgb: string; hex: string } {
  if (typeof value === 'string' && HEX_PATTERN.test(value)) {
    return { srgb: value, hex: value }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as SrgbObject
    if (
      obj.colorSpace === 'srgb' &&
      Array.isArray(obj.components) &&
      obj.components.length === 3 &&
      obj.components.every((c) => typeof c === 'number')
    ) {
      const comps = obj.components as number[]
      const compStr = comps.map((c) => c.toFixed(3)).join(', ')
      const alphaStr = typeof obj.alpha === 'number' ? `, ${obj.alpha.toFixed(3)}` : ''
      const srgb = `srgb(${compStr}${alphaStr})`
      if (typeof obj.hex === 'string' && HEX_PATTERN.test(obj.hex)) {
        return { srgb, hex: obj.hex }
      }
      const toByteHex = (c: number): string => {
        const clamped = Math.max(0, Math.min(1, c))
        const v = Math.round(clamped * 255)
        return v.toString(16).padStart(2, '0')
      }
      const [r, g, b] = comps
      const hex = `#${toByteHex(r)}${toByteHex(g)}${toByteHex(b)}`
      return { srgb, hex }
    }
  }
  return {
    srgb: typeof value === 'string' ? value : JSON.stringify(value),
    hex: '#000000',
  }
}
</script>
