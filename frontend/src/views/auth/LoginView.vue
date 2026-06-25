<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'

import { startOAuthLogin } from '@/api/authApi'
import { AuthPassport, BaseButton, BaseModal } from '@/components/common'
import { AUTHENTICATED_ENTRY_PATH } from '@/router/entryPaths'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const isSocialDialogOpen = ref(false)
const justRegistered = route.query.registered === '1'
const justReset = route.query.reset === '1'
const justWithdrawn = route.query.withdrawn === '1'
const oauthError = route.query.oauthError

const socialProviders = [
  { id: 'kakao', label: '카카오', description: '카카오 계정으로 계속하기', class: 'kakao' },
  { id: 'google', label: '구글', description: '구글 계정으로 계속하기', class: 'google' },
  { id: 'naver', label: '네이버', description: '네이버 계정으로 계속하기', class: 'naver' },
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

function openSocialDialog() {
  isSocialDialogOpen.value = true
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
      <BaseButton type="button" block @click="openSocialDialog">소셜 계정으로 계속하기</BaseButton>
    </div>

    <BaseModal v-model="isSocialDialogOpen" title="소셜 로그인 선택">
      <p class="social-dialog__lead">사용할 소셜 계정을 선택해주세요.</p>
      <div class="social-dialog__list">
        <button
          v-for="provider in socialProviders"
          :key="provider.id"
          type="button"
          :class="['social-button', `social-button--${provider.class}`]"
          @click="onSocialLogin(provider.id)"
        >
          <span class="social-button__mark">{{ provider.label.slice(0, 1) }}</span>
          <span class="social-button__text">
            <strong>{{ provider.label }}</strong>
            <small>{{ provider.description }}</small>
          </span>
        </button>
      </div>
      <template #footer>
        <BaseButton size="small" variant="ghost" @click="isSocialDialogOpen = false">닫기</BaseButton>
      </template>
    </BaseModal>

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
  gap: 8px;
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

.social-dialog__lead {
  color: var(--ink-sub);
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 12px;
}

.social-dialog__list {
  display: grid;
  gap: 10px;
}

.social-button {
  align-items: center;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  font-size: 13px;
  font-weight: 700;
  gap: 12px;
  justify-content: flex-start;
  min-height: 58px;
  padding: 10px 13px;
  text-align: left;
  width: 100%;
}

.social-button:focus-visible {
  box-shadow: 0 0 0 3px rgba(194, 105, 63, 0.2);
  outline: none;
}

.social-button__mark {
  align-items: center;
  border-radius: 50%;
  display: inline-flex;
  flex: 0 0 34px;
  font-size: 15px;
  height: 34px;
  justify-content: center;
  width: 34px;
}

.social-button__text {
  display: grid;
  gap: 2px;
}

.social-button__text strong {
  color: inherit;
  font-size: 14px;
}

.social-button__text small {
  color: currentColor;
  font-size: 12px;
  font-weight: 500;
  opacity: 0.72;
}

.social-button--kakao {
  background: #fee500;
  border-color: #fee500;
  color: #191919;
}

.social-button--kakao .social-button__mark {
  background: rgba(0, 0, 0, 0.12);
}

.social-button--google {
  background: #fff;
  border-color: #dadce0;
  color: #202124;
}

.social-button--google .social-button__mark {
  background: #f1f3f4;
}

.social-button--naver {
  background: #03c75a;
  border-color: #03c75a;
  color: #fff;
}

.social-button--naver .social-button__mark {
  background: rgba(255, 255, 255, 0.18);
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
