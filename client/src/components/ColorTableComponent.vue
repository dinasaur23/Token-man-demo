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
  <v-data-table :headers="headers" :items="rows">
    <template #[`item.color`]="{ item }">
      <input
        type="color"
        v-model="item.value"
        style="width: 32px; height: 32px; padding: 0; border: none; background: transparent"
      />
    </template>
  </v-data-table>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const files = ref<File[] | File | null>(null)
const rows = ref<ColorRow[]>([])
const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Value', key: 'value' },
  { title: 'Color', key: 'color' },
]

//types
type ColorRow = { name: string; value: string }

type DTCGNode = {
  [key: string]: unknown
}

type ColorTokenEntry = {
  path: string
  value: string
}

//helpers
function isObject(value: unknown): value is DTCGNode {
  return typeof value === 'object' && value !== null
}

function isAlias(value: string): boolean {
  return value.startsWith('{') && value.endsWith('}')
}

function aliasTarget(value: string): string {
  return value.slice(1, -1) // "{colors.font.base}" -> "colors.font.base"
}

//main function
function collectColorTokensWithPath(
  node: unknown,
  prefix: string,
  inheritedType?: string,
): ColorTokenEntry[] {
  const result: ColorTokenEntry[] = []

  if (!isObject(node)) return result

  // type on this level (overrides inherited if present)
  const ownType = typeof node.$type === 'string' ? (node.$type as string) : inheritedType

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue // skip $type, $description, etc.

    if (!isObject(value)) continue

    const child = value as DTCGNode
    const childType = typeof child.$type === 'string' ? (child.$type as string) : ownType
    const path = prefix ? `${prefix}.${key}` : key

    // Token: has $value
    if (typeof child.$value === 'string') {
      if (childType === 'color') {
        result.push({
          path,
          value: child.$value,
        })
      }
      // if not 'color', ignore (could be other token types)
      continue
    }

    // Group: no $value → recurse
    const nested = collectColorTokensWithPath(child, path, childType)
    result.push(...nested)
  }

  return result
}
//resolve alias
function resolveAlias(
  path: string,
  map: Record<string, ColorTokenEntry>,
  stack: string[] = [],
): string | null {
  const entry = map[path]
  if (!entry) return null

  const raw = entry.value
  if (!isAlias(raw)) return raw

  const target = aliasTarget(raw)
  if (stack.includes(target)) return null // cycle protection

  return resolveAlias(target, map, [...stack, target])
}

//use in onFileChange

async function onFileChange(newFiles: File[] | File) {
  const list = Array.isArray(newFiles) ? newFiles : [newFiles]
  if (list.length === 0) return

  try {
    const text = await list[0].text()
    const parsed = JSON.parse(text)

    const entries = collectColorTokensWithPath(parsed, '', undefined)

    if (entries.length === 0) {
      console.error('❌ No DTCG color tokens found')
      rows.value = []
      return
    }

    // Build lookup map for alias resolution
    const map: Record<string, ColorTokenEntry> = {}
    for (const e of entries) {
      map[e.path] = e
    }

    // Final rows: resolved aliases
    rows.value = entries.map((e): ColorRow => {
      const resolved = resolveAlias(e.path, map) ?? e.value
      return {
        // if you only want the last segment ("base", "secondary", ...)
        name: e.path.split('.').pop() ?? e.path,
        value: resolved,
      }
    })

    console.log('✅ DTCG colors:', rows.value)
  } catch (err) {
    console.error('Error reading/parsing file:', err)
    rows.value = []
  }
}
</script>
