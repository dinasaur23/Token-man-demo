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
    <template v-slot:append>
      <v-btn class="bg-white mr-2" @click="handleLogout">Logout</v-btn>
    </template>
  </v-app-bar>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()

const handleLogout = async () => {
  try {
    await fetch('/api/auth/logout', {
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
