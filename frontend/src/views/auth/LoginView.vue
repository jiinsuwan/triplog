<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'

import { startOAuthLogin } from '@/api/authApi'
import googleIcon from '@/assets/social/google-dark-round.svg'
import kakaoIcon from '@/assets/social/kakao-login-symbol.png'
import naverIcon from '@/assets/social/naver-green-icon.png'
import { AuthPassport, BaseButton } from '@/components/common'
import { AUTHENTICATED_ENTRY_PATH } from '@/router/entryPaths'
import { useAuthStore } from '@/stores/auth'

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
  { id: 'google', label: '구글', iconSrc: googleIcon },
  { id: 'naver', label: '네이버', iconSrc: naverIcon },
  { id: 'kakao', label: '카카오', iconSrc: kakaoIcon, modifier: 'kakao' },
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
  <AuthPassport
    title="다시 오셨네요"
    subtitle="로그인하고 하던 여행을 이어가요."
    cover-title="여행의 흔적을<br>한 곳에 기록해요"
  >
    <div class="message-stack">
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
    </div>

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
        <span class="field-label-row">
          <span>비밀번호</span>
          <RouterLink class="form-link" to="/forgot-password">비밀번호 찾기</RouterLink>
        </span>
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
      <BaseButton type="submit" variant="primary" block :disabled="loading">
        {{ loading ? '로그인 중' : '로그인' }}
      </BaseButton>
    </form>

    <div class="social-login" aria-label="소셜 로그인">
      <div class="social-divider" aria-hidden="true">
        <span></span>
        <strong>소셜 로그인</strong>
        <span></span>
      </div>
      <div class="social-icon-row">
        <button
          v-for="provider in socialProviders"
          :key="provider.id"
          type="button"
          :class="[
            'social-icon-button',
            provider.modifier && `social-icon-button--${provider.modifier}`,
          ]"
          :aria-label="`${provider.label}로 계속하기`"
          :title="`${provider.label}로 계속하기`"
          @click="onSocialLogin(provider.id)"
        >
          <span class="social-icon" aria-hidden="true">
            <img
              class="social-icon__image"
              :class="provider.modifier && `social-icon__image--${provider.modifier}`"
              :src="provider.iconSrc"
              alt=""
            />
          </span>
        </button>
      </div>
    </div>

    <p class="links">
      아직 계정이 없나요?
      <RouterLink class="form-link" to="/signup">회원가입</RouterLink>
    </p>
  </AuthPassport>
</template>

<style scoped>
.message-stack {
  display: grid;
  gap: 8px;
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

.auth-field > span,
.field-label-row {
  color: var(--ink-sub);
  font-size: 12.5px;
  font-weight: 600;
}

.field-label-row {
  align-items: baseline;
  display: flex;
  justify-content: space-between;
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

.social-login {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.social-divider {
  align-items: center;
  color: var(--ink-faint);
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr auto 1fr;
  margin: 2px 0 4px;
}

.social-divider span {
  border-top: 1px dashed var(--line-strong);
}

.social-divider strong {
  font-size: 11.5px;
  font-weight: 700;
}

.social-icon-row {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: center;
}

.social-icon-button {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 50%;
  box-shadow: 0 6px 15px -11px rgba(60, 40, 20, 0.7);
  cursor: pointer;
  display: flex;
  height: 46px;
  justify-content: center;
  padding: 0;
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
  width: 46px;
}

.social-icon-button:hover {
  box-shadow: 0 9px 18px -12px rgba(60, 40, 20, 0.72);
  transform: translateY(-1px);
}

.social-icon-button:focus-visible {
  box-shadow: 0 0 0 3px rgba(194, 105, 63, 0.2);
  outline: none;
}

.social-icon {
  align-items: center;
  border-radius: 50%;
  display: inline-flex;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  width: 100%;
}

.social-icon__image {
  display: block;
  height: 100%;
  object-fit: contain;
  width: 100%;
}

.social-icon__image--kakao {
  height: 30px;
  object-fit: contain;
  width: 30px;
}

.social-icon-button--kakao .social-icon {
  background: #fee500;
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
