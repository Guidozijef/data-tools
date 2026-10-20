<template>
  <div class="app-wrapper">
    <!-- 背景氛围流光特效 -->
    <div class="ambient-glow"></div>

    <!-- 全局提示 Toast -->
    <NotificationToast ref="toastRef" />

    <!-- 顶部导航与步骤进度条 -->
    <StepHeader
      :current-step="currentStep"
      :completed-steps="completedSteps"
      :has-source-data="headers.length > 0 && rawRows.length > 0"
      :has-target-schema="targetSchema.fields && targetSchema.fields.length > 0"
      @change-step="goToStep"
      @load-demo="handleLoadDemo"
      @open-templates="showTemplateModal = true"
      @reset-all="handleResetAll"
    />

    <!-- 主工作区内容 -->
    <main class="main-content">
      <!-- 步骤 1: 数据源上传与预览 -->
      <StepUpload
        v-if="currentStep === 1"
        :file-info="fileInfo"
        :sheet-names="sheetNames"
        :current-sheet="currentSheet"
        :headers="headers"
        :rows="rawRows"
        :header-row-index="headerRowIndex"
        :skip-empty-rows="skipEmptyRows"
        @file-selected="handleFileSelected"
        @load-demo="handleLoadDemo"
        @change-sheet="handleChangeSheet"
        @update:header-row-index="onHeaderRowChange"
        @update:skip-empty-rows="skipEmptyRows = $event; parseActiveSheet()"
        @go-next="onStep1Next"
      />

      <!-- 步骤 2: 目标数据库表结构配置 -->
      <StepTargetSchema
        v-else-if="currentStep === 2"
        :target-schema="targetSchema"
        :source-headers="headers"
        @update:target-schema="targetSchema = $event"
        @go-next="onStep2Next"
        @notify="onNotify"
      />

      <!-- 步骤 3: 字段关联映射与清洗规则流水线 -->
      <StepMapping
        v-else-if="currentStep === 3"
        :target-fields="targetSchema.fields"
        :source-headers="headers"
        :sample-rows="rawRows"
        :mapping-rules="mappingRules"
        :options="cleanOptions"
        @update:mapping-rules="mappingRules = $event"
        @update:options="cleanOptions = $event"
        @go-next="onStep3Next"
        @notify="onNotify"
      />

      <!-- 步骤 4: 实时清洗预览、校验与行内纠错 -->
      <StepPreview
        v-else-if="currentStep === 4"
        :cleaned-rows="cleanedRows"
        :stats="cleanStats"
        :target-fields="targetSchema.fields"
        @re-run-cleaning="executeCleaningPipeline"
        @go-next="onStep4Next"
      />

      <!-- 步骤 5: 导出清洗完好的 Excel 或生成数据库 SQL 脚本 -->
      <StepExport
        v-else-if="currentStep === 5"
        :cleaned-rows="cleanedRows"
        :target-schema="targetSchema"
        :target-fields="targetSchema.fields"
        @notify="onNotify"
      />
    </main>

    <!-- 底部状态快捷栏 -->
    <footer class="app-footer">
      <div class="footer-container">
        <div class="footer-status">
          <span v-if="fileInfo.name" class="status-item">
            <span class="status-dot"></span>
            当前文件: <strong>{{ fileInfo.name }}</strong> ({{ rawRows.length }} 行)
          </span>
          <span v-if="targetSchema.tableName" class="status-item">
            目标表: <strong>{{ targetSchema.tableName }}</strong> ({{ targetSchema.fields.length }} 字段)
          </span>
          <span v-if="cleanedRows.length > 0" class="status-item text-success">
            已清洗: <strong>{{ cleanedRows.length }}</strong> 行数据
          </span>
        </div>

        <div class="footer-actions">
          <button
            v-if="currentStep > 1"
            class="btn btn-outline btn-sm"
            @click="currentStep--"
          >
            ← 上一步
          </button>

          <button
            v-if="currentStep < 5"
            class="btn btn-primary btn-sm"
            :disabled="!canProceedToNext"
            @click="proceedToNextStep"
          >
            <span>{{ getNextStepButtonLabel() }}</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </footer>

    <!-- 规则模板管理弹窗 -->
    <TemplateManagerModal
      v-if="showTemplateModal"
      :current-config="{
        targetSchema,
        mappingRules,
        options: cleanOptions
      }"
      @close="showTemplateModal = false"
      @apply-template="handleApplyTemplate"
      @notify="onNotify"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import NotificationToast from './components/NotificationToast.vue'
import StepHeader from './components/StepHeader.vue'
import StepUpload from './components/StepUpload.vue'
import StepTargetSchema from './components/StepTargetSchema.vue'
import StepMapping from './components/StepMapping.vue'
import StepPreview from './components/StepPreview.vue'
import StepExport from './components/StepExport.vue'
import TemplateManagerModal from './components/TemplateManagerModal.vue'

import { readExcelFile, parseSheetData } from './utils/excelHelper'
import { runCleaningPipeline, autoMatchFields } from './utils/cleaner'
import {
  SAMPLE_SHEETS,
  SAMPLE_SOURCE_HEADERS,
  SAMPLE_SOURCE_ROWS,
  SAMPLE_TARGET_SCHEMA,
  SAMPLE_MAPPING_RULES
} from './utils/sampleData'

const toastRef = ref(null)
const currentStep = ref(1)
const completedSteps = ref([])
const showTemplateModal = ref(false)

// 1. 数据源状态
const fileInfo = reactive({ name: '', size: 0 })
const activeWorkbook = ref(null)
const sheetNames = ref([])
const currentSheet = ref('')
const headers = ref([])
const rawRows = ref([])
const headerRowIndex = ref(0)
const skipEmptyRows = ref(true)

// 2. 目标库结构
const targetSchema = ref({
  tableName: 't_user',
  tableComment: '用户中心基础信息表',
  fields: JSON.parse(JSON.stringify(SAMPLE_TARGET_SCHEMA.fields))
})

// 3. 字段映射与清洗规则流水线
const mappingRules = ref([])
const cleanOptions = ref({
  dedupField: 'user_code',
  dedupStrategy: 'keep_first',
  skipEmptyRows: true,
  requiredFields: ['user_code']
})

// 4. 清洗后结果数据与统计
const cleanedRows = ref([])
const cleanStats = reactive({
  totalRawRows: 0,
  processedRows: 0,
  validRows: 0,
  hasErrorRows: 0,
  dedupDroppedRows: 0,
  emptyDroppedRows: 0
})
const errorSummary = ref([])

onMounted(() => {
  // 默认自启动演示数据，方便用户即开即测
  handleLoadDemo(false)
})

function onNotify({ message, type = 'info', title = '' }) {
  if (toastRef.value) {
    toastRef.value.show(message, type, title)
  }
}

// 文件上传与解析
async function handleFileSelected(file) {
  try {
    const res = await readExcelFile(file)
    activeWorkbook.value = res.workbook
    sheetNames.value = res.sheetNames
    currentSheet.value = res.defaultSheet
    fileInfo.name = file.name
    fileInfo.size = file.size
    headerRowIndex.value = 0

    parseActiveSheet()
    onNotify({ message: `成功解析文件 [${file.name}]，读取到 ${sheetNames.value.length} 个工作表`, type: 'success' })
  } catch (err) {
    onNotify({ message: err.message, type: 'error' })
  }
}

function handleChangeSheet(sheet) {
  currentSheet.value = sheet
  if (SAMPLE_SHEETS[sheet] && !activeWorkbook.value) {
    headers.value = [...SAMPLE_SHEETS[sheet].headers]
    rawRows.value = JSON.parse(JSON.stringify(SAMPLE_SHEETS[sheet].rows))
    mappingRules.value = autoMatchFields(headers.value, targetSchema.value.fields)
    onNotify({ message: `已切换至工作表: [${sheet}] (${rawRows.value.length} 行数据)`, type: 'info' })
  } else {
    parseActiveSheet()
    onNotify({ message: `已切换至工作表: [${sheet}] (${rawRows.value.length} 行数据)`, type: 'info' })
  }
}

function onHeaderRowChange(val) {
  headerRowIndex.value = val
  parseActiveSheet()
}

function parseActiveSheet() {
  if (!activeWorkbook.value || !currentSheet.value) return
  const parsed = parseSheetData(activeWorkbook.value, currentSheet.value, {
    headerRowIndex: headerRowIndex.value,
    skipEmptyRows: skipEmptyRows.value
  })

  headers.value = parsed.headers
  rawRows.value = parsed.rows

  // 重新生成推荐映射
  mappingRules.value = autoMatchFields(headers.value, targetSchema.value.fields)
}

// 载入演示数据
function handleLoadDemo(showToast = true) {
  const defaultSheetName = Object.keys(SAMPLE_SHEETS)[0]
  fileInfo.name = '历史系统客户与多层JSON扩展_demo.xlsx'
  fileInfo.size = 18450
  sheetNames.value = Object.keys(SAMPLE_SHEETS)
  currentSheet.value = defaultSheetName
  headers.value = [...SAMPLE_SHEETS[defaultSheetName].headers]
  rawRows.value = JSON.parse(JSON.stringify(SAMPLE_SHEETS[defaultSheetName].rows))
  headerRowIndex.value = 0

  targetSchema.value = {
    tableName: SAMPLE_TARGET_SCHEMA.tableName,
    tableComment: SAMPLE_TARGET_SCHEMA.tableComment,
    fields: JSON.parse(JSON.stringify(SAMPLE_TARGET_SCHEMA.fields))
  }

  mappingRules.value = JSON.parse(JSON.stringify(SAMPLE_MAPPING_RULES))

  // 立即执行清洗
  executeCleaningPipeline()

  markCompleted(1)
  markCompleted(2)
  markCompleted(3)

  if (showToast) {
    onNotify({
      message: '已成功载入完整演示数据与推荐清洗规则，可直接切换各步骤查看效果！',
      type: 'success',
      title: '演示数据已就绪'
    })
  }
}

function handleResetAll() {
  fileInfo.name = ''
  fileInfo.size = 0
  activeWorkbook.value = null
  sheetNames.value = []
  currentSheet.value = ''
  headers.value = []
  rawRows.value = []
  headerRowIndex.value = 0
  cleanedRows.value = []
  completedSteps.value = []
  currentStep.value = 1
  onNotify({ message: '已清空所有数据与配置', type: 'info' })
}

// 执行清洗流水线
function executeCleaningPipeline() {
  if (rawRows.value.length === 0 || !targetSchema.value.fields || targetSchema.value.fields.length === 0) return

  const res = runCleaningPipeline(
    rawRows.value,
    targetSchema.value.fields,
    mappingRules.value,
    cleanOptions.value
  )

  cleanedRows.value = res.cleanedRows
  Object.assign(cleanStats, res.stats)
  errorSummary.value = res.errorSummary
}

// 步骤切换与校验
function markCompleted(stepNum) {
  if (!completedSteps.value.includes(stepNum)) {
    completedSteps.value.push(stepNum)
  }
}

function goToStep(stepNum) {
  if (stepNum === 4 || stepNum === 5) {
    executeCleaningPipeline()
  }
  currentStep.value = stepNum
}

const canProceedToNext = computed(() => {
  if (currentStep.value === 1) return headers.value.length > 0 && rawRows.value.length > 0
  if (currentStep.value === 2) return targetSchema.value.fields && targetSchema.value.fields.length > 0
  if (currentStep.value === 3) return mappingRules.value.length > 0
  return true
})

function getNextStepButtonLabel() {
  switch (currentStep.value) {
    case 1: return '配置目标表结构'
    case 2: return '配置字段关联映射'
    case 3: return '执行清洗并预览'
    case 4: return '前往导出与入库'
    default: return '下一步'
  }
}

function proceedToNextStep() {
  if (currentStep.value === 1) onStep1Next()
  else if (currentStep.value === 2) onStep2Next()
  else if (currentStep.value === 3) onStep3Next()
  else if (currentStep.value === 4) onStep4Next()
}

function onStep1Next() {
  markCompleted(1)
  currentStep.value = 2
}

function onStep2Next() {
  if (!targetSchema.value.fields || targetSchema.value.fields.length === 0) {
    onNotify({ message: '目标数据库表至少需要定义一个字段', type: 'warning' })
    return
  }
  // 如果尚未生成映射规则，自动进行智能匹配
  if (mappingRules.value.length === 0 || mappingRules.value.length !== targetSchema.value.fields.length) {
    mappingRules.value = autoMatchFields(headers.value, targetSchema.value.fields)
  }
  markCompleted(2)
  currentStep.value = 3
}

function onStep3Next() {
  executeCleaningPipeline()
  markCompleted(3)
  currentStep.value = 4
}

function onStep4Next() {
  markCompleted(4)
  currentStep.value = 5
}

// 模板应用
function handleApplyTemplate(tpl) {
  if (tpl.targetSchema) {
    targetSchema.value = {
      tableName: tpl.targetSchema.tableName || 'target_table',
      tableComment: tpl.targetSchema.tableComment || '',
      fields: JSON.parse(JSON.stringify(tpl.targetSchema.fields || []))
    }
  }
  if (tpl.mappingRules) {
    mappingRules.value = JSON.parse(JSON.stringify(tpl.mappingRules))
  }
  if (tpl.options) {
    cleanOptions.value = { ...cleanOptions.value, ...tpl.options }
  }
  executeCleaningPipeline()
}
</script>

<style scoped>
.app-wrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  background-color: var(--bg-app);
}

.main-content {
  flex: 1;
  position: relative;
  z-index: 1;
  padding-bottom: 70px;
}

/* 底部状态快捷栏 */
.app-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--border-medium);
  z-index: 90;
}

.footer-container {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 10px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-status {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 13px;
  color: var(--text-secondary);
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
