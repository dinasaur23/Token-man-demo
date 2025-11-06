import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import App from './App.vue'
import router from './router/routes'

const app = createApp(App)

const vuetify = createVuetify({
  components,
  directives,
})
app.use(vuetify)

app.use(router)
app.use(createPinia())
app.mount('#app')
