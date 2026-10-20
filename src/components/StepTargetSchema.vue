<template>
  <div class="step-schema-container">
    <!-- 顶部概览与模式切换操作栏 -->
    <div class="card schema-meta-card">
      <div class="table-info-group">
        <div class="input-block">
          <label class="block-label">
            <Database :size="15" class="text-primary" />
            <span>目标数据库表名 (Table Name):</span>
          </label>
          <input
            v-model="localSchema.tableName"
            class="form-input table-name-input"
            placeholder="例如: t_user, customer_info"
            @change="emitUpdate"
          />
        </div>

        <div class="input-block">
          <label class="block-label">
            <FileText :size="15" class="text-secondary" />
            <span>表业务描述 / 注释:</span>
          </label>
          <input
            v-model="localSchema.tableComment"
            class="form-input table-comment-input"
            placeholder="例如: 客户中心基础信息主表"
            @change="emitUpdate"
          />
        </div>
      </div>

      <!-- 快速导入/生成目标结构方式 -->
      <div class="quick-modes">
        <button class="btn btn-primary btn-sm" @click="showSqlModal = true">
          <Code2 :size="15" />
          <span>粘贴 SQL 建表 DDL 解析</span>
        </button>

        <button
          v-if="sourceHeaders && sourceHeaders.length > 0"
          class="btn btn-secondary btn-sm"
          @click="cloneFromSourceHeaders"
          title="直接以 Excel 的所有列名快速生成对应的目标字段"
        >
          <Copy :size="15" />
          <span>以 Excel 列名快速克隆</span>
        </button>

        <button class="btn btn-outline btn-sm" @click="applyPresetUser">
          <Sparkles :size="15" class="text-amber" />
          <span>载入标准用户表模板</span>
        </button>
      </div>
    </div>

    <!-- 字段结构列表卡片 -->
    <div class="card fields-list-card">
      <div class="fields-header">
        <div class="fields-title">
          <Table :size="18" class="text-primary" />
          <span>目标表字段列表 (共 {{ localSchema.fields.length }} 个字段)</span>
        </div>

        <div class="fields-actions">
          <button class="btn btn-secondary btn-sm" @click="addNewField">
            <Plus :size="15" />
            <span>添加新字段</span>
          </button>

          <button class="btn btn-primary" @click="$emit('go-next')">
            <span>下一步：配置字段映射与清洗</span>
            <ArrowRight :size="16" />
          </button>
        </div>
      </div>

      <!-- 字段明细表格 -->
      <div class="table-scroll-wrapper">
        <table class="fields-table">
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th style="width: 170px;">物理字段名 (Field)</th>
              <th style="width: 160px;">中文名称 (Label)</th>
              <th style="width: 140px;">数据类型 (Type)</th>
              <th style="width: 90px;">长度/精度</th>
              <th style="width: 80px; text-align: center;">必填</th>
              <th style="width: 80px; text-align: center;">主键</th>
              <th style="width: 130px;">默认值</th>
              <th>字段注释 (Comment)</th>
              <th style="width: 70px; text-align: center;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(field, index) in localSchema.fields" :key="index">
              <td class="td-index">{{ index + 1 }}</td>
              
              <!-- 物理字段名 -->
              <td>
                <input
                  v-model="field.name"
                  class="form-input form-input-sm mono-text"
                  placeholder="field_name"
                  @change="emitUpdate"
                />
              </td>

              <!-- 中文名称 -->
              <td>
                <input
                  v-model="field.label"
                  class="form-input form-input-sm"
                  placeholder="例如: 手机号"
                  @change="emitUpdate"
                />
              </td>

              <!-- 数据类型 -->
              <td>
                <select
                  v-model="field.type"
                  class="form-select form-select-sm"
                  @change="emitUpdate"
                >
                  <option value="varchar">VARCHAR (字符串)</option>
                  <option value="int">INT (整数)</option>
                  <option value="decimal">DECIMAL (金额/浮点)</option>
                  <option value="datetime">DATETIME (时间)</option>
                  <option value="date">DATE (日期)</option>
                  <option value="boolean">BOOLEAN (布尔)</option>
                  <option value="json">JSON</option>
                  <option value="text">TEXT (长文本)</option>
                </select>
              </td>

              <!-- 长度 -->
              <td>
                <input
                  v-model="field.length"
                  class="form-input form-input-sm mono-text"
                  placeholder="如: 50, 12,2"
                  @change="emitUpdate"
                />
              </td>

              <!-- 是否必填 -->
              <td style="text-align: center;">
                <input
                  type="checkbox"
                  v-model="field.nullable"
                  :true-value="false"
                  :false-value="true"
                  class="styled-checkbox"
                  title="选中表示 NOT NULL"
                  @change="emitUpdate"
                />
              </td>

              <!-- 是否主键 -->
              <td style="text-align: center;">
                <input
                  type="checkbox"
                  v-model="field.isPrimary"
                  class="styled-checkbox"
                  @change="emitUpdate"
                />
              </td>

              <!-- 默认值 -->
              <td>
                <input
                  v-model="field.defaultValue"
                  class="form-input form-input-sm"
                  placeholder="无默认值"
                  @change="emitUpdate"
                />
              </td>

              <!-- 注释 -->
              <td>
                <input
                  v-model="field.comment"
                  class="form-input form-input-sm"
                  placeholder="说明"
                  @change="emitUpdate"
                />
              </td>

              <!-- 操作 -->
              <td style="text-align: center;">
                <button
                  class="icon-del-btn"
                  title="删除字段"
                  @click="removeField(index)"
                >
                  <Trash2 :size="16" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- SQL DDL 解析模态弹窗 -->
    <div v-if="showSqlModal" class="modal-overlay" @click.self="showSqlModal = false">
      <div class="modal-content sql-modal-box">
        <div class="modal-header">
          <div class="modal-title">
            <Code2 :size="20" class="text-primary" />
            <span>粘贴 SQL 建表语句 (CREATE TABLE)</span>
          </div>
          <button class="modal-close" @click="showSqlModal = false">×</button>
        </div>

        <div class="modal-body">
          <p class="modal-hint">
            支持从 Navicat、DBeaver、DataGrip 或 MySQL 导出的建表 SQL，自动提取表名、字段名、数据类型、注释、主键及默认值！
          </p>
          <textarea
            v-model="sqlInputText"
            class="form-textarea sql-textarea"
            rows="10"
            placeholder="CREATE TABLE `t_customer` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `cust_no` varchar(32) NOT NULL COMMENT '客户编号',
  `cust_name` varchar(64) DEFAULT NULL COMMENT '客户姓名',
  `phone` varchar(20) NOT NULL COMMENT '手机号',
  `balance` decimal(10,2) DEFAULT '0.00' COMMENT '余额',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='老系统客户迁移表';"
          ></textarea>
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline" @click="showSqlModal = false">取消</button>
          <button class="btn btn-primary" @click="handleParseSql">
            <Sparkles :size="15" />
            <span>开始智能解析</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import {
  Database,
  FileText,
  Code2,
  Copy,
  Sparkles,
  Table,
  Plus,
  ArrowRight,
  Trash2
} from 'lucide-vue-next'
import { parseSqlDdl } from '../utils/sqlParser'
import { SAMPLE_TARGET_SCHEMA } from '../utils/sampleData'

const props = defineProps({
  targetSchema: {
    type: Object,
    required: true
  },
  sourceHeaders: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:targetSchema', 'go-next', 'notify'])

const localSchema = reactive({
  tableName: props.targetSchema.tableName || 'target_table',
  tableComment: props.targetSchema.tableComment || '',
  fields: JSON.parse(JSON.stringify(props.targetSchema.fields || []))
})

watch(() => props.targetSchema, (newVal) => {
  if (newVal) {
    localSchema.tableName = newVal.tableName || 'target_table'
    localSchema.tableComment = newVal.tableComment || ''
    localSchema.fields = JSON.parse(JSON.stringify(newVal.fields || []))
  }
}, { deep: true })

const showSqlModal = ref(false)
const sqlInputText = ref('')

function emitUpdate() {
  emit('update:targetSchema', {
    tableName: localSchema.tableName,
    tableComment: localSchema.tableComment,
    fields: localSchema.fields
  })
}

function addNewField() {
  localSchema.fields.push({
    name: `new_col_${localSchema.fields.length + 1}`,
    label: `新字段 ${localSchema.fields.length + 1}`,
    type: 'varchar',
    length: 255,
    nullable: true,
    isPrimary: false,
    defaultValue: '',
    comment: ''
  })
  emitUpdate()
}

function removeField(index) {
  localSchema.fields.splice(index, 1)
  emitUpdate()
}

function cloneFromSourceHeaders() {
  if (!props.sourceHeaders || props.sourceHeaders.length === 0) return
  localSchema.fields = props.sourceHeaders.map(header => {
    const cleanHeader = header.trim()
    return {
      name: cleanHeader.replace(/[^\w\u4e00-\u9fa5]/g, '_').toLowerCase(),
      label: cleanHeader,
      type: 'varchar',
      length: 255,
      nullable: true,
      isPrimary: false,
      defaultValue: '',
      comment: cleanHeader
    }
  })
  emitUpdate()
  emit('notify', { message: `已成功从源 Excel 克隆 ${localSchema.fields.length} 个字段`, type: 'success' })
}

function applyPresetUser() {
  localSchema.tableName = SAMPLE_TARGET_SCHEMA.tableName
  localSchema.tableComment = SAMPLE_TARGET_SCHEMA.tableComment
  localSchema.fields = JSON.parse(JSON.stringify(SAMPLE_TARGET_SCHEMA.fields))
  emitUpdate()
  emit('notify', { message: '已成功载入标准用户表结构模板', type: 'success' })
}

function handleParseSql() {
  if (!sqlInputText.value.trim()) {
    emit('notify', { message: '请先粘贴 CREATE TABLE 建表语句', type: 'warning' })
    return
  }

  try {
    const parsed = parseSqlDdl(sqlInputText.value)
    localSchema.tableName = parsed.tableName
    localSchema.tableComment = parsed.tableComment
    localSchema.fields = parsed.fields
    emitUpdate()
    showSqlModal.value = false
    emit('notify', { message: `成功解析表 [${parsed.tableName}]，提取到 ${parsed.fields.length} 个字段`, type: 'success' })
  } catch (err) {
    emit('notify', { message: 'SQL 解析失败: ' + err.message, type: 'error' })
  }
}
</script>

<style scoped>
.step-schema-container {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.schema-meta-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  padding: 20px 24px;
}

.table-info-group {
  display: flex;
  align-items: center;
  gap: 20px;
  flex: 1;
  min-width: 320px;
}

.input-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.block-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.table-name-input {
  font-family: var(--font-mono);
  font-weight: 600;
  color: #a5b4fc;
}

.quick-modes {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* 字段列表卡片 */
.fields-list-card {
  padding: 20px 24px;
}

.fields-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.fields-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
}

.fields-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.table-scroll-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.fields-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.fields-table thead th {
  background: #141c2b;
  color: var(--text-secondary);
  font-weight: 600;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-medium);
  white-space: nowrap;
}

.fields-table tbody td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: middle;
}

.td-index {
  text-align: center;
  font-family: var(--font-mono);
  color: var(--text-muted);
  font-size: 12px;
}

.mono-text {
  font-family: var(--font-mono);
}

.form-input-sm, .form-select-sm {
  padding: 6px 9px;
  font-size: 13px;
}

.styled-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  cursor: pointer;
}

.icon-del-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.icon-del-btn:hover {
  background: var(--danger-light);
  color: var(--danger);
}

/* SQL 弹窗 */
.sql-modal-box {
  max-width: 720px;
}

.modal-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-hint {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.sql-textarea {
  font-size: 12px;
  color: #a5b4fc;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-subtle);
  background: rgba(15, 23, 42, 0.5);
}
</style>
