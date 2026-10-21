<template>
  <div class="custom-js-editor-box">
    <!-- 头部：参数说明与代码片段快捷插入 -->
    <div class="editor-header">
      <div class="params-info">
        <span class="info-label">函数可用形参:</span>
        <span class="param-tag" title="当前字段原始值">val</span>
        <span class="param-tag" title="当前整行对象，如 row['客户姓名']">row</span>
        <span class="param-tag" title="若当前字段为 JSON 字符串，系统已自动解析为对象">json</span>
        <span class="param-tag" title="当前行序号">index</span>
      </div>

      <div class="snippets-dropdown">
        <span class="snippets-label">插入常用代码模板:</span>
        <div class="snippets-buttons">
          <button
            type="button"
            class="snippet-btn"
            title="三元运算符条件分类"
            @click="insertSnippet(`val > 1000 ? '高价值' : '普通'`)"
          >
            条件三元式
          </button>
          <button
            type="button"
            class="snippet-btn"
            title="从嵌套 JSON 中提取并计算"
            @click="insertSnippet(`json?.metrics?.loyaltyScore >= 90 ? '🌟 SVIP客户' : '普通会员'`)"
          >
            JSON属性条件
          </button>
          <button
            type="button"
            class="snippet-btn"
            title="多列数学运算"
            @click="insertSnippet(`(Number(row['数量'] || 0) * Number(row['单价'] || 0)).toFixed(2)`)"
          >
            多列数学计算
          </button>
          <button
            type="button"
            class="snippet-btn"
            title="多行复杂 if-else 判断逻辑"
            @click="insertFullFunctionSnippet"
          >
            完整 if-else 函数
          </button>
        </div>
      </div>
    </div>

    <!-- 代码编辑区 -->
    <div class="code-area-wrapper">
      <textarea
        :value="modelValue"
        class="form-textarea code-textarea mono-text"
        rows="6"
        placeholder="// 输入 JavaScript 表达式或函数逻辑，例如:
// 方式1: 单行表达式直接返回，例如: val ? val.trim() : '默认值'
// 方式2: 包含 return 的多行逻辑，例如:
// if (json?.source?.channel) return json.source.channel.toUpperCase();
// return '未知渠道';"
        @input="onInput($event.target.value)"
      ></textarea>
    </div>

    <!-- 运行报错提示 -->
    <div v-if="runtimeError" class="js-error-banner">
      <AlertCircle :size="16" class="text-danger" />
      <span>脚本错误: {{ runtimeError }}</span>
    </div>

    <!-- 实时执行沙箱预览结果 -->
    <div class="sandbox-preview">
      <div class="sandbox-title">
        <div class="sandbox-title-left">
          <Play :size="14" class="text-success" />
          <span>实时沙箱测试结果 (针对前 {{ testResults.length }} 行数据):</span>
        </div>
        <div class="sandbox-count-toggle">
          <button
            type="button"
            class="count-toggle-btn"
            :class="{ 'is-active': sampleCount === 3 }"
            @click="sampleCount = 3"
          >
            3 行
          </button>
          <button
            type="button"
            class="count-toggle-btn"
            :class="{ 'is-active': sampleCount === 5 }"
            @click="sampleCount = 5"
          >
            5 行
          </button>
          <button
            type="button"
            class="count-toggle-btn"
            :class="{ 'is-active': sampleCount === 10 }"
            @click="sampleCount = 10"
          >
            10 行
          </button>
        </div>
      </div>
      <div class="sandbox-results-grid">
        <div
          v-for="(test, tIdx) in testResults"
          :key="tIdx"
          class="test-row-item"
        >
          <div class="test-row-header">
            <span class="test-label">#{{ test.rowIndex || (tIdx + 1) }}:</span>
            <span class="test-raw text-muted" :title="String(test.rawVal)">原值: {{ truncate(test.rawVal, 70) }}</span>
          </div>
          <div class="test-result-box">
            <span class="test-arrow">→ 输出:</span>
            <span
              class="test-val mono-text"
              :class="{ 'text-danger': test.error, 'text-success': !test.error }"
              :title="String(test.output)"
            >
              {{ test.error ? `[错误] ${test.error}` : (test.output !== undefined && test.output !== null && test.output !== '' ? truncate(test.output, 90) : '(空)') }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { AlertCircle, Play } from 'lucide-vue-next'
import { executeCustomJs, safeParseJson } from '../utils/cleaner'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  sourceField: {
    type: String,
    default: ''
  },
  sampleRows: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const runtimeError = ref(null)

function onInput(val) {
  emit('update:modelValue', val)
}

function insertSnippet(code) {
  emit('update:modelValue', code)
}

function insertFullFunctionSnippet() {
  const snippet = `// 完整 JS 清洗逻辑
if (!val) {
  return '默认分类';
}
const score = json?.metrics?.loyaltyScore || 0;
if (score >= 90) {
  return '高级优质会员';
} else if (score >= 60) {
  return '普通会员';
}
return '潜在客户';`
  emit('update:modelValue', snippet)
}

const sampleCount = ref(5)

const testResults = computed(() => {
  const rows = (props.sampleRows || []).slice(0, sampleCount.value)
  runtimeError.value = null

  return rows.map((row, idx) => {
    const rawVal = props.sourceField ? row[props.sourceField] : ''
    const parsedJson = safeParseJson(rawVal)

    try {
      const output = executeCustomJs(props.modelValue, {
        row,
        val: rawVal,
        json: parsedJson,
        index: idx
      })
      return {
        rowIndex: row._rawRowIndex || (idx + 1),
        rawVal,
        output: typeof output === 'object' && output !== null ? JSON.stringify(output) : output,
        error: null
      }
    } catch (e) {
      if (idx === 0) {
        runtimeError.value = e.message
      }
      return {
        rowIndex: row._rawRowIndex || (idx + 1),
        rawVal,
        output: null,
        error: e.message
      }
    }
  })
})

function truncate(val, max = 80) {
  if (val === null || val === undefined || val === '') return '空'
  const s = String(val)
  return s.length > max ? s.substring(0, max) + '...' : s
}
</script>

<style scoped>
.custom-js-editor-box {
  background: #0d131f;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.params-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.param-tag {
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.4);
  color: #a5b4fc;
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  cursor: help;
}

.snippets-dropdown {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.snippets-label {
  font-size: 12px;
  color: var(--text-muted);
}

.snippets-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.snippet-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.snippet-btn:hover {
  background: var(--bg-surface-elevated);
  border-color: var(--primary);
  color: #fff;
}

.code-area-wrapper {
  position: relative;
}

.code-textarea {
  background: #090d16;
  border-color: rgba(99, 102, 241, 0.3);
  font-size: 13px;
  line-height: 1.6;
  color: #f1f5f9;
  tab-size: 2;
}

.code-textarea:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
}

.js-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(244, 63, 94, 0.1);
  border: 1px solid rgba(244, 63, 94, 0.3);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: #fda4af;
}

.sandbox-preview {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sandbox-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.sandbox-title-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.sandbox-count-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
}

.count-toggle-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-muted);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.count-toggle-btn:hover {
  color: #fff;
}

.count-toggle-btn.is-active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  font-weight: 600;
}

.sandbox-results-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.test-row-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.28);
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.test-row-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.test-label {
  font-weight: 700;
  color: #a5b4fc;
  font-size: 11px;
  flex-shrink: 0;
}

.test-raw {
  max-width: 480px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-result-box {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
  min-width: 0;
}

.test-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
}

.test-val {
  font-weight: 700;
  max-width: 520px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
