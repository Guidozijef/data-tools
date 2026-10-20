<template>
  <header class="app-header">
    <div class="header-container">
      <!-- 品牌 Logo & 标题 -->
      <div class="brand-section">
        <div class="brand-icon">
          <DatabaseZap :size="24" class="icon-pulse" />
        </div>
        <div class="brand-info">
          <div class="brand-title">
            <span>DataClean</span>
            <span class="gradient-text">Studio</span>
            <span class="version-tag">Pure Frontend</span>
          </div>
          <div class="brand-sub">Excel 旧数据清洗 · 字段关联映射 · 数据库导入转换</div>
        </div>
      </div>

      <!-- 右侧全局操作栏 -->
      <div class="header-actions">
        <button class="btn btn-outline btn-sm" @click="$emit('load-demo')" title="载入内置测试数据及推荐清洗规则">
          <Sparkles :size="15" class="text-amber" />
          <span>载入演示数据</span>
        </button>

        <button class="btn btn-secondary btn-sm" @click="$emit('open-templates')" title="管理/导出/导入清洗配置模板">
          <FolderArchive :size="15" />
          <span>规则模板</span>
        </button>

        <button class="btn btn-outline btn-sm btn-danger-hover" @click="$emit('reset-all')" title="清空所有上传与配置">
          <RotateCcw :size="15" />
          <span>重置</span>
        </button>
      </div>
    </div>

    <!-- 步骤导航条 Stepper -->
    <nav class="stepper-bar">
      <div class="stepper-inner">
        <div
          v-for="(step, index) in steps"
          :key="step.key"
          class="step-item"
          :class="{
            'is-active': currentStep === index + 1,
            'is-completed': completedSteps.includes(index + 1),
            'is-disabled': !canNavigateTo(index + 1)
          }"
          @click="canNavigateTo(index + 1) && $emit('change-step', index + 1)"
        >
          <div class="step-badge">
            <Check v-if="completedSteps.includes(index + 1) && currentStep !== index + 1" :size="14" />
            <span v-else>{{ index + 1 }}</span>
          </div>

          <div class="step-meta">
            <span class="step-name">{{ step.title }}</span>
            <span class="step-desc">{{ step.desc }}</span>
          </div>

          <ChevronRight v-if="index < steps.length - 1" class="step-separator" :size="16" />
        </div>
      </div>
    </nav>
  </header>
</template>

<script setup>
import {
  DatabaseZap,
  Sparkles,
  FolderArchive,
  RotateCcw,
  Check,
  ChevronRight
} from 'lucide-vue-next'

const props = defineProps({
  currentStep: {
    type: Number,
    default: 1
  },
  completedSteps: {
    type: Array,
    default: () => []
  },
  hasSourceData: {
    type: Boolean,
    default: false
  },
  hasTargetSchema: {
    type: Boolean,
    default: false
  }
})

defineEmits(['change-step', 'load-demo', 'open-templates', 'reset-all'])

const steps = [
  { key: 'upload', title: '1. 数据源上传', desc: 'Excel / CSV 解析' },
  { key: 'schema', title: '2. 目标库结构', desc: '表名及字段定义' },
  { key: 'mapping', title: '3. 字段映射与清洗', desc: '关联匹配与转换规则' },
  { key: 'preview', title: '4. 预览与校验', desc: '实时清洗与错误修正' },
  { key: 'export', title: '5. 导出与入库', desc: 'Excel / SQL / CSV' }
]

function canNavigateTo(stepNumber) {
  if (stepNumber === 1) return true
  if (stepNumber === 2) return true
  // 必须有源数据才能进入第3、4、5步
  if (stepNumber >= 3 && !props.hasSourceData) return false
  if (stepNumber >= 4 && !props.hasTargetSchema) return false
  return true
}
</script>

<style scoped>
.app-header {
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-medium);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.header-container {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 14px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand-section {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
}

.brand-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.gradient-text {
  background: linear-gradient(135deg, #a5b4fc 0%, #c084fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.version-tag {
  font-size: 11px;
  font-weight: 600;
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.35);
  color: #a5b4fc;
  padding: 1px 7px;
  border-radius: 9999px;
  letter-spacing: normal;
}

.brand-sub {
  font-size: 12px;
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.text-amber {
  color: #fbbf24;
}

.btn-danger-hover:hover {
  background: var(--danger-light);
  border-color: var(--danger-border);
  color: #fda4af;
}

/* 步骤导航条 */
.stepper-bar {
  background: rgba(11, 15, 25, 0.5);
  border-top: 1px solid var(--border-subtle);
  overflow-x: auto;
}

.stepper-inner {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0 32px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  position: relative;
  transition: all var(--transition-fast);
  border-bottom: 2px solid transparent;
  user-select: none;
}

.step-item.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.step-item:not(.is-disabled):hover {
  background: rgba(255, 255, 255, 0.03);
}

.step-badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  background: var(--bg-surface);
  border: 1px solid var(--border-medium);
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.step-meta {
  display: flex;
  flex-direction: column;
}

.step-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: color var(--transition-fast);
}

.step-desc {
  font-size: 11px;
  color: var(--text-muted);
}

/* 激活状态 */
.step-item.is-active {
  border-bottom-color: var(--primary);
  background: rgba(99, 102, 241, 0.08);
}

.step-item.is-active .step-badge {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.5);
}

.step-item.is-active .step-name {
  color: #fff;
}

.step-item.is-active .step-desc {
  color: #a5b4fc;
}

/* 已完成状态 */
.step-item.is-completed:not(.is-active) .step-badge {
  background: var(--success-light);
  border-color: var(--success-border);
  color: var(--success);
}

.step-separator {
  color: var(--text-muted);
  opacity: 0.5;
  margin-left: 8px;
}
</style>
