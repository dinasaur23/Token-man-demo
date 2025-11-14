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
      />
    </v-col>
  </v-row>

  <v-row v-if="rows.length" class="mt-4">
    <!-- Sidebar tree -->
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
        />
      </div>
    </v-col>

    <!-- Grid -->
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
const myTheme = themeQuartz.withParams({ accentColor: 'red' })
const gridTheme = ref(myTheme)

import { validateColorSubtree } from '@/utils/dtcg/dtcg-validator'
import {
  collectColorTokensWithPath,
  resolveAlias,
  resolveValue,
  type ColorRow,
  type ColorTokenEntry,
} from '@/utils/dtcg/dtcg-parser'

// ───── State ─────
const files = ref<File[] | File | null>(null)
const rows = ref<(ColorRow & { raw?: unknown })[]>([])

const activeNodeIds = ref<string[]>([])
// ───── Build group tree from groupPath ─────
type GroupNode = {
  id: string
  title: string
  children?: GroupNode[]
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
      const id = pathSoFar.join('.') // "palette.blue" / "component.sectionMessage.success"

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
  const g = activeNodeIds.value[0] // current active node id
  if (!g) return rows.value

  return rows.value.filter((r) => {
    const id = r.groupPath.join('.') // e.g. "global/brand-a.palette.green"
    return id === g || id.startsWith(g + '.')
  })
})
// ───── Helpers for grouping ─────
function extractGroupPath(path: string): string[] {
  const dot = path.indexOf('.')
  if (dot === -1) return []

  // token set path before first dot, e.g.:
  // "global/brand-a/color" or "alias/mode/color-dark"
  const tokenSetPart = path.slice(0, dot)

  // rest after the token-set, e.g.:
  // "global.color.palette.green.50"
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

// ───── AG Grid column definitions ─────
const columnDefs = ref<ColDef<ColorRow & { raw?: unknown }>[]>([
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
    field: 'value',
    width: 120,
    // simple color picker that writes back into the row
    cellRenderer: (params: ICellRendererParams<ColorRow>) => {
      const eInput = document.createElement('input')
      eInput.type = 'color'
      eInput.value = (params.value as string) || '#000000'
      eInput.style.width = '32px'
      eInput.style.height = '32px'
      eInput.style.border = 'none'
      eInput.style.padding = '0'
      eInput.style.background = 'transparent'

      eInput.addEventListener('input', (event: Event) => {
        const newColor = (event.target as HTMLInputElement).value
        params.node.setDataValue('value', newColor)
      })

      return eInput
    },
  },
  {
    headerName: 'Alias',
    field: 'raw',
    flex: 1,
    valueFormatter: (p) => (typeof p.value === 'string' ? p.value : JSON.stringify(p.value)),
  },
])

const defaultColDef: ColDef = {
  sortable: true,
  filter: true,
  resizable: true,
}

// ───── File → parse → rows ─────
async function onFileChange(newFiles: File[] | File) {
  const list = Array.isArray(newFiles) ? newFiles : [newFiles]
  if (list.length === 0) return

  try {
    const text = await list[0].text()
    const json = JSON.parse(text)

    const result = validateColorSubtree(json)
    if (!result.ok) {
      console.error('❌ Invalid DTCG format:', result.errors)
      rows.value = []
      return
    }

    const tokens = collectColorTokensWithPath(json, '', undefined)

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
      const resolved = resolveAlias(t.path, map) ?? resolveValue(t.value, map) ?? '#000000'

      const groupPath = extractGroupPath(t.path)
      const groupLabel = groupPath.length ? groupPath[groupPath.length - 1] : ''

      const name = t.path.split('.').pop() ?? t.path

      return {
        name,
        value: resolved,
        raw: t.value,
        group: groupLabel,
        groupPath,
      } satisfies ColorRow
    })

    // reset selection when new file is loaded
    activeNodeIds.value = []
    console.log('✅ DTCG colors:', rows.value)
    //console.log('activeNodeIds', activeNodeIds.value)
    //console.log('first row groupPath', rows.value[0]?.groupPath.join('.'))
  } catch (err) {
    console.error('Error reading/parsing file:', err)
  }
}
</script>
