<template>
  <div class="json-path-selector-box">
    <!-- 头部工具栏：模式切换与当前路径 -->
    <div class="selector-top-toolbar">
      <div class="mode-toggles">
        <button
          type="button"
          class="mode-btn"
          :class="{ 'is-active': !isCombine }"
          @click="setCombineMode(false)"
        >
          <Target :size="13" />
          <span>单属性提取</span>
        </button>

        <button
          type="button"
          class="mode-btn"
          :class="{ 'is-active': isCombine }"
          @click="setCombineMode(true)"
        >
          <Layers :size="13" />
          <span>多属性拼接</span>
        </button>
      </div>

      <!-- 多属性拼接时连接符 -->
      <div v-if="isCombine" class="sep-setting">
        <span class="sep-label">拼接连接符:</span>
        <input
          :value="separator"
          class="form-input form-input-sm sep-input"
          placeholder="如: 空格, 逗号"
          @input="$emit('update:separator', $event.target.value)"
        />
      </div>

      <!-- 弹出树形结构抽屉/弹窗的按钮 -->
      <button
        type="button"
        class="btn btn-secondary btn-sm tree-modal-btn"
        @click="showTreeModal = true"
      >
        <FolderTree :size="14" class="text-primary" />
        <span>打开折叠树拾取器</span>
      </button>
    </div>

    <!-- 紧凑级联下拉选择区 (Cascading Dropdowns) - 极简不占空间，逐层深入 -->
    <div class="cascade-drilldown-card">
      <div class="cascade-label-row">
        <span class="cascade-label">
          <GitFork :size="13" class="text-primary" />
          <span>按层级逐步下钻选择 (极简不占屏，从顶层逐级深入):</span>
        </span>
        <span v-if="currentExtractedPreview !== 'NULL'" class="sample-badge">
          当前提取值: <strong class="text-emerald">{{ currentExtractedPreview }}</strong>
        </span>
      </div>

      <div v-if="sampleJsonObj" class="cascade-selects-row">
        <!-- 逐级下拉框 -->
        <div
          v-for="(levelList, lvlIdx) in cascadeLevels"
          :key="lvlIdx"
          class="cascade-select-group"
        >
          <span v-if="lvlIdx > 0" class="cascade-divider">/</span>
          <select
            :value="selectedLevels[lvlIdx] || ''"
            class="form-select form-select-sm cascade-select"
            @change="onCascadeSelect(lvlIdx, $event.target.value)"
          >
            <option value="">-- 第 {{ lvlIdx + 1 }} 层属性 --</option>
            <option
              v-for="opt in levelList"
              :key="opt.key"
              :value="opt.key"
            >
              {{ opt.key }} {{ opt.isObject ? '📁 {...}' : `(${opt.sample || opt.type})` }}
            </option>
          </select>
        </div>

        <button
          v-if="isCombine && selectedLevels.length > 0"
          type="button"
          class="btn btn-primary btn-sm add-combine-btn"
          @click="addCurrentCascadeToCombine"
        >
          <Plus :size="13" />
          <span>添加此路径</span>
        </button>

        <button
          v-if="selectedLevels.length > 0"
          type="button"
          class="btn btn-outline btn-sm reset-cascade-btn"
          title="清空重选"
          @click="resetCascade"
        >
          重置
        </button>
      </div>

      <!-- 多行实时提取效果预览条 (利用多余空间展示多行内容) -->
      <div v-if="multiRowPreviews.length > 0" class="multi-sample-preview-strip">
        <div class="strip-header">
          <Eye :size="13" class="text-emerald" />
          <span>多行实时提取效果预览 (前 {{ multiRowPreviews.length }} 行):</span>
        </div>
        <div class="strip-items">
          <div
            v-for="item in multiRowPreviews"
            :key="item.rowIndex"
            class="strip-item"
            :class="{ 'is-null': item.isNull }"
            :title="`第 ${item.rowIndex} 行: ${item.val}`"
          >
            <span class="item-row-badge">#{{ item.rowIndex }}</span>
            <span class="item-val mono-text">{{ truncate(item.val, 80) }}</span>
          </div>
        </div>
      </div>

      <div v-else-if="!sampleJsonObj" class="json-empty-hint">
        <AlertTriangle :size="14" class="text-warning" />
        <span>源列 [{{ sourceField || '未选择' }}] 当前没有检测到有效的 JSON 数据</span>
      </div>
    </div>

    <!-- 目标路径显示与微调输入栏 -->
    <div class="path-display-bar">
      <template v-if="!isCombine">
        <span class="bar-title">最终绑定路径:</span>
        <div class="bar-input-box">
          <input
            :value="modelValue"
            class="form-input form-input-sm mono-text"
            placeholder="例如: profile.address.city"
            @input="$emit('update:modelValue', $event.target.value)"
          />
        </div>
      </template>

      <template v-else>
        <span class="bar-title">已选拼接路径 ({{ (combinePaths || []).length }} 个):</span>
        <div class="selected-tags-box">
          <span
            v-for="(p, pIdx) in (combinePaths || [])"
            :key="p"
            class="path-pill"
          >
            <span class="mono-text">{{ p }}</span>
            <button type="button" class="pill-del" @click="removeCombinePath(pIdx)">×</button>
          </span>
          <span v-if="!combinePaths || combinePaths.length === 0" class="text-muted text-xs">
            暂未添加路径，请从上方级联下拉或树形弹窗添加
          </span>
        </div>
      </template>
    </div>

    <!-- 🌲 树形折叠结构拾取弹窗 (Modern Dual-Pane IDE Inspector Modal) -->
    <div v-if="showTreeModal" class="modal-overlay" @click.self="showTreeModal = false">
      <div class="modal-content tree-modal-content">
        <!-- 弹窗顶栏 -->
        <div class="modal-header tree-modal-header">
          <div class="header-left">
            <div class="modal-icon-badge">
              <FolderTree :size="18" class="text-primary" />
            </div>
            <div class="modal-title-box">
              <div class="modal-main-title">
                <span>JSON 树形层级折叠浏览器</span>
                <span class="source-col-badge">源列: {{ sourceField || '未指定' }}</span>
              </div>
              <div class="modal-sub-title">
                点击左侧节点展开/折叠多层结构，右侧实时透视前 5 行真实数据与完整路径
              </div>
            </div>
          </div>

          <div class="header-right">
            <span class="mode-indicator-pill" :class="isCombine ? 'is-combine' : 'is-single'">
              {{ isCombine ? '🔗 多属性拼接模式' : '🎯 单属性提取模式' }}
            </span>
            <button class="modal-close" @click="showTreeModal = false" title="关闭弹窗">
              <X :size="16" />
            </button>
          </div>
        </div>

        <!-- 弹窗主体：左树形导航 + 右属性透视 -->
        <div class="modal-body tree-modal-body">
          <div class="tree-explorer-layout">
            <!-- 左栏: 树形层级导航器 (52% 宽度) -->
            <div class="tree-nav-panel">
              <!-- 搜索与折叠快捷操作 -->
              <div class="nav-toolbar">
                <div class="search-box-wrapper">
                  <Search :size="14" class="search-icon" />
                  <input
                    v-model="treeSearchQuery"
                    class="form-input form-input-sm search-input"
                    placeholder="快速搜索属性名 (如 city、channel)..."
                  />
                  <button v-if="treeSearchQuery" class="clear-search-btn" @click="treeSearchQuery = ''">
                    <X :size="12" />
                  </button>
                </div>

                <div class="nav-actions">
                  <button
                    type="button"
                    class="btn btn-outline btn-xs"
                    title="展开所有层级"
                    @click="expandAllNodes"
                  >
                    <ChevronsUpDown :size="13" />
                    <span>展开</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline btn-xs"
                    title="折叠所有层级"
                    @click="collapseAllNodes"
                  >
                    <Minimize2 :size="13" />
                    <span>折叠</span>
                  </button>
                </div>
              </div>

              <!-- 统计与过滤状态条 -->
              <div class="tree-meta-bar">
                <span class="meta-count">共 {{ filteredTreeNodes.length }} 个节点</span>
                <span v-if="treeSearchQuery" class="meta-search-hint">匹配 "{{ treeSearchQuery }}"</span>
                <span class="meta-tip">单击查看详情，双击直接选用</span>
              </div>

              <!-- 树形节点主滚动容器 -->
              <div class="tree-scroll-pane">
                <template v-if="filteredTreeNodes.length > 0">
                  <div
                    v-for="node in filteredTreeNodes"
                    :key="node.path"
                    class="tree-node-item"
                    :class="{
                      'is-active': activeNode?.path === node.path,
                      'is-bound': isPathActive(node.path)
                    }"
                    :style="{ paddingLeft: `${(node.depth - 1) * 16 + 10}px` }"
                    @click="selectActiveNode(node)"
                    @dblclick="confirmNodeSelection(node)"
                  >
                    <!-- 展开/折叠三角 -->
                    <button
                      v-if="node.hasChildren"
                      type="button"
                      class="node-chevron-btn"
                      @click.stop="toggleNodeExpand(node.path)"
                    >
                      <ChevronRight :size="13" :class="{ 'is-rotated': isNodeExpanded(node.path) }" />
                    </button>
                    <span v-else class="node-chevron-placeholder"></span>

                    <!-- 节点类型图标 -->
                    <span class="node-icon-wrapper" :class="`icon-${node.type}`">
                      <Folder v-if="node.type === 'object'" :size="13" />
                      <ListTree v-else-if="node.type === 'array'" :size="13" />
                      <Hash v-else-if="node.type === 'number'" :size="13" />
                      <ToggleLeft v-else-if="node.type === 'boolean'" :size="13" />
                      <FileText v-else :size="13" />
                    </span>

                    <!-- 属性名 -->
                    <span class="node-key-text mono-text">
                      {{ node.key }}
                    </span>

                    <!-- 类型小徽章 -->
                    <span class="node-type-pill" :class="`pill-${node.type}`">
                      {{ formatNodeTypeBadge(node) }}
                    </span>

                    <!-- 快速预览样本 -->
                    <span v-if="!node.hasChildren" class="node-sample-snippet mono-text" :title="String(node.sample)">
                      : {{ truncate(node.sample, 30) }}
                    </span>

                    <!-- 状态徽章: 已选定 -->
                    <span v-if="isPathActive(node.path)" class="bound-tag">
                      ✓ 已选
                    </span>
                  </div>
                </template>

                <div v-else class="tree-empty-state">
                  <AlertCircle :size="24" class="text-muted" />
                  <p>未找到匹配 "{{ treeSearchQuery }}" 的属性节点</p>
                </div>
              </div>
            </div>

            <!-- 右栏: 属性详情与实时样本数据透视 (48% 宽度) -->
            <div class="tree-inspector-panel">
              <template v-if="activeNode">
                <!-- 属性标题卡片 -->
                <div class="inspector-card header-card">
                  <div class="node-title-row">
                    <span class="node-icon-wrapper large" :class="`icon-${activeNode.type}`">
                      <Folder v-if="activeNode.type === 'object'" :size="16" />
                      <ListTree v-else-if="activeNode.type === 'array'" :size="16" />
                      <Hash v-else-if="activeNode.type === 'number'" :size="16" />
                      <ToggleLeft v-else-if="activeNode.type === 'boolean'" :size="16" />
                      <FileText v-else :size="16" />
                    </span>
                    <div class="node-title-text">
                      <div class="node-name mono-text">{{ activeNode.key }}</div>
                      <div class="node-tags">
                        <span class="type-badge" :class="`pill-${activeNode.type}`">{{ activeNode.type.toUpperCase() }}</span>
                        <span class="depth-badge">层级: 第 {{ activeNode.depth }} 层</span>
                        <span v-if="activeNode.hasChildren" class="children-badge">包含 {{ activeNode.childrenCount }} 个子属性</span>
                      </div>
                    </div>
                  </div>

                  <!-- 完整 JSON 路径与复制按钮 -->
                  <div class="full-path-box">
                    <span class="path-label">完整访问路径:</span>
                    <div class="path-input-group">
                      <code class="path-code mono-text">{{ activeNode.path }}</code>
                      <button
                        type="button"
                        class="btn-copy-path"
                        :title="copiedPath ? '已复制' : '复制路径'"
                        @click="copyPath(activeNode.path)"
                      >
                        <Check v-if="copiedPath" :size="13" class="text-emerald" />
                        <Copy v-else :size="13" />
                        <span>{{ copiedPath ? '已复制' : '复制' }}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- 前 5 行真实数据提取效果透视 (Multi-Row Evaluator) -->
                <div class="inspector-card data-eval-card">
                  <div class="eval-card-header">
                    <div class="eval-title">
                      <Eye :size="14" class="text-primary" />
                      <span>前 5 行源数据提取效果验证 (Live Evaluation)</span>
                    </div>
                    <span class="eval-sub">在真实 Excel 记录中评估此路径值</span>
                  </div>

                  <div class="eval-rows-list">
                    <div
                      v-for="(evalItem, eIdx) in activeNodeEvaluations"
                      :key="eIdx"
                      class="eval-row"
                      :class="{ 'is-null': evalItem.isNull }"
                    >
                      <div class="eval-row-left">
                        <span class="row-num-tag">#{{ evalItem.rowIndex }}</span>
                      </div>
                      <div class="eval-row-right">
                        <span class="eval-val mono-text" :title="String(evalItem.val)">
                          {{ evalItem.val }}
                        </span>
                        <span v-if="evalItem.isNull" class="null-tip">此行无该属性或为 NULL</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 底部操作按钮 -->
                <div class="inspector-action-bar">
                  <button
                    v-if="!isCombine"
                    type="button"
                    class="btn btn-primary btn-block confirm-select-btn"
                    @click="confirmNodeSelection(activeNode)"
                  >
                    <Check :size="16" />
                    <span>确认选用此属性 [{{ activeNode.path }}]</span>
                  </button>

                  <div v-else class="combine-actions-group">
                    <button
                      type="button"
                      class="btn btn-block"
                      :class="(combinePaths || []).includes(activeNode.path) ? 'btn-danger' : 'btn-primary'"
                      @click="toggleCombineNode(activeNode.path)"
                    >
                      <Minus v-if="(combinePaths || []).includes(activeNode.path)" :size="16" />
                      <Plus v-else :size="16" />
                      <span>
                        {{ (combinePaths || []).includes(activeNode.path) ? '从拼接列表中移除此路径' : '+ 加入多属性拼接列表' }}
                      </span>
                    </button>
                  </div>
                </div>
              </template>

              <div v-else class="inspector-placeholder">
                <MousePointerClick :size="32" class="text-muted" />
                <p class="placeholder-title">点击左侧树形节点进行属性详情透视</p>
                <p class="placeholder-desc">查看该属性在所有样本数据中的提取结果与语法信息</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 弹窗底栏 -->
        <div class="modal-footer tree-modal-footer">
          <div class="footer-left-info">
            <template v-if="!isCombine">
              <span class="footer-status-label">当前选定路径:</span>
              <span class="badge badge-primary mono-text bound-badge">{{ modelValue || '未选择' }}</span>
            </template>
            <template v-else>
              <span class="footer-status-label">已选拼接路径:</span>
              <div class="footer-tags-preview">
                <span
                  v-for="(p, pIdx) in (combinePaths || [])"
                  :key="p"
                  class="path-tag-pill mono-text"
                >
                  <span>{{ p }}</span>
                  <button type="button" class="tag-del-btn" @click="removeCombinePath(pIdx)">×</button>
                </span>
                <span v-if="!combinePaths || combinePaths.length === 0" class="text-muted text-xs">
                  暂未添加拼接路径
                </span>
              </div>
            </template>
          </div>

          <div class="footer-right-actions">
            <button class="btn btn-outline btn-sm" @click="showTreeModal = false">取消</button>
            <button class="btn btn-primary" @click="showTreeModal = false">
              <Check :size="15" />
              <span>完成选择</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  Target,
  Layers,
  GitFork,
  Plus,
  Minus,
  AlertTriangle,
  FolderTree,
  Search,
  ChevronRight,
  Folder,
  ListTree,
  FileText,
  Eye,
  X,
  ChevronsUpDown,
  Minimize2,
  Hash,
  ToggleLeft,
  Check,
  Copy,
  AlertCircle,
  MousePointerClick
} from 'lucide-vue-next'
import { safeParseJson, getNestedJsonValue } from '../utils/cleaner'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  combinePaths: {
    type: Array,
    default: () => []
  },
  isCombine: {
    type: Boolean,
    default: false
  },
  separator: {
    type: String,
    default: ' '
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

const emit = defineEmits([
  'update:modelValue',
  'update:combinePaths',
  'update:isCombine',
  'update:separator'
])

const showTreeModal = ref(false)
const treeSearchQuery = ref('')
const expandedNodePaths = ref(new Set())
const activeNode = ref(null)
const copiedPath = ref(false)

// 级联下钻各层选定键
const selectedLevels = ref([])

// 获取样本 JSON 对象
const sampleJsonObj = computed(() => {
  if (!props.sourceField || !props.sampleRows) return null
  for (const r of props.sampleRows) {
    const rawVal = r[props.sourceField]
    const parsed = safeParseJson(rawVal)
    if (parsed) return parsed
  }
  return null
})

// 根据当前选定的路径实时计算提取预览值
const currentExtractedPreview = computed(() => {
  if (!sampleJsonObj.value) return 'NULL'
  if (props.isCombine) {
    if (!props.combinePaths || props.combinePaths.length === 0) return '未选拼接路径'
    const parts = props.combinePaths.map(p => {
      const v = getNestedJsonValue(sampleJsonObj.value, p)
      return v !== null && v !== undefined ? String(v) : ''
    }).filter(Boolean)
    return parts.length > 0 ? parts.join(props.separator || ' ') : 'NULL'
  }
  if (!props.modelValue) return 'NULL'
  const v = getNestedJsonValue(sampleJsonObj.value, props.modelValue)
  return v !== null && v !== undefined ? (typeof v === 'object' ? JSON.stringify(v) : String(v)) : 'NULL'
})

// 计算针对多行样本数据的实时提取预览值列表 (当有多余空间时展示多行内容)
const multiRowPreviews = computed(() => {
  if (!props.sourceField || !props.sampleRows || props.sampleRows.length === 0) return []
  if (!props.isCombine && !props.modelValue) return []
  if (props.isCombine && (!props.combinePaths || props.combinePaths.length === 0)) return []

  const rows = props.sampleRows.slice(0, 5)
  return rows.map((r, idx) => {
    const rawVal = r[props.sourceField]
    const parsed = safeParseJson(rawVal)
    if (!parsed) {
      return { rowIndex: r._rawRowIndex || (idx + 1), val: '(非合法JSON或为空)', isNull: true }
    }
    if (props.isCombine) {
      const parts = props.combinePaths.map(p => {
        const v = getNestedJsonValue(parsed, p)
        return v !== null && v !== undefined ? (typeof v === 'object' ? JSON.stringify(v) : String(v).trim()) : ''
      }).filter(Boolean)
      const res = parts.join(props.separator || ' ')
      return { rowIndex: r._rawRowIndex || (idx + 1), val: res || '(空)', isNull: !res }
    } else {
      const v = getNestedJsonValue(parsed, props.modelValue)
      const res = v !== null && v !== undefined ? (typeof v === 'object' ? JSON.stringify(v) : String(v)) : '(空)'
      return { rowIndex: r._rawRowIndex || (idx + 1), val: res, isNull: v === null || v === undefined || v === '' }
    }
  })
})

// 级联下钻数据计算 (Cascading Levels)
const cascadeLevels = computed(() => {
  if (!sampleJsonObj.value) return []

  const levels = []
  let currentObj = sampleJsonObj.value

  // 第 1 层
  levels.push(getObjectKeyList(currentObj))

  // 根据当前 selectedLevels 逐层向下找属性
  for (let i = 0; i < selectedLevels.value.length; i++) {
    const key = selectedLevels.value[i]
    if (currentObj && typeof currentObj === 'object' && currentObj[key] !== undefined) {
      currentObj = currentObj[key]
      if (typeof currentObj === 'object' && currentObj !== null) {
        levels.push(getObjectKeyList(currentObj))
      } else {
        break
      }
    } else {
      break
    }
  }

  return levels
})

function getObjectKeyList(obj) {
  if (!obj || typeof obj !== 'object') return []
  return Object.keys(obj).map(k => {
    const val = obj[k]
    const isObject = typeof val === 'object' && val !== null
    return {
      key: k,
      type: Array.isArray(val) ? 'array' : typeof val,
      isObject,
      sample: isObject ? (Array.isArray(val) ? `[${val.length}项]` : '{...}') : String(val)
    }
  })
}

function onCascadeSelect(levelIdx, chosenKey) {
  if (!chosenKey) {
    selectedLevels.value = selectedLevels.value.slice(0, levelIdx)
  } else {
    selectedLevels.value = [...selectedLevels.value.slice(0, levelIdx), chosenKey]
  }

  const fullPath = selectedLevels.value.join('.')
  if (!props.isCombine) {
    emit('update:modelValue', fullPath)
  }
}

function resetCascade() {
  selectedLevels.value = []
}

function addCurrentCascadeToCombine() {
  const path = selectedLevels.value.join('.')
  if (path) {
    const list = [...(props.combinePaths || [])]
    if (!list.includes(path)) {
      list.push(path)
      emit('update:combinePaths', list)
    }
  }
}

function setCombineMode(val) {
  emit('update:isCombine', val)
  if (val && (!props.combinePaths || props.combinePaths.length === 0) && props.modelValue) {
    emit('update:combinePaths', [props.modelValue])
  }
}

function removeCombinePath(idx) {
  const list = [...(props.combinePaths || [])]
  list.splice(idx, 1)
  emit('update:combinePaths', list)
}

// 扁平化树节点生成（带层级与折叠状态）
const allTreeNodes = computed(() => {
  if (!sampleJsonObj.value) return []
  const nodes = []

  function buildNodes(obj, parentPath = '', depth = 1) {
    if (!obj || typeof obj !== 'object') return

    const keys = Object.keys(obj)
    keys.forEach(k => {
      const currentPath = parentPath ? `${parentPath}.${k}` : k
      const val = obj[k]
      const hasChildren = typeof val === 'object' && val !== null
      const childrenCount = hasChildren ? Object.keys(val).length : 0

      nodes.push({
        key: k,
        path: currentPath,
        parentPath,
        depth,
        type: Array.isArray(val) ? 'array' : typeof val,
        hasChildren,
        childrenCount,
        sample: hasChildren ? (Array.isArray(val) ? `[${val.length}项]` : '{...}') : val
      })

      if (hasChildren) {
        buildNodes(val, currentPath, depth + 1)
      }
    })
  }

  buildNodes(sampleJsonObj.value)
  return nodes
})

// 根据搜索过滤与折叠状态输出可视节点
const filteredTreeNodes = computed(() => {
  const query = treeSearchQuery.value.toLowerCase().trim()

  if (query) {
    // 搜索模式：直接匹配所有符合的节点并高亮
    return allTreeNodes.value.filter(n => {
      return n.path.toLowerCase().includes(query) || String(n.sample).toLowerCase().includes(query)
    })
  }

  // 常规树模式：仅展示其所有祖先节点均处于展开状态的节点
  return allTreeNodes.value.filter(n => {
    if (n.depth === 1) return true
    // 检查每一级父路径是否都已展开
    const parts = n.path.split('.')
    let check = ''
    for (let i = 0; i < parts.length - 1; i++) {
      check = check ? `${check}.${parts[i]}` : parts[i]
      if (!expandedNodePaths.value.has(check)) {
        return false
      }
    }
    return true
  })
})

function isNodeExpanded(path) {
  return expandedNodePaths.value.has(path)
}

function toggleNodeExpand(path) {
  if (expandedNodePaths.value.has(path)) {
    expandedNodePaths.value.delete(path)
  } else {
    expandedNodePaths.value.add(path)
  }
}

function expandAllNodes() {
  allTreeNodes.value.forEach(n => {
    if (n.hasChildren) {
      expandedNodePaths.value.add(n.path)
    }
  })
}

function collapseAllNodes() {
  expandedNodePaths.value.clear()
}

function isPathActive(path) {
  if (!props.isCombine) return props.modelValue === path
  return (props.combinePaths || []).includes(path)
}

function selectSinglePath(path) {
  emit('update:modelValue', path)
  showTreeModal.value = false
}

function toggleCombineNode(path) {
  const list = [...(props.combinePaths || [])]
  const idx = list.indexOf(path)
  if (idx !== -1) {
    list.splice(idx, 1)
  } else {
    list.push(path)
  }
  emit('update:combinePaths', list)
}

function onTreeNodeClick(node) {
  if (node.hasChildren) {
    toggleNodeExpand(node.path)
  } else {
    if (!props.isCombine) {
      selectSinglePath(node.path)
    } else {
      toggleCombineNode(node.path)
    }
  }
}

function selectActiveNode(node) {
  activeNode.value = node
}

function confirmNodeSelection(node) {
  if (!node) return
  if (!props.isCombine) {
    emit('update:modelValue', node.path)
    showTreeModal.value = false
  } else {
    toggleCombineNode(node.path)
  }
}

async function copyPath(path) {
  if (!path) return
  try {
    await navigator.clipboard.writeText(path)
    copiedPath.value = true
    setTimeout(() => {
      copiedPath.value = false
    }, 1500)
  } catch {
    // fallback
  }
}

// 针对当前高亮选中的节点在 sampleRows 前 5 行做实时数据透视评估
const activeNodeEvaluations = computed(() => {
  if (!activeNode.value || !props.sampleRows || !props.sourceField) return []
  const rows = props.sampleRows.slice(0, 5)
  return rows.map((r, idx) => {
    const rawVal = r[props.sourceField]
    const parsed = safeParseJson(rawVal)
    if (!parsed) {
      return { rowIndex: r._rawRowIndex || (idx + 1), val: '(非合法 JSON 或为空)', isNull: true }
    }
    const val = getNestedJsonValue(parsed, activeNode.value.path)
    const isNull = val === null || val === undefined || val === ''
    let displayVal = 'NULL'
    if (!isNull) {
      displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val)
    }
    return {
      rowIndex: r._rawRowIndex || (idx + 1),
      val: displayVal,
      isNull
    }
  })
})

// 监听弹窗打开，自动高亮并展开当前绑定的节点
watch(showTreeModal, (isOpen) => {
  if (isOpen) {
    if (props.modelValue) {
      const matched = allTreeNodes.value.find(n => n.path === props.modelValue)
      if (matched) {
        activeNode.value = matched
        // 自动展开其所有祖先节点
        const parts = matched.path.split('.')
        let acc = ''
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? `${acc}.${parts[i]}` : parts[i]
          expandedNodePaths.value.add(acc)
        }
        return
      }
    }
    // 默认高亮第一个叶子节点或根节点
    const firstLeaf = allTreeNodes.value.find(n => !n.hasChildren) || allTreeNodes.value[0]
    activeNode.value = firstLeaf || null
  }
})

function truncate(val, max = 80) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  return s.length > max ? s.substring(0, max) + '...' : s
}

function formatNodeTypeBadge(node) {
  if (!node) return ''
  if (node.type === 'array') return `[${node.childrenCount}]`
  if (node.type === 'object') return `{${node.childrenCount}}`
  return node.type
}

// 初始化时如果已有选中的路径，自动同步级联状态
watch(() => props.modelValue, (newVal) => {
  if (newVal && selectedLevels.value.length === 0) {
    selectedLevels.value = newVal.split('.')
  }
}, { immediate: true })
</script>

<style scoped>
.json-path-selector-box {
  background: #0f1624;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 顶部工具栏 */
.selector-top-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.mode-toggles {
  display: flex;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 2px;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mode-btn.is-active {
  background: var(--primary);
  color: #fff;
}

.sep-setting {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sep-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.sep-input {
  width: 90px;
}

.tree-modal-btn {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 级联下钻单行卡片 */
.cascade-drilldown-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cascade-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.cascade-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #a5b4fc;
}

.sample-badge {
  font-size: 12px;
  color: var(--text-muted);
}

.text-emerald {
  color: #34d399;
}

.cascade-selects-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cascade-select-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cascade-divider {
  color: var(--text-muted);
  font-weight: bold;
}

.cascade-select {
  width: auto;
  min-width: 170px;
  color: #fff;
}

.add-combine-btn {
  display: flex;
  align-items: center;
  gap: 4px;
}

.reset-cascade-btn {
  font-size: 11px;
  padding: 4px 8px;
}

.json-empty-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #fde68a;
  padding: 4px 0;
}

/* 多行实时提取效果预览条 (利用多余空间展示多行内容) */
.multi-sample-preview-strip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
}

.strip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
}

.strip-items {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.strip-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 11px;
}

.strip-item.is-null .item-val {
  color: var(--text-muted);
}

.item-row-badge {
  font-size: 10px;
  color: var(--text-secondary);
  font-weight: 700;
}

.item-val {
  color: #34d399;
}

/* 路径显示栏 */
.path-display-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.2);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.05);
  flex-wrap: wrap;
}

.bar-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.bar-input-box {
  flex: 1;
  min-width: 220px;
}

.selected-tags-box {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.path-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--primary-light);
  border: 1px solid var(--primary-border);
  color: #a5b4fc;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.pill-del {
  background: transparent;
  border: none;
  color: #a5b4fc;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.pill-del:hover {
  color: #fff;
}

/* =========================================================================
   🌲 高科技双栏 IDE 级 JSON 树形折叠检查器 (Dual-Pane Inspector Modal)
   ========================================================================= */
.tree-modal-content {
  max-width: 1100px;
  width: 95vw;
  height: 86vh;
  max-height: 850px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 50px rgba(99, 102, 241, 0.2);
}

.tree-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 22px;
  background: #141c2e;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-icon-badge {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modal-title-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modal-main-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
  color: #fff;
}

.source-col-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  font-family: var(--font-mono);
  font-weight: 600;
}

.modal-sub-title {
  font-size: 11px;
  color: var(--text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mode-indicator-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
}

.mode-indicator-pill.is-single {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.mode-indicator-pill.is-combine {
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.tree-modal-body {
  padding: 0 !important;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
}

.tree-explorer-layout {
  display: grid;
  grid-template-columns: 52% 48%;
  width: 100%;
  height: 100%;
}

/* 左侧栏: 树形导航器 */
.tree-nav-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #0b1120;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.nav-toolbar {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: #0d1527;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.search-box-wrapper {
  position: relative;
  flex: 1;
}

.search-box-wrapper .search-icon {
  position: absolute;
  left: 9px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.search-box-wrapper .search-input {
  padding-left: 28px;
  padding-right: 26px;
  height: 28px;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.1);
}

.clear-search-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
}

.clear-search-btn:hover {
  color: #fff;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.btn-xs {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tree-meta-bar {
  padding: 6px 14px;
  font-size: 11px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.25);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.meta-count {
  font-weight: 600;
  color: var(--text-secondary);
}

.meta-search-hint {
  color: #38bdf8;
}

.meta-tip {
  color: var(--text-muted);
  font-size: 10px;
}

.tree-scroll-pane {
  flex: 1;
  overflow-y: auto;
  padding: 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tree-node-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  border-left: 3px solid transparent;
}

.tree-node-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.tree-node-item.is-active {
  background: rgba(99, 102, 241, 0.14);
  border-left-color: #6366f1;
}

.tree-node-item.is-bound {
  background: rgba(16, 185, 129, 0.08);
}

.node-chevron-btn {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
}

.node-chevron-btn svg {
  transition: transform 0.15s ease;
}

.node-chevron-btn svg.is-rotated {
  transform: rotate(90deg);
}

.node-chevron-placeholder {
  width: 16px;
  flex-shrink: 0;
}

.node-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.node-icon-wrapper.icon-object { color: #818cf8; }
.node-icon-wrapper.icon-array { color: #fbbf24; }
.node-icon-wrapper.icon-number { color: #38bdf8; }
.node-icon-wrapper.icon-boolean { color: #c084fc; }
.node-icon-wrapper.icon-string { color: #34d399; }

.node-key-text {
  font-size: 12px;
  font-weight: 600;
  color: #f1f5f9;
}

.tree-node-item.is-active .node-key-text {
  color: #fff;
  font-weight: 700;
}

.node-type-pill {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-weight: 600;
}

.node-type-pill.pill-object { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; }
.node-type-pill.pill-array { background: rgba(245, 158, 11, 0.15); color: #fde68a; }
.node-type-pill.pill-number { background: rgba(14, 165, 233, 0.15); color: #7dd3fc; }
.node-type-pill.pill-boolean { background: rgba(168, 85, 247, 0.15); color: #e9d5ff; }
.node-type-pill.pill-string { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; }

.node-sample-snippet {
  font-size: 11px;
  color: var(--text-muted);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bound-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.18);
  color: #34d399;
  font-weight: 700;
  margin-left: auto;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.tree-empty-state {
  text-align: center;
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 12px;
}

/* 右侧栏: 属性详情透视与真实数据沙箱 */
.tree-inspector-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #0f172a;
  padding: 16px 18px;
  overflow-y: auto;
  gap: 12px;
}

.inspector-card {
  background: #131c31;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.node-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.node-icon-wrapper.large {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.node-title-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-name {
  font-size: 16px;
  font-weight: 800;
  color: #fff;
}

.node-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
}

.depth-badge, .children-badge {
  font-size: 11px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 6px;
  border-radius: 4px;
}

.full-path-box {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.path-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}

.path-input-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.path-code {
  color: #a5b4fc;
  font-size: 13px;
  font-weight: 700;
  word-break: break-all;
}

.btn-copy-path {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-copy-path:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.eval-card-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.eval-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.eval-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.eval-rows-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.eval-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 6px 10px;
  border-radius: 5px;
  font-size: 12px;
}

.row-num-tag {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 700;
  width: 26px;
  flex-shrink: 0;
}

.eval-val {
  color: #34d399;
  max-width: 380px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eval-row.is-null .eval-val {
  color: var(--text-muted);
  font-style: italic;
}

.null-tip {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: 6px;
}

.inspector-action-bar {
  margin-top: auto;
  padding-top: 8px;
}

.confirm-select-btn {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
}

.combine-actions-group .btn-block {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.inspector-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-muted);
  gap: 10px;
  padding: 40px 20px;
}

.placeholder-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-secondary);
}

.placeholder-desc {
  font-size: 12px;
  color: var(--text-muted);
  max-width: 260px;
}

/* 弹窗底栏 */
.tree-modal-footer {
  padding: 12px 24px;
  background: #0c1322;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
}

.footer-left-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

.footer-status-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
  white-space: nowrap;
}

.bound-badge {
  font-size: 12px;
  padding: 3px 8px;
}

.footer-tags-preview {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.path-tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.tag-del-btn {
  background: transparent;
  border: none;
  color: #a5b4fc;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}

.tag-del-btn:hover {
  color: #fff;
}

.footer-right-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
</style>
