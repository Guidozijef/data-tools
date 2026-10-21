/**
 * SQL DDL 解析器：将用户的 `CREATE TABLE ...` 语句解析为目标字段定义
 */

export function parseSqlDdl(sqlText) {
  if (!sqlText || typeof sqlText !== 'string') {
    throw new Error('请输入有效的 SQL 建表语句')
  }

  // 1. 提取表名
  const tableMatch = sqlText.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:[`"']?([a-zA-Z0-9_]+)[`"']?\.)?[`"']?([a-zA-Z0-9_]+)[`"']?\s*\(/i)
  const tableName = tableMatch ? (tableMatch[2] || tableMatch[1] || 'target_table') : 'target_table'

  // 2. 提取括号内的主体定义
  const firstParen = sqlText.indexOf('(')
  const lastParen = sqlText.lastIndexOf(')')
  if (firstParen === -1 || lastParen === -1 || lastParen <= firstParen) {
    throw new Error('未能在 SQL 中定位到字段定义括号 "(...)"')
  }

  const body = sqlText.substring(firstParen + 1, lastParen)

  // 3. 提取表注释
  let tableComment = ''
  const tableCommentMatch = sqlText.substring(lastParen).match(/comment\s*=\s*['"]([^'"]+)['"]/i)
  if (tableCommentMatch) {
    tableComment = tableCommentMatch[1]
  }

  // 4. 拆分字段行（需注意逗号在括号内不拆分，如 decimal(10,2)）
  const lines = splitSqlLines(body)
  const fields = []
  const primaryKeys = new Set()

  lines.forEach(rawLine => {
    const line = rawLine.trim()
    if (!line) return

    // 检查表级主键定义: PRIMARY KEY (`id`)
    const pkMatch = line.match(/^primary\s+key\s*\(([^)]+)\)/i)
    if (pkMatch) {
      const pks = pkMatch[1].split(',').map(s => s.replace(/[`"' ]/g, ''))
      pks.forEach(k => primaryKeys.add(k))
      return
    }

    // 忽略 KEY, INDEX, CONSTRAINT, UNIQUE KEY 行
    if (/^(key|index|unique\s+key|constraint|foreign\s+key)\b/i.test(line)) {
      return
    }

    // 提取字段定义: `col_name` TYPE(LEN) [NOT NULL] [DEFAULT ...] [COMMENT '...']
    const colMatch = line.match(/^[`"']?([a-zA-Z0-9_]+)[`"']?\s+([a-zA-Z0-9_]+)(?:\s*\(([^)]+)\))?(.*)$/i)
    if (colMatch) {
      const colName = colMatch[1]
      const rawType = colMatch[2].toLowerCase()
      const typeLen = colMatch[3] ? colMatch[3].trim() : null
      const rest = colMatch[4] || ''

      const isPrimary = rest.toLowerCase().includes('primary key') || primaryKeys.has(colName)
      const nullable = !rest.toLowerCase().includes('not null')

      // 提取注释 COMMENT 'xxx'
      let comment = ''
      const commentMatch = rest.match(/comment\s+['"]([^'"]+)['"]/i)
      if (commentMatch) {
        comment = commentMatch[1]
      }

      // 提取默认值 DEFAULT 'xxx' or DEFAULT 0
      // 注意：在 SQL DDL 规范中，DEFAULT NULL 表示字段可为 NULL 且无业务默认值，
      // 前端字段定义与清洗映射中应置为空字符串 ''，避免清洗时空单元格被自动填充为字面量 "NULL"。
      let defaultValue = ''
      const defaultMatch = rest.match(/default\s+([^,\s]+)/i)
      if (defaultMatch) {
        const rawDefault = defaultMatch[1].trim().replace(/['"]/g, '')
        if (rawDefault.toLowerCase() !== 'null') {
          defaultValue = rawDefault
        }
      }

      const standardType = normalizeSqlType(rawType)

      fields.push({
        name: colName,
        label: comment || colName,
        type: standardType,
        length: typeLen ? (typeLen.includes(',') ? typeLen : (parseInt(typeLen, 10) || null)) : null,
        nullable,
        isPrimary,
        defaultValue,
        comment
      })
    }
  })

  // 同步在表底部声明的主键
  fields.forEach(f => {
    if (primaryKeys.has(f.name)) {
      f.isPrimary = true
    }
  })

  if (fields.length === 0) {
    throw new Error('未能从 SQL 中解析出任何有效字段，请检查语法格式')
  }

  return {
    tableName,
    tableComment,
    fields
  }
}

function splitSqlLines(bodyText) {
  const result = []
  let current = ''
  let inParen = 0
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < bodyText.length; i++) {
    const char = bodyText[i]

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
    } else if (char === '(' && !inSingleQuote && !inDoubleQuote) {
      inParen++
    } else if (char === ')' && !inSingleQuote && !inDoubleQuote) {
      inParen--
    }

    if (char === ',' && inParen === 0 && !inSingleQuote && !inDoubleQuote) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim()) {
    result.push(current)
  }

  return result
}

function normalizeSqlType(type) {
  const t = type.toLowerCase()
  if (['int', 'integer', 'tinyint', 'smallint', 'mediumint', 'bigint'].includes(t)) {
    return 'int'
  }
  if (['decimal', 'numeric', 'float', 'double', 'real'].includes(t)) {
    return 'decimal'
  }
  if (['datetime', 'timestamp'].includes(t)) {
    return 'datetime'
  }
  if (['date', 'year'].includes(t)) {
    return 'date'
  }
  if (['bool', 'boolean'].includes(t)) {
    return 'boolean'
  }
  if (['json', 'jsonb'].includes(t)) {
    return 'json'
  }
  return 'varchar'
}
