<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Message from 'primevue/message'
import Password from 'primevue/password'

import { confirmPasswordReset } from '@/api/authApi'
import { AuthPassport, BaseButton } from '@/components/common'

const router = useRouter()
const route = useRoute()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const password = ref('')
const passwordConfirm = ref('')
const error = ref('')
const loading = ref(false)
const failed = ref(false)

async function onSubmit() {
  error.value = ''
  failed.value = false
  if (!token.value) {
    failed.value = true
    error.value = '재설정 링크가 유효하지 않습니다. 다시 요청해 주세요.'
    return
  }
  if (password.value !== passwordConfirm.value) {
    error.value = '비밀번호가 일치하지 않습니다.'
    return
  }
  loading.value = true
  try {
    await confirmPasswordReset(token.value, password.value)
    router.push({ path: '/login', query: { reset: '1' } })
  } catch (e) {
    failed.value = true
    error.value = e?.response?.data?.message ?? '비밀번호 재설정을 완료할 수 없습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthPassport
    title="새 비밀번호를 정해주세요"
    subtitle="다시 들어올 수 있도록 비밀번호를 재설정합니다."
    cover-title="비밀번호를<br>재설정해요"
    cover-subtitle="새 비밀번호로 여행 기록장에 다시 들어오세요."
  >
    <Message v-if="!token" severity="error" :closable="false" class="top-message">
      재설정 링크가 유효하지 않습니다. 다시 요청해 주세요.
    </Message>

    <form v-else class="auth-form" @submit.prevent="onSubmit">
      <label class="auth-field">
        <span>새 비밀번호</span>
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
        <span>새 비밀번호 확인</span>
        <Password
          v-model="passwordConfirm"
          :feedback="false"
          toggleMask
          autocomplete="new-password"
          placeholder="한 번 더 입력"
          required
        />
      </label>
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <BaseButton type="submit" variant="primary" block :disabled="loading">
        {{ loading ? '변경 중' : '비밀번호 변경' }}
      </BaseButton>
    </form>

    <p v-if="failed || !token" class="links">
      <RouterLink class="form-link" to="/forgot-password">재설정 다시 요청하기</RouterLink>
    </p>
  </AuthPassport>
</template>

<style scoped>
.top-message {
  margin-bottom: 14px;
}

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
  margin: 18px 0 0;
  text-align: center;
}
</style>
