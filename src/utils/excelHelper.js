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
 */
export function parseSheetData(workbook, sheetName, options = {}) {
  const { headerRowIndex = 0, skipEmptyRows = true } = options
  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) {
    return { headers: [], rows: [], rawMatrix: [] }
  }

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
    const isAllEmpty = rowCells.every(v => v === '' || v === undefined || v === null)
    if (skipEmptyRows && isAllEmpty) continue

    const rowObj = { _rawRowIndex: r + 1 }
    headers.forEach((h, colIdx) => {
      rowObj[h] = rowCells[colIdx] !== undefined ? rowCells[colIdx] : ''
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
      row[label] = val === null || val === undefined ? '' : val
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
 */
export function exportToCsv(data, fileName = 'cleaned_data.csv', columnKeys = null, headerLabels = {}) {
  if (!data || data.length === 0) {
    throw new Error('没有可导出的数据')
  }

  const keys = columnKeys || Object.keys(data[0]).filter(k => !k.startsWith('_'))
  const headers = keys.map(k => headerLabels[k] || k)

  const csvRows = [headers.map(escapeCsvValue).join(',')]

  data.forEach(item => {
    const rowValues = keys.map(k => {
      let val = item[k]
      if (typeof val === 'object' && val !== null) {
        val = JSON.stringify(val)
      }
      return escapeCsvValue(val === null || val === undefined ? '' : String(val))
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
      res[k] = item[k]
    })
    return res
  })

  const jsonStr = JSON.stringify(cleanData, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' })
  downloadBlob(blob, fileName.endsWith('.json') ? fileName : `${fileName}.json`)
}

function escapeCsvValue(val) {
  if (val === null || val === undefined) return '""'
  const str = String(val)
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
