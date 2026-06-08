<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Button from 'primevue/button'

// 보호 라우트(meta.requiresAuth) 예시 화면 — 읽기 전용 내 정보 + 로그아웃 진입점.
// (프로필 "수정"은 #21 범위 밖. 가드 동작을 시연·검증할 최소 보호 페이지로 둔다.)
const router = useRouter()
const auth = useAuthStore()

onMounted(() => {
  if (!auth.user) auth.fetchMe().catch(() => {})
})

async function onLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <main class="profile">
    <h1>내 정보</h1>
    <dl v-if="auth.user">
      <dt>이메일</dt>
      <dd>{{ auth.user.email }}</dd>
      <dt>닉네임</dt>
      <dd>{{ auth.user.nickname }}</dd>
    </dl>
    <p v-else>프로필을 불러오는 중…</p>
    <Button label="로그아웃" severity="secondary" @click="onLogout" />
  </main>
</template>

<style scoped>
.profile {
  max-width: 480px;
  margin: 4rem auto;
}
.profile dl {
  display: grid;
  grid-template-columns: 6rem 1fr;
  gap: 0.5rem 1rem;
  margin: 1.5rem 0;
}
.profile dt {
  font-weight: 600;
}
</style>
