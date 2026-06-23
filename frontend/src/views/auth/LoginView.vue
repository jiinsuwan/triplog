<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { startOAuthLogin } from '@/api/authApi'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { AUTHENTICATED_ENTRY_PATH } from '@/router/entryPaths'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const justRegistered = route.query.registered === '1'
const justReset = route.query.reset === '1'
const justWithdrawn = route.query.withdrawn === '1'
const oauthError = route.query.oauthError

const socialProviders = [
  { id: 'kakao', label: '카카오로 계속하기', class: 'kakao' },
  { id: 'google', label: '구글로 계속하기', class: 'google' },
  { id: 'naver', label: '네이버로 계속하기', class: 'naver' },
]

async function onSubmit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    const redirect =
      typeof route.query.redirect === 'string' ? route.query.redirect : AUTHENTICATED_ENTRY_PATH
    router.push(redirect)
  } catch (e) {
    error.value = e?.response?.data?.message ?? '로그인에 실패했습니다.'
  } finally {
    loading.value = false
  }
}

function onSocialLogin(provider) {
  const redirect =
    typeof route.query.redirect === 'string' ? route.query.redirect : AUTHENTICATED_ENTRY_PATH
  startOAuthLogin(provider, redirect)
}

function oauthErrorMessage(reason) {
  if (reason === 'cancelled') return '소셜 로그인이 취소되었습니다.'
  if (reason === 'email_conflict') return '이미 같은 이메일로 가입된 계정이 있습니다.'
  return '소셜 로그인에 실패했습니다. 다시 시도해주세요.'
}
</script>

<template>
  <main class="auth">
    <h1>로그인</h1>
    <Message v-if="justRegistered" severity="success" :closable="false">
      회원가입이 완료되었습니다. 로그인해 주세요.
    </Message>
    <Message v-if="justReset" severity="success" :closable="false">
      비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해 주세요.
    </Message>
    <Message v-if="justWithdrawn" severity="success" :closable="false">
      회원 탈퇴가 완료되었습니다.
    </Message>
    <Message v-if="oauthError" severity="error" :closable="false">
      {{ oauthErrorMessage(oauthError) }}
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
      <RouterLink class="forgot-link" to="/forgot-password">비밀번호를 잊으셨나요?</RouterLink>
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <Button type="submit" label="로그인" :loading="loading" />
    </form>
    <div class="social-login" aria-label="소셜 로그인">
      <Button
        v-for="provider in socialProviders"
        :key="provider.id"
        type="button"
        :label="provider.label"
        :class="['social-button', provider.class]"
        @click="onSocialLogin(provider.id)"
      />
    </div>
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
.forgot-link {
  align-self: flex-end;
  color: #2563eb;
  font-size: 0.9rem;
  text-decoration: none;
}
.forgot-link:hover {
  text-decoration: underline;
}
.social-login {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
}
.social-button {
  width: 100%;
}
.social-button.kakao {
  background: #fee500;
  border-color: #fee500;
  color: #191919;
}
.social-button.google {
  background: #ffffff;
  border-color: #dadce0;
  color: #202124;
}
.social-button.naver {
  background: #03c75a;
  border-color: #03c75a;
  color: #ffffff;
}
</style>
