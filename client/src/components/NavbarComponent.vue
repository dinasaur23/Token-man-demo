<template>
  <v-app-bar class="bg-grey-darken-4" theme="dark">
    <template v-slot:title>
      <v-btn class="pa-2">
        <router-link to="/StartPage">
          <div>
            <span style="font-family: 'Press Start 2P', monospace"> Token Manager </span>
          </div>
        </router-link>
      </v-btn>
    </template>
    <v-autocomplete
      v-if="dsStore.items.length"
      v-model="selectedDsId"
      v-model:search="dsSearch"
      :items="designSystemOptions"
      item-title="label"
      item-value="value"
      density="compact"
      variant="outlined"
      hide-details
      style="max-width: 160px"
      class="mr-3"
    />
    <template v-slot:append>
      <v-btn class="bg-white mr-2" @click="handleLogout">Logout</v-btn>
    </template>
  </v-app-bar>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDesignSystemStore } from '@/stores/DesignSystem'
const API_URL = import.meta.env.VITE_API_URL
const router = useRouter()
const route = useRoute()
const dsStore = useDesignSystemStore()
const dsSearch = ref('')

const designSystemOptions = computed(() =>
  dsStore.items.map((ds) => ({ label: ds.name, value: ds.id })),
)

const selectedDsId = computed<string | null>({
  get: () => dsStore.currentId,
  set: (id: string | null) => {
    dsStore.setCurrent(id)
    if (id && route.name === 'start') {
      router.push({ name: 'token-type', params: { tokenType: 'color' } }).catch(() => {})
    }
  },
})

onMounted(async () => {
  await dsStore.fetchAll()
  console.log('[Navbar] design systems loaded:', dsStore.items)

  if (!dsStore.currentId && dsStore.items.length > 0) {
    dsStore.setCurrent(dsStore.items[0].id)
  }
})

const handleLogout = async () => {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'GET',
      credentials: 'include',
    })
    router.push({ name: 'home' })
  } catch (err) {
    console.error('Logout failed', err)
  }
}
</script>

<style scoped>
span {
  font-size: clamp(1rem, 2vw, 1.5rem);
}
</style>
