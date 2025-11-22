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
      <router-link to="/ColorContentPage">
        <v-list-item prepend-icon="mdi mdi-palette" title="Color" value="color"></v-list-item>
      </router-link>
    </v-list>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import { ref } from 'vue'

const drawer = ref(true)
const rail = ref(true)
</script>
