import { createRouter, createWebHistory } from 'vue-router'
import AuthenticationLayout from '@/layouts/AuthenticationLayout.vue'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import SignupPage from '../pages/SignupPage.vue'
import StartPage from '../pages/StartPage.vue'
import ColorContentPage from '@/pages/ColorContentPage.vue'
import EditTokenPage from '@/pages/EditTokenPage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import HomePage from '@/pages/HomePage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AuthenticationLayout,
      children: [
        { path: '', name: 'home', component: HomePage },
        { path: 'SignUpPage', name: 'signup', component: SignupPage },
        { path: 'LoginPage', name: 'login', component: LoginPage },
        { path: 'StartPage', name: 'start', component: StartPage, meta: { requiresAuth: true } },
      ],
    },
    {
      path: '/',
      component: DefaultLayout,
      children: [
        {
          path: 'ColorContentPage',
          name: 'colors',
          component: ColorContentPage,
          meta: { requiresAuth: true },
        },
        { path: 'EditTokenPage', name: 'edit', component: EditTokenPage },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'signup' } },
  ],
})

async function isAuthed(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/check', {})
    return res.ok
  } catch {
    return false
  }
}

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const ok = await isAuthed()
  if (ok) return true

  return { name: 'login', query: { redirect: to.fullPath } }
})

export default router
