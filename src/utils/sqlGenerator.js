/**
 * SQL 生成器：将清洗后的数据转换为数据库直接可执行的 INSERT / UPSERT 脚本
 */

export function generateSqlScript(cleanedRows, targetSchema, options = {}) {
  const {
    dialect = 'mysql', // mysql | postgresql | sqlite | oracle
    insertMode = 'INSERT INTO', // INSERT INTO | INSERT IGNORE | REPLACE INTO | ON DUPLICATE KEY UPDATE
    batchSize = 200,
    includeDropTable = false,
    includeCreateTable = false
  } = options

  const tableName = targetSchema.tableName || 'target_table'
  const fields = targetSchema.fields || []
  const colNames = fields.map(f => f.name)

  const statements = []

  // 表名与字段包装符
  const wrapIdent = (name) => {
    if (dialect === 'mysql') return `\`${name}\``
    if (dialect === 'postgresql' || dialect === 'oracle') return `"${name}"`
    return `\`${name}\`` // sqlite
  }

  // 1. 生成建表 DDL (可选)
  if (includeDropTable) {
    statements.push(`DROP TABLE IF EXISTS ${wrapIdent(tableName)};`)
  }

  if (includeCreateTable) {
    const ddlLines = fields.map(f => {
      let line = `  ${wrapIdent(f.name)} ${getDialectType(f.type, f.length, dialect)}`
      if (!f.nullable) line += ' NOT NULL'
      // 仅当默认值存在且不是 NULL 关键字时才拼接 DEFAULT 语句
      if (f.defaultValue && String(f.defaultValue).trim().toLowerCase() !== 'null') {
        line += ` DEFAULT '${escapeSqlString(f.defaultValue)}'`
      }
      if (f.comment && dialect === 'mysql') line += ` COMMENT '${escapeSqlString(f.comment)}'`
      return line
    })

    const primaryKeys = fields.filter(f => f.isPrimary).map(f => wrapIdent(f.name))
    if (primaryKeys.length > 0) {
      ddlLines.push(`  PRIMARY KEY (${primaryKeys.join(', ')})`)
    }

    let ddl = `CREATE TABLE ${wrapIdent(tableName)} (\n${ddlLines.join(',\n')}\n)`
    if (dialect === 'mysql') {
      ddl += ` ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      if (targetSchema.tableComment) {
        ddl += ` COMMENT='${escapeSqlString(targetSchema.tableComment)}'`
      }
    }
    ddl += ';'
    statements.push(ddl)
  }

  if (!cleanedRows || cleanedRows.length === 0) {
    return statements.join('\n\n')
  }

  // 2. 生成分批 INSERT 语句
  const wrappedCols = colNames.map(wrapIdent).join(', ')

  for (let i = 0; i < cleanedRows.length; i += batchSize) {
    const chunk = cleanedRows.slice(i, i + batchSize)

    const valueRows = chunk.map(row => {
      const vals = fields.map(f => {
        const val = row[f.name]
        return formatSqlValue(val, f.type)
      })
      return `  (${vals.join(', ')})`
    })

    let prefix = 'INSERT INTO'
    if (dialect === 'mysql') {
      if (insertMode === 'INSERT IGNORE') prefix = 'INSERT IGNORE INTO'
      else if (insertMode === 'REPLACE INTO') prefix = 'REPLACE INTO'
      else prefix = 'INSERT INTO'
    }

    let sql = `${prefix} ${wrapIdent(tableName)} (${wrappedCols})\nVALUES\n${valueRows.join(',\n')}`

    // ON DUPLICATE KEY UPDATE (MySQL)
    if (dialect === 'mysql' && insertMode === 'ON DUPLICATE KEY UPDATE') {
      const nonPkFields = fields.filter(f => !f.isPrimary)
      if (nonPkFields.length > 0) {
        const updateClauses = nonPkFields.map(f => `${wrapIdent(f.name)} = VALUES(${wrapIdent(f.name)})`)
        sql += `\nON DUPLICATE KEY UPDATE\n  ${updateClauses.join(', ')}`
      }
    }
    // ON CONFLICT DO UPDATE (PostgreSQL / SQLite)
    else if ((dialect === 'postgresql' || dialect === 'sqlite') && insertMode === 'ON DUPLICATE KEY UPDATE') {
      const pks = fields.filter(f => f.isPrimary).map(f => wrapIdent(f.name))
      const nonPks = fields.filter(f => !f.isPrimary).map(f => `${wrapIdent(f.name)} = EXCLUDED.${wrapIdent(f.name)}`)
      if (pks.length > 0 && nonPks.length > 0) {
        sql += `\nON CONFLICT (${pks.join(', ')}) DO UPDATE SET\n  ${nonPks.join(', ')}`
      }
    }

    sql += ';'
    statements.push(sql)
  }

  return statements.join('\n\n')
}

function formatSqlValue(val, type = 'varchar') {
  // 空值或数据库 NULL 标识统一定义为 SQL 关键字 NULL (不带引号)
  if (val === null || val === undefined || val === '' ||
      (typeof val === 'string' && /^(null|\(null\)|nil|none|\\N)$/i.test(val.trim()))) {
    return 'NULL'
  }

  const t = type.toLowerCase()

  if (['int', 'integer', 'tinyint', 'smallint', 'bigint'].includes(t)) {
    const n = parseInt(val, 10)
    return isNaN(n) ? 'NULL' : String(n)
  }

  if (['decimal', 'numeric', 'float', 'double'].includes(t)) {
    const n = parseFloat(val)
    return isNaN(n) ? 'NULL' : String(n)
  }

  if (['boolean', 'bool'].includes(t)) {
    return (val === true || val === 1 || val === '1' || val === 'true') ? '1' : '0'
  }

  // 字符串与时间类型加单引号转义
  const escaped = escapeSqlString(String(val))
  return `'${escaped}'`
}

function escapeSqlString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

function getDialectType(type = 'varchar', length = null, dialect = 'mysql') {
  const t = type.toLowerCase()
  if (t === 'varchar') {
    return `VARCHAR(${length || 255})`
  }
  if (t === 'int') {
    return dialect === 'postgresql' ? 'INTEGER' : 'INT'
  }
  if (t === 'decimal') {
    return `DECIMAL(${length || '12,2'})`
  }
  if (t === 'datetime') {
    return dialect === 'postgresql' ? 'TIMESTAMP' : 'DATETIME'
  }
  if (t === 'date') {
    return 'DATE'
  }
  if (t === 'boolean') {
    return dialect === 'mysql' ? 'TINYINT(1)' : 'BOOLEAN'
  }
  if (t === 'json') {
    return dialect === 'postgresql' ? 'JSONB' : 'JSON'
  }
  return 'VARCHAR(255)'
}
