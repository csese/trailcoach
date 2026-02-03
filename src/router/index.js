import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: 'Dashboard' }
  },
  {
    path: '/calendar',
    name: 'calendar',
    component: () => import('@/views/CalendarView.vue'),
    meta: { title: 'Calendar' }
  },
  {
    path: '/phases',
    name: 'phases',
    component: () => import('@/views/PhaseView.vue'),
    meta: { title: 'Training Phases' }
  },
  {
    path: '/stats',
    name: 'stats',
    component: () => import('@/views/StatsView.vue'),
    meta: { title: 'Statistics' }
  },
  {
    path: '/adaptations',
    name: 'adaptations',
    component: () => import('@/views/AdaptationsView.vue'),
    meta: { title: 'Plan Adaptations' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Settings' }
  },
  {
    path: '/auth',
    name: 'auth',
    component: () => import('@/views/AuthView.vue'),
    meta: { title: 'Sign In' }
  },
  {
    path: '/auth/strava/callback',
    name: 'strava-callback',
    component: () => import('@/views/StravaCallbackView.vue'),
    meta: { title: 'Connecting Strava' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  document.title = `${to.meta.title || 'TrailCoach'} - TrailCoach`
  next()
})

export default router
