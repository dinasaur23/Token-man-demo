<template>
  <NavbarComponent1 />
  <v-form @submit.prevent="handleSubmit" style="margin-top: -32px">
    <v-row justify="center" class="d-flex" align="center" style="min-height: 100vh">
      <v-col cols="5">
        <HeaderComponent />
        <v-card title="Login" variant="tonal" class="px-6 py-2">
          <v-text-field
            label="email"
            variant="outlined"
            v-model="email"
            type="email"
          ></v-text-field>
          <p v-if="emailError" class="text-red mb-5">{{ emailError }}</p>
          <v-text-field
            label="password"
            variant="outlined"
            v-model="password"
            type="password"
          ></v-text-field>
          <p v-if="passwordError" class="text-red mb-5">{{ passwordError }}</p>
          <v-card-actions>
            <v-btn class="bg-white">
              <v-btn type="submit" color="primary"> Log in </v-btn>
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import HeaderComponent from '../components/HeaderComponent.vue'
import NavbarComponent1 from '@/components/NavbarComponent1.vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const API_URL = import.meta.env.VITE_API_URL

const email = ref('')
const password = ref('')

const emailError = ref<string | null>(null)
const passwordError = ref<string | null>(null)

const handleSubmit = async () => {
  emailError.value = ''
  passwordError.value = ''
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: email.value, password: password.value }),
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    console.log(data)
    if (data.errors) {
      emailError.value = data.errors.email
      passwordError.value = data.errors.password
    }
    if (data.user) {
      router.push('/StartPage')
    }
  } catch (err) {
    console.log(err)
  }
}
</script>
