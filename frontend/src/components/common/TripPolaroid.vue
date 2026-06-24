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
  tags: {
    type: Array,
    default: () => [],
  },
  imageUrl: {
    type: String,
    default: '',
  },
  tone: {
    type: String,
    default: 'linear-gradient(150deg, #6f93b0, #37516a 70%, #243a52)',
  },
  completed: {
    type: Boolean,
    default: false,
  },
  empty: {
    type: Boolean,
    default: false,
  },
  placeholder: {
    type: String,
    default: '추억 만들기',
  },
})

const photoStyle = computed(() => {
  if (props.empty) {
    return {}
  }
  if (props.imageUrl) {
    return { backgroundImage: `url(${props.imageUrl})` }
  }
  return { background: props.tone }
})

const tagText = computed(() => props.tags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' '))
</script>

<template>
  <article class="ds-polaroid" :class="{ 'ds-polaroid--empty': empty }">
    <div class="ds-polaroid__photo" :style="photoStyle">
      <span v-if="empty" class="ds-polaroid__placeholder">
        <span class="ds-polaroid__placeholder-mark" aria-hidden="true">＋</span>
        {{ placeholder }}
      </span>
    </div>
    <div class="ds-polaroid__caption">
      <div class="ds-polaroid__name">{{ title }}</div>
      <div v-if="subtitle" class="ds-polaroid__meta">{{ subtitle }}</div>
      <div v-if="tagText" class="ds-polaroid__tags">{{ tagText }}</div>
      <span v-if="completed" class="ds-polaroid__done-stamp">COMPLETE</span>
    </div>
  </article>
</template>

<style scoped>
.ds-polaroid__placeholder {
  align-items: center;
  color: var(--ink-faint);
  display: grid;
  font-size: 12px;
  font-weight: 700;
  gap: 2px;
  line-height: 1.4;
  text-align: center;
}

.ds-polaroid__placeholder-mark {
  font-size: 18px;
  line-height: 1;
}
</style>
