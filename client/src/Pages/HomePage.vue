<template>
  <NavbarComponent1 />
  <div class="d-flex align-center justify-center" style="height: 100vh; width: 100vw">
    <div class="text-center" style="width: 30vw">
      <v-row justify="center">
        <v-col cols="auto">
          <p class="font-weight-black" style="font-family: 'Press Start 2P', monospace">
            Token Manager
          </p>
          <p class="text-h6 font-weight-black" style="font-family: monospace">by Irdina</p>
        </v-col>
      </v-row>
      <!-- <v-btn>
        <router-link to="/StartPage"> Start Page </router-link>
      </v-btn> -->
    </div>
  </div>
</template>

<script lang="ts" setup>
import NavbarComponent1 from '@/components/NavbarComponent1.vue'
</script>
<style scoped>
p {
  font-size: clamp(2rem, 3vw, 3rem);
}
</style>
