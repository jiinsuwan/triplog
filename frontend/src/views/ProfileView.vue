<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import Password from 'primevue/password'

// 보호 라우트(meta.requiresAuth) 예시 화면 — 읽기 전용 내 정보 + 로그아웃 진입점.
// (프로필 "수정"은 #21 범위 밖. 가드 동작을 시연·검증할 최소 보호 페이지로 둔다.)
const router = useRouter()
const auth = useAuthStore()
const withdrawVisible = ref(false)
const withdrawPassword = ref('')
const withdrawError = ref('')
const withdrawing = ref(false)

onMounted(() => {
  if (!auth.user) auth.fetchMe().catch(() => {})
})

async function onLogout() {
  await auth.logout()
  router.push('/login')
}

function openWithdraw() {
  withdrawPassword.value = ''
  withdrawError.value = ''
  withdrawVisible.value = true
}

function closeWithdraw() {
  if (withdrawing.value) return
  withdrawVisible.value = false
  withdrawPassword.value = ''
  withdrawError.value = ''
}

async function onWithdraw() {
  withdrawError.value = ''
  withdrawing.value = true
  try {
    await auth.withdraw(withdrawPassword.value)
    withdrawVisible.value = false
    withdrawPassword.value = ''
    router.replace({ path: '/login', query: { withdrawn: '1' } })
  } catch (e) {
    withdrawError.value = e?.response?.data?.message ?? '회원 탈퇴에 실패했습니다.'
  } finally {
    withdrawing.value = false
  }
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

    <section class="danger-zone">
      <h2>회원 탈퇴</h2>
      <p>계정과 여행, 일정, 사진 기록이 삭제됩니다.</p>
      <Button label="회원 탈퇴" severity="danger" outlined @click="openWithdraw" />
    </section>

    <Dialog
      v-model:visible="withdrawVisible"
      modal
      header="회원 탈퇴"
      :style="{ width: 'min(28rem, 92vw)' }"
      @hide="closeWithdraw"
    >
      <form class="withdraw-form" @submit.prevent="onWithdraw">
        <p>탈퇴하려면 현재 비밀번호를 입력하세요.</p>
        <label>
          <span>현재 비밀번호</span>
          <Password
            v-model="withdrawPassword"
            :feedback="false"
            toggleMask
            autocomplete="current-password"
            required
          />
        </label>
        <Message v-if="withdrawError" severity="error" :closable="false">{{ withdrawError }}</Message>
        <div class="dialog-actions">
          <Button type="button" label="취소" severity="secondary" text @click="closeWithdraw" />
          <Button type="submit" label="탈퇴" severity="danger" :loading="withdrawing" />
        </div>
      </form>
    </Dialog>
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
.danger-zone {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;
}
.danger-zone h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}
.danger-zone p {
  margin: 0 0 1rem;
  color: #6b7280;
}
.withdraw-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.withdraw-form label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
