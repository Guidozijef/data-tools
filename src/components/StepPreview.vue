<template>
  <div class="step-preview-container">
    <!-- 数据健康指标概览栏 (Health Metrics) -->
    <div class="metrics-grid">
      <div class="metric-card card">
        <div class="metric-icon bg-indigo">
          <Database :size="20" />
        </div>
        <div class="metric-info">
          <span class="metric-label">清洗后有效行数</span>
          <span class="metric-val text-primary">{{ stats.processedRows }} <span class="unit">行</span></span>
        </div>
      </div>

      <div class="metric-card card">
        <div class="metric-icon bg-emerald">
          <CheckCircle2 :size="20" />
        </div>
        <div class="metric-info">
          <span class="metric-label">校验通过率</span>
          <span class="metric-val text-success">{{ passRate }}%</span>
        </div>
      </div>

      <div class="metric-card card">
        <div class="metric-icon bg-rose">
          <AlertCircle :size="20" />
        </div>
        <div class="metric-info">
          <span class="metric-label">包含异常/警告行</span>
          <span class="metric-val text-danger">{{ stats.hasErrorRows }} <span class="unit">行</span></span>
        </div>
      </div>

      <div class="metric-card card">
        <div class="metric-icon bg-amber">
          <Layers :size="20" />
        </div>
        <div class="metric-info">
          <span class="metric-label">去重过滤丢弃</span>
          <span class="metric-val text-amber">{{ stats.dedupDroppedRows }} <span class="unit">行</span></span>
        </div>
      </div>
    </div>

    <!-- 表格工具栏：筛选、搜索、对比与下一步操作 -->
    <div class="card preview-toolbar-card">
      <div class="toolbar-left">
        <!-- 视图过滤器: 全部 vs 仅异常 -->
        <div class="filter-tab-group">
          <button
            class="tab-btn"
            :class="{ 'is-active': filterMode === 'all' }"
            @click="filterMode = 'all'"
          >
            全部数据 ({{ cleanedRows.length }})
          </button>
          <button
            class="tab-btn is-error-tab"
            :class="{ 'is-active': filterMode === 'error' }"
            @click="filterMode = 'error'"
          >
            仅看异常数据 ({{ stats.hasErrorRows }})
          </button>
        </div>

        <!-- 关键词搜索过滤 -->
        <div class="search-box">
          <Search :size="15" class="search-icon" />
          <input
            v-model="searchQuery"
            class="form-input form-input-sm search-input"
            placeholder="在表格数据中实时搜索..."
          />
          <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''">×</button>
        </div>
      </div>

      <div class="toolbar-right">
        <button class="btn btn-secondary btn-sm" @click="$emit('re-run-cleaning')">
          <RefreshCw :size="14" />
          <span>重新执行清洗</span>
        </button>

        <button class="btn btn-primary" @click="$emit('go-next')">
          <span>下一步：导出文件或生成 SQL</span>
          <ArrowRight :size="16" />
        </button>
      </div>
    </div>

    <!-- 清洗后数据表格 (Cleaned Table with Inline Editing) -->
    <div class="card table-card">
      <div class="table-card-top">
        <div class="table-hint">
          <Info :size="15" class="text-info" />
          <span>提示：双击或直接点击任意单元格可进行<strong>行内实时修改</strong>修正错误数据</span>
        </div>

        <div class="pagination-info">
          <span>当前显示第 {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, filteredRows.length) }} 条 / 共 {{ filteredRows.length }} 条</span>
        </div>
      </div>

      <div class="table-scroll-wrapper">
        <table class="preview-table">
          <thead>
            <tr>
              <th style="width: 50px;" class="th-center">#</th>
              <th style="width: 60px;" class="th-center">状态</th>
              <th
                v-for="field in targetFields"
                :key="field.name"
                class="th-field"
              >
                <div class="header-col">
                  <span class="header-name">{{ field.name }}</span>
                  <span class="header-label">{{ field.label }}</span>
                </div>
              </th>
              <th style="width: 70px;" class="th-center">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in pagedRows"
              :key="row._rowIndex"
              :class="{ 'row-has-error': row._hasError }"
            >
              <!-- 行序号 -->
              <td class="td-center mono-text td-muted">{{ row._cleanIndex || row._rowIndex }}</td>

              <!-- 状态图标 -->
              <td class="td-center">
                <span v-if="row._hasError" class="badge-dot badge-dot-danger" title="存在校验异常"></span>
                <span v-else class="badge-dot badge-dot-success" title="校验正常"></span>
              </td>

              <!-- 各字段单元格 (支持行内编辑与异常高亮) -->
              <td
                v-for="field in targetFields"
                :key="field.name"
                class="td-cell"
                :class="{ 'cell-invalid': row._errors && row._errors[field.name] }"
                :title="row._errors && row._errors[field.name] ? `校验警告: ${row._errors[field.name]}` : ''"
              >
                <div class="cell-wrapper">
                  <input
                    :value="row[field.name]"
                    class="cell-inline-input"
                    placeholder="空"
                    :class="{ 'input-has-error': row._errors && row._errors[field.name] }"
                    @change="onCellEdit(row, field.name, $event.target.value)"
                  />
                  <span
                    v-if="row._errors && row._errors[field.name]"
                    class="cell-error-icon"
                  >
                    !
                  </span>
                </div>
              </td>

              <!-- 查看对比操作 -->
              <td class="td-center">
                <button
                  class="btn-icon-compare"
                  title="查看清洗前后对比"
                  @click="openCompareRow(row)"
                >
                  <Eye :size="15" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页栏 -->
      <div class="pagination-footer">
        <div class="page-size-selector">
          <span>每页显示:</span>
          <select v-model="pageSize" class="form-select form-select-sm" style="width: 80px;">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </div>

        <div class="page-nav">
          <button
            class="btn btn-outline btn-sm"
            :disabled="currentPage <= 1"
            @click="currentPage--"
          >
            上一页
          </button>
          <span class="page-text">{{ currentPage }} / {{ totalPages || 1 }}</span>
          <button
            class="btn btn-outline btn-sm"
            :disabled="currentPage >= totalPages"
            @click="currentPage++"
          >
            下一页
          </button>
        </div>
      </div>
    </div>

    <!-- 行级数据清洗前后对比弹窗 -->
    <div v-if="comparingRow" class="modal-overlay" @click.self="comparingRow = null">
      <div class="modal-content compare-modal-box">
        <div class="modal-header">
          <div class="modal-title">
            <Eye :size="18" class="text-primary" />
            <span>第 {{ comparingRow._rawRowIndex }} 行：源数据 vs 清洗后数据 对比</span>
          </div>
          <button class="modal-close" @click="comparingRow = null">×</button>
        </div>

        <div class="modal-body compare-modal-body">
          <div class="compare-columns">
            <!-- 左侧：原始 Excel 行数据 -->
            <div class="compare-col card-elevated">
              <div class="col-title">
                <FileSpreadsheet :size="15" class="text-secondary" />
                <span>原始 Excel 数据</span>
              </div>
              <div class="kv-list">
                <div
                  v-for="(val, col) in filteredRaw(comparingRow._raw)"
                  :key="col"
                  class="kv-item"
                >
                  <span class="kv-key">{{ col }}:</span>
                  <span class="kv-val mono-text">{{ val !== '' && val !== undefined && val !== null ? val : '(空)' }}</span>
                </div>
              </div>
            </div>

            <!-- 右侧：清洗后目标表数据 -->
            <div class="compare-col card-elevated">
              <div class="col-title">
                <Database :size="15" class="text-success" />
                <span>清洗后目标入库数据</span>
              </div>
              <div class="kv-list">
                <div
                  v-for="field in targetFields"
                  :key="field.name"
                  class="kv-item"
                  :class="{ 'item-error': comparingRow._errors && comparingRow._errors[field.name] }"
                >
                  <span class="kv-key">{{ field.name }} ({{ field.label }}):</span>
                  <span class="kv-val mono-text">{{ comparingRow[field.name] !== '' && comparingRow[field.name] !== undefined && comparingRow[field.name] !== null ? comparingRow[field.name] : '(空)' }}</span>
                  <div v-if="comparingRow._errors && comparingRow._errors[field.name]" class="item-error-msg">
                    {{ comparingRow._errors[field.name] }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-primary" @click="comparingRow = null">关闭对比</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  Database,
  CheckCircle2,
  AlertCircle,
  Layers,
  Search,
  RefreshCw,
  ArrowRight,
  Info,
  Eye,
  FileSpreadsheet
} from 'lucide-vue-next'
import { validateFieldType } from '../utils/cleaner'

const props = defineProps({
  cleanedRows: {
    type: Array,
    required: true
  },
  stats: {
    type: Object,
    required: true
  },
  targetFields: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['update-row-cell', 're-run-cleaning', 'go-next'])

const filterMode = ref('all') // all | error
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(10)
const comparingRow = ref(null)

const passRate = computed(() => {
  if (!props.stats.processedRows) return 100
  const valid = props.stats.validRows || (props.stats.processedRows - props.stats.hasErrorRows)
  return Math.round((valid / props.stats.processedRows) * 100)
})

const filteredRows = computed(() => {
  let list = props.cleanedRows

  if (filterMode.value === 'error') {
    list = list.filter(r => r._hasError)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(r => {
      return props.targetFields.some(f => {
        const val = r[f.name]
        return val !== null && val !== undefined && String(val).toLowerCase().includes(q)
      })
    })
  }

  return list
})

const totalPages = computed(() => {
  return Math.ceil(filteredRows.value.length / pageSize.value)
})

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})

watch([filterMode, searchQuery, pageSize], () => {
  currentPage.value = 1
})

function onCellEdit(row, fieldName, newVal) {
  row[fieldName] = newVal

  // 重新触发对该字段的校验
  const targetField = props.targetFields.find(f => f.name === fieldName)
  if (targetField) {
    const err = validateFieldType(newVal, targetField)
    if (err) {
      if (!row._errors) row._errors = {}
      row._errors[fieldName] = err
      row._hasError = true
    } else {
      if (row._errors) {
        delete row._errors[fieldName]
        row._hasError = Object.keys(row._errors).length > 0
      }
    }
  }

  emit('update-row-cell', { row, fieldName, value: newVal })
}

function openCompareRow(row) {
  comparingRow.value = row
}

function filteredRaw(raw) {
  if (!raw) return {}
  const res = {}
  Object.keys(raw).forEach(k => {
    if (!k.startsWith('_')) {
      res[k] = raw[k]
    }
  })
  return res
}
</script>

<style scoped>
.step-preview-container {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 指标卡片 */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
}

.metric-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bg-indigo {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}

.bg-emerald {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.bg-rose {
  background: rgba(244, 63, 94, 0.15);
  color: #fb7185;
}

.bg-amber {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.metric-info {
  display: flex;
  flex-direction: column;
}

.metric-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.metric-val {
  font-size: 22px;
  font-weight: 800;
  font-family: var(--font-mono);
}

.unit {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
}

/* 工具栏 */
.preview-toolbar-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 20px;
  flex-wrap: wrap;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.filter-tab-group {
  display: flex;
  background: var(--bg-input);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: 3px;
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tab-btn.is-active {
  background: var(--primary);
  color: #fff;
}

.tab-btn.is-error-tab.is-active {
  background: var(--danger);
  color: #fff;
}

.search-box {
  position: relative;
  width: 240px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.search-input {
  padding-left: 32px;
}

.clear-search-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
}

/* 表格卡片 */
.table-card {
  padding: 0;
  overflow: hidden;
}

.table-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #141c2b;
  border-bottom: 1px solid var(--border-medium);
}

.table-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.pagination-info {
  font-size: 12px;
  color: var(--text-muted);
}

.table-scroll-wrapper {
  overflow-x: auto;
  max-height: 520px;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.preview-table thead th {
  background: #151d2c;
  color: var(--text-secondary);
  font-weight: 600;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-medium);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-col {
  display: flex;
  flex-direction: column;
}

.header-name {
  color: #fff;
  font-weight: 700;
  font-family: var(--font-mono);
}

.header-label {
  font-size: 11px;
  color: var(--text-muted);
}

.th-center, .td-center {
  text-align: center;
}

.preview-table tbody td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.preview-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.row-has-error {
  background: rgba(244, 63, 94, 0.04);
}

.badge-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.badge-dot-success {
  background: var(--success);
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
}

.badge-dot-danger {
  background: var(--danger);
  box-shadow: 0 0 8px rgba(244, 63, 94, 0.6);
}

/* 单元格行内编辑与异常 */
.cell-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.cell-inline-input {
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 4px 6px;
  outline: none;
  transition: all var(--transition-fast);
}

.cell-inline-input:hover {
  border-color: var(--border-medium);
  background: rgba(255, 255, 255, 0.02);
}

.cell-inline-input:focus {
  border-color: var(--primary);
  background: var(--bg-input);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

.cell-invalid .cell-inline-input {
  border-color: rgba(244, 63, 94, 0.6);
  background: rgba(244, 63, 94, 0.08);
  color: #fecdd3;
}

.cell-error-icon {
  position: absolute;
  right: 6px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--danger);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.btn-icon-compare {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.btn-icon-compare:hover {
  color: var(--primary);
  background: var(--primary-light);
}

/* 分页栏 */
.pagination-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #141c2b;
  border-top: 1px solid var(--border-subtle);
}

.page-size-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.page-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-text {
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

/* 对比模态框 */
.compare-modal-box {
  max-width: 1100px;
  width: 95%;
}

.compare-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.compare-col {
  padding: 16px;
  border-radius: var(--radius-md);
  max-height: 480px;
  overflow-y: auto;
}

.col-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 8px;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kv-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  padding-bottom: 6px;
}

.kv-key {
  font-size: 11px;
  color: var(--text-muted);
}

.kv-val {
  font-size: 13px;
  color: #fff;
  word-break: break-all;
}

.item-error {
  background: rgba(244, 63, 94, 0.1);
  padding: 6px;
  border-radius: 4px;
}

.item-error-msg {
  font-size: 11px;
  color: #fda4af;
  margin-top: 2px;
}
</style>
