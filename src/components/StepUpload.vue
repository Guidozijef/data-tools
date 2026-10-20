<template>
  <div class="step-upload-container">
    <!-- 未上传状态：拖拽上传大卡片 -->
    <div
      v-if="!fileInfo.name"
      class="upload-dropzone card"
      :class="{ 'is-dragging': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleFileDrop"
    >
      <div class="dropzone-content">
        <div class="drop-icon-wrapper">
          <FileSpreadsheet :size="48" class="text-primary-glow" />
        </div>

        <h2 class="drop-title">拖入旧数据 Excel 或 CSV 文件</h2>
        <p class="drop-sub">
          支持 <span class="highlight-chip">.xlsx</span>、<span class="highlight-chip">.xls</span>、<span class="highlight-chip">.csv</span> 格式，纯前端本地解析，数据绝不上传服务器，保护核心隐私安全
        </p>

        <div class="drop-actions">
          <label class="btn btn-primary btn-lg upload-btn">
            <Upload :size="18" />
            <span>选择本地文件</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              class="hidden-file-input"
              @change="handleFileInput"
            />
          </label>

          <span class="or-divider">或者</span>

          <button class="btn btn-secondary btn-lg" @click="$emit('load-demo')">
            <Sparkles :size="18" class="text-amber" />
            <span>一键载入内置演示数据</span>
          </button>
        </div>

        <div class="feature-pills">
          <div class="pill-item">
            <ShieldCheck :size="14" class="text-success" />
            <span>纯客户端离线处理</span>
          </div>
          <div class="pill-item">
            <Layers :size="14" class="text-primary" />
            <span>支持多 Sheet 自由切换</span>
          </div>
          <div class="pill-item">
            <Sliders :size="14" class="text-info" />
            <span>自定义表头行 & 空行过滤</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 已解析数据预览状态 -->
    <div v-else class="upload-ready-view">
      <!-- 顶部文件与解析配置栏 -->
      <div class="card file-meta-card">
        <div class="file-main-info">
          <div class="file-badge-icon">
            <FileSpreadsheet :size="24" />
          </div>
          <div>
            <div class="file-name-row">
              <span class="file-name">{{ fileInfo.name }}</span>
              <span class="badge badge-primary">{{ (fileInfo.size / 1024).toFixed(1) }} KB</span>
              <span class="badge badge-success">{{ rows.length }} 行数据</span>
              <span class="badge badge-neutral">{{ headers.length }} 列字段</span>
            </div>
            <div class="file-sub-row">
              工作表: <strong class="text-highlight">{{ currentSheet }}</strong>
              <span v-if="sheetNames.length > 1" class="sheet-count-tag">(共 {{ sheetNames.length }} 个 Sheet)</span>
            </div>
          </div>
        </div>

        <!-- 重新选择文件 -->
        <div class="file-actions">
          <label class="btn btn-outline btn-sm">
            <RefreshCw :size="14" />
            <span>更换文件</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              class="hidden-file-input"
              @change="handleFileInput"
            />
          </label>
        </div>
      </div>

      <!-- 多 Sheet 标签切换专区 -->
      <div v-if="sheetNames.length > 1" class="card sheet-picker-card">
        <div class="sheet-picker-header">
          <div class="sheet-title-group">
            <Layers :size="18" class="text-primary" />
            <span class="sheet-picker-title">Excel 包含多个工作表 (Tab 页签)，请选择本次导入哪一个工作表:</span>
          </div>
          <span class="badge badge-primary">共 {{ sheetNames.length }} 个 Sheet 页签</span>
        </div>

        <div class="sheet-cards-grid">
          <div
            v-for="sheet in sheetNames"
            :key="sheet"
            class="sheet-choice-card"
            :class="{ 'is-selected': sheet === currentSheet }"
            @click="changeSheet(sheet)"
          >
            <div class="choice-icon">
              <FileSpreadsheet :size="20" />
            </div>
            <div class="choice-info">
              <span class="choice-name">{{ sheet }}</span>
              <span v-if="sheet === currentSheet" class="choice-status text-success">
                <CheckCircle2 :size="13" /> 当前选定导入此页签
              </span>
              <span v-else class="choice-status text-muted">点击切换到此工作表</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 表头定位与过滤选项卡片 -->
      <div class="card parse-toolbar-card">

        <!-- 表头定位与过滤选项 -->
        <div class="parse-options-row">
          <div class="option-item">
            <label class="option-label">表头所在行:</label>
            <select
              :value="headerRowIndex"
              class="form-select option-select"
              @change="onHeaderRowChange($event.target.value)"
            >
              <option :value="0">第 1 行 (默认常见)</option>
              <option :value="1">第 2 行 (首行为说明时)</option>
              <option :value="2">第 3 行</option>
              <option :value="3">第 4 行</option>
              <option :value="4">第 5 行</option>
            </select>
          </div>

          <div class="option-item">
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="skipEmptyRows"
                @change="$emit('update:skipEmptyRows', $event.target.checked)"
              />
              <span>自动过滤全空行</span>
            </label>
          </div>

          <div class="step-next-action">
            <button class="btn btn-primary btn-lg" @click="$emit('go-next')">
              <span>下一步：配置目标数据库表结构</span>
              <ArrowRight :size="18" />
            </button>
          </div>
        </div>
      </div>

      <!-- 源数据原始表格预览 (Raw Table Preview) -->
      <div class="card raw-table-card">
        <div class="table-card-header">
          <div class="table-title">
            <TableProperties :size="18" class="text-primary" />
            <span>原始数据预览 (显示前 20 行)</span>
          </div>
          <span class="text-muted text-sm">
            共计读取到 {{ headers.length }} 个字段列，{{ rows.length }} 条记录
          </span>
        </div>

        <div class="table-scroll-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th class="th-index"># 原始行号</th>
                <th v-for="h in headers" :key="h" class="th-field">
                  <div class="header-cell">
                    <span class="header-name" :title="h">{{ h }}</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rIdx) in previewRows" :key="rIdx">
                <td class="td-index">{{ row._rawRowIndex || rIdx + 1 }}</td>
                <td v-for="h in headers" :key="h" class="td-val">
                  <span v-if="row[h] !== '' && row[h] !== undefined && row[h] !== null" class="cell-text">
                    {{ row[h] }}
                  </span>
                  <span v-else class="cell-empty">NULL</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  FileSpreadsheet,
  Upload,
  Sparkles,
  ShieldCheck,
  Layers,
  Sliders,
  RefreshCw,
  ArrowRight,
  TableProperties,
  CheckCircle2
} from 'lucide-vue-next'

const props = defineProps({
  fileInfo: {
    type: Object,
    default: () => ({ name: '', size: 0 })
  },
  sheetNames: {
    type: Array,
    default: () => []
  },
  currentSheet: {
    type: String,
    default: ''
  },
  headers: {
    type: Array,
    default: () => []
  },
  rows: {
    type: Array,
    default: () => []
  },
  headerRowIndex: {
    type: Number,
    default: 0
  },
  skipEmptyRows: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits([
  'file-selected',
  'load-demo',
  'change-sheet',
  'update:headerRowIndex',
  'update:skipEmptyRows',
  'go-next'
])

const isDragging = ref(false)

const previewRows = computed(() => {
  return props.rows.slice(0, 20)
})

function handleFileInput(e) {
  const file = e.target.files?.[0]
  if (file) {
    emit('file-selected', file)
  }
  e.target.value = ''
}

function handleFileDrop(e) {
  isDragging.value = false
  const file = e.dataTransfer.files?.[0]
  if (file) {
    emit('file-selected', file)
  }
}

function changeSheet(sheet) {
  emit('change-sheet', sheet)
}

function onHeaderRowChange(val) {
  emit('update:headerRowIndex', parseInt(val, 10))
}
</script>

<style scoped>
.step-upload-container {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 20px 32px;
}

/* 拖拽上传大卡片 */
.upload-dropzone {
  min-height: 480px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed rgba(99, 102, 241, 0.35);
  background: radial-gradient(circle at center, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.95) 100%);
  border-radius: var(--radius-xl);
  transition: all var(--transition-normal);
  cursor: pointer;
  text-align: center;
}

.upload-dropzone.is-dragging {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.12);
  transform: scale(1.005);
}

.dropzone-content {
  max-width: 960px;
  width: 100%;
  padding: 50px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.drop-icon-wrapper {
  width: 90px;
  height: 90px;
  border-radius: 24px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  box-shadow: 0 0 35px rgba(99, 102, 241, 0.25);
}

.text-primary-glow {
  color: #818cf8;
}

.drop-title {
  font-size: 24px;
  font-weight: 800;
  margin-bottom: 12px;
  letter-spacing: -0.01em;
}

.drop-sub {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 32px;
}

.highlight-chip {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-medium);
  padding: 2px 7px;
  border-radius: 6px;
  font-family: var(--font-mono);
  color: #a5b4fc;
}

.drop-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 40px;
}

.hidden-file-input {
  display: none;
}

.upload-btn {
  position: relative;
  cursor: pointer;
}

.or-divider {
  font-size: 13px;
  color: var(--text-muted);
}

.feature-pills {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  justify-content: center;
}

.pill-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.03);
  padding: 6px 12px;
  border-radius: 9999px;
  border: 1px solid var(--border-subtle);
}

/* 已上传视图 */
.upload-ready-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.file-meta-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
}

.file-main-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.file-badge-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #34d399;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.file-name {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.file-sub-row {
  font-size: 13px;
  color: var(--text-secondary);
}

.text-highlight {
  color: #818cf8;
}

.sheet-count-tag {
  color: var(--text-muted);
  margin-left: 6px;
}

/* 多 Sheet 选择专区卡片 */
.sheet-picker-card {
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid var(--border-medium);
}

.sheet-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.sheet-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sheet-picker-title {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.sheet-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.sheet-choice-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sheet-choice-card:hover {
  border-color: var(--primary-border);
  transform: translateY(-1px);
}

.sheet-choice-card.is-selected {
  background: rgba(99, 102, 241, 0.12);
  border-color: var(--primary);
  box-shadow: 0 0 15px rgba(99, 102, 241, 0.25);
}

.choice-icon {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #818cf8;
}

.sheet-choice-card.is-selected .choice-icon {
  background: var(--primary);
  color: #fff;
}

.choice-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.choice-name {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.choice-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
}

/* 工具栏 */
.parse-toolbar-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 24px;
}

.sheet-tabs-container {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 12px;
}

.toolbar-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.sheet-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
}

.sheet-tab-btn {
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-medium);
  color: var(--text-secondary);
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sheet-tab-btn:hover {
  border-color: var(--primary-border);
  color: #fff;
}

.sheet-tab-btn.is-active {
  background: var(--primary-light);
  border-color: var(--primary);
  color: #a5b4fc;
}

.parse-options-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.option-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.option-select {
  width: auto;
  min-width: 170px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  cursor: pointer;
}

/* 原始表格卡片 */
.raw-table-card {
  padding: 20px 24px;
}

.table-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.table-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
}

.table-scroll-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  max-height: 480px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.data-table thead th {
  background: #151d2c;
  color: var(--text-secondary);
  font-weight: 600;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-medium);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

.th-index {
  width: 80px;
  text-align: center;
  font-family: var(--font-mono);
}

.header-name {
  color: #fff;
  font-weight: 700;
}

.data-table tbody td {
  padding: 9px 14px;
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.td-index {
  text-align: center;
  font-family: var(--font-mono);
  color: var(--text-muted);
  font-size: 12px;
}

.data-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.cell-empty {
  color: var(--text-muted);
  font-style: italic;
  font-size: 11px;
}
</style>
