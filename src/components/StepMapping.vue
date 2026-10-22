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
          <div class="mapping-row-main" @click="handleRowClick(field.name, $event)">
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
                    :class="{
                      'is-active': activeExpandedField === field.name,
                      'is-combine-mode': getRule(field.name).isCombine
                    }"
                    @click="openSpecialConfig(field.name)"
                    :title="getRule(field.name).isCombine ? '多属性拼接模式：点击配置拼接列表' : '单属性提取模式：点击配置提取路径'"
                  >
                    <template v-if="getRule(field.name).isCombine">
                      <Layers :size="13" class="text-indigo" />
                      <span class="json-mode-pill is-combine">多属性拼接</span>
                      <span class="json-path-summary-text mono-text" :title="getJsonPathSummary(field.name)">
                        {{ getJsonPathSummary(field.name) }}
                      </span>
                    </template>
                    <template v-else>
                      <Target :size="13" class="text-emerald" />
                      <span class="json-mode-pill is-single">单属性</span>
                      <span class="json-path-summary-text mono-text" :title="getJsonPathSummary(field.name)">
                        {{ getJsonPathSummary(field.name) }}
                      </span>
                    </template>
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
                    :title="getRuleTooltip(r.type)"
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
                type="button"
                class="btn btn-outline btn-sm rule-config-btn"
                :class="{ 'is-active': activeExpandedField === field.name }"
                @click.stop="toggleExpand(field.name)"
              >
                <Settings :size="14" />
                <span>{{ activeExpandedField === field.name ? '收起配置' : '清洗规则' }}</span>
                <ChevronDown :size="14" class="expand-icon" />
              </button>
            </div>
          </div>

          <!-- 展开规则配置详细面板 -->
          <div v-if="activeExpandedField === field.name" class="rule-details-panel">
            <!-- 1. 顶部清晰显眼的从属锚定横幅 (明确当前配置的是哪个字段) -->
            <div class="panel-anchor-banner">
              <div class="banner-target-info">
                <span class="banner-tag">正在配置字段:</span>
                <span class="banner-field-name">{{ field.name }}</span>
                <span v-if="field.label" class="banner-field-label">({{ field.label }})</span>
                <span class="banner-type-badge">{{ field.type.toUpperCase() }}</span>
                <span v-if="field.isPrimary" class="badge badge-warning">主键</span>
                <span v-if="!field.nullable" class="badge badge-danger">必填</span>
              </div>
              <div class="banner-source-info">
                <span class="source-info-label">关联数据源:</span>
                <span class="source-info-value">{{ getSourceSummaryText(field.name) }}</span>
              </div>
              <button
                type="button"
                class="btn btn-outline btn-xs banner-close-btn"
                @click="toggleExpand(field.name)"
                title="收起此字段的清洗规则"
              >
                <ChevronUp :size="14" />
                <span>收起面板</span>
              </button>
            </div>

            <!-- 2. 特殊来源提取配置区 (仅在 json_path, custom_js, combine 时展示，扁平化无套娃) -->
            <div v-if="getRule(field.name).sourceType === 'json_path'" class="flat-config-section">
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

            <div v-if="getRule(field.name).sourceType === 'custom_js'" class="flat-config-section">
              <div class="flat-section-header">
                <Code2 :size="14" class="text-amber" />
                <span class="flat-section-title">
                  针对 [{{ field.name }}] 编写自定义 JavaScript 清洗脚本:
                </span>
              </div>
              <CustomJsEditor
                v-model="getRule(field.name).customJsCode"
                :source-field="getRule(field.name).sourceField"
                :sample-rows="sampleRows"
                @update:modelValue="emitRulesUpdate"
              />
            </div>

            <div v-if="getRule(field.name).sourceType === 'combine'" class="flat-config-section">
              <div class="combine-clean-body">
                <div class="combine-cols-group">
                  <label class="clean-sub-label">选择要拼接的源 Excel 列 (按勾选顺序):</label>
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
                </div>
                <div class="combine-sep-row">
                  <label class="clean-sub-label">拼接连接符:</label>
                  <input
                    v-model="getRule(field.name).combineSeparator"
                    class="form-input form-input-xs sep-input"
                    placeholder="默认紧凑(空)"
                    @input="emitRulesUpdate"
                  />
                  <div class="sep-presets">
                    <button
                      type="button"
                      class="btn btn-xs"
                      :class="{ 'btn-primary': getRule(field.name).combineSeparator === '' || getRule(field.name).combineSeparator === undefined }"
                      @click="getRule(field.name).combineSeparator = ''; emitRulesUpdate()"
                    >
                      紧凑
                    </button>
                    <button
                      type="button"
                      class="btn btn-xs"
                      :class="{ 'btn-primary': getRule(field.name).combineSeparator === ' ' }"
                      @click="getRule(field.name).combineSeparator = ' '; emitRulesUpdate()"
                    >
                      空格
                    </button>
                    <button
                      type="button"
                      class="btn btn-xs"
                      :class="{ 'btn-primary': getRule(field.name).combineSeparator === '-' }"
                      @click="getRule(field.name).combineSeparator = '-'; emitRulesUpdate()"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      class="btn btn-xs"
                      :class="{ 'btn-primary': getRule(field.name).combineSeparator === '_' }"
                      @click="getRule(field.name).combineSeparator = '_'; emitRulesUpdate()"
                    >
                      _
                    </button>
                    <button
                      type="button"
                      class="btn btn-xs"
                      :class="{ 'btn-primary': getRule(field.name).combineSeparator === ',' }"
                      @click="getRule(field.name).combineSeparator = ','; emitRulesUpdate()"
                    >
                      ,
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 3. 清洗规则流水线 (紧凑单行胶囊开关，消除臃肿空间) -->
            <div class="flat-rules-section">
              <div class="rules-section-bar">
                <span class="rules-bar-title">
                  <Sparkles :size="13" class="text-primary" />
                  <span>清洗转换流水线:</span>
                </span>
                <div class="compact-rule-toggles">
                  <!-- 去除前后空格 -->
                  <label
                    class="compact-toggle-chip"
                    :class="{ 'is-active': hasRuleType(field.name, 'trim') }"
                    :title="getRuleTooltip('trim')"
                  >
                    <input
                      type="checkbox"
                      :checked="hasRuleType(field.name, 'trim')"
                      @change="toggleRuleType(field.name, 'trim')"
                    />
                    <span>去空格 (Trim)</span>
                  </label>

                  <!-- 规整连串空格 -->
                  <label
                    class="compact-toggle-chip"
                    :class="{ 'is-active': hasRuleType(field.name, 'clean_whitespace') }"
                    :title="getRuleTooltip('clean_whitespace')"
                  >
                    <input
                      type="checkbox"
                      :checked="hasRuleType(field.name, 'clean_whitespace')"
                      @change="toggleRuleType(field.name, 'clean_whitespace')"
                    />
                    <span>规整空格</span>
                  </label>

                  <!-- 手机号标准清洗 -->
                  <label
                    class="compact-toggle-chip"
                    :class="{ 'is-active': hasRuleType(field.name, 'clean_phone') }"
                    :title="getRuleTooltip('clean_phone')"
                  >
                    <input
                      type="checkbox"
                      :checked="hasRuleType(field.name, 'clean_phone')"
                      @change="toggleRuleType(field.name, 'clean_phone')"
                    />
                    <span>手机格式化</span>
                  </label>

                  <!-- 数值与金额提取 -->
                  <label
                    class="compact-toggle-chip"
                    :class="{ 'is-active': hasRuleType(field.name, 'extract_number') }"
                    :title="getRuleTooltip('extract_number')"
                  >
                    <input
                      type="checkbox"
                      :checked="hasRuleType(field.name, 'extract_number')"
                      @change="toggleRuleType(field.name, 'extract_number')"
                    />
                    <span>提取金额/数值</span>
                  </label>

                  <!-- 标准日期时间规范化 -->
                  <label
                    class="compact-toggle-chip"
                    :class="{ 'is-active': hasRuleType(field.name, 'standard_datetime') }"
                    :title="getRuleTooltip('standard_datetime')"
                  >
                    <input
                      type="checkbox"
                      :checked="hasRuleType(field.name, 'standard_datetime')"
                      @change="toggleRuleType(field.name, 'standard_datetime')"
                    />
                    <span>日期规整</span>
                  </label>

                  <!-- 字典/枚举值映射 -->
                  <label
                    class="compact-toggle-chip"
                    :class="{ 'is-active': hasRuleType(field.name, 'dict_mapping') }"
                    :title="getRuleTooltip('dict_mapping')"
                  >
                    <input
                      type="checkbox"
                      :checked="hasRuleType(field.name, 'dict_mapping')"
                      @change="toggleRuleType(field.name, 'dict_mapping')"
                    />
                    <span>字典映射</span>
                  </label>

                  <!-- 转为大写 -->
                  <label
                    class="compact-toggle-chip"
                    :class="{ 'is-active': hasRuleType(field.name, 'uppercase') }"
                    :title="getRuleTooltip('uppercase')"
                  >
                    <input
                      type="checkbox"
                      :checked="hasRuleType(field.name, 'uppercase')"
                      @change="toggleRuleType(field.name, 'uppercase')"
                    />
                    <span>转大写</span>
                  </label>

                  <!-- 手机号脱敏 -->
                  <label
                    class="compact-toggle-chip"
                    :class="{ 'is-active': hasRuleType(field.name, 'mask_phone') }"
                    :title="getRuleTooltip('mask_phone')"
                  >
                    <input
                      type="checkbox"
                      :checked="hasRuleType(field.name, 'mask_phone')"
                      @change="toggleRuleType(field.name, 'mask_phone')"
                    />
                    <span>手机脱敏</span>
                  </label>
                </div>
              </div>

              <!-- 规则子参数配置条 (扁平嵌入，仅在开启时单行呈现) -->
              <div
                v-if="hasRuleType(field.name, 'standard_datetime') || hasRuleType(field.name, 'extract_number') || hasRuleType(field.name, 'dict_mapping')"
                class="rule-sub-params-strip"
              >
                <!-- 1. 日期格式输出选项 -->
                <div v-if="hasRuleType(field.name, 'standard_datetime')" class="param-inline-item">
                  <label class="param-inline-label">🗓️ 输出日期时间格式:</label>
                  <select
                    :value="getRuleConfig(field.name, 'standard_datetime').outputFormat || 'YYYY-MM-DD HH:mm:ss'"
                    class="form-select form-select-xs param-select"
                    @change="updateRuleSubConfig(field.name, 'standard_datetime', 'outputFormat', $event.target.value)"
                  >
                    <option value="YYYY-MM-DD HH:mm:ss">YYYY-MM-DD HH:mm:ss (标准时间)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (仅日期)</option>
                    <option value="YYYY/MM/DD">YYYY/MM/DD</option>
                    <option value="YYYYMMDD">YYYYMMDD (8位数字)</option>
                    <option value="Timestamp (s)">UNIX 时间戳 (秒)</option>
                    <option value="Timestamp (ms)">毫秒级时间戳</option>
                  </select>
                </div>

                <!-- 2. 数值精度小数位 -->
                <div v-if="hasRuleType(field.name, 'extract_number')" class="param-inline-item">
                  <label class="param-inline-label">🔢 保留小数位数:</label>
                  <select
                    :value="getRuleConfig(field.name, 'extract_number').decimals ?? 2"
                    class="form-select form-select-xs param-select-sm"
                    @change="updateRuleSubConfig(field.name, 'extract_number', 'decimals', parseInt($event.target.value, 10))"
                  >
                    <option :value="0">0 (纯整数)</option>
                    <option :value="1">1 位小数</option>
                    <option :value="2">2 位小数 (金额常用)</option>
                    <option :value="3">3 位小数</option>
                    <option :value="4">4 位小数</option>
                  </select>
                </div>

                <!-- 3. 字典映射参数块 -->
                <div v-if="hasRuleType(field.name, 'dict_mapping')" class="param-dict-block">
                  <div class="dict-editor-header">
                    <span class="param-inline-label">📖 字典键值映射表 (源值 -> 目标值):</span>
                    <button
                      type="button"
                      class="btn btn-outline btn-xs"
                      @click="addDictEntry(field.name)"
                    >
                      <Plus :size="12" />
                      <span>添加对</span>
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
                        class="form-input form-input-xs"
                        placeholder="源值，如: 男"
                        @change="onDictKeyChange(field.name, pIdx, $event.target.value)"
                      />
                      <ArrowRight :size="12" class="text-muted" />
                      <input
                        :value="pair.val"
                        class="form-input form-input-xs"
                        placeholder="入库值，如: 1"
                        @change="onDictValChange(field.name, pIdx, $event.target.value)"
                      />
                      <button
                        type="button"
                        class="icon-del-btn"
                        title="删除此映射"
                        @click="removeDictEntry(field.name, pIdx)"
                      >
                        <Trash2 :size="12" />
                      </button>
                    </div>
                  </div>

                  <div class="dict-fallback-row">
                    <span class="param-inline-label">未匹配时默认值:</span>
                    <input
                      :value="getRuleConfig(field.name, 'dict_mapping').fallbackValue"
                      class="form-input form-input-xs fallback-input"
                      placeholder="如: 0 或 未知"
                      @input="updateRuleSubConfig(field.name, 'dict_mapping', 'fallbackValue', $event.target.value)"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- 4. 实时清洗前后效果简明对比 (精简 3 行，支持折叠展开，杜绝冗余高度) -->
            <div
              v-if="hasSamplePreview(field.name) && getRule(field.name).sourceType !== 'custom_js'"
              class="compact-pipeline-section"
            >
              <div class="compact-pipeline-header" @click="togglePreviewFold(field.name)">
                <div class="pipeline-header-title">
                  <Eye :size="12" class="text-primary" />
                  <span>【{{ field.name }}】实时转换效果对照 (前 3 行测试)</span>
                </div>
                <div class="pipeline-header-actions">
                  <span class="preview-fold-hint">{{ isPreviewFolded(field.name) ? '展开预览对照' : '收起对照' }}</span>
                  <ChevronDown :size="12" class="preview-fold-arrow" :class="{ 'is-folded': isPreviewFolded(field.name) }" />
                </div>
              </div>

              <div v-show="!isPreviewFolded(field.name)" class="compact-table-scroll">
                <table class="compact-sample-table">
                  <thead>
                    <tr>
                      <th style="width: 55px;" class="th-center"># 行号</th>
                      <th>Excel 原始数据 (Raw)</th>
                      <th style="width: 28px;" class="th-center"></th>
                      <th>清洗后目标数据 (Cleaned Output)</th>
                      <th style="width: 90px;">校验状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in getFieldSampleList(field.name, 3)"
                      :key="item.rowIndex"
                      :class="{ 'row-has-error': item.error }"
                    >
                      <td class="td-center mono-text td-muted">行 {{ item.rowIndex }}</td>
                      <td class="mono-text raw-cell" :title="String(item.rawVal)">
                        <span v-if="item.rawVal !== '' && item.rawVal !== undefined">{{ truncate(item.rawVal, 40) }}</span>
                        <span v-else class="text-muted">(空)</span>
                      </td>
                      <td class="td-center text-muted">➔</td>
                      <td class="mono-text cleaned-cell" :title="String(item.cleanedVal)">
                        <span v-if="item.cleanedVal !== '' && item.cleanedVal !== undefined" class="text-emerald font-semibold">
                          {{ truncate(item.cleanedVal, 40) }}
                        </span>
                        <span v-else class="text-muted">(空)</span>
                      </td>
                      <td>
                        <span v-if="!item.error" class="badge badge-success badge-xs">✓ 正常</span>
                        <span v-else class="badge badge-danger badge-xs" :title="item.error">⚠ 异常</span>
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
  ChevronUp,
  Sparkles,
  Plus,
  Trash2,
  Braces,
  Code2,
  Eye,
  Layers,
  Target,
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
      jsonSeparator: '',
      customJsCode: ''
    }
  }
  return rule
}

function getJsonPathSummary(fieldName) {
  const rule = getRule(fieldName)
  if (rule.isCombine) {
    if (rule.combinePaths && rule.combinePaths.length > 0) {
      return rule.combinePaths.join(' + ')
    }
    return '(未选拼接属性)'
  }
  if (rule.jsonPath) {
    return rule.jsonPath
  }
  return '(未绑定路径)'
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

/**
 * 清洗转换规则详细元数据字典 (名称、功能作用说明、前后转换示例)
 */
const CLEAN_RULE_METAS = {
  trim: {
    label: '去空格 (Trim)',
    desc: '移除文本首尾多余的空白字符、制表符及换行符',
    example: '"  张三  " ➔ "张三"'
  },
  clean_whitespace: {
    label: '规整空格',
    desc: '将连续多个空格、全角空格及制表符压缩为单个半角空格',
    example: '"北京   朝阳　建国门" ➔ "北京 朝阳 建国门"'
  },
  clean_phone: {
    label: '手机格式化',
    desc: '去除手机号中的 +86、国家码前缀、破折号、空格和括号，清洗为纯 11 位数字',
    example: '"+86 138-0013-8000" ➔ "13800138000"'
  },
  extract_number: {
    label: '提取金额/数值',
    desc: '过滤货币符号(¥,$)、千分位逗号与中文字符，提取纯数字并四舍五入保留指定小数位',
    example: '"¥ 1,299.50元" ➔ "1299.50"'
  },
  standard_datetime: {
    label: '日期规整',
    desc: '自动识别中英文斜杠、点号、时间戳等多种格式日期，标准化转换为目标统一时间',
    example: '"2023/5/20 15:30" ➔ "2023-05-20 15:30:00"'
  },
  dict_mapping: {
    label: '字典映射',
    desc: '建立键值映射对照表，将源数据枚举文本翻译为目标系统业务编码或标准值',
    example: '"男" ➔ 1，"女" ➔ 2，"微信支付" ➔ "WECHAT"'
  },
  uppercase: {
    label: '转大写',
    desc: '将英文字符统一转换为全大写字母，常用于业务编码、UUID或订单号前缀',
    example: '"order_sn_abc" ➔ "ORDER_SN_ABC"'
  },
  lowercase: {
    label: '转小写',
    desc: '将英文字符统一转换为全小写字母，常用于邮箱、用户名标准化',
    example: '"Admin@Example.COM" ➔ "admin@example.com"'
  },
  mask_phone: {
    label: '手机脱敏',
    desc: '对手机号进行隐私保护打码，保留前 3 位和后 4 位，中间 4 位隐藏为星号',
    example: '"13800138000" ➔ "138****8000"'
  },
  to_int: {
    label: '整数转换',
    desc: '转换为纯整数数值，非数字自动安全回退为默认值 (如 0)',
    example: '"123.45" ➔ 123'
  },
  custom_js: {
    label: '自定义JS脚本',
    desc: '运行自定义 JavaScript 代码，对整行数据进行深度清洗转换',
    example: 'return row.first_name + row.last_name'
  }
}

function getRuleLabel(type) {
  return CLEAN_RULE_METAS[type]?.label || type
}

/**
 * 获取规则悬浮详细气泡文本（包含功能说明与示例）
 * @param {string} ruleType 规则类型
 * @returns {string} 格式化的悬浮提示文本
 */
function getRuleTooltip(ruleType) {
  const meta = CLEAN_RULE_METAS[ruleType]
  if (!meta) return ruleType
  return `【${meta.label}】\n功能说明: ${meta.desc}\n转换示例: ${meta.example}`
}

function toggleExpand(fieldName) {
  if (activeExpandedField.value === fieldName) {
    activeExpandedField.value = null
  } else {
    activeExpandedField.value = fieldName
  }
}

/**
 * 字段映射整行点击事件处理
 * 通过智能事件委托，排除下拉框、输入框、按钮等交互控件，支持用户直接点击行展开或收起清洗规则
 * @param {string} fieldName 目标字段名
 * @param {MouseEvent} event 点击事件
 */
function handleRowClick(fieldName, event) {
  const interactiveSelector = 'select, input, textarea, button, a, label, .sep-presets, .json-config-quick-btn, .js-config-quick-btn, .combine-quick-btn, .rule-config-btn'
  if (event.target && event.target.closest(interactiveSelector)) {
    return
  }
  toggleExpand(fieldName)
}

/**
 * 获取当前字段关联数据源的摘要说明，用于清洗面板顶部清晰锚定展示
 * @param {string} fieldName 目标字段名
 * @returns {string} 数据源摘要文本
 */
function getSourceSummaryText(fieldName) {
  const rule = getRule(fieldName)
  if (rule.sourceType === 'ignore') return '🚫 忽略导入'
  if (rule.sourceType === 'constant') return `📌 常量值: "${rule.constantValue || ''}"`
  if (rule.sourceType === 'combine') {
    const cols = (rule.combineFields || []).join(' + ')
    return `🔗 多列拼接: ${cols ? cols : '(未勾选源列)'}`
  }
  if (rule.sourceType === 'json_path') {
    if (rule.isCombine) {
      const paths = (rule.combinePaths || []).join(' + ')
      const sep = rule.jsonSeparator !== undefined ? ` (连接符: "${rule.jsonSeparator}")` : ''
      return `📦 JSON 多属性拼接: [${rule.sourceField || '未选择'}] ${paths || '(未选路径)'}${sep}`
    }
    return `📦 JSON 单属性提取: [${rule.sourceField || '未选择'}] ${rule.jsonPath || '(未设置路径)'}`
  }
  if (rule.sourceType === 'custom_js') {
    return `⚡ JS 脚本: ${rule.sourceField ? `[${rule.sourceField}]` : '全局'}`
  }
  return `📊 Excel 列: [${rule.sourceField || '未映射'}]`
}

// 记录各个字段抽屉内实时对照表的折叠状态（默认展开或按需记忆）
const previewFoldState = ref({})

function isPreviewFolded(fieldName) {
  return previewFoldState.value[fieldName] === true
}

function togglePreviewFold(fieldName) {
  previewFoldState.value[fieldName] = !previewFoldState.value[fieldName]
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
  border-left: 4px solid transparent;
  transition: all var(--transition-fast);
}

.mapping-row-wrapper:hover {
  background: rgba(255, 255, 255, 0.02);
}

.mapping-row-wrapper.is-expanded {
  background: rgba(99, 102, 241, 0.04);
  border-left-color: var(--primary);
}

.mapping-row-main {
  display: grid;
  grid-template-columns: 240px 36px minmax(380px, 1.25fr) 1fr 130px;
  align-items: center;
  gap: 20px;
  padding: 14px 28px;
  cursor: pointer;
  user-select: none;
}

.mapping-row-main select,
.mapping-row-main input,
.mapping-row-main button,
.mapping-row-main a {
  cursor: default;
  user-select: auto;
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
  padding: 4px 8px;
  flex-shrink: 0;
  max-width: 280px;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-fast);
}

.json-config-quick-btn.is-combine-mode {
  border-color: rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.08);
}

.json-mode-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}

.json-mode-pill.is-single {
  background: rgba(16, 185, 129, 0.18);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.json-mode-pill.is-combine {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.35);
}

.json-path-summary-text {
  font-size: 11px;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #cbd5e1;
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

/* 展开面板与紧凑层级结构 */
.rule-details-panel {
  padding: 10px 24px 16px;
  background: #0c121e;
  border-top: 1px solid rgba(99, 102, 241, 0.2);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 顶部锚定横幅 (明确当前从属字段，紧凑单行) */
.panel-anchor-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.12) 0%, rgba(30, 41, 59, 0.4) 100%);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: var(--radius-sm);
  gap: 12px;
  flex-wrap: wrap;
}

.banner-target-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.banner-tag {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.banner-field-name {
  font-size: 14px;
  font-weight: 700;
  color: #a5b4fc;
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
}

.banner-field-label {
  font-size: 12px;
  color: #cbd5e1;
}

.banner-type-badge {
  font-size: 10px;
  font-family: var(--font-mono);
  background: rgba(99, 102, 241, 0.25);
  color: #c7d2fe;
  border: 1px solid rgba(99, 102, 241, 0.4);
  padding: 1px 5px;
  border-radius: 4px;
}

.banner-source-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.source-info-label {
  color: var(--text-muted);
}

.source-info-value {
  color: #38bdf8;
  font-weight: 600;
  font-family: var(--font-mono);
}

.banner-close-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #cbd5e1;
  border-color: rgba(255, 255, 255, 0.15);
  font-size: 11px;
  padding: 2px 8px;
}

.banner-close-btn:hover {
  color: #fff;
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.1);
}

/* 扁平特殊来源配置区 (无深层套娃) */
.flat-config-section {
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
}

.flat-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.flat-section-title {
  font-size: 12px;
  font-weight: 700;
  color: #e2e8f0;
}

/* 紧凑清洗规则流水线 */
.flat-rules-section {
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rules-section-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.rules-bar-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  color: #a5b4fc;
  white-space: nowrap;
}

.compact-rule-toggles {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.compact-toggle-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #cbd5e1;
  cursor: pointer;
  user-select: none;
  transition: all var(--transition-fast);
}

.compact-toggle-chip:hover {
  border-color: rgba(99, 102, 241, 0.55);
  background: rgba(99, 102, 241, 0.12);
  color: #fff;
}

.compact-toggle-chip.is-active {
  background: rgba(99, 102, 241, 0.18);
  border-color: var(--primary);
  color: #c7d2fe;
  box-shadow: 0 0 6px rgba(99, 102, 241, 0.25);
}

.compact-toggle-chip input[type="checkbox"] {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--primary);
  cursor: pointer;
}

/* 规则子参数内嵌条 (紧凑单行) */
.rule-sub-params-strip {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px dashed rgba(99, 102, 241, 0.25);
  border-radius: var(--radius-sm);
}

.param-inline-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.param-inline-label {
  font-size: 11px;
  font-weight: 600;
  color: #cbd5e1;
}

.form-select-xs {
  height: 26px;
  font-size: 11px;
  padding: 2px 8px;
}

.form-input-xs {
  height: 26px;
  font-size: 11px;
  padding: 2px 8px;
}

.param-select {
  width: 240px;
}

.param-select-sm {
  width: 140px;
}

.param-dict-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fallback-input {
  max-width: 220px;
}

/* 字典编辑器 */
.dict-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dict-pairs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dict-pair-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dict-pair-row input {
  max-width: 160px;
}

.dict-fallback-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  border-top: 1px dashed var(--border-subtle);
  padding-top: 6px;
}

.icon-del-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
}

.icon-del-btn:hover {
  color: var(--danger);
}

/* 拼接设置扁平布局 */
.combine-clean-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.combine-cols-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.clean-sub-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.source-checkbox-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.source-checkbox-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}

.source-checkbox-item:hover {
  border-color: var(--primary-border);
}

.combine-sep-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sep-input {
  max-width: 120px;
}

.sep-presets {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

/* 紧凑可折叠的实时转换效果对比区 */
.compact-pipeline-section {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.compact-pipeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 12px;
  cursor: pointer;
  user-select: none;
  background: rgba(255, 255, 255, 0.02);
  transition: background var(--transition-fast);
}

.compact-pipeline-header:hover {
  background: rgba(255, 255, 255, 0.04);
}

.pipeline-header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #cbd5e1;
}

.pipeline-header-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.preview-fold-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.preview-fold-arrow {
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.preview-fold-arrow.is-folded {
  transform: rotate(-90deg);
}

.compact-table-scroll {
  overflow-x: auto;
  background: #090d16;
}

.compact-sample-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.compact-sample-table th,
.compact-sample-table td {
  padding: 5px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
}

.compact-sample-table th {
  background: #141c2b;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 10px;
}

.compact-sample-table tr:last-child td {
  border-bottom: none;
}

.badge-xs {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
}
</style>
