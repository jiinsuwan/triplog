import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/stores/auth'
import TripCreateView from '@/views/trip/TripCreateView.vue'
import TripDetailView from '@/views/trip/TripDetailView.vue'
import TripListView from '@/views/trip/TripListView.vue'
import PhotoView from '@/views/log/PhotoView.vue'
import { useTripStore } from '@/stores/trip'
import { isPastTripStatus } from '@/utils/tripStatus'
import { AUTHENTICATED_ENTRY_PATH } from '@/router/entryPaths'

// 라우터 (architecture §3, 공유 영역).
//
// 보호 라우트 컨벤션 (트랙 공통 — agent·팀원은 이 규칙을 따른다):
//   - 가드는 "명시적 보호" 방식이다. 로그인이 필요한 라우트는 meta: { requiresAuth: true } 를 붙인다.
//   - meta 표시가 없는 라우트는 공개로 취급한다(누락 시 보호되지 않으니 주의).
//   - 단, 인증 사용자가 / 또는 guest-only 인증 화면에 접근하면 기본 진입점으로 보낸다.
//   - 각 트랙(trip/log)은 자기 보호 라우트에 requiresAuth 를 직접 명시한다.
const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/login', name: 'login', component: () => import('@/views/auth/LoginView.vue') },
  { path: '/signup', name: 'signup', component: () => import('@/views/auth/SignupView.vue') },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/views/auth/ForgotPasswordView.vue'),
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('@/views/auth/ResetPasswordView.vue'),
  },
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
    redirect: (to) => ({
      name: 'trip-place-search',
      params: to.params,
      query: to.query,
    }),
    meta: { requiresAuth: true, workspace: 'planning' },
  },
  {
    // 기록 워크스페이스 진입 = 카드 만들기(배치) 화면 직행. 사진 업로드는 그 화면에서 모달로 한다
    //   (업로드 전용 화면을 먼저 거치지 않아 "기존 사진 모르고 또 올려 중복" 되던 문제 해소).
    path: '/trips/:tripId/log',
    name: 'trip-record-workspace',
    redirect: (to) => ({ name: 'card-create', query: { tripId: to.params.tripId } }),
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
  {
    // 사진을 일정에 배치하는 화면은 카드 만들기 1단계로 통합됨(log 트랙).
    // 옛 경로(/trips/:id/record)는 카드 만들기 흐름으로 리다이렉트한다.
    path: '/trips/:tripId/record',
    name: 'trip-record',
    redirect: (to) => ({ name: 'card-create', query: { tripId: to.params.tripId } }),
    meta: { requiresAuth: true },
  },
  {
    // 카드 생성 위저드 (log 트랙, S3-LOG-06). 단일 라우트 + ?step= 쿼리.
    // tripId 는 path 가 아닌 query 로 받으므로 workspaceGuard(params.tripId 기준)는 여기서 동작하지 않는다.
    //   이는 의도된 동작이다 — 카드 생성은 trip status(planning/record)로 게이트하지 않고,
    //   "사진이 있으면" 만든다(사진 0이면 화면이 빈 상태로 안내). 'record' 는 분류 라벨일 뿐
    //   접근 제어 수단이 아니다. (PR #100 리뷰 P2: planning trip 우회 경로 우려 → 의도 명시)
    path: '/cards/new',
    name: 'card-create',
    component: () => import('@/views/log/CardCreateView.vue'),
    meta: { requiresAuth: true, workspace: 'record' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// 이미 로그인한 사용자가 다시 볼 필요 없는 공개 인증 화면.
const GUEST_ONLY_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password']

// 인증 가드. 단위 테스트를 위해 분리해 export 한다(반환값 = vue-router 네비게이션 결과).
export function authGuard(to) {
  const auth = useAuthStore()

  // 보호 라우트인데 미인증 → 로그인으로(돌아올 경로를 redirect 쿼리에 보존).
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 이미 로그인한 사용자의 기본 진입점은 여행 목록이다.
  if (auth.isAuthenticated && (to.path === '/' || GUEST_ONLY_PATHS.includes(to.path))) {
    return { path: AUTHENTICATED_ENTRY_PATH }
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

  const redirect = {
    name: targetWorkspace === 'record' ? 'trip-record-workspace' : 'trip-place-search',
    params: to.params,
    replace: true,
  }
  if (Object.keys(to.query ?? {}).length > 0) {
    redirect.query = to.query
  }
  return redirect
}
