<script setup>
import { ref } from 'vue'

import {
  AppTopBar,
  BaseButton,
  BaseModal,
  EmptyState,
  TripPolaroid,
  TripStamp,
  TripTicket,
} from '@/components/common'

const showModal = ref(false)

const tokens = [
  ['bg', '#ece4d6'],
  ['paper', '#fbf7ee'],
  ['ink', '#2c2926'],
  ['stamp', '#2f4a5c'],
  ['accent', '#c2693f'],
  ['complete', '#c0392b'],
  ['terra', '#c2693f'],
  ['mustard', '#c39a40'],
  ['sage', '#6f8a5f'],
  ['blue', '#5f7d94'],
  ['burgundy', '#8f4a47'],
  ['plum', '#8a6a82'],
]
</script>

<template>
  <div class="ds-preview">
    <AppTopBar active="trips" user-initial="지" @create-trip="showModal = true" />

    <main class="ds-catalog">
      <header class="ds-catalog__hero">
        <p class="ds-tag-hand">Sprint 4 design foundation</p>
        <h1>TripLog 디자인 시스템 프리뷰</h1>
        <p>
          docs/design의 HTML 정본을 Vue 공통 컴포넌트로 옮긴 첫 토대입니다. 여기서 모양을
          맞춘 뒤 각 화면에 적용합니다.
        </p>
      </header>

      <section class="ds-panel">
        <div class="ds-panel__header">Tokens</div>
        <div class="token-grid">
          <div v-for="[name, color] in tokens" :key="name" class="token-chip">
            <span :style="{ background: color }"></span>
            <b>{{ name }}</b>
            <small>{{ color }}</small>
          </div>
        </div>
      </section>

      <section class="ds-panel">
        <div class="ds-panel__header">Buttons</div>
        <div class="preview-row">
          <BaseButton variant="primary">주 액션</BaseButton>
          <BaseButton>보조</BaseButton>
          <BaseButton variant="ghost">고스트</BaseButton>
          <BaseButton variant="danger">삭제</BaseButton>
          <BaseButton variant="primary" size="small">작게</BaseButton>
        </div>
      </section>

      <section class="ds-panel ticket-panel">
        <div class="ds-panel__header">Trip Tickets</div>
        <div class="ticket-stack">
          <TripTicket
            title="전주, 다시 한 번"
            region="전주"
            dates="날짜 미정"
            serial="TL-2026-0624"
            status="TRIP TICKET"
            color="mustard"
            :tags="['미식', '한옥마을']"
          />
          <TripTicket
            title="후쿠오카 주말 여행"
            region="후쿠오카"
            dates="07.05 - 07.07"
            serial="TL-2026-0705"
            status="UPCOMING"
            color="blue"
            :dday="13"
            :tags="['라멘', '산책']"
          />
          <TripTicket
            title="교토 단풍 기록"
            region="교토"
            dates="11.07 - 11.09"
            serial="TL-2025-1107"
            status="PAST TRIP"
            color="terra"
            torn
            stamp-title="교토"
            :tags="['단풍', '사진']"
          />
        </div>
      </section>

      <section class="ds-panel">
        <div class="ds-panel__header">Stamps</div>
        <div class="stamp-row">
          <div>
            <TripStamp title="제주" :stage="1" />
            <span>1단계</span>
          </div>
          <div>
            <TripStamp title="제주" :stage="2" />
            <span>2단계</span>
          </div>
          <div>
            <TripStamp title="제주" :stage="3" complete />
            <span>3단계</span>
          </div>
        </div>
      </section>

      <section class="ds-panel">
        <div class="ds-panel__header">Polaroids</div>
        <div class="preview-row">
          <TripPolaroid
            title="교토 단풍 기록"
            subtitle="교토 · 2025.11"
            :tags="['단풍', '사진']"
            tone="radial-gradient(80% 70% at 60% 35%, #d39a5a, #9a4b2a 60%, #5a2c18)"
            completed
          />
          <TripPolaroid
            title="제주 동쪽 바다"
            subtitle="제주 · 2026.09"
            :tags="['바다', '여름']"
          />
          <TripPolaroid title="오사카 봄 여행" subtitle="오사카 · 예정" empty />
        </div>
      </section>

      <section class="ds-panel">
        <div class="ds-panel__header">Forms / Feedback</div>
        <div class="feedback-grid">
          <form class="ds-form-narrow" @submit.prevent>
            <div class="ds-field">
              <label for="preview-email">이메일</label>
              <input id="preview-email" class="ds-input" placeholder="you@triplog.kr" />
            </div>
            <div class="ds-field">
              <label for="preview-password">비밀번호</label>
              <input
                id="preview-password"
                class="ds-input"
                type="password"
                placeholder="8자 이상"
              />
            </div>
            <BaseButton variant="primary" block>확인</BaseButton>
          </form>

          <div class="feedback-stack">
            <div class="ds-toast ds-toast--success">
              <span class="ds-toast__icon" aria-hidden="true">✓</span>
              저장되었습니다.
            </div>
            <div class="ds-toast ds-toast--error">
              <span class="ds-toast__icon" aria-hidden="true">✕</span>
              다시 시도해 주세요.
            </div>
            <div class="loading-sample">
              <div class="ds-spinner"></div>
              <div>
                <div class="ds-skeleton skeleton-title"></div>
                <div class="ds-skeleton skeleton-line"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="ds-panel">
        <div class="ds-panel__header">Empty State / Modal</div>
        <EmptyState
          title="아직 여행이 없어요"
          description="첫 여행 티켓을 만들고 계획을 시작해 보세요."
          action-label="여행 만들기"
          @action="showModal = true"
        />
      </section>
    </main>

    <BaseModal v-model="showModal" title="여행 만들기">
      <p class="modal-copy">
        실제 생성 흐름은 Trip 화면 적용 이슈에서 연결합니다. 이 프리뷰에서는 공통 모달의
        크기와 여백만 확인합니다.
      </p>
      <template #footer>
        <BaseButton variant="ghost" @click="showModal = false">취소</BaseButton>
        <BaseButton variant="primary" @click="showModal = false">확인</BaseButton>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.ds-preview {
  min-height: 100vh;
}

.ds-catalog {
  display: grid;
  gap: 22px;
  margin: 0 auto;
  max-width: 1080px;
  min-width: 0;
  padding: 28px 26px 80px;
  width: 100%;
}

.ds-catalog > * {
  min-width: 0;
}

.ds-catalog__hero h1 {
  font-size: 30px;
  letter-spacing: 0;
  line-height: 1.2;
  margin-top: 4px;
}

.ds-catalog__hero p:not(.ds-tag-hand) {
  color: var(--ink-sub);
  font-size: 14px;
  max-width: 680px;
}

.token-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.token-chip {
  display: grid;
  gap: 4px;
}

.token-chip span {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 7px;
  height: 40px;
}

.token-chip b {
  font-size: 12px;
}

.token-chip small {
  color: var(--ink-sub);
  font-family: var(--font-mono);
  font-size: 10px;
}

.preview-row {
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}

.ticket-panel {
  --ds-surface: var(--paper);
}

.ticket-stack {
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.stamp-row {
  display: flex;
  flex-wrap: wrap;
  gap: 34px;
}

.stamp-row > div {
  align-items: center;
  display: grid;
  gap: 8px;
  justify-items: center;
}

.stamp-row span {
  color: var(--ink-sub);
  font-size: 12px;
  font-weight: 700;
}

.feedback-grid {
  display: grid;
  gap: 36px;
  grid-template-columns: minmax(240px, 400px) 1fr;
}

.feedback-stack {
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.loading-sample {
  align-items: center;
  display: flex;
  gap: 16px;
  padding-top: 10px;
}

.skeleton-title {
  height: 14px;
  margin-bottom: 8px;
  width: 160px;
}

.skeleton-line {
  height: 14px;
  width: 120px;
}

.modal-copy {
  color: var(--ink-sub);
  margin: 0;
}

@media (max-width: 760px) {
  .ds-catalog {
    padding: 22px 16px 64px;
  }

  .feedback-grid {
    grid-template-columns: 1fr;
  }
}
</style>
