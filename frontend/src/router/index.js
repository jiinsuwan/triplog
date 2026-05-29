import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

// 라우터 골격 (architecture §3, 공유 영역). 트랙별 라우트는 각 담당자가
// 자기 트랙 폴더(views/trip, views/log, views/auth)에 추가한다.
const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
