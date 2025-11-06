<template>
  <v-app-bar :elevation="2" class="bg-black" theme="dark">
    <template v-slot:append>
      <v-btn>
        <router-link to="/LoginPage"> Login </router-link>
      </v-btn>
      <v-btn>
        <router-link to="/SignupPage"> Sign up </router-link>
      </v-btn>
    </template>
  </v-app-bar>
</template>
