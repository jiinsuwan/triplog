<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import BaseButton from './BaseButton.vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  hideHeader: {
    type: Boolean,
    default: false,
  },
  width: {
    type: String,
    default: '',
  },
  closeButtonVariant: {
    type: String,
    default: 'ghost',
    validator: (value) => ['default', 'primary', 'ghost', 'danger'].includes(value),
  },
})

const emit = defineEmits(['update:modelValue'])
const modalRef = ref(null)
const titleId = `base-modal-title-${Math.random().toString(36).slice(2)}`

let previousActiveElement = null
let originalBodyOverflow = ''
let isPageStateLocked = false

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function close() {
  emit('update:modelValue', false)
}

function getFocusableElements() {
  return [...(modalRef.value?.querySelectorAll(focusableSelector) ?? [])].filter(
    (element) => typeof element.focus === 'function' && element.getAttribute('aria-hidden') !== 'true',
  )
}

function focusInitialElement() {
  nextTick(() => {
    const [firstElement] = getFocusableElements()
    const targetElement = firstElement ?? modalRef.value
    targetElement?.focus()
  })
}

function restorePageState() {
  if (typeof document === 'undefined') {
    return
  }
  if (!isPageStateLocked) {
    return
  }

  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = originalBodyOverflow
  previousActiveElement?.focus?.()
  previousActiveElement = null
  isPageStateLocked = false
}

function handleKeydown(event) {
  if (!props.modelValue) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }

  if (event.key !== 'Tab') {
    return
  }

  const focusableElements = getFocusableElements()
  if (focusableElements.length === 0) {
    event.preventDefault()
    modalRef.value?.focus()
    return
  }

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault()
    lastElement.focus()
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
  }
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (typeof document === 'undefined') {
      return
    }

    if (isOpen) {
      if (isPageStateLocked) {
        return
      }
      previousActiveElement = document.activeElement
      originalBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', handleKeydown)
      isPageStateLocked = true
      focusInitialElement()
    } else {
      restorePageState()
    }
  },
  { immediate: true },
)

onBeforeUnmount(restorePageState)
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="ds-scrim" role="presentation" @click.self="close">
      <section
        ref="modalRef"
        class="ds-modal base-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title && !hideHeader ? titleId : undefined"
        :aria-label="title && hideHeader ? title : title ? undefined : '대화상자'"
        :style="width ? { width } : undefined"
        tabindex="-1"
      >
        <header v-if="!hideHeader" class="base-modal__header">
          <h2 :id="titleId">{{ title }}</h2>
          <BaseButton :variant="closeButtonVariant" size="small" aria-label="닫기" @click="close">
            닫기
          </BaseButton>
        </header>
        <div class="base-modal__body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="base-modal__footer">
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.base-modal {
  width: min(560px, 92vw);
}

.base-modal__header,
.base-modal__footer {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 16px 18px;
}

.base-modal__header {
  border-bottom: 1px solid var(--line);
}

.base-modal__header h2 {
  font-size: 18px;
  letter-spacing: 0;
}

.base-modal__body {
  padding: 18px;
}

.base-modal__footer {
  border-top: 1px solid var(--line);
  justify-content: flex-end;
}
</style>
