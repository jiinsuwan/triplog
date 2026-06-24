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
  <article class="polaroid" :class="{ empty }">
    <div class="photo" :style="photoStyle">
      <span v-if="empty">{{ placeholder }}</span>
    </div>
    <div class="cap">
      <div class="name">{{ title }}</div>
      <div v-if="subtitle" class="meta">{{ subtitle }}</div>
      <div v-if="tagText" class="tags">{{ tagText }}</div>
      <span v-if="completed" class="done-stamp">COMPLETE</span>
    </div>
  </article>
</template>

<style scoped>
.photo span {
  color: var(--ink-faint);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
}
</style>
