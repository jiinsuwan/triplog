<script setup>
import { ref } from 'vue'
import { requestPasswordReset } from '@/api/authApi'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'

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
  <main class="auth">
    <h1>비밀번호 찾기</h1>
    <p class="intro">가입한 이메일을 입력하면 재설정 경로를 준비합니다.</p>
    <form @submit.prevent="onSubmit">
      <label>
        <span>이메일</span>
        <InputText v-model="email" type="email" autocomplete="email" placeholder="you@triplog.app" required />
      </label>
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <Message v-if="requested" severity="success" :closable="false">
        계정이 존재하면 비밀번호 재설정 경로가 준비되었습니다.
      </Message>
      <section v-if="demoResetUrl" class="demo-box" aria-label="데모 재설정 링크">
        <strong>데모 재설정 링크</strong>
        <p>메일 인프라 없이 심사 시연을 이어가기 위한 링크입니다.</p>
        <RouterLink :to="toLocalPath(demoResetUrl)">비밀번호 재설정으로 이동</RouterLink>
      </section>
      <Button type="submit" label="재설정 요청" :loading="loading" />
    </form>
    <p><RouterLink to="/login">로그인으로 돌아가기</RouterLink></p>
  </main>
</template>

<style scoped>
.auth {
  max-width: 420px;
  margin: 4rem auto;
}
.intro {
  color: #475569;
}
.auth form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.auth label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.demo-box {
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;
  padding: 1rem;
}
.demo-box p {
  margin: 0.35rem 0 0.75rem;
  color: #475569;
}
</style>
