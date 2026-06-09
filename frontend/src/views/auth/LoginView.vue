<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
// 회원가입 직후 넘어온 경우 안내(가입 → 로그인 유도 플로우).
const justRegistered = route.query.registered === '1'

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    // 보호 라우트에서 튕겨온 경우 그 경로로, 아니면 여행 목록으로.
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/trips'
    router.push(redirect)
  } catch (e) {
    error.value = e?.response?.data?.message ?? '로그인에 실패했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth">
    <h1>로그인</h1>
    <Message v-if="justRegistered" severity="success" :closable="false">
      회원가입이 완료되었습니다. 로그인해 주세요.
    </Message>
    <form @submit.prevent="onSubmit">
      <label>
        <span>이메일</span>
        <InputText v-model="email" type="email" autocomplete="email" placeholder="you@triplog.app" required />
      </label>
      <label>
        <span>비밀번호</span>
        <Password
          v-model="password"
          :feedback="false"
          toggleMask
          autocomplete="current-password"
          placeholder="비밀번호"
          required
        />
      </label>
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <Button type="submit" label="로그인" :loading="loading" />
    </form>
    <p>계정이 없으신가요? <RouterLink to="/signup">회원가입</RouterLink></p>
  </main>
</template>

<style scoped>
.auth {
  max-width: 360px;
  margin: 4rem auto;
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
</style>
