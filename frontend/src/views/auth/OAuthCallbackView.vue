<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Message from 'primevue/message'
import { useAuthStore } from '@/stores/auth'
import { AUTHENTICATED_ENTRY_PATH } from '@/router/entryPaths'

const router = useRouter()
const auth = useAuthStore()
const error = ref('')

onMounted(async () => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const accessToken = params.get('accessToken')
  const refreshToken = params.get('refreshToken')
  const redirect = safeRedirect(params.get('redirect'))

  if (!accessToken || !refreshToken) {
    error.value = '소셜 로그인에 실패했습니다. 다시 시도해주세요.'
    router.replace({ path: '/login', query: { oauthError: 'failed' } })
    return
  }

  await auth.completeOAuthLogin({
    accessToken,
    refreshToken,
    tokenType: params.get('tokenType') || 'Bearer',
  })
  router.replace(redirect)
})

function safeRedirect(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return AUTHENTICATED_ENTRY_PATH
  }
  return value
}
</script>

<template>
  <main class="oauth-callback">
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <Message v-else severity="info" :closable="false">소셜 로그인 처리 중입니다.</Message>
  </main>
</template>

<style scoped>
.oauth-callback {
  max-width: 360px;
  margin: 4rem auto;
}
</style>
