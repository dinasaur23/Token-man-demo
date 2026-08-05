<template>
  <v-navigation-drawer
    v-model="drawer"
    :rail="rail"
    permanent
    @click="rail = false"
    class="bg-grey-darken-4"
    theme="dark"
    width="220"
  >
    <v-list>
      <v-list-item prepend-icon="mdi-shape" title="Category">
        <template v-slot:append>
          <v-btn icon="mdi-chevron-left" variant="text" @click.stop="rail = !rail"></v-btn>
        </template>
      </v-list-item>
    </v-list>

    <v-divider></v-divider>

    <v-list density="compact" nav>
      <router-link
        v-for="item in navItems"
        :key="item.id"
        :to="{ name: 'token-type', params: { tokenType: item.navPath } }"
      >
        <v-list-item
          :prepend-icon="item.navIcon ?? 'mdi-circle-small'"
          :title="item.label"
          :value="item.navPath"
        />
      </router-link>
    </v-list>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import { getRegisteredTokenTypeDefinitions } from '@/utils/dtcg/token-types'

const drawer = ref(true)
const rail = ref(true)

/** Registry-driven nav — Color only until other types are registered. */
const navItems = computed(() => getRegisteredTokenTypeDefinitions())
</script>
