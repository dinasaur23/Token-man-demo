<template>
  <v-container>
    <v-text-field
      v-model="search"
      placeholder="Search name…"
      density="compact"
      class="mb-3"
      @keyup.enter="refresh"
      clearable
    />

    <v-data-table-server
      :headers="headers"
      :items="items"
      :items-length="total"
      v-model:options="options"
      :loading="loading"
      item-key="id"
      class="elevation-1"
    >
      <!-- Name cell (editable inline, purely frontend) -->
      <template v-slot:[`item.name`]="{ item }">
        <v-text-field
          v-model="item.name"
          variant="plain"
          density="compact"
          hide-details
          style="min-width: 180px"
        />
      </template>

      <!-- Color cell: swatch + hex + picker menu -->
      <template v-slot:[`item.hex`]="{ item }">
        <div class="d-flex align-center" style="gap: 12px">
          <!-- Swatch opens picker menu -->
          <v-menu v-model="rowPicker[item.id]" :close-on-content-click="false">
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                :style="{
                  background: item.hex,
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                }"
                variant="text"
                :aria-label="`Edit color ${item.name}`"
              />
            </template>
            <v-card>
              <v-color-picker v-model="item.hex" mode="hexa" show-swatches hide-inputs />
              <v-card-actions class="justify-end">
                <v-btn variant="text" @click="rowPicker[item.id] = false">Close</v-btn>
              </v-card-actions>
            </v-card>
          </v-menu>

          <!-- Hex text (editable) -->
          <v-text-field
            v-model="item.hex"
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 120px"
          />
        </div>
      </template>

      <!-- Actions -->
      <template v-slot:[`item.actions`]="{ item }">
        <v-btn icon variant="text" @click="removeRow(item.id)">
          <v-icon>mdi-delete</v-icon>
        </v-btn>
      </template>
    </v-data-table-server>

    <div class="mt-4 d-flex justify-end" style="gap: 8px">
      <v-btn @click="addRow" prepend-icon="mdi-plus">Add color</v-btn>
      <v-btn @click="refresh" prepend-icon="mdi-refresh">Refresh</v-btn>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import type { DataTableHeader } from 'vuetify'
type Row = { id: number; name: string; hex: string }

// ------- Table headers -------
const headers = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Color', key: 'hex', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, align: 'end' },
] satisfies DataTableHeader<Row>[]

// ------- Reactive state -------
const items = ref<Row[]>([])
const total = ref(0)
const loading = ref(false)
const search = ref('')

// v-data-table-server options it controls
const options = ref<{
  page: number
  itemsPerPage: number
  sortBy: { key: string; order: 'asc' | 'desc' }[]
}>({
  page: 1,
  itemsPerPage: 10,
  sortBy: [],
})

// open/close state for each row’s picker menu
const rowPicker = reactive<Record<number, boolean>>({})

// ------- MOCK SERVER (local data only) -------
let seedId = 6
const ALL_ROWS: Row[] = [
  { id: 1, name: 'Primary', hex: '#3f51b5' },
  { id: 2, name: 'Accent', hex: '#ff4081' },
  { id: 3, name: 'Success', hex: '#4caf50' },
  { id: 4, name: 'Warning', hex: '#ff9800' },
  { id: 5, name: 'Neutral', hex: '#9e9e9e' },
]

type FetchResult = { items: Row[]; total: number }

/** Simulate server: filter, sort, paginate in-memory */
async function mockFetch({
  page,
  perPage,
  search,
  sort,
  order,
}: {
  page: number
  perPage: number
  search: string
  sort?: string
  order?: 'asc' | 'desc'
}): Promise<FetchResult> {
  // simulate latency
  await new Promise((r) => setTimeout(r, 200))

  let rows = [...ALL_ROWS]

  // search
  if (search?.trim()) {
    const q = search.toLowerCase()
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.hex.toLowerCase().includes(q))
  }

  // sort
  if (sort) {
    rows.sort((a, b) => {
      // constrain sort key to Row
      const key = sort as keyof Row

      const av = a[key]
      const bv = b[key]

      if (av < bv) return order === 'desc' ? 1 : -1
      if (av > bv) return order === 'desc' ? -1 : 1
      return 0
    })
  }

  const total = rows.length
  const start = (page - 1) * perPage
  const end = start + perPage
  return { items: rows.slice(start, end), total }
}

// ------- Fetch hook -------
watch([options, search], () => fetchRows(), { deep: true })
watch(search, () => {
  options.value.page = 1
})

async function fetchRows() {
  loading.value = true
  try {
    const { page, itemsPerPage, sortBy } = options.value
    const sort = sortBy[0]?.key
    const order = sortBy[0]?.order ?? 'asc'

    const res = await mockFetch({
      page,
      perPage: itemsPerPage,
      search: search.value,
      sort,
      order,
    })
    items.value = res.items
    total.value = res.total
  } finally {
    loading.value = false
  }
}

function refresh() {
  fetchRows()
}

// ------- Row actions (frontend only) -------
function addRow() {
  ALL_ROWS.push({
    id: seedId++,
    name: 'Untitled',
    hex: '#000000',
  })
  refresh()
}

function removeRow(id: number) {
  const i = ALL_ROWS.findIndex((r) => r.id === id)
  if (i !== -1) ALL_ROWS.splice(i, 1)
  refresh()
}

// initial load
fetchRows()
</script>
