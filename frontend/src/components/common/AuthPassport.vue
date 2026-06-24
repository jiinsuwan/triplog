<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  coverTitle: {
    type: String,
    required: true,
  },
  coverSubtitle: {
    type: String,
    default: '계획부터 추억까지, 다녀온 시간을 한 권에 남기는 여행 기록장.',
  },
})

const coverTitleLines = computed(() => props.coverTitle.split(/<br\s*\/?>|\n/u))
</script>

<template>
  <main class="auth-page">
    <section class="auth-card">
      <aside class="cover">
        <RouterLink class="cover-logo" to="/">
          <span class="ic" aria-hidden="true">✈</span>
          <span class="nm">TripLog</span>
        </RouterLink>
        <div class="plane" aria-hidden="true">✈</div>
        <div class="copy">
          <span v-for="line in coverTitleLines" :key="line">{{ line }}</span>
        </div>
        <div class="copy-sub">{{ coverSubtitle }}</div>
        <svg class="route" viewBox="0 0 480 50" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M-10,34 Q120,2 250,24 T490,14"
            fill="none"
            stroke="rgba(255,255,255,.34)"
            stroke-width="1.4"
            stroke-dasharray="2 5"
          />
        </svg>
      </aside>

      <section class="form-side">
        <div class="form-inner">
          <h1>{{ title }}</h1>
          <p v-if="subtitle" class="sub">{{ subtitle }}</p>
          <slot />
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  align-items: center;
  display: grid;
  min-height: 100vh;
  padding: 30px 20px 60px;
}

.auth-card {
  background: var(--paper);
  border-radius: 18px;
  box-shadow: 0 18px 50px -22px rgba(40, 30, 20, 0.42);
  display: flex;
  margin: 0 auto;
  max-width: 1040px;
  min-height: 660px;
  overflow: hidden;
  width: 100%;
}

.cover {
  background: #2f4a5c;
  background-image: radial-gradient(rgba(255, 255, 255, 0.075) 1.2px, transparent 1.3px);
  background-size: 20px 20px;
  color: var(--on-fill);
  flex: 0 0 46%;
  overflow: hidden;
  padding: 40px 36px;
  position: relative;
}

.cover-logo {
  align-items: center;
  color: var(--on-fill);
  display: inline-flex;
  gap: 10px;
  position: relative;
  text-decoration: none;
  z-index: 3;
}

.cover-logo .ic {
  border: 1.6px solid var(--on-fill);
  border-radius: 50%;
  display: grid;
  font-size: 14px;
  height: 32px;
  place-items: center;
  width: 32px;
}

.cover-logo .nm {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0;
}

.plane {
  font-size: 172px;
  opacity: 0.13;
  position: absolute;
  right: -26px;
  top: 31%;
  transform: rotate(-12deg);
  z-index: 1;
}

.copy {
  display: grid;
  font-size: 25px;
  font-weight: 800;
  left: 36px;
  line-height: 1.34;
  position: absolute;
  top: 42%;
  z-index: 3;
}

.copy-sub {
  font-size: 12.5px;
  left: 36px;
  line-height: 1.6;
  opacity: 0.66;
  position: absolute;
  right: 34px;
  top: 57%;
  z-index: 3;
}

.route {
  bottom: 50px;
  height: 50px;
  left: 0;
  position: absolute;
  right: 0;
  width: 100%;
  z-index: 1;
}

.form-side {
  align-items: center;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  padding: 48px 54px;
}

.form-inner {
  max-width: 360px;
  text-align: left;
  width: 100%;
}

.form-inner h1 {
  color: var(--ink);
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.25;
  margin: 0;
}

.sub {
  color: var(--ink-sub);
  font-size: 13px;
  margin: 5px 0 22px;
}

@media (max-width: 760px) {
  .auth-page {
    padding: 0;
  }

  .auth-card {
    border-radius: 0;
    flex-direction: column;
    min-height: 100vh;
  }

  .cover {
    flex: none;
    min-height: 220px;
  }

  .copy {
    bottom: 52px;
    top: auto;
  }

  .copy-sub {
    bottom: 28px;
    top: auto;
  }

  .plane {
    font-size: 128px;
    top: 26%;
  }

  .form-side {
    padding: 34px 22px 48px;
  }
}
</style>
