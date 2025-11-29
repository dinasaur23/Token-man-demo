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
            <v-chip v-for="ds in dsStore.items" :key="ds.id" :value="ds.id" class="ma-1" label>
              {{ ds.name }}
            </v-chip>
          </v-chip-group>
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDesignSystemStore } from '@/stores/DesignSystem'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'

const router = useRouter()
const dsStore = useDesignSystemStore()
const wsStore = useTokenWorkspaceStore()
const search = ref('')
const selectedId = ref<string | null>(null)

onMounted(async () => {
  await dsStore.fetchAll()
  console.log('StartPage mounted, design systems:', dsStore.items)
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
</script>

<style scoped>
.welcome {
  font-size: clamp(2rem, 3vw, 3rem);
}
</style>
