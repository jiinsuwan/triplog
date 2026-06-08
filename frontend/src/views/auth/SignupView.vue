<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const nickname = ref('')
const error = ref('')
const loading = ref(false)

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    await auth.signup(email.value, password.value, nickname.value)
    // 백엔드가 토큰을 주지 않으므로 가입 후 로그인 화면으로 유도.
    router.push({ path: '/login', query: { registered: '1' } })
  } catch (e) {
    error.value = e?.response?.data?.message ?? '회원가입에 실패했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth">
    <h1>회원가입</h1>
    <form @submit.prevent="onSubmit">
      <label>
        <span>이메일</span>
        <InputText v-model="email" type="email" autocomplete="email" required />
      </label>
      <label>
        <span>비밀번호 (8자 이상)</span>
        <Password v-model="password" toggleMask autocomplete="new-password" required />
      </label>
      <label>
        <span>닉네임</span>
        <InputText v-model="nickname" autocomplete="nickname" required />
      </label>
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <Button type="submit" label="회원가입" :loading="loading" />
    </form>
    <p>이미 계정이 있으신가요? <RouterLink to="/login">로그인</RouterLink></p>
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
