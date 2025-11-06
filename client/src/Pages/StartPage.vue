<template>
  <div class="d-flex align-center justify-center" style="height: 100vh; width: 100vw">
    <div class="text-center" style="width: 30vw">
      <v-row justify="center">
        <v-col cols="auto">
          <p class="font-weight-black" style="font-family: Arial">Welcome</p>
        </v-col>
      </v-row>

      <v-row justify="center">
        <v-col cols="12">
          <v-autocomplete placeholder="Enter the name of your design" variant="outlined" />
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script lang="ts" setup></script>
<style scoped>
p {
  font-size: clamp(2rem, 3vw, 3rem);
}
</style>
