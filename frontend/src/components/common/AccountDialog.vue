<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import BaseModal from './BaseModal.vue'
import BaseButton from './BaseButton.vue'
import { validateNickname, extractApiMessage } from './accountValidation.js'

// 프로필/계정 팝업 (core 공유, 디자인 정본 = docs/design/profile-mockup.html).
// 상단바 아바타 클릭 → 이 팝업. 닉네임은 인라인 수정, 회원 탈퇴는 확인 팝업으로 분기한다.
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const auth = useAuthStore()

// 닉네임 인라인 편집 상태
const editingNickname = ref(false)
const nicknameDraft = ref('')
const savingNickname = ref(false)
const nicknameError = ref('')

// 회원 탈퇴 확인 팝업 상태
const withdrawVisible = ref(false)
const withdrawPassword = ref('')
const withdrawError = ref('')
const withdrawing = ref(false)
const requiresWithdrawPassword = computed(() => auth.user?.hasPassword !== false)

const userInitial = computed(() => {
  const source = auth.user?.nickname || auth.user?.email || 'T'
  return source.trim().charAt(0).toUpperCase()
})

// 팝업이 열릴 때 프로필이 없으면 로드하고, 인라인 편집 상태는 초기화한다.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    cancelEditNickname()
    if (!auth.user) auth.fetchMe().catch(() => {})
  },
)

function close() {
  emit('update:modelValue', false)
}

function startEditNickname() {
  nicknameError.value = ''
  nicknameDraft.value = auth.user?.nickname ?? ''
  editingNickname.value = true
}

function cancelEditNickname() {
  editingNickname.value = false
  nicknameDraft.value = ''
  nicknameError.value = ''
}

async function saveNickname() {
  const result = validateNickname(nicknameDraft.value, auth.user?.nickname)
  if (result.unchanged) {
    cancelEditNickname()
    return
  }
  if (!result.ok) {
    nicknameError.value = result.error
    return
  }
  nicknameError.value = ''
  savingNickname.value = true
  try {
    await auth.updateProfile({ nickname: result.value })
    cancelEditNickname()
  } catch (e) {
    nicknameError.value = extractApiMessage(e, '닉네임 변경에 실패했습니다.')
  } finally {
    savingNickname.value = false
  }
}

async function onLogout() {
  await auth.logout()
  close()
  router.push('/login')
}

function openWithdraw() {
  withdrawPassword.value = ''
  withdrawError.value = ''
  withdrawVisible.value = true
  close()
}

function closeWithdraw() {
  if (withdrawing.value) return
  withdrawVisible.value = false
  withdrawPassword.value = ''
  withdrawError.value = ''
}

async function onWithdraw() {
  withdrawError.value = ''
  withdrawing.value = true
  try {
    await auth.withdraw(requiresWithdrawPassword.value ? withdrawPassword.value : null)
    withdrawVisible.value = false
    withdrawPassword.value = ''
    router.replace({ path: '/login', query: { withdrawn: '1' } })
  } catch (e) {
    withdrawError.value = extractApiMessage(e, '회원 탈퇴에 실패했습니다.')
  } finally {
    withdrawing.value = false
  }
}
</script>

<template>
  <!-- 프로필 팝업 -->
  <BaseModal
    :model-value="modelValue"
    hide-header
    width="min(540px, 92vw)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="auth.user" class="account">
      <div class="account__head">
        <div class="account__avatar" aria-hidden="true">{{ userInitial }}</div>
        <div class="account__id">
          <p class="account__name">{{ auth.user.nickname }}</p>
          <p class="account__email">{{ auth.user.email || '소셜 로그인 계정' }}</p>
        </div>
      </div>

      <div class="account__body">
        <div class="field">
          <label :for="editingNickname ? 'account-nickname' : undefined">닉네임</label>
          <div class="input-row">
            <input
              v-if="editingNickname"
              id="account-nickname"
              v-model="nicknameDraft"
              class="input"
              maxlength="50"
              :disabled="savingNickname"
              autocomplete="nickname"
              @keyup.enter="saveNickname"
            />
            <input v-else class="input" :value="auth.user.nickname" readonly />
            <button
              v-if="!editingNickname"
              type="button"
              class="form-link"
              @click="startEditNickname"
            >
              수정
            </button>
            <button
              v-else
              type="button"
              class="form-link"
              :disabled="savingNickname"
              @click="saveNickname"
            >
              {{ savingNickname ? '저장 중…' : '저장' }}
            </button>
          </div>
          <div v-if="editingNickname" class="field__sub">
            <button type="button" class="form-link form-link--muted" @click="cancelEditNickname">
              취소
            </button>
            <span v-if="nicknameError" class="field__error">{{ nicknameError }}</span>
          </div>
        </div>

        <div class="field">
          <label>이메일</label>
          <input class="input input--read" :value="auth.user.email || '소셜 로그인 계정'" readonly />
        </div>

        <div class="account__foot">
          <button type="button" class="danger-link" @click="openWithdraw">회원 탈퇴</button>
          <BaseButton variant="default" @click="onLogout">로그아웃</BaseButton>
        </div>
      </div>
    </div>
    <p v-else class="account__loading">프로필을 불러오는 중…</p>
  </BaseModal>

  <!-- 회원 탈퇴 확인 팝업 -->
  <BaseModal v-model="withdrawVisible" hide-header width="min(400px, 92vw)">
    <form class="confirm" @submit.prevent="onWithdraw">
      <h3 class="confirm__title">정말 탈퇴하시겠어요?</h3>
      <p class="confirm__desc">
        탈퇴하면 <b>모든 여행·사진·추억 카드가 영구 삭제</b>됩니다. 되돌릴 수 없어요.
      </p>
      <div v-if="requiresWithdrawPassword" class="field">
        <label for="withdraw-password">비밀번호 확인</label>
        <input
          id="withdraw-password"
          v-model="withdrawPassword"
          class="input"
          type="password"
          placeholder="현재 비밀번호"
          autocomplete="current-password"
          required
        />
      </div>
      <p v-else class="confirm__desc">소셜 로그인 계정은 현재 로그인 상태를 확인한 뒤 탈퇴합니다.</p>
      <p v-if="withdrawError" class="field__error">{{ withdrawError }}</p>
      <div class="confirm__foot">
        <BaseButton type="button" variant="default" @click="closeWithdraw">취소</BaseButton>
        <BaseButton type="submit" variant="danger" :disabled="withdrawing">
          {{ withdrawing ? '탈퇴 중…' : '탈퇴하기' }}
        </BaseButton>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
.account__head {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 18px;
  justify-content: center;
  padding: 18px 24px 24px;
}

.account__avatar {
  align-items: center;
  background: linear-gradient(135deg, var(--accent-soft), var(--accent));
  border-radius: 50%;
  color: var(--on-fill);
  display: grid;
  flex: 0 0 auto;
  font-size: 31px;
  font-weight: 700;
  height: 78px;
  place-items: center;
  width: 78px;
}

.account__name {
  font-size: 23px;
  font-weight: 800;
  letter-spacing: -0.3px;
  margin: 0;
}

.account__email {
  color: var(--ink-sub);
  font-size: 13px;
  margin: 4px 0 0;
}

.account__body {
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  max-width: 340px;
  padding: 26px 8px 8px;
  width: 100%;
}

.field {
  margin-bottom: 18px;
}

.field label {
  color: var(--ink-sub);
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  margin-bottom: 7px;
}

.input {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  box-sizing: border-box;
  color: var(--ink);
  font-family: inherit;
  font-size: 14px;
  padding: 10px 12px;
  width: 100%;
}

.input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(194, 105, 63, 0.18);
  outline: none;
}

.input--read {
  background: var(--bg);
  color: var(--ink-sub);
}

.input-row {
  align-items: center;
  display: flex;
  gap: 8px;
}

.input-row .input {
  flex: 1 1 auto;
}

.form-link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  flex: 0 0 auto;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  padding: 4px 2px;
}

.form-link:disabled {
  color: var(--ink-faint);
  cursor: default;
}

.form-link--muted {
  color: var(--ink-sub);
}

.field__sub {
  align-items: center;
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

.field__error {
  color: var(--complete);
  font-size: 12px;
}

.account__foot {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
}

.danger-link {
  background: none;
  border: none;
  color: var(--complete);
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  padding: 4px 2px;
}

.account__loading {
  color: var(--ink-sub);
  padding: 24px;
  text-align: center;
}

.confirm {
  display: flex;
  flex-direction: column;
}

.confirm__title {
  font-size: 17px;
  font-weight: 800;
  margin: 0;
}

.confirm__desc {
  color: var(--ink-sub);
  font-size: 13px;
  line-height: 1.55;
  margin: 9px 0 4px;
}

.confirm__desc b {
  color: var(--ink);
}

.confirm .field {
  margin: 18px 0 0;
}

.confirm__foot {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
