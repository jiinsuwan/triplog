<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'

import { AuthPassport, BaseButton } from '@/components/common'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const nickname = ref('')
const error = ref('')
const loading = ref(false)

async function onSubmit() {
  error.value = ''
  // 클라이언트 1차 검증: 비밀번호 확인 일치. (길이 등 상세 규칙은 백엔드 검증 메시지로)
  if (password.value !== passwordConfirm.value) {
    error.value = '비밀번호가 일치하지 않습니다.'
    return
  }
  loading.value = true
  try {
    await auth.signup(email.value, password.value, nickname.value)
    // 백엔드가 토큰을 주지 않으므로 가입 후 로그인 화면으로 유도(registered 플래그로 안내).
    router.push({ path: '/login', query: { registered: '1' } })
  } catch (e) {
    error.value = e?.response?.data?.message ?? '회원가입에 실패했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthPassport
    title="함께 시작해요"
    subtitle="이메일과 비밀번호로 가입합니다."
    cover-title="첫 여행을<br>등록할 차례예요"
    cover-subtitle="계정을 만들면 계획·기록·추억이 한 권에 모입니다."
  >
    <form class="auth-form" @submit.prevent="onSubmit">
      <label class="auth-field">
        <span>이메일</span>
        <InputText
          v-model="email"
          type="email"
          autocomplete="email"
          placeholder="you@triplog.kr"
          required
        />
      </label>
      <label class="auth-field">
        <span>닉네임</span>
        <InputText v-model="nickname" autocomplete="nickname" placeholder="여행자 이름" required />
      </label>
      <label class="auth-field">
        <span>비밀번호</span>
        <Password
          v-model="password"
          :feedback="false"
          toggleMask
          autocomplete="new-password"
          placeholder="8자 이상"
          required
        />
      </label>
      <label class="auth-field">
        <span>비밀번호 확인</span>
        <Password
          v-model="passwordConfirm"
          :feedback="false"
          toggleMask
          autocomplete="new-password"
          placeholder="다시 입력"
          required
        />
      </label>
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <BaseButton type="submit" variant="primary" block :disabled="loading">
        {{ loading ? '가입 중' : '회원가입' }}
      </BaseButton>
    </form>

    <p class="links">
      이미 계정이 있나요?
      <RouterLink class="form-link" to="/login">로그인</RouterLink>
    </p>
  </AuthPassport>
</template>

<style scoped>
.auth-form {
  display: grid;
  gap: 15px;
}

.auth-field {
  display: grid;
  gap: 6px;
}

.auth-field > span {
  color: var(--ink-sub);
  font-size: 12.5px;
  font-weight: 600;
}

.auth-field :deep(.p-inputtext),
.auth-field :deep(.p-password),
.auth-field :deep(.p-password-input) {
  width: 100%;
}

.auth-field :deep(.p-inputtext) {
  background: var(--on-fill);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  box-shadow: none;
  color: var(--ink);
  font-family: inherit;
  font-size: 14px;
  padding: 11px 13px;
}

.auth-field :deep(.p-inputtext::placeholder) {
  color: var(--ink-faint);
}

.auth-field :deep(.p-inputtext:enabled:focus) {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(194, 105, 63, 0.16);
  outline: none;
}

.form-link {
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
}

.form-link:hover {
  text-decoration: underline;
}

.links {
  color: var(--ink-sub);
  font-size: 12.5px;
  margin: 18px 0 0;
  text-align: center;
}

.links .form-link {
  margin-left: 4px;
}
</style>
