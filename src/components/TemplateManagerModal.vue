<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content template-modal-box">
      <div class="modal-header">
        <div class="modal-title">
          <FolderArchive :size="20" class="text-primary" />
          <span>清洗与映射方案模板管理</span>
        </div>
        <button class="modal-close" @click="$emit('close')">×</button>
      </div>

      <div class="modal-body">
        <!-- 保存当前方案为新模板 -->
        <div class="save-current-box card-elevated">
          <div class="save-box-title">
            <BookmarkPlus :size="16" class="text-amber" />
            <span>将当前配置保存为新方案模板</span>
          </div>

          <div class="save-form-row">
            <input
              v-model="newTemplateName"
              class="form-input form-input-sm"
              placeholder="请输入模板名称，例如: 销售明细清洗规范"
            />
            <input
              v-model="newTemplateDesc"
              class="form-input form-input-sm"
              placeholder="简要说明（可选）"
            />
            <button class="btn btn-primary btn-sm" @click="handleSaveCurrent">
              <Save :size="14" />
              <span>保存当前配置</span>
            </button>
          </div>
        </div>

        <!-- 方案列表 -->
        <div class="templates-list-section">
          <div class="list-section-header">
            <span class="sub-label">已保存方案列表 ({{ templates.length }} 个):</span>
            <div class="import-export-actions">
              <label class="btn btn-outline btn-sm import-btn">
                <Upload :size="13" />
                <span>导入 JSON 模板</span>
                <input
                  type="file"
                  accept=".json"
                  class="hidden-file-input"
                  @change="handleImportTemplate"
                />
              </label>
            </div>
          </div>

          <div class="templates-items">
            <div
              v-for="tpl in templates"
              :key="tpl.id"
              class="template-card"
            >
              <div class="template-main">
                <div class="template-name-row">
                  <span class="template-name">{{ tpl.name }}</span>
                  <span class="badge badge-neutral">{{ tpl.targetSchema?.fields?.length || 0 }} 个字段</span>
                </div>
                <div v-if="tpl.description" class="template-desc">{{ tpl.description }}</div>
                <div class="template-time">更新时间: {{ formatTime(tpl.updatedAt) }}</div>
              </div>

              <div class="template-actions">
                <button
                  class="btn btn-primary btn-sm"
                  title="应用此模板并覆盖当前映射配置"
                  @click="applyTemplate(tpl)"
                >
                  <Check :size="13" />
                  <span>载入应用</span>
                </button>

                <button
                  class="btn btn-outline btn-sm"
                  title="导出为 JSON 文件备份"
                  @click="exportTemplate(tpl)"
                >
                  <Download :size="13" />
                </button>

                <button
                  v-if="!tpl.id.startsWith('tpl_preset')"
                  class="btn btn-outline btn-sm btn-del"
                  title="删除此模板"
                  @click="removeTemplate(tpl.id)"
                >
                  <Trash2 :size="13" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import {
  FolderArchive,
  BookmarkPlus,
  Save,
  Upload,
  Check,
  Download,
  Trash2
} from 'lucide-vue-next'
import { getSavedTemplates, saveTemplate, deleteTemplate } from '../utils/storage'

const props = defineProps({
  currentConfig: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'apply-template', 'notify'])

const templates = ref(getSavedTemplates())
const newTemplateName = ref('')
const newTemplateDesc = ref('')

function handleSaveCurrent() {
  if (!newTemplateName.value.trim()) {
    emit('notify', { message: '请输入模板名称', type: 'warning' })
    return
  }

  saveTemplate(newTemplateName.value.trim(), {
    targetSchema: props.currentConfig.targetSchema,
    mappingRules: props.currentConfig.mappingRules,
    options: props.currentConfig.options,
    description: newTemplateDesc.value.trim()
  })

  templates.value = getSavedTemplates()
  newTemplateName.value = ''
  newTemplateDesc.value = ''
  emit('notify', { message: '模板已保存成功！', type: 'success' })
}

function applyTemplate(tpl) {
  emit('apply-template', tpl)
  emit('notify', { message: `已成功载入模板 [${tpl.name}]`, type: 'success' })
  emit('close')
}

function removeTemplate(id) {
  templates.value = deleteTemplate(id)
  emit('notify', { message: '模板已删除', type: 'info' })
}

function exportTemplate(tpl) {
  const jsonStr = JSON.stringify(tpl, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `template_${tpl.name}.json`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function handleImportTemplate(e) {
  const file = e.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result)
      if (!parsed.targetSchema || !parsed.mappingRules) {
        throw new Error('无效的模板文件结构')
      }
      saveTemplate(parsed.name || `导入模板_${Date.now()}`, {
        targetSchema: parsed.targetSchema,
        mappingRules: parsed.mappingRules,
        options: parsed.options || {},
        description: parsed.description || '从外部 JSON 导入'
      })
      templates.value = getSavedTemplates()
      emit('notify', { message: '模板导入成功！', type: 'success' })
    } catch (err) {
      emit('notify', { message: '导入失败: ' + err.message, type: 'error' })
    }
  }
  reader.readAsText(file)
  e.target.value = ''
}

function formatTime(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch (e) {
    return isoStr
  }
}
</script>

<style scoped>
.template-modal-box {
  max-width: 820px;
}

.modal-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 65vh;
  overflow-y: auto;
}

.save-current-box {
  padding: 16px 20px;
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.save-box-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.save-form-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.templates-list-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.list-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sub-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.import-btn {
  position: relative;
  cursor: pointer;
}

.hidden-file-input {
  display: none;
}

.templates-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.template-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-medium);
  padding: 14px 18px;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.template-card:hover {
  border-color: var(--border-highlight);
}

.template-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.template-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.template-name {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.template-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.template-time {
  font-size: 11px;
  color: var(--text-muted);
}

.template-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-del:hover {
  background: var(--danger-light);
  border-color: var(--danger-border);
  color: #fda4af;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid var(--border-subtle);
  background: rgba(15, 23, 42, 0.5);
}
</style>
