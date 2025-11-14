import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import App from './App.vue'
import router from './router/routes'

import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
ModuleRegistry.registerModules([AllCommunityModule])

const app = createApp(App)

const vuetify = createVuetify({
  components,
  directives,
})
app.use(vuetify)
app.use(router)
app.use(createPinia())

import { AgGridVue } from 'ag-grid-vue3'
app.component('ag-grid-vue', AgGridVue)

app.mount('#app')
