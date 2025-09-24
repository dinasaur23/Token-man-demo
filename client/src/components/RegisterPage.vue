<template>
  <v-row justify="center" class="d-flex" align="center">
    <v-col cols="5">
      <HeaderComponent />
      <v-card title="Register" variant="tonal" class="px-6 py-2">
        <v-text-field label="email" variant="outlined" v-model="email"></v-text-field>
        <v-text-field
          label="password"
          variant="outlined"
          v-model="password"
          type="password"
        ></v-text-field>
        <v-card-actions>
          <v-btn @click="register" variant="outlined">Register</v-btn>
        </v-card-actions>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import HeaderComponent from './HeaderComponent.vue'
import AuthenticationService from '@/services/AuthenticationService'
const email = ref('')
const password = ref('')

async function register() {
  const res = await AuthenticationService.register({
    email: email.value,
    password: password.value,
  })
  console.log(res.data)
}
</script>
