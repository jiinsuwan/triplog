<script setup>
import { ref } from 'vue'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'

import { requestPasswordReset } from '@/api/authApi'
import { AuthPassport, BaseButton } from '@/components/common'

const email = ref('')
const error = ref('')
const requested = ref(false)
const demoResetUrl = ref('')
const loading = ref(false)

async function onSubmit() {
  error.value = ''
  demoResetUrl.value = ''
  loading.value = true
  try {
    const result = await requestPasswordReset(email.value)
    requested.value = true
    demoResetUrl.value = result?.demoResetUrl ?? ''
  } catch (e) {
    error.value = e?.response?.data?.message ?? '재설정 요청을 처리하지 못했습니다.'
  } finally {
    loading.value = false
  }
}

function toLocalPath(url) {
  return url.replace(/^https?:\/\/[^/]+/, '')
}
</script>

<template>
  <AuthPassport
    title="비밀번호를 잊으셨나요?"
    subtitle="이메일을 입력하면 재설정 링크를 준비합니다."
    cover-title="비밀번호를<br>재설정해요"
    cover-subtitle="가입한 이메일로 다시 들어올 수 있는 경로를 안내해드려요."
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
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <Message v-if="requested" severity="success" :closable="false">
        계정이 존재하면 비밀번호 재설정 경로가 준비되었습니다.
      </Message>
      <section v-if="demoResetUrl" class="demo-box" aria-label="데모 재설정 링크">
        <strong>데모 재설정 링크</strong>
        <p>메일 인프라 없이 심사 시연을 이어가기 위한 링크입니다.</p>
        <RouterLink class="form-link" :to="toLocalPath(demoResetUrl)">비밀번호 재설정으로 이동</RouterLink>
      </section>
      <BaseButton type="submit" variant="primary" block :disabled="loading">
        {{ loading ? '요청 중' : '재설정 요청' }}
      </BaseButton>
    </form>

    <p class="links">
      <RouterLink class="form-link" to="/login">로그인으로 돌아가기</RouterLink>
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

.auth-field :deep(.p-inputtext) {
  background: var(--on-fill);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  box-shadow: none;
  color: var(--ink);
  font-family: inherit;
  font-size: 14px;
  padding: 11px 13px;
  width: 100%;
}

.auth-field :deep(.p-inputtext::placeholder) {
  color: var(--ink-faint);
}

.auth-field :deep(.p-inputtext:enabled:focus) {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(194, 105, 63, 0.16);
  outline: none;
}

.demo-box {
  background: var(--paper-dim);
  border: 1px dashed var(--line);
  border-radius: var(--radius-sm);
  padding: 13px;
}

.demo-box strong {
  color: var(--ink);
  font-size: 13px;
}

.demo-box p {
  color: var(--ink-sub);
  font-size: 12.5px;
  line-height: 1.55;
  margin: 5px 0 9px;
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
