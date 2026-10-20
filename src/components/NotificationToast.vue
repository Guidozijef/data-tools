<template>
  <div class="toast-container">
    <transition-group name="toast-anim">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-item"
        :class="`toast-${toast.type}`"
      >
        <component :is="getIcon(toast.type)" class="toast-icon" :size="18" />
        <div class="toast-body">
          <div v-if="toast.title" class="toast-title">{{ toast.title }}</div>
          <div class="toast-message">{{ toast.message }}</div>
        </div>
        <button class="toast-close" @click="remove(toast.id)">×</button>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-vue-next'

const toasts = ref([])

function getIcon(type) {
  switch (type) {
    case 'success': return CheckCircle2
    case 'error': return AlertCircle
    case 'warning': return AlertTriangle
    default: return Info
  }
}

function remove(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

function show(message, type = 'info', title = '', duration = 3500) {
  const id = Date.now() + Math.random().toString(36).substring(2, 5)
  toasts.value.push({ id, message, type, title })

  if (duration > 0) {
    setTimeout(() => {
      remove(id)
    }, duration)
  }
}

defineExpose({
  show,
  success: (msg, title) => show(msg, 'success', title),
  error: (msg, title) => show(msg, 'error', title, 5000),
  warning: (msg, title) => show(msg, 'warning', title),
  info: (msg, title) => show(msg, 'info', title)
})
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 420px;
  pointer-events: none;
}

.toast-item {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background: #182234;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-md);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  color: #fff;
}

.toast-success {
  border-left: 4px solid var(--success);
}
.toast-success .toast-icon {
  color: var(--success);
}

.toast-error {
  border-left: 4px solid var(--danger);
}
.toast-error .toast-icon {
  color: var(--danger);
}

.toast-warning {
  border-left: 4px solid var(--warning);
}
.toast-warning .toast-icon {
  color: var(--warning);
}

.toast-info {
  border-left: 4px solid var(--primary);
}
.toast-info .toast-icon {
  color: #818cf8;
}

.toast-body {
  flex: 1;
}

.toast-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 2px;
}

.toast-message {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
  word-break: break-all;
}

.toast-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}
.toast-close:hover {
  color: #fff;
}

/* 动效 */
.toast-anim-enter-active,
.toast-anim-leave-active {
  transition: all 0.25s ease;
}
.toast-anim-enter-from {
  opacity: 0;
  transform: translateX(40px) scale(0.95);
}
.toast-anim-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
