import { createRouter, createWebHistory } from 'vue-router'
import AuthenticationLayout from '@/layouts/AuthenticationLayout.vue'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import SignupPage from '../pages/SignupPage.vue'
import StartPage from '../pages/StartPage.vue'
import TokenTypeContentPage from '@/pages/TokenTypeContentPage.vue'
import EditTokenPage from '@/pages/EditTokenPage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import HomePage from '@/pages/HomePage.vue'
import { getTokenTypeDefinitionByNavPath } from '@/utils/dtcg/token-types'

const API_URL = import.meta.env.VITE_API_URL

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
          path: 'tokens/:tokenType',
          name: 'token-type',
          component: TokenTypeContentPage,
          meta: { requiresAuth: true },
          beforeEnter: (to) => {
            const segment = String(to.params.tokenType ?? '')
            if (!getTokenTypeDefinitionByNavPath(segment)) {
              return { name: 'token-type', params: { tokenType: 'color' } }
            }
            return true
          },
        },
        // Bookmark / deep-link compatibility (Stage 11).
        {
          path: 'ColorContentPage',
          redirect: { name: 'token-type', params: { tokenType: 'color' } },
        },
        { path: 'EditTokenPage', name: 'edit', component: EditTokenPage },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'signup' } },
  ],
})

async function isAuthed(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/check`, {
      credentials: 'include',
    })
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
