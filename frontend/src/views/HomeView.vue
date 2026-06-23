<script setup>
import { ref, onMounted } from 'vue'
import Button from 'primevue/button'
import instance from '@/api/instance'

// 스캐폴딩 확인용 홈 화면(공개). 인증 사용자는 router guard 에서 /trips 로 이동한다.
const health = ref('확인 전')

async function checkHealth() {
  health.value = '확인 중...'
  try {
    const { data } = await instance.get('/api/health')
    health.value = `백엔드 응답: ${data.code} (${data.data?.status})`
  } catch (e) {
    health.value = `연결 실패: ${e.message}`
  }
}

onMounted(checkHealth)
</script>

<template>
  <main class="home">
    <h1>TripLog</h1>
    <p>지도 기반 여행 계획 · 사진 기반 여행 기록 · AI 카드 생성</p>

    <nav class="auth-nav">
      <RouterLink to="/login">로그인</RouterLink>
      <RouterLink to="/signup">회원가입</RouterLink>
    </nav>

    <p class="health">{{ health }}</p>
    <Button label="헬스 체크 다시" icon="pi pi-refresh" @click="checkHealth" />
  </main>
</template>

<style scoped>
.home {
  max-width: 720px;
  margin: 4rem auto;
  text-align: center;
}
.health {
  color: var(--p-primary-color, #10b981);
  font-weight: 600;
}
.auth-nav {
  display: flex;
  gap: 1rem;
  justify-content: center;
  align-items: center;
  margin: 1.5rem 0;
}
</style>
