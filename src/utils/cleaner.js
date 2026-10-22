/**
 * 数据清洗与转换核心引擎
 * 支持字段单射、多列拼接、多层嵌套 JSON 字段提取、自定义 JS 脚本清洗、字典转换、正则、去重与实时数据校验
 */

/**
 * 执行数据清洗流水线
 * @param {Array<object>} sourceRows 源数据行列表
 * @param {Array<object>} targetFields 目标表字段定义列表
 * @param {Array<object>} mappingRules 映射与清洗规则列表
 * @param {object} options 全局行级选项（去重、空行过滤等）
 * @returns {{ cleanedRows: Array<object>, stats: object, errorSummary: Array<object> }}
 */
/**
 * 判断字符串或数据是否等价于数据库 NULL 标识
 * @param {any} val 待检测的值
 * @returns {boolean} 是否为数据库 NULL 标识
 */
export function isNullLiteral(val) {
  if (val === null || val === undefined || val === '') return true
  if (typeof val === 'string') {
    return /^(null|\(null\)|nil|none|\\N)$/i.test(val.trim())
  }
  return false
}

export function runCleaningPipeline(sourceRows, targetFields, mappingRules, options = {}) {
  const {
    dedupField = null,
    dedupStrategy = 'keep_first', // keep_first | keep_last
    skipEmptyRows = true,
    requiredFields = [],
    convertNullToEmpty = true // 是否自动将 "null" / "NULL" 等数据库空值标识转为空字符串
  } = options

  const stats = {
    totalRawRows: sourceRows.length,
    processedRows: 0,
    validRows: 0,
    hasErrorRows: 0,
    dedupDroppedRows: 0,
    emptyDroppedRows: 0
  }

  if (!sourceRows || sourceRows.length === 0) {
    return { cleanedRows: [], stats, errorSummary: [] }
  }

  // 映射规则索引化 targetField -> rule
  const ruleMap = {}
  mappingRules.forEach(r => {
    ruleMap[r.targetField] = r
  })

  // 目标字段字典 name -> fieldDef
  const fieldDefMap = {}
  targetFields.forEach(f => {
    fieldDefMap[f.name] = f
  })

  const intermediateRows = []
  const seenDedupKeys = new Map() // key -> index in intermediateRows
  const errorsList = []

  // 1. 逐行执行字段级清洗转换
  sourceRows.forEach((rawRow, rowIndex) => {
    const cleanedRow = {
      _rowIndex: rowIndex + 1,
      _rawRowIndex: rawRow._rawRowIndex || (rowIndex + 1),
      _raw: rawRow,
      _errors: {},
      _hasError: false
    }

    let allFieldsEmpty = true

    targetFields.forEach(field => {
      const fieldName = field.name
      const rule = ruleMap[fieldName]

      let transformedVal = null

      if (!rule || rule.sourceType === 'ignore') {
        const def = field.defaultValue !== undefined ? field.defaultValue : ''
        transformedVal = (def && !isNullLiteral(def)) ? def : ''
      } else if (rule.sourceType === 'constant') {
        const cVal = rule.constantValue !== undefined ? rule.constantValue : field.defaultValue
        transformedVal = (convertNullToEmpty && isNullLiteral(cVal)) ? '' : cVal
      } else if (rule.sourceType === 'combine') {
        // 多字段拼接
        const parts = (rule.combineFields || []).map(srcCol => {
          const val = rawRow[srcCol]
          if (convertNullToEmpty && isNullLiteral(val)) return ''
          return val !== undefined && val !== null ? String(val).trim() : ''
        }).filter(Boolean)
        // 连接符兼容：用户未配置或留空时默认无缝拼接 ''，不强制插入空格
        const sep = rule.combineSeparator !== undefined ? rule.combineSeparator : ''
        transformedVal = parts.join(sep)
      } else if (rule.sourceType === 'json_path') {
        // 核心新特性：从多层嵌套 JSON 中提取单字段或多字段拼接
        const sourceJsonStr = rawRow[rule.sourceField]
        const parsedJson = safeParseJson(sourceJsonStr)

        if (!parsedJson) {
          transformedVal = ''
          if (sourceJsonStr && String(sourceJsonStr).trim() && !isNullLiteral(sourceJsonStr)) {
            cleanedRow._errors[fieldName] = `源字段 [${rule.sourceField}] 的内容不是合法的 JSON 格式`
            cleanedRow._hasError = true
          }
        } else if (rule.isCombine) {
          // 多路径拼接提取模式 (如 profile.city + " " + profile.street)
          if (rule.combinePaths && rule.combinePaths.length > 0) {
            const parts = rule.combinePaths.map(p => {
              const v = getNestedJsonValue(parsedJson, p)
              return (v !== null && v !== undefined) ? (typeof v === 'object' ? JSON.stringify(v) : String(v).trim()) : ''
            }).filter(Boolean)
            // JSON 多路径拼接连接符：兼容空字符串无缝拼接
            const jsonSep = rule.jsonSeparator !== undefined ? rule.jsonSeparator : ''
            transformedVal = parts.join(jsonSep)
          } else {
            transformedVal = ''
          }
        } else {
          // 单路径提取模式 (如 profile.address.city)
          if (rule.jsonPath) {
            const extracted = getNestedJsonValue(parsedJson, rule.jsonPath)
            transformedVal = (extracted !== null && extracted !== undefined)
              ? (typeof extracted === 'object' ? JSON.stringify(extracted) : extracted)
              : ''
          } else {
            transformedVal = ''
          }
        }

        // 提取后仍可串联执行标准清洗规则 (如 trim, 手机号规整, 日期标准化等)
        transformedVal = applyFieldCleanRules(transformedVal, rule.cleanRules || [], rawRow)
      } else if (rule.sourceType === 'custom_js' || rule.sourceType === 'expression') {
        // 核心新特性：支持用户自定义 JavaScript 复杂业务清洗脚本
        const code = rule.customJsCode || rule.expression || ''
        const rawVal = rawRow[rule.sourceField]
        const parsedJson = safeParseJson(rawVal)

        try {
          transformedVal = executeCustomJs(code, {
            row: rawRow,
            val: rawVal,
            json: parsedJson,
            index: rowIndex
          })
        } catch (e) {
          transformedVal = rawVal
          cleanedRow._errors[fieldName] = `JS 规则执行异常: ${e.message}`
          cleanedRow._hasError = true
        }

        // 脚本执行后同样可以叠加标准规则
        transformedVal = applyFieldCleanRules(transformedVal, rule.cleanRules || [], rawRow)
      } else {
        // 标准单字段映射
        let sourceVal = rawRow[rule.sourceField]
        if (convertNullToEmpty && isNullLiteral(sourceVal)) {
          sourceVal = ''
        }
        transformedVal = applyFieldCleanRules(sourceVal, rule.cleanRules || [], rawRow)
      }

      // 如果转换后的值依然是字面量 NULL，规范化为空字符串
      if (convertNullToEmpty && isNullLiteral(transformedVal)) {
        transformedVal = ''
      }

      // 默认值回退：仅当默认值存在且不是字面量 "null" 时回退
      if ((transformedVal === null || transformedVal === undefined || transformedVal === '') &&
          rule?.defaultValue !== undefined &&
          rule?.defaultValue !== '' &&
          !isNullLiteral(rule.defaultValue)) {
        transformedVal = rule.defaultValue
      }

      // 针对目标表定义为 datetime 或 timestamp 的字段进行秒数安全对齐
      // 保证即使未配置 standard_datetime 规则，也符合标准时间精度，避免丢失秒数
      if (field && (field.type === 'datetime' || field.type === 'timestamp')) {
        if (typeof transformedVal === 'string' && transformedVal !== '') {
          const trimmedVal = transformedVal.trim()
          if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{1,2}$/.test(trimmedVal)) {
            // 形如 2023-05-20 15:30 -> 2023-05-20 15:30:00
            transformedVal = `${trimmedVal}:00`
          } else if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(trimmedVal)) {
            // 纯日期转 datetime 补齐 00:00:00
            transformedVal = `${trimmedVal} 00:00:00`
          }
        }
      }

      // 类型规整与校验
      const validationError = validateFieldType(transformedVal, field)
      if (validationError) {
        cleanedRow._errors[fieldName] = validationError
        cleanedRow._hasError = true
      }

      if (transformedVal !== '' && transformedVal !== null && transformedVal !== undefined) {
        allFieldsEmpty = false
      }

      cleanedRow[fieldName] = transformedVal
    })

    // 空行过滤
    if (skipEmptyRows && allFieldsEmpty) {
      stats.emptyDroppedRows++
      return
    }

    // 必填项缺失检查
    if (requiredFields && requiredFields.length > 0) {
      for (const rf of requiredFields) {
        const val = cleanedRow[rf]
        if (val === null || val === undefined || val === '') {
          cleanedRow._errors[rf] = '必填项不能为空'
          cleanedRow._hasError = true
        }
      }
    }

    // 去重处理
    if (dedupField && cleanedRow[dedupField] !== undefined && cleanedRow[dedupField] !== '') {
      const dedupKey = String(cleanedRow[dedupField]).trim()
      if (seenDedupKeys.has(dedupKey)) {
        stats.dedupDroppedRows++
        if (dedupStrategy === 'keep_last') {
          // 替换掉之前的那一行
          const prevIdx = seenDedupKeys.get(dedupKey)
          intermediateRows[prevIdx] = cleanedRow
        }
        // 如果是 keep_first，则忽略当前行
        return
      } else {
        seenDedupKeys.set(dedupKey, intermediateRows.length)
        intermediateRows.push(cleanedRow)
      }
    } else {
      intermediateRows.push(cleanedRow)
    }
  })

  // 整理校验统计
  intermediateRows.forEach((row, idx) => {
    row._cleanIndex = idx + 1
    if (row._hasError) {
      stats.hasErrorRows++
      Object.keys(row._errors).forEach(f => {
        errorsList.push({
          row: row._cleanIndex,
          field: f,
          fieldLabel: fieldDefMap[f]?.label || f,
          message: row._errors[f],
          value: row[f]
        })
      })
    } else {
      stats.validRows++
    }
  })

  stats.processedRows = intermediateRows.length

  return {
    cleanedRows: intermediateRows,
    stats,
    errorSummary: errorsList
  }
}

/**
 * 安全解析 JSON 字符串
 */
export function safeParseJson(str) {
  if (typeof str === 'object' && str !== null) {
    return str
  }
  if (!str || typeof str !== 'string') {
    return null
  }
  const trimmed = str.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null
  }
  try {
    return JSON.parse(trimmed)
  } catch (e) {
    return null
  }
}

/**
 * 根据路径从嵌套 JSON 对象中读取值 (支持 a.b.c 或 a[0].b 形式)
 */
export function getNestedJsonValue(obj, path) {
  if (!obj || !path) return undefined
  try {
    // 统一将 [0] 转换为 .0
    const normalizedPath = String(path).replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '')
    const keys = normalizedPath.split('.')

    let current = obj
    for (const key of keys) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined // 安全防护：杜绝原型链污染
      }
      if (current === null || current === undefined) {
        return undefined
      }
      current = current[key]
    }
    return current
  } catch (e) {
    return undefined
  }
}

/**
 * 递归自动探测 JSON 结构的所有可用路径，用于供用户在界面上可视化一键点击选择！
 * @param {string|object} jsonInput 
 * @returns {Array<{ path: string, type: string, sample: any, depth: number }>}
 */
export function discoverJsonPaths(jsonInput) {
  const parsed = safeParseJson(jsonInput)
  if (!parsed) return []

  const paths = []

  function traverse(node, currentPath = '', depth = 1) {
    if (depth > 6) return // 防超深死循环

    if (node === null || node === undefined) {
      if (currentPath) {
        paths.push({ path: currentPath, type: 'null', sample: 'null', depth })
      }
      return
    }

    if (Array.isArray(node)) {
      if (currentPath) {
        paths.push({
          path: currentPath,
          type: 'array',
          sample: `[${node.length}项]`,
          depth
        })
      }
      // 探测前 2 项元素
      for (let i = 0; i < Math.min(node.length, 2); i++) {
        const itemPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`
        traverse(node[i], itemPath, depth + 1)
      }
      return
    }

    if (typeof node === 'object') {
      const keys = Object.keys(node)
      if (currentPath && keys.length === 0) {
        paths.push({ path: currentPath, type: 'object', sample: '{}', depth })
        return
      }

      keys.forEach(k => {
        const nextPath = currentPath ? `${currentPath}.${k}` : k
        const val = node[k]
        if (typeof val === 'object' && val !== null) {
          // 容器节点
          paths.push({
            path: nextPath,
            type: Array.isArray(val) ? 'array' : 'object',
            sample: Array.isArray(val) ? `[${val.length}项]` : '{...}',
            depth
          })
          traverse(val, nextPath, depth + 1)
        } else {
          // 叶子节点
          paths.push({
            path: nextPath,
            type: typeof val,
            sample: val !== undefined ? String(val) : '',
            depth
          })
        }
      })
      return
    }

    // 基础类型
    if (currentPath) {
      paths.push({
        path: currentPath,
        type: typeof node,
        sample: String(node),
        depth
      })
    }
  }

  traverse(parsed, '')
  return paths
}

/**
 * 执行自定义 JavaScript 清洗代码
 * 上下文提供: row (整行对象), val (字段原始值), json (若为JSON则自动解析好的对象), index (当前行号)
 */
export function executeCustomJs(code, context = {}) {
  const { row = {}, val = '', json = null, index = 0 } = context

  if (!code || !code.trim()) {
    return val
  }

  const cleanCode = code.trim()

  // 支持单行表达式或包含 return 的完整函数体
  let fnBody = ''
  if (cleanCode.includes('return ')) {
    fnBody = cleanCode
  } else {
    fnBody = `return (${cleanCode});`
  }

  // 构造沙箱执行函数
  const fn = new Function('row', 'val', 'json', 'index', fnBody)
  return fn(row, val, json, index)
}

/**
 * 针对单个字段值执行清洗规则链
 */
export function applyFieldCleanRules(val, cleanRules = [], fullRow = {}) {
  // 前置规整：如果输入值本身是数据库导出的 NULL 标识符，归一化为空字符串 ''
  let result = isNullLiteral(val) ? '' : val

  for (const rule of cleanRules) {
    if (rule.enabled === false) continue

    switch (rule.type) {
      case 'trim':
        if (typeof result === 'string') {
          result = result.trim()
        }
        break

      case 'clean_whitespace':
        // 将连串空格、制表符、全角空格换成单空格
        if (typeof result === 'string') {
          result = result.replace(/[\s\u3000\u00A0]+/g, ' ').trim()
        }
        break

      case 'remove_all_spaces':
        if (typeof result === 'string') {
          result = result.replace(/\s+/g, '')
        }
        break

      case 'uppercase':
        if (typeof result === 'string') {
          result = result.toUpperCase()
        }
        break

      case 'lowercase':
        if (typeof result === 'string') {
          result = result.toLowerCase()
        }
        break

      case 'clean_phone':
        // 手机号清洗：剥离+86、空格、破折号、括号
        if (result !== null && result !== undefined && result !== '') {
          let str = String(result).replace(/[\s\-_()+]/g, '')
          if (str.startsWith('86') && str.length === 13) {
            str = str.substring(2)
          }
          result = str
        }
        break

      case 'mask_phone':
        if (typeof result === 'string' && result.length >= 7) {
          result = result.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
        }
        break

      case 'mask_idcard':
        if (typeof result === 'string' && result.length >= 15) {
          result = result.replace(/^(\d{6})\d+(\w{4})$/, '$1********$2')
        }
        break

      case 'extract_number':
        // 提取数值，去除货币符号￥$、逗号等
        if (result !== null && result !== undefined && result !== '') {
          const str = String(result).replace(/,/g, '').replace(/[￥$¥元件套箱]/g, '').trim()
          const match = str.match(/-?\d+(\.\d+)?/)
          if (match) {
            const num = parseFloat(match[0])
            if (rule.decimals !== undefined && rule.decimals !== null && rule.decimals !== '') {
              result = Number(num.toFixed(Number(rule.decimals)))
            } else {
              result = num
            }
          } else {
            result = 0
          }
        }
        break

      case 'to_int':
        if (result !== null && result !== undefined && result !== '') {
          const str = String(result).replace(/,/g, '').replace(/[￥$¥元]/g, '').trim()
          const n = parseInt(str, 10)
          result = isNaN(n) ? (rule.fallbackValue !== undefined ? rule.fallbackValue : 0) : n
        }
        break

      case 'to_float':
        if (result !== null && result !== undefined && result !== '') {
          const str = String(result).replace(/,/g, '').replace(/[￥$¥元]/g, '').trim()
          const n = parseFloat(str)
          if (isNaN(n)) {
            result = rule.fallbackValue !== undefined ? rule.fallbackValue : 0
          } else if (rule.decimals !== undefined && rule.decimals !== '') {
            result = Number(n.toFixed(Number(rule.decimals)))
          } else {
            result = n
          }
        }
        break

      case 'dict_mapping':
        // 字典/枚举映射
        if (rule.mapping && typeof rule.mapping === 'object') {
          const key = result !== null && result !== undefined ? String(result).trim() : ''
          // 如果为空值且字典中未显式配置空值映射，保持为空，避免错误回退到非空默认枚举
          if (key === '' && rule.mapping[''] === undefined) {
            break
          }
          if (rule.mapping[key] !== undefined) {
            result = rule.mapping[key]
          } else {
            // 尝试不区分大小写
            const foundKey = Object.keys(rule.mapping).find(k => k.toLowerCase() === key.toLowerCase())
            if (foundKey) {
              result = rule.mapping[foundKey]
            } else if (rule.fallbackValue !== undefined && rule.fallbackValue !== '') {
              result = rule.fallbackValue
            }
          }
        }
        break

      case 'standard_datetime':
        // 规整日期时间
        result = normalizeDateTime(result, rule.outputFormat || 'YYYY-MM-DD HH:mm:ss')
        break

      case 'regex_replace':
        if (typeof result === 'string' && rule.pattern) {
          try {
            const re = new RegExp(rule.pattern, rule.flags || 'g')
            result = result.replace(re, rule.replacement || '')
          } catch (e) {
            // ignore regex pattern error
          }
        }
        break

      case 'prefix_suffix':
        if (result !== null && result !== undefined && result !== '') {
          const prefix = rule.prefix || ''
          const suffix = rule.suffix || ''
          result = `${prefix}${result}${suffix}`
        }
        break

      case 'custom_js':
        if (rule.customCode) {
          try {
            result = executeCustomJs(rule.customCode, { val: result, row: fullRow })
          } catch (e) {
            // ignore
          }
        }
        break

      default:
        break
    }
  }

  return result
}

/**
 * 智能日期时间清洗
 * 支持 Excel 序列数、常见中文日期、斜杠日期、点号日期、ISO 日期
 */
export function normalizeDateTime(val, targetFormat = 'YYYY-MM-DD HH:mm:ss') {
  if (val === null || val === undefined || val === '' || isNullLiteral(val)) {
    return ''
  }

  let dateObj = null

  // 1. 如果已经是 Date 对象
  if (val instanceof Date) {
    dateObj = val
  }
  // 2. 如果是 Excel 的数字天数 (如 44927)
  else if (typeof val === 'number' && val > 10000 && val < 60000) {
    const utc_days = Math.floor(val - 25569)
    const utc_value = utc_days * 86400
    const date_info = new Date(utc_value * 1000)
    const fractional_day = val - Math.floor(val) + 0.0000001
    let total_seconds = Math.floor(86400 * fractional_day)
    const seconds = total_seconds % 60
    total_seconds -= seconds
    const hours = Math.floor(total_seconds / (60 * 60))
    const minutes = Math.floor(total_seconds / 60) % 60
    dateObj = new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds)
  }
  // 3. 常见字符串解析
  else if (typeof val === 'string' || typeof val === 'number') {
    let s = String(val).trim()
    // 替换中文年月日
    s = s.replace(/年|月/g, '-').replace(/日/g, '')
    // 替换点号和斜杠 2021.05.01 -> 2021-05-01
    s = s.replace(/[\.\/]/g, '-')
    // 纯8位数字 20210501 -> 2021-05-01
    if (/^\d{8}$/.test(s)) {
      s = `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`
    }

    // 处理纯日期格式 YYYY-MM-DD，显式使用本地时间构造，避免 new Date('YYYY-MM-DD') 默认以 UTC 解析导致东八区偏移成 08:00:00
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
      const parts = s.split('-').map(Number)
      dateObj = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0)
    } else {
      const parsed = new Date(s)
      if (!isNaN(parsed.getTime())) {
        dateObj = parsed
      }
    }
  }

  if (!dateObj || isNaN(dateObj.getTime())) {
    return String(val)
  }

  return formatDate(dateObj, targetFormat)
}

function formatDate(d, fmt) {
  const pad = n => String(n).padStart(2, '0')
  const YYYY = d.getFullYear()
  const MM = pad(d.getMonth() + 1)
  const DD = pad(d.getDate())
  const HH = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const ss = pad(d.getSeconds())

  if (fmt === 'YYYY-MM-DD') {
    return `${YYYY}-${MM}-${DD}`
  }
  if (fmt === 'YYYY/MM/DD') {
    return `${YYYY}/${MM}/${DD}`
  }
  if (fmt === 'YYYYMMDD') {
    return `${YYYY}${MM}${DD}`
  }
  if (fmt === 'Timestamp (s)') {
    return Math.floor(d.getTime() / 1000)
  }
  if (fmt === 'Timestamp (ms)') {
    return d.getTime()
  }
  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`
}

/**
 * 校验字段数据类型与必填约束
 */
export function validateFieldType(val, field) {
  const isNullOrEmpty = val === null || val === undefined || val === '' || isNullLiteral(val)

  if (!field.nullable && isNullOrEmpty) {
    return '此字段不可为空 (NOT NULL)'
  }

  if (isNullOrEmpty) {
    return null
  }

  const type = (field.type || 'varchar').toLowerCase()

  if (type === 'int' || type === 'integer' || type === 'bigint' || type === 'smallint' || type === 'tinyint') {
    const n = Number(val)
    if (isNaN(n) || !Number.isInteger(n)) {
      return `期望整数数值，当前值为 "${val}"`
    }
  } else if (type === 'decimal' || type === 'float' || type === 'double' || type === 'numeric') {
    const n = Number(val)
    if (isNaN(n)) {
      return `期望浮点数值，当前值为 "${val}"`
    }
  } else if (type === 'date' || type === 'datetime' || type === 'timestamp') {
    if (typeof val === 'string' && val.length > 0) {
      const d = new Date(val.replace(/[\.\/]/g, '-'))
      if (isNaN(d.getTime())) {
        return `无效的日期时间格式: "${val}"`
      }
    }
  } else if (type === 'boolean' || type === 'bool') {
    if (![true, false, 0, 1, '0', '1', 'true', 'false'].includes(val)) {
      return `期望布尔值，当前值为 "${val}"`
    }
  }

  // 长度校验
  if (field.length && typeof val === 'string' && typeof field.length === 'number') {
    if (val.length > field.length) {
      return `文本长度超过限制 (最大 ${field.length} 字符，当前 ${val.length})`
    }
  }

  return null
}

/**
 * 智能自动匹配源字段到目标字段
 */
export function autoMatchFields(sourceHeaders, targetFields) {
  const mappings = []

  targetFields.forEach(target => {
    const targetNameLower = target.name.toLowerCase().replace(/[_ \-]/g, '')
    const targetLabelLower = (target.label || '').toLowerCase().replace(/[_ \-()（）]/g, '')

    let matchedSource = null
    let matchScore = 0

    for (const src of sourceHeaders) {
      const srcClean = src.trim()
      const srcLower = srcClean.toLowerCase().replace(/[_ \-()（）]/g, '')

      // 1. 完全相同
      if (srcClean === target.name || srcClean === target.label) {
        matchedSource = srcClean
        matchScore = 100
        break
      }

      // 2. 忽略大小写及下划线完全匹配
      if (srcLower === targetNameLower || (targetLabelLower && srcLower === targetLabelLower)) {
        if (matchScore < 90) {
          matchedSource = srcClean
          matchScore = 90
        }
      }

      // 3. 包含关系匹配
      if (targetLabelLower && (srcLower.includes(targetLabelLower) || targetLabelLower.includes(srcLower))) {
        if (matchScore < 70) {
          matchedSource = srcClean
          matchScore = 70
        }
      }

      // 4. 常见同义词推断
      if (isSynonym(srcLower, targetNameLower) || isSynonym(srcLower, targetLabelLower)) {
        if (matchScore < 80) {
          matchedSource = srcClean
          matchScore = 80
        }
      }
    }

    const cleanRules = getDefaultCleanRulesForType(target.type)
    const targetDef = target.defaultValue || ''
    const cleanDef = isNullLiteral(targetDef) ? '' : targetDef

    if (matchedSource) {
      mappings.push({
        targetField: target.name,
        sourceField: matchedSource,
        sourceType: 'field',
        cleanRules,
        defaultValue: cleanDef,
        matched: true
      })
    } else {
      mappings.push({
        targetField: target.name,
        sourceField: '',
        sourceType: 'ignore',
        cleanRules,
        defaultValue: cleanDef,
        matched: false
      })
    }
  })

  return mappings
}

function isSynonym(a, b) {
  const synonymGroups = [
    ['mobile', 'phone', 'tel', 'cellphone', 'shouji', 'dianhua', '手机', '电话', '联系电话', '手机号', '联系方式'],
    ['name', 'username', 'fullname', 'realname', 'xingming', 'yonghuming', '姓名', '客户姓名', '用户名称', '名字', '用户名'],
    ['email', 'mail', 'youxiang', '邮箱', '电子邮箱', 'email地址'],
    ['gender', 'sex', 'xingbie', '性别'],
    ['code', 'id', 'usercode', 'bianhao', '编号', '用户编码', '客户编号', '主键', '流水号'],
    ['amount', 'money', 'balance', 'price', 'jine', 'yue', '金额', '余额', '账户余额', '售价', '单价'],
    ['status', 'state', 'zhuangtai', '状态', '启用状态', '审核状态'],
    ['time', 'date', 'createdat', 'shijian', 'riqi', '时间', '日期', '注册时间', '创建时间'],
    ['city', 'address', 'chengshi', 'dizhi', '城市', '所属城市', '省份', '地址'],
    ['channel', 'source', 'qudao', '渠道', '来源渠道', '注册渠道']
  ]

  return synonymGroups.some(group => group.includes(a) && group.includes(b))
}

function getDefaultCleanRulesForType(type = 'varchar') {
  const t = type.toLowerCase()
  if (t === 'varchar' || t === 'text' || t === 'char') {
    return [
      { type: 'trim', enabled: true },
      { type: 'clean_whitespace', enabled: true }
    ]
  }
  if (t === 'int' || t === 'bigint') {
    return [
      { type: 'to_int', enabled: true, fallbackValue: 0 }
    ]
  }
  if (t === 'decimal' || t === 'float' || t === 'double') {
    return [
      { type: 'extract_number', enabled: true, decimals: 2 }
    ]
  }
  if (t === 'datetime' || t === 'timestamp') {
    return [
      { type: 'standard_datetime', enabled: true, outputFormat: 'YYYY-MM-DD HH:mm:ss' }
    ]
  }
  if (t === 'date') {
    return [
      { type: 'standard_datetime', enabled: true, outputFormat: 'YYYY-MM-DD' }
    ]
  }
  return [{ type: 'trim', enabled: true }]
}

/**
 * 实时计算单个字段针对前 N 行样本数据的清洗前后预览与校验状态
 * @param {object} field 目标字段定义
 * @param {object} rule 当前映射规则
 * @param {Array<object>} sampleRows 样本数据行
 * @param {number} limit 最大行数 (默认 5)
 * @returns {Array<{ rowIndex: number, rawVal: any, cleanedVal: any, error: string|null }>}
 */
export function computeFieldSampleTransform(field, rule, sampleRows = [], limit = 5) {
  if (!rule || !sampleRows || sampleRows.length === 0) return []

  const rows = sampleRows.slice(0, limit)
  return rows.map((rawRow, idx) => {
    let rawVal = ''
    let intermediateVal = null
    let error = null

    if (rule.sourceType === 'ignore') {
      rawVal = ''
      const def = (field && field.defaultValue !== undefined) ? field.defaultValue : ''
      intermediateVal = (def && !isNullLiteral(def)) ? def : ''
    } else if (rule.sourceType === 'constant') {
      rawVal = rule.constantValue !== undefined ? rule.constantValue : ''
      intermediateVal = isNullLiteral(rawVal) ? '' : rawVal
    } else if (rule.sourceType === 'combine') {
      const parts = (rule.combineFields || []).map(f => {
        const v = rawRow[f]
        if (isNullLiteral(v)) return ''
        return v !== undefined && v !== null ? String(v).trim() : ''
      }).filter(Boolean)
      const sep = rule.combineSeparator !== undefined ? rule.combineSeparator : ''
      rawVal = parts.join(sep)
      intermediateVal = rawVal
    } else if (rule.sourceType === 'json_path') {
      rawVal = rule.sourceField ? rawRow[rule.sourceField] : ''
      const parsedJson = safeParseJson(rawVal)
      if (!parsedJson) {
        intermediateVal = ''
        if (rawVal && String(rawVal).trim() && !isNullLiteral(rawVal)) {
          error = '非合法 JSON 格式'
        }
      } else if (rule.isCombine) {
        // 多路径拼接提取模式
        if (rule.combinePaths && rule.combinePaths.length > 0) {
          const parts = rule.combinePaths.map(p => {
            const v = getNestedJsonValue(parsedJson, p)
            return (v !== null && v !== undefined) ? (typeof v === 'object' ? JSON.stringify(v) : String(v).trim()) : ''
          }).filter(Boolean)
          const jsonSep = rule.jsonSeparator !== undefined ? rule.jsonSeparator : ''
          intermediateVal = parts.join(jsonSep)
        } else {
          intermediateVal = ''
        }
      } else {
        // 单路径提取模式
        if (rule.jsonPath) {
          const extracted = getNestedJsonValue(parsedJson, rule.jsonPath)
          intermediateVal = extracted !== null && extracted !== undefined
            ? (typeof extracted === 'object' ? JSON.stringify(extracted) : extracted)
            : ''
        } else {
          intermediateVal = ''
        }
      }
      intermediateVal = applyFieldCleanRules(intermediateVal, rule.cleanRules || [], rawRow)
    } else if (rule.sourceType === 'custom_js') {
      rawVal = rule.sourceField ? rawRow[rule.sourceField] : ''
      const parsedJson = safeParseJson(rawVal)
      try {
        intermediateVal = executeCustomJs(rule.customJsCode || '', {
          row: rawRow,
          val: rawVal,
          json: parsedJson,
          index: idx
        })
      } catch (e) {
        intermediateVal = rawVal
        error = e.message
      }
      intermediateVal = applyFieldCleanRules(intermediateVal, rule.cleanRules || [], rawRow)
    } else {
      // 默认单字段映射 'field'
      rawVal = rule.sourceField ? rawRow[rule.sourceField] : ''
      const src = isNullLiteral(rawVal) ? '' : rawVal
      intermediateVal = applyFieldCleanRules(src, rule.cleanRules || [], rawRow)
    }

    if (isNullLiteral(intermediateVal)) {
      intermediateVal = ''
    }

    // 默认值回退
    if ((intermediateVal === null || intermediateVal === undefined || intermediateVal === '') &&
        rule.defaultValue !== undefined &&
        rule.defaultValue !== '' &&
        !isNullLiteral(rule.defaultValue)) {
      intermediateVal = rule.defaultValue
    }

    if (field) {
      const validationErr = validateFieldType(intermediateVal, field)
      if (validationErr && !error) {
        error = validationErr
      }
    }

    return {
      rowIndex: rawRow._rawRowIndex || (idx + 1),
      rawVal: rawVal !== undefined && rawVal !== null && !isNullLiteral(rawVal) ? rawVal : '',
      cleanedVal: intermediateVal !== undefined && intermediateVal !== null && !isNullLiteral(intermediateVal) ? intermediateVal : '',
      error
    }
  })
}

