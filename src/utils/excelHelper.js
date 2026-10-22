import * as XLSX from 'xlsx'

/**
 * 读取用户上传的 Excel / CSV 文件
 * @param {File} file 
 * @returns {Promise<{ workbook: any, sheetNames: string[], defaultSheet: string }>}
 */
export async function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = e.target.result
        const workbook = XLSX.read(buffer, {
          type: 'array',
          cellDates: true,
          dateNF: 'yyyy-mm-dd hh:mm:ss'
        })
        const sheetNames = workbook.SheetNames || []
        if (sheetNames.length === 0) {
          throw new Error('未在文件中发现有效的工作表(Sheet)')
        }
        resolve({
          workbook,
          sheetNames,
          defaultSheet: sheetNames[0]
        })
      } catch (err) {
        reject(new Error('解析 Excel 文件失败: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('读取文件遇到错误'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * 根据指定 Sheet 及配置解析为表格数据与表头
 * @param {any} workbook
 * @param {string} sheetName
 * @param {object} options
 * @param {number} [options.headerRowIndex=0] 0-based 表头所在行号
 * @param {boolean} [options.skipEmptyRows=true] 是否跳过全空行
 * @returns {{ headers: string[], rows: Record<string, any>[], rawMatrix: any[][] }}
/**
 * 判断值是否属于空值或等价于数据库的 NULL 标识符
 * 支持 null、undefined、空字符串以及常见的数据库导出文本 "NULL"、"null"、"\\N"、"(null)"
 * @param {any} val 待检测的值
 * @param {boolean} [treatNullTextAsEmpty=true] 是否将字面量 "null" 视为空
 * @returns {boolean} 是否视为空值
 */
export function isNullOrEmptyValue(val, treatNullTextAsEmpty = true) {
  if (val === '' || val === undefined || val === null) {
    return true
  }
  if (treatNullTextAsEmpty && typeof val === 'string') {
    const trimmed = val.trim()
    return /^(null|\(null\)|nil|none|\\N)$/i.test(trimmed)
  }
  return false
}

/**
 * 将 Date 对象格式化为精确到秒的标准本地时间字符串 (YYYY-MM-DD HH:mm:ss)
 * 严格保留底层完整时分秒，消除时区偏移与秒数丢失
 * @param {Date} d 待格式化的 Date 对象
 * @returns {string} 格式化后的时间字符串
 */
export function formatFullDateTime(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  const YYYY = d.getFullYear()
  const MM = pad(d.getMonth() + 1)
  const DD = pad(d.getDate())
  const HH = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`
}

/**
 * 将 Excel 内部日期时间序列数字转为本地 Date 对象
 * @param {number} val Excel 浮点日期序列值 (如 45066.646354)
 * @returns {Date|null} 解析后的 Date 对象
 */
export function excelSerialToDate(val) {
  if (typeof val !== 'number') return null
  try {
    if (XLSX.SSF && typeof XLSX.SSF.parse_date_code === 'function') {
      const parsed = XLSX.SSF.parse_date_code(val)
      if (parsed && parsed.y) {
        return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0)
      }
    }
    // 回退数学公式解析
    const utc_days = Math.floor(val - 25569)
    const utc_value = utc_days * 86400
    const date_info = new Date(utc_value * 1000)
    const fractional_day = val - Math.floor(val) + 0.0000001
    let total_seconds = Math.floor(86400 * fractional_day)
    const seconds = total_seconds % 60
    total_seconds -= seconds
    const hours = Math.floor(total_seconds / (60 * 60))
    const minutes = Math.floor(total_seconds / 60) % 60
    return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds)
  } catch (e) {
    return null
  }
}

/**
 * 根据指定 Sheet 及配置解析为表格数据与表头
 * @param {any} workbook
 * @param {string} sheetName
 * @param {object} options
 * @param {number} [options.headerRowIndex=0] 0-based 表头所在行号
 * @param {boolean} [options.skipEmptyRows=true] 是否跳过全空行
 * @param {boolean} [options.convertNullToEmpty=true] 是否自动将数据库 NULL 文本转换为空
 * @returns {{ headers: string[], rows: Record<string, any>[], rawMatrix: any[][] }}
 */
export function parseSheetData(workbook, sheetName, options = {}) {
  const { headerRowIndex = 0, skipEmptyRows = true, convertNullToEmpty = true } = options
  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) {
    return { headers: [], rows: [], rawMatrix: [] }
  }

  // 关键修复：遍历 SheetJS 单元格，对所有日期类型进行就地标准化格式化
  // 无论是 Date 对象 (cell.t === 'd') 还是 Excel 数值序列时间 (cell.t === 'n' 且带时间格式)
  // 均强转为标准的 YYYY-MM-DD HH:mm:ss 完整时间格式，彻底消除源头因 Excel 格式不显秒而导致的秒数丢失
  Object.keys(worksheet).forEach(key => {
    if (key.startsWith('!')) return
    const cell = worksheet[key]
    if (!cell) return

    let d = null
    if (cell.t === 'd' || cell.v instanceof Date) {
      d = cell.v
    } else if (cell.t === 'n' && cell.z && XLSX.SSF && XLSX.SSF.is_date(cell.z)) {
      d = excelSerialToDate(cell.v)
    }

    if (d instanceof Date && !isNaN(d.getTime())) {
      const fullStr = formatFullDateTime(d)
      if (fullStr) {
        cell.w = fullStr
        cell.v = fullStr
        cell.t = 's'
      }
    }
  })

  // 转换为二维数组矩阵 (header: 1)
  const matrix = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd hh:mm:ss'
  })

  if (!matrix || matrix.length === 0) {
    return { headers: [], rows: [], rawMatrix: [] }
  }

  // 获取表头
  const rawHeaderRow = matrix[headerRowIndex] || []
  const headers = []
  const seenHeaderCounts = {}

  rawHeaderRow.forEach((cellVal, colIdx) => {
    let headerName = (cellVal !== undefined && cellVal !== null) ? String(cellVal).trim() : ''
    if (!headerName) {
      headerName = `列_${colIdx + 1}`
    }
    // 处理重名列
    if (seenHeaderCounts[headerName] !== undefined) {
      seenHeaderCounts[headerName]++
      headerName = `${headerName}_${seenHeaderCounts[headerName]}`
    } else {
      seenHeaderCounts[headerName] = 0
    }
    headers.push(headerName)
  })

  // 解析数据行 (表头行之后的数据)
  const rows = []
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const rowCells = matrix[r] || []
    const isAllEmpty = rowCells.every(v => isNullOrEmptyValue(v, convertNullToEmpty))
    if (skipEmptyRows && isAllEmpty) continue

    const rowObj = { _rawRowIndex: r + 1 }
    headers.forEach((h, colIdx) => {
      const cellVal = rowCells[colIdx]
      // 若开启 convertNullToEmpty 且单元格属于数据库 NULL 文本，直接置为空字符串 ''
      if (convertNullToEmpty && isNullOrEmptyValue(cellVal, true)) {
        rowObj[h] = ''
      } else {
        rowObj[h] = cellVal !== undefined ? cellVal : ''
      }
    })
    rows.push(rowObj)
  }

  return {
    headers,
    rows,
    rawMatrix: matrix
  }
}

/**
 * 纯前端导出数据为 Excel (.xlsx)
 * @param {Array<object>} data 清洗后的数据对象数组
 * @param {string} fileName 导出文件名
 * @param {string} sheetName 工作表名称
 * @param {Array<string>} [columnKeys] 指定导出的字段顺序及 key
 * @param {Record<string, string>} [headerLabels] key 到表头中文名称的映射
 */
export function exportToExcel(data, fileName = 'cleaned_data.xlsx', sheetName = 'Data', columnKeys = null, headerLabels = {}) {
  if (!data || data.length === 0) {
    throw new Error('没有可导出的数据')
  }

  // 处理导出的键名与顺序
  const keys = columnKeys || Object.keys(data[0]).filter(k => !k.startsWith('_'))
  
  // 组装格式化导出行
  const formattedRows = data.map(item => {
    const row = {}
    keys.forEach(k => {
      const label = headerLabels[k] || k
      let val = item[k]
      if (typeof val === 'object' && val !== null) {
        val = JSON.stringify(val)
      }
      // 规整空值与 NULL 标识，确保导出的 Excel 为干净的空单元格，不出现 "null" 字符串
      row[label] = isNullOrEmptyValue(val, true) ? '' : val
    })
    return row
  })

  const worksheet = XLSX.utils.json_to_sheet(formattedRows)

  // 自动设置列宽
  const colWidths = keys.map(k => {
    const label = headerLabels[k] || k
    let maxLen = label.length * 2
    for (let i = 0; i < Math.min(formattedRows.length, 50); i++) {
      const valStr = String(formattedRows[i][label] || '')
      maxLen = Math.max(maxLen, Math.min(valStr.length * 1.3, 40))
    }
    return { wch: Math.max(Math.ceil(maxLen) + 2, 12) }
  })
  worksheet['!cols'] = colWidths

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31))

  const cleanFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
  XLSX.writeFile(workbook, cleanFileName)
}

/**
 * 导出为带 UTF-8 BOM 的 CSV（完美解决 Windows Excel 打开中文乱码问题）
 * 支持自动补齐日期秒数、Excel 文本强显模式（防 Excel 吞秒和科学计数法）以及公式注入防御
 * @param {Array<object>} data 清洗后的数据对象数组
 * @param {string} fileName 导出文件名
 * @param {Array<string>} [columnKeys] 指定导出的字段顺序及 key
 * @param {Record<string, string>} [headerLabels] key 到表头名称的映射
 * @param {object} [options] 导出高级配置项
 * @param {boolean} [options.autoPadSeconds=true] 是否自动将缺少秒数的日期补齐秒 (YYYY-MM-DD HH:mm:ss)
 * @param {boolean} [options.excelCompatible=false] 是否开启 Excel 强显模式 (添加 \t 前缀防 Excel 吞秒和转科学计数法)
 */
export function exportToCsv(data, fileName = 'cleaned_data.csv', columnKeys = null, headerLabels = {}, options = {}) {
  const { autoPadSeconds = true, excelCompatible = false } = options
  if (!data || data.length === 0) {
    throw new Error('没有可导出的数据')
  }

  const keys = columnKeys || Object.keys(data[0]).filter(k => !k.startsWith('_'))
  const headers = keys.map(k => headerLabels[k] || k)

  const csvRows = [headers.map(escapeCsvValue).join(',')]

  data.forEach(item => {
    const rowValues = keys.map(k => {
      let val = item[k]
      if (isNullOrEmptyValue(val, true)) {
        return '""'
      }

      // 1. 如果是 Date 对象，格式化为精确到秒的标准字符串
      if (val instanceof Date) {
        val = formatFullDateTime(val)
      } else if (typeof val === 'object' && val !== null) {
        val = JSON.stringify(val)
      } else if (typeof val === 'string') {
        const trimmed = val.trim()
        // 2. 若开启自动补齐秒，且当前为缺少秒数的日期时间（如 2023-05-20 15:30 或 2023/05/20 15:30）
        if (autoPadSeconds && /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{1,2}$/.test(trimmed)) {
          val = `${trimmed}:00`
        }
      }

      let valStr = String(val)
      // 3. 若开启 Excel 强显模式，为包含秒数的日期串添加制表符前缀，防止 Windows Excel 双击打开时自动隐藏秒
      if (excelCompatible && /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{1,2}:\d{1,2}$/.test(valStr.trim())) {
        valStr = `\t${valStr.trim()}`
      }

      return escapeCsvValue(valStr)
    })
    csvRows.push(rowValues.join(','))
  })

  // 添加 UTF-8 BOM: \uFEFF
  const csvContent = '\uFEFF' + csvRows.join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, fileName.endsWith('.csv') ? fileName : `${fileName}.csv`)
}

/**
 * 导出为 JSON 文件
 */
export function exportToJson(data, fileName = 'cleaned_data.json', columnKeys = null) {
  if (!data || data.length === 0) {
    throw new Error('没有可导出的数据')
  }

  const keys = columnKeys || Object.keys(data[0]).filter(k => !k.startsWith('_'))
  const cleanData = data.map(item => {
    const res = {}
    keys.forEach(k => {
      res[k] = isNullOrEmptyValue(item[k], true) ? '' : item[k]
    })
    return res
  })

  const jsonStr = JSON.stringify(cleanData, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' })
  downloadBlob(blob, fileName.endsWith('.json') ? fileName : `${fileName}.json`)
}

/**
 * 转义 CSV 字段内容
 * 包含安全审计防御 (CWE-1236)：若以 =、+、-、@ 开头则进行安全防御，避免 Excel 公式注入
 * @param {any} val 待转义值
 * @returns {string} 符合 RFC 4180 的 CSV 字段
 */
function escapeCsvValue(val) {
  if (isNullOrEmptyValue(val, true)) return '""'
  let str = String(val)

  // CSV 公式注入防护：如果首字符为 =、+、-、@，且不是负数或标准连接符，前置单引号转义
  if (/^[=\+\-@]/.test(str) && !/^-?\d+(\.\d+)?$/.test(str)) {
    str = `'${str}`
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return `"${str}"`
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
