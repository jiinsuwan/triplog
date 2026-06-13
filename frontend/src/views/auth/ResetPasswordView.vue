<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { confirmPasswordReset } from '@/api/authApi'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'

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
  <main class="auth">
    <h1>비밀번호 재설정</h1>
    <Message v-if="!token" severity="error" :closable="false">
      재설정 링크가 유효하지 않습니다. 다시 요청해 주세요.
    </Message>
    <form v-else @submit.prevent="onSubmit">
      <label>
        <span>새 비밀번호</span>
        <Password v-model="password" toggleMask autocomplete="new-password" placeholder="8자 이상" required />
      </label>
      <label>
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
      <Button type="submit" label="비밀번호 변경" :loading="loading" />
    </form>
    <p v-if="failed || !token">
      <RouterLink to="/forgot-password">재설정 다시 요청하기</RouterLink>
    </p>
  </main>
</template>

<style scoped>
.auth {
  max-width: 420px;
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
