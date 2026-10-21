<template>
  <div class="step-mapping-container">
    <!-- 顶部摘要与自动匹配栏 -->
    <div class="card mapping-toolbar-card">
      <div class="summary-info">
        <div class="status-counter">
          <span class="counter-label">映射进度:</span>
          <span class="counter-value" :class="{ 'is-all-mapped': mappedCount === targetFields.length }">
            {{ mappedCount }} / {{ targetFields.length }}
          </span>
          <span class="badge" :class="mappedCount === targetFields.length ? 'badge-success' : 'badge-warning'">
            {{ mappedCount === targetFields.length ? '全部已关联' : `${targetFields.length - mappedCount} 个待关联` }}
          </span>
        </div>

        <div class="summary-desc">
          为目标数据库中的每个字段指定来源列，并配置清洗规则（如空格清理、字典转换、手机号清洗等）
        </div>
      </div>

      <div class="toolbar-actions">
        <button class="btn btn-secondary btn-sm" @click="handleAutoMatch" title="智能分析字段名与同义词自动匹配">
          <Wand2 :size="15" class="text-amber" />
          <span>智能一键自动匹配</span>
        </button>

        <button class="btn btn-outline btn-sm" @click="clearAllMappings" title="清空当前所有映射关系">
          <RotateCcw :size="14" />
          <span>重置映射</span>
        </button>

        <button class="btn btn-primary" @click="$emit('go-next')">
          <span>下一步：执行清洗与实时校验</span>
          <ArrowRight :size="16" />
        </button>
      </div>
    </div>

    <!-- 全局行级清洗与去重控制栏 -->
    <div class="card global-rules-card">
      <div class="global-rules-title">
        <Sliders :size="16" class="text-primary" />
        <span>全局行级规则与去重控制</span>
      </div>

      <div class="global-rules-grid">
        <!-- 去重字段 -->
        <div class="rule-box">
          <label class="rule-box-label">数据唯一性去重字段:</label>
          <div class="rule-box-control">
            <select
              :value="options.dedupField"
              class="form-select"
              @change="updateOption('dedupField', $event.target.value)"
            >
              <option value="">不去重 (保留所有行)</option>
              <option
                v-for="field in targetFields"
                :key="field.name"
                :value="field.name"
              >
                {{ field.name }} ({{ field.label || field.name }})
              </option>
            </select>
          </div>
        </div>

        <!-- 去重保留策略 -->
        <div v-if="options.dedupField" class="rule-box">
          <label class="rule-box-label">重复行保留策略:</label>
          <div class="rule-box-control">
            <select
              :value="options.dedupStrategy"
              class="form-select"
              @change="updateOption('dedupStrategy', $event.target.value)"
            >
              <option value="keep_first">保留首次出现的行 (Keep First)</option>
              <option value="keep_last">保留最后出现的行 (Keep Last)</option>
            </select>
          </div>
        </div>

        <!-- 过滤全空行 -->
        <div class="rule-box rule-box-inline">
          <label class="checkbox-label">
            <input
              type="checkbox"
              :checked="options.skipEmptyRows"
              @change="updateOption('skipEmptyRows', $event.target.checked)"
            />
            <span>自动丢弃清洗后全空的数据行</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 字段映射明细列表 (Mapping Grid) -->
    <div class="card mapping-list-card">
      <div class="mapping-list-header">
        <div class="col-target-th">目标库字段 (Target Field)</div>
        <div class="col-arrow-th">关联方式</div>
        <div class="col-source-th">源数据来源 (Excel Source)</div>
        <div class="col-rules-th">清洗与转换规则流水线 (Clean Rules)</div>
        <div class="col-action-th">规则配置</div>
      </div>

      <div class="mapping-rows">
        <div
          v-for="field in targetFields"
          :key="field.name"
          class="mapping-row-wrapper"
          :class="{ 'is-expanded': activeExpandedField === field.name }"
        >
          <div class="mapping-row-main">
            <!-- 目标字段详情 -->
            <div class="col-target">
              <div class="target-name-line">
                <span class="target-name">{{ field.name }}</span>
                <span v-if="field.isPrimary" class="badge badge-warning">主键</span>
                <span v-if="!field.nullable" class="badge badge-danger">必填</span>
              </div>
              <div class="target-meta-line">
                <span class="target-label">{{ field.label }}</span>
                <span class="target-type-tag">{{ field.type.toUpperCase() }}</span>
              </div>
            </div>

            <!-- 箭头示意 -->
            <div class="col-arrow">
              <div class="arrow-indicator">
                <ArrowRight :size="16" />
              </div>
            </div>

            <!-- 数据来源选择 -->
            <div class="col-source">
              <div class="source-type-selector">
                <select
                  :value="getRule(field.name).sourceType"
                  class="form-select form-select-sm type-select"
                  @change="setSourceType(field.name, $event.target.value)"
                >
                  <option value="field">📊 Excel 字段</option>
                  <option value="json_path">📦 从 JSON 提取</option>
                  <option value="custom_js">⚡ 自定义 JS 脚本</option>
                  <option value="combine">🔗 多列组合拼接</option>
                  <option value="constant">📌 固定常量值</option>
                  <option value="ignore">🚫 忽略 (不导入)</option>
                </select>

                <!-- 针对不同 sourceType 的输入 -->
                <!-- 1. 单字段映射 -->
                <select
                  v-if="getRule(field.name).sourceType === 'field'"
                  :value="getRule(field.name).sourceField"
                  class="form-select form-select-sm field-select"
                  :class="{ 'is-empty': !getRule(field.name).sourceField }"
                  @change="setSourceField(field.name, $event.target.value)"
                >
                  <option value="">-- 请选择 Excel 列 --</option>
                  <option v-for="h in sourceHeaders" :key="h" :value="h">
                    {{ h }}
                  </option>
                </select>

                <!-- 2. 多层 JSON 提取模式 -->
                <div v-else-if="getRule(field.name).sourceType === 'json_path'" class="json-source-wrapper">
                  <select
                    :value="getRule(field.name).sourceField"
                    class="form-select form-select-sm field-select"
                    :class="{ 'is-empty': !getRule(field.name).sourceField }"
                    @change="setSourceField(field.name, $event.target.value)"
                  >
                    <option value="">-- 选择 JSON 列 --</option>
                    <option v-for="h in sourceHeaders" :key="h" :value="h">
                      {{ h }}
                    </option>
                  </select>
                  <button
                    type="button"
                    class="btn btn-outline btn-sm json-config-quick-btn"
                    :class="{ 'is-active': activeExpandedField === field.name }"
                    @click="openSpecialConfig(field.name)"
                    title="点击配置/切换 JSON 嵌套字段提取路径"
                  >
                    <Braces :size="13" class="text-primary" />
                    <span>{{ getJsonPathSummary(field.name) }}</span>
                  </button>
                </div>

                <!-- 3. 自定义 JS 脚本模式 -->
                <div v-else-if="getRule(field.name).sourceType === 'custom_js'" class="js-source-wrapper">
                  <select
                    :value="getRule(field.name).sourceField"
                    class="form-select form-select-sm field-select"
                    @change="setSourceField(field.name, $event.target.value)"
                  >
                    <option value="">-- 主输入列 (可选) --</option>
                    <option v-for="h in sourceHeaders" :key="h" :value="h">
                      {{ h }}
                    </option>
                  </select>
                  <button
                    type="button"
                    class="btn btn-outline btn-sm js-config-quick-btn"
                    :class="{ 'is-active': activeExpandedField === field.name }"
                    @click="openSpecialConfig(field.name)"
                    title="编写与调试自定义 JavaScript 清洗代码"
                  >
                    <Code2 :size="13" class="text-amber" />
                    <span>{{ getRule(field.name).customJsCode ? '已编写 JS 规则' : '编写 JS 规则' }}</span>
                  </button>
                </div>

                <!-- 4. 常量输入 -->
                <div v-else-if="getRule(field.name).sourceType === 'constant'" class="constant-source-wrapper">
                  <input
                    v-model="getRule(field.name).constantValue"
                    class="form-input form-input-sm"
                    placeholder="请输入固定常量值"
                    @input="emitRulesUpdate"
                  />
                </div>

                <!-- 5. 多字段合并 -->
                <div v-else-if="getRule(field.name).sourceType === 'combine'" class="combine-box">
                  <button
                    type="button"
                    class="btn btn-outline btn-sm combine-quick-btn"
                    :class="{ 'is-active': activeExpandedField === field.name }"
                    @click="toggleExpand(field.name)"
                  >
                    <Layers :size="13" class="text-indigo" />
                    <span>设置拼接列 (已选 {{ (getRule(field.name).combineFields || []).length }} 列)</span>
                  </button>
                </div>

                <!-- 6. 忽略提示 -->
                <div v-else class="ignore-hint">
                  使用字段默认值或留空 (不导入)
                </div>
              </div>

              <!-- 实时字段值样本预览条 (有空间时多展示丰富内容) -->
              <div
                v-if="hasSamplePreview(field.name)"
                class="source-samples-preview-bar"
                :title="`【${field.name}】数据样本预览`"
              >
                <span class="preview-bar-label">
                  <Eye :size="12" class="text-primary" />
                  <span>样本预览:</span>
                </span>
                <div class="preview-samples-items">
                  <span
                    v-for="(sItem, sIdx) in getFieldSampleList(field.name, 4)"
                    :key="sIdx"
                    class="sample-pill mono-text"
                    :class="{ 'pill-has-error': sItem.error }"
                    :title="`行 #${sItem.rowIndex}: 原始值=${sItem.rawVal} → 清洗后=${sItem.cleanedVal}${sItem.error ? ' (' + sItem.error + ')' : ''}`"
                  >
                    <span class="pill-row-num">#{{ sItem.rowIndex }}</span>
                    <span class="pill-val">{{ formatPreviewVal(sItem.cleanedVal !== '' ? sItem.cleanedVal : sItem.rawVal) }}</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- 启用的清洗规则标签预览 -->
            <div class="col-rules">
              <div class="rules-chips">
                <template v-if="getEnabledRules(field.name).length > 0">
                  <span
                    v-for="(r, rIdx) in getEnabledRules(field.name)"
                    :key="rIdx"
                    class="rule-chip"
                    :title="r.type"
                  >
                    {{ getRuleLabel(r.type) }}
                  </span>
                </template>
                <span v-else class="no-rule-text">直接导入 (无清洗)</span>
              </div>
            </div>

            <!-- 操作折叠规则展开按钮 -->
            <div class="col-action">
              <button
                class="btn btn-outline btn-sm rule-config-btn"
                :class="{ 'is-active': activeExpandedField === field.name }"
                @click="toggleExpand(field.name)"
              >
                <Settings :size="14" />
                <span>清洗规则</span>
                <ChevronDown :size="14" class="expand-icon" />
              </button>
            </div>
          </div>

          <!-- 展开规则配置详细面板 -->
          <div v-if="activeExpandedField === field.name" class="rule-details-panel">
            <div class="panel-section-title">
              <Sparkles :size="15" class="text-primary" />
              <span>配置 [{{ field.name }}] 的数据清洗与格式化规则</span>
            </div>

            <!-- JSON 路径可视化提取配置面板 -->
            <div v-if="getRule(field.name).sourceType === 'json_path'" class="panel-special-card">
              <div class="special-card-header">
                <Braces :size="16" class="text-primary" />
                <span class="special-card-title">
                  从源列 [{{ getRule(field.name).sourceField || '未选择' }}] 的多层嵌套 JSON 中提取单字段或拼接多个字段
                </span>
              </div>
              <JsonPathSelector
                v-model="getRule(field.name).jsonPath"
                v-model:combine-paths="getRule(field.name).combinePaths"
                v-model:is-combine="getRule(field.name).isCombine"
                v-model:separator="getRule(field.name).jsonSeparator"
                :source-field="getRule(field.name).sourceField"
                :sample-rows="sampleRows"
                @update:modelValue="emitRulesUpdate"
                @update:combinePaths="emitRulesUpdate"
                @update:isCombine="emitRulesUpdate"
                @update:separator="emitRulesUpdate"
              />
            </div>

            <!-- 自定义 JS 脚本编辑器面板 -->
            <div v-if="getRule(field.name).sourceType === 'custom_js'" class="panel-special-card">
              <div class="special-card-header">
                <Code2 :size="16" class="text-amber" />
                <span class="special-card-title">
                  针对字段 [{{ field.name }}] 编写自定义 JavaScript 清洗脚本（支持 if-else、正则、多列数学运算及 JSON 访问）
                </span>
              </div>
              <CustomJsEditor
                v-model="getRule(field.name).customJsCode"
                :source-field="getRule(field.name).sourceField"
                :sample-rows="sampleRows"
                @update:modelValue="emitRulesUpdate"
              />
            </div>

            <!-- 多字段拼接配置区 -->
            <div v-if="getRule(field.name).sourceType === 'combine'" class="combine-details-box">
              <label class="detail-label">选择要拼接的源 Excel 列 (按勾选顺序):</label>
              <div class="source-checkbox-grid">
                <label v-for="h in sourceHeaders" :key="h" class="source-checkbox-item">
                  <input
                    type="checkbox"
                    :checked="(getRule(field.name).combineFields || []).includes(h)"
                    @change="toggleCombineField(field.name, h)"
                  />
                  <span>{{ h }}</span>
                </label>
              </div>
              <div class="combine-sep-row">
                <label class="detail-label">拼接连接符 (Separator):</label>
                <input
                  v-model="getRule(field.name).combineSeparator"
                  class="form-input form-input-sm sep-input"
                  placeholder="如: 空格, 逗号, 破折号"
                  @input="emitRulesUpdate"
                />
              </div>
            </div>

            <!-- 规则启用勾选开关组 -->
            <div class="rule-toggles-grid">
              <!-- 去除前后空格 -->
              <label class="toggle-card">
                <input
                  type="checkbox"
                  :checked="hasRuleType(field.name, 'trim')"
                  @change="toggleRuleType(field.name, 'trim')"
                />
                <div class="toggle-info">
                  <span class="toggle-title">去除前后空格 (Trim)</span>
                  <span class="toggle-sub">剥离文本前后的空白字符</span>
                </div>
              </label>

              <!-- 规整连串空格 -->
              <label class="toggle-card">
                <input
                  type="checkbox"
                  :checked="hasRuleType(field.name, 'clean_whitespace')"
                  @change="toggleRuleType(field.name, 'clean_whitespace')"
                />
                <div class="toggle-info">
                  <span class="toggle-title">规整空格 (Clean Space)</span>
                  <span class="toggle-sub">连续空格/制表符替换为单空格</span>
                </div>
              </label>

              <!-- 手机号标准清洗 -->
              <label class="toggle-card">
                <input
                  type="checkbox"
                  :checked="hasRuleType(field.name, 'clean_phone')"
                  @change="toggleRuleType(field.name, 'clean_phone')"
                />
                <div class="toggle-info">
                  <span class="toggle-title">手机号格式化</span>
                  <span class="toggle-sub">剥离+86、破折号及多余字符</span>
                </div>
              </label>

              <!-- 数值与金额提取 -->
              <label class="toggle-card">
                <input
                  type="checkbox"
                  :checked="hasRuleType(field.name, 'extract_number')"
                  @change="toggleRuleType(field.name, 'extract_number')"
                />
                <div class="toggle-info">
                  <span class="toggle-title">提取金额/数字</span>
                  <span class="toggle-sub">过滤货币符号￥$、千分位逗号</span>
                </div>
              </label>

              <!-- 标准日期时间规范化 -->
              <label class="toggle-card">
                <input
                  type="checkbox"
                  :checked="hasRuleType(field.name, 'standard_datetime')"
                  @change="toggleRuleType(field.name, 'standard_datetime')"
                />
                <div class="toggle-info">
                  <span class="toggle-title">标准日期时间规整</span>
                  <span class="toggle-sub">解析各类旧格式并规范化</span>
                </div>
              </label>

              <!-- 字典/枚举值映射 -->
              <label class="toggle-card">
                <input
                  type="checkbox"
                  :checked="hasRuleType(field.name, 'dict_mapping')"
                  @change="toggleRuleType(field.name, 'dict_mapping')"
                />
                <div class="toggle-info">
                  <span class="toggle-title">字典/枚举值映射</span>
                  <span class="toggle-sub">如 男->1, 女->2, 启用->1</span>
                </div>
              </label>

              <!-- 转为大写 -->
              <label class="toggle-card">
                <input
                  type="checkbox"
                  :checked="hasRuleType(field.name, 'uppercase')"
                  @change="toggleRuleType(field.name, 'uppercase')"
                />
                <div class="toggle-info">
                  <span class="toggle-title">全部转大写 (UPPER)</span>
                  <span class="toggle-sub">英文字母转大写</span>
                </div>
              </label>

              <!-- 手机号脱敏 -->
              <label class="toggle-card">
                <input
                  type="checkbox"
                  :checked="hasRuleType(field.name, 'mask_phone')"
                  @change="toggleRuleType(field.name, 'mask_phone')"
                />
                <div class="toggle-info">
                  <span class="toggle-title">手机号脱敏 (138****1234)</span>
                  <span class="toggle-sub">隐藏中间4位数字</span>
                </div>
              </label>
            </div>

            <!-- 规则子参数配置面板 -->
            <!-- 1. 日期格式输出选项 -->
            <div v-if="hasRuleType(field.name, 'standard_datetime')" class="sub-config-box">
              <label class="sub-label">期望输出的日期时间格式:</label>
              <select
                :value="getRuleConfig(field.name, 'standard_datetime').outputFormat || 'YYYY-MM-DD HH:mm:ss'"
                class="form-select form-select-sm"
                style="width: 260px;"
                @change="updateRuleSubConfig(field.name, 'standard_datetime', 'outputFormat', $event.target.value)"
              >
                <option value="YYYY-MM-DD HH:mm:ss">YYYY-MM-DD HH:mm:ss (标准时间)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (仅日期)</option>
                <option value="YYYY/MM/DD">YYYY/MM/DD</option>
                <option value="YYYYMMDD">YYYYMMDD (8位连续数字)</option>
                <option value="Timestamp (s)">UNIX 时间戳 (秒)</option>
                <option value="Timestamp (ms)">毫秒级时间戳</option>
              </select>
            </div>

            <!-- 2. 字典值映射编辑器 (Dictionary Mapping Editor) -->
            <div v-if="hasRuleType(field.name, 'dict_mapping')" class="sub-config-box dict-editor">
              <div class="dict-editor-header">
                <span class="sub-label">字典键值对应映射表 (旧值 -> 目标入库值):</span>
                <button
                  class="btn btn-outline btn-sm"
                  @click="addDictEntry(field.name)"
                >
                  <Plus :size="13" />
                  <span>添加映射对</span>
                </button>
              </div>

              <div class="dict-pairs-list">
                <div
                  v-for="(pair, pIdx) in getDictEntries(field.name)"
                  :key="pIdx"
                  class="dict-pair-row"
                >
                  <input
                    :value="pair.key"
                    class="form-input form-input-sm"
                    placeholder="源值，如: 男"
                    @change="onDictKeyChange(field.name, pIdx, $event.target.value)"
                  />
                  <ArrowRight :size="14" class="text-muted" />
                  <input
                    :value="pair.val"
                    class="form-input form-input-sm"
                    placeholder="入库值，如: 1"
                    @change="onDictValChange(field.name, pIdx, $event.target.value)"
                  />
                  <button
                    class="icon-del-btn"
                    title="删除此映射"
                    @click="removeDictEntry(field.name, pIdx)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>

              <div class="dict-fallback-row">
                <span class="sub-label">未匹配时的回退默认值:</span>
                <input
                  :value="getRuleConfig(field.name, 'dict_mapping').fallbackValue"
                  class="form-input form-input-sm"
                  placeholder="未匹配时的值，如: 0 或 未知"
                  style="width: 220px;"
                  @input="updateRuleSubConfig(field.name, 'dict_mapping', 'fallbackValue', $event.target.value)"
                />
              </div>
            </div>

            <!-- 3. 数值精度小数位 -->
            <div v-if="hasRuleType(field.name, 'extract_number')" class="sub-config-box">
              <label class="sub-label">保留小数位数 (Decimals):</label>
              <select
                :value="getRuleConfig(field.name, 'extract_number').decimals ?? 2"
                class="form-select form-select-sm"
                style="width: 140px;"
                @change="updateRuleSubConfig(field.name, 'extract_number', 'decimals', parseInt($event.target.value, 10))"
              >
                <option :value="0">0 (纯整数)</option>
                <option :value="1">1 位小数</option>
                <option :value="2">2 位小数 (金额常用)</option>
                <option :value="3">3 位小数</option>
                <option :value="4">4 位小数</option>
              </select>
            </div>

            <!-- 实时清洗前后样本对照流水线卡片 (置于属性配置下方，且在自定义 JS 时隐藏避免重复沙箱列表) -->
            <div
              v-if="hasSamplePreview(field.name) && getRule(field.name).sourceType !== 'custom_js'"
              class="sample-pipeline-card"
            >
              <div class="pipeline-card-header">
                <div class="pipeline-title">
                  <Eye :size="15" class="text-primary" />
                  <span>【{{ field.name }}】实时清洗前后样本对照 (前 5 行测试)</span>
                </div>
                <span class="pipeline-tip">根据上方配置的提取方式与清洗规则，前 5 行真实数据的清洗结果在此实时响应更新</span>
              </div>

              <div class="pipeline-table-wrapper">
                <table class="pipeline-table">
                  <thead>
                    <tr>
                      <th style="width: 60px;" class="th-center"># 行号</th>
                      <th>Excel 原始数据 (Raw)</th>
                      <th style="width: 36px;" class="th-center"></th>
                      <th>清洗后目标数据 (Cleaned Output)</th>
                      <th style="width: 150px;">字段校验状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in getFieldSampleList(field.name, 5)"
                      :key="item.rowIndex"
                      :class="{ 'row-has-error': item.error }"
                    >
                      <td class="td-center mono-text td-muted">行 {{ item.rowIndex }}</td>
                      <td class="mono-text raw-cell" :title="String(item.rawVal)">
                        <span v-if="item.rawVal !== '' && item.rawVal !== undefined">{{ truncate(item.rawVal, 70) }}</span>
                        <span v-else class="text-muted">(空)</span>
                      </td>
                      <td class="td-center text-muted">➔</td>
                      <td class="mono-text cleaned-cell" :title="String(item.cleanedVal)">
                        <span v-if="item.cleanedVal !== '' && item.cleanedVal !== undefined" class="text-emerald font-semibold">
                          {{ truncate(item.cleanedVal, 70) }}
                        </span>
                        <span v-else class="text-muted">(空)</span>
                      </td>
                      <td>
                        <span v-if="!item.error" class="badge badge-success">✓ 校验正常</span>
                        <span v-else class="badge badge-danger" :title="item.error">⚠ {{ truncate(item.error, 18) }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  Wand2,
  RotateCcw,
  ArrowRight,
  Sliders,
  Settings,
  ChevronDown,
  Sparkles,
  Plus,
  Trash2,
  Braces,
  Code2,
  Eye,
  Layers,
  FileSpreadsheet
} from 'lucide-vue-next'
import { autoMatchFields, computeFieldSampleTransform } from '../utils/cleaner'
import JsonPathSelector from './JsonPathSelector.vue'
import CustomJsEditor from './CustomJsEditor.vue'

const props = defineProps({
  targetFields: {
    type: Array,
    required: true
  },
  sourceHeaders: {
    type: Array,
    default: () => []
  },
  sampleRows: {
    type: Array,
    default: () => []
  },
  mappingRules: {
    type: Array,
    required: true
  },
  options: {
    type: Object,
    default: () => ({
      dedupField: '',
      dedupStrategy: 'keep_first',
      skipEmptyRows: true
    })
  }
})

const emit = defineEmits([
  'update:mappingRules',
  'update:options',
  'go-next',
  'notify'
])

const activeExpandedField = ref(null)

const mappedCount = computed(() => {
  return props.mappingRules.filter(r => {
    if (r.sourceType === 'ignore') return false
    if (r.sourceType === 'constant') return r.constantValue !== undefined && r.constantValue !== ''
    if (r.sourceType === 'combine') return r.combineFields && r.combineFields.length > 0
    if (r.sourceType === 'json_path') return r.sourceField && (r.jsonPath || (r.combinePaths && r.combinePaths.length > 0))
    if (r.sourceType === 'custom_js') return Boolean(r.customJsCode)
    return Boolean(r.sourceField)
  }).length
})

function getRule(fieldName) {
  let rule = props.mappingRules.find(r => r.targetField === fieldName)
  if (!rule) {
    rule = {
      targetField: fieldName,
      sourceField: '',
      sourceType: 'field',
      cleanRules: [{ type: 'trim', enabled: true }],
      defaultValue: '',
      jsonPath: '',
      combinePaths: [],
      isCombine: false,
      jsonSeparator: ' ',
      customJsCode: ''
    }
  }
  return rule
}

function getJsonPathSummary(fieldName) {
  const rule = getRule(fieldName)
  if (rule.isCombine && rule.combinePaths && rule.combinePaths.length > 0) {
    return `已选 ${rule.combinePaths.length} 个路径`
  }
  if (rule.jsonPath) {
    return rule.jsonPath
  }
  return '配置提取路径'
}

function openSpecialConfig(fieldName) {
  activeExpandedField.value = fieldName
}

function hasSamplePreview(fieldName) {
  const rule = getRule(fieldName)
  if (!rule || rule.sourceType === 'ignore') return false
  if (rule.sourceType === 'field') return Boolean(rule.sourceField)
  if (rule.sourceType === 'json_path') return Boolean(rule.sourceField)
  if (rule.sourceType === 'combine') return Boolean(rule.combineFields && rule.combineFields.length > 0)
  if (rule.sourceType === 'constant') return rule.constantValue !== undefined && rule.constantValue !== ''
  if (rule.sourceType === 'custom_js') return Boolean(rule.customJsCode || rule.sourceField)
  return false
}

function getFieldSampleList(fieldName, limit = 4) {
  const rule = getRule(fieldName)
  const targetFieldDef = props.targetFields.find(f => f.name === fieldName)
  return computeFieldSampleTransform(targetFieldDef, rule, props.sampleRows, limit)
}

function formatPreviewVal(val) {
  if (val === undefined || val === null || val === '') return '(空)'
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  const s = String(val)
  return s.length > 25 ? s.substring(0, 25) + '...' : s
}

function truncate(val, max = 50) {
  if (val === undefined || val === null || val === '') return ''
  const s = String(val)
  return s.length > max ? s.substring(0, max) + '...' : s
}

function getEnabledRules(fieldName) {
  const rule = getRule(fieldName)
  return (rule.cleanRules || []).filter(r => r.enabled !== false)
}

function getRuleLabel(type) {
  const map = {
    trim: 'Trim空格',
    clean_whitespace: '空格规整',
    clean_phone: '手机号清洗',
    extract_number: '提取数字',
    standard_datetime: '日期规整',
    dict_mapping: '字典映射',
    uppercase: '转大写',
    lowercase: '转小写',
    mask_phone: '手机脱敏',
    to_int: '整数转换',
    custom_js: 'JS脚本'
  }
  return map[type] || type
}

function toggleExpand(fieldName) {
  if (activeExpandedField.value === fieldName) {
    activeExpandedField.value = null
  } else {
    activeExpandedField.value = fieldName
  }
}

function emitRulesUpdate() {
  emit('update:mappingRules', [...props.mappingRules])
}

function setSourceType(fieldName, val) {
  const rule = getRule(fieldName)
  rule.sourceType = val
  emitRulesUpdate()
}

function setSourceField(fieldName, val) {
  const rule = getRule(fieldName)
  rule.sourceField = val
  emitRulesUpdate()
}

function updateOption(key, val) {
  emit('update:options', {
    ...props.options,
    [key]: val
  })
}

function handleAutoMatch() {
  const newMappings = autoMatchFields(props.sourceHeaders, props.targetFields)
  emit('update:mappingRules', newMappings)
  const matched = newMappings.filter(m => m.matched).length
  emit('notify', {
    message: `智能分析完成，成功匹配 ${matched} 个字段！`,
    type: 'success'
  })
}

function clearAllMappings() {
  const cleared = props.targetFields.map(t => {
    const rawDef = t.defaultValue || ''
    const cleanDef = (rawDef && String(rawDef).trim().toLowerCase() !== 'null') ? rawDef : ''
    return {
      targetField: t.name,
      sourceField: '',
      sourceType: 'ignore',
      cleanRules: [{ type: 'trim', enabled: true }],
      defaultValue: cleanDef
    }
  })
  emit('update:mappingRules', cleared)
  emit('notify', { message: '已清空所有字段关联', type: 'info' })
}

// 规则启用开关
function hasRuleType(fieldName, ruleType) {
  const rule = getRule(fieldName)
  return (rule.cleanRules || []).some(r => r.type === ruleType && r.enabled !== false)
}

function toggleRuleType(fieldName, ruleType) {
  const rule = getRule(fieldName)
  if (!rule.cleanRules) rule.cleanRules = []

  const existingIdx = rule.cleanRules.findIndex(r => r.type === ruleType)
  if (existingIdx !== -1) {
    if (rule.cleanRules[existingIdx].enabled === false) {
      rule.cleanRules[existingIdx].enabled = true
    } else {
      rule.cleanRules.splice(existingIdx, 1)
    }
  } else {
    // 默认添加
    const newRuleItem = { type: ruleType, enabled: true }
    if (ruleType === 'extract_number') newRuleItem.decimals = 2
    if (ruleType === 'standard_datetime') newRuleItem.outputFormat = 'YYYY-MM-DD HH:mm:ss'
    if (ruleType === 'dict_mapping') {
      newRuleItem.mapping = { '男': 1, '女': 2 }
      newRuleItem.fallbackValue = 0
    }
    rule.cleanRules.push(newRuleItem)
  }
  emitRulesUpdate()
}

function getRuleConfig(fieldName, ruleType) {
  const rule = getRule(fieldName)
  return (rule.cleanRules || []).find(r => r.type === ruleType) || {}
}

function updateRuleSubConfig(fieldName, ruleType, configKey, configVal) {
  const rule = getRule(fieldName)
  const target = (rule.cleanRules || []).find(r => r.type === ruleType)
  if (target) {
    target[configKey] = configVal
    emitRulesUpdate()
  }
}

// 多字段拼接
function toggleCombineField(fieldName, colHeader) {
  const rule = getRule(fieldName)
  if (!rule.combineFields) rule.combineFields = []
  const idx = rule.combineFields.indexOf(colHeader)
  if (idx !== -1) {
    rule.combineFields.splice(idx, 1)
  } else {
    rule.combineFields.push(colHeader)
  }
  emitRulesUpdate()
}

// 字典映射
function getDictEntries(fieldName) {
  const conf = getRuleConfig(fieldName, 'dict_mapping')
  const mapping = conf.mapping || {}
  return Object.keys(mapping).map(k => ({ key: k, val: mapping[k] }))
}

function addDictEntry(fieldName) {
  const conf = getRuleConfig(fieldName, 'dict_mapping')
  if (!conf.mapping) conf.mapping = {}
  conf.mapping['新值_' + (Object.keys(conf.mapping).length + 1)] = ''
  emitRulesUpdate()
}

function onDictKeyChange(fieldName, pIdx, newKey) {
  const conf = getRuleConfig(fieldName, 'dict_mapping')
  const entries = getDictEntries(fieldName)
  if (entries[pIdx]) {
    const oldVal = entries[pIdx].val
    delete conf.mapping[entries[pIdx].key]
    conf.mapping[newKey] = oldVal
    emitRulesUpdate()
  }
}

function onDictValChange(fieldName, pIdx, newVal) {
  const conf = getRuleConfig(fieldName, 'dict_mapping')
  const entries = getDictEntries(fieldName)
  if (entries[pIdx]) {
    conf.mapping[entries[pIdx].key] = newVal
    emitRulesUpdate()
  }
}

function removeDictEntry(fieldName, pIdx) {
  const conf = getRuleConfig(fieldName, 'dict_mapping')
  const entries = getDictEntries(fieldName)
  if (entries[pIdx]) {
    delete conf.mapping[entries[pIdx].key]
    emitRulesUpdate()
  }
}
</script>

<style scoped>
.step-mapping-container {
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 顶部操作条 */
.mapping-toolbar-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  padding: 18px 24px;
}

.summary-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-counter {
  display: flex;
  align-items: center;
  gap: 10px;
}

.counter-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.counter-value {
  font-size: 18px;
  font-weight: 800;
  font-family: var(--font-mono);
  color: #fbbf24;
}

.counter-value.is-all-mapped {
  color: #34d399;
}

.summary-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 全局去重规则栏 */
.global-rules-card {
  padding: 16px 24px;
}

.global-rules-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 12px;
}

.global-rules-grid {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.rule-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rule-box-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.rule-box-control {
  min-width: 220px;
}

.rule-box-inline {
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
  cursor: pointer;
}

/* 映射明细卡片 */
.mapping-list-card {
  padding: 0;
  overflow: hidden;
}

.mapping-list-header {
  display: grid;
  grid-template-columns: 240px 36px minmax(380px, 1.25fr) 1fr 130px;
  align-items: center;
  gap: 20px;
  padding: 12px 28px;
  background: #141c2b;
  border-bottom: 1px solid var(--border-medium);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}

.mapping-rows {
  display: flex;
  flex-direction: column;
}

.mapping-row-wrapper {
  border-bottom: 1px solid var(--border-subtle);
  transition: background var(--transition-fast);
}

.mapping-row-wrapper:hover {
  background: rgba(255, 255, 255, 0.02);
}

.mapping-row-wrapper.is-expanded {
  background: rgba(99, 102, 241, 0.04);
}

.mapping-row-main {
  display: grid;
  grid-template-columns: 240px 36px minmax(380px, 1.25fr) 1fr 130px;
  align-items: center;
  gap: 20px;
  padding: 14px 28px;
}

/* 目标字段列 */
.col-target {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.target-name-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.target-name {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  font-family: var(--font-mono);
}

.target-meta-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.target-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.target-type-tag {
  font-size: 10px;
  font-family: var(--font-mono);
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 5px;
  border-radius: 4px;
  color: #94a3b8;
}

/* 箭头 */
.col-arrow {
  display: flex;
  justify-content: center;
}

.arrow-indicator {
  color: var(--text-muted);
}

/* 来源选择列 */
.col-source {
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
  width: 100%;
}

.source-type-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.type-select {
  width: 148px;
  flex-shrink: 0;
}

.field-select {
  flex: 1;
}

.field-select.is-empty {
  border-color: rgba(245, 158, 11, 0.4);
}

.json-source-wrapper, .js-source-wrapper, .constant-source-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.constant-source-wrapper input {
  width: 100%;
}

.json-config-quick-btn, .js-config-quick-btn, .combine-quick-btn {
  white-space: nowrap;
  font-size: 11px;
  padding: 5px 10px;
  flex-shrink: 0;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* 实时样本数据预览条 */
.source-samples-preview-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: 11px;
  overflow: hidden;
}

.preview-bar-label {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.preview-samples-items {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
}

.preview-samples-items::-webkit-scrollbar {
  display: none;
}

.sample-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
}

.sample-pill .pill-row-num {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 600;
}

.sample-pill .pill-val {
  color: #34d399;
}

.sample-pill.pill-has-error .pill-val {
  color: #f87171;
}

/* 展开抽屉内的清洗前后实时对照卡片 */
.sample-pipeline-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.pipeline-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.pipeline-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.pipeline-tip {
  font-size: 12px;
  color: var(--text-muted);
}

.pipeline-table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: #090d16;
}

.pipeline-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.pipeline-table th,
.pipeline-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
}

.pipeline-table th {
  background: #141c2b;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
}

.pipeline-table tr:last-child td {
  border-bottom: none;
}

.raw-cell {
  color: #cbd5e1;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cleaned-cell {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-special-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.special-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.special-card-title {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.ignore-hint {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

/* 清洗规则列 */
.col-rules {
  display: flex;
  align-items: center;
}

.rules-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.rule-chip {
  font-size: 11px;
  font-weight: 600;
  background: var(--primary-light);
  color: #a5b4fc;
  border: 1px solid var(--primary-border);
  padding: 2px 8px;
  border-radius: 9999px;
}

.no-rule-text {
  font-size: 12px;
  color: var(--text-muted);
}

/* 操作列 */
.col-action {
  display: flex;
  justify-content: flex-end;
}

.rule-config-btn {
  display: flex;
  align-items: center;
  gap: 6px;
}

.expand-icon {
  transition: transform var(--transition-fast);
}

.rule-config-btn.is-active .expand-icon {
  transform: rotate(180deg);
}

/* 展开面板 */
.rule-details-panel {
  padding: 16px 24px 20px;
  background: #101726;
  border-top: 1px dashed var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #a5b4fc;
}

.rule-toggles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}

.toggle-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  padding: 10px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.toggle-card:hover {
  border-color: var(--primary-border);
}

.toggle-card input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  margin-top: 2px;
  cursor: pointer;
}

.toggle-info {
  display: flex;
  flex-direction: column;
}

.toggle-title {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.toggle-sub {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
}

.sub-config-box {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.sub-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

/* 字典编辑器 */
.dict-editor {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.dict-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dict-pairs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dict-pair-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dict-pair-row input {
  max-width: 200px;
}

.dict-fallback-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  border-top: 1px dashed var(--border-subtle);
  padding-top: 8px;
}

.icon-del-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}

.icon-del-btn:hover {
  color: var(--danger);
}

/* 拼接设置 */
.combine-details-box {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.source-checkbox-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.source-checkbox-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.combine-sep-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sep-input {
  max-width: 140px;
}
</style>
