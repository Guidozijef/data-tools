<template>
  <div class="step-export-container">
    <!-- 顶部状态栏与模式选项卡 -->
    <div class="card export-tabs-card">
      <div class="export-mode-tabs">
        <button
          class="mode-tab-btn"
          :class="{ 'is-active': activeTab === 'sql' }"
          @click="activeTab = 'sql'"
        >
          <Database :size="16" />
          <span>直接导入数据库 (SQL 脚本生成)</span>
          <span class="badge badge-primary">推荐</span>
        </button>

        <button
          class="mode-tab-btn"
          :class="{ 'is-active': activeTab === 'excel' }"
          @click="activeTab = 'excel'"
        >
          <FileSpreadsheet :size="16" />
          <span>导出清洗后 Excel (.xlsx)</span>
        </button>

        <button
          class="mode-tab-btn"
          :class="{ 'is-active': activeTab === 'csv' }"
          @click="activeTab = 'csv'"
        >
          <FileText :size="16" />
          <span>导出 CSV / JSON</span>
        </button>
      </div>

      <div class="export-stats-badge">
        <CheckCircle2 :size="15" class="text-success" />
        <span>已就绪 {{ cleanedRows.length }} 条清洗完好的数据记录</span>
      </div>
    </div>

    <!-- 选项卡 1: SQL 脚本直接生成 -->
    <div v-if="activeTab === 'sql'" class="export-tab-panel">
      <!-- SQL 配置栏 -->
      <div class="card sql-config-card">
        <div class="sql-config-grid">
          <!-- 数据库方言 -->
          <div class="config-item">
            <label class="config-label">目标数据库类型:</label>
            <select v-model="sqlOptions.dialect" class="form-select form-select-sm" @change="regenerateSql">
              <option value="mysql">MySQL 5.7 / 8.0+</option>
              <option value="postgresql">PostgreSQL 12+</option>
              <option value="sqlite">SQLite 3</option>
              <option value="oracle">Oracle Database</option>
            </select>
          </div>

          <!-- 插入模式 -->
          <div class="config-item">
            <label class="config-label">写入模式 (Insert Mode):</label>
            <select v-model="sqlOptions.insertMode" class="form-select form-select-sm" @change="regenerateSql">
              <option value="INSERT INTO">标准 INSERT INTO (遇重复报错)</option>
              <option v-if="sqlOptions.dialect === 'mysql'" value="INSERT IGNORE">INSERT IGNORE (忽略重复行)</option>
              <option v-if="sqlOptions.dialect === 'mysql'" value="REPLACE INTO">REPLACE INTO (重复则替换整行)</option>
              <option value="ON DUPLICATE KEY UPDATE">ON DUPLICATE KEY UPDATE (重复则更新)</option>
            </select>
          </div>

          <!-- 分批数量 -->
          <div class="config-item">
            <label class="config-label">每批批量插入行数:</label>
            <select v-model="sqlOptions.batchSize" class="form-select form-select-sm" @change="regenerateSql">
              <option :value="50">50 行 / 批</option>
              <option :value="100">100 行 / 批</option>
              <option :value="200">200 行 / 批 (推荐)</option>
              <option :value="500">500 行 / 批</option>
              <option :value="1000">1000 行 / 批</option>
            </select>
          </div>

          <!-- 附加建表语句 -->
          <div class="config-item config-item-checkbox">
            <label class="checkbox-label">
              <input
                type="checkbox"
                v-model="sqlOptions.includeCreateTable"
                @change="regenerateSql"
              />
              <span>在开头附带 CREATE TABLE 建表语句</span>
            </label>
          </div>
        </div>

        <!-- SQL 操作按钮 -->
        <div class="sql-action-row">
          <button class="btn btn-secondary" @click="copySql">
            <Copy :size="15" />
            <span>{{ isCopied ? '已成功复制到剪贴板！' : '复制完整 SQL' }}</span>
          </button>

          <button class="btn btn-primary" @click="downloadSql">
            <Download :size="15" />
            <span>下载 {{ targetSchema.tableName || 'import' }}.sql 文件</span>
          </button>
        </div>
      </div>

      <!-- SQL 代码预览器 (Syntax Highlight Aesthetic) -->
      <div class="card sql-viewer-card">
        <div class="viewer-header">
          <div class="viewer-title">
            <Code2 :size="16" class="text-primary" />
            <span>SQL 生成预览 (显示前 500 行脚本)</span>
          </div>
          <span class="viewer-meta mono-text text-muted">
            表名: {{ targetSchema.tableName }} | {{ cleanedRows.length }} 记录 | {{ sqlFileSize }}
          </span>
        </div>

        <pre class="sql-code-block"><code>{{ displayedSql }}</code></pre>
      </div>
    </div>

    <!-- 选项卡 2: 导出 Excel (.xlsx) -->
    <div v-if="activeTab === 'excel'" class="export-tab-panel">
      <div class="card export-form-card">
        <div class="form-section-title">
          <FileSpreadsheet :size="20" class="text-success" />
          <span>导出为清洗完好的标准 Excel 文件</span>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">导出文件名:</label>
            <div class="input-with-suffix">
              <input
                v-model="excelConfig.fileName"
                class="form-input"
                placeholder="cleaned_data"
              />
              <span class="suffix-tag">.xlsx</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">工作表 (Sheet) 名称:</label>
            <input
              v-model="excelConfig.sheetName"
              class="form-input"
              placeholder="CleanedData"
            />
          </div>

          <div class="form-group">
            <label class="form-label">表头格式:</label>
            <select v-model="excelConfig.headerMode" class="form-select">
              <option value="label">使用中文业务名称 (如: 手机号, 用户名)</option>
              <option value="name">使用物理字段名 (如: mobile, username)</option>
              <option value="both">物理字段名 + 中文 (如: mobile (手机号))</option>
            </select>
          </div>
        </div>

        <!-- 字段勾选 -->
        <div class="export-columns-picker">
          <label class="form-label">勾选要导出的目标字段:</label>
          <div class="columns-grid">
            <label
              v-for="field in targetFields"
              :key="field.name"
              class="col-checkbox-label"
            >
              <input
                type="checkbox"
                :checked="excelConfig.selectedColumns.includes(field.name)"
                @change="toggleColumn(field.name)"
              />
              <span class="mono-text">{{ field.name }}</span>
              <span class="col-label-sub">({{ field.label }})</span>
            </label>
          </div>
        </div>

        <div class="export-submit-row">
          <button class="btn btn-primary btn-lg" @click="handleExportExcel">
            <Download :size="18" />
            <span>立即生成并下载 Excel (.xlsx)</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 选项卡 3: 导出 CSV / JSON -->
    <div v-if="activeTab === 'csv'" class="export-tab-panel">
      <div class="csv-json-grid">
        <!-- CSV 导出 -->
        <div class="card format-card">
          <div class="format-icon bg-emerald">
            <FileText :size="24" />
          </div>
          <h3 class="format-title">导出 CSV 文件</h3>
          <p class="format-desc">
            内置 <strong>UTF-8 with BOM</strong> 编码规范，完美避免 Windows Excel 直接双击打开中文出现乱码的问题！
          </p>

          <div class="format-input-group">
            <label class="form-label">CSV 文件名:</label>
            <input v-model="csvFileName" class="form-input form-input-sm" />
          </div>

          <button class="btn btn-success" @click="handleExportCsv">
            <Download :size="16" />
            <span>下载 .csv 文件</span>
          </button>
        </div>

        <!-- JSON 导出 -->
        <div class="card format-card">
          <div class="format-icon bg-indigo">
            <Code2 :size="24" />
          </div>
          <h3 class="format-title">导出 JSON 文件</h3>
          <p class="format-desc">
            标准结构化 JSON 格式，适合直接导入 MongoDB、Elasticsearch，或通过前后端接口批量 Post 上报！
          </p>

          <div class="format-input-group">
            <label class="form-label">JSON 文件名:</label>
            <input v-model="jsonFileName" class="form-input form-input-sm" />
          </div>

          <button class="btn btn-secondary" @click="handleExportJson">
            <Download :size="16" />
            <span>下载 .json 文件</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import {
  Database,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Copy,
  Download,
  Code2
} from 'lucide-vue-next'
import { generateSqlScript } from '../utils/sqlGenerator'
import { exportToExcel, exportToCsv, exportToJson } from '../utils/excelHelper'

const props = defineProps({
  cleanedRows: {
    type: Array,
    required: true
  },
  targetSchema: {
    type: Object,
    required: true
  },
  targetFields: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['notify'])

const activeTab = ref('sql') // sql | excel | csv
const isCopied = ref(false)

// SQL 配置
const sqlOptions = reactive({
  dialect: 'mysql',
  insertMode: 'INSERT INTO',
  batchSize: 200,
  includeCreateTable: false
})

const generatedSql = ref('')

function regenerateSql() {
  generatedSql.value = generateSqlScript(props.cleanedRows, props.targetSchema, sqlOptions)
}

onMounted(() => {
  regenerateSql()
})

watch(() => props.cleanedRows, () => {
  regenerateSql()
}, { deep: true })

const displayedSql = computed(() => {
  const lines = generatedSql.value.split('\n')
  if (lines.length > 500) {
    return lines.slice(0, 500).join('\n') + `\n\n-- ... 剩余 ${lines.length - 500} 行已省略预览，下载文件或点击复制获取完整脚本`
  }
  return generatedSql.value
})

const sqlFileSize = computed(() => {
  const bytes = new Blob([generatedSql.value]).size
  if (bytes < 1024) return bytes + ' B'
  return (bytes / 1024).toFixed(1) + ' KB'
})

function copySql() {
  navigator.clipboard.writeText(generatedSql.value).then(() => {
    isCopied.value = true
    emit('notify', { message: 'SQL 脚本已成功复制到剪贴板！', type: 'success' })
    setTimeout(() => {
      isCopied.value = false
    }, 2500)
  }).catch(() => {
    emit('notify', { message: '复制失败，请手动全选复制', type: 'error' })
  })
}

function downloadSql() {
  const blob = new Blob([generatedSql.value], { type: 'text/sql;charset=utf-8;' })
  const fileName = `${props.targetSchema.tableName || 'import'}.sql`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  emit('notify', { message: `已成功下载 ${fileName}`, type: 'success' })
}

// Excel 导出配置
const excelConfig = reactive({
  fileName: `cleaned_${props.targetSchema.tableName || 'data'}`,
  sheetName: 'CleanedData',
  headerMode: 'label',
  selectedColumns: props.targetFields.map(f => f.name)
})

watch(() => props.targetFields, (newFields) => {
  excelConfig.selectedColumns = newFields.map(f => f.name)
}, { immediate: true })

function toggleColumn(colName) {
  const idx = excelConfig.selectedColumns.indexOf(colName)
  if (idx !== -1) {
    if (excelConfig.selectedColumns.length > 1) {
      excelConfig.selectedColumns.splice(idx, 1)
    }
  } else {
    excelConfig.selectedColumns.push(colName)
  }
}

function getHeaderLabelsMap() {
  const map = {}
  props.targetFields.forEach(f => {
    if (excelConfig.headerMode === 'label') {
      map[f.name] = f.label || f.name
    } else if (excelConfig.headerMode === 'both') {
      map[f.name] = `${f.name} (${f.label})`
    } else {
      map[f.name] = f.name
    }
  })
  return map
}

function handleExportExcel() {
  try {
    const labelsMap = getHeaderLabelsMap()
    exportToExcel(
      props.cleanedRows,
      excelConfig.fileName,
      excelConfig.sheetName,
      excelConfig.selectedColumns,
      labelsMap
    )
    emit('notify', { message: 'Excel 文件导出成功！', type: 'success' })
  } catch (err) {
    emit('notify', { message: '导出失败: ' + err.message, type: 'error' })
  }
}

// CSV / JSON 导出
const csvFileName = ref(`cleaned_${props.targetSchema.tableName || 'data'}.csv`)
const jsonFileName = ref(`cleaned_${props.targetSchema.tableName || 'data'}.json`)

function handleExportCsv() {
  try {
    const labelsMap = getHeaderLabelsMap()
    exportToCsv(props.cleanedRows, csvFileName.value, excelConfig.selectedColumns, labelsMap)
    emit('notify', { message: 'CSV 文件导出成功 (UTF-8 with BOM)！', type: 'success' })
  } catch (err) {
    emit('notify', { message: '导出失败: ' + err.message, type: 'error' })
  }
}

function handleExportJson() {
  try {
    exportToJson(props.cleanedRows, jsonFileName.value, excelConfig.selectedColumns)
    emit('notify', { message: 'JSON 文件导出成功！', type: 'success' })
  } catch (err) {
    emit('notify', { message: '导出失败: ' + err.message, type: 'error' })
  }
}
</script>

<style scoped>
.step-export-container {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 顶部选项卡 */
.export-tabs-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 20px;
  flex-wrap: wrap;
}

.export-mode-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mode-tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-medium);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mode-tab-btn:hover {
  border-color: var(--primary-border);
  color: #fff;
}

.mode-tab-btn.is-active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
}

.export-stats-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

/* SQL 面板 */
.export-tab-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sql-config-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px;
}

.sql-config-grid {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.config-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.config-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.config-item-checkbox {
  display: flex;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

.sql-action-row {
  display: flex;
  align-items: center;
  gap: 14px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 14px;
}

/* SQL 浏览器 */
.sql-viewer-card {
  padding: 0;
  overflow: hidden;
}

.viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #141c2b;
  border-bottom: 1px solid var(--border-medium);
}

.viewer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
}

.viewer-meta {
  font-size: 12px;
}

.sql-code-block {
  margin: 0;
  padding: 20px;
  background: #0d131f;
  color: #a5b4fc;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  max-height: 480px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Excel 导出卡片 */
.export-form-card {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.input-with-suffix {
  display: flex;
  align-items: center;
}

.input-with-suffix .form-input {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.suffix-tag {
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-medium);
  border-left: none;
  padding: 9px 12px;
  font-size: 13px;
  color: var(--text-muted);
  border-top-right-radius: var(--radius-md);
  border-bottom-right-radius: var(--radius-md);
}

.export-columns-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.columns-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  background: var(--bg-input);
  padding: 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-medium);
  max-height: 240px;
  overflow-y: auto;
}

.col-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.col-checkbox-label input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

.col-label-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.export-submit-row {
  display: flex;
  justify-content: flex-start;
}

/* CSV / JSON 导出网格 */
.csv-json-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.format-card {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: flex-start;
}

.format-icon {
  width: 50px;
  height: 50px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.format-title {
  font-size: 16px;
  font-weight: 700;
}

.format-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.format-input-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
