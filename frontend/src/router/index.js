import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/stores/auth'
import TripCreateView from '@/views/trip/TripCreateView.vue'
import TripDetailView from '@/views/trip/TripDetailView.vue'
import TripListView from '@/views/trip/TripListView.vue'
import PhotoView from '@/views/log/PhotoView.vue'
import { useTripStore } from '@/stores/trip'
import { isPastTripStatus } from '@/utils/tripStatus'

// 라우터 (architecture §3, 공유 영역).
//
// 보호 라우트 컨벤션 (트랙 공통 — agent·팀원은 이 규칙을 따른다):
//   - 가드는 "명시적 보호" 방식이다. 로그인이 필요한 라우트는 meta: { requiresAuth: true } 를 붙인다.
//   - meta 표시가 없는 라우트는 공개로 취급한다(누락 시 보호되지 않으니 주의).
//   - 각 트랙(trip/log)은 자기 보호 라우트에 requiresAuth 를 직접 명시한다.
const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/login', name: 'login', component: () => import('@/views/auth/LoginView.vue') },
  { path: '/signup', name: 'signup', component: () => import('@/views/auth/SignupView.vue') },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/trips',
    name: 'trip-list',
    component: TripListView,
    meta: { requiresAuth: true },
  },
  {
    path: '/trips/new',
    name: 'trip-create',
    component: TripCreateView,
    meta: { requiresAuth: true },
  },
  {
    path: '/trips/:tripId/places',
    name: 'trip-place-search',
    component: () => import('@/views/trip/TripPlaceSearchView.vue'),
    meta: { requiresAuth: true, workspace: 'planning' },
  },
  {
    path: '/trips/:tripId/plan',
    name: 'trip-plan-workspace',
    redirect: (to) => ({ name: 'trip-place-search', params: to.params }),
    meta: { requiresAuth: true, workspace: 'planning' },
  },
  {
    path: '/trips/:tripId/log',
    name: 'trip-record-workspace',
    redirect: (to) => ({ name: 'trip-photos', params: to.params }),
    meta: { requiresAuth: true, workspace: 'record' },
  },
  {
    path: '/trips/:tripId',
    name: 'trip-detail',
    component: TripDetailView,
    meta: { requiresAuth: true },
  },
  {
    // 여행에 사진을 올리는 화면 (log 트랙, S2-LOG-05). 자기 트랙 라우트 추가.
    path: '/trips/:tripId/photos',
    name: 'trip-photos',
    component: PhotoView,
    meta: { requiresAuth: true, workspace: 'record' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// 이미 로그인한 사용자가 다시 볼 필요 없는 공개 인증 화면.
const GUEST_ONLY_PATHS = ['/login', '/signup']

// 인증 가드. 단위 테스트를 위해 분리해 export 한다(반환값 = vue-router 네비게이션 결과).
export function authGuard(to) {
  const auth = useAuthStore()

  // 보호 라우트인데 미인증 → 로그인으로(돌아올 경로를 redirect 쿼리에 보존).
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 이미 로그인한 사용자가 로그인/회원가입 접근 → 홈으로.
  if (GUEST_ONLY_PATHS.includes(to.path) && auth.isAuthenticated) {
    return { path: '/' }
  }

  return workspaceGuard(to)
}

router.beforeEach((to) => authGuard(to))

export default router

function workspaceGuard(to) {
  const workspace = to.meta.workspace
  const tripId = to.params?.tripId
  if (!workspace || !tripId) {
    return true
  }

  const tripStore = useTripStore()
  const cachedTrip = findCachedTrip(tripStore, tripId)
  if (cachedTrip) {
    return workspaceRedirect(to, workspace, cachedTrip.status)
  }

  return tripStore
    .fetchTripDetail(tripId)
    .then((trip) => workspaceRedirect(to, workspace, trip.status))
    .catch(() => true)
}

function findCachedTrip(tripStore, tripId) {
  const numericTripId = Number(tripId)
  if (tripStore.selectedTrip?.id === numericTripId) {
    return tripStore.selectedTrip
  }
  return tripStore.trips.find((trip) => trip.id === numericTripId)
}

function workspaceRedirect(to, workspace, status) {
  const targetWorkspace = isPastTripStatus(status) ? 'record' : 'planning'
  if (workspace === targetWorkspace) {
    return true
  }

  return {
    name: targetWorkspace === 'record' ? 'trip-record-workspace' : 'trip-plan-workspace',
    params: to.params,
    replace: true,
  }
}
