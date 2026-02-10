<template>
  <div class="d-flex align-center justify-center" style="height: 100vh; width: 100vw">
    <div class="text-center" style="width: 30vw">
      <v-row justify="center" class="mb-8">
        <v-col cols="auto">
          <p class="font-weight-black welcome">Welcome</p>
        </v-col>
      </v-row>

      <v-row justify="center">
        <v-col cols="12">
          <v-autocomplete
            v-model="selectedId"
            v-model:search="search"
            :items="designSystemOptions"
            item-title="label"
            item-value="value"
            label="Enter the name of your design"
            variant="outlined"
            :loading="dsStore.loading"
            hide-selected
            clearable
            @keyup.enter="onEnter"
            @update:model-value="onSelectFromAutocomplete"
          />
        </v-col>
      </v-row>

      <v-row v-if="dsStore.items.length" class="mt-6">
        <v-col cols="12">
          <div class="text-subtitle-2 mb-2">Design Systems</div>

          <v-chip-group column v-model="selectedId" @update:model-value="onQuickSelect">
            <!-- chip + 3-dots menu per design system -->
            <div v-for="ds in dsStore.items" :key="ds.id" class="d-inline-flex align-center ma-1">
              <v-chip :value="ds.id" label class="mr-1">
                {{ ds.name }}
              </v-chip>

              <v-menu location="bottom">
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon size="small" variant="text">
                    <v-icon>mdi-dots-vertical</v-icon>
                  </v-btn>
                </template>

                <v-list density="compact">
                  <v-list-item @click="onRename(ds)">
                    <v-list-item-title>Rename</v-list-item-title>
                  </v-list-item>
                  <v-list-item @click="onDelete(ds)">
                    <v-list-item-title class="text-error"> Delete </v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </div>
          </v-chip-group>
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDesignSystemStore } from '@/stores/DesignSystem'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'
import type { DesignSystem } from '@/stores/DesignSystem'

const router = useRouter()
const dsStore = useDesignSystemStore()
const wsStore = useTokenWorkspaceStore()
const search = ref('')
const selectedId = ref<string | null>(null)

onMounted(async () => {
  await dsStore.fetchAll()
  selectedId.value = dsStore.currentId

  const current = dsStore.items.find((ds) => ds.id === dsStore.currentId)
  search.value = current?.name ?? ''

  console.log('StartPage mounted, design systems:', dsStore.items)
})

watch(search, (val) => {
  const trimmed = val.trim().toLowerCase()
  const current = dsStore.items.find((ds) => ds.id === selectedId.value)

  if (!current) return

  if (trimmed !== current.name.toLowerCase()) {
    selectedId.value = null
  }
})

const designSystemOptions = computed(() =>
  dsStore.items.map((ds) => ({ label: ds.name, value: ds.id })),
)

async function goToWorkspace(designSystemId: string) {
  console.log('[StartPage] goToWorkspace', designSystemId)
  dsStore.setCurrent(designSystemId)
  wsStore.resetForDesignSystem(designSystemId)
  await router.push({ name: 'colors' })
}

async function onEnter() {
  if (selectedId.value) {
    await goToWorkspace(selectedId.value)
    return
  }

  const name = search.value.trim()
  if (!name) return

  const existing = dsStore.items.find((ds) => ds.name.toLowerCase() === name.toLowerCase())
  if (existing) {
    selectedId.value = existing.id
    await goToWorkspace(existing.id)
    return
  }

  const created = await dsStore.create(name)
  selectedId.value = created.id
  await goToWorkspace(created.id)
}
function onSelectFromAutocomplete(value: string | { value: string } | null) {
  if (!value) return
  const id = typeof value === 'string' ? value : value.value
  selectedId.value = id
}

function onQuickSelect(id: string | null) {
  if (!id) return
  selectedId.value = id
  void goToWorkspace(id)
}

async function onRename(ds: DesignSystem) {
  const currentName = ds.name
  const input = window.prompt('Rename design system', currentName)
  const newName = input?.trim()
  if (!newName || newName === currentName) return

  try {
    await dsStore.rename(ds.id, newName)
  } catch (err) {
    console.error('rename design system failed', err)
    window.alert('Could not rename design system.')
  }
}

async function onDelete(ds: DesignSystem) {
  const ok = window.confirm(
    `Delete design system "${ds.name}"?\nAll its tokens will be removed. This cannot be undone.`,
  )
  if (!ok) return

  try {
    await dsStore.remove(ds.id)

    if (selectedId.value === ds.id) {
      selectedId.value = dsStore.currentId
    }
  } catch (err) {
    console.error('delete design system failed', err)
    window.alert('Could not delete design system.')
  }
}
</script>

<style scoped>
.welcome {
  font-size: clamp(2rem, 3vw, 3rem);
}
</style>
