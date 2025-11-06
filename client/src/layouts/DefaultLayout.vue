<template>
  <v-layout>
    <NavbarComponent />
    <NavdrawerComponent />
    <v-main>
      <router-view />
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import NavbarComponent from '@/components/NavbarComponent.vue'
import NavdrawerComponent from '@/components/NavdrawerComponent.vue'
</script>
