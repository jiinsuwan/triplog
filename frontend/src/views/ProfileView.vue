<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Message from 'primevue/message'
import Password from 'primevue/password'

import { AppTopBar, BaseButton, BaseModal } from '@/components/common'
import { useAuthStore } from '@/stores/auth'

// 보호 라우트(meta.requiresAuth) 예시 화면 — 읽기 전용 내 정보 + 로그아웃 진입점.
// (프로필 "수정"은 #21 범위 밖. 가드 동작을 시연·검증할 최소 보호 페이지로 둔다.)
const router = useRouter()
const auth = useAuthStore()
const withdrawVisible = ref(false)
const withdrawPassword = ref('')
const withdrawError = ref('')
const withdrawing = ref(false)
const requiresWithdrawPassword = computed(() => auth.user?.hasPassword !== false)
const userInitial = computed(() => (auth.user?.nickname || auth.user?.email || 'T').slice(0, 1).toUpperCase())

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
    await auth.withdraw(requiresWithdrawPassword.value ? withdrawPassword.value : null)
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
  <div class="profile-page">
    <AppTopBar active="trips" :show-search="false">
      <template #actions>
        <BaseButton variant="ghost" @click="router.push('/trips')">여행 목록</BaseButton>
      </template>
    </AppTopBar>

    <main class="profile-scene">
      <section class="modal profile-card">
        <header class="p-head">
          <div class="avatar-lg">{{ userInitial }}</div>
          <div>
            <div class="p-name">{{ auth.user?.nickname ?? '여행자' }}</div>
            <div class="p-email">{{ auth.user?.email ?? '프로필을 불러오는 중...' }}</div>
          </div>
        </header>

        <section class="p-body">
          <div class="field">
            <label>닉네임</label>
            <div class="input-row">
              <input class="input" :value="auth.user?.nickname ?? ''" readonly>
              <span class="form-link muted">수정</span>
            </div>
          </div>

          <div class="field">
            <label>이메일</label>
            <input class="input read" :value="auth.user?.email ?? '확인 중'" readonly>
          </div>

          <div class="field">
            <label>비밀번호</label>
            <div class="input-row">
              <input class="input read" type="password" value="password" readonly>
              <span class="form-link muted">변경</span>
            </div>
          </div>

          <div class="p-foot">
            <button class="danger-link" type="button" @click="openWithdraw">회원 탈퇴</button>
            <BaseButton @click="onLogout">로그아웃</BaseButton>
          </div>
        </section>
      </section>
    </main>

    <BaseModal v-model="withdrawVisible" title="정말 탈퇴하시겠어요?">
      <form class="withdraw-form" @submit.prevent="onWithdraw">
        <p>
          탈퇴하면 <b>모든 여행·사진·추억 카드가 영구 삭제</b>됩니다. 되돌릴 수 없어요.
        </p>
        <label v-if="requiresWithdrawPassword" class="field">
          <span>비밀번호 확인</span>
          <Password
            v-model="withdrawPassword"
            :feedback="false"
            toggleMask
            autocomplete="current-password"
            required
          />
        </label>
        <p v-else class="social-copy">소셜 로그인 계정은 현재 로그인 상태를 확인한 뒤 탈퇴합니다.</p>
        <Message v-if="withdrawError" severity="error" :closable="false">{{ withdrawError }}</Message>
        <div class="confirm-foot">
          <BaseButton type="button" variant="ghost" :disabled="withdrawing" @click="closeWithdraw">
            취소
          </BaseButton>
          <BaseButton type="submit" variant="danger" :disabled="withdrawing">
            {{ withdrawing ? '탈퇴 중' : '탈퇴하기' }}
          </BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>

<style scoped>
.profile-page {
  min-height: 100vh;
}

.profile-scene {
  display: grid;
  min-height: calc(100vh - 54px);
  padding: 46px 20px 80px;
  place-items: start center;
}

.profile-card {
  width: min(540px, 100%);
}

.p-head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 18px;
  justify-content: center;
  padding: 36px 42px 30px;
}

.avatar-lg {
  background: linear-gradient(135deg, #e9c39f, var(--accent));
  border-radius: 50%;
  color: var(--on-fill);
  display: grid;
  flex: 0 0 auto;
  font-size: 31px;
  font-weight: 700;
  height: 78px;
  place-items: center;
  width: 78px;
}

.p-name {
  color: var(--ink);
  font-size: 23px;
  font-weight: 800;
  letter-spacing: 0;
}

.p-email {
  color: var(--ink-sub);
  font-size: 13px;
  margin-top: 4px;
}

.p-body {
  align-items: center;
  display: flex;
  flex-direction: column;
  padding: 30px 42px 36px;
}

.p-body .field,
.p-foot {
  max-width: 340px;
  width: 100%;
}

.input-row {
  position: relative;
}

.input-row .input {
  padding-right: 54px;
}

.input-row .form-link {
  position: absolute;
  right: 13px;
  top: 50%;
  transform: translateY(-50%);
}

.input.read {
  background: var(--bg);
  color: var(--ink-sub);
}

.form-link {
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
}

.form-link.muted {
  color: var(--ink-faint);
}

.p-foot {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
}

.danger-link {
  background: transparent;
  border: 0;
  color: var(--complete);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 600;
  padding: 0;
  text-decoration: none;
}

.withdraw-form {
  display: grid;
  gap: 16px;
}

.withdraw-form p {
  color: var(--ink-sub);
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
}

.withdraw-form p b {
  color: var(--ink);
}

.withdraw-form :deep(.p-password),
.withdraw-form :deep(.p-password-input) {
  width: 100%;
}

.social-copy {
  background: var(--paper-dim);
  border: 1px dashed var(--line);
  border-radius: var(--radius-sm);
  padding: 12px;
}

.confirm-foot {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

@media (max-width: 640px) {
  .profile-scene {
    padding: 24px 16px 64px;
  }

  .p-head,
  .p-body {
    padding-left: 24px;
    padding-right: 24px;
  }
}
</style>
